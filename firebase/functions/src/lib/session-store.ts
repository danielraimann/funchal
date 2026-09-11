import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PortalError, type Cookie } from "./portal-core";

export type PortalSession = {
  state: "disconnected" | "code" | "connected";
  cookies: Cookie[];
  hidden?: Record<string, string>;
  fields?: Record<string, string>;
  form?: { action: string; usernameName: string; usernameValue: string; codeName: string; buttonName: string; buttonValue: string };
  message?: string;
  created: number;
  expires: number;
};

type SessionRow = {
  owner: string;
  generation: string;
  encrypted: string;
  expires: number;
  busy_until: number;
  lease_id: string;
  next_login: number;
  attempts: number;
};
type Lock = { row: SessionRow; state: PortalSession };

// These collections are server-only. Firebase client rules must deny all access.
// Initialization belongs to the entry point; importing this module does not access Firestore.
function database() {
  return getFirestore(getApp(), process.env.FUNCHAL_DATABASE_ID || "funchal");
}

function sessionRef(owner: string) {
  if (!owner || typeof owner !== "string") throw new PortalError("Entre novamente para continuar.", 401);
  const id = createHash("sha256").update(owner).digest("hex");
  return database().collection("funchal_sessions").doc(id);
}

function encryptionKey(): Buffer {
  const encoded = process.env.PORTAL_SESSION_KEY;
  if (!encoded || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    throw new PortalError("A conexão está sendo preparada. Tente novamente em alguns minutos.", 503);
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new PortalError("A conexão está sendo preparada. Tente novamente em alguns minutos.", 503);
  return key;
}

function emptySession(now: number): PortalSession {
  return { state: "disconnected", cookies: [], created: now, expires: now + 10 * 60 * 1000 };
}

function seal(owner: string, generation: string, state: PortalSession): string {
  if (!Number.isFinite(state.expires)) throw new PortalError("A conexão não pôde ser registrada.", 503);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  cipher.setAAD(Buffer.from(`${owner}:${generation}:${state.expires}`));
  // Persist only the session contract; password and OTP are never fields in it.
  const payload: PortalSession = {
    state: state.state, cookies: state.cookies, hidden: state.hidden, fields: state.fields,
    form: state.form, message: state.message, created: state.created, expires: state.expires,
  };
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final(), cipher.getAuthTag()]);
  return `${iv.toString("base64")}.${encrypted.toString("base64")}`;
}

function unseal(row: SessionRow, owner: string): PortalSession {
  const key = encryptionKey();
  try {
    if (row.owner !== owner) throw new Error("owner_mismatch");
    const parts = row.encrypted.split(".");
    if (parts.length !== 2) throw new Error("invalid_envelope");
    const iv = Buffer.from(parts[0], "base64"), encrypted = Buffer.from(parts[1], "base64");
    if (iv.length !== 12 || encrypted.length < 16) throw new Error("invalid_envelope");
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(Buffer.from(`${owner}:${row.generation}:${row.expires}`));
    decipher.setAuthTag(encrypted.subarray(encrypted.length - 16));
    const state = JSON.parse(Buffer.concat([decipher.update(encrypted.subarray(0, -16)), decipher.final()]).toString("utf8")) as PortalSession;
    if (state.expires !== row.expires || !Number.isFinite(state.created) || !Array.isArray(state.cookies)
      || !["disconnected", "code", "connected"].includes(state.state)) throw new Error("invalid_state");
    return state;
  } catch {
    throw new PortalError("A conexão anterior não está mais disponível. Conecte novamente.", 428);
  }
}

function sameLease(current: SessionRow | undefined, lock: SessionRow): boolean {
  return !!current && current.owner === lock.owner && current.generation === lock.generation
    && current.lease_id === lock.lease_id && current.busy_until === lock.busy_until;
}

