"""Adapt root-relative static URLs in the GitHub Pages build artifact."""
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'frontend'
prefix = '/ai-master'
directories = sorted((p.name for p in root.iterdir() if p.is_dir()), key=len, reverse=True)
pattern = re.compile(r'''(?P<quote>["'`])/(?P<path>(?:''' + '|'.join(map(re.escape, directories)) + r''')(?=[/"'`?#]|$))''')

for path in root.rglob('*'):
    if path.suffix not in {'.html', '.js', '.css'} or path == root / 'index.html':
        continue
    content = path.read_text(encoding='utf-8')
    updated = pattern.sub(lambda m: m.group('quote') + prefix + '/' + m.group('path'), content)
    updated = re.sub(r'''(href=["'])/(["'])''', r'\1' + prefix + r'/\2', updated)
    updated = re.sub(r'''(href\s*:\s*["'])/(["'])''', r'\1' + prefix + r'/\2', updated)
    updated = re.sub(r'''(url\()/(''' + '|'.join(map(re.escape, directories)) + r''')(?=/)''', r'\1' + prefix + r'/\2', updated)
    if updated != content:
        path.write_text(updated, encoding='utf-8')
