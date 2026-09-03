import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const out = process.argv[2] || 'work/browser/skinshotter';
fs.mkdirSync(out,{recursive:true});
const exe=process.env.CHROME_BIN;
if(!exe) throw new Error('CHROME_BIN not set');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true});
const page=await ctx.newPage();
const responses=[];
const consoleLog=[];
page.on('response',async r=>{try{responses.push({url:r.url(),status:r.status(),contentType:(await r.allHeaders())['content-type']||'',contentLength:(await r.allHeaders())['content-length']||''})}catch{}});
page.on('console',m=>consoleLog.push(`${m.type()}: ${m.text()}`));
page.on('pageerror',e=>consoleLog.push(`pageerror: ${e.message}`));

await page.goto(process.env.TARGET_URL,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(8000);

async function snapshot(label){
  const data=await page.evaluate(()=>({
    url:location.href,
    title:document.title,
    inputs:[...document.querySelectorAll('input')].map((x,i)=>({i,type:x.type,name:x.name,value:x.value,min:x.min,max:x.max,step:x.step,aria:x.getAttribute('aria-label'),placeholder:x.placeholder})),
    buttons:[...document.querySelectorAll('button')].map((x,i)=>({i,text:(x.innerText||x.textContent||'').trim(),aria:x.getAttribute('aria-label'),title:x.getAttribute('title')})).filter(x=>x.text||x.aria||x.title),
    scripts:[...document.scripts].map(s=>s.src).filter(Boolean),
    links:[...document.querySelectorAll('link')].map(l=>({rel:l.rel,href:l.href})).filter(x=>x.href),
    resources:performance.getEntriesByType('resource').map(r=>({name:r.name,initiatorType:r.initiatorType,transferSize:r.transferSize,decodedBodySize:r.decodedBodySize}))
  }));
  fs.writeFileSync(path.join(out,`${label}.json`),JSON.stringify(data,null,2));
  fs.writeFileSync(path.join(out,`${label}.html`),await page.content());
  fs.writeFileSync(path.join(out,`${label}.txt`),(await page.locator('body').innerText()).slice(0,200000));
}
await snapshot('initial');

// Detect and set wear/pattern controls by numeric ranges. React-controlled inputs are updated
// through the native value setter and input/change events.
const setResult=await page.evaluate(({wear,seed})=>{
  const inputs=[...document.querySelectorAll('input')];
  const nativeSetter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;
  const changed=[];
  for(const el of inputs){
    const min=Number(el.min), max=Number(el.max), step=Number(el.step||0);
    let value=null, role='';
    if(Number.isFinite(max)&&max<=1.001&&max>0.05){ value=wear; role='wear'; }
    else if(Number.isFinite(max)&&max>=100&&max<=5000&&(step===1||!el.step)){ value=seed; role='pattern'; }
    if(value!==null){
      try{nativeSetter.call(el,String(value));}catch{el.value=String(value)}
      el.dispatchEvent(new Event('input',{bubbles:true}));
      el.dispatchEvent(new Event('change',{bubbles:true}));
      changed.push({role,type:el.type,min:el.min,max:el.max,step:el.step,value:el.value});
    }
  }
  return changed;
},{wear:process.env.TARGET_FLOAT,seed:process.env.TARGET_SEED});
fs.writeFileSync(path.join(out,'set-result.json'),JSON.stringify(setResult,null,2));
await page.waitForTimeout(7000);
await snapshot('configured');

// Open export panel if needed, then request the site's own exact texture export.
let downloadInfo={ok:false};
try{
  const direct=page.getByText('Export Textures',{exact:true});
  if(!(await direct.count()) || !(await direct.last().isVisible())){
    const exportButtons=page.getByText('Export',{exact:true});
    if(await exportButtons.count()) await exportButtons.last().click({timeout:5000});
    await page.waitForTimeout(1000);
  }
  const exportTextures=page.getByText('Export Textures',{exact:true}).last();
  if(await exportTextures.count()){
    const downloadPromise=page.waitForEvent('download',{timeout:30000});
    await exportTextures.click({timeout:10000});
    const dl=await downloadPromise;
    const suggested=dl.suggestedFilename()||'exact-skin-textures.zip';
    const save=path.join(out,suggested);
    await dl.saveAs(save);
    downloadInfo={ok:true,suggestedFilename:suggested,path:save};
  }else downloadInfo={ok:false,error:'Export Textures control not found'};
}catch(e){downloadInfo={ok:false,error:String(e)};}
fs.writeFileSync(path.join(out,'download.json'),JSON.stringify(downloadInfo,null,2));
await page.waitForTimeout(3000);
await snapshot('final');
fs.writeFileSync(path.join(out,'responses.json'),JSON.stringify(responses,null,2));
fs.writeFileSync(path.join(out,'console.txt'),consoleLog.join('\n'));
await page.screenshot({path:path.join(out,'debug-page.png'),fullPage:false});
await browser.close();