export async function clearSession(owner: string): Promise<void> {
  const ref = sessionRef(owner);
  await database().runTransaction(async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists) return;
    const row = snapshot.data() as SessionRow;
    if (row.owner !== owner) throw new PortalError("A conexão não está disponível.", 428);
    const state = emptySession(Date.now()), generation = randomUUID();
    tx.set(ref, {
      owner, generation, encrypted: seal(owner, generation, state), expires: state.expires,
      busy_until: 0, lease_id: "", next_login: row.next_login || 0, attempts: row.attempts || 0,
    } satisfies SessionRow);
  });
}

export async function readSession(owner: string): Promise<PortalSession | null> {
  const snapshot = await sessionRef(owner).get();
  if (!snapshot.exists) return null;
  const row = snapshot.data() as SessionRow;
  if (row.owner !== owner) throw new PortalError("A conexão não está disponível.", 428);
  if (row.expires <= Date.now()) return null;
  return unseal(row, owner);
}

export async function lockedSession<T>(
  owner: string,
  mode: "login" | "verify" | "read" | "write",
  work: (state: PortalSession, assertActive: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const ref = sessionRef(owner);
  const lock: Lock = await database().runTransaction(async tx => {
    const snapshot = await tx.get(ref), now = Date.now();
    let row = snapshot.exists ? snapshot.data() as SessionRow : undefined;
    if (row && row.owner !== owner) throw new PortalError("A conexão não está disponível.", 428);
    if (row && row.busy_until > now) throw new PortalError("Uma consulta está em andamento. Aguarde um instante.", 409);
    if (row && row.expires <= now) row = undefined;
    if (mode === "login" && row && row.next_login > now) throw new PortalError("Aguarde um minuto antes de solicitar outro código.", 429);
    if (mode === "verify" && row && row.attempts >= 5) throw new PortalError("Limite de tentativas atingido. Volte e solicite outro código.", 429);
    // A fresh login intentionally replaces old state, including an unreadable old envelope.
    const state = !row || mode === "login" ? emptySession(now) : unseal(row, owner);
    // Rotating generation on every acquisition fences out expired/stale workers.
    const generation = randomUUID();
    const locked: SessionRow = {
      owner, generation, encrypted: seal(owner, generation, state), expires: state.expires,
      busy_until: now + (mode === "write" ? 300000 : 150000), lease_id: randomUUID(),
      next_login: mode === "login" ? now + 60000 : row?.next_login || 0,
      attempts: mode === "login" ? 0 : (row?.attempts || 0) + (mode === "verify" ? 1 : 0),
    };
    tx.set(ref, locked);
    return { row: locked, state };
  });

  const assertActive = async (): Promise<void> => {
    const current = (await ref.get()).data() as SessionRow | undefined, now = Date.now();
    if (!sameLease(current, lock.row) || current!.expires <= now || current!.busy_until <= now) {
      throw new PortalError("A conexão mudou. Conecte novamente antes de enviar.", 428);
    }
  };
  const save = async (): Promise<boolean> => {
    const encrypted = seal(owner, lock.row.generation, lock.state);
    return database().runTransaction(async tx => {
      const current = (await tx.get(ref)).data() as SessionRow | undefined;
      if (!sameLease(current, lock.row) || current!.busy_until <= Date.now()) return false;
      tx.update(ref, { encrypted, expires: lock.state.expires, busy_until: 0, lease_id: "" });
      return true;
    });
  };
  let result: T | undefined;
  try {
    // No portal calls execute inside Firestore transaction callbacks (which may retry).
    result = await work(lock.state, assertActive);
    if (!await save()) throw new PortalError("A conexão mudou durante a consulta. Atualize a página.", 409);
    return result;
  } catch (error) {
    if (result instanceof Response) await result.body?.cancel().catch(() => undefined);
    try {
      if (error instanceof PortalError && error.status === 428) {
        await database().runTransaction(async tx => {
          const current = (await tx.get(ref)).data() as SessionRow | undefined;
          if (sameLease(current, lock.row)) tx.delete(ref);
        });
      } else {
        // Invalid OTP responses may rotate cookies and hidden fields; retain that state.
        await save();
      }
    } catch {
      // Preserve the original error. A failed cleanup is bounded by the lease expiry.
    }
    throw error;
  }
}
