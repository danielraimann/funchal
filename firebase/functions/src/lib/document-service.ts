import type { PortalSession } from "./session-store";
import type { DocumentChecklist, DocumentChecklistRow, DocumentChoice, DocumentNotes, DocumentWorkspace, UploadResult } from "./types";
import { docKey, documents, selectedProposal } from "./credit-data.ts";
import { portalJson, portalValue, PortalError, textValue, upstream } from "./portal-core.ts";

export const MAX_FILE_BYTES=15*1024*1024;
type Row=Record<string,unknown>;
export type UploadReceipts={claim:(fingerprint:string)=>Promise<"new"|"confirmed"|"uncertain">;complete:(fingerprint:string,status:"confirmed"|"uncertain")=>Promise<void>;cancelBeforeDispatch:(fingerprint:string)=>Promise<void>};
const normalize=(s:string)=>s.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
// Prefix observed in the authenticated document list, added by the upstream portal.
const descriptionValue=(s:unknown)=>normalize(textValue(s).replace(/^Documento Agrupado Atraves do Portal:\s*/i,""));
const choices=(rows:Row[]):DocumentChoice[]=>rows.map(row=>({id:String(row.Valor??""),label:textValue(row.Texto)})).filter(row=>row.id&&row.id!=="0"&&row.id!=="-1"&&row.label);
function permitted(state:PortalSession){return state.fields?.span_VisualizaUpload==="1"&&state.fields?.span_ControleUploadIncluir==="1";}
async function catalog(state:PortalSession,row:Row,groupId=""){
  const shared={ProdutoID:state.fields!.span_ProdutoID,PessoaID:state.fields!.span_PessoaID,TipoOperacaoCreditoImobiliarioID:row.TipoOperacaoCreditoImobiliarioID};
  if(!shared.TipoOperacaoCreditoImobiliarioID)throw new PortalError("A Funchal não informou a operação necessária para classificar arquivos.");
  const groups=choices(await portalJson(state.cookies,"/ws/CarregarCombo.ashx",{Tipo:"tblTipoDocumentoOperacaoGrupo",...shared}));
  if(groupId&&!groups.some(g=>g.id===groupId))throw new PortalError("Este grupo não está disponível para a proposta.",400);
  const types=groupId?choices(await portalJson(state.cookies,"/ws/CarregarCombo.ashx",{Tipo:"tblTipoDocumentoOperacao",...shared,TipoDocumentoOperacaoGrupoID:groupId})):[];
  return {groups,types};
}
export async function documentWorkspace(state:PortalSession,id:string,groupId=""):Promise<DocumentWorkspace>{
  const row=await selectedProposal(state,id),uploadAllowed=permitted(state);
  const lists=uploadAllowed?await catalog(state,row,groupId):{groups:[],types:[]};
  return {uploadAllowed,...lists,groupId,maxFileBytes:MAX_FILE_BYTES,checklist:{state:"unavailable",explanation:"A Funchal não disponibilizou um checklist de exigências nesta integração. Ainda não é possível confirmar quais documentos faltam. As categorias de envio não indicam, por si só, documentos obrigatórios."}};
}

const checklistUnavailable=(explanation:string):DocumentChecklist=>({
  state:"unavailable",groups:[],groupId:"",rows:[],explanation,
});
function portalBoolean(value:unknown):boolean|null {
  if(value===true||value===1||value==="1"||value==="true")return true;
  if(value===false||value===0||value==="0"||value==="false")return false;
  return null;
}
function checklistText(value:unknown):string {
  // Keep instruction boundaries while returning text, never upstream HTML.
  return textValue(typeof value==="string"?value.replace(/<br\s*\/?\s*>|<\/(?:p|div|li|tr|h[1-6])\s*>/gi,"\n"):value);
}
function checklistIdentifier(value:unknown):string {
  return typeof value==="string"?value.trim():typeof value==="number"&&Number.isFinite(value)?String(value):"";
}
function checklistKitIds(row:Row):string[]|null {
  // Mirrors ResgatarKits in the authenticated AnexarDocumentacaoProcesso.js.
  // A missing flag is not evidence that either phase's kit is applicable.
  const hasFirstPhaseBatch=portalBoolean(row.PossuiLote1Fase);
  if(hasFirstPhaseBatch===null)return null;
  if(!hasFirstPhaseBatch)return ["1"];
  if(String(row.TipoOperacaoCreditoImobiliarioID)==="2")return ["30","31","8","32"];
  const groups=["30","29","31","8"];
  if(portalBoolean(row.PossuiAnuente)===true)groups.push("19");
  return groups;
}
function kitInstruction(groupId:string):string {
  if(["30","2","3","8"].includes(groupId))return "Caso haja cônjuge ou mais de um Comprador envolvido no processo, por gentileza subir todos os documentos em um único arquivo.";
  if(["29","4","5"].includes(groupId))return "Caso haja cônjuge ou mais de um Vendedor envolvido no processo, por gentileza subir todos os documentos em um único arquivo.";
  return "";
}

