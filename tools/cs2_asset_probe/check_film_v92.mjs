import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/aist-film-v92',exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
 const page=await ctx.newPage(); const errors=[],failed=[],responses=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
 page.on('response',r=>{const u=r.url();if(u.includes('/assets/')||u.endsWith('/film.js')||u.endsWith('/film.css'))responses.push({url:u,status:r.status(),fromServiceWorker:r.fromServiceWorker()})});
 const t0=Date.now();
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>document.getElementById('film')?.dataset.assetReady==='1',{timeout:15000});
 await page.waitForTimeout(300);
 const elapsed=Date.now()-t0;
 const state=await page.evaluate(()=>({assetReady:document.getElementById('film')?.dataset.assetReady||'',assetReadyMs:+(document.getElementById('film')?.dataset.assetReadyMs||0),assetLoadMs:+(document.getElementById('film')?.dataset.assetLoadMs||0),shot:document.getElementById('film')?.dataset.shot||'',canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0},resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/assets/')).map(x=>({name:x.name.split('/').pop(),duration:Math.round(x.duration),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize,decodedBodySize:x.decodedBodySize}))}));
 await page.screenshot({path:path.join(out,view.name+'.png'),fullPage:false});
 report.views.push({...view,elapsed,state,errors,failed,responses}); await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
const relevantFailure=v=>v.state.assetReady!=='1'||v.state.canvas.w===0||v.failed.some(x=>x.url.includes('/assets/')||x.url.endsWith('/film.js')||x.url.endsWith('/film.css'))||v.responses.some(r=>r.status>=400)||v.elapsed>5000||v.errors.some(e=>e.startsWith('pageerror:')||e.includes('AIST_')||e.includes('WebGL'));
if(report.views.some(relevantFailure))process.exit(2);
