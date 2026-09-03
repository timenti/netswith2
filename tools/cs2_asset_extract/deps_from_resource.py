#!/usr/bin/env python3
import re, sys
from pathlib import Path

EXTS = ('vmdl','vmesh','vmat','vtex','vagrp','vanim','vphys','vdata','vwrld','vwnod')
PAT = re.compile(r'(?i)([a-z0-9_./\\-]+\.(?:' + '|'.join(EXTS) + r')(?:_c)?)')

def norm(s):
    s=s.replace('\\','/').strip('"\' \t\r\n\x00')
    while s.startswith('./'):
        s=s[2:]
    for prefix in ('game/csgo/','csgo/'):
        if s.lower().startswith(prefix):
            s=s[len(prefix):]
    if s.lower().endswith(tuple('.'+x for x in EXTS)):
        s += '_c'
    return s.lstrip('/')

def main():
    if len(sys.argv) < 2:
        raise SystemExit('usage: deps_from_resource.py <vrf-text> [compiled-resource]')
    chunks=[]
    p=Path(sys.argv[1])
    if p.exists():
        chunks.append(p.read_text(errors='ignore'))
    if len(sys.argv) > 2:
        b=Path(sys.argv[2])
        if b.exists():
            chunks.append(b.read_bytes().decode('latin1','ignore'))
    out=set()
    for chunk in chunks:
        for m in PAT.finditer(chunk):
            s=norm(m.group(1))
            if '/' in s and len(s) < 260:
                out.add(s)
    for s in sorted(out):
        print(s)

if __name__=='__main__':
    main()
