import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { deferred, fakeFirestore, hasStatus, loadSource, PortalError } from "./harness.ts";

function storage() {
  const firestore = fakeFirestore(), databaseNames: string[] = [];
  let now = 1_800_000_000_000;
  class Clock extends Date { static now() { return now; } }
  const env: Record<string, string> = { PORTAL_SESSION_KEY: randomBytes(32).toString("base64") };
  const imports = {
    "firebase-admin/app": { getApp: () => "test-admin-app" },
    "firebase-admin/firestore": { getFirestore: (app: string, name: string) => {
      assert.equal(app, "test-admin-app"); databaseNames.push(name); return firestore.db;
    } },
    "./portal-core": { PortalError },
  };
  const globals = { process: { env }, Date: Clock };
  const sessions = loadSource<typeof import("../src/lib/session-store.ts")>("lib/session-store.ts", imports, globals);
  const receipts = loadSource<typeof import("../src/lib/upload-receipts.ts")>("lib/upload-receipts.ts", imports, globals);
  const row = (owner: string) => [...firestore.rows.entries()].find(([path, value]) => path.startsWith("funchal_sessions/") && value.owner === owner)?.[1];
  return { ...firestore, sessions, receipts, databaseNames, env, row, now: () => now, advance: (ms: number) => { now += ms; } };
}

test("sessions are lazy, encrypted, isolated by uid, and expire", async () => {
  const store = storage();
  assert.equal(store.databaseNames.length, 0);
  assert.equal(await store.sessions.readSession("owner/a"), null);
  await store.sessions.lockedSession("owner/a", "login", async state => {
    state.state = "code";
    state.cookies = [{ name: "session", value: "private-cookie-marker", path: "/", expires: null, secure: true, domain: "portal.example.test", hostOnly: true }];
    Object.assign(state, { password: "discard-password-marker", otp: "discard-otp-marker" });
  });
  const state = await store.sessions.readSession("owner/a");
  assert.equal(state!.cookies[0].value, "private-cookie-marker");
  assert.equal("password" in state!, false); assert.equal("otp" in state!, false);
  assert.equal(await store.sessions.readSession("owner/b"), null);
  assert(!JSON.stringify([...store.rows.values()]).includes("private-cookie-marker"));
  assert(store.databaseNames.every(name => name === "funchal"));
  store.advance(10 * 60 * 1000 + 1);
  assert.equal(await store.sessions.readSession("owner/a"), null);
});

test("AAD rejects a ciphertext copied between owners", async () => {
  const store = storage();
  for (const owner of ["a", "b"]) await store.sessions.lockedSession(owner, "login", async state => { state.state = "code"; });
  store.row("b")!.encrypted = store.row("a")!.encrypted;
  store.row("b")!.generation = store.row("a")!.generation;
  store.row("b")!.expires = store.row("a")!.expires;
  await assert.rejects(store.sessions.readSession("b"), hasStatus(428));
});

test("OTP failure retains rotated fields; cooldown and five-attempt limit survive disconnect", async () => {
  const store = storage();
  await store.sessions.lockedSession("a", "login", async state => { state.state = "code"; });
  for (let attempt = 1; attempt <= 5; attempt++) {
    await assert.rejects(store.sessions.lockedSession("a", "verify", async state => {
      state.hidden = { viewstate: `rotated-${attempt}` }; throw new PortalError("invalid code", 400);
    }), hasStatus(400));
    assert.equal((await store.sessions.readSession("a"))!.hidden!.viewstate, `rotated-${attempt}`);
  }
  await assert.rejects(store.sessions.lockedSession("a", "verify", async () => {}), hasStatus(429));
  await store.sessions.clearSession("a");
  await assert.rejects(store.sessions.lockedSession("a", "verify", async () => {}), hasStatus(429));
  await assert.rejects(store.sessions.lockedSession("a", "login", async () => {}), hasStatus(429));
  store.advance(60_000);
  await store.sessions.lockedSession("a", "login", async state => { state.state = "code"; });
  await store.sessions.lockedSession("a", "verify", async state => { state.state = "connected"; });
  assert.equal((await store.sessions.readSession("a"))!.state, "connected");
});

test("Firestore callback retry never replays portal work; read/write leases enforce exclusion", async () => {
  const store = storage();
  let workCount = 0;
  store.retryNextTransaction();
  await store.sessions.lockedSession("a", "login", async () => { workCount++; });
  assert.equal(workCount, 1);
  for (const [mode, duration] of [["read", 150_000], ["write", 300_000]] as const) {
    await store.sessions.lockedSession("a", mode, async (_state, active) => {
      assert.equal(store.row("a")!.busy_until - store.now(), duration);
      await active();
      await assert.rejects(store.sessions.lockedSession("a", "read", async () => {}), hasStatus(409));
    });
  }
});

test("a disconnected worker cannot send or delete the replacement session", async () => {
  const store = storage(), entered = deferred(), release = deferred();
  const previous = store.sessions.lockedSession("a", "write", async (_state, active) => {
    entered.resolve(); await release.promise; await active();
  }).then(() => undefined, error => error);
  await entered.promise;
  await store.sessions.clearSession("a");
  await store.sessions.lockedSession("a", "login", async state => { state.state = "code"; state.message = "replacement"; });
  release.resolve();
  assert.equal((await previous).status, 428);
  assert.equal((await store.sessions.readSession("a"))!.message, "replacement");
});

test("expired worker cannot overwrite a newer lease and cancels an undeliverable response", async () => {
  const store = storage(), entered = deferred(), release = deferred();
  let cancelled = false;
  const previous = store.sessions.lockedSession("a", "read", async state => {
    entered.resolve(); await release.promise; state.message = "stale";
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  }).then(() => undefined, error => error);
  await entered.promise;
  store.advance(150_001);
  await store.sessions.lockedSession("a", "read", async state => { state.message = "newer"; });
  release.resolve();
  assert.equal((await previous).status, 409);
  assert.equal(cancelled, true);
  assert.equal((await store.sessions.readSession("a"))!.message, "newer");
});

test("upload claims are atomic, owner-isolated, and survive session reset", async () => {
  const store = storage(), first = store.receipts.uploadReceipts("a"), second = store.receipts.uploadReceipts("a");
  const results = await Promise.all([first.claim("fingerprint"), second.claim("fingerprint")]);
  assert.deepEqual(results, ["new", "uncertain"]);
  assert.equal(await store.receipts.uploadReceipts("b").claim("fingerprint"), "new");
  await assert.rejects(second.complete("fingerprint", "confirmed"), hasStatus(409));
  await second.cancelBeforeDispatch("fingerprint");
  assert.equal(await second.claim("fingerprint"), "uncertain");
  await first.complete("fingerprint", "confirmed");
  await first.complete("fingerprint", "uncertain");
  await store.sessions.lockedSession("a", "login", async () => {});
  await store.sessions.clearSession("a");
  assert.equal(await second.claim("fingerprint"), "confirmed");
});

test("only the original pending claim can be cancelled before dispatch", async () => {
  const store = storage(), first = store.receipts.uploadReceipts("a"), second = store.receipts.uploadReceipts("a");
  assert.equal(await first.claim("fingerprint"), "new");
  await first.cancelBeforeDispatch("fingerprint");
  assert.equal(await second.claim("fingerprint"), "new");
  await first.cancelBeforeDispatch("fingerprint");
  assert.equal(await first.claim("fingerprint"), "uncertain");
  await second.complete("fingerprint", "uncertain");
  await second.cancelBeforeDispatch("fingerprint");
  assert.equal(await first.claim("fingerprint"), "uncertain");
});
