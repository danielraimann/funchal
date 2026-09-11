import { createHash, randomUUID } from "node:crypto";
import { getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { PortalError } from "./portal-core";
import type { UploadReceipts } from "./document-service";

type Receipt = {
  owner: string;
  fingerprint: string;
  status: "pending" | "confirmed" | "uncertain";
  created: number;
  claim_id: string;
};

function database() {
  return getFirestore(getApp(), process.env.FUNCHAL_DATABASE_ID || "funchal");
}

// Server-only receipts deliberately outlive sessions. No file, filename or description is stored.
export function uploadReceipts(owner: string): UploadReceipts {
  if (!owner || typeof owner !== "string") throw new PortalError("Entre novamente para continuar.", 401);
  const claims = new Map<string, string>();
  const refFor = (fingerprint: string) => {
    if (!fingerprint || typeof fingerprint !== "string") throw new PortalError("O registro de envio é inválido.", 400);
    const id = createHash("sha256").update(JSON.stringify([owner, fingerprint])).digest("hex");
    return database().collection("funchal_uploads").doc(id);
  };
  const validateOwner = (row: Receipt, fingerprint: string) => {
    if (row.owner !== owner || row.fingerprint !== fingerprint) throw new PortalError("O registro de envio não está disponível.", 409);
  };
  return {
    async claim(fingerprint) {
      const ref = refFor(fingerprint), claimId = randomUUID();
      const result = await database().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (snapshot.exists) {
          const row = snapshot.data() as Receipt;
          validateOwner(row, fingerprint);
          return row.status === "confirmed" ? "confirmed" as const : "uncertain" as const;
        }
        tx.create(ref, { owner, fingerprint, status: "pending", created: Date.now(), claim_id: claimId } satisfies Receipt);
        return "new" as const;
      });
      if (result === "new") claims.set(fingerprint, claimId);
      return result;
    },
    async complete(fingerprint, status) {
      const ref = refFor(fingerprint), claimId = claims.get(fingerprint);
      if (status !== "confirmed" && status !== "uncertain") throw new PortalError("O registro de envio é inválido.", 400);
      await database().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) throw new PortalError("O registro de envio mudou. Confira os anexos antes de continuar.", 409);
        const row = snapshot.data() as Receipt;
        validateOwner(row, fingerprint);
        if (row.status === "confirmed") return;
        if (!claimId || row.claim_id !== claimId) throw new PortalError("O registro de envio mudou. Confira os anexos antes de continuar.", 409);
        tx.update(ref, { status });
      });
    },
    async cancelBeforeDispatch(fingerprint) {
      const ref = refFor(fingerprint), claimId = claims.get(fingerprint);
      if (!claimId) return;
      await database().runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        if (!snapshot.exists) return;
        const row = snapshot.data() as Receipt;
        validateOwner(row, fingerprint);
        if (row.status === "pending" && row.claim_id === claimId) tx.delete(ref);
      });
      claims.delete(fingerprint);
    },
  };
}
