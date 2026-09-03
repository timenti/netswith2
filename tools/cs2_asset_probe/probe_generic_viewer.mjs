import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const out=process.argv[2]||'work/browser/cs2inspects';
fs.mkdirSync(out,{recursive:true});
fs.mkdirSync(path.join(out,'bodies'),{recursive:true});
const exe=process.env.CHROME_BIN;
if(!exe) throw new Error('CHROME_BIN not set');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await ctx.newPage();
const responses=[]; const requests=[]; const consoleLog=[]; const pending=[];
const wanted=['/items/models','/items/weapons2','/camera-poses/7','/items','/settings/default','/paints','/decode','/assets/index-'];
function safeName(url){const u=new URL(url);let s=(u.hostname+u.pathname).replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');if(u.search)s+='__'+u.search.slice(1).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);return s.slice(0,220)||'response'}
function extFor(ct,url){if(/json/i.test(ct))return'.json';if(/javascript|text\/javascript/i.test(ct)||/\.js(?:\?|$)/i.test(url))return'.js';if(/text\//i.test(ct))return'.txt';if(/image\/png/i.test(ct))return'.png';if(/image\/webp/i.test(ct))return'.webp';if(/gltf/i.test(ct)||/\.glb(?:\?|$)/i.test(url))return'.glb';return'.bin'}
async function persistResponse(r,label='live'){
  try{const h=await r.allHeaders(),url=r.url(),ct=h['content-type']||'';const b=await r.body();if(b.length>30*1024*1024)return;fs.writeFileSync(path.join(out,'bodies',`${label}__${safeName(url)}${extFor(ct,url)}`),b)}catch(e){consoleLog.push(`persist ${r.url()}: ${e}`)}
}
page.on('request',r=>{const rec={url:r.url(),method:r.method(),resourceType:r.resourceType(),postData:r.postData()||''};requests.push(rec)});
page.on('response',r=>{pending.push((async()=>{try{const h=await r.allHeaders(),url=r.url(),ct=h['content-type']||'';responses.push({url,status:r.status(),contentType:ct,contentLength:h['content-length']||''});const should=wanted.some(x=>url.includes(x))||/\.(glb|gltf|bin|ktx2|wasm)(?:\?|$)/i.test(url);if(should&&r.ok())await persistResponse(r,'live')}catch(e){consoleLog.push(`response: ${e}`)}})())});
page.on('console',m=>consoleLog.push(`${m.type()}: ${m.text()}`));
page.on('pageerror',e=>consoleLog.push(`pageerror: ${e.message}`));
await page.goto(process.env.TARGET_URL,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(18000);
await page.waitForLoadState('networkidle',{timeout:15000}).catch(()=>{});
await Promise.allSettled(pending);

// Deterministically refetch important GET resources so body capture cannot race the browser events.
const important=[
 'https://api.cs2inspects.com/items/models',
 'https://api.cs2inspects.com/items/weapons2',
 'https://3dviewapi.cs2inspects.com/items',
 'https://3dviewapi.cs2inspects.com/paints',
 'https://3dviewapi.cs2inspects.com/settings/default',
 'https://3dviewapi.cs2inspects.com/camera-poses/7'
];
for(const url of important){try{const r=await ctx.request.get(url,{timeout:60000});const b=await r.body();const ct=r.headers()['content-type']||'';fs.writeFileSync(path.join(out,'bodies',`refetch__${safeName(url)}${extFor(ct,url)}`),b);consoleLog.push(`refetch ${r.status()} ${url} ${b.length}`)}catch(e){consoleLog.push(`refetch ${url}: ${e}`)}}

// Save the actual application JS bundle, not only its URL.
const bundle=[...new Set(requests.map(x=>x.url).filter(u=>u.includes('/assets/index-')&&u.endsWith('.js')))][0];
if(bundle){try{const r=await ctx.request.get(bundle,{timeout:60000});const b=await r.body();fs.writeFileSync(path.join(out,'bodies','app-bundle.js'),b);consoleLog.push(`bundle ${r.status()} ${bundle} ${b.length}`)}catch(e){consoleLog.push(`bundle: ${e}`)}}

// Replay the exact decode request observed from the viewer, including method and body.
const dec=[...requests].reverse().find(x=>x.url.includes('3dviewapi.cs2inspects.com/decode'));
if(dec){fs.writeFileSync(path.join(out,'decode-request.json'),JSON.stringify(dec,null,2));try{let r;if(dec.method==='POST')r=await ctx.request.post(dec.url,{data:dec.postData,headers:{'content-type':'application/json'},timeout:60000});else r=await ctx.request.get(dec.url,{timeout:60000});const b=await r.body();fs.writeFileSync(path.join(out,'bodies','decode-response.json'),b);consoleLog.push(`decode replay ${r.status()} ${b.length}`)}catch(e){consoleLog.push(`decode replay: ${e}`)}}

const data=await page.evaluate(()=>({url:location.href,title:document.title,scripts:[...document.scripts].map(s=>s.src).filter(Boolean),resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})),canvases:[...document.querySelectorAll('canvas')].map((c,i)=>({i,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight})),iframes:[...document.querySelectorAll('iframe')].map(x=>x.src)}));
fs.writeFileSync(path.join(out,'page.json'),JSON.stringify(data,null,2));
fs.writeFileSync(path.join(out,'page.html'),await page.content());
fs.writeFileSync(path.join(out,'body.txt'),(await page.locator('body').innerText()).slice(0,200000));
fs.writeFileSync(path.join(out,'responses.json'),JSON.stringify(responses,null,2));
fs.writeFileSync(path.join(out,'requests.json'),JSON.stringify(requests,null,2));
fs.writeFileSync(path.join(out,'console.txt'),consoleLog.join('\n'));
await browser.close();
