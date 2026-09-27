import {readCanvasState,visibleNodes,visibleEdges,recommendPath} from './graph-model.js';
import {createGraphView} from './graph-view.js';
import {playIntroOnce} from './intro.js';

const $=id=>document.getElementById(id);
const small=window.matchMedia('(max-width:767px)');
const drawerMedia=window.matchMedia('(max-width:1150px)');
let graph,state,view,networkScope='neighbors',drawerOpen=false,inspectorOpen=false,rendererUnavailable=false,lastNodeFocus=null;
const el=(tag,className,text)=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('class','canvas-icon');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href',`/canvas/icons.svg#canvas-${name}`);svg.append(use);return svg;}
const byId=id=>graph?.nodes.find(node=>node.id===id);
function safeHref(node){try{const url=new URL(node.href,location.href);if(url.origin===location.origin&&/^\/(knowledge|chapter)\//.test(url.pathname))return url.pathname+url.search+url.hash;}catch{}return `/chapter/${node.chapter}/#kp-${node.index+1}`;}
async function requestData(path){const response=await fetch(path,{cache:'no-cache'});if(!response.ok)throw new Error('课程数据暂不可用');return response.json();}
function normalizeGraph(data){
  if(!Array.isArray(data.nodes)||!data.nodes.length)throw new Error('课程目录不完整');
  const ids=new Set();const nodes=data.nodes.map(raw=>{
    const chapter=Number(raw.chapter),index=Number(raw.index),id=`${chapter}_${index}`;
    if(raw.id!==id||!Number.isInteger(chapter)||chapter<1||chapter>10||!Number.isInteger(index)||index<0||index>=(chapter===10?3:6)||ids.has(id))throw new Error('课程身份不一致');
    ids.add(id);return {...raw,id,chapter,index,title:String(raw.title),summary:String(raw.summary||''),chapterTitle:String(raw.chapterTitle||`第${chapter}章`)};
  });
  return {...data,nodes,edges:Array.isArray(data.edges)?data.edges:[]};
}
async function loadGraph(){
  try{return normalizeGraph(await requestData('/data/mind-canvas.json'));}catch{
    const universe=await requestData('/data/knowledge-universe.json');if(!Array.isArray(universe.galaxies)||!universe.galaxies.length)throw new Error('课程目录暂时无法载入');
    const nodes=universe.galaxies.flatMap(group=>(group.stars||[]).map((point,ordinal)=>{const chapter=Number(group.chapter),index=Number(point.index??ordinal);const template=document.createElement('template');template.innerHTML=String(point.desc||'');for(const unsafe of template.content.querySelectorAll('script,style'))unsafe.remove();const text=template.content.textContent.trim();return {id:`${chapter}_${index}`,chapter,index,title:String(point.title||''),chapterTitle:String(group.name||`第${chapter}章`),summary:text.length>240?text.slice(0,240)+'…':text,href:`/chapter/${chapter}/#kp-${index+1}`};}));
    return normalizeGraph({schemaVersion:'1.0.0',sourceSnapshot:'catalogue-fallback',reviewState:'not-run',catalogueFallback:true,nodes,edges:[]});
  }
}
function announce(text){$('canvas-announcement').textContent=text;}
function syncUrl(){const url=new URL(location.href);url.search='';url.searchParams.set('view',state.view);if(state.anchorId)url.searchParams.set('node',state.anchorId);if(state.anchorId&&state.view==='network')url.searchParams.set('scope',state.scope);if(state.selectedId&&state.selectedId!==state.anchorId)url.searchParams.set('selected',state.selectedId);if(state.targetId)url.searchParams.set('target',state.targetId);history.replaceState(null,'',url);}
function reviewedEdges(){return visibleEdges(graph,graph.nodes.map(node=>node.id));}
function setDrawer(open,restore=false){drawerOpen=drawerMedia.matches&&open;$('canvas-chapters').hidden=drawerMedia.matches&&!drawerOpen;$('chapter-backdrop').hidden=!drawerOpen;$('chapter-toggle').setAttribute('aria-expanded',String(drawerOpen));if(restore)$('chapter-toggle').focus();}
function syncPanels(){setDrawer(drawerOpen);$('node-inspector').hidden=small.matches&&!inspectorOpen;}
function applyState(changes,{showInspector=false}={}){
  state={...state,...changes};if(state.view==='local')state.scope='neighbors';
  if(state.view==='network'&&state.anchorId&&state.targetId&&!visibleNodes(graph,state).includes(state.targetId))state.scope=byId(state.anchorId).chapter===byId(state.targetId).chapter?'chapter':'course';
  if(state.view==='network')networkScope=state.scope;if(showInspector)inspectorOpen=true;
  syncUrl();render();
}
function selectNode(id){if(!byId(id))return;lastNodeFocus=document.activeElement;const changes={selectedId:id};if(!state.anchorId)Object.assign(changes,{anchorId:id,view:'network',scope:'chapter'});else if(!visibleNodes(graph,state).includes(id))Object.assign(changes,{view:'network',scope:byId(id).chapter===byId(state.anchorId).chapter?'chapter':'course'});applyState(changes,{showInspector:true});$('node-inspector').scrollTop=0;if(lastNodeFocus?.tagName==='BUTTON'&&!lastNodeFocus.isConnected)document.querySelector(`.canvas-node-choice[data-node="${id}"]`)?.focus({preventScroll:true});announce(`已选中${byId(id).title}`);}
function chooseChapter(chapter){const first=graph.nodes.filter(n=>n.chapter===chapter).sort((a,b)=>a.index-b.index)[0];if(!first)return;inspectorOpen=false;applyState({view:'network',scope:'chapter',anchorId:first.id,selectedId:first.id,targetId:null});$('node-inspector').scrollTop=0;setDrawer(false,drawerMedia.matches);if(!drawerMedia.matches)document.querySelector(`[data-chapter="${chapter}"]`)?.focus({preventScroll:true});announce(`已展开${first.chapterTitle}`);}
function renderChapters(){const fragment=document.createDocumentFragment();for(const chapter of [...new Set(graph.nodes.map(n=>n.chapter))].sort((a,b)=>a-b)){const nodes=graph.nodes.filter(n=>n.chapter===chapter);const button=el('button','canvas-chapter-button');button.type='button';button.dataset.chapter=chapter;button.classList.toggle('is-active',byId(state.anchorId)?.chapter===chapter);button.setAttribute('aria-pressed',String(byId(state.anchorId)?.chapter===chapter));button.append(el('span','canvas-chapter-number',String(chapter).padStart(2,'0')));const copy=el('span','canvas-chapter-name',nodes[0].chapterTitle);copy.append(el('small','canvas-chapter-count',`${nodes.length} 个知识点`));button.append(copy);button.addEventListener('click',()=>chooseChapter(chapter));fragment.append(button);}$('chapter-list').replaceChildren(fragment);}
function renderDirectory(){const ids=state.anchorId?visibleNodes(graph,state):graph.nodes.map(n=>n.id);const fragment=document.createDocumentFragment();for(const id of ids){const node=byId(id);const row=el('article','canvas-node-row');row.classList.toggle('is-selected',state.selectedId===id);const button=el('button','canvas-node-choice');button.type='button';button.dataset.node=id;button.setAttribute('aria-pressed',String(state.selectedId===id));button.append(el('span','',node.title),el('small','',`第${node.chapter}章 · 第${node.index+1}个知识点`));button.addEventListener('click',()=>selectNode(id));const link=el('a');link.href=safeHref(node);link.setAttribute('aria-label',`进入知识页：${node.title}`);link.append(icon('arrow'));row.append(button,link);fragment.append(row);}$('node-list').replaceChildren(fragment);$('directory-title').textContent=`知识点目录 · ${ids.length} 点`;}
function renderInspector(){const node=byId(state.selectedId);const body=document.createDocumentFragment();if(!node){const empty=el('div','canvas-inspector-empty');empty.append(icon('book'),el('h2','', '选择一个知识点'),el('p','','点选图谱或目录中的知识点，先看简介，再进入课程。'));body.append(empty);}else{
    body.append(el('p','canvas-node-meta',`第${node.chapter}章 · ${node.chapterTitle}`),el('h2','canvas-node-heading',node.title),el('p','canvas-node-summary',node.summary));
    const actions=el('div','canvas-node-actions');const learn=el('a','canvas-primary-link','进入知识页');learn.href=safeHref(node);learn.append(icon('arrow'));const target=el('button','canvas-button','设为目标');target.type='button';target.prepend(icon('target'));target.disabled=!state.anchorId||!reviewedEdges().length;target.addEventListener('click',()=>{applyState({targetId:node.id,view:'network',scope:networkScope},{showInspector:true});announce(`目标已设为${node.title}，范围已调整为${state.scope==='course'?'全课程':state.scope==='chapter'?'本章':'关联知识点'}`);});actions.append(learn,target);body.append(actions);
    const edges=reviewedEdges().filter(edge=>edge.source===node.id||edge.target===node.id);
    if(edges.length){body.append(el('h3','canvas-related-heading','已复核关联'));for(const edge of edges){const neighbor=byId(edge.source===node.id?edge.target:edge.source);const item=el('section','canvas-related-item');const button=el('button','',neighbor.title);button.type='button';button.addEventListener('click',()=>selectNode(neighbor.id));item.append(button,el('p','',edge.rationale));const evidence=el('details','canvas-relation-evidence');evidence.append(el('summary','','课程依据'));for(const citation of edge.evidence||[]){const source=byId(citation.nodeId);if(!source)continue;const quote=el('blockquote','',citation.quote);const sourceLink=el('a','',source.title+' ↗');sourceLink.href=safeHref(source);evidence.append(quote,sourceLink);}item.append(evidence);body.append(item);}}
  }$('inspector-body').replaceChildren(body);renderPath();
}
function renderPath(){const edges=reviewedEdges();const path=state.anchorId&&edges.length?recommendPath(graph,state.anchorId,state.targetId):[];const fragment=document.createDocumentFragment();for(let index=0;index<path.length;index++){const id=path[index],item=el('li');const button=el('button','',byId(id).title);button.type='button';button.addEventListener('click',()=>selectNode(id));item.append(button);if(index){const edge=edges.find(e=>(e.source===path[index-1]&&e.target===id)||(e.target===path[index-1]&&e.source===id));if(edge?.type==='prerequisite'&&edge.source===id)item.append(el('small','','回顾基础'));}fragment.append(item);}$('path-list').replaceChildren(fragment);$('clear-target').hidden=!state.targetId;
  let text;if(!state.anchorId)text='选择知识点作为起点，再查看关联学习顺序。';else if(!edges.length)text=graph.reviewState!=='complete'?'关联尚未完成 AI 复核，学习路径暂不可用。':'当前没有通过 AI 复核的关联，可直接进入课程。';else if(!path.length)text=state.targetId?'当前已复核的关系尚不能连接到该目标。':'该知识点暂没有可连接的建议路径。';else if(path.length===1)text='目标就是当前起点，可选择其他关联知识点。';else text=state.targetId?`目标：${byId(state.targetId).title} · ${path.length} 个知识点`:`从当前起点出发 · ${path.length} 个关联知识点`;
  $('path-status').textContent=text;
}
function render(){
  const targetHadFocus=document.activeElement?.matches('#inspector-body .canvas-node-actions button');
  const anchor=byId(state.anchorId);$('anchor-title').textContent=anchor?.title||'尚未选择';$('canvas-context').textContent=anchor?`${anchor.title} · ${state.view==='local'?'直接关联':state.scope==='course'?'全课程关联':state.scope==='chapter'?'本章知识点':'直接关联'}`:'选择一个课程章节，从知识点开始逐层探索。';
  for(const button of document.querySelectorAll('[data-view]')){button.setAttribute('aria-pressed',String(button.dataset.view===state.view));button.disabled=button.dataset.view==='local'&&!anchor;}
  for(const button of document.querySelectorAll('[data-scope]')){button.setAttribute('aria-pressed',String(button.dataset.scope===state.scope));button.disabled=!anchor||(state.view==='local'&&button.dataset.scope!=='neighbors');}
  const count=reviewedEdges().length;let status;if(graph.catalogueFallback)status='关联数据暂不可用，仅显示真实课程目录。';else if(graph.reviewState!=='complete'&&count===0)status=`${graph.nodes.length} 个知识点 · 关联尚未完成 AI 复核`;else status=count?`${graph.nodes.length} 个知识点 · ${count} 条 AI 复核通过的关联${graph.reviewState==='partial'?' · 其余关系仍在审核':''}`:'当前没有通过 AI 复核的关联，可继续浏览课程。';
  if(rendererUnavailable)status+=' · 3D 不可用，请使用下方文字目录';$('graph-status').textContent=status;$('stage-message').hidden=!rendererUnavailable;$('stage-message').querySelector('p').textContent='3D 图谱暂不可用，文字目录和课程入口仍可使用。';
  renderChapters();renderDirectory();renderInspector();syncPanels();view?.setState(state);if(targetHadFocus)document.querySelector('#inspector-body .canvas-node-actions button')?.focus({preventScroll:true});
}
function bindControls(){
  for(const button of document.querySelectorAll('[data-view]'))button.addEventListener('click',()=>applyState({view:button.dataset.view,scope:button.dataset.view==='network'?networkScope:'neighbors'}));
  for(const button of document.querySelectorAll('[data-scope]'))button.addEventListener('click',()=>{applyState({scope:button.dataset.scope});announce(`范围已展开至${button.dataset.scope==='course'?'全课程':button.dataset.scope==='chapter'?'本章':'直接关联'}`);});
  $('chapter-toggle').addEventListener('click',()=>setDrawer(!drawerOpen));$('chapter-close').addEventListener('click',()=>setDrawer(false,true));$('chapter-backdrop').addEventListener('click',()=>setDrawer(false,true));
  $('inspector-close').addEventListener('click',()=>{const closing=state.selectedId;inspectorOpen=false;if(!small.matches)applyState({selectedId:null});else syncPanels();if(lastNodeFocus?.isConnected)lastNodeFocus.focus();else document.querySelector(`.canvas-node-choice[data-node="${closing||state.anchorId}"]`)?.focus();});
  $('clear-target').addEventListener('click',()=>{applyState({targetId:null});$('node-inspector').focus({preventScroll:true});});
  document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;if(drawerOpen)setDrawer(false,true);else if(small.matches&&inspectorOpen){inspectorOpen=false;syncPanels();document.querySelector(`.canvas-node-choice[data-node="${state.selectedId}"]`)?.focus();}});
  small.addEventListener('change',()=>{inspectorOpen=false;syncPanels();});drawerMedia.addEventListener('change',()=>setDrawer(false));
  window.addEventListener('pagehide',event=>{if(!event.persisted)view?.dispose();});window.addEventListener('pageshow',event=>{if(event.persisted)view?.setState(state);});
}
async function start(){
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const introduction=playIntroOnce({shell:$('canvas-shell'),particles:$('intro-particles'),reduced});
  try{
    graph=await loadGraph();state=readCanvasState(new URL(location.href),graph);networkScope=state.scope;bindControls();render();
    if(!globalThis.THREE&&document.readyState!=='complete')await new Promise(resolve=>window.addEventListener('load',resolve,{once:true}));
    view=createGraphView({canvas:$('knowledge-network'),graph,onSelect:selectNode,onUnavailable:()=>{rendererUnavailable=true;render();}});view.setState(state);syncUrl();
  }catch(error){$('graph-status').textContent='课程目录暂时无法载入，请返回课程后重试。';$('stage-message').querySelector('p').textContent='图谱数据暂不可用';$('chapter-list').replaceChildren(el('p','canvas-muted','课程目录暂不可用'));$('node-list').replaceChildren(el('a','canvas-primary-link','进入课程目录'));$('node-list').firstElementChild.href='/courses/?q=';window.__mcRestoreIntro?.();}
  await introduction;
}
start();
