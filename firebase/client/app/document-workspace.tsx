"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ClipboardList, Download, FileText, Info, LoaderCircle, Search, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CreditDetail, CreditDocument, DocumentChecklist, DocumentChoice, DocumentNotes, DocumentWorkspace as Workspace, UploadResult } from "@/lib/types";
import { downloadPortalDocument, portalApi } from "./portal-api";
import { registerDocumentRead } from "./webmcp";

type Props={proposalId:string;proposalNumber:string;detail:CreditDetail|null;busy:boolean;setBusy:(value:boolean)=>void;onDetail:(value:CreditDetail)=>void;onError:(error:unknown)=>void};
export default function DocumentWorkspace({proposalId,proposalNumber,detail,busy,setBusy,onDetail,onError}:Props){
  const [options,setOptions]=useState<Workspace|null>(null),[loading,setLoading]=useState(false),[localError,setLocalError]=useState("");
  const [groupId,setGroupId]=useState(""),[typeId,setTypeId]=useState(""),[description,setDescription]=useState(""),[file,setFile]=useState<File|null>(null);
  const [search,setSearch]=useState(""),[review,setReview]=useState(false),[result,setResult]=useState<UploadResult|null>(null),[sending,setSending]=useState(false),[notes,setNotes]=useState<DocumentNotes|null>(null);
  const [checklist,setChecklist]=useState<DocumentChecklist|null>(null),[checklistLoading,setChecklistLoading]=useState(false),[checklistError,setChecklistError]=useState("");
  const [readingNotes,setReadingNotes]=useState(false),[downloadingId,setDownloadingId]=useState("");
  const alive=useRef(true),fileInput=useRef<HTMLInputElement>(null),requestSequence=useRef(0),attempted=useRef(false),portalOperation=useRef(false);
  const view=useRef({options,notes,checklist,result,groupId,typeId,description,selectedFile:file?{name:file.name,bytes:file.size}:null});
  useEffect(()=>{view.current={options,notes,checklist,result,groupId,typeId,description,selectedFile:file?{name:file.name,bytes:file.size}:null};},[options,notes,checklist,result,groupId,typeId,description,file]);
  useEffect(()=>registerDocumentRead(()=>view.current),[]);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function beginPortalOperation(){
    // The ref also blocks a second interaction before React updates `busy`.
    if(busy||portalOperation.current)return false;
    portalOperation.current=true;setBusy(true);return true;
  }
  function finishPortalOperation(){portalOperation.current=false;setBusy(false);}
  async function loadOptions(group=""){
    if(!beginPortalOperation())return;
    const sequence=++requestSequence.current;setLoading(true);setLocalError("");setOptions(current=>current?{...current,groupId:group,types:[]}:null);
    try{const data=await portalApi<Workspace>("document-options",{proposalId,groupId:group});if(alive.current&&sequence===requestSequence.current)setOptions(data);}catch(error){if(alive.current&&sequence===requestSequence.current){setLocalError((error as Error).message);onError(error);}}finally{if(alive.current&&sequence===requestSequence.current)setLoading(false);finishPortalOperation();}
  }
  // Wait until the parent's proposal request releases the ASP.NET session lock.
  useEffect(()=>{if(detail&&!busy&&!options&&!loading&&!localError)void loadOptions();},[detail,busy,options,loading,localError]);
  function chooseFile(next:File|null){setResult(null);setLocalError("");attempted.current=false;if(next&&next.size>15*1024*1024){setLocalError("Escolha um arquivo de até 15 MB.");if(fileInput.current)fileInput.current.value="";setFile(null);return;}setFile(next);if(next&&!description)setDescription(next.name.replace(/\.[^.]+$/,"").slice(0,250));}
  async function loadChecklist(group=""){
    if(!beginPortalOperation())return;
    setChecklistLoading(true);setChecklistError("");
    try{const data=await portalApi<DocumentChecklist>("document-checklist",{proposalId,groupId:group});if(alive.current)setChecklist(data);}
    catch(error){if(alive.current){setChecklistError((error as Error).message);onError(error);}}
    finally{if(alive.current)setChecklistLoading(false);finishPortalOperation();}
  }
  async function refreshDocuments(){
    if(!beginPortalOperation())return;
    setLocalError("");
    try{
      const latest=await portalApi<CreditDetail>("detail",{proposalId});if(alive.current)onDetail(latest);
      if(alive.current&&checklist?.state==="available"){
        setChecklistLoading(true);setChecklistError("");
        try{const latestChecklist=await portalApi<DocumentChecklist>("document-checklist",{proposalId,groupId:checklist.groupId});if(alive.current)setChecklist(latestChecklist);}
        catch(error){if(alive.current){setChecklistError((error as Error).message);onError(error);}}
      }
    }catch(error){if(alive.current){setLocalError((error as Error).message);onError(error);}}
    finally{if(alive.current)setChecklistLoading(false);finishPortalOperation();}
  }
  async function readNotes(){
    if(!beginPortalOperation())return;
    setReadingNotes(true);setLocalError("");
    try{const data=await portalApi<DocumentNotes>("document-notes",{proposalId});if(alive.current)setNotes(data);}
    catch(error){if(alive.current){setLocalError((error as Error).message);onError(error);}}
    finally{if(alive.current)setReadingNotes(false);finishPortalOperation();}
  }
  async function downloadDocument(doc:CreditDocument){
    if(!beginPortalOperation())return;
    setDownloadingId(doc.id);setLocalError("");
    try{await downloadPortalDocument(proposalId,doc.id,doc.description||doc.type);}
    catch(error){if(alive.current){setLocalError((error as Error).message);onError(error);}}
    finally{if(alive.current)setDownloadingId("");finishPortalOperation();}
  }
  async function send(){
    if(!file||!groupId||!typeId||!description.trim()||sending||attempted.current||!beginPortalOperation())return;
    const data=new FormData();data.set("proposalId",proposalId);data.set("groupId",groupId);data.set("typeId",typeId);data.set("description",description.trim());data.set("file",file);
    attempted.current=true;setSending(true);setLocalError("");
    try{const response=await portalApi<UploadResult>("upload",data);setResult(response);if(response.state==="confirmed"){setFile(null);setDescription("");if(fileInput.current)fileInput.current.value="";}}
    catch(error){const status=(error as Error&{status?:number}).status;if(status&&[400,403,409,413,415,422,428,429].includes(status)){attempted.current=false;setLocalError((error as Error).message);onError(error);}else setResult({state:"uncertain",message:"A conexão foi interrompida e o recebimento não pôde ser confirmado. Atualize a lista antes de continuar; este envio não será repetido automaticamente."});}
    finally{setReview(false);}
    // Reads only: never retry an upload after a network error.
    try{
      if(alive.current){const latest=await portalApi<CreditDetail>("detail",{proposalId});if(alive.current)onDetail(latest);}
      if(alive.current&&checklist?.state==="available"){
        setChecklistLoading(true);setChecklistError("");
        try{const latestChecklist=await portalApi<DocumentChecklist>("document-checklist",{proposalId,groupId:checklist.groupId});if(alive.current)setChecklist(latestChecklist);}
        catch(error){if(alive.current)setChecklistError((error as Error).message);}
      }
    }catch{/* The visible result and the refresh control remain available. */}
    finally{if(alive.current){setSending(false);setChecklistLoading(false);}finishPortalOperation();}
  }
  const docs=(detail?.documents||[]).filter(doc=>`${doc.type} ${doc.description}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  const typeLabel=options?.types.find(item=>item.id===typeId)?.label||"",groupLabel=options?.groups.find(item=>item.id===groupId)?.label||"";
  const existingType=!!typeLabel&&!!detail?.documents.some(doc=>doc.type.trim().toLocaleLowerCase("pt-BR")===typeLabel.trim().toLocaleLowerCase("pt-BR"));
  const ready=!!file&&!!typeId&&!!groupId&&options?.groupId===groupId&&options.types.some(item=>item.id===typeId)&&!!description.trim()&&!busy&&!loading&&!attempted.current&&!existingType;
  const checklistCounts={missing:checklist?.rows.filter(row=>row.status==="sem anexo").length||0,attached:checklist?.rows.filter(row=>row.status==="anexado").length||0,unknown:checklist?.rows.filter(row=>row.status===null).length||0};
  return <div className="document-workspace">
    <section className="panel requirement-panel" aria-labelledby="requirements-title" aria-busy={checklistLoading}>
      <div className="requirement-icon"><ClipboardList size={24}/></div>
      <div className="requirement-body">
        <p className="eyebrow">CHECKLIST DA FUNCHAL</p>
        <h2 id="requirements-title">Confira a documentação do processo</h2>
        <p>Consulte os kits e veja quais categorias ainda estão sem anexo. As instruções da Funchal indicam quando cada documento se aplica.</p>
        <div className="requirement-actions">
          <Button variant="outline" className="checklist-load-button" disabled={busy||loading} onClick={()=>loadChecklist(checklist?.groupId||"")}>{checklistLoading?<LoaderCircle size={18} className="spin"/>:<ClipboardList size={18}/>}<span>{checklist?"Atualizar checklist":"Consultar documentos necessários"}</span></Button>
          <Button variant="outline" disabled={busy||loading} onClick={readNotes}>{readingNotes?<LoaderCircle size={17} className="spin"/>:<Search size={17}/>}Consultar registros da Funchal</Button>
        </div>
        {checklistLoading&&<div className="checklist-loading" role="status"><LoaderCircle size={18} className="spin"/>Consultando o kit na Funchal…</div>}
        {checklistError&&<div className="document-feedback error" role="alert"><Info size={19}/><div><p>{checklistError}</p>{checklist&&<p>Os dados abaixo são da última consulta concluída.</p>}</div></div>}
        {checklist&&<div className="checklist-results">
          <p className="checklist-explanation">{checklist.explanation}</p>
          {checklist.state==="available"&&<>
            <div className="checklist-kit"><Choice label="Kit de documentos" id="checklist-kit" value={checklist.groupId} items={checklist.groups} disabled={busy||loading} placeholder="Selecione o kit" onChange={value=>loadChecklist(value)}/></div>
            {checklist.rows.length>0?<>
              <div className="checklist-summary" aria-label="Resumo das categorias deste kit">
                <span className="checklist-total missing"><strong>{checklistCounts.missing}</strong> sem anexo</span>
                <span className="checklist-total attached"><strong>{checklistCounts.attached}</strong> com anexo</span>
                {checklistCounts.unknown>0&&<span className="checklist-total unknown"><strong>{checklistCounts.unknown}</strong> sem informação</span>}
              </div>
              <p className="checklist-summary-note">Contagem de categorias deste kit. Confira as condições de cada uma antes de enviar.</p>
              <ol className="checklist-list">
                {checklist.rows.map(row=>{
                  const statusClass=row.status==="anexado"?"attached":row.status==="sem anexo"?"missing":"unknown";
                  return <li className={`checklist-row ${statusClass}`} key={`${row.groupId}:${row.typeId}:${row.baseTypeId}`}>
                    <div className="checklist-row-heading"><h3>{row.title}</h3><span className={`checklist-status ${statusClass}`}>{row.status==="anexado"?<CheckCircle2 size={15}/>:<Info size={15}/>}<span>{row.status==="anexado"?"Anexado":row.status==="sem anexo"?"Sem anexo":"Desconhecido"}</span></span></div>
                    <span className="checklist-file-count">{row.attachedCount===null?"Quantidade de arquivos não informada":`${row.attachedCount} ${row.attachedCount===1?"arquivo registrado":"arquivos registrados"}`}</span>
                    {row.complement&&<p className="checklist-complement">{row.complement}</p>}
                    {row.instructions?<div className="checklist-instructions"><span>Orientação da Funchal</span><p>{row.instructions}</p></div>:<p className="checklist-no-instructions">A Funchal não retornou orientações adicionais para esta categoria.</p>}
                  </li>;
                })}
              </ol>
            </>:<p className="empty-note">Nenhuma categoria foi retornada para este kit. Isso não confirma que a documentação esteja completa.</p>}
          </>}
        </div>}
      </div>
    </section>
    {notes&&<section className="panel requirement-notes"><h3>Solicitações e registros do processo</h3><p>{notes.explanation}</p>{!notes.available?<p className="empty-note">A Funchal não habilitou históricos ou ocorrências para este acesso.</p>:!notes.entries.length?<p className="empty-note">Nenhum registro foi retornado. Isso não confirma que a documentação esteja completa.</p>:<ol className="history-list">{notes.entries.map((entry,index)=><li key={index}><time>{entry.date}</time><p>{entry.text}</p><small>{entry.source}</small></li>)}</ol>}</section>}
    <section className="panel upload-panel" aria-labelledby="upload-title"><div className="section-heading"><div><p className="eyebrow">ARQUIVO E CLASSIFICAÇÃO</p><h2 id="upload-title">Anexar documento</h2><p>Envie para a sua proposta sem sair daqui.</p></div><span className="doc-icon"><Upload size={23}/></span></div>
      {loading&&!options?<div role="status" className="loading-state"><LoaderCircle className="spin"/>Consultando opções de envio…</div>:options&&!options.uploadAllowed?<p className="empty-note">A Funchal não habilitou o envio de arquivos para este acesso.</p>:options?<form onSubmit={event=>{event.preventDefault();if(ready)setReview(true);}}>
        <div className="upload-fields"><div className="file-picker"><label htmlFor="document-file"><Upload size={28}/><strong>{file?file.name:"Escolher arquivo ou foto"}</strong><span>PDF, imagens ou Excel XLS · Até 15 MB por arquivo</span></label><Input ref={fileInput} id="document-file" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tif,.tiff,.heic,.heif,.xls" disabled={busy||loading} onChange={event=>chooseFile(event.target.files?.[0]||null)}/>{file&&<div className="file-summary"><span>{(file.size/1024/1024).toLocaleString("pt-BR",{maximumFractionDigits:2})} MB · Selecionado no dispositivo</span><button type="button" aria-label="Remover arquivo selecionado" disabled={busy} onClick={()=>{chooseFile(null);if(fileInput.current)fileInput.current.value="";}}><X size={18}/></button></div>}</div>
        <div className="classification-fields"><Choice label="Grupo do documento" id="document-group" value={groupId} items={options.groups} disabled={busy||loading} placeholder="Selecione o grupo" onChange={value=>{if(busy||portalOperation.current)return;setGroupId(value);setTypeId("");setResult(null);attempted.current=false;void loadOptions(value);}}/><Choice label="Tipo de documento" id="document-type" value={typeId} items={options.types} disabled={busy||loading||!groupId} placeholder={loading?"Consultando tipos…":"Selecione a classificação"} onChange={value=>{setTypeId(value);setResult(null);attempted.current=false;}}/><label htmlFor="document-description">Descrição<Input id="document-description" value={description} onChange={event=>setDescription(event.target.value)} maxLength={250} disabled={busy} required placeholder="Ex.: comprovante referente a agosto"/></label><p className="field-help">Grupos e tipos vêm da Funchal. Escolha o que corresponde ao conteúdo do arquivo.</p></div></div>
        {existingType&&<p className="inline-notice"><Info size={18}/>Já existe um anexo nesta classificação. A substituição ainda não está disponível nesta integração.</p>}
        <div className="upload-actions"><span>O arquivo só será enviado após sua revisão.</span><Button className="connect-button" type="submit" disabled={!ready}><Upload size={18}/>Revisar envio</Button></div>
      </form>:<Button variant="outline" disabled={busy||loading} onClick={()=>loadOptions()}>Carregar opções de envio</Button>}
      {localError&&<div className="document-feedback error" role="alert"><Info size={19}/><p>{localError}</p></div>}
      {result&&<div className={`document-feedback ${result.state}`} role="status">{result.state==="confirmed"?<CheckCircle2 size={21}/>:<Info size={21}/>}<div><strong>{result.state==="confirmed"?"Envio confirmado":"Recebimento a conferir"}</strong><p>{result.message}</p><button type="button" className="text-button" onClick={refreshDocuments} disabled={busy}>Atualizar documentos</button></div></div>}
    </section>
    <section className="panel documents-panel"><div className="section-heading"><div><h2>Documentos anexados</h2><p>{detail?.documents.length??"—"} documentos retornados pela Funchal</p></div><label className="search-box"><Search size={18}/><Input aria-label="Buscar documento" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Buscar documento"/></label></div>{!detail?<div className="loading-state" role="status"><LoaderCircle className="spin"/>Consultando documentos…</div>:!docs.length?<div className="empty"><FileText size={30}/><h3>{search?"Nenhum documento encontrado":"Nenhum documento disponível"}</h3><p>{search?"Tente outro nome ou classificação.":"Nenhum anexo foi retornado para sua conta."}</p></div>:<div className="document-list">{docs.map(doc=><article className="document-row" key={doc.id}><span className="doc-icon"><FileText size={22}/></span><div><h3>{doc.type||"Sem classificação informada"}</h3><p>{doc.description}</p><small>{doc.date}</small></div>{doc.downloadable?<button type="button" className="download-link" disabled={busy||loading} onClick={()=>downloadDocument(doc)} aria-label={`${downloadingId===doc.id?"Baixando":"Baixar"} ${doc.type}`} aria-busy={downloadingId===doc.id}>{downloadingId===doc.id?<LoaderCircle className="spin" size={19}/>:<Download size={19}/>}<span>{downloadingId===doc.id?"Baixando…":"Baixar"}</span></button>:<span className="muted">Consulta</span>}</article>)}</div>}<p className="field-help list-note">A classificação exibida é a registrada na Funchal. Um anexo disponível não significa que já foi aprovado.</p></section>
    <Dialog open={review} onOpenChange={value=>{if(!sending)setReview(value);}}><DialogContent className="upload-review" showCloseButton={!sending} onInteractOutside={event=>{if(sending)event.preventDefault();}} onEscapeKeyDown={event=>{if(sending)event.preventDefault();}}><DialogHeader><DialogTitle>Conferir antes de anexar</DialogTitle><DialogDescription>O arquivo ficará disponível para os envolvidos no seu processo, conforme as permissões da Funchal.</DialogDescription></DialogHeader><dl className="review-details"><div><dt>Proposta</dt><dd>{proposalNumber}</dd></div><div><dt>Arquivo</dt><dd>{file?.name}</dd></div><div><dt>Grupo</dt><dd>{groupLabel}</dd></div><div><dt>Classificação</dt><dd>{typeLabel}</dd></div><div><dt>Descrição</dt><dd>{description}</dd></div></dl><DialogFooter><Button variant="outline" disabled={sending} onClick={()=>setReview(false)}>Voltar</Button><Button className="connect-button" disabled={sending} onClick={send}>{sending?<><LoaderCircle size={18} className="spin"/>Enviando e conferindo…</>:<><Upload size={18}/>Confirmar e anexar</>}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
function Choice({label,id,value,items,disabled,placeholder,onChange}:{label:string;id:string;value:string;items:DocumentChoice[];disabled:boolean;placeholder:string;onChange:(value:string)=>void}){return <div><label id={`${id}-label`} htmlFor={id}>{label}</label><Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-labelledby={`${id}-label`} className="document-select"><SelectValue placeholder={placeholder}/></SelectTrigger><SelectContent position="popper" className="document-select-options">{items.map(item=><SelectItem key={item.id} value={item.id}>{item.label}</SelectItem>)}</SelectContent></Select></div>;}
