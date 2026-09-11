import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, PortalError } from "./harness.ts";

const limit = 15 * 1024 * 1024 + 64 * 1024;
function api() {
  const uploads: any[] = [], locks: { owner: string; mode: string }[] = [];
  const { handlePortalRequest } = loadSource<typeof import("../src/portal-api.ts")>("portal-api.ts", {
    "./lib/portal-core": { PortalError },
    "./lib/checklist-profile": {},
    "./lib/session-store": {
      readSession: async () => null, clearSession: async () => {},
      lockedSession: async (owner: string, mode: string, work: (state: unknown, active: () => Promise<void>) => Promise<unknown>) => {
        locks.push({ owner, mode }); return work({}, async () => {});
      },
    },
    "./lib/credit-data": {}, "./lib/portal-login": {},
    "./lib/document-service": { MAX_FILE_BYTES: 15 * 1024 * 1024,
      uploadDocument: async (_state: unknown, input: unknown) => { uploads.push(input); return { state: "confirmed" }; } },
    "./lib/upload-receipts": { uploadReceipts: () => ({}) },
  });
  return { handle: (request: Request) => handlePortalRequest(request, "authenticated-uid"), uploads, locks };
}
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ proposalId: "opaque-proposal+id", groupId: "30", typeId: "11", description: "Documento teste" })) data.set(key, value);
  data.set("file", new File(["%PDF-1.7\n"], "document.pdf", { type: "application/pdf" }));
  return data;
}
const upload = (body: FormData) => new Request("https://portal.example.test/api/portal/upload", { method: "POST", body });

test("valid multipart is parsed into the authenticated owner's write lease", async () => {
  const app = api(), result = await app.handle(upload(form()));
  assert.equal(result.status, 200);
  assert.deepEqual(app.locks, [{ owner: "authenticated-uid", mode: "write" }]);
  assert.equal(app.uploads[0].proposalId, "opaque-proposal+id");
  assert.equal(app.uploads[0].file.name, "document.pdf");
  assert.equal(await app.uploads[0].file.text(), "%PDF-1.7\n");
});

test("missing file, duplicate fields and injected owner are rejected before a lease", async () => {
  for (const alter of [
    (data: FormData) => data.delete("file"),
    (data: FormData) => data.append("proposalId", "different-proposal"),
    (data: FormData) => data.append("owner", "different-owner"),
  ]) {
    const app = api(), data = form(); alter(data);
    assert.equal((await app.handle(upload(data))).status, 400);
    assert.equal(app.locks.length, 0);
    assert.equal(app.uploads.length, 0);
  }
});

test("multipart cap checks both advertised and actual bytes", async () => {
  for (const [body, length] of [[new Uint8Array(0), String(limit + 1)], [new Uint8Array(limit + 1), undefined]] as const) {
    const app = api();
    const headers: Record<string, string> = { "content-type": "multipart/form-data; boundary=test" };
    if (length) headers["content-length"] = length;
    const result = await app.handle(new Request("https://portal.example.test/api/portal/upload", { method: "POST", headers, body }));
    assert.equal(result.status, 413);
    assert.equal(app.locks.length, 0);
  }
});

test("JSON has an independent 4 KiB cap even without content-length", async () => {
  const app = api();
  const result = await app.handle(new Request("https://portal.example.test/api/portal/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ username: "x".repeat(4096) }),
  }));
  assert.equal(result.status, 413);
  assert.equal(app.locks.length, 0);
});

test("unsupported methods, paths and upload media types cannot dispatch portal work", async () => {
  const app = api();
  assert.equal((await app.handle(new Request("https://portal.example.test/api/portal/session", { method: "DELETE" }))).status, 405);
  assert.equal((await app.handle(new Request("https://portal.example.test/unexpected"))).status, 404);
  assert.equal((await app.handle(new Request("https://portal.example.test/api/portal/upload", { method: "POST", body: "file" }))).status, 415);
  assert.equal(app.locks.length, 0);
});
