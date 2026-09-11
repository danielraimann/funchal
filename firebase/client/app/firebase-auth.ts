import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, setPersistence, browserSessionPersistence, signInWithPopup, signOut, type Auth } from "firebase/auth";

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
export async function enterPortal(){
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({prompt:"select_account"});
  return signInWithPopup(await getPortalAuth(),provider);
}
export async function leavePortal(){await signOut(await getPortalAuth());}
export async function portalToken(){
  const auth=await getPortalAuth();
  await auth.authStateReady();
  if(!auth.currentUser)throw Object.assign(new Error("Entre com sua conta Google para continuar."),{status:401});
  return auth.currentUser.getIdToken();
}
