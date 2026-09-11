import type { PortalSession } from "./session-store";
import { attributes, hiddenFields, inputs, PORTAL_ORIGIN, PortalError, upstream } from "./portal-core.ts";

export function loginForm(html:string){
  const tag=Array.from(html.matchAll(/<form\b[^>]*>/gi),m=>attributes(m[0])).find(a=>a.id==="loginform");
  if(!tag||tag.method?.toLowerCase()!=="post")throw new PortalError("O formato do login do portal mudou. Use o portal original por enquanto.");
  const action=new URL(tag.action||"/Login.aspx",`${PORTAL_ORIGIN}/Login.aspx`);
  if(action.origin!==PORTAL_ORIGIN||action.pathname!=="/Login.aspx")throw new PortalError("O formulário de login do portal não é compatível.");
  const controls=inputs(html),hidden=hiddenFields(html);
  if(!hidden.__VIEWSTATE||!hidden.__EVENTVALIDATION||!hidden.__RequestVerificationToken)throw new PortalError("O portal não disponibilizou uma sessão de login válida.");
  return {action:action.pathname+action.search,controls,hidden};
}
function acceptResponse(state:PortalSession,html:string,url:URL,username:string){
  if(url.pathname==="/Default.aspx"&&html.includes("MainContent_PortalUsuarioID")){state.state="connected";state.hidden=undefined;state.form=undefined;state.message=undefined;state.expires=Date.now()+45*60*1000;return {state:"connected" as const};}
  const form=loginForm(html),code=form.controls.find(c=>c.id==="txtToken"),button=form.controls.find(c=>c.id==="btnEnviar"&&c.type==="submit"),user=form.controls.find(c=>c.id==="txtPortalUsuarioID");
  state.hidden=form.hidden;
  if(code?.name&&button?.name){state.state="code";state.form={action:form.action,usernameName:user?.name||"",usernameValue:user?.value||username,codeName:code.name,buttonName:button.name,buttonValue:button.value||"Validar Código"};state.message="Digite o código enviado pelo portal ao seu e-mail cadastrado.";return {state:"code" as const,message:state.message};}
  state.state="disconnected";state.hidden=undefined;state.form=undefined;
  throw new PortalError("Não foi possível entrar. Confira seu usuário e sua senha. Se necessário, recupere o acesso no portal original.",400);
}
export async function login(state:PortalSession,username:string,password:string){
  if(username.length>50||password.length>20)throw new PortalError("Confira o tamanho do usuário e da senha do portal.",400);
  const initial=await upstream(state.cookies,"/Login.aspx"),form=loginForm(await initial.response.text());
  const user=form.controls.find(c=>c.id==="txtPortalUsuarioID"),pass=form.controls.find(c=>c.id==="txtSenha"&&c.type==="password"),button=form.controls.find(c=>c.id==="btnSolicitarToken"&&c.type==="submit");
  if(!user?.name||!pass?.name||!button?.name)throw new PortalError("O formulário de login mudou. Use o portal original por enquanto.");
  const body=new URLSearchParams({...form.hidden,[user.name]:username,[pass.name]:password,[button.name]:button.value||"Login"});
  const result=await upstream(state.cookies,form.action,body.toString());
  // Credentials live only in this request; no password is placed in session state.
  return acceptResponse(state,await result.response.text(),result.url,username);
}
export async function verify(state:PortalSession,code:string){
  if(state.state!=="code"||!state.form||!state.hidden||state.expires<=Date.now())throw new PortalError("O prazo para validar o código terminou. Conecte novamente.",428);
  const form=state.form,body=new URLSearchParams({...state.hidden,[form.codeName]:code,[form.buttonName]:form.buttonValue});
  if(form.usernameName)body.set(form.usernameName,form.usernameValue);
  const result=await upstream(state.cookies,form.action,body.toString());
  let accepted;try{accepted=acceptResponse(state,await result.response.text(),result.url,form.usernameValue);}catch(e){if((state as PortalSession).state==="disconnected")throw new PortalError("O prazo para validar o código terminou. Conecte novamente.",428);throw e;}
  if(accepted.state==="code")throw new PortalError("O código não foi aceito. Confira os seis números e tente novamente.",400);
  return accepted;
}
