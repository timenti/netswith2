import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/aist-film-v91',exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
 const page=await ctx.newPage(); const errors=[],failed=[],responses=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
 page.on('response',r=>{const u=r.url();if(u.includes('jsdelivr.net')||u.includes('raw.githubusercontent.com'))responses.push({url:u,status:r.status()})});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(()=>document.getElementById('film')?.dataset.assetReady==='1',{timeout:60000});
 await page.waitForTimeout(1200);
 const state=await page.evaluate(()=>({assetReady:document.getElementById('film')?.dataset.assetReady||'',statusExists:!!document.getElementById('asset-status'),canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0},phase:document.getElementById('phase')?.textContent||'',shot:document.getElementById('film')?.dataset.shot||''}));
 await page.screenshot({path:path.join(out,view.name+'.png'),fullPage:false});
 const raw=responses.filter(x=>x.url.includes('raw.githubusercontent.com'));
 const bad=responses.filter(x=>x.status>=400);
 const relevantErrors=errors.filter(e=>!e.includes('Failed to load resource: the server responded with a status of 404'));
 report.views.push({...view,state,errors,relevantErrors,failed,bad,raw,responses}); await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(report.views.some(v=>v.state.assetReady!=='1'||v.state.statusExists||v.state.canvas.w===0||v.relevantErrors.length||v.failed.length||v.bad.length||v.raw.length))process.exit(2);
