import { portalToken } from "./firebase-auth";
async function authorizedFetch(action:string,body?:unknown){
  const multipart=body instanceof FormData;
  return fetch(`/api/portal/${action}`,{method:body===undefined?"GET":"POST",headers:{Authorization:`Bearer ${await portalToken()}`,...(body===undefined?{}:{...(multipart?{}:{"Content-Type":"application/json"}),"X-Funchal-Request":"1"})},body:body===undefined?undefined:multipart?body:JSON.stringify(body),cache:"no-store",credentials:"omit"});
}
async function responseError(response:Response){let message="Não foi possível consultar o portal.";try{message=(await response.json()).message||message;}catch{}return Object.assign(new Error(message),{status:response.status});}
export async function portalApi<T>(action:string,body?:unknown):Promise<T>{
  const response=await authorizedFetch(action,body);
  if(!response.ok)throw await responseError(response);
  try{return await response.json();}catch{throw new Error("Não foi possível ler a resposta. Atualize os documentos para conferir o resultado.");}
}
export async function downloadPortalDocument(proposalId:string,documentId:string,name:string){
  const response=await authorizedFetch(`document?proposalId=${encodeURIComponent(proposalId)}&documentId=${encodeURIComponent(documentId)}`);
  if(!response.ok)throw await responseError(response);
  const blob=await response.blob(),url=URL.createObjectURL(blob),link=document.createElement("a");
  const disposition=response.headers.get("content-disposition")||"";
  const encoded=/filename\*=UTF-8''([^;]+)/i.exec(disposition)?.[1],quoted=/filename="([^"]+)"/i.exec(disposition)?.[1];
  let filename=quoted||name||"documento";if(encoded)try{filename=decodeURIComponent(encoded);}catch{}
  link.href=url;link.download=filename.replace(/[\x00-\x1f/\\]/g,"_").slice(0,200);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
