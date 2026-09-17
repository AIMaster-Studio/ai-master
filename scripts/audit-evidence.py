"""Inventory course claims and PPTX submission risks. Does not certify facts or compliance."""
import argparse,csv,hashlib,json,re,zipfile
from pathlib import Path
from xml.etree import ElementTree
ROOT=Path(__file__).resolve().parent.parent

def inventory():
    rows=[]
    for file in sorted((ROOT/'frontend/data').glob('chapter_*.json')):
        chapter=json.loads(file.read_text(encoding='utf-8-sig'))
        for i,node in enumerate(chapter.get('knowledge_points',[]),1):
            text=node.get('content','')
            rows.append({'node':f"{chapter['id']}-{i}",'chapter':chapter['title'],'title':node['title'],
                'source_file':file.relative_to(ROOT).as_posix(),'content_sha256':hashlib.sha256(text.encode()).hexdigest(),
                'references':';'.join(sorted(set(re.findall(r'https?://[^\s<>"\']+',text)))),
                'numeric_claim_candidates':len(re.findall(r'\d+(?:\.\d+)?\s*(?:亿|万|%|GB|TB|token|参数)',text,re.I)),
                'audit_status':'pending-human-review','verified_at':'','reviewer':'','notes':''})
    return rows

def audit_pptx(file):
    text=[]
    with zipfile.ZipFile(file) as z:
        for name in z.namelist():
            if name.startswith(('ppt/slides/','ppt/notesSlides/','docProps/')) and name.endswith('.xml'):
                try: text.extend(ElementTree.fromstring(z.read(name)).itertext())
                except ElementTree.ParseError: text.append('[unparsed XML]')
            if name.endswith('.rels'):
                try:
                    for el in ElementTree.fromstring(z.read(name)):
                        target=el.attrib.get('Target','')
                        if el.attrib.get('TargetMode')=='External':text.append(target)
                except ElementTree.ParseError:pass
    joined=' '.join(text)
    # Flag for human review, not automatic disqualification. Does not OCR images.
    return {'file':file.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),
        'ai_label_in_text':'AI辅助制作' in joined or 'AI 辅助制作' in joined,
        'identity_candidates':[s for s in ['AIMaster-Studio','github.com','指导教师','大学','学院','@qq.com'] if s in joined],
        'status':'manual-review-required','image_ocr_performed':False}

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',default='.local/evidence-audit');args=p.parse_args()
    out=Path(args.output);out.mkdir(parents=True,exist_ok=True)
    rows=inventory()
    with (out/'course-audit.csv').open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
    reports=[]
    for file in ROOT.rglob('*.pptx'):
        if any(part in {'.git','node_modules','.local','third_party'} for part in file.relative_to(ROOT).parts):continue
        try:reports.append(audit_pptx(file))
        except (OSError,zipfile.BadZipFile) as e:reports.append({'file':file.relative_to(ROOT).as_posix(),'status':'unreadable','error':type(e).__name__})
    summary={'course_nodes':len(rows),'fully_verified_nodes':0,'notes':'Inventory is not fact verification. Prior audit results must be reconciled manually.', 'presentations':reports}
    (out/'submission-audit.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(summary,ensure_ascii=False))
if __name__=='__main__':main()
