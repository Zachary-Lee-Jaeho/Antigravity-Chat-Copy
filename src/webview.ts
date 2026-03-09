/**
 * Returns the full HTML for the webview SPA.
 * Views: list → detail → step-detail, with ← back navigation.
 */
export function getWebviewHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:var(--vscode-editor-background);
  --bg2:var(--vscode-editor-inactiveSelectionBackground);
  --hover:var(--vscode-list-hoverBackground);
  --fg:var(--vscode-foreground);
  --fg2:var(--vscode-descriptionForeground,#999);
  --fg3:color-mix(in srgb,var(--fg) 40%,transparent);
  --brd:var(--vscode-editorWidget-border,#2e2e2e);
  --brd2:color-mix(in srgb,var(--brd) 50%,transparent);
  --ac:var(--vscode-textLink-foreground,#2dd4bf);
  --ac2:color-mix(in srgb,var(--ac) 12%,var(--bg));
  --ac3:color-mix(in srgb,var(--ac) 30%,var(--brd));
  --focus:var(--vscode-focusBorder);
  --err:var(--vscode-errorForeground,#f87171);
  --ok:#34d399;--warn:#fbbf24;
  --bbg:var(--vscode-button-background);--bfg:var(--vscode-button-foreground);
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s8:48px;
  --r:8px;--r2:5px;
  --font:-apple-system,'Segoe UI',system-ui,Roboto,sans-serif;
  --mono:'Cascadia Code','Fira Code','JetBrains Mono',monospace;
}
html,body{height:100%;font:14px/1.5 var(--font);color:var(--fg);background:var(--bg);overflow:hidden;-webkit-font-smoothing:antialiased}

/* Shell */
#app{display:flex;flex-direction:column;height:100vh}
.top{display:flex;align-items:center;gap:var(--s3);padding:var(--s3) var(--s5);border-bottom:1px solid var(--brd);min-height:52px;flex-shrink:0;background:var(--bg)}
.top h1{font-size:16px;font-weight:700;letter-spacing:-.02em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.ibtn{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;border:none;border-radius:var(--r2);background:0;color:var(--fg);cursor:pointer;font-size:16px;transition:background .12s;flex-shrink:0}
.ibtn:hover{background:var(--hover)}
.ibtn:active{transform:scale(.92)}
.bbtn{display:inline-flex;align-items:center;gap:var(--s1);padding:var(--s1) var(--s2);border:none;border-radius:var(--r2);background:0;color:var(--fg2);cursor:pointer;font-size:13px;font-weight:500;transition:all .12s;flex-shrink:0}
.bbtn:hover{color:var(--fg);background:var(--hover)}
.view{flex:1;overflow-y:auto;overflow-x:hidden;scroll-behavior:smooth}

/* Toolbar */
.tb{display:flex;align-items:center;gap:var(--s2);padding:var(--s2) var(--s5);border-bottom:1px solid var(--brd2);flex-shrink:0}
.tb input{flex:1;padding:var(--s2) var(--s3);border:1px solid var(--brd);border-radius:var(--r);background:var(--bg2);color:var(--fg);font-size:13px;outline:0;transition:border-color .15s,box-shadow .15s}
.tb input:focus{border-color:var(--ac);box-shadow:0 0 0 2px var(--ac2)}
.tb input::placeholder{color:var(--fg3)}
.pill{display:inline-flex;align-items:center;gap:var(--s1);padding:var(--s1) var(--s3);border:1px solid var(--brd);border-radius:20px;background:var(--bg2);color:var(--fg2);cursor:pointer;font-size:12px;font-weight:500;white-space:nowrap;transition:all .12s}
.pill:hover{color:var(--fg);background:var(--hover);border-color:var(--ac3)}

/* Conv list */
.cl{padding:var(--s2) var(--s3)}
.ci{display:flex;align-items:center;gap:var(--s4);padding:var(--s3) var(--s4);margin:var(--s1) 0;cursor:pointer;border-radius:var(--r);transition:background .1s}
.ci:hover{background:var(--hover)}
.ci:focus-visible{outline:2px solid var(--focus);outline-offset:-2px}
.ci-i{width:36px;height:36px;border-radius:var(--r);background:var(--ac2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0}
.ci-b{flex:1;min-width:0}
.ci-t{font-size:14px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3}
.ci-m{font-size:12px;color:var(--fg2);margin-top:2px}
.ci-a{color:var(--fg3);font-size:14px;flex-shrink:0}

/* Messages */
.ml{padding:var(--s4) var(--s5) var(--s8)}
.mt{display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s4);padding-bottom:var(--s3);border-bottom:1px solid var(--brd2)}
.mt .st{font-size:12px;color:var(--fg2)}
.m{margin:var(--s3) 0;padding:var(--s4);border-radius:var(--r);border:1px solid var(--brd2);transition:border-color .15s}
.m:hover{border-color:var(--brd)}
.m.u{background:var(--ac2);border-color:var(--ac3)}
.m.a{background:var(--bg)}
.mh{display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s3)}
.mr{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600}
.mr .e{font-size:16px}.mr .l{text-transform:uppercase;letter-spacing:.6px;opacity:.6}
.ma{display:flex;gap:6px}
.ab{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border:1px solid var(--brd);border-radius:var(--r2);background:0;color:var(--fg2);cursor:pointer;font-size:12px;font-weight:500;transition:all .12s}
.ab:hover{color:var(--fg);background:var(--hover);border-color:var(--ac3)}
.ab:active{transform:scale(.96)}
.ab.p{background:var(--bbg);color:var(--bfg);border-color:var(--bbg)}
.ab.p:hover{opacity:.85}
.mc{white-space:pre-wrap;word-wrap:break-word;font-size:14px;line-height:1.7}

/* Step detail */
.sl{padding:var(--s4) var(--s5) var(--s8)}
.si{font-size:12px;font-weight:500;color:var(--fg2);margin-bottom:var(--s3);padding:0 var(--s1)}
.sc{margin:6px 0;border:1px solid var(--brd2);border-radius:var(--r);overflow:hidden;transition:border-color .12s}
.sc:hover{border-color:var(--brd)}
.sh{display:flex;align-items:center;gap:var(--s2);padding:var(--s3) var(--s4);cursor:pointer;user-select:none;font-size:13px;transition:background .1s}
.sh:hover{background:var(--hover)}
.sv{font-size:10px;transition:transform .15s;opacity:.35;width:14px;text-align:center;flex-shrink:0}
.sv.o{transform:rotate(90deg);opacity:.6}
.se{font-size:16px;flex-shrink:0}
.sn{flex:1;font-weight:500}
.sx{font-size:11px;opacity:.25;font-family:var(--mono)}
.sp{padding:2px 8px;border:1px solid var(--brd);border-radius:var(--r2);background:0;color:var(--fg2);cursor:pointer;font-size:11px;transition:all .12s}
.sp:hover{color:var(--fg);background:var(--hover)}
.sb{padding:var(--s3) var(--s4);border-top:1px solid var(--brd2);font-size:13px;line-height:1.6;max-height:500px;overflow-y:auto;background:color-mix(in srgb,var(--bg2) 50%,var(--bg))}
.sb pre{white-space:pre-wrap;word-wrap:break-word;font:12px var(--mono);margin:0}

/* States */
.es,.ls,.xs{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:var(--s4);padding:var(--s8);text-align:center}
.si2{font-size:40px;opacity:.35}
.st2{font-size:16px;font-weight:600;opacity:.7}
.st3{font-size:13px;color:var(--fg2);max-width:320px;line-height:1.5}
.rb{margin-top:var(--s2);padding:var(--s2) var(--s5);border:none;border-radius:var(--r);background:var(--bbg);color:var(--bfg);cursor:pointer;font-size:13px;font-weight:500;transition:opacity .12s}
.rb:hover{opacity:.85}
@keyframes spin{to{transform:rotate(360deg)}}
.sp2{width:28px;height:28px;border:2.5px solid var(--brd);border-top-color:var(--ac);border-radius:50%;animation:spin .7s linear infinite}
.bar{display:flex;align-items:center;gap:var(--s2);padding:6px var(--s5);border-top:1px solid var(--brd2);font-size:11px;color:var(--fg2);flex-shrink:0}
.dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.dot.ok{background:var(--ok)}.dot.err{background:var(--err)}.dot.ld{background:var(--warn);animation:pulse 1.5s ease infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
.toast{position:fixed;bottom:56px;left:50%;transform:translateX(-50%) translateY(12px);padding:var(--s2) var(--s5);border-radius:var(--r);background:var(--ac);color:#000;font-size:13px;font-weight:600;opacity:0;transition:all .25s;pointer-events:none;z-index:100;box-shadow:0 1px 3px rgba(0,0,0,.18)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:0}::-webkit-scrollbar-thumb{background:var(--brd);border-radius:3px}::-webkit-scrollbar-thumb:hover{background:var(--fg3)}
</style>
</head>
<body>
<div id="app">
  <div class="top" id="top"><h1 id="title">Chat Copy</h1><button class="ibtn" onclick="reload()" title="Reload">⟳</button></div>
  <div id="tb"></div>
  <div class="view" id="v"></div>
  <div class="bar"><div class="dot ld" id="dot"></div><span id="stat">Connecting…</span></div>
</div>
<div class="toast" id="toast"></div>
<script>
const vs=acquireVsCodeApi();
let S={view:'list',convs:[],conv:null,msgs:[],q:'',asc:false,di:null};
vs.postMessage({type:'init'});

window.addEventListener('message',e=>{
  const d=e.data;
  switch(d.type){
    case'conversations':S.convs=d.conversations||[];
      stat(d.loading?'ld':'ok',d.loading?'Loading…':S.convs.length+' conversations');
      if(S.view==='list')list();break;
    case'conversationLoading':loading('Loading conversation…');break;
    case'conversation':S.conv={id:d.id,title:d.title};S.msgs=d.messages;S.hint=d.statusHint||'';S.view='detail';S.di=null;detail();break;
    case'error':error(d.message);stat('err',d.message);break;
    case'copied':toast('✓ Copied to clipboard');break;
    case'refresh':vs.postMessage({type:'init'});break;
  }
});

function list(){
  S.view='list';S.di=null;
  $('top').innerHTML='<h1 id="title">Chat Copy</h1><button class="ibtn" onclick="reload()" title="Reload">⟳</button>';
  $('tb').innerHTML='<div class="tb"><input type="text" placeholder="Search…" value="'+h(S.q)+'" oninput="search(this.value)"><button class="pill" onclick="sort()">'+(S.asc?'↑ Oldest':'↓ Newest')+'</button></div>';
  let c=S.convs;
  if(S.q){const q=S.q.toLowerCase();c=c.filter(x=>(x.title||'').toLowerCase().includes(q)||x.id.includes(q))}
  c=[...c].sort((a,b)=>S.asc?a.mtime-b.mtime:b.mtime-a.mtime);
  if(!c.length){$('v').innerHTML='<div class="es"><div class="si2">💬</div><div class="st2">'+(S.q?'No matches':'No conversations')+'</div><div class="st3">'+(S.q?'Try different keywords':'No conversations in this workspace')+'</div></div>';return}
  let o='<div class="cl">';
  c.forEach(x=>{const d=new Date(x.mtime),ds=d.toLocaleDateString('ko-KR',{month:'short',day:'numeric'})+' '+d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    o+='<div class="ci" tabindex="0" onclick="load(\\''+x.id+'\\')\" onkeydown="if(event.key===\\'Enter\\')load(\\''+x.id+'\\')">'
      +'<div class="ci-i">💬</div><div class="ci-b"><div class="ci-t">'+h(x.title||x.id.substring(0,16)+'…')+'</div><div class="ci-m">'+ds+' · '+x.id.substring(0,8)+'</div></div><div class="ci-a">›</div></div>'});
  $('v').innerHTML=o+'</div>';
}

function detail(){
  $('top').innerHTML='<button class="bbtn" onclick="back()">← Back</button><h1 id="title">'+h(S.conv?.title||'')+'</h1><button class="ibtn" onclick="reloadConv()" title="Reload">⟳</button>';
  $('tb').innerHTML='';
  const m=S.msgs;
  if(!m||!m.length){$('v').innerHTML='<div class="es"><div class="si2">📭</div><div class="st2">Empty</div></div>';return}
  let o='<div class="ml"><div class="mt"><span class="st">👤 '+m.filter(x=>x.role==='user').length+' user · 🤖 '+m.filter(x=>x.role==='assistant').length+' assistant</span><button class="ab p" onclick="cpAll()">📋 Copy All</button></div>';
  m.forEach((x,i)=>{const u=x.role==='user',c=u?'u':'a',em=u?'👤':'🤖',lb=u?'User':'Assistant';
    const det=!u&&x.detailSteps?.length?'<button class="ab" onclick="steps('+i+')">🔍 Details</button>':'';
    o+='<div class="m '+c+'"><div class="mh"><span class="mr"><span class="e">'+em+'</span><span class="l">'+lb+'</span></span><div class="ma">'+det+'<button class="ab" onclick="cp('+i+')">📋 Copy</button></div></div><div class="mc">'+h(x.content)+'</div></div>'});
  $('v').innerHTML=o+'</div>';$('v').scrollTop=0;stat(S.hint?'warn':'ok',m.length+' messages'+(S.hint?' '+S.hint:''));
}

function steps(i){
  S.di=i;const m=S.msgs[i];if(!m?.detailSteps)return;const s=m.detailSteps;
  $('top').innerHTML='<button class="bbtn" onclick="backD()">← Messages</button><h1 id="title">Step Details</h1>';
  $('tb').innerHTML='';
  let o='<div class="sl"><div class="si">'+s.length+' steps</div>';
  s.forEach((x,j)=>{
    const id='s'+i+'-'+j,oc=x.defaultOpen?'o':'',bd=x.defaultOpen?'':'display:none;';
    let cnt=x.content;
    const isLong=cnt.length>2000;
    if(isLong){
        S['f_'+id]=cnt; // store full text in state
        cnt=cnt.substring(0,2000)+'<span id="m-'+id+'" style="display:none">'+h(cnt.substring(2000))+'</span><div style="margin-top:8px"><button class="ab" id="bbtn-'+id+'" onclick="tmore(event, \\''+id+'\\')">Show More</button></div>';
    } else { cnt=h(cnt); }
    
    o+='<div class="sc"><div class="sh" onclick="tog(\\''+id+'\\')"><span class="sv '+oc+'" id="c-'+id+'">▶</span><span class="se">'+x.icon+'</span><span class="sn">'+h(x.label)+'</span><span class="sx">#'+x.stepIndex+'</span><button class="sp" onclick="cptStep(event,'+i+','+j+')">📋 Copy</button></div><div class="sb" id="b-'+id+'" style="'+bd+'"><pre id="pre-'+id+'">'+cnt+'</pre></div></div>'
  });
  $('v').innerHTML=o+'</div>';$('v').scrollTop=0;stat('ok',s.length+' steps');
}

function loading(t){$('v').innerHTML='<div class="ls"><div class="sp2"></div><div class="st3">'+h(t)+'</div></div>'}
function error(t){$('v').innerHTML='<div class="xs"><div class="si2">⚠️</div><div class="st2">Something went wrong</div><div class="st3">'+h(t)+'</div><button class="rb" onclick="reload()">Try Again</button></div>'}

function load(id){vs.postMessage({type:'loadConversation',id})}
function cp(i){vs.postMessage({type:'copy',text:S.msgs[i].content})}
function cpAll(){vs.postMessage({type:'copy',text:S.msgs.map(x=>x.content).join('\\n\\n---\\n\\n')})}
function cpt(t){vs.postMessage({type:'copy',text:JSON.parse(t)})}
function cptStep(e,i,j){e.stopPropagation(); vs.postMessage({type:'copy',text:S.msgs[i].detailSteps[j].content})}
function back(){S.view='list';S.conv=null;S.msgs=[];list()}
function backD(){S.di=null;detail()}
function reload(){vs.postMessage({type:'init'})}
function reloadConv(){if(S.conv)vs.postMessage({type:'loadConversation',id:S.conv.id})}
function tog(id){const b=$('b-'+id),c=$('c-'+id);if(!b||!c)return;const o=b.style.display==='none';b.style.display=o?'':'none';c.classList.toggle('o',o)}
function tmore(e,id){e.stopPropagation();const m=$('m-'+id),b=$('bbtn-'+id);if(!m||!b)return;const o=m.style.display==='none';m.style.display=o?'':'none';b.textContent=o?'Show Less':'Show More'}
function sort(){S.asc=!S.asc;list()}
function search(q){S.q=q;list()}

function $(id){return document.getElementById(id)}
function h(t){return t?t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'):''}
function stat(s,t){$('dot').className='dot '+s;$('stat').textContent=t}
function toast(t){const e=$('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1800)}
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(S.di!==null)backD();else if(S.view==='detail')back()}});
</script>
</body>
</html>`;
}
