import test from "node:test";
import assert from "node:assert/strict";
import { loadSource, PortalError } from "./harness.ts";
const api=loadSource<typeof import("../src/lib/checklist-profile.ts")>("lib/checklist-profile.ts",{
  "firebase-admin/app":{},"firebase-admin/firestore":{},"./portal-core":{PortalError},
});
const row={groupId:"30",typeId:"11",baseTypeId:"1",title:"Ata de Assembleia",instructions:"Necessário para Comprador Pessoa Jurídica que seja Sociedade Anônima.",complement:"",attachedCount:1,status:"anexado" as const};
const checklist={state:"available" as const,groups:[],groupId:"30",rows:[row],explanation:""};
test("unknown applicability never becomes a pending or applicable document",()=>{
  const result=api.personalizeChecklist(checklist,{});
  assert.equal(result.rows.length,0);assert.equal(result.questions?.[0].answer,"unknown");
});
test("non-applicable categories are hidden even if upstream has an attachment",()=>{
  const result=api.personalizeChecklist(checklist,{[api.questionKey(row)]:"no"});
  assert.equal(result.rows.length,0);assert.equal(result.questions?.[0].answer,"no");
});
test("editing applicability restores the category and preserves upstream attachment status",()=>{
  const result=api.personalizeChecklist(checklist,{[api.questionKey(row)]:"yes"});
  assert.equal(result.rows.length,1);assert.equal(result.rows[0].status,"anexado");
});
test("changed upstream conditions invalidate old answers",()=>{
  const changed={...row,instructions:"Somente para processos de Término de Construção."};
  const result=api.personalizeChecklist({...checklist,rows:[changed]},{[api.questionKey(row)]:"yes"});
  assert.equal(result.rows.length,0);assert.equal(result.questions?.[0].answer,"unknown");
});
test("profile keys isolate both owner and proposal",()=>{
  assert.notEqual(api.profileId("a","1"),api.profileId("b","1"));
  assert.notEqual(api.profileId("a","1"),api.profileId("a","2"));
});
