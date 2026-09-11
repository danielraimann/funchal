
import { PortalError } from "./lib/portal-core";
import { clearSession, lockedSession, readSession } from "./lib/session-store";
import { detailView, downloadDocument, loadAccount, proposalView } from "./lib/credit-data";
import { login, verify } from "./lib/portal-login";
import { documentChecklist, documentNotes, documentWorkspace, MAX_FILE_BYTES, uploadDocument } from "./lib/document-service";
import { uploadReceipts } from "./lib/upload-receipts";
const safeHeaders={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:safeHeaders});
function fail(e:unknown){if(e instanceof PortalError)return json({message:e.message},e.status);console.error("portal_request_failed");return json({message:"A conexão está temporariamente indisponível. Tente novamente."},503);}
function field(value:unknown,max=512){if(typeof value!=="string"||!value||value.length>max)throw new PortalError("Preencha os campos para continuar.",400);return value;}
async function boundedBody(request:Request){if(Number(request.headers.get("content-length"))>4096)throw new PortalError("Solicitação inválida.",413);const reader=request.body?.getReader();if(!reader)throw new PortalError("Solicitação inválida.",400);let size=0;const decoder=new TextDecoder();let raw="";try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>4096){await reader.cancel();throw new PortalError("Solicitação inválida.",413);}raw+=decoder.decode(chunk.value,{stream:true});}return raw+decoder.decode();}finally{reader.releaseLock();}}
async function boundedUpload(request:Request){
  const contentType=request.headers.get("content-type")||"",limit=MAX_FILE_BYTES+64*1024;
  if(!/^multipart\/form-data;\s*boundary=/i.test(contentType))throw new PortalError("Selecione um arquivo para anexar.",415);
  if(Number(request.headers.get("content-length"))>limit)throw new PortalError("Envie um arquivo de até 15 MB por vez.",413);
  const reader=request.body?.getReader();if(!reader)throw new PortalError("Nenhum arquivo recebido.",400);
  const chunks:Uint8Array<ArrayBuffer>[]=[];let size=0;
  try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>limit){await reader.cancel();throw new PortalError("Envie um arquivo de até 15 MB por vez.",413);}chunks.push(next.value);}}finally{reader.releaseLock();}
  let form:FormData;try{form=await new Response(new Blob(chunks),{headers:{"Content-Type":contentType}}).formData();}catch{throw new PortalError("O arquivo não pôde ser lido. Selecione-o novamente.",400);}
  const allowed=new Set(["proposalId","groupId","typeId","description","file"]);
  for(const key of form.keys())if(!allowed.has(key)||form.getAll(key).length!==1)throw new PortalError("Dados de envio inválidos.",400);
  const file=form.get("file");if(!(file instanceof File))throw new PortalError("Selecione um arquivo para anexar.",400);
  return {proposalId:field(form.get("proposalId"),100),groupId:field(form.get("groupId"),100),typeId:field(form.get("typeId"),100),description:field(form.get("description"),250),file};
}
async function GET(request:Request,owner:string,action:string){try{
  if(action==="session"){const state=await readSession(owner);if(!state)return json({state:"disconnected"});if(state.state!=="connected")return json({state:state.state,message:state.message});return json(await lockedSession(owner,"read",async session=>({state:"connected",proposals:(await loadAccount(session)).map(proposalView)})));}
  if(action==="document"){const url=new URL(request.url);return await lockedSession(owner,"read",session=>downloadDocument(session,field(url.searchParams.get("proposalId")),field(url.searchParams.get("documentId"),64)));}
  return json({message:"Endereço não encontrado."},404);
}catch(e){return fail(e);}}
async function POST(request:Request,owner:string,action:string){try{
  if(action==="upload"){const upload=await boundedUpload(request);return json(await lockedSession(owner,"write",(session,assertActive)=>uploadDocument(session,upload,uploadReceipts(owner),assertActive)));}
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new PortalError("Solicitação inválida.",415);
  const raw=await boundedBody(request);let body;try{body=JSON.parse(raw);}catch{throw new PortalError("Solicitação inválida.",400);}if(!body||Array.isArray(body)||typeof body!=="object")throw new PortalError("Solicitação inválida.",400);
  if(action==="login")return json(await lockedSession(owner,"login",session=>login(session,field(body.username,150),field(body.password,200))));
  if(action==="verify"){const code=field(body.code,6);if(!/^\d{6}$/.test(code))throw new PortalError("Digite os seis números do código.",400);return json(await lockedSession(owner,"verify",session=>verify(session,code)));}
  if(action==="detail")return json(await lockedSession(owner,"read",session=>detailView(session,field(body.proposalId))));
  if(action==="document-options")return json(await lockedSession(owner,"read",session=>documentWorkspace(session,field(body.proposalId),body.groupId?field(body.groupId,100):"")));
  if(action==="document-checklist")return json(await lockedSession(owner,"read",session=>documentChecklist(session,field(body.proposalId),body.groupId?field(body.groupId,100):"")));
  if(action==="document-notes")return json(await lockedSession(owner,"write",session=>documentNotes(session,field(body.proposalId))));
  if(action==="disconnect"){await clearSession(owner);return json({state:"disconnected"});}
  return json({message:"Endereço não encontrado."},404);
}catch(e){return fail(e);}}

export async function handlePortalRequest(request:Request,owner:string){const path=new URL(request.url).pathname;const match=/^\/api\/portal\/([a-z-]+)$/.exec(path);if(!match)return json({message:"Endereço não encontrado."},404);return request.method==="GET"?GET(request,owner,match[1]):request.method==="POST"?POST(request,owner,match[1]):json({message:"Método não permitido."},405);}
