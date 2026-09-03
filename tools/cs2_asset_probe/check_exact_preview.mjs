import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const url=process.env.PREVIEW_URL;
const out=process.argv[2]||'work/exact-preview-check';
const exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900},{name:'mobile',width:390,height:844}]){
  const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const errors=[]; const failed=[]; const badResponses=[];
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('pageerror',e=>errors.push('pageerror: '+e.message));
  page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
  page.on('response',r=>{if(r.status()>=400)badResponses.push({url:r.url(),status:r.status()})});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  let ready=false;
  try{await page.waitForFunction(()=>document.getElementById('app')?.classList.contains('ready'),null,{timeout:120000});ready=true}catch{}
  await page.waitForTimeout(2000);
  const state=await page.evaluate(()=>({ready:document.getElementById('app')?.classList.contains('ready')||false,failure:document.getElementById('app')?.classList.contains('failure')||false,status:document.getElementById('status')?.textContent||'',canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0}}));
  await page.screenshot({path:path.join(out,view.name+'.png'),fullPage:false});
  report.views.push({...view,ready,state,errors,failed,badResponses});
  await ctx.close();
}
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
await browser.close();
if(report.views.some(v=>!v.ready||v.state.failure||v.errors.length||v.failed.length||v.badResponses.length)) process.exit(2);
