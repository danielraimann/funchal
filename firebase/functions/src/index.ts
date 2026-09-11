import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { onRequest } from "firebase-functions/v2/https";
import { defineSecret, defineString } from "firebase-functions/params";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { handlePortalRequest } from "./portal-api";

initializeApp();
const sessionKey = defineSecret("FUNCHAL_SESSION_KEY");
const ownerEmail = defineString("FUNCHAL_OWNER_EMAIL");
const appOrigin = defineString("FUNCHAL_APP_ORIGIN");

export const funchalApi = onRequest({
  region: "southamerica-east1", memory: "512MiB", timeoutSeconds: 300,
  minInstances: 0, maxInstances: 2, concurrency: 8,
  secrets: [sessionKey], invoker: "public", cors: false,
}, async (req, res) => {
  res.set({"Cache-Control":"private, no-store", "X-Content-Type-Options":"nosniff", "Referrer-Policy":"no-referrer"});
  try {
    // Public transport endpoint; every operation requires a verified, allowed Firebase identity.
    const header = req.get("authorization") || "";
    if (!/^Bearer [^\s]+$/.test(header)) { res.status(401).json({message:"Entre com sua conta Google para abrir seu acompanhamento."}); return; }
    let identity;
    try { identity = await getAuth().verifyIdToken(header.slice(7), true); }
    catch { res.status(401).json({message:"Seu acesso expirou. Entre novamente com sua conta Google."}); return; }
    if (!identity.email_verified || identity.email?.toLowerCase() !== ownerEmail.value().toLowerCase() || identity.firebase.sign_in_provider !== "google.com") {
      res.status(403).json({message:"Esta conta não tem acesso a este acompanhamento privado."}); return;
    }
    const origin = appOrigin.value();
    if (req.method !== "GET" && (req.get("origin") !== origin || req.get("x-funchal-request") !== "1")) {
      res.status(403).json({message:"Abra seu portal para continuar."}); return;
    }
    const rawBody = req.rawBody ?? Buffer.alloc(0);
    if (rawBody.length > 15*1024*1024+64*1024) { res.status(413).json({message:"Envie um arquivo de até 15 MB por vez."}); return; }
    process.env.PORTAL_SESSION_KEY = sessionKey.value();
    const headers = new Headers();
    for (const name of ["content-type", "content-length"]) { const value=req.get(name); if(value) headers.set(name,value); }
    const request = new Request(new URL(req.originalUrl, origin), {
      method:req.method, headers,
      ...(req.method==="GET"||req.method==="HEAD"?{}:{body:new Uint8Array(rawBody)}),
    });
    const result = await handlePortalRequest(request, identity.uid);
    res.status(result.status);
    result.headers.forEach((value, name) => res.set(name,value));
    if (result.body) await pipeline(Readable.fromWeb(result.body as never), res);
    else res.end();
  } catch {
    // Never log upstream bodies, login fields, tokens or document contents.
    if (!res.headersSent) res.status(503).json({message:"A conexão está temporariamente indisponível. Tente novamente."});
    else res.end();
  }
});
