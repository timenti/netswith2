import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/aist-film-v9',exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const configs=[
 {name:'desktop',width:1600,height:900,shots:[['hero',.02,'OBJECT'],['orbit',.075,'OBJECT'],['receiver',.145,'SCAN'],['reverse',.215,'SCAN'],['search',.305,'SEARCH'],['price-detail',.395,'PRICE'],['arb-turn',.52,'ARBITRAGE'],['risk',.60,'RISK'],['approval',.70,'APPROVAL'],['execution',.80,'EXECUTION'],['monitoring',.87,'MONITORING'],['pullback',.925,'SYSTEM'],['system',.96,'SYSTEM']]},
 {name:'mobile',width:390,height:844,shots:[['hero',.02,'OBJECT'],['receiver',.145,'SCAN'],['search',.305,'SEARCH'],['price-detail',.395,'PRICE'],['risk',.60,'RISK'],['approval',.70,'APPROVAL'],['execution',.80,'EXECUTION'],['monitoring',.87,'MONITORING'],['system',.96,'SYSTEM']]}
];
const report={url,views:[]};
for(const view of configs){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
 const page=await ctx.newPage(); const pageErrors=[],failed=[],bad=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
 page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()})});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(([w,h])=>{const c=document.querySelector('canvas'),f=document.getElementById('film');return c&&f&&c.width>=w&&c.height>=h&&f.offsetHeight>h*5},[view.width,view.height],{timeout:120000});
 const states=[];
 for(const [name,p,expected] of view.shots){
   await page.evaluate(p=>{const f=document.getElementById('film'),travel=Math.max(1,f.offsetHeight-innerHeight);scrollTo(0,travel*p)},p);
   await page.waitForTimeout(850);
   const state=await page.evaluate(()=>({phase:document.getElementById('phase')?.textContent||'',step:document.getElementById('step')?.textContent||'',shot:Number(document.getElementById('film')?.dataset.shot??-1),stageTop:document.getElementById('stage')?.getBoundingClientRect().top??999,scrollY,canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0}}));
   states.push({name,p,expected,state});
   await page.screenshot({path:path.join(out,`${view.name}-${name}.png`),fullPage:false});
 }
 const relevant=u=>u.includes('jsdelivr.net')||u.includes('raw.githubusercontent.com')||u.includes('timenti-aist-film-v9');
 const relevantFailed=failed.filter(x=>relevant(x.url)), relevantBad=bad.filter(x=>relevant(x.url));
 const distinctShots=new Set(states.map(s=>s.state.shot)).size;
 report.views.push({name:view.name,width:view.width,height:view.height,states,distinctShots,pageErrors,relevantFailed,relevantBad});
 await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
const broken=report.views.some(v=>v.pageErrors.length||v.relevantFailed.length||v.relevantBad.length||v.distinctShots<7||v.states.some(s=>s.state.phase!==s.expected||s.state.shot<0||Math.abs(s.state.stageTop)>2||!s.state.canvas.w||!s.state.canvas.h));
if(broken) process.exit(2);
