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
const responses=[]; const consoleLog=[]; const bodyTasks=[];
const wanted=[
  '/items/models','/items/weapons2','/camera-poses/7','/items','/settings/default','/paints','/decode',
  '/assets/index-'
];
function safeName(url){
  const u=new URL(url); let s=(u.hostname+u.pathname).replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'');
  if(u.search) s+='__'+u.search.slice(1).replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,120);
  return s.slice(0,220)||'response';
}
page.on('response',async r=>{
  try{
    const h=await r.allHeaders(), url=r.url(), ct=h['content-type']||'';
    responses.push({url,status:r.status(),contentType:ct,contentLength:h['content-length']||''});
    const should=wanted.some(x=>url.includes(x)) || /\.(glb|gltf|bin|ktx2|wasm)(?:\?|$)/i.test(url);
    if(should && r.status()>=200 && r.status()<300){
      bodyTasks.push((async()=>{
        try{
          const b=await r.body();
          if(b.length>25*1024*1024) return;
          let ext='.bin';
          if(/json/i.test(ct)) ext='.json'; else if(/javascript|text\/javascript/i.test(ct)||/\.js(?:\?|$)/i.test(url)) ext='.js'; else if(/text\//i.test(ct)) ext='.txt';
          fs.writeFileSync(path.join(out,'bodies',safeName(url)+ext),b);
        }catch(e){ consoleLog.push(`capture-body ${url}: ${e}`); }
      })());
    }
  }catch(e){consoleLog.push(`response: ${e}`)}
});
page.on('console',m=>consoleLog.push(`${m.type()}: ${m.text()}`));
page.on('pageerror',e=>consoleLog.push(`pageerror: ${e.message}`));
await page.goto(process.env.TARGET_URL,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(18000);
await Promise.allSettled(bodyTasks);
const data=await page.evaluate(()=>({
  url:location.href,title:document.title,
  scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
  resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize})),
  canvases:[...document.querySelectorAll('canvas')].map((c,i)=>({i,width:c.width,height:c.height,clientWidth:c.clientWidth,clientHeight:c.clientHeight})),
  iframes:[...document.querySelectorAll('iframe')].map(x=>x.src)
}));
fs.writeFileSync(path.join(out,'page.json'),JSON.stringify(data,null,2));
fs.writeFileSync(path.join(out,'page.html'),await page.content());
fs.writeFileSync(path.join(out,'body.txt'),(await page.locator('body').innerText()).slice(0,200000));
fs.writeFileSync(path.join(out,'responses.json'),JSON.stringify(responses,null,2));
fs.writeFileSync(path.join(out,'console.txt'),consoleLog.join('\n'));
await browser.close();
