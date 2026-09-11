import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { transformSync } from "esbuild";

const requireBuiltin = createRequire(import.meta.url);

// Execute production source with explicit dependencies. No Firebase initialization,
// credentials, sockets or portal requests are available to these unit tests.
export function loadSource<T>(relative: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}): T {
  const filename = new URL(`../src/${relative}`, import.meta.url);
  const code = transformSync(readFileSync(filename, "utf8"), {
    loader: "ts", format: "cjs", target: "node22", sourcefile: filename.pathname,
  }).code;
  const module = { exports: {} };
  runInNewContext(code, {
    module, exports: module.exports,
    require: (name: string) => {
      if (Object.hasOwn(imports, name)) return imports[name];
      if (["node:crypto", "node:stream", "node:stream/promises"].includes(name)) return requireBuiltin(name);
      throw new Error(`Unmocked dependency: ${name}`);
    },
    Buffer, Headers, Request, Response, URL, URLSearchParams, FormData, Blob, File,
    TextEncoder, TextDecoder, Uint8Array, ReadableStream, AbortController, AbortSignal,
    console, process: { env: {} },
    fetch: () => { throw new Error("Network access is forbidden in unit tests"); },
    ...globals,
  }, { filename: filename.pathname });
  return module.exports as T;
}

export class PortalError extends Error {
  status: number;
  constructor(message: string, status = 502) { super(message); this.status = status; }
}

export const hasStatus = (status: number) => (error: unknown) => error instanceof PortalError && error.status === status;

export function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

type Row = Record<string, any>;
type Ref = { path: string; get: () => Promise<{ exists: boolean; data: () => Row | undefined }> };

// Serializes transactions and commits their writes atomically. It deliberately
// models only the document operations used here, not Firestore IAM or RPC behavior.
export function fakeFirestore() {
  const rows = new Map<string, Row>();
  let queue = Promise.resolve();
  let retryNext = false;
  const snapshot = (ref: Ref) => {
    const value = structuredClone(rows.get(ref.path));
    return { exists: value !== undefined, data: () => structuredClone(value) };
  };
  const db = {
    collection(name: string) {
      return { doc(id: string): Ref {
        const ref: Ref = { path: `${name}/${id}`, get: async () => snapshot(ref) };
        return ref;
      } };
    },
    runTransaction<T>(work: (tx: any) => Promise<T>): Promise<T> {
      const execute = async () => {
        const attempt = async () => {
          const writes: (() => void)[] = [];
          const tx = {
            get: async (ref: Ref) => { assert.equal(writes.length, 0, "Firestore requires reads before writes"); return snapshot(ref); },
            set: (ref: Ref, value: Row) => writes.push(() => rows.set(ref.path, structuredClone(value))),
            create: (ref: Ref, value: Row) => writes.push(() => { assert(!rows.has(ref.path)); rows.set(ref.path, structuredClone(value)); }),
            update: (ref: Ref, value: Row) => writes.push(() => { assert(rows.has(ref.path)); rows.set(ref.path, { ...rows.get(ref.path), ...structuredClone(value) }); }),
            delete: (ref: Ref) => writes.push(() => rows.delete(ref.path)),
          };
          return { result: await work(tx), writes };
        };
        if (retryNext) { retryNext = false; await attempt(); }
        const { result, writes } = await attempt();
        writes.forEach(apply => apply());
        return result;
      };
      const result = queue.then(execute);
      queue = result.then(() => undefined, () => undefined);
      return result;
    },
  };
  return { db, rows, retryNextTransaction: () => { retryNext = true; } };
}
