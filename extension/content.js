/* Meu crédito. All account data stays in the current portal document. */
(() => {
  'use strict';
  const DOMAIN = 'formalizabra.creditoimobiliario.funchalnegocios.com.br';
  if (location.hostname !== DOMAIN || !/\/Default\.aspx$/i.test(location.pathname)) return;
  if (document.getElementById('meu-credito-host')) return;

  const labels = ['Prospecção', 'Análise de crédito', 'Avaliação do imóvel', 'Análise de documentos', 'Emissão do contrato', 'Contrato registrado'];
  const icons = {
    home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    file: '<path d="M14 2H5a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 6a8 8 0 0 1 14 6M18 18a8 8 0 0 1-14-6"/>',
    arrow: '<path d="M7 17 17 7M7 7h10v10"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-5"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>'
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.file}</svg>`;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean = value => /^(undefined|null)$/i.test(String(value).trim()) ? '' : String(value ?? '').replace(/\s+/g, ' ').trim();
  const text = el => clean(el?.textContent);
  const find = selector => document.querySelector(selector);
  const currencyFallback = value => value || 'Não informado';
  const state = {view:'overview', selected:0, selectedKey:null, query:'', busy:false, status:'', stage:0, updated:null, error:'', pending:new Set(), selectedOnce:false, docsReady:false, historyReady:false, docSnapshot:[], historySnapshot:[]};
  const docActions = new Map();
  const docKeys = new WeakMap();
  const requestGenerations = new WeakMap();
  let generation=0, initiating=false;
  let nextDocKey = 0;
  const originalTitle = document.title;
  const originalOverflow=[document.documentElement,document.body].map(element=>({element,value:element.style.getPropertyValue('overflow'),priority:element.style.getPropertyPriority('overflow')}));
  const host = document.createElement('div');
  host.id = 'meu-credito-host';
  const shadow = host.attachShadow({mode:'open'});
  const inertNodes = new Map();
  const style = document.createElement('style');
  style.textContent = `
    :host{all:initial;position:fixed;inset:0;z-index:10000;display:block;color:#1c2639;font:16px/1.5 "Segoe UI",Arial,sans-serif;color-scheme:light}
    *{box-sizing:border-box}button,input,select{font:inherit}button,a{touch-action:manipulation}button{cursor:pointer}button:disabled{cursor:wait;opacity:.65}button,a,input,select{outline-offset:4px}button:focus-visible,a:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid #5689d6}a{color:inherit;text-decoration:none}button{border:0}p,h1,h2,h3{margin:0}h1{font-size:32px;font-weight:680;letter-spacing:-1.1px;line-height:1.2}h2{font-size:21px;line-height:1.35;letter-spacing:-.4px}h3{font-size:16px;font-weight:650}small{font-size:13px}.icon{width:21px;height:21px;flex:none}.muted{color:#69758a}.eyebrow{font-size:12px;letter-spacing:1.8px;font-weight:700;text-transform:uppercase}.app{display:grid;grid-template-columns:234px minmax(0,1fr);height:100%;background:#f4f6fa;overflow:auto}.side{background:#142235;color:#bdc9da;display:flex;flex-direction:column;padding:32px 20px 24px;position:sticky;top:0;height:100dvh;min-height:650px}.brand{display:flex;align-items:center;gap:11px;color:white;font-size:21px;font-weight:650;padding:0 8px;letter-spacing:-.6px}.brand-mark{display:grid;place-items:center;width:39px;height:39px;background:#c5003c;border-radius:12px}.brand-mark .icon{width:23px;height:23px}.side .eyebrow{margin:39px 13px 12px;color:#8d9db4;font-size:11px}.nav{display:grid;gap:6px}.nav button{padding:13px 14px;border-radius:9px;background:transparent;color:inherit;display:flex;align-items:center;gap:12px;text-align:left;font-size:15px}.nav button.active{background:#2d3d52;color:#fff}.nav button:hover{background:#24364b;color:#fff}.nav .count{margin-left:auto;background:#425068;border-radius:5px;padding:0 6px;font-size:12px}.side-bottom{margin-top:auto;padding:26px 12px 0;font-size:13px}.side-bottom p{margin-top:10px;color:#a9b7ca;line-height:1.7}.private{display:flex;align-items:center;gap:8px;color:#eef3fa;font-weight:600}.original{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;background:none;color:#b8c6d8;padding:19px 0 0;margin-top:20px;border-top:1px solid #344255;font-size:13px}.workspace{min-width:0}.topbar{height:82px;display:flex;justify-content:space-between;align-items:center;padding:0 44px;border-bottom:1px solid #e2e7ef;background:#fff}.breadcrumb{display:flex;align-items:center;gap:10px;color:#6c7789;font-size:14px}.breadcrumb .icon{width:16px;height:16px}.user{display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600}.avatar{width:36px;height:36px;border-radius:50%;background:#eef0f6;color:#495c77;display:grid;place-items:center;font-size:12px;font-weight:700}.main{max-width:1320px;margin:auto;padding:36px 44px 30px}.heading{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:25px}.heading p{margin-top:8px;color:#68768a;font-size:15px}.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:10px 15px;border-radius:8px;background:#fff;border:1px solid #d8dee8;color:#37465b;font-weight:600;font-size:14px;white-space:nowrap}.btn:hover{border-color:#9cacbf;background:#fafbfe}.btn.primary{background:#b8073b;border-color:#b8073b;color:white}.btn.primary:hover{background:#990730}.btn.small{min-height:40px;padding:8px 12px}.btn .icon{width:17px;height:17px}.subtle{display:inline-flex;align-items:center;gap:6px;color:#a50635;font-size:14px;background:none;padding:6px 0;font-weight:650}.subtle .icon{width:16px;height:16px}.panel{background:#fff;border:1px solid #e1e6ee;border-radius:13px;min-width:0}.status-card{padding:28px 30px 0;position:relative;overflow:hidden}.status-card:before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:#bd0b3d}.status-top{display:flex;align-items:start;justify-content:space-between;gap:16px}.status-top .eyebrow{color:#9e0a35;margin-bottom:10px}.status-title{font-size:27px;font-weight:680;letter-spacing:-.7px;line-height:1.25}.status-detail{color:#687286;font-size:15px;margin-top:8px;max-width:650px}.badge{display:inline-flex;align-items:center;gap:7px;font-size:13px;border-radius:6px;padding:6px 10px;font-weight:600;background:#fcf0f4;color:#a60a38;white-space:nowrap}.badge .icon{width:15px;height:15px}.steps{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:0;margin-top:35px;padding-bottom:27px;list-style:none;padding-left:0}.step{position:relative;padding-right:14px;min-width:0}.step:not(:last-child):before{content:"";height:2px;background:#e6eaf1;position:absolute;top:16px;left:35px;right:3px}.step.done:before{background:#b7c9e0}.step-number{position:relative;display:grid;place-items:center;width:34px;height:34px;border:1px solid #e1e6ee;border-radius:50%;background:#f6f8fb;color:#8a96a6;font-weight:600;font-size:13px;margin-bottom:12px}.step.done .step-number{background:#e8eef6;border:0;color:#3e658e}.step.done .icon{width:16px;height:16px}.step.current .step-number{background:#b9073d;border-color:#b9073d;color:white;box-shadow:0 0 0 5px #fbecf1}.step-label{font-size:14px;line-height:1.4;color:#788397;font-weight:550;display:block;max-width:128px}.step.done .step-label{color:#476080}.step.current .step-label{color:#a60736;font-weight:700}.step-meta{font-size:11px;display:block;margin-top:5px;color:#7e8999}.step.current .step-meta{color:#a60736}.card-footer{margin:0 -30px;padding:13px 30px;background:#fafbfd;border-top:1px solid #e8ecf3;display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:13px;color:#718096}.source{display:flex;align-items:center;gap:7px}.source .icon{width:15px;height:15px}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:17px;margin:21px 0 26px}.stat{padding:21px 24px}.stat-label{display:flex;justify-content:space-between;align-items:center;color:#69758a;font-size:14px}.stat-label .icon{color:#8491a5;width:18px;height:18px}.stat-value{font-size:25px;line-height:1.3;letter-spacing:-.6px;font-weight:650;margin-top:13px;overflow-wrap:anywhere}.stat-caption{font-size:13px;color:#748197;margin-top:5px}.columns{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(270px,1fr);gap:23px}.panel-head{padding:23px 24px 18px;display:flex;justify-content:space-between;align-items:center;gap:14px}.panel-head h2{font-size:18px}.panel-head p{font-size:13px;color:#778397;margin-top:4px}.doc-preview{padding:0 24px 8px}.preview-row{padding:17px 0;display:flex;align-items:center;gap:13px;border-top:1px solid #edf0f5}.file-icon{width:39px;height:44px;flex:none;display:grid;place-items:center;border-radius:8px;background:#f0f3f8;color:#657d9d}.preview-info{min-width:0;flex:1}.preview-info strong{display:block;font-size:14px;line-height:1.45;font-weight:600;overflow-wrap:anywhere}.preview-info small{display:block;color:#7a8496;margin-top:4px}.icon-btn{display:grid;place-items:center;background:#fff;color:#526a88;width:42px;height:42px;border:1px solid #e1e6ee;border-radius:8px;flex:none}.icon-btn:hover{background:#f3f6fa}.details{padding:0 24px 22px}.detail{display:flex;justify-content:space-between;gap:20px;padding:13px 0;border-top:1px solid #edf0f5;font-size:14px}.detail dt{color:#758093}.detail dd{margin:0;text-align:right;font-weight:600;max-width:63%;overflow-wrap:anywhere}.footnote{display:flex;align-items:center;gap:7px;font-size:12px;color:#7d8798;margin-top:25px}.footnote .icon{width:14px;height:14px}.toolbar{display:flex;justify-content:space-between;gap:16px;align-items:center;margin:22px 0}.search{display:flex;gap:9px;align-items:center;border:1px solid #d8e0eb;background:#fff;border-radius:8px;padding:0 12px;max-width:400px;flex:1;color:#8290a3}.search input{min-height:44px;width:100%;min-width:0;border:0;background:none;color:#23344c;outline-offset:0;font-size:14px}.search .icon{width:18px;height:18px}.doc-list{overflow:hidden}.doc-row{display:grid;grid-template-columns:42px minmax(0,1fr) 110px 106px;align-items:center;gap:17px;padding:21px 24px;border-bottom:1px solid #e8edf4}.doc-row:last-child{border-bottom:0}.doc-row h3{overflow-wrap:anywhere;line-height:1.5}.doc-row p{font-size:13px;color:#738097;margin-top:5px;overflow-wrap:anywhere}.doc-date{font-size:14px;color:#718096}.empty{padding:45px 28px;text-align:center;color:#68778c}.empty .icon{width:32px;height:32px;margin-bottom:14px;color:#899ab1}.empty h2{font-size:19px;color:#354961;margin-bottom:9px}.empty p{font-size:15px;max-width:530px;margin:0 auto}.empty .btn{margin-top:20px}.history-list{padding:10px 24px}.history-row{display:grid;grid-template-columns:145px minmax(0,1fr);gap:25px;padding:22px 0;border-bottom:1px solid #e7edf5}.history-row time{color:#6c7b90;font-size:14px}.history-row p{font-size:15px;white-space:pre-wrap;overflow-wrap:anywhere}.history-row small{display:block;color:#718096;margin-top:7px}.notice{display:flex;align-items:start;gap:10px;padding:14px 17px;border:1px solid #f0d3b7;background:#fff8f0;border-radius:9px;margin-bottom:20px;font-size:14px;color:#835523}.notice .icon{width:19px;height:19px;margin-top:1px}.toast{position:fixed;bottom:26px;left:50%;transform:translateX(-50%);max-width:calc(100vw - 32px);background:#16283f;color:white;box-shadow:0 10px 35px #12233833;border-radius:10px;padding:14px 21px;font-size:14px;z-index:20}.toast:empty{display:none}.return{display:none;background:#b8073b;color:white;border:1px solid #ffffff88;box-shadow:0 5px 25px #19293d40;border-radius:10px;padding:13px 18px;align-items:center;gap:9px;font-weight:600;font-size:15px}:host([data-native]){inset:auto 20px 20px auto;height:auto;width:auto}.app[hidden]{display:none}:host([data-native]) .return{display:flex}.process-select{margin:0 0 20px;display:flex;align-items:center;gap:10px;font-size:14px}.process-select select{max-width:100%;border:1px solid #d8e0eb;background:white;padding:10px;border-radius:7px}.spinning{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.spinning{animation:none}}@media(min-width:1600px){.main{padding-top:45px}}@media(max-width:1100px){.side{padding:28px 12px}.app{grid-template-columns:206px minmax(0,1fr)}.main{padding:28px 26px}.topbar{padding:0 26px}.columns{grid-template-columns:minmax(0,1fr)}.stat{padding:19px}.stat-value{font-size:22px}.status-title{font-size:25px}.step-label{font-size:13px}.status-card{padding:25px 24px 0}.card-footer{margin:0 -24px;padding:13px 24px}}@media(max-width:760px){:host{font-size:16px}.app{display:block}.side{height:auto;min-height:0;position:sticky;z-index:5;padding:15px 18px 0}.brand{font-size:19px;padding:0}.brand-mark{width:32px;height:32px;border-radius:9px}.side .eyebrow,.side-bottom{display:none}.nav{display:flex;margin-top:14px;gap:5px}.nav button{flex:1;justify-content:center;gap:6px;padding:12px 8px;border-radius:8px 8px 0 0;font-size:13px}.nav .icon{width:18px;height:18px}.nav .count{display:none}.topbar{height:54px;padding:0 20px}.user{font-size:13px}.avatar{width:28px;height:28px;font-size:10px}.breadcrumb{font-size:12px}.main{padding:26px 19px 25px}h1{font-size:27px}.heading{align-items:start;gap:12px;margin-bottom:22px;flex-wrap:wrap}.heading p{font-size:14px}.heading>.btn{min-height:39px;padding:8px 11px;font-size:13px}.status-card{padding:22px 21px 0}.status-top{display:block}.status-top .badge{margin-top:14px}.status-title{font-size:24px}.status-detail{font-size:14px}.steps{grid-template-columns:1fr;margin-top:25px;padding-bottom:6px}.step{display:grid;grid-template-columns:34px 1fr;gap:0 13px;min-height:59px;padding:0 0 15px}.step-number{grid-row:span 2;margin:0}.step:not(:last-child):before{left:16px;top:34px;bottom:0;right:auto;width:2px;height:auto}.step-label{max-width:none;font-size:14px;padding-top:0;align-self:end}.step-meta{margin-top:0;font-size:12px}.card-footer{margin:0 -21px;flex-wrap:wrap;gap:6px;padding:12px 21px;font-size:12px}.stats{gap:10px;margin:15px 0 20px;grid-template-columns:1fr 1fr}.stat{padding:17px}.stat:first-child{grid-column:1/-1}.stat:first-child .stat-value{font-size:28px}.stat-value{font-size:21px;margin-top:8px}.stat-caption{font-size:12px}.columns{gap:18px}.panel-head{padding:20px 19px 15px}.panel-head h2{font-size:17px}.doc-preview,.details{padding-left:19px;padding-right:19px}.detail{gap:12px;font-size:13px}.preview-row{gap:11px}.preview-info strong{font-size:14px}.footnote{align-items:start;font-size:12px}.toolbar{align-items:stretch;flex-wrap:wrap}.search{max-width:none;flex-basis:100%}.doc-row{grid-template-columns:36px minmax(0,1fr) 44px;gap:12px;padding:19px}.doc-row .file-icon{width:36px;height:41px}.doc-row h3{font-size:14px}.doc-row .doc-date{grid-column:2;grid-row:2;font-size:12px;margin-top:-7px}.doc-row .btn{grid-column:3;grid-row:1/3;width:42px;padding:10px}.doc-row .btn span{display:none}.history-row{grid-template-columns:1fr;gap:7px}.mobile-original{display:inline-flex!important}.source .icon{display:none}.history-list{padding:0 20px}}.mobile-original{display:none;background:none;color:#6e7890;font-size:12px;padding:0}.no-scroll{overflow:hidden}
  `;
  shadow.append(style);
  const layoutFix=document.createElement('style');
  layoutFix.textContent=':host{background:#f4f6fa;z-index:2147483647}.root{height:100%}:host([data-native]){background:transparent}:host([data-native]) .root{height:auto}';
  shadow.append(layoutFix);
  const container = document.createElement('div');
  container.className='root';
  shadow.append(container);
  const toast = document.createElement('div');
  toast.className = 'toast'; toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite');
  shadow.append(toast);
  document.body.append(host);
  let toastTimer, updateTimer, syncTimer;

  function notify(message) { toast.textContent = message; clearTimeout(toastTimer); toastTimer = setTimeout(() => {toast.textContent='';}, 4500); }
  function setNative(native) {
    host.toggleAttribute('data-native', native);
    const app = shadow.querySelector('.app'); if (app) app.hidden=native;
    if (native) {
      originalOverflow.forEach(({element,value,priority})=>{if(value) element.style.setProperty('overflow',value,priority);else element.style.removeProperty('overflow');});
      inertNodes.forEach((old,node)=>{if(node.isConnected) node.inert=old;});
      inertNodes.clear(); document.title=originalTitle;
    } else {
      originalOverflow.forEach(({element})=>element.style.setProperty('overflow','hidden','important'));
      [...document.body.children].filter(e=>e!==host && !['SCRIPT','STYLE','LINK'].includes(e.tagName)).forEach(e=>{
        if(!inertNodes.has(e)) inertNodes.set(e,e.inert); e.inert=true;
      });
      document.title='Meu crédito | Acompanhamento';
    }
  }
  function processes() {
    return [...document.querySelectorAll('#dt_basic tbody tr')].filter(r=>r.cells.length>=6 && r.cells[0].querySelector('a')).map(r=>({
      name:text(r.cells[0]),proposal:text(r.cells[1]),date:text(r.cells[2]),operation:text(r.cells[3]),term:text(r.cells[4]),amount:text(r.cells[5]),contract:text(r.cells[6]),regional:text(r.cells[7]),director:text(r.cells[8]),agency:text(r.cells[10]),action:r.cells[0].querySelector('a')
    }));
  }
  function actionKeys(action) {
    const call=action?.getAttribute('onclick')?.match(/fu_seleciona\(([^)]*)\)/)?.[1];
    const args=[...(call||'').matchAll(/'([^']*)'/g)].map(m=>m[1]);
    return {financing:args[3],situation:args[2]};
  }
  function availableAction(selector) {
    const el=find(selector);
    if(!el || el.getAttribute('aria-disabled')==='true' || el.disabled) return null;
    if(el.hidden || getComputedStyle(el).display==='none' || find('#span_ControleUploadIncluir')?.value==='0') return null;
    return el;
  }
  function documents() {
    return state.docsReady?state.docSnapshot:[];
  }
  function captureDocuments() {
    return [...document.querySelectorAll('#dt_anexo tbody tr')].filter(r=>r.cells.length>=5).map((r,i)=>({
      index:i,date:text(r.cells[0]),type:text(r.cells[2]),description:text(r.cells[3]).replace(/^Documento Agrupado Atraves do Portal:\s*/i,''),action:r.cells[4].querySelector('a[onclick],a[href],button')
    }));
  }
  function history() {
    return state.historyReady && find('#span_VisualizaHistoricos')?.value === '1'?state.historySnapshot:[];
  }
  function captureHistory() {
    if(find('#span_VisualizaHistoricos')?.value !== '1') return [];
    return [...document.querySelectorAll('#tableHistorico tbody tr')].filter(r=>r.cells.length>=3).map(r=>({date:text(r.cells[0]),description:text(r.cells[r.cells.length-2]),person:text(r.cells[r.cells.length-1])}));
  }
  function stageNumber() {
    for(let i=1;i<=6;i++) if(find(`#div${i}Bola img`)?.getAttribute('src')?.includes('_vermelho')) return i;
    if([...Array(6)].every((_,i)=>find(`#div${i+1}Bola img`)?.getAttribute('src')?.includes('_azul'))) return 7;
    return 0;
  }
  function processKey(p) { return actionKeys(p?.action).financing || p?.proposal; }
  function current() { const list=processes();return state.selectedKey?list.find(p=>processKey(p)===state.selectedKey):list[state.selected]; }
  function initials(name) { return clean(name).split(' ').filter(Boolean).filter((_,i,a)=>i===0 || i===a.length-1).map(p=>p[0]).join('').slice(0,2); }
  function docButton(doc, compact=false) {
    if (!doc.action) return '<span class="muted">Indisponível</span>';
    if (!docKeys.has(doc.action)) docKeys.set(doc.action, String(++nextDocKey));
    const key=docKeys.get(doc.action);
    docActions.set(key,{action:doc.action,proposal:current()?.proposal});
    return `<button class="${compact?'icon-btn':'btn small'}" data-doc="${key}" title="Abrir documento no portal" aria-label="Abrir ${esc(doc.description||doc.type)}">${icon('arrow')}${compact?'':'<span>Abrir</span>'}</button>`;
  }
  function detail(label,value) { return `<div class="detail"><dt>${esc(label)}</dt><dd>${esc(value||'Não informado')}</dd></div>`; }
  function empty(title,copy) { return `<div class="panel empty">${icon('file')}<h2>${esc(title)}</h2><p>${esc(copy)}</p></div>`; }
  function previewDocs(docs) {
    return `<section class="panel"><div class="panel-head"><div><h2>Documentos recentes</h2><p>${docs.length} documentos carregados no portal</p></div><button class="subtle" data-view="documents">Ver todos ${icon('chevron')}</button></div><div class="doc-preview">${docs.slice(0,3).map(d=>`<div class="preview-row"><div class="file-icon">${icon('file')}</div><div class="preview-info"><strong>${esc(d.description||d.type)}</strong><small>${esc(d.date)}</small></div>${docButton(d,true)}</div>`).join('') || '<p class="muted" style="padding:15px 0 24px">Nenhum documento disponível nesta consulta.</p>'}</div></section>`;
  }
  function overview(p,docs) {
    const stage = find('#span_VisualizaFases')?.value==='0' ? 0 : state.stage;
    const known=stage>0, finished=stage===7;
    return `<section class="panel status-card" aria-label="Andamento do financiamento"><div class="status-top"><div><p class="eyebrow">${known?finished?'Fluxo do portal concluído':`Etapa ${stage} de 6`:'Acompanhamento'}</p><h2 class="status-title">${known?esc(labels[Math.min(stage,6)-1]):'Selecione sua proposta'}</h2><p class="status-detail">${esc(state.status || (known?'Etapa indicada pelo portal nesta consulta.':'Abra a proposta para consultar as etapas e os documentos.'))}</p></div>${known?`<span class="badge">${icon(finished?'check':'time')}${finished?'Concluído':'Em andamento'}</span>`:''}</div><ol class="steps">${labels.map((label,i)=>`<li class="step ${known&&i+1<stage?'done':i+1===stage?'current':''}" ${i+1===stage?'aria-current="step"':''}><span class="step-number">${known&&i+1<stage?icon('check'):i+1}</span><span class="step-label">${esc(label)}</span><span class="step-meta">${known?(i+1<stage?'Etapa anterior':i+1===stage?'Etapa atual':'Próxima etapa'):'A consultar'}</span></li>`).join('')}</ol><div class="card-footer"><span class="source">${icon('shield')}Consulta na sua sessão Funchal</span><span>${state.busy?'Atualizando…':state.updated?`Consultado às ${state.updated.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}`:'Dados carregados pelo portal'}</span></div></section>
    <section class="stats" aria-label="Resumo da proposta"><div class="panel stat"><p class="stat-label">Valor do financiamento ${icon('home')}</p><p class="stat-value">${esc(currencyFallback(p.amount))}</p><p class="stat-caption">Valor informado na proposta</p></div><div class="panel stat"><p class="stat-label">Prazo ${icon('time')}</p><p class="stat-value">${esc(p.term||'—')} <span style="font-size:15px;letter-spacing:0;font-weight:400">${p.term?'meses':''}</span></p><p class="stat-caption">${/^\d+$/.test(p.term)&&Number(p.term)%12===0?Number(p.term)/12+' anos de financiamento':'Prazo da proposta'}</p></div><div class="panel stat"><p class="stat-label">Data do protocolo ${icon('file')}</p><p class="stat-value">${esc(p.date||'—')}</p><p class="stat-caption">Início registrado no portal</p></div></section>
    <div class="columns">${previewDocs(docs)}<section class="panel"><div class="panel-head"><h2>Sua proposta</h2>${icon('info')}</div><dl class="details">${detail('Número',p.proposal)}${detail('Titular',p.name)}${detail('Operação',p.operation)}${detail('Agência',p.agency)}${detail('Contrato',p.contract)}</dl></section></div>`;
  }
  function docRows(docs) {
    const q=state.query.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const filtered=docs.filter(d=>(d.description+' '+d.type+' '+d.date).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().includes(q));
    return filtered.length?`<div class="panel doc-list">${filtered.map(d=>`<article class="doc-row"><div class="file-icon">${icon('file')}</div><div><h3>${esc(d.description||d.type||'Documento')}</h3><p>Tipo no portal: ${esc(d.type||'Não informado')}</p></div><time class="doc-date">${esc(d.date)}</time>${docButton(d)}</article>`).join('')}</div>`:empty(state.query?'Nenhum documento encontrado':'Nenhum documento disponível',state.query?'Tente outro nome, tipo ou data.':'O portal não retornou documentos nesta consulta.');
  }
  function documentsView(docs) {
    return `<div class="toolbar"><label class="search">${icon('search')}<input type="search" aria-label="Buscar documentos" placeholder="Buscar por nome, tipo ou data" value="${esc(state.query)}"></label>${availableAction('a[href="AnexarDocumentacaoProcesso.aspx"]')?`<button class="btn" data-native-page="AnexarDocumentacaoProcesso.aspx">${icon('upload')}Anexar no portal ${icon('arrow')}</button>`:''}</div><div id="doc-results" aria-live="polite">${state.busy?empty('Atualizando documentos','Consultando os documentos desta proposta no portal.'):docRows(docs)}</div>`;
  }
  function historyView() {
    const rows=history();
    return rows.length?`<div class="panel history-list">${rows.map(r=>`<article class="history-row"><time>${esc(r.date)}</time><div><p>${esc(r.description)}</p><small>${esc(r.person)}</small></div></article>`).join('')}</div>`:empty('Histórico não disponibilizado','O portal não disponibilizou registros de atendimento para esta sessão. O andamento disponível está na visão geral.');
  }
  function render() {
    const list=processes(), p=current(), docs=documents();
    if(p) state.selected=list.findIndex(item=>processKey(item)===processKey(p));
    docActions.clear();
    const title=state.view==='overview'?'Meu financiamento':state.view==='documents'?'Meus documentos':'Histórico de atendimento';
    const name=p?.name || 'Minha conta';
    const firstName=name==='Minha conta'?name:name.split(' ')[0].toLocaleLowerCase('pt-BR').replace(/^./, c=>c.toLocaleUpperCase('pt-BR'));
    const active=shadow.activeElement;
    const focus=active?.getAttribute('data-view');
    const searchFocus=active?.type==='search' ? {start:active.selectionStart,end:active.selectionEnd}:null;
    const refreshFocus=active?.hasAttribute('data-refresh');
    const selectFocus=active?.tagName==='SELECT';
    container.innerHTML=`<div class="app"><aside class="side"><div class="brand"><span class="brand-mark">${icon('home')}</span>meu crédito</div><p class="eyebrow">Seu financiamento</p><nav class="nav" aria-label="Navegação do acompanhamento">${[['overview','grid','Visão geral'],['documents','file','Documentos'],['history','time','Histórico']].map(([view,i,label])=>`<button data-view="${view}" class="${state.view===view?'active':''}" ${state.view===view?'aria-current="page"':''}>${icon(i)}${label}${view==='documents'?`<span class="count">${docs.length}</span>`:''}</button>`).join('')}</nav><div class="side-bottom"><div class="private">${icon('shield')}Visualização pessoal</div><p>Crédito imobiliário Bradesco<br>Dados do Portal Funchal</p><button class="original" data-native>Visual original ${icon('arrow')}</button></div></aside><div class="workspace"><header class="topbar"><div class="breadcrumb">Crédito imobiliário ${icon('chevron')} <span>${esc(state.view==='overview'?'Acompanhamento':state.view==='documents'?'Documentos':'Histórico')}</span></div><div class="user"><span class="avatar">${esc(initials(name))}</span><span>${esc(firstName)}</span></div></header><main class="main"><div class="heading"><div><h1>${title}</h1><p>${p?`Proposta ${esc(p.proposal)} · Bradesco`:'Aguardando o carregamento da sua proposta'}</p></div><button class="btn" data-refresh ${state.busy?'disabled':''}>${icon('refresh',state.busy?'spinning':'')} ${state.busy?'Atualizando…':'Atualizar acompanhamento'}</button></div>${list.length>1?`<label class="process-select">Proposta <select aria-label="Selecionar proposta">${list.map((l,i)=>`<option value="${i}" ${state.selected===i?'selected':''}>${esc(l.proposal)} — ${esc(l.name)}</option>`).join('')}</select></label>`:''}${state.error?`<div class="notice" role="alert">${icon('info')}<span>${esc(state.error)}</span></div>`:''}${p?(state.view==='overview'?overview(p,docs):state.view==='documents'?documentsView(docs):historyView()):empty('Sua proposta ainda não carregou','Use Atualizar acompanhamento ou consulte o visual original do portal.')}<footer class="footnote">${icon('shield')}<span>Informações exibidas a partir do portal. Esta visualização não altera sua contratação.</span><button class="mobile-original" data-native>Visual original</button></footer></main></div></div><button class="return" data-return>${icon('home')}Voltar ao meu crédito</button>`;
    if(host.hasAttribute('data-native')) shadow.querySelector('.app').hidden=true;
    if(state.view==='overview' && !state.stage){
      const titleEl=shadow.querySelector('.status-title'), detailEl=shadow.querySelector('.status-detail');
      if(titleEl) titleEl.textContent=state.busy?'Consultando andamento':'Andamento não disponibilizado';
      if(detailEl) detailEl.textContent=state.busy?'Aguardando a resposta do portal para esta proposta.':'Use Atualizar acompanhamento para consultar o estado desta proposta.';
    }
    if(focus) shadow.querySelector(`.nav [data-view="${focus}"]`)?.focus({preventScroll:true});
    if(searchFocus){const input=shadow.querySelector('input[type="search"]');input?.focus({preventScroll:true});input?.setSelectionRange(searchFocus.start,searchFocus.end);}
    if(refreshFocus && !state.busy) shadow.querySelector('[data-refresh]')?.focus({preventScroll:true});
    if(selectFocus) shadow.querySelector('select')?.focus({preventScroll:true});
    const select=shadow.querySelector('select');if(select) select.disabled=state.busy;
  }
  function finishSync() {
    if(state.pending.size) return;
    clearTimeout(syncTimer); state.busy=false; state.updated=new Date(); render();
  }
  function refresh() {
    const p=current();
    if(!p?.action?.isConnected) { setNative(true); notify('Selecione a proposta no portal para continuar.'); return; }
    if(state.busy) return;
    state.selectedKey=processKey(p);
    beginSync();
    initiating=true;
    try{p.action.click();}finally{initiating=false;}
  }
  function beginSync() {
    generation++;
    state.busy=true; state.error=''; state.status=''; state.stage=0;
    state.docsReady=false; state.historyReady=false; state.docSnapshot=[];state.historySnapshot=[];state.updated=null; docActions.clear();
    state.pending=new Set(['WorkflowFasesJson.ashx','FinanciamentoDocumentoJson.ashx','FinanciamentoHistoricoJson.ashx']);
    render();
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>{state.busy=false;state.pending.clear();state.error='A consulta não foi concluída. Os dados exibidos podem estar desatualizados. Tente novamente ou abra o visual original.';render();},18000);
  }
  function setupBridge() {
    const jq=window.jQuery;
    if(!jq?.fn?.on) return false;
    jq(document).off('.meuCredito');
    jq(document).on('ajaxSend.meuCredito',(_event,xhr,settings)=>{
      let data;try{data=typeof settings.data==='string'?JSON.parse(settings.data):settings.data;}catch{return;}
      const keys=actionKeys(current()?.action);
      if((keys.financing && data?.FinanciamentoID===keys.financing) || (keys.situation && data?.SituacaoID===keys.situation)) requestGenerations.set(xhr,generation);
    });
    jq(document).on('ajaxSuccess.meuCredito',(_event,xhr,settings,data)=>{
      let endpoint;
      try{endpoint=new URL(settings.url,location.href).pathname.split('/').pop();}catch{return;}
      if(!['WorkflowFasesJson.ashx','FinanciamentoDocumentoJson.ashx','FinanciamentoHistoricoJson.ashx'].includes(endpoint)) return;
      if(requestGenerations.get(xhr)!==generation) return;
      const payload=data??xhr.responseJSON;
      if(payload?.error || payload?.sessionExpired){state.error='O portal não autorizou a consulta ou a sessão expirou. Abra o visual original para entrar novamente.';state.busy=false;state.pending.clear();clearTimeout(syncTimer);render();return;}
      if(!Array.isArray(payload)){state.error='O portal retornou uma resposta inesperada. Abra o visual original para conferir a sessão.';state.busy=false;state.pending.clear();clearTimeout(syncTimer);render();return;}
      if(endpoint==='FinanciamentoDocumentoJson.ashx') {state.docSnapshot=captureDocuments();state.docsReady=true;}
      if(endpoint==='FinanciamentoHistoricoJson.ashx') {state.historySnapshot=captureHistory();state.historyReady=true;}
      if(endpoint==='WorkflowFasesJson.ashx' && Array.isArray(payload)) {
        state.stage=Number(payload[0]?.NumeroFase)||0;
        state.status=clean(payload[0]?.WorkflowFasesDescricao);
      }
      if(state.busy){state.pending.delete(endpoint);finishSync();} else render();
    });
    jq(document).on('ajaxError.meuCredito',(_event,_xhr,settings)=>{
      let endpoint;try{endpoint=new URL(settings.url,location.href).pathname.split('/').pop();}catch{return;}
      if(requestGenerations.get(_xhr)===generation && state.pending.has(endpoint)){state.pending.delete(endpoint);state.error='Parte dos dados não pôde ser atualizada. Tente novamente ou consulte o visual original.';finishSync();}
    });
    return true;
  }
  shadow.addEventListener('click',event=>{
    const btn=event.target.closest('button'); if(!btn) return;
    if(btn.hasAttribute('data-view')){state.view=btn.dataset.view;render();shadow.querySelector(`.nav [data-view="${state.view}"]`)?.focus({preventScroll:true});shadow.querySelector('.app').scrollTop=0;}
    else if(btn.hasAttribute('data-refresh')) refresh();
    else if(btn.hasAttribute('data-native')) {setNative(true);shadow.querySelector('.return')?.focus();}
    else if(btn.hasAttribute('data-return')) {setNative(false);shadow.querySelector('.nav button')?.focus();}
    else if(btn.hasAttribute('data-doc')) {
      const d=docActions.get(btn.dataset.doc);
      if(!state.busy && state.docsReady && d?.action?.isConnected && d.proposal===current()?.proposal) {d.action.click();notify('Documento solicitado ao portal. A abertura usa uma nova janela.');}
      else notify('O documento mudou. Atualize o acompanhamento.');
    } else if(btn.hasAttribute('data-native-page')) {
      const link=[...document.querySelectorAll('a[href]')].find(a=>a.getAttribute('href')===btn.dataset.nativePage);
      if(link){setNative(true);link.click();}
    }
  });
  shadow.addEventListener('input',event=>{
    if(event.target.type!=='search') return;
    state.query=event.target.value;
    docActions.clear();
    const results=shadow.querySelector('#doc-results'); if(results && !state.busy) results.innerHTML=docRows(documents());
  });
  shadow.addEventListener('change',event=>{
    if(event.target.tagName==='SELECT' && !state.busy){state.selected=Number(event.target.value);state.selectedKey=processKey(processes()[state.selected]);state.query='';refresh();}
  });
  document.addEventListener('click',event=>{
    if(initiating) return;
    const action=event.target.closest?.('#dt_basic tbody a');
    if(!action) return;
    const index=processes().findIndex(p=>p.action===action);
    if(index>=0){state.selected=index;state.selectedKey=processKey(processes()[index]);state.query='';state.selectedOnce=true;beginSync();}
  },true);
  let lastFingerprint='';
  const observer=new MutationObserver(records=>{
    if(records.every(r=>r.target===host || host.contains(r.target))) return;
    clearTimeout(updateTimer);
    updateTimer=setTimeout(()=>{
      const fingerprint=[find('#dt_basic')?.textContent,find('#dt_anexo')?.textContent,find('#tableHistorico')?.textContent,stageNumber()].join('|');
      if(fingerprint===lastFingerprint) return;
      lastFingerprint=fingerprint;
      if(!state.selectedOnce && processes().length===1){state.selectedOnce=true;setupBridge();refresh();} else render();
    },180);
  });
  observer.observe(document.body,{subtree:true,childList:true,characterData:true});
  render();setNative(false);setupBridge();
  if(processes().length===1){state.selectedOnce=true;refresh();}
})();
