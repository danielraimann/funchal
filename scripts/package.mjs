import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
const root = new URL('../outputs/', import.meta.url);
await mkdir(root, { recursive: true });
const header = `// ==UserScript==\n// @name Meu crédito — visualização pessoal\n// @namespace meu-credito.local\n// @version 1.0.0\n// @description Acompanhamento na própria sessão do Portal Funchal\n// @match https://formalizabra.creditoimobiliario.funchalnegocios.com.br/Default.aspx*\n// @run-at document-idle\n// @grant none\n// ==/UserScript==\n`;
await writeFile(new URL('meu-credito.user.js', root), header + source);
await writeFile(new URL('funchal.user.js', root), header + source);
await copyFile(new URL('../README.md', import.meta.url), new URL('LEIA-ME.md', root));
const cwd=fileURLToPath(new URL('../',import.meta.url));
if(process.platform==='win32') {
  const args=['-NoProfile','-Command',"Compress-Archive -LiteralPath 'extension','README.md' -DestinationPath 'outputs/meu-credito-extensao.zip' -Force"];
  let result=spawnSync('pwsh.exe',args,{cwd,stdio:'inherit'});
  if(result.error?.code==='ENOENT') result=spawnSync('powershell.exe',args,{cwd,stdio:'inherit'});
  if(result.error || result.status!==0) throw result.error || new Error('Não foi possível gerar o ZIP.');
} else {
  execFileSync('zip',['-q','-r','outputs/meu-credito-extensao.zip','extension','README.md'],{cwd,stdio:'inherit'});
}
console.log('Extensão ZIP e userscripts gerados em outputs. Nenhum outro arquivo foi incluído no pacote.');
