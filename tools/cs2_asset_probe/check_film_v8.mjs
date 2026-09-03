import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const url=process.env.PREVIEW_URL,out=process.argv[2]||'work/aist-film-v8',exe=process.env.CHROME_BIN;
if(!url||!exe) throw new Error('PREVIEW_URL and CHROME_BIN required');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--ignore-gpu-blocklist','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const report={url,views:[]};
const DESKTOP=[['hero',.03,'OBJECT'],['scan',.16,'SCAN'],['search',.28,'SEARCH'],['price',.42,'PRICE'],['arbitrage',.53,'ARBITRAGE'],['risk',.62,'RISK'],['approval',.70,'APPROVAL'],['execution',.80,'EXECUTION'],['monitoring',.88,'MONITORING'],['system',.96,'SYSTEM']];
const MOBILE=[['hero',.03,'OBJECT'],['scan',.16,'SCAN'],['search',.28,'SEARCH'],['price',.42,'PRICE'],['risk',.62,'RISK'],['approval',.70,'APPROVAL'],['execution',.80,'EXECUTION'],['system',.96,'SYSTEM']];
for(const view of [{name:'desktop',width:1600,height:900,shots:DESKTOP},{name:'mobile',width:390,height:844,shots:MOBILE}]){
 const ctx=await browser.newContext({viewport:{width:view.width,height:view.height},deviceScaleFactor:1});
 const page=await ctx.newPage(); const consoleErrors=[],pageErrors=[],failed=[],bad=[];
 page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text())});
 page.on('pageerror',e=>pageErrors.push(e.message));
 page.on('requestfailed',r=>failed.push({url:r.url(),error:r.failure()?.errorText||''}));
 page.on('response',r=>{if(r.status()>=400)bad.push({url:r.url(),status:r.status()})});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
 await page.waitForFunction(([w,h])=>{const c=document.querySelector('canvas'),f=document.getElementById('film');return c&&f&&c.width>=w&&c.height>=h&&f.offsetHeight>h*5},[view.width,view.height],{timeout:120000});
 const states=[];
 for(const [name,p,expected] of view.shots){
  await page.evaluate((p)=>{const f=document.getElementById('film'),vh=window.innerHeight,travel=Math.max(1,f.offsetHeight-vh);scrollTo(0,travel*p)},p);
  await page.waitForTimeout(650);
  const state=await page.evaluate(()=>{const st=document.getElementById('stage')?.getBoundingClientRect(),copy=document.querySelector('.copy')?.getBoundingClientRect();return{phase:document.getElementById('phase')?.textContent||'',step:document.getElementById('step')?.textContent||'',title:document.getElementById('title')?.textContent||'',scrollY,filmH:document.getElementById('film')?.offsetHeight||0,canvas:{w:document.querySelector('canvas')?.width||0,h:document.querySelector('canvas')?.height||0},stage:st?{top:Math.round(st.top),bottom:Math.round(st.bottom),h:Math.round(st.height)}:null,copy:copy?{left:Math.round(copy.left),top:Math.round(copy.top),right:Math.round(copy.right),bottom:Math.round(copy.bottom)}:null}});
  states.push({name,p,expected,state,phaseOk:state.phase===expected,stickyOk:!!state.stage&&Math.abs(state.stage.top)<=2&&state.stage.bottom>view.height-3});
  await page.screenshot({path:path.join(out,`${view.name}-${name}.png`),fullPage:false});
 }
 const relevant=u=>u.includes('jsdelivr.net')||u.includes('raw.githubusercontent.com')||u.includes('timenti-aist-film-v8');
 const relevantFailed=failed.filter(x=>relevant(x.url)),relevantBad=bad.filter(x=>relevant(x.url));
 report.views.push({name:view.name,width:view.width,height:view.height,states,consoleErrors,pageErrors,relevantFailed,relevantBad});
 await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
const broken=report.views.some(v=>v.pageErrors.length||v.relevantFailed.length||v.relevantBad.length||v.states.some(s=>!s.phaseOk||!s.stickyOk||!s.state.phase||s.state.canvas.w===0||s.state.canvas.h===0));
if(broken) process.exit(2);
