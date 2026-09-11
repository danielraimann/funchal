import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { Home, LockKeyhole, LoaderCircle, ArrowRight } from "lucide-react";
import CreditApp from "./credit-app";
import { getPortalAuth, enterPortal, leavePortal } from "./firebase-auth";
import { Button } from "@/components/ui/button";
import "./globals.css";
import "./credit.css";
import "./documents.css";
import "./auth.css";

function App(){
  const [user,setUser]=useState<User|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState("");
  useEffect(()=>{let cleanup:(()=>void)|undefined,alive=true;getPortalAuth().then(auth=>{if(alive)cleanup=onAuthStateChanged(auth,u=>{setUser(u);setLoading(false);});}).catch(()=>{if(alive){setError("Não foi possível carregar a configuração do portal. Tente atualizar a página.");setLoading(false);}});return()=>{alive=false;cleanup?.();};},[]);
  async function enter(){setBusy(true);setError("");try{await enterPortal();}catch{setError("Não foi possível concluir o acesso. Permita a janela de login e tente novamente.");}finally{setBusy(false);}}
  if(user)return <CreditApp key={user.uid} onSignOut={()=>void leavePortal()}/>;
  return <main className="auth-shell"><section className="auth-card"><div className="brand"><span className="brand-icon"><Home size={24}/></span><span>Meu crédito<small>FUNCHAL</small></span></div><p className="eyebrow">SEU ACOMPANHAMENTO PRIVADO</p><h1>Mais perto<br/>da sua casa.</h1><p>Veja as etapas do financiamento, confira documentos e acompanhe o que falta anexar.</p><div className="auth-access"><LockKeyhole size={22}/><div><strong>Seu acesso, protegido</strong><p>Entre com sua conta Google autorizada. Depois, conecte seu acesso Funchal.</p></div></div>{error&&<p className="notice error" role="alert">{error}</p>}<Button className="connect-button" disabled={busy||loading} onClick={enter}>{busy||loading?<><LoaderCircle className="spin"/>Carregando…</>:<>Entrar com Google<ArrowRight size={18}/></>}</Button><small>Crédito imobiliário Bradesco · Dados consultados na Funchal</small></section></main>;
}
createRoot(document.getElementById("root")!).render(<App/>);
