import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const out=process.argv[2]||'work/browser/cs2inspects';
fs.mkdirSync(out,{recursive:true});
const exe=process.env.CHROME_BIN;
if(!exe) throw new Error('CHROME_BIN not set');
const browser=await chromium.launch({headless:true,executablePath:exe,args:['--no-sandbox','--disable-dev-shm-usage','--enable-webgl','--ignore-gpu-blocklist','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1600,height:1000}});
const page=await ctx.newPage();
const responses=[]; const consoleLog=[];
page.on('response',async r=>{try{const h=await r.allHeaders();responses.push({url:r.url(),status:r.status(),contentType:h['content-type']||'',contentLength:h['content-length']||''})}catch{}});
page.on('console',m=>consoleLog.push(`${m.type()}: ${m.text()}`));
page.on('pageerror',e=>consoleLog.push(`pageerror: ${e.message}`));
await page.goto(process.env.TARGET_URL,{waitUntil:'domcontentloaded',timeout:120000});
await page.waitForTimeout(15000);
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
await page.screenshot({path:path.join(out,'debug-page.png'),fullPage:false});
await browser.close();
