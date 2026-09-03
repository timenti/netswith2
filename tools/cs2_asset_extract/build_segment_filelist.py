#!/usr/bin/env python3
import sys
from pathlib import Path
from vpk_index import lookup, DIR_ARCHIVE

def main():
    if len(sys.argv)!=4:
        raise SystemExit('usage: build_segment_filelist.py <pak01_dir.vpk> <deps.txt> <out-filelist>')
    vpk, deps_file, out_file = sys.argv[1:]
    deps=[x.strip() for x in Path(deps_file).read_text(errors='ignore').splitlines() if x.strip() and not x.startswith('#')]
    segments=set()
    missing=[]
    for dep in deps:
        e=lookup(vpk,dep)
        if not e:
            missing.append(dep)
            continue
        idx=e['archive_index']
        if idx != DIR_ARCHIVE:
            segments.add(idx)
    lines=['game/csgo/pak01_dir.vpk']+[f'game/csgo/pak01_{i:03d}.vpk' for i in sorted(segments)]
    Path(out_file).write_text('\n'.join(lines)+'\n')
    if missing:
        Path(out_file+'.missing.txt').write_text('\n'.join(missing)+'\n')
        print(f'Warning: {len(missing)} dependency paths not found in VPK index', file=sys.stderr)
    print(f'Resolved {len(deps)} deps to {len(segments)} archive segment(s)', file=sys.stderr)

if __name__=='__main__':
    main()
