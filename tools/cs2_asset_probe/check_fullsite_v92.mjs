import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/fullsite-v92',exe=process.env.CHROME_BIN;
if(!url||!exe)throw new Error('PREVIEW_URL and CHROME_BIN required');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});const page=await ctx.newPage();const errors=[],failed=[];
 page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon'))errors.push('console: '+m.text())});
 page.on('pageerror',e=>{if(!e.message.includes("setting 'content'"))errors.push('pageerror: '+e.message)});
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
 const navStart=Date.now();await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('a[href="/projects/aist/"]',{timeout:30000});
 await page.waitForFunction(()=>{const rs=performance.getEntriesByType('resource');return rs.filter(x=>x.name.includes('/aist-fast/')).length>=4&&rs.some(x=>x.name.includes('/aist-film/site-runtime.bundle.js'))},{timeout:12000});
 await page.waitForTimeout(100);const preloadAt=Date.now()-navStart;
 const preload=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/aist-fast/')||x.name.includes('/aist-film/site-runtime.bundle.js')).map(x=>({name:x.name.split('/').pop(),duration:Math.round(x.duration),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize})));await page.screenshot({path:path.join(out,view.name+'-home.png')});
 await page.evaluate(()=>performance.clearResourceTimings());
 const clickAt=Date.now();await page.locator('a[href="/projects/aist/"]').first().click();
 await page.waitForFunction(()=>location.pathname.replace(/\/$/,'')==='/projects/aist'&&document.getElementById('aist-film-v92')?.dataset.assetReady==='1',{timeout:4000});
 const aistReadyAfterClick=Date.now()-clickAt;await page.waitForTimeout(50);
 const state=await page.evaluate(()=>{const f=document.getElementById('aist-film-v92'),c=f?.querySelector('canvas');return{path:location.pathname,assetReady:f?.dataset.assetReady||'',assetLoadMs:+(f?.dataset.assetLoadMs||0),canvas:{w:c?.width||0,h:c?.height||0},stageTop:Math.round(f?.querySelector('.stage')?.getBoundingClientRect().top||9999),postClickResources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/aist-fast/')||x.name.includes('/aist-film/site-runtime.bundle.js')).map(x=>({name:x.name.split('/').pop(),duration:Math.round(x.duration),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize}))}});
 await page.screenshot({path:path.join(out,view.name+'-aist.png')});report.views.push({...view,preloadAt,aistReadyAfterClick,preload,state,errors,failed});await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
const bad=report.views.some(v=>v.state.assetReady!=='1'||v.state.canvas.w===0||v.aistReadyAfterClick>1200||v.errors.length||v.failed.some(x=>x.url.includes('/aist-fast/')||x.url.includes('/aist-film/'))||v.state.postClickResources.some(r=>r.transferSize>0));
if(bad)process.exit(2);
