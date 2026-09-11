import { initializeApp } from "firebase/app";
import { getAuth, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signOut, type Auth, type User } from "firebase/auth";

let authentication: Promise<Auth> | undefined;
export function getPortalAuth() {
  return authentication ||= (async()=>{
    const response = await fetch("/__/firebase/init.json",{cache:"no-store"});
    if(!response.ok)throw new Error("A configuração do portal ainda não está disponível.");
    const config = await response.json();
    if(!config.apiKey||!config.projectId)throw new Error("A configuração do acesso está incompleta.");
    const auth = getAuth(initializeApp(config));
    await setPersistence(auth,browserSessionPersistence);
    auth.languageCode="pt-BR";
    return auth;
  })();
}
export async function enterPortal(email:string,password:string){return signInWithEmailAndPassword(await getPortalAuth(),email.trim(),password);}
export async function createPortalAccount(email:string,password:string){
  if(password.length<12)throw Object.assign(new Error("A senha precisa ter pelo menos 12 caracteres."),{code:"auth/weak-password"});
  return createUserWithEmailAndPassword(await getPortalAuth(),email.trim(),password);
}
export async function sendPortalVerification(user:User){await sendEmailVerification(user,{url:`${window.location.origin}/`,handleCodeInApp:false});}
export async function resetPortalPassword(email:string){await sendPasswordResetEmail(await getPortalAuth(),email.trim(),{url:`${window.location.origin}/`,handleCodeInApp:false});}
export async function leavePortal(){await signOut(await getPortalAuth());}
export async function portalToken(){
  const auth=await getPortalAuth();
  await auth.authStateReady();
  if(!auth.currentUser)throw Object.assign(new Error("Entre com seu e-mail e senha para continuar."),{status:401});
  if(!auth.currentUser.emailVerified)throw Object.assign(new Error("Confirme seu e-mail para continuar."),{status:401});
  return auth.currentUser.getIdToken();
}

export function authErrorMessage(error:unknown):string {
  const code=(error as {code?:string}|null)?.code;
  switch(code){
    case "auth/invalid-email":return "Informe um endereço de e-mail válido.";
    case "auth/invalid-credential":case "auth/wrong-password":case "auth/user-not-found":return "E-mail ou senha incorretos. Confira os dados e tente novamente.";
    case "auth/email-already-in-use":return "Não foi possível criar uma conta com esse e-mail. Se você já tem cadastro, entre ou use a recuperação de senha.";
    case "auth/weak-password":case "auth/password-does-not-meet-requirements":return "A senha não atende aos requisitos de segurança. Use pelo menos 12 caracteres e combine letras, números e símbolos.";
    case "auth/too-many-requests":return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
    case "auth/network-request-failed":return "Não foi possível conectar. Confira sua conexão e tente novamente.";
    case "auth/user-disabled":return "Este acesso está indisponível. Entre em contato com o responsável pelo acompanhamento.";
    case "auth/requires-recent-login":case "auth/user-token-expired":case "auth/invalid-user-token":return "Entre novamente com seu e-mail e senha para concluir esta ação.";
    case "auth/operation-not-allowed":return "O acesso por e-mail e senha está indisponível no momento. Tente novamente mais tarde.";
    default:return "Não foi possível concluir esta ação agora. Tente novamente.";
  }
}
