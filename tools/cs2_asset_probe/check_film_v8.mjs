import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/aist-film-v8',exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
for(const view of [{name:'desktop',width:1600,height:900,shots:[['hero',.02],['scan',.16],['price',.42],['approval',.70],['system',.96]]},{name:'mobile',width:390,height:844,shots:[['hero',.02],['scan',.16],['approval',.70],['system',.96]]}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
 const page=await ctx.newPage(); const errors=[],failed=[],bad=[];
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text())}); page.on('pageerror',e=>errors.push('pageerror: '+e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''})); page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()})});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(([w,h])=>{const c=document.querySelector('canvas'),f=document.getElementById('film');return c&&f&&c.width>=w&&c.height>=h&&f.offsetHeight>h*5},[view.width,view.height],{timeout:120000});
 const states=[];
 for(const [name,p] of view.shots){
  await page.evaluate((p)=>{const f=document.getElementById('film'),vh=window.innerHeight,travel=Math.max(1,f.offsetHeight-vh);scrollTo(0,travel*p)},p);
  await page.waitForTimeout(700);
  const state=await page.evaluate(()=>({phase:document.getElementById('phase')?.textContent||'',step:document.getElementById('step')?.textContent||'',title:document.getElementById('title')?.textContent||'',scrollY,filmH:document.getElementById('film')?.offsetHeight||0,canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0}}));
  states.push({name,p,state}); await page.screenshot({path:path.join(out,`${view.name}-${name}.png`),fullPage:false});
 }
 const relevant=u=>u.includes('jsdelivr.net')||u.includes('raw.githubusercontent.com')||u.includes('timenti-aist-film-v8');
 const relevantFailed=failed.filter(x=>relevant(x.url)),relevantBad=bad.filter(x=>relevant(x.url));
 report.views.push({name:view.name,width:view.width,height:view.height,states,errors,relevantFailed,relevantBad}); await ctx.close();
}
await browser.close(); fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
if(report.views.some(v=>v.errors.length||v.relevantFailed.length||v.relevantBad.length||v.states.some(s=>!s.state.phase||s.state.canvas.w===0)))process.exit(2);
