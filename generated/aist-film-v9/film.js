import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {RectAreaLightUniformsLib} from 'three/addons/lights/RectAreaLightUniformsLib.js';
const film=document.getElementById('film'),stage=document.getElementById('stage'),step=document.getElementById('step'),title=document.getElementById('title'),body=document.getElementById('body'),micro=document.getElementById('micro'),phase=document.getElementById('phase');
const assetStatus=document.getElementById('asset-status'); const setAssetStatus=(text,error=false)=>{if(!assetStatus)return;assetStatus.textContent=text;assetStatus.dataset.error=error?'1':'0'}; const withTimeout=(promise,label,ms=30000)=>Promise.race([promise,new Promise((_,reject)=>setTimeout(()=>reject(new Error(label+' timeout')),ms))]); const ASSET_BASE='https://cdn.jsdelivr.net/gh/timenti/netswith2@761dcc873bb4975579151cf0f7ca0366be5051be/generated/aist-exact-ak/';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)), smooth=t=>t*t*(3-2*t), seg=(p,a,b)=>smooth(clamp((p-a)/(b-a)));
const chapters=[
['01 / ПРЕДМЕТ','Один предмет. Вся система начинается здесь.','A.I.S.T. сначала понимает конкретный экземпляр, а уже потом рынок вокруг него.','AK-47 · CASE HARDENED · SEED 49 · FLOAT 0.0422822','OBJECT'],
['02 / СКАНИРОВАНИЕ','Система считывает сам предмет.','Float, pattern, wear и ликвидность превращаются в цифровой профиль — без ручной рутины.','FLOAT · PATTERN · WEAR · LIQUIDITY','SCAN'],
['03 / GLOBAL SEARCH','Рынки стягиваются к одному экземпляру.','A.I.S.T. сопоставляет один предмет с предложениями, продажами и историей разных площадок.','ONE ITEM → MANY MARKETS → ONE NORMALIZED VIEW','SEARCH'],
['04 / PRICE INTELLIGENCE','Цена перестаёт быть одной цифрой.','История, справедливый диапазон и вероятный сценарий становятся одной картиной.','HISTORY · FAIR RANGE · SCENARIO','PRICE'],
['05 / ARBITRAGE','Разница цен проходит через реальную экономику.','Комиссии и ограничения буквально съедают часть спреда. Возможность остаётся только после издержек.','GROSS SPREAD ≠ REAL OPPORTUNITY','ARBITRAGE'],
['06 / RISK GATES','Сигнал обязан пройти четыре независимых шлюза.','Цена, экономика, размер позиции и риск проверяются до движения денег.','PRICE · ECONOMICS · POSITION · RISK','RISK'],
['07 / HUMAN APPROVAL','Перед деньгами система останавливается.','AI может объяснить решение. Продолжить исполнение может только человек.','HUMAN-IN-THE-LOOP','APPROVAL'],
['08 / EXECUTION','После подтверждения движение продолжается.','Execution, audit trail, portfolio и storage становятся одной траекторией.','EXECUTION → AUDIT → PORTFOLIO → STORAGE','EXECUTION'],
['09 / MONITORING','Система продолжает следить после сделки.','События возвращаются оператору, а AI остаётся read-only: объяснять может, торговать — нет.','MONITORING · NOTIFICATIONS · READ-ONLY AI','MONITORING'],
['10 / SYSTEM','Одна сделка — маленькая часть большой машины.','Камера отъезжает и раскрывает Market, Analytics, Trading, Storage, Notifications, AI и Security как единый продукт.','ONE OBJECT → ONE SYSTEM','SYSTEM']];
let frozenH=0,p=0,raf=0,active=true,model=null,legacy=null,holder=null,baseScale=1;
function freezeHeight(){if(frozenH)return;frozenH=Math.round(window.visualViewport?.height||innerHeight);document.documentElement.style.setProperty('--fh',frozenH+'px')}freezeHeight();
const canvas=document.getElementById('c');const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,innerWidth<760?1.25:1.65));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.16;renderer.setClearColor(0,0);
RectAreaLightUniformsLib.init();
const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(innerWidth<760?35:27,1,.01,100);camera.position.set(0,.08,7.3);
scene.add(new THREE.HemisphereLight(0x9aa9bc,0x120b08,.7));
function area(color,intensity,w,h,pos,look){const l=new THREE.RectAreaLight(color,intensity,w,h);l.position.set(...pos);l.lookAt(...look);scene.add(l);return l}
area(0xf7fbff,8.8,6.0,2.8,[-3.8,4.3,5.2],[0,0,0]);
area(0x87baff,4.7,3.4,1.2,[-4.4,1.5,-3.7],[0,0,0]);
area(0xffb875,3.1,2.7,1.5,[4.2,-1.7,-3.4],[0,0,0]);
area(0xffffff,2.05,4.5,2.2,[1.4,.8,6.4],[0,0,0]);
const scanner=new THREE.Mesh(new THREE.PlaneGeometry(3.6,3.6),new THREE.MeshBasicMaterial({color:0x8fd0ff,transparent:true,opacity:.055,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,depthWrite:false}));scanner.rotation.y=Math.PI/2;scanner.visible=false;scene.add(scanner);
const tl=new THREE.TextureLoader();let albedo,orm,normal,gltf; try{setAssetStatus('ЗАГРУЗКА ТЕКСТУР 1/2');[albedo,orm,normal]=await withTimeout(Promise.all([tl.loadAsync(ASSET_BASE+'ak47_case_hardened_seed49_basecolor.png'),tl.loadAsync(ASSET_BASE+'ak47_case_hardened_seed49_orm.png'),tl.loadAsync(ASSET_BASE+'ak47_legacy_normal.png')]),'textures');setAssetStatus('ЗАГРУЗКА 3D 2/2');gltf=await withTimeout(new GLTFLoader().loadAsync(ASSET_BASE+'weapon_rif_ak47.glb'),'model')}catch(e){setAssetStatus('3D НЕ ЗАГРУЗИЛСЯ — '+(e?.message||e),true);console.error('AIST_ASSET_LOAD_FAILED',e);throw e}
albedo.colorSpace=THREE.SRGBColorSpace;for(const t of[albedo,orm,normal]){t.flipY=false;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=Math.min(8,renderer.capabilities.getMaxAnisotropy());t.needsUpdate=true}
const mat=new THREE.MeshStandardMaterial({map:albedo,roughnessMap:orm,metalnessMap:orm,normalMap:normal,roughness:1,metalness:1,normalScale:new THREE.Vector2(.52,.52)});
model=gltf.scene;let hd=null;model.traverse(o=>{const n=(o.name||'').toLowerCase();if(!legacy&&n.includes('body_legacy'))legacy=o;if(!hd&&n.includes('body_hd'))hd=o});if(!legacy)throw new Error('body_legacy missing');if(hd)hd.visible=false;const meshes=[];legacy.traverse(o=>{if(o.isMesh){meshes.push(o);o.material=mat}});if(meshes[1])meshes[1].visible=false;model.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(legacy),center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3()),maxDim=Math.max(size.x,size.y,size.z);model.position.set(-center.x,-center.y,-center.z);holder=new THREE.Group();holder.add(model);holder.rotation.set(-.02,Math.PI/2,.02);scene.add(holder);baseScale=1/maxDim;
function resize(){const w=stage.clientWidth,h=stage.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<760?35:27;camera.updateProjectionMatrix()}resize();
function vars(){const scan=seg(p,.08,.20)*(1-seg(p,.25,.31)),search=seg(p,.22,.33)*(1-seg(p,.39,.45)),price=seg(p,.35,.46)*(1-seg(p,.52,.58)),arb=seg(p,.49,.58)*(1-seg(p,.63,.68)),risk=seg(p,.57,.66)*(1-seg(p,.70,.74)),approve=seg(p,.66,.73)*(1-seg(p,.76,.80)),exec=seg(p,.75,.87)*(1-seg(p,.91,.95)),system=seg(p,.87,.985);film.style.setProperty('--scan',scan.toFixed(4));film.style.setProperty('--search',search.toFixed(4));film.style.setProperty('--price',price.toFixed(4));film.style.setProperty('--arb',arb.toFixed(4));film.style.setProperty('--risk',risk.toFixed(4));film.style.setProperty('--approve',approve.toFixed(4));film.style.setProperty('--exec',exec.toFixed(4));film.style.setProperty('--system',system.toFixed(4));return{scan,search,price,arb,risk,approve,exec,system}}
const shotFrames=[
{p:0.00,rot:[-.02,.02,.02],pos:[0,.28,0],scale:.96,cam:[0,.08,7.3],target:[0,.03,0],fov:27},
{p:.075,rot:[-.05,.28,.045],pos:[-.12,.27,0],scale:1.04,cam:[1.05,.34,6.45],target:[-.04,.05,0],fov:26},
{p:.145,rot:[.025,-.34,-.035],pos:[.72,.18,0],scale:1.39,cam:[-1.18,.42,5.18],target:[.16,.04,0],fov:24},
{p:.215,rot:[-.10,.43,.085],pos:[-.58,.16,0],scale:1.29,cam:[1.48,-.02,5.02],target:[-.06,.02,0],fov:24},
{p:.305,rot:[.055,-.50,-.04],pos:[.10,.30,0],scale:.99,cam:[-1.58,.30,6.35],target:[0,.08,0],fov:27},
{p:.395,rot:[-.035,.26,.055],pos:[-.82,.27,0],scale:1.46,cam:[1.32,.58,5.08],target:[-.24,.08,0],fov:23},
{p:.485,rot:[.085,-.62,-.065],pos:[.16,.20,0],scale:1.10,cam:[-1.62,.14,5.95],target:[.05,.01,0],fov:26},
{p:.575,rot:[-.045,.11,.012],pos:[0,.28,0],scale:.97,cam:[.12,.08,7.02],target:[0,.02,0],fov:27},
{p:.655,rot:[.03,.34,.025],pos:[-.08,.24,0],scale:.92,cam:[.86,.18,6.78],target:[0,.01,0],fov:28},
{p:.725,rot:[.018,.39,.004],pos:[0,.22,0],scale:.89,cam:[1.02,.10,6.92],target:[0,0,0],fov:28},
{p:.795,rot:[-.085,-.49,.085],pos:[.26,.18,0],scale:1.16,cam:[-1.42,.44,5.58],target:[.06,.05,0],fov:25},
{p:.865,rot:[.105,.59,-.085],pos:[-.64,.25,0],scale:1.33,cam:[1.76,.46,5.24],target:[-.18,.06,0],fov:24},
{p:.925,rot:[-.025,.80,.035],pos:[0,.31,0],scale:.79,cam:[2.02,.66,7.75],target:[0,.10,0],fov:29},
{p:1.00,rot:[-.05,1.00,.02],pos:[0,.55,0],scale:.38,cam:[3.05,1.62,12.8],target:[0,.24,0],fov:33}
];
function shotAt(x){
 let a=shotFrames[0],b=shotFrames[shotFrames.length-1];
 for(let i=0;i<shotFrames.length-1;i++){if(x>=shotFrames[i].p&&x<=shotFrames[i+1].p){a=shotFrames[i];b=shotFrames[i+1];break}}
 const t=smooth(clamp((x-a.p)/Math.max(.0001,b.p-a.p)));
 const mix=(u,v)=>THREE.MathUtils.lerp(u,v,t), mix3=(u,v)=>[mix(u[0],v[0]),mix(u[1],v[1]),mix(u[2],v[2])];
 return{rot:mix3(a.rot,b.rot),pos:mix3(a.pos,b.pos),scale:mix(a.scale,b.scale),cam:mix3(a.cam,b.cam),target:mix3(a.target,b.target),fov:mix(a.fov,b.fov)}
}
function render(){
 raf=0;freezeHeight();
 const r=film.getBoundingClientRect(),travel=Math.max(1,film.offsetHeight-frozenH);p=clamp(-r.top/travel);film.style.setProperty('--p',p.toFixed(4));
 const v=vars();
 const idx=p<.10?0:p<.22?1:p<.35?2:p<.49?3:p<.57?4:p<.66?5:p<.75?6:p<.85?7:p<.91?8:9,c=chapters[idx];
 if(step.textContent!==c[0]){step.textContent=c[0];title.textContent=c[1];body.textContent=c[2];micro.textContent=c[3];phase.textContent=c[4]}
 const s=shotAt(p),mobile=innerWidth<760,viewportBase=(mobile?.82:.92)*baseScale*5.6;
 holder.scale.setScalar(viewportBase*s.scale);
 holder.position.set(s.pos[0],s.pos[1],s.pos[2]);
 holder.rotation.set(s.rot[0],Math.PI/2+s.rot[1],s.rot[2]);
 camera.position.set(s.cam[0],s.cam[1],s.cam[2]);
 camera.fov=s.fov+(mobile?5:0);camera.updateProjectionMatrix();camera.lookAt(s.target[0],s.target[1],s.target[2]);
 film.dataset.shot=String(shotFrames.findIndex((f,i)=>p>=f.p&&(i===shotFrames.length-1||p<shotFrames[i+1].p)));
 scanner.visible=v.scan>.02;scanner.position.x=-2.7+v.scan*5.4;scanner.material.opacity=.035+.075*v.scan;
 renderer.render(scene,camera)
}
film.dataset.assetReady='1'; if(assetStatus)assetStatus.remove();
function schedule(){if(!raf)raf=requestAnimationFrame(render)}addEventListener('scroll',schedule,{passive:true});addEventListener('resize',()=>{resize();schedule()},{passive:true});addEventListener('orientationchange',()=>{frozenH=0;setTimeout(()=>{resize();schedule()},90)},{passive:true});render();