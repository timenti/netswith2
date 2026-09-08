import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('dist');
const indexPath = path.join(OUT, 'index.html');
let html = await readFile(indexPath, 'utf8');

if (!html.includes("window.__PLENNOR_IOS_TEST_BUILD__='v8-standalone-bottom-bridge'")) {
  throw new Error('V8 marker missing: refusing to patch an unknown build');
}

// V8 used margin-bottom on the entire scroll view. That created a visible
// empty/black reserve region, which is not the requested UX. The content area
// should instead remain visually continuous and simply stop rendering/hit-
// testing before the floating composer/navigation begins.
const oldScrollRule = `      /* Keep the scroll viewport above the composer instead of allowing
         cards/content to render underneath the floating input panel. */
      #plennor-day-scroll {
        margin-bottom: max(104px, calc(174px - var(--plennor-standalone-bottom-bridge))) !important;
      }`;

const newScrollRule = `      :root {
        --plennor-content-clip-bottom: 0px;
      }
      #plennor-day-scroll {
        margin-bottom: 0px !important;
        -webkit-clip-path: inset(0 0 var(--plennor-content-clip-bottom) 0);
        clip-path: inset(0 0 var(--plennor-content-clip-bottom) 0);
      }`;

const oldCount = html.split(oldScrollRule).length - 1;
if (oldCount !== 1) throw new Error(`V9 scroll source form mismatch: ${oldCount}`);
html = html.replace(oldScrollRule, newScrollRule);

const viewportScript = `<script id="plennor-v9-content-viewport">
(() => {
  const doc = document.documentElement;
  window.__PLENNOR_IOS_TEST_BUILD__ = 'v9-clipped-content-viewport';

  let frame = 0;
  let resizeObserver = null;

  const visible = (node) => {
    if (!node) return false;
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0 && getComputedStyle(node).display !== 'none';
  };

  const sync = () => {
    frame = 0;
    const root = document.getElementById('root');
    const scroll = document.getElementById('plennor-day-scroll');
    const composer = document.getElementById('plennor-composer-dock');
    const tabs = document.getElementById('plennor-tab-dock');
    if (!root || !scroll || !tabs) return;

    // Today: content stops just above “Что нужно сделать?”.
    // Other tabs: content stops just above the bottom navigation island.
    const blocker = visible(composer) ? composer : tabs;
    const rootBottom = root.getBoundingClientRect().bottom;
    const blockerTop = blocker.getBoundingClientRect().top;
    const clipBottom = Math.max(0, Math.ceil(rootBottom - blockerTop + 8));

    doc.style.setProperty('--plennor-content-clip-bottom', clipBottom + 'px');

    // Preserve enough internal scroll padding so the last card can still be
    // scrolled completely above the blocker; do not add any opaque underlay.
    const clearance = Math.max(104, Math.ceil(rootBottom - blockerTop + 16));
    doc.style.setProperty('--plennor-scroll-clearance', clearance + 'px');

    const badge = document.getElementById('plennor-v7-badge');
    if (badge) badge.textContent = 'V9';
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(sync);
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

  const mutationObserver = new MutationObserver(() => {
    bindResizeObserver();
    schedule();
  });
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['style'],
  });

  window.addEventListener('resize', schedule, {passive:true});
  window.addEventListener('orientationchange', schedule, {passive:true});
  window.addEventListener('pageshow', schedule, {passive:true});
  document.addEventListener('click', () => {
    schedule();
    setTimeout(schedule, 80);
    setTimeout(schedule, 220);
  }, true);

  bindResizeObserver();
  schedule();
  setTimeout(schedule, 100);
  setTimeout(schedule, 350);
})();
</script>`;

if (!html.includes('</body>')) throw new Error('index </body> missing');
html = html.replace('</body>', `${viewportScript}\n</body>`);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Plennor v9 iOS Test</title>');
html = html.replace("window.__PLENNOR_IOS_TEST_BUILD__='v8-standalone-bottom-bridge';", "window.__PLENNOR_IOS_TEST_BUILD__='v9-clipped-content-viewport';");
html = html.replace(/>V8<\/div>/, '>V9</div>');

await writeFile(indexPath, html, 'utf8');
await writeFile(
  path.join(OUT, 'V9_BUILD.json'),
  JSON.stringify({
    build: 'v9-clipped-content-viewport',
    gestureBase: 'v7-touchmove-commit',
    bottomBridgeBase: 'v8-standalone-bottom-bridge',
    contentBehavior: 'clip-before-floating-blocker-no-underlay',
    blockerGapPx: 8,
  }, null, 2) + '\n',
  'utf8',
);

console.log('V9_PATCH|remove-scroll-margin-underlay|PASS');
console.log('V9_PATCH|clip-content-before-floating-blocker|PASS');
