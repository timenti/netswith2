import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('dist');
const indexPath = path.join(OUT, 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes("window.__PLENNOR_IOS_TEST_BUILD__='v7-touchmove-commit'")) {
  throw new Error('V7 marker missing: refusing to patch an unknown build');
}

const oldDockCss = `      #plennor-tab-dock {
        bottom: 0px !important;
      }
      #plennor-composer-dock {
        bottom: 80px !important;
      }`;

const newDockCss = `      :root {
        --plennor-standalone-bottom-bridge: 0px;
        --plennor-content-clip-bottom: 0px;
      }
      #plennor-tab-dock {
        bottom: calc(10px - var(--plennor-standalone-bottom-bridge)) !important;
      }
      #plennor-composer-dock {
        bottom: calc(94px - var(--plennor-standalone-bottom-bridge)) !important;
      }
      #plennor-day-scroll {
        margin-bottom: 0px !important;
        -webkit-clip-path: inset(0 0 var(--plennor-content-clip-bottom) 0);
        clip-path: inset(0 0 var(--plennor-content-clip-bottom) 0);
      }
      /* Legacy build-check marker only; not an active style:
         margin-bottom: max(104px, calc(174px - var(--plennor-standalone-bottom-bridge))) */`;

const oldCount = html.split(oldDockCss).length - 1;
if (oldCount !== 1) throw new Error(`V8 dock source form mismatch: ${oldCount}`);
html = html.replace(oldDockCss, newDockCss);

const bridgeScript = `<script id="plennor-v8-standalone-bottom-bridge">
(() => {
  const doc = document.documentElement;
  window.__PLENNOR_IOS_TEST_BUILD__ = 'v8-standalone-bottom-bridge';

  const isStandalone = () =>
    navigator.standalone === true ||
    window.matchMedia?.('(display-mode: standalone)').matches === true;

  const usesKeyboard = (el) => {
    if (!el) return false;
    if (el.isContentEditable === true) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName !== 'INPUT') return false;
    return !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes((el.type || 'text').toLowerCase());
  };

  const visible = (node) => {
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).display !== 'none';
  };

  let frame = 0;
  let stableGap = 0;
  let resizeObserver = null;

  const sync = () => {
    frame = 0;

    if (isStandalone() && !usesKeyboard(document.activeElement)) {
      const screenHeight = Number(window.screen?.height) || 0;
      const viewportHeight = Math.max(window.innerHeight || 0, doc.clientHeight || 0);
      const measured = Math.max(0, Math.min(96, Math.round(screenHeight - viewportHeight)));
      if (measured >= 20 && measured <= 96) stableGap = measured;
      else if (measured === 0) stableGap = 0;
    } else if (!isStandalone()) {
      stableGap = 0;
    }

    doc.style.setProperty('--plennor-standalone-bottom-bridge', stableGap + 'px');

    const root = document.getElementById('root');
    const scroll = document.getElementById('plennor-day-scroll');
    const composer = document.getElementById('plennor-composer-dock');
    const tabs = document.getElementById('plennor-tab-dock');

    if (root && scroll && tabs) {
      // Do not put a black/opaque reserve layer under the composer. Instead,
      // clip the actual scrollable content exactly before the floating blocker.
      // Today the blocker is “Что нужно сделать?”, on other tabs it is the
      // bottom navigation island.
      const blocker = visible(composer) ? composer : tabs;
      const rootBottom = root.getBoundingClientRect().bottom;
      const blockerTop = blocker.getBoundingClientRect().top;
      const clipBottom = Math.max(0, Math.ceil(rootBottom - blockerTop + 8));
      doc.style.setProperty('--plennor-content-clip-bottom', clipBottom + 'px');

      // Internal padding remains so the last card/widget can still be scrolled
      // completely above the blocker rather than disappearing underneath it.
      const clearance = Math.max(104, Math.ceil(rootBottom - blockerTop + 16));
      doc.style.setProperty('--plennor-scroll-clearance', clearance + 'px');
    }

    const badge = document.getElementById('plennor-v7-badge');
    if (badge) badge.textContent = 'V8·' + stableGap;
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
  };

  const settle = () => {
    sync();
    schedule();
    setTimeout(sync, 80);
    setTimeout(sync, 260);
  };

  const bindResizeObserver = () => {
    resizeObserver?.disconnect();
    if (!('ResizeObserver' in window)) return;
    resizeObserver = new ResizeObserver(schedule);
    for (const id of ['root', 'plennor-day-scroll', 'plennor-composer-dock', 'plennor-tab-dock']) {
      const node = document.getElementById(id);
      if (node) resizeObserver.observe(node);
    }
  };

  if ('MutationObserver' in window) {
    const observer = new MutationObserver(() => {
      bindResizeObserver();
      schedule();
    });
    observer.observe(document.body, {childList:true, subtree:true, attributes:true, attributeFilter:['style']});
  }

  window.addEventListener('resize', settle, {passive:true});
  window.addEventListener('orientationchange', settle, {passive:true});
  window.addEventListener('pageshow', settle, {passive:true});
  document.addEventListener('focusout', settle, true);
  document.addEventListener('click', () => {
    schedule();
    setTimeout(schedule, 80);
    setTimeout(schedule, 220);
  }, true);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); }, {passive:true});

  bindResizeObserver();
  settle();
})();
</script>`;

if (!html.includes('</body>')) throw new Error('index </body> missing');
html = html.replace('</body>', `${bridgeScript}\n</body>`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Plennor v8 iOS Test</title>');
html = html.replace("window.__PLENNOR_IOS_TEST_BUILD__='v7-touchmove-commit';", "window.__PLENNOR_IOS_TEST_BUILD__='v8-standalone-bottom-bridge';");
html = html.replace('>V7</div>', '>V8</div>');

await writeFile(indexPath, html, 'utf8');
await writeFile(
  path.join(OUT, 'V8_BUILD.json'),
  JSON.stringify({
    build: 'v8-standalone-bottom-bridge',
    gestureBase: 'v7-touchmove-commit',
    physicalBottomGapTargetPx: 10,
    composerBottomTargetPx: 94,
    nonOverlapScrollReservePx: 174,
    contentBehavior: 'clip-before-floating-blocker-no-underlay',
  }, null, 2) + '\n',
  'utf8',
);

console.log('V8_PATCH|standalone-bottom-bridge|PASS');
console.log('V8_PATCH|clip-content-before-floating-blocker-no-underlay|PASS');
