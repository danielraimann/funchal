import test from "node:test";
import assert from "node:assert/strict";
import { loadSource } from "./harness.ts";

const origin = "https://portal.example.test";
const defaultIdentity = {
  uid: "allowed-uid", email: "owner@example.test", email_verified: true,
  firebase: { sign_in_provider: "password" },
};

function adapter(identity = defaultIdentity, behavior: { respond?: () => Response; onHeader?: (name: string) => void } = {}) {
  let handler: (req: any, res: any) => Promise<void>;
  const calls: { request: Request; uid: string }[] = [];
  const verified: { token: string; revoked: boolean }[] = [];
  loadSource("index.ts", {
    "firebase-admin/app": { initializeApp() {} },
    "firebase-admin/auth": { getAuth: () => ({ verifyIdToken: async (token: string, revoked: boolean) => {
      verified.push({ token, revoked });
      if (token !== "valid-test-token") throw new Error("invalid test token");
      return identity;
    } }) },
    "firebase-functions/v2/https": { onRequest: (_options: unknown, fn: typeof handler) => { handler = fn; return fn; } },
    "firebase-functions/params": {
      defineSecret: () => ({ value: () => "test-secret-unused-by-mocked-router" }),
      defineString: (name: string) => ({ value: () => name === "FUNCHAL_OWNER_EMAIL" ? "OWNER@example.test" : origin }),
    },
    "./portal-api": { handlePortalRequest: async (request: Request, uid: string) => {
      calls.push({ request, uid });
      return behavior.respond?.() || new Response(null, { status: 204 });
    } },
  });
  async function run(options: { method?: string; url?: string; headers?: Record<string, string | undefined>; rawBody?: Buffer } = {}) {
    const headers = new Map(Object.entries({ authorization: "Bearer valid-test-token", ...options.headers }));
    const req = { method: options.method || "GET", originalUrl: options.url || "/api/portal/session", rawBody: options.rawBody, get: (name: string) => headers.get(name.toLowerCase()) };
    const res = {
      statusCode: 200, headersSent: false, ended: false, sendCalls: 0, payload: undefined as unknown, headers: new Map<string, string>(),
      status(value: number) { this.statusCode = value; return this; },
      set(name: string | Record<string, string>, value?: string) {
        if (typeof name === "string") { behavior.onHeader?.(name.toLowerCase()); this.headers.set(name.toLowerCase(), value!); }
        else for (const [key, entry] of Object.entries(name)) { behavior.onHeader?.(key.toLowerCase()); this.headers.set(key.toLowerCase(), entry); }
        return this;
      },
      json(value: unknown) { this.set("Content-Type", "application/json"); this.payload = value; this.ended = true; this.headersSent = true; return this; },
      send(value: Buffer) { this.payload = value; this.sendCalls++; this.ended = true; this.headersSent = true; return this; },
      write() { throw new Error("The adapter must not stream partial response bytes"); },
      flushHeaders() { throw new Error("The adapter must buffer before sending headers"); },
      end() { this.ended = true; },
    };
    await handler!(req, res);
    return res;
  }
  return { run, calls, verified };
}

test("GET without rawBody reaches the router and preserves rewritten path/query", async () => {
  const app = adapter();
  const result = await app.run({ url: "/api/portal/document?proposalId=p%2B1&documentId=d" });
  assert.equal(result.statusCode, 204);
  assert.equal(result.ended, true);
  assert.equal(app.calls[0].request.url, `${origin}/api/portal/document?proposalId=p%2B1&documentId=d`);
  assert.equal(app.calls[0].request.body, null);
  assert.equal(app.calls[0].uid, "allowed-uid");
  assert.deepEqual(app.verified, [{ token: "valid-test-token", revoked: true }]);
  assert.equal(result.headers.get("cache-control"), "private, no-store");
});

test("missing, malformed and invalid tokens never reach the portal", async () => {
  for (const authorization of [undefined, "Basic test", "Bearer ", "Bearer bad token", "Bearer invalid"]) {
    const app = adapter();
    assert.equal((await app.run({ headers: { authorization } })).statusCode, 401);
    assert.equal(app.calls.length, 0);
  }
});

