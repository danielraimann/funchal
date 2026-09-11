import { createHash } from "node:crypto";
import { getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { DocumentChecklist } from "./types";
import { PortalError } from "./portal-core";

export type Answer = "yes" | "no" | "unknown";
export const profileId = (owner:string, proposal:string) => createHash("sha256").update(JSON.stringify([owner,proposal])).digest("hex");
export function questionKey(row:DocumentChecklist["rows"][number]) {
  // An upstream change invalidates the previous answer, including a change in conditions.
  return createHash("sha256").update(JSON.stringify([row.groupId,row.typeId,row.baseTypeId,row.title,row.instructions,row.complement])).digest("hex");
}
export function personalizeChecklist(checklist:DocumentChecklist, answers:Record<string,Answer>):DocumentChecklist {
  const questions=checklist.rows.map(row=>({key:questionKey(row),title:row.title,instructions:row.instructions,complement:row.complement,answer:answers[questionKey(row)]||"unknown" as Answer}));
  return {...checklist,rows:checklist.rows.filter(row=>answers[questionKey(row)]==="yes"),questions,
    explanation:"Documentos pertinentes conforme as respostas desta proposta. Sem anexo indica uma categoria aplicável sem arquivo registrado; anexado não significa aprovado pelo banco. Condições não respondidas não entram na contagem de pendências."};
}
export async function processChecklist(owner:string, proposalId:string, checklist:DocumentChecklist, input?:unknown):Promise<DocumentChecklist> {
  if(checklist.state!=="available")return checklist;
  const ref=getFirestore(getApp(),process.env.FUNCHAL_DATABASE_ID||"funchal").collection("funchal_checklist_profiles").doc(profileId(owner,proposalId));
  if(input!==undefined){
    if(!input||typeof input!=="object"||Array.isArray(input))throw new PortalError("Resposta inválida.",400);
    const {key,answer}=input as Record<string,unknown>;
    if(typeof key!=="string"||!checklist.rows.some(row=>questionKey(row)===key)||!["yes","no","unknown"].includes(String(answer)))throw new PortalError("Atualize o questionário antes de responder.",400);
    // Save one field, without overwriting answers from another kit or device.
    await ref.set({answers:{[key]:answer},updatedAt:Date.now()},{merge:true});
  }
  const snapshot=await ref.get();
  return personalizeChecklist(checklist,snapshot.data()?.answers||{});
}