export async function documentChecklist(state:PortalSession,proposalId:string,groupId=""):Promise<DocumentChecklist>{
  const proposal=await selectedProposal(state,proposalId);
  if(!permitted(state))return checklistUnavailable("A Funchal não habilitou os kits de documentação para este acesso.");
  const canceledStates=[
    "Processo Cancelado Fase Analise de Documentos","Processo Cancelado Fase Emissão de Contrato",
    "Processo Cancelado na Fase Avaliação Imóvel","Processo Cancelado na Prospecção",
    "Processo Cancelado na Vistoria","Processo Cancelado no Crédito","Processo Cancelado",
  ];
  if(normalize(textValue(proposal.DescricaoMacroFase))==="cancelado"||canceledStates.some(value=>normalize(value)===normalize(textValue(proposal.DescricaoSituacao)))){
    return checklistUnavailable("A Funchal não disponibiliza os kits de envio para esta proposta cancelada.");
  }
  if(String(proposal.PessoaID)!=="318")return checklistUnavailable("A Funchal não disponibilizou kits compatíveis com esta proposta.");
  const kitIds=checklistKitIds(proposal);
  if(!kitIds)return checklistUnavailable("A Funchal não informou a existência do lote da primeira fase. Não é possível determinar quais kits se aplicam à proposta.");

  // Both the known page's kit rules and the account-specific catalog must allow
  // the requested group. Client-supplied IDs never determine proposal scope.
  const {groups:catalogGroups}=await catalog(state,proposal);
  const groups=kitIds.flatMap(id=>catalogGroups.filter(group=>group.id===id));
  if(groupId&&!groups.some(group=>group.id===groupId))throw new PortalError("Este kit de documentos não está disponível para a proposta.",400);
  if(!groups.length)return checklistUnavailable("O catálogo da Funchal não retornou kits compatíveis com a fase desta proposta.");
  const selectedGroupId=groupId||groups[0].id;
  const officialRows=await portalJson(state.cookies,"/ws/FinanciamentoDocumentoOperacaoJson.ashx",{
    FinanciamentoID:proposal.FinanciamentoID,
    TipoOperacaoImovelID:proposal.TipoOperacaoCreditoImobiliarioID,
    TipoDocumentoOperacaoGrupoID:selectedGroupId,
  });
  const additionalInstruction=kitInstruction(selectedGroupId);
  const rows:DocumentChecklistRow[]=officialRows.map(row=>{
    const rowGroupId=checklistIdentifier(row.TipoDocumentoOperacaoGrupoID);
    const typeId=checklistIdentifier(row.TipoDocumentoOperacaoID);
    const baseTypeId=checklistIdentifier(row.TblTipoDocumento);
    const title=checklistText(row.DescricaoTipoDocumentoOperacao);
    if(!rowGroupId||!typeId||!baseTypeId||!title)throw new PortalError("A Funchal retornou uma categoria de documentos sem os identificadores necessários.");
    const count=checklistIdentifier(row.QtdeDocumentoTipoOperacao);
    const attachedCount=/^\d+$/.test(count)&&Number.isSafeInteger(Number(count))?Number(count):null;
    // A first-phase kit may aggregate rows with different official group IDs.
    // Preserve those IDs; the selected, authorized query supplied the scope.
    // FinanciamentoAnaliseGarantiaImovelID remains only in this upstream row.
    return {
      groupId:rowGroupId,typeId,baseTypeId,title,
      instructions:[checklistText(row.Instrucao),additionalInstruction].filter(Boolean).join("\n\n"),
      complement:checklistText(row.DescricaoComplementar),attachedCount,
      status:attachedCount===null?null:attachedCount===0?"sem anexo":"anexado",
    };
  });
  return {
    state:"available",groups,groupId:selectedGroupId,rows,
    explanation:"Categorias e instruções retornadas pela Funchal para este kit. ‘Sem anexo’ indica somente que nenhum arquivo foi retornado nessa classificação; a exigência depende das instruções e das condições do processo. ‘Anexado’ não significa aprovado pelo banco.",
  };
}
export async function documentNotes(state:PortalSession,id:string):Promise<DocumentNotes>{
  const row=await selectedProposal(state,id),fields=state.fields!,entries:DocumentNotes["entries"]=[];let incomplete=false;
  if(fields.span_VisualizaHistoricos==="1"){
    const history=await portalJson(state.cookies,"/ws/FinanciamentoHistoricoJson.ashx",{FinanciamentoID:row.FinanciamentoID,TipoBusca:"1"});
    for(const h of history)entries.push({date:`${textValue(h.DataDoHistorico)} ${textValue(h.HoraDoHistorico)}`.trim(),text:textValue(h.Historico),source:"Histórico da proposta"});
  }
  if(fields.span_VisualizaOcorrencias==="1"&&fields.span_VisualizaFases==="1"){
    const phases=await portalJson(state.cookies,"/ws/WorkflowFasesJson.ashx",{SituacaoID:row.SituacaoID});
    const stage=Number(phases[0]?.NumeroFase);
    if(Number.isInteger(stage)&&stage>=1&&stage<=7){
      // The portal exposes macro-phase IDs 1–6 for phases already started.
      for(let phase=1;phase<=Math.min(stage,6);phase++){
        try{const notes=await portalJson(state.cookies,"/ws/WorkFlowFasesHistoricoJson.ashx",{FinanciamentoID:row.FinanciamentoID,WorkFlowMacroFaseID:String(phase)});
        for(const note of notes)entries.push({date:textValue(note.DataHora),text:textValue(note.Descricao),source:`Registro da etapa ${phase}`});}catch(error){if(error instanceof PortalError&&error.status===502){incomplete=true;continue;}throw error;}
      }
    }
  }
  return {available:fields.span_VisualizaHistoricos==="1"||fields.span_VisualizaOcorrencias==="1",entries:entries.filter(e=>e.text),incomplete,explanation:incomplete?"Não foi possível ler todos os registros da Funchal. A lista pode estar incompleta e não confirma quais exigências continuam abertas.":"Estes são registros da Funchal. Um pedido antigo pode já ter sido atendido; o portal não informa aqui se a exigência continua aberta."};
}
export function validateFileMetadata(file:File){
  if(!file.name||file.name.length>180||/[\x00-\x1f\x7f/\\]/.test(file.name))throw new PortalError("Use um nome de arquivo de até 180 caracteres, sem barras.",400);
  if(file.size<=0||file.size>MAX_FILE_BYTES)throw new PortalError("Escolha um arquivo não vazio de até 15 MB, limite deste portal.",413);
  const ext=file.name.split(".").pop()?.toLowerCase()||"";
  const formats:Record<string,string[]>={pdf:["application/pdf"],jpg:["image/jpeg"],jpeg:["image/jpeg"],png:["image/png"],webp:["image/webp"],gif:["image/gif"],bmp:["image/bmp","image/x-ms-bmp"],tif:["image/tiff"],tiff:["image/tiff"],heic:["image/heic","image/heif"],heif:["image/heif","image/heic"],xls:["application/vnd.ms-excel"]};
  if(!formats[ext]||(file.type&&!formats[ext].includes(file.type.toLowerCase())))throw new PortalError("Use PDF, imagem (JPG, PNG, HEIC, WebP, GIF, BMP ou TIFF) ou planilha XLS.",415);
  return {ext,mime:formats[ext][0]};
}
export async function validateFile(file:File){
  const {ext,mime}=validateFileMetadata(file),bytes=new Uint8Array(await file.arrayBuffer());
  const start=Array.from(bytes.slice(0,16)),ascii=new TextDecoder("latin1").decode(bytes.slice(0,32));
  const starts=(values:number[])=>values.every((v,i)=>start[i]===v);
  const valid=ext==="pdf"?ascii.startsWith("%PDF-"):["jpg","jpeg"].includes(ext)?starts([255,216,255]):ext==="png"?starts([137,80,78,71,13,10,26,10]):ext==="gif"?/^GIF8[79]a/.test(ascii):ext==="webp"?ascii.startsWith("RIFF")&&ascii.slice(8,12)==="WEBP":ext==="bmp"?ascii.startsWith("BM"):["tif","tiff"].includes(ext)?starts([73,73,42,0])||starts([77,77,0,42]):["heic","heif"].includes(ext)?ascii.slice(4,8)==="ftyp"&&/heic|heix|hevc|hevx|mif1|msf1/.test(ascii.slice(8)):starts([208,207,17,224,161,177,26,225]);
  if(!valid)throw new PortalError("O conteúdo do arquivo não corresponde ao formato informado. Exporte-o novamente.",415);
  return {bytes,mime};
}
const hash=async(bytes:Uint8Array)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes as Uint8Array<ArrayBuffer>)),b=>b.toString(16).padStart(2,"0")).join("");
export async function uploadDocument(state:PortalSession,input:{proposalId:string;groupId:string;typeId:string;description:string;file:File},receipts:UploadReceipts,assertActive:()=>Promise<void>):Promise<UploadResult>{
  const {file,proposalId,groupId,typeId}=input,description=input.description.trim();
  if(!description||description.length>250||/[^\x20-\x7e\xa0-\xff]/.test(description))throw new PortalError("Preencha a descrição com até 250 caracteres, sem emojis ou quebras de linha.",400);
  const {bytes,mime}=await validateFile(file);
  const row=await selectedProposal(state,proposalId);
  if(!permitted(state))throw new PortalError("A Funchal não habilitou o envio de documentos para este acesso.",403);
  const {types}=await catalog(state,row,groupId),type=types.find(t=>t.id===typeId);
  if(!groupId||!type)throw new PortalError("Escolha uma classificação válida para esta proposta.",400);
  // The public client forwards an empty value when no guarantee ID is present.
  // Never substitute the proposal number for this different identifier.
  const guarantee=row.FinanciamentoAnaliseGarantiaImovelID??"";
  const before=await documents(state,row);
  // This handler can replace documents; do not overwrite an existing category without a verified replacement contract.
  if(before.some(d=>normalize(textValue(d.DescricaoTipoDocumento))===normalize(type.label)))throw new PortalError("Já existe um anexo nesta classificação. A substituição ainda não está disponível nesta integração; nenhum arquivo foi enviado.",409);
  const validation=await portalValue(state.cookies,"/ws/FinanciamentoDocumentoOperacaoJson.ashx?q=validate",{FinanciamentoID:row.FinanciamentoID,TipoDocumentoOperacaoID:typeId,NomeDocumento:file.name});
  if(!validation||typeof validation!=="object"||Array.isArray(validation)||!['0','1'].includes(String((validation as Row).status)))throw new PortalError("A Funchal não confirmou a verificação de duplicidade. Nenhum arquivo foi enviado.");
  if(String((validation as Row).status)==="1")throw new PortalError("A Funchal já identifica este arquivo nessa classificação. Confira os anexos antes de continuar.",409);
  const fingerprint=await hash(new TextEncoder().encode(JSON.stringify([proposalId,typeId,await hash(bytes)])));
  const data=new FormData();data.append(file.name,new File([bytes as Uint8Array<ArrayBuffer>],file.name,{type:mime}));
  const metadata={FinanciamentoID:String(row.FinanciamentoID),tpGrupoID:groupId,tpDocOpeID:typeId,descricaoDocumento:description,tblOrigemDocumentoAnexo:"2",FinanciamentoAnaliseGarantiaImovelID:String(guarantee)};
  if(Object.values(metadata).some(v=>/[^\x20-\x7e\xa0-\xff]/.test(v)||v.length>300))throw new PortalError("A Funchal retornou identificadores incompatíveis com o envio.");
  const beforeKeys=new Set(await Promise.all(before.map(docKey)));
  await assertActive();
  const claim=await receipts.claim(fingerprint);
  if(claim==="confirmed")return {state:"confirmed",message:"Este arquivo já teve um envio confirmado. Consulte a lista atualizada."};
  const uncertain:UploadResult={state:"uncertain",message:"Não foi possível confirmar a anexação. Confira a lista e os registros da Funchal. Para evitar duplicidade ou substituição, este arquivo não será reenviado automaticamente."};
  if(claim!=="new")return uncertain;
  try{await assertActive();}catch(error){await receipts.cancelBeforeDispatch(fingerprint);throw error;}
  try {
    const {response}=await upstream(state.cookies,"/ws/FinanciamentoDocumentoOperacaoGravarSubstituir.ashx",data,undefined,false,metadata);
    const raw=await response.text();
    // An HTML login/error or an explicit error can never count as acceptance.
    if(/<\s*(?:html|form|!doctype)/i.test(raw))throw new Error("unexpected_response");
    if(raw.trim().startsWith("{")){let result;try{result=JSON.parse(raw);}catch{throw new Error("invalid_response");}if(result.error||result.sessionExpired)throw new Error("rejected_response");}
    const after=await documents(state,row);
    let confirmed=false;
    for(const doc of after)if(!beforeKeys.has(await docKey(doc))&&normalize(textValue(doc.DescricaoTipoDocumento))===normalize(type.label)&&descriptionValue(doc.DescricaoDoDocumento)===normalize(description)){confirmed=true;break;}
    if(!confirmed)throw new Error("not_confirmed");
    await receipts.complete(fingerprint,"confirmed");
    return {state:"confirmed",message:"Anexação confirmada na lista da Funchal. A aprovação do documento depende da análise do banco."};
  }catch {
    await receipts.complete(fingerprint,"uncertain");
    return uncertain;
  }
}
