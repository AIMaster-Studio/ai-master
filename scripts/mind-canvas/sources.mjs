import {readFile, readdir} from 'node:fs/promises';
import {readFileSync, existsSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
const stages = {1:1,3:2,5:3,4:4,10:5,9:6};
export function plainText(html) {
  const entities = {amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '};
  return String(html).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(?:p|h[1-6]|li|tr|pre|ul|ol)>/gi,'\n').replace(/<\/(?:td|th)>/gi,' | ').replace(/<[^>]+>/g,'').replace(/&(#x[\da-f]+|#\d+|\w+);/gi,(_m,e)=>e[0]==='#'?String.fromCodePoint(Number(e[1].toLowerCase()==='x'?'0x'+e.slice(2):e.slice(1))):entities[e]??_m).trim();
}
export function evidenceBlocks(html, nodeId) {
  const blocks=[];
  // Closing structural tags split complete paragraphs, headings, code and table rows.
  for (const fragment of html.split(/(?<=<\/(?:h[1-6]|p|li|tr|pre)>)/i)) {
    const text=plainText(fragment); if(text) blocks.push({id:`${nodeId}:b${String(blocks.length+1).padStart(3,'0')}`,text,hash:sha256(text)});
  }
  return blocks;
}
export function resolveLessonHref(root, chapter, index) {
  const file=path.join(root,'frontend/data',`chapter_${String(chapter).padStart(2,'0')}.json`);
  if(!existsSync(file)||!Number.isInteger(index)||index<0||!JSON.parse(readFileSync(file,'utf8')).knowledge_points[index]) throw new Error('INVALID_INDEX');
  const stage=stages[chapter]; const href=`/knowledge/${stage}-${index+1}/`;
  if(stage && existsSync(path.join(root,'frontend',href,'index.html'))) return href;
  return `/chapter/${chapter}/#kp-${index+1}`;
}
export async function loadSourceCatalogue(root) {
  const chapters=(await readdir(path.join(root,'frontend/data'))).filter(f=>/^chapter_\d{2}\.json$/.test(f)).sort();
  const sourceFiles=[...chapters.map(f=>'frontend/data/'+f),'frontend/data/knowledge-universe.json','frontend/data/knowledge-cognitive-map.json','frontend/ai-learning/data.js'].sort();
  const sources=[];const contents=new Map();
  for(const file of sourceFiles){const data=await readFile(path.join(root,file),'utf8');contents.set(file,data);sources.push({file,hash:sha256(data)});}
  const snapshot=sha256(JSON.stringify(sources));const nodes=[];
  for(const filename of chapters){const sourceFile='frontend/data/'+filename;const course=JSON.parse(contents.get(sourceFile));
    course.knowledge_points.forEach((point,index)=>{const id=`${course.id}_${index}`; const blocks=evidenceBlocks(point.content,id); const paragraph=point.content.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1];
      nodes.push({id,chapter:course.id,index,curriculumId:`chapter-${course.id}-kp-${index+1}`,chapterTitle:course.title,title:point.title,summary:plainText(paragraph||point.content),href:resolveLessonHref(root,course.id,index),sourceFile,sourceHash:sha256(contents.get(sourceFile)),evidenceBlocks:blocks});
    });
  }
  if(nodes.length!==57||new Set(nodes.map(n=>n.id)).size!==57) throw new Error('INVALID_CATALOGUE');
  return {nodes,snapshot,sources};
}
export async function loadSeedPool(root) {
  const cognitive=JSON.parse(await readFile(path.join(root,'frontend/data/knowledge-cognitive-map.json'),'utf8'));
  const universe=JSON.parse(await readFile(path.join(root,'frontend/data/knowledge-universe.json'),'utf8'));
  return [...cognitive.nodes.flatMap(n=>n.prerequisites.map(source=>({source,target:n.id,type:'prerequisite',origin:'suggested-unvalidated'}))),...universe.galaxies.flatMap(g=>g.connections.filter(c=>c[2]==='concept').map(c=>({source:`${g.chapter}_${c[0]}`,target:`${g.chapter}_${c[1]}`,type:'related',origin:'concept-unvalidated'})))];
}
