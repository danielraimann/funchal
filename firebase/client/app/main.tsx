import { createRoot } from "react-dom/client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Home, LockKeyhole, LoaderCircle, ArrowRight, Mail, CheckCircle2 } from "lucide-react";
import CreditApp from "./credit-app";
import { authErrorMessage, createPortalAccount, enterPortal, getPortalAuth, leavePortal, resetPortalPassword, sendPortalVerification } from "./firebase-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import "./globals.css";
import "./credit.css";
import "./documents.css";
import "./auth.css";

type Mode="signin"|"signup"|"reset";
function App(){
  const [user,setUser]=useState<User|null>(null),[verified,setVerified]=useState(false),[loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState(""),[mode,setMode]=useState<Mode>("signin"),[email,setEmail]=useState("");
  const operation=useRef(false);
  useEffect(()=>{
    let cleanup:(()=>void)|undefined,alive=true;
    getPortalAuth().then(auth=>{
      if(alive)cleanup=onAuthStateChanged(auth,current=>{if(alive){setUser(current);setVerified(!!current?.emailVerified);setLoading(false);}});
    }).catch(()=>{if(alive){setError("Não foi possível carregar o acesso. Atualize a página e tente novamente.");setLoading(false);}});
    return()=>{alive=false;cleanup?.();};
  },[]);
  function begin(){if(operation.current)return false;operation.current=true;setBusy(true);setError("");setNotice("");return true;}
  function finish(){operation.current=false;setBusy(false);}
  function switchMode(next:Mode){if(operation.current)return;setMode(next);setError("");setNotice("");}
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!begin())return;
    const form=event.currentTarget,fields=new FormData(form),address=String(fields.get("email")||"").trim();
    try{
      if(mode==="reset"){
        await resetPortalPassword(address);
        setNotice("Se este e-mail tiver uma conta, você receberá as instruções para criar uma nova senha. Confira também a pasta de spam.");
        return;
      }
      const password=String(fields.get("password")||"");
      if(mode==="signup"){
        if(password.length<12){setError("Escolha uma senha com pelo menos 12 caracteres.");return;}
        if(password!==String(fields.get("confirmPassword")||"")){setError("As senhas não são iguais. Confira a confirmação.");return;}
        const credential=await createPortalAccount(address,password);
        form.reset();setUser(credential.user);setVerified(false);
        try{await sendPortalVerification(credential.user);setNotice("Conta criada. Enviamos um link para confirmar seu e-mail. Confira também a pasta de spam.");}
        catch(error){setError(`Sua conta foi criada, mas o e-mail de confirmação não pôde ser enviado. ${authErrorMessage(error)}`);}
      }else{
        const credential=await enterPortal(address,password);
        form.reset();setUser(credential.user);setVerified(credential.user.emailVerified);
      }
    }catch(error){setError(authErrorMessage(error));}
    finally{
      for(const name of ["password","confirmPassword"]){const field=form.elements.namedItem(name) as HTMLInputElement|null;if(field)field.value="";}
      finish();
    }
  }
  async function resendVerification(){
    if(!user||!begin())return;
    try{await sendPortalVerification(user);setNotice("Enviamos um novo link de confirmação. Confira sua caixa de entrada e a pasta de spam.");}
    catch(error){setError(authErrorMessage(error));}finally{finish();}
  }
  async function checkVerification(){
    if(!user||!begin())return;
    try{
      await user.reload();
      await user.getIdToken(true);
      setVerified(user.emailVerified);
      if(!user.emailVerified)setNotice("A confirmação ainda não apareceu. Abra o link recebido por e-mail e, depois, toque em ‘Já confirmei’.");
    }catch(error){setError(authErrorMessage(error));}finally{finish();}
  }
  async function signOutAccount(){
    await leavePortal();setUser(null);setVerified(false);setMode("signin");setError("");setNotice("");
  }
  async function leaveUnverified(){
    if(!begin())return;
    try{await signOutAccount();}catch(error){setError(authErrorMessage(error));}finally{finish();}
  }
  if(user&&verified&&user.emailVerified)return <CreditApp key={user.uid} onSignOut={signOutAccount}/>;
  return <main className="auth-shell"><section className="auth-card">
    <div className="brand"><span className="brand-icon"><Home size={24}/></span><span>Meu crédito<small>FUNCHAL</small></span></div>
    <p className="eyebrow">SEU ACOMPANHAMENTO PRIVADO</p>
    {loading?<div className="auth-loading" role="status"><LoaderCircle className="spin" size={25}/><p>Conferindo seu acesso…</p></div>:user?<>
      <span className="auth-mail-icon"><Mail size={27}/></span>
      <h1>Confira<br/>seu e-mail.</h1>
      <p>Confirme seu endereço para continuar. Abra o link da mensagem de confirmação e volte para esta tela.</p>
      <div className="auth-email-address">{user.email}</div>
      {error&&<p className="auth-feedback error" role="alert">{error}</p>}
      {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
      <div className="auth-verification-actions">
        <Button className="connect-button" disabled={busy} onClick={checkVerification}>{busy?<LoaderCircle className="spin" size={19}/>:<CheckCircle2 size={19}/>}Já confirmei</Button>
        <Button variant="outline" disabled={busy} onClick={resendVerification}>Reenviar confirmação</Button>
        <button type="button" className="auth-text-button" disabled={busy} onClick={leaveUnverified}>Sair e usar outro e-mail</button>
      </div>
      <p className="auth-help">Depois da confirmação, apenas contas autorizadas podem acessar as informações do financiamento.</p>
    </>:<>
      <h1>{mode==="signup"?<>Seu primeiro<br/>acesso.</>:mode==="reset"?<>Recupere<br/>seu acesso.</>:<>Mais perto<br/>da sua casa.</>}</h1>
      <p>{mode==="signup"?"Cadastre seu e-mail autorizado e escolha uma senha exclusiva para este acompanhamento.":mode==="reset"?"Informe seu e-mail para receber as instruções de recuperação da senha deste acompanhamento.":"Entre com seu e-mail e senha para acompanhar o financiamento."}</p>
      {mode!=="reset"&&<div className="auth-tabs" aria-label="Opções de acesso"><button type="button" aria-pressed={mode==="signin"} disabled={busy} onClick={()=>switchMode("signin")}>Entrar</button><button type="button" aria-pressed={mode==="signup"} disabled={busy} onClick={()=>switchMode("signup")}>Primeiro acesso</button></div>}
      {error&&<p className="auth-feedback error" role="alert">{error}</p>}
      {notice&&<p className="auth-feedback success" role="status">{notice}</p>}
      <form className="auth-form" key={mode} onSubmit={submit}>
        <label htmlFor="account-email">E-mail<Input id="account-email" name="email" type="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event=>setEmail(event.target.value)} maxLength={254} disabled={busy} required placeholder="Seu e-mail autorizado"/></label>
        {mode!=="reset"&&<label htmlFor="account-password">{mode==="signup"?"Criar senha":"Senha do acompanhamento"}<Input id="account-password" name="password" type="password" autoComplete={mode==="signup"?"new-password":"current-password"} minLength={mode==="signup"?12:undefined} maxLength={4096} disabled={busy} required aria-describedby={mode==="signup"?"password-help":undefined}/></label>}
        {mode==="signup"&&<><p id="password-help" className="auth-field-help">Use pelo menos 12 caracteres. Combine letras, números e símbolos.</p><label htmlFor="confirm-password">Confirmar senha<Input id="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" minLength={12} maxLength={4096} disabled={busy} required/></label><p className="auth-field-help">Você receberá um e-mail de confirmação ao criar a conta.</p></>}
        <Button className="connect-button" type="submit" disabled={busy}>{busy?<><LoaderCircle className="spin" size={19}/>Aguarde…</>:<>{mode==="signup"?"Criar minha conta":mode==="reset"?"Enviar recuperação":"Entrar"}<ArrowRight size={18}/></>}</Button>
      </form>
      <div className="auth-form-links">{mode==="signin"?<button type="button" className="auth-text-button" disabled={busy} onClick={()=>switchMode("reset")}>Esqueci minha senha</button>:mode==="reset"?<button type="button" className="auth-text-button" disabled={busy} onClick={()=>switchMode("signin")}>Voltar para entrar</button>:null}</div>
      {mode!=="reset"&&<div className="auth-access"><LockKeyhole size={22}/><div><strong>Duas etapas para acompanhar</strong><ol><li>Entre com seu e-mail autorizado e a senha criada aqui.</li><li>Depois, conecte seu acesso Funchal e confirme o código recebido.</li></ol></div></div>}
    </>}
    <small>Crédito imobiliário Bradesco · Dados consultados na Funchal</small>
  </section></main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
