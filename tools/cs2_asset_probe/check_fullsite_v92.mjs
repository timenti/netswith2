import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/fullsite-v92',exe=process.env.CHROME_BIN;
if(!url||!exe)throw new Error('PREVIEW_URL and CHROME_BIN required');fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900},{name:'mobile',width:390,height:844}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});const page=await ctx.newPage();const errors=[],failed=[],assetResponses=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));page.on('response',r=>{if(r.url().includes('/aist-fast/'))assetResponses.push({url:r.url(),status:r.status()})});
 const navStart=Date.now();await page.goto(url,{waitUntil:'domcontentloaded',timeout:60000});await page.waitForSelector('a[href="/projects/aist/"]',{timeout:30000});
 await page.waitForFunction(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/aist-fast/')).length>=4,{timeout:10000});await page.waitForTimeout(150);
 const preloadAt=Date.now()-navStart;const preload=await page.evaluate(()=>performance.getEntriesByType('resource').filter(x=>x.name.includes('/aist-fast/')).map(x=>({name:x.name.split('/').pop(),duration:Math.round(x.duration),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize})));await page.screenshot({path:path.join(out,view.name+'-home.png')});
 const clickAt=Date.now();await page.locator('a[href="/projects/aist/"]').first().click();await page.waitForFunction(()=>location.pathname.replace(/\/$/,'')==='/projects/aist',{timeout:15000});await page.waitForSelector('#aist-film-v92',{timeout:15000});await page.waitForFunction(()=>document.getElementById('aist-film-v92')?.dataset.assetReady==='1',{timeout:10000});await page.waitForTimeout(150);const aistReadyAfterClick=Date.now()-clickAt;
 const state=await page.evaluate(()=>{const f=document.getElementById('aist-film-v92'),c=f?.querySelector('canvas');return{path:location.pathname,assetReady:f?.dataset.assetReady||'',assetLoadMs:+(f?.dataset.assetLoadMs||0),shot:f?.dataset.shot||'',canvas:{w:c?.width||0,h:c?.height||0},stageTop:Math.round(f?.querySelector('.stage')?.getBoundingClientRect().top||9999),resources:performance.getEntriesByType('resource').filter(x=>x.name.includes('/aist-fast/')).map(x=>({name:x.name.split('/').pop(),duration:Math.round(x.duration),transferSize:x.transferSize,encodedBodySize:x.encodedBodySize}))}});await page.screenshot({path:path.join(out,view.name+'-aist.png')});
 report.views.push({...view,preloadAt,aistReadyAfterClick,preload,state,errors,failed,assetResponses});await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(report.views.some(v=>v.errors.length||v.failed.some(x=>x.url.includes('/aist-fast/'))||v.assetResponses.some(x=>x.status>=400)||v.state.assetReady!=='1'||v.state.canvas.w===0||v.aistReadyAfterClick>2500))process.exit(2);
