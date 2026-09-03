#!/usr/bin/env python3
import json, math, struct, sys
from pathlib import Path
import numpy as np
from PIL import Image
import texture2ddecoder

VK_RGBA8=37; VK_BC4=139; VK_BC5=141; VK_BC7=145

def ktx2_level0(path):
    b=Path(path).read_bytes()
    if b[:12] != b'\xabKTX 20\xbb\r\n\x1a\n': raise ValueError(f'not KTX2: {path}')
    vk,ts,w,h,d,layers,faces,levels,superc=struct.unpack_from('<9I',b,12)
    if superc: raise ValueError('supercompressed KTX2 not supported')
    off,length,uncomp=struct.unpack_from('<QQQ',b,80)
    return vk,w,h,b[off:off+length]

def load_rgba(path):
    vk,w,h,data=ktx2_level0(path)
    if vk==VK_RGBA8:
        raw=data[:w*h*4]
        arr=np.frombuffer(raw,np.uint8).reshape(h,w,4).copy()
    else:
        if vk==VK_BC4: raw=texture2ddecoder.decode_bc4(data,w,h)
        elif vk==VK_BC5: raw=texture2ddecoder.decode_bc5(data,w,h)
        elif vk==VK_BC7: raw=texture2ddecoder.decode_bc7(data,w,h)
        else: raise ValueError(f'unsupported vkFormat {vk}: {path}')
        bgra=np.frombuffer(raw,np.uint8).reshape(h,w,4)
        arr=bgra[..., [2,1,0,3]].copy()
    return arr.astype(np.float32)/255.0

def srgb_to_linear(x):
    rgb=x[...,:3]; out=x.copy()
    out[...,:3]=np.where(rgb<=0.04045,rgb/12.92,((rgb+0.055)/1.055)**2.4)
    return out

def linear_to_srgb(rgb): return np.where(rgb<=0.0031308,rgb*12.92,1.055*np.power(np.maximum(rgb,0),1/2.4)-0.055)

def smoothstep(e0,e1,x):
    t=np.clip((x-e0)/(e1-e0),0,1); return t*t*(3-2*t)

def mix(a,b,t): return a*(1-t)+b*t

def luma(x): return x[...,0]*0.2125+x[...,1]*0.7154+x[...,2]*0.0721

def sample(tex,u,v,repeat=False):
    h,w,c=tex.shape
    if repeat: u=np.mod(u,1.0); v=np.mod(v,1.0)
    else: u=np.clip(u,0,1); v=np.clip(v,0,1)
    x=u*w-0.5; y=v*h-0.5
    x0=np.floor(x).astype(np.int32); y0=np.floor(y).astype(np.int32)
    fx=(x-x0)[...,None]; fy=(y-y0)[...,None]; x1=x0+1; y1=y0+1
    if repeat: x0%=w; x1%=w; y0%=h; y1%=h
    else:
        x0=np.clip(x0,0,w-1); x1=np.clip(x1,0,w-1); y0=np.clip(y0,0,h-1); y1=np.clip(y1,0,h-1)
    a=tex[y0,x0]; b=tex[y0,x1]; c0=tex[y1,x0]; d=tex[y1,x1]
    return (a*(1-fx)+b*fx)*(1-fy)+(c0*(1-fx)+d*fx)*fy

def transform_matrix(base_scale,scale,rotation_deg,tx,ty):
    s=base_scale*scale; r=math.radians(rotation_deg); co=math.cos(r); si=math.sin(r)
    m=0.5/(s if s!=0 else 1.0); m0=m*co-m*(-si); m1=m0*(-si)+m*co
    w0=s*co*m0+s*(-si)*m1+tx-0.5; w1=s*si*m0+s*co*m1+ty-0.5
    return np.array([co*s,-si*s,0,w0],np.float32),np.array([si*s,co*s,0,w1],np.float32)

def uv_xform(u,v,x0,x1):
    vy=1.0-v; a=u*x0[0]+vy*x0[1]+x0[3]; b=u*x1[0]+vy*x1[1]+x1[3]; return a,1.0-b