test("identity must be the verified owner authenticated through email and password", async () => {
  for (const identity of [
    { ...defaultIdentity, email: "other@example.test" },
    { ...defaultIdentity, email_verified: false },
    { ...defaultIdentity, firebase: { sign_in_provider: "google.com" } },
  ]) {
    const app = adapter(identity);
    assert.equal((await app.run()).statusCode, 403);
    assert.equal(app.calls.length, 0);
  }
});

test("multipart POST requires the exact app origin and request header", async () => {
  for (const headers of [{}, { origin }, { origin: "https://other.example.test", "x-funchal-request": "1" }]) {
    const app = adapter();
    assert.equal((await app.run({ method: "POST", url: "/api/portal/upload", headers, rawBody: Buffer.from("multipart") })).statusCode, 403);
    assert.equal(app.calls.length, 0);
  }
});

test("multipart raw bytes and boundary survive the HTTP adapter unchanged", async () => {
  const app = adapter();
  const rawBody = Buffer.from("--test-boundary\r\nContent-Disposition: form-data; name=\"file\"; filename=\"document.pdf\"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\0\xff\r\n--test-boundary--\r\n", "latin1");
  const contentType = "multipart/form-data; boundary=test-boundary";
  const result = await app.run({ method: "POST", url: "/api/portal/upload", rawBody,
    headers: { origin, "x-funchal-request": "1", "content-type": contentType, "content-length": String(rawBody.length) } });
  assert.equal(result.statusCode, 204);
  assert.equal(app.calls[0].request.headers.get("content-type"), contentType);
  assert.deepEqual(Buffer.from(await app.calls[0].request.arrayBuffer()), rawBody);
  assert.equal(app.calls[0].request.headers.get("authorization"), null);
});

test("HTTP adapter rejects bodies larger than 15 MiB plus multipart overhead", async () => {
  const app = adapter();
  const result = await app.run({ method: "POST", url: "/api/portal/upload",
    headers: { origin, "x-funchal-request": "1" }, rawBody: Buffer.alloc(15 * 1024 * 1024 + 64 * 1024 + 1) });
  assert.equal(result.statusCode, 413);
  assert.equal(app.calls.length, 0);
});

test("a 12 MiB document is sent once as complete binary with exact length", async () => {
  const expected = Buffer.alloc(12 * 1024 * 1024, 0xa5);
  let offset = 0, complete = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === expected.length) { complete = true; controller.close(); return; }
      const end = Math.min(offset + 4 * 1024 * 1024, expected.length);
      controller.enqueue(expected.subarray(offset, end)); offset = end;
    },
  }), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"document.pdf\"" } });
  const app = adapter(defaultIdentity, {
    respond: () => response,
    onHeader(name) { if (name === "content-disposition") assert.equal(complete, true, "attachment headers must wait for the complete body"); },
  });
  const result = await app.run({ url: "/api/portal/document?proposalId=p&documentId=d" });
  assert.equal(result.statusCode, 200);
  assert.equal(result.sendCalls, 1);
  assert(Buffer.isBuffer(result.payload));
  assert(result.payload.equals(expected));
  assert.equal(result.headers.get("content-length"), String(expected.length));
  assert.equal(result.headers.get("content-type"), "application/pdf");
  assert.equal(result.headers.get("content-disposition"), "attachment; filename=\"document.pdf\"");
});

test("documents above 30 MiB are cancelled and return JSON without attachment headers", async () => {
  let cancelled = false, chunksRead = 0;
  const chunk = new Uint8Array(1024 * 1024);
  const response = new Response(new ReadableStream<Uint8Array>({
    pull(controller) { chunksRead++; controller.enqueue(chunk); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 }), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=\"large.pdf\"",
  } });
  const app = adapter(defaultIdentity, { respond: () => response });
  const result = await app.run({ url: "/api/portal/document?proposalId=p&documentId=d" });
  assert.equal(result.statusCode, 413);
  assert.equal(cancelled, true);
  assert.equal(chunksRead, 31);
  assert.equal(result.sendCalls, 0);
  assert.equal(result.headers.has("content-disposition"), false);
  assert.equal(result.headers.get("content-type"), "application/json");
  assert.match((result.payload as { message: string }).message, /30 MB/);
});
