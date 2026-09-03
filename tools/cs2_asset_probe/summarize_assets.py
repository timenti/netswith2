#!/usr/bin/env python3
import json, os, re, sys
from pathlib import Path
root=Path(sys.argv[1] if len(sys.argv)>1 else 'work/browser')
interesting=re.compile(r'(?i)(ak47|ak-47|oiled|case.?hardened|weapon|model|mesh|material|shader|texture|\.glb(?:$|\?)|\.gltf(?:$|\?)|\.bin(?:$|\?)|\.ktx2(?:$|\?)|\.wasm(?:$|\?)|\.vmdl|\.vmat|\.vtex)')
urls=[]
for p in root.rglob('*.json'):
    try:d=json.loads(p.read_text(errors='ignore'))
    except:continue
    def walk(x):
        if isinstance(x,dict):
            if isinstance(x.get('url'),str): urls.append((str(p.relative_to(root)),x['url'],x.get('contentType','')))
            if isinstance(x.get('name'),str) and x['name'].startswith('http'): urls.append((str(p.relative_to(root)),x['name'],x.get('initiatorType','')))
            for v in x.values(): walk(v)
        elif isinstance(x,list):
            for v in x: walk(v)
    walk(d)
seen=set()
print('=== INTERESTING NETWORK ASSETS ===')
for src,u,t in urls:
    key=u
    if key in seen or not interesting.search(u): continue
    seen.add(key)
    print(f'{src}\t{t}\t{u}')
print('\n=== DOWNLOADED / GENERATED FILES ===')
for p in sorted(root.rglob('*')):
    if p.is_file():
        print(f'{p.relative_to(root)}\t{p.stat().st_size} bytes')
