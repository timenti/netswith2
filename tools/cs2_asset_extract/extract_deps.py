#!/usr/bin/env python3
import subprocess, sys
from pathlib import Path

def main():
    if len(sys.argv)!=5:
        raise SystemExit('usage: extract_deps.py <Source2Viewer-CLI> <pak01_dir.vpk> <deps.txt> <outdir>')
    cli,vpk,deps_file,outdir=sys.argv[1:]
    deps=[x.strip() for x in Path(deps_file).read_text(errors='ignore').splitlines() if x.strip() and not x.startswith('#')]
    out=Path(outdir); out.mkdir(parents=True,exist_ok=True)
    failures=[]
    for dep in deps:
        dest=out/dep
        if dest.exists():
            continue
        dest.parent.mkdir(parents=True,exist_ok=True)
        p=subprocess.run([cli,'-i',vpk,'-o',str(out),'--vpk_filepath',dep],text=True,capture_output=True)
        if p.returncode!=0 or not dest.exists():
            failures.append((dep,p.returncode,(p.stderr or p.stdout)[-1200:]))
    if failures:
        Path(outdir).joinpath('_extract_failures.txt').write_text('\n\n'.join(f'{d}\nrc={rc}\n{msg}' for d,rc,msg in failures))
        print(f'Warning: {len(failures)} dependencies failed extraction',file=sys.stderr)
    print(f'Extracted/available {len(deps)-len(failures)}/{len(deps)} dependencies',file=sys.stderr)

if __name__=='__main__':
    main()
