// No arbitrary URLs: all upstream requests use this origin and this allowlist.
export const PORTAL_ORIGIN = "https://formalizabra.creditoimobiliario.funchalnegocios.com.br";
const paths = new Set(["/", "/Login.aspx", "/Default.aspx", "/AnexarDocumentacaoProcesso.aspx", "/ws/FinanciamentoJson.ashx", "/ws/WorkflowFasesJson.ashx", "/ws/FinanciamentoDocumentoJson.ashx", "/ws/FinanciamentoHistoricoJson.ashx", "/ws/CarregarCombo.ashx", "/ws/FinanciamentoDocumentoOperacaoJson.ashx", "/ws/FinanciamentoDocumentoOperacaoGravarSubstituir.ashx", "/ws/WorkFlowFasesHistoricoJson.ashx", "/FileCliente.aspx"]);
for(const script of ["/Scripts/Pages/AnexarDocumentacaoProcesso.js","/Scripts/Funcoes.js","/Scripts/Pages/JQueryUtils.js"])paths.add(script);
export class PortalError extends Error { constructor(message:string,public status=502){super(message);} }
export type Cookie = {name:string;value:string;path:string;expires:number|null;secure:boolean;domain:string;hostOnly:boolean};
export function cookieHeader(jar:Cookie[],url:URL,now=Date.now()) {return jar.filter(c=>(c.expires===null||c.expires>now)&&(!c.secure||url.protocol==="https:")&&(c.hostOnly?url.hostname===c.domain:url.hostname===c.domain||url.hostname.endsWith(`.${c.domain}`))&&(url.pathname===c.path||url.pathname.startsWith(c.path.endsWith("/")?c.path:`${c.path}/`))).sort((a,b)=>b.path.length-a.path.length).map(c=>`${c.name}=${c.value}`).join("; ");}
export function mergeCookies(jar:Cookie[],headers:string[],url:URL,now=Date.now()) {
  for(const header of headers){const parts=header.split(";").map(v=>v.trim()),first=parts.shift()||"",at=first.indexOf("=");if(at<1)continue;const c:Cookie={name:first.slice(0,at),value:first.slice(at+1),path:url.pathname.slice(0,url.pathname.lastIndexOf("/")+1)||"/",expires:null,secure:false,domain:url.hostname,hostOnly:true};let maxAge:number|undefined;
    for(const part of parts){const at=part.indexOf("="),name=(at<0?part:part.slice(0,at)).toLowerCase(),value=at<0?"":part.slice(at+1);if(name==="path"&&value.startsWith("/"))c.path=value;if(name==="domain"){c.domain=value.toLowerCase().replace(/^\./,"");c.hostOnly=false;}if(name==="secure")c.secure=true;if(name==="max-age"&&/^-?\d+$/.test(value))maxAge=Number(value);if(name==="expires"){const time=Date.parse(value);if(Number.isFinite(time))c.expires=time;}}
    if(maxAge!==undefined)c.expires=now+maxAge*1000;
    if(c.domain!==url.hostname&&!url.hostname.endsWith(`.${c.domain}`))continue;
    // Accept only the portal host or its direct, known parent domains.
    if(![url.hostname,"creditoimobiliario.funchalnegocios.com.br","funchalnegocios.com.br"].includes(c.domain))continue;
    const index=jar.findIndex(v=>v.name===c.name&&v.path===c.path&&v.domain===c.domain);if(index>=0)jar.splice(index,1);if(c.expires===null||c.expires>now)jar.push(c);
  }
}
export type UploadHeaders = {FinanciamentoID:string;tpGrupoID:string;tpDocOpeID:string;descricaoDocumento:string;tblOrigemDocumentoAnexo:string;FinanciamentoAnaliseGarantiaImovelID:string};
export async function upstream(jar:Cookie[],path:string,body?:string|FormData,contentType="application/x-www-form-urlencoded",streamDownload=false,uploadHeaders?:UploadHeaders) {
  let url=new URL(path,PORTAL_ORIGIN),method=body===undefined?"GET":"POST";
  const until=Date.now()+25000;
  const normalDeadline=AbortSignal.timeout(25000);
  for(let hop=0;hop<5;hop++){
    if(url.origin!==PORTAL_ORIGIN||!paths.has(url.pathname))throw new PortalError("O portal redirecionou para um endereço não compatível.");
    const headers:Record<string,string>={Accept:"application/json, text/html;q=0.9, */*;q=0.8",Referer:`${PORTAL_ORIGIN}/${url.pathname==="/Login.aspx"?"Login":"Default"}.aspx`};if(url.pathname.startsWith("/ws/"))headers["X-Requested-With"]="XMLHttpRequest";const cookie=cookieHeader(jar,url);if(cookie)headers.Cookie=cookie;if(body!==undefined){if(typeof body==="string")headers["Content-Type"]=contentType;headers.Origin=PORTAL_ORIGIN;}
    if(uploadHeaders){if(url.pathname!=="/ws/FinanciamentoDocumentoOperacaoGravarSubstituir.ashx"||!(body instanceof FormData))throw new PortalError("Envio incompatível.");for(const name of ["FinanciamentoID","tpGrupoID","tpDocOpeID","descricaoDocumento","tblOrigemDocumentoAnexo","FinanciamentoAnaliseGarantiaImovelID"] as const){const value=uploadHeaders[name];if(typeof value!=="string"||/[^\x20-\x7e\xa0-\xff]/.test(value)||value.length>300)throw new PortalError("Use texto sem emojis ou quebras de linha na descrição.",400);headers[name]=value;}}
    const controller=new AbortController();const timer=streamDownload?setTimeout(()=>controller.abort(),Math.max(1,until-Date.now())):undefined;
    let r:Response;try{r=await fetch(url,{method,headers,body,redirect:"manual",signal:streamDownload?controller.signal:normalDeadline});if(timer!==undefined)clearTimeout(timer);}catch{if(timer!==undefined)clearTimeout(timer);throw new PortalError("O portal não respondeu a tempo. Tente novamente.",504);}
    const h=r.headers as Headers & {getAll?:(key:string)=>string[];getSetCookie?:()=>string[]};const set=h.getSetCookie?.()||h.getAll?.("Set-Cookie")||[];mergeCookies(jar,set,url);
    if([301,302,303,307,308].includes(r.status)){const location=r.headers.get("location");if(!location)throw new PortalError("Redirecionamento incompleto no portal.");await r.body?.cancel();if(uploadHeaders)throw new PortalError("O portal redirecionou o envio. O resultado precisa ser conferido.",502);url=new URL(location,url);if([301,302,303].includes(r.status)){method="GET";body=undefined;}continue;}
    if(!r.ok){await r.body?.cancel();throw new PortalError("O portal está indisponível no momento. Tente novamente.");}
    return {response:r,url};
  }
  throw new PortalError("O portal não concluiu o redirecionamento.");
}
export function decode(value:string){return value.replace(/&(?:amp|lt|gt|quot|apos|#39|#x[\da-f]+|#\d+);/gi,m=>{const named:Record<string,string>={"&amp;":"&","&lt;":"<","&gt;":">","&quot;":"\"","&apos;":"'","&#39;":"'"};return named[m.toLowerCase()]??String.fromCodePoint(Math.min(0x10ffff,m.toLowerCase().startsWith("&#x")?parseInt(m.slice(3,-1),16):parseInt(m.slice(2,-1),10)));});}
export function attributes(tag:string){const result:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))result[m[1].toLowerCase()]=decode(m[2]??m[3]??m[4]);return result;}
export function inputs(html:string){return Array.from(html.matchAll(/<input\b[^>]*>/gi),m=>attributes(m[0]));}
export function hiddenFields(html:string){return Object.fromEntries(inputs(html).filter(a=>a.type?.toLowerCase()==="hidden"&&a.name).map(a=>[a.name,a.value||""]));}
export function inputValue(html:string,id:string){return inputs(html).find(a=>a.id===id)?.value||"";}
export function textValue(value:unknown){return typeof value==="string"?decode(value.replace(/<[^>]*>/g,"")).trim():value===null||value===undefined?"":String(value);}
export async function portalValue(jar:Cookie[],path:string,body:unknown):Promise<unknown> {
  const {response,url}=await upstream(jar,path,JSON.stringify(body));
  if(url.pathname.toLowerCase().includes("login")){await response.body?.cancel();throw new PortalError("Sua sessão no portal expirou. Conecte novamente.",428);}
  let data;try{data=await response.json();}catch{throw new PortalError("Esta consulta retornou um formato que ainda não é compatível. Sua conexão foi preservada.",502);}
  const status=data as {sessionExpired?:boolean;error?:unknown}|null;
  if(status?.sessionExpired)throw new PortalError("Sua sessão no portal expirou. Conecte novamente.",428);
  if(status?.error)throw new PortalError("O portal não autorizou esta consulta.",403);
  return data;
}
export async function portalJson(jar:Cookie[],path:string,body:unknown):Promise<Record<string,unknown>[]> {
  const data=await portalValue(jar,path,body);
  if(!Array.isArray(data)||data.some(row=>!row||typeof row!=="object"||Array.isArray(row)))throw new PortalError("O formato da resposta do portal mudou.");return data;
}
