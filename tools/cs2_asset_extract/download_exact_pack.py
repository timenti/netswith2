#!/usr/bin/env python3
import json, math, os, re, sys, urllib.request
from pathlib import Path

BASE='https://3dviewapi.cs2inspects.com'
HDR={'X-Site-Password':'banana','User-Agent':'TIMENTI-AIST-asset-build/1.0'}
ITEM=7
PAINT=44
SEED=49
WEAR=0.04228220134973526

class ValveRNG:
    NTAB=32; IM=2147483647; IA=16807; IQ=127773; IR=2836
    NDIV=1+((IM-1)//NTAB)
    def __init__(self, seed): self.set_seed(seed)
    def set_seed(self, seed):
        seed=int(seed); self.idum=1 if seed==0 else abs(seed); self.iy=0; self.iv=[0]*self.NTAB
        for j in range(39,-1,-1):
            k=self.idum//self.IQ
            self.idum=self.IA*(self.idum-k*self.IQ)-self.IR*k
            if self.idum<0:self.idum+=self.IM
            if j<self.NTAB:self.iv[j]=self.idum
        self.iy=self.iv[0]
    def random_float(self,a,b):
        k=self.idum//self.IQ
        self.idum=self.IA*(self.idum-k*self.IQ)-self.IR*k
        if self.idum<0:self.idum+=self.IM
        j=self.iy//self.NDIV
        self.iy=self.iv[j]; self.iv[j]=self.idum
        return a+(self.iy/self.IM)*(b-a)

def api_json(path, payload=None):
    url=BASE+path
    data=None; headers=dict(HDR)
    if payload is not None:
        data=json.dumps(payload).encode(); headers['Content-Type']='application/json'
    req=urllib.request.Request(url,data=data,headers=headers,method='POST' if data else 'GET')
    with urllib.request.urlopen(req,timeout=60) as r:
        return json.load(r)

def download(url,dst):
    dst=Path(dst); dst.parent.mkdir(parents=True,exist_ok=True)
    req=urllib.request.Request(url,headers={'User-Agent':HDR['User-Agent']})
    with urllib.request.urlopen(req,timeout=120) as r, dst.open('wb') as f:
        while True:
            chunk=r.read(1024*1024)
            if not chunk:break
            f.write(chunk)
    return dst.stat().st_size

def safe_name(url):
    from urllib.parse import urlparse
    p=urlparse(url).path.strip('/')
    return re.sub(r'[^A-Za-z0-9._/-]+','_',p)

def main():
    out=Path(sys.argv[1] if len(sys.argv)>1 else 'work/exact-pack')
    out.mkdir(parents=True,exist_ok=True)
    model=api_json(f'/model/{ITEM}')
    resolve=api_json('/resolve/raw',{'item':ITEM,'paint':PAINT,'seed':SEED,'wear':WEAR,'lv':False})
    (out/'api-model7.json').write_text(json.dumps(model,indent=2))
    (out/'api-resolve.json').write_text(json.dumps(resolve,indent=2))

    rng_values={}
    for group in resolve['targets'][0].get('rng',{}).get('roll_order',[]):
        rng=ValveRNG(SEED+1 if 'alt' in group.get('seed_var','').lower() else SEED)
        for roll in group.get('rolls',[]):
            value=rng.random_float(float(roll['min']),float(roll['max']))
            if roll.get('apply'): rng_values[roll['key']]=value
    (out/'seed49-rng.json').write_text(json.dumps(rng_values,indent=2))

    urls={}
    urls['mesh']=model['mesh_url']
    for mi,m in enumerate(model.get('meshes',[])):
        for k,u in (m.get('textures') or {}).items(): urls[f'model_mesh{mi}_{k}']=u
        for pi,part in enumerate(m.get('parts',[])):
            for k,u in (part.get('textures') or {}).items(): urls[f'model_mesh{mi}_part{pi}_{k}']=u
    for ti,t in enumerate(resolve.get('targets',[])):
        for pi,p in enumerate(t.get('passes',[])):
            sh=p.get('shader',{})
            if sh.get('vs_wgsl_url'): urls[f'resolve_t{ti}_p{pi}_vs']=sh['vs_wgsl_url']
            if sh.get('ps_wgsl_url'): urls[f'resolve_t{ti}_p{pi}_ps']=sh['ps_wgsl_url']
            for k,u in (p.get('textures') or {}).items(): urls[f'resolve_t{ti}_p{pi}_{k}']=u
        for k,u in (t.get('direct_textures') or {}).items(): urls[f'resolve_t{ti}_direct_{k}']=u

    unique={}
    for logical,url in urls.items(): unique.setdefault(url,[]).append(logical)
    manifest=[]
    for idx,(url,logical_names) in enumerate(unique.items()):
        rel=Path('assets')/safe_name(url)
        size=download(url,out/rel)
        manifest.append({'url':url,'path':str(rel),'size':size,'logical_names':logical_names})
        print(f'{size:>10}  {rel}  <- {url}')
    meta={
      'item':ITEM,'paint':PAINT,'seed':SEED,'wear':WEAR,
      'mesh_group':resolve.get('mesh_group'),
      'target_vmat':resolve['targets'][0].get('target_vmat'),
      'rng_values':rng_values,
      'files':manifest
    }
    (out/'manifest.json').write_text(json.dumps(meta,indent=2))
    print(f'PACK FILES: {len(manifest)}')

if __name__=='__main__': main()
