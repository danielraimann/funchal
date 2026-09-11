import type { CreditDetail, Proposal } from "./types";
import type { PortalSession } from "./session-store";
import { inputValue, portalJson, PortalError, textValue, upstream } from "./portal-core.ts";
type Row=Record<string,unknown>;
export async function loadAccount(state:PortalSession){
  if(state.state!=="connected"||state.expires<=Date.now())throw new PortalError("Conecte sua conta para consultar a proposta.",428);
  const {response,url}=await upstream(state.cookies,"/Default.aspx");
  const html=await response.text();
  if(url.pathname.toLowerCase().includes("login")||!html.includes("MainContent_PortalUsuarioID"))throw new PortalError("Sua sessão no portal expirou. Conecte novamente.",428);
  const names=["MainContent_PortalUsuarioID","span_ProdutoID","span_PessoaID","span_PortalUsuarioNivelAcessoID","span_VisualizaFases","span_VisualizaHistoricos","span_ControleUploadBaixar","span_VisualizaUpload","span_ControleUploadIncluir","span_PermiteClassificarOrigemDocumento","span_VisualizaOcorrencias"];
  state.fields=Object.fromEntries(names.map(name=>[name,inputValue(html,name)]));
  if(state.fields.span_PortalUsuarioNivelAcessoID!=="0")throw new PortalError("Este acompanhamento está preparado para o acesso de cliente do portal.",403);
  const rows=await portalJson(state.cookies,"/ws/FinanciamentoJson.ashx",{PortalUsuarioID:state.fields.MainContent_PortalUsuarioID,ProdutoID:state.fields.span_ProdutoID,PessoaID:state.fields.span_PessoaID});
  return rows.filter(r=>typeof r.FinanciamentoID==="string"&&r.FinanciamentoID);
}
export function proposalView(r:Row):Proposal {const amount=Number(r.ValorDoFinanciamento);return {id:String(r.FinanciamentoID),number:textValue(r.NumeroProposta),name:textValue(r.Nome),date:textValue(r.DataDeCadastroPreCadastro),operation:textValue(r.DescricaoTipoOperacaoImovel),months:textValue(r.Prazo),amount:r.ValorDoFinanciamento!==null&&r.ValorDoFinanciamento!==undefined&&Number.isFinite(amount)?amount:null,contract:textValue(r.Contrato)};}
export async function selectedProposal(state:PortalSession,id:string){const rows=await loadAccount(state);const row=rows.find(r=>String(r.FinanciamentoID)===id);if(!row)throw new PortalError("Esta proposta não está disponível para sua conta.",404);return row;}
export async function documents(state:PortalSession,row:Row){if(state.fields!.span_VisualizaUpload!=="1")return [];return portalJson(state.cookies,"/ws/FinanciamentoDocumentoJson.ashx",{PessoaID:row.PessoaID,FinanciamentoID:row.FinanciamentoID,PortalUsuarioNivelAcessoID:state.fields!.span_PortalUsuarioNivelAcessoID});}
// An opaque document key ties selection to its remote identifiers, never array position.
export async function docKey(row:Row){const data=new TextEncoder().encode(JSON.stringify([row.CaminhoCriptografado,row.FinanciamentoIDCriptografado,row.DescricaoTipoDocumento,row.DescricaoDoDocumento,row.DataDoDocumento]));return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",data)),b=>b.toString(16).padStart(2,"0")).join("");}
export async function detailView(state:PortalSession,id:string):Promise<CreditDetail>{
  const row=await selectedProposal(state,id),fields=state.fields!;
  // Sequential requests preserve ASP.NET session cookie rotation.
  const phases=fields.span_VisualizaFases==="1"?await portalJson(state.cookies,"/ws/WorkflowFasesJson.ashx",{SituacaoID:row.SituacaoID}):[];
  const docs=await documents(state,row);
  const historyAllowed=fields.span_VisualizaHistoricos==="1";
  const history=historyAllowed?await portalJson(state.cookies,"/ws/FinanciamentoHistoricoJson.ashx",{FinanciamentoID:row.FinanciamentoID,TipoBusca:"1"}):[];
  const stage=Number(phases[0]?.NumeroFase);
  return {stage:Number.isInteger(stage)&&stage>=1&&stage<=7?stage:null,status:textValue(phases[0]?.WorkflowFasesDescricao),documents:await Promise.all(docs.map(async d=>({id:await docKey(d),date:textValue(d.DataDoDocumento),type:textValue(d.DescricaoTipoDocumento),description:textValue(d.DescricaoDoDocumento).replace(/^Documento Agrupado Atraves do Portal:\s*/i,""),downloadable:fields.span_ControleUploadBaixar==="1"&&!!d.CaminhoCriptografado&&!!d.FinanciamentoIDCriptografado}))),historyAllowed,history:history.map(h=>({date:`${textValue(h.DataDoHistorico)} ${textValue(h.HoraDoHistorico)}`.trim(),text:textValue(h.Historico),author:textValue(h.Consultor)})),updatedAt:new Date().toISOString()};
}
export async function downloadDocument(state:PortalSession,id:string,documentId:string){
  const row=await selectedProposal(state,id);
  if(state.fields!.span_ControleUploadBaixar!=="1")throw new PortalError("O portal não permite baixar documentos com este acesso.",403);
  const docs=await documents(state,row);let doc:Row|undefined;
  for(const candidate of docs)if(await docKey(candidate)===documentId){doc=candidate;break;}
  if(!doc||!doc.CaminhoCriptografado||!doc.FinanciamentoIDCriptografado)throw new PortalError("Este documento não está disponível para sua conta.",404);
  const body=new URLSearchParams({P:encodeURI(String(doc.CaminhoCriptografado)),X:String(doc.FinanciamentoIDCriptografado)});
  const {response,url}=await upstream(state.cookies,"/FileCliente.aspx",body.toString(),"application/x-www-form-urlencoded",true);
  const mime=response.headers.get("content-type")||"application/octet-stream";
  if(url.pathname!=="/FileCliente.aspx"||mime.includes("text/html")||mime.includes("application/json")){await response.body?.cancel();throw new PortalError("O portal não entregou o arquivo. Atualize e tente novamente.",428);}
  const disposition=response.headers.get("content-disposition");
  const safeDisposition=disposition&&/^attachment;/i.test(disposition)&&!/[\r\n]/.test(disposition)?disposition:"attachment; filename=\"documento\"";
  return new Response(response.body,{headers:{"Content-Type":mime,"Content-Disposition":safeDisposition,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
}
