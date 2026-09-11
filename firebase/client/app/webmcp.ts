import type { Connection, CreditDetail, DocumentNotes, DocumentWorkspace, UploadResult } from "@/lib/types";
type Tool={name:string;description:string;inputSchema:object;annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};execute:(input:unknown)=>unknown};
declare global { interface Document { modelContext?: {registerTool:(tool:Tool,options:{signal:AbortSignal})=>void|Promise<void>} } }
export function registerCreditRead(read:()=>{connection:Connection;detail:CreditDetail|null;selected:string;tab:string}) {
  const context=document.modelContext;if(!context?.registerTool)return ()=>{};
  const lifecycle=new AbortController();
  try {void Promise.resolve(context.registerTool({name:"read_financing_view",description:"Ler somente as informações da proposta exibida nesta página. Não conecta contas nem solicita códigos.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new Error("Use um objeto vazio.");const state=read();return {connected:state.connection.state==="connected",section:state.tab,proposal:state.connection.proposals?.find(p=>p.id===state.selected)||null,detail:state.detail};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return ()=>lifecycle.abort();
}
export function registerDocumentRead(read:()=>{options:DocumentWorkspace|null;notes:DocumentNotes|null;result:UploadResult|null;groupId:string;typeId:string;description:string;selectedFile:{name:string;bytes:number}|null}){
  const context=document.modelContext;if(!context?.registerTool)return ()=>{};
  const lifecycle=new AbortController();
  try{void Promise.resolve(context.registerTool({name:"read_document_workspace",description:"Ler as classificações, registros e resultado do envio exibidos em Documentos. Não lê o conteúdo dos arquivos, envia documentos nem altera sua classificação.",inputSchema:{type:"object",properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute(input){if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length)throw new Error("Use um objeto vazio.");return read();}},{signal:lifecycle.signal})).catch(()=>{});}catch{}
  return ()=>lifecycle.abort();
}