def main():
    if len(sys.argv)<3: raise SystemExit('usage: bake_case_hardened.py <exact-pack> <out-dir> [resolution]')
    pack=Path(sys.argv[1]); out=Path(sys.argv[2]); res=int(sys.argv[3]) if len(sys.argv)>3 else 2048
    out.mkdir(parents=True,exist_ok=True)
    meta=json.loads((pack/'manifest.json').read_text()); resolve=json.loads((pack/'api-resolve.json').read_text()); rng=json.loads((pack/'seed49-rng.json').read_text())
    p=resolve['targets'][0]['passes'][0]; var=p['variables']
    files={}
    for entry in meta['files']:
        for logical in entry['logical_names']: files[logical]=pack/entry['path']
    def T(name): return load_rgba(files[f'resolve_t0_p0_{name}'])
    ao=srgb_to_linear(T('g_tAmbientOcclusion')); masks=T('g_tMasks'); base_color=srgb_to_linear(T('g_tColor')); base_metal=T('g_tMetalness')
    pattern=srgb_to_linear(T('g_tPattern')); wear_tex=T('g_tWear'); grunge=srgb_to_linear(T('g_tGrunge'))
    # Exact resolve target is body_legacy => mesh0 normal map, never body_hd/mesh1.
    normal=load_rgba(files['model_mesh0_g_tNormal'])
    if np.max(np.abs(ao[...,0]-ao[...,1]))>0.02: ao[...,1]=ao[...,0]
    base_scale=float(var['g_flUvScale1'])
    pat0,pat1=transform_matrix(base_scale,float(var['g_flPatternTexCoordScale']),rng['econ_instance.g_flPatternTexCoordRotation.x'],rng['econ_instance.g_vPatternTexCoordOffset.x'],rng['econ_instance.g_vPatternTexCoordOffset.y'])
    wear0,wear1=transform_matrix(base_scale,rng['grunge_wear.g_flWearTexCoordScale.x'],rng['grunge_wear.g_flWearTexCoordRotation.x'],rng['grunge_wear.g_vWearTexCoordOffset.x'],rng['grunge_wear.g_vWearTexCoordOffset.y'])
    gru0,gru1=transform_matrix(base_scale,rng['grunge_wear.g_flGrungeTexCoordScale.x'],rng['grunge_wear.g_flGrungeTexCoordRotation.x'],rng['grunge_wear.g_vGrungeTexCoordOffset.x'],rng['grunge_wear.g_vGrungeTexCoordOffset.y'])
    wear_amount=float(var['g_flWearAmount']); rough=float(var['g_flPaintRoughness']); brightness=float(var['g_flColorBrightness']); mode=int(var['g_nColorAdjustmentMode'])
    c0=np.array(var['g_vColor0'],np.float32); c1=np.array(var['g_vColor1'],np.float32); c2=np.array(var['g_vColor2'],np.float32); c3=np.array(var['g_vColor3'],np.float32); metallic_levels=np.array(var['g_vMetallicPaintAlbedoLevels'],np.float32)
    out_color=np.empty((res,res,4),np.float32); out_metal=np.empty((res,res,4),np.float32); tile=128
    for y0 in range(0,res,tile):
        y1=min(res,y0+tile); ys=(np.arange(y0,y1,dtype=np.float32)+0.5)/res; xs=(np.arange(res,dtype=np.float32)+0.5)/res; u,v=np.meshgrid(xs,ys)
        pu,pv=uv_xform(u,v,pat0,pat1); wu,wv=uv_xform(u,v,wear0,wear1); gu,gv=uv_xform(u,v,gru0,gru1)
        A=sample(ao,u,v,False); M=sample(masks,u,v,False); Cb=sample(base_color,u,v,False); Bm=sample(base_metal,u,v,False); P=sample(pattern,pu,pv,True); W=sample(wear_tex,wu,wv,True); G=sample(grunge,gu,gv,True)
        cavity=A[...,0]; ao_v=A[...,1]; grunge_scalar=np.clip(G[...,0]*G[...,1]*G[...,2],0,1); grunge_mix=(np.power(1-cavity,4)*0.25+0.75*wear_amount)[...,None]; Gm=mix(np.ones_like(G),G,grunge_mix)
        patina=smoothstep(0.1,0.2,W[...,0]*ao_v*cavity*cavity*wear_amount); oil=np.clip(cavity*ao_v-wear_amount*0.1,0,1)-grunge_scalar*0.23; oil=smoothstep(0,0.15,oil+0.08)
        gl=luma(Gm[...,:3]); fw=(1-Gm[...,3])*wear_amount; fr=rough*mix(1.0,0.9,patina)+(1-gl)*wear_amount*0.05+(1-oil)*0.15*wear_amount; fr=np.clip(fr+fw*0.15,0,1); fr=mix(np.minimum(1,fr+fw*wear_amount*0.5),fr,M[...,0])
        fm=mix(mix(np.ones_like(oil),np.sqrt(np.clip(oil*Gm[...,3]*gl,0,1)),wear_amount),np.ones_like(oil),patina); Mo=Bm.copy(); Mo[...,0]=mix(Bm[...,0],fr,(A[...,3] <= 0.996).astype(np.float32)*M[...,0]); Mo[...,1]=mix(Bm[...,1],fm,M[...,0]); Mo[...,2]=1-A[...,3]
        cpattern=P[...,:3]*mix(1.0,brightness,np.maximum(M[...,0],float(mode)))[...,None]; cpatina=mix(c1,c2,wear_amount); coil=mix(c1,c3,math.sqrt(wear_amount)); cpatina=mix(coil,cpatina,oil[...,None])*cpattern; cscratch=c0*luma(cpattern)[...,None]; cp=mix(cpatina,cscratch,patina[...,None]); paint_blend=1-M[...,0]; cp*=Gm[...,:3]
        cpn=cp.clip(min=0.0003); norm=np.linalg.norm(cpn,axis=-1,keepdims=True); cpn/=np.maximum(norm,1e-8); nmax=np.max(cpn,axis=-1); lum=np.minimum(metallic_levels[0],luma(cpattern*c1)); tone=np.clip(np.power(np.max(cp,axis=-1).clip(min=0),metallic_levels[1]),0,1); target=mix(lum,metallic_levels[2],tone); painted=cpn*target[...,None]/np.maximum(nmax[...,None],1e-8); cp=mix(cp,painted,wear_amount)
        Co=np.empty_like(Cb); Co[...,:3]=mix(cp,Cb[...,:3],paint_blend[...,None]); Co[...,3]=1-paint_blend; out_color[y0:y1]=Co; out_metal[y0:y1]=Mo; print(f'bake {y1}/{res}',flush=True)
    color8=np.empty_like(out_color,dtype=np.uint8); color8[...,:3]=(np.clip(linear_to_srgb(np.clip(out_color[...,:3],0,1)),0,1)*255+0.5).astype(np.uint8); color8[...,3]=(np.clip(out_color[...,3],0,1)*255+0.5).astype(np.uint8); Image.fromarray(color8,'RGBA').save(out/'ak47_case_hardened_seed49_basecolor.png',optimize=True)
    orm=np.ones((res,res,4),np.uint8)*255; orm[...,1]=(np.clip(out_metal[...,0],0,1)*255+0.5).astype(np.uint8); orm[...,2]=(np.clip(out_metal[...,1],0,1)*255+0.5).astype(np.uint8); Image.fromarray(orm,'RGBA').save(out/'ak47_case_hardened_seed49_orm.png',optimize=True)
    n=normal[...,:3].copy(); x=n[...,0]*2-1; y=n[...,1]*2-1; z=np.sqrt(np.maximum(0,1-x*x-y*y)); nrgb=np.stack([(x+1)*.5,(y+1)*.5,(z+1)*.5],axis=-1); Image.fromarray((np.clip(nrgb,0,1)*255+0.5).astype(np.uint8),'RGB').save(out/'ak47_legacy_normal.png',optimize=True)
    bake_meta={'item':meta['item'],'paint':meta['paint'],'seed':meta['seed'],'wear':meta['wear'],'resolution':res,'mesh_group':meta['mesh_group'],'normal_source':'model_mesh0_g_tNormal','base_scale':base_scale,'pattern_xform':[pat0.tolist(),pat1.tolist()],'wear_xform':[wear0.tolist(),wear1.tolist()],'grunge_xform':[gru0.tolist(),gru1.tolist()]}; (out/'bake.json').write_text(json.dumps(bake_meta,indent=2))

if __name__=='__main__': main()
