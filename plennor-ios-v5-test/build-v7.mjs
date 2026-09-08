import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://plennor.vercel.app';
const OUT = path.resolve('dist');
const UA = 'Plennor-iOS-v7-Isolated-Test/1.0';

function count(text, needle) {
  return needle ? text.split(needle).length - 1 : 0;
}

function replaceExactlyOnce(text, before, after, label) {
  const oldCount = count(text, before);
  const newCount = count(text, after);
  if (oldCount !== 1 || newCount !== 0) {
    throw new Error(`${label}: expected old=1/new=0, got old=${oldCount}/new=${newCount}`);
  }
  const next = text.replace(before, after);
  if (count(next, before) !== 0 || count(next, after) !== 1) {
    throw new Error(`${label}: verification failed`);
  }
  console.log(`V7_PATCH|${label}|PASS`);
  return next;
}

function sourceUrl(urlPath) {
  return new URL(urlPath, SOURCE).toString();
}

async function fetchBytes(urlPath, optional = false) {
  const response = await fetch(sourceUrl(urlPath), {
    redirect: 'follow',
    headers: { 'user-agent': UA },
  });
  if (!response.ok) {
    if (optional) return null;
    throw new Error(`download ${urlPath} -> ${response.status}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function fetchText(urlPath) {
  return (await fetchBytes(urlPath)).toString('utf8');
}

async function writeDist(urlPath, data) {
  const rel = urlPath.replace(/^\/+/, '') || 'index.html';
  const target = path.join(OUT, rel);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

let html = await fetchText('/');
html = html.replace(/<script>\(function\(\)\{function c\(\).*?<\/script>/s, '');
if (!html.includes('id="plennor-shell"')) throw new Error('live shell marker missing');

const bundleMatch = html.match(/<script\s+src=["']([^"']*\/_expo\/static\/js\/web\/index-[^"']+\.js)["'][^>]*>/);
if (!bundleMatch) throw new Error('live bundle path not found');
const oldBundlePath = bundleMatch[1];
let bundle = await fetchText(oldBundlePath);
console.log(`V7_SOURCE|bundle=${oldBundlePath}|bytes=${bundle.length}`);

// Keep the release-side cleanup fixes.
bundle = replaceExactlyOnce(
  bundle,
  'l=!1,n=null,q=0,o&&c.current.onCancel()',
  'l=!1,n=null,q=0,p=!1,o&&c.current.onCancel()',
  'cancel-resets-click-suppression',
);

bundle = replaceExactlyOnce(
  bundle,
  'P=()=>{f(),o=!1},C=e=>',
  'P=()=>{if(l&&n){const e=q;l=!1,n=null,q=0,p=!1,c.current.disabled?c.current.onCancel():c.current.onEnd(e)}else f();o=!1},C=e=>',
  'touchcancel-commits-horizontal-drag',
);

// iOS evidence from the real screen recording: touchmove is reliable, while
// release still rolls the UI back. Stop depending on the terminal event.
// Once the user crosses a deliberate 105px horizontal threshold, commit the
// existing component's onEnd() immediately from touchmove and close the
// gesture. This uses the app's own tab/day/task action logic, but no longer
// depends on touchend/touchcancel ordering in WebKit.
bundle = replaceExactlyOnce(
  bundle,
  'q=u,s.preventDefault(),c.current.onMove(u)}',
  'q=u,s.preventDefault(),c.current.onMove(u),Math.abs(u)>=105&&(l=!1,n=null,q=0,p=!1,c.current.disabled?c.current.onCancel():c.current.onEnd(u))}',
  'commit-locked-drag-from-touchmove',
);

// Keep the floating island at the viewport edge in the isolated build.
const oldDockCss = `      #plennor-tab-dock {
        bottom: calc(
          100dvh - var(--plennor-height) - var(--plennor-top) +
            var(--plennor-bottom) + 8px
        ) !important;
      }
      #plennor-composer-dock {
        bottom: calc(
          100dvh - var(--plennor-height) - var(--plennor-top) +
            var(--plennor-bottom) + 88px
        ) !important;
      }`;
const newDockCss = `      #plennor-tab-dock {
        bottom: 0px !important;
      }
      #plennor-composer-dock {
        bottom: 80px !important;
      }`;
html = replaceExactlyOnce(html, oldDockCss, newDockCss, 'bottom-docks-zero-gap');

if (!html.includes("window.__PLENNOR_IOS_VIEWPORT_FIX__ = 'v2-fixed-dvh'")) {
  throw new Error('v2-fixed-dvh marker missing');
}
console.log('V7_PATCH|fixed-dvh-kept|PASS');

const digest = createHash('sha256').update(bundle).digest('hex');
const newBundlePath = oldBundlePath.replace(/index-[^/]+\.js$/, `index-v7-${digest.slice(0, 24)}.js`);
html = html.replace(oldBundlePath, newBundlePath);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Plennor v7 iOS Test</title>');

// Visible marker: this makes it impossible to mistake this build for an older
// cached preview while we diagnose on the physical iPhone.
const marker = `<script id="plennor-v7-marker">window.__PLENNOR_IOS_TEST_BUILD__='v7-touchmove-commit';</script>
<style id="plennor-v7-badge-style">#plennor-v7-badge{position:fixed;z-index:2147483647;top:calc(env(safe-area-inset-top,0px) + 4px);left:50%;transform:translateX(-50%);font:700 10px/1 system-ui;color:#080808;background:#fff;border-radius:999px;padding:4px 7px;pointer-events:none;opacity:.9}</style>`;
if (!html.includes('</head>')) throw new Error('index </head> missing');
html = html.replace('</head>', `${marker}\n</head>`);
html = html.replace('<body>', '<body><div id="plennor-v7-badge">V7</div>');

await writeDist('/', Buffer.from(html, 'utf8'));
await writeDist(newBundlePath, Buffer.from(bundle, 'utf8'));

const manifestBytes = await fetchBytes('/manifest.webmanifest', true);
if (manifestBytes) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  manifest.name = 'Plennor v7 Test';
  manifest.short_name = 'Plennor v7';
  manifest.start_url = '/';
  manifest.scope = '/';
  manifest.display = 'standalone';
  await writeDist('/manifest.webmanifest', Buffer.from(JSON.stringify(manifest), 'utf8'));
  for (const icon of manifest.icons || []) {
    if (typeof icon?.src === 'string' && icon.src.startsWith('/')) {
      const bytes = await fetchBytes(icon.src, true);
      if (bytes) await writeDist(icon.src, bytes);
    }
  }
}

for (const asset of ['/favicon.ico', '/icons/apple-touch-icon.png']) {
  const bytes = await fetchBytes(asset, true);
  if (bytes) await writeDist(asset, bytes);
}

const liveSw = await fetchText('/sw.js');
const assetsMatch = liveSw.match(/const\s+ASSETS\s*=\s*(\[[\s\S]*?\]);/);
if (assetsMatch) {
  for (const asset of JSON.parse(assetsMatch[1])) {
    if (typeof asset !== 'string' || !asset.startsWith('/')) continue;
    if (asset === '/' || asset === '/manifest.webmanifest' || asset === '/sw.js' || asset === oldBundlePath) continue;
    const bytes = await fetchBytes(asset, true);
    if (bytes) await writeDist(asset, bytes);
  }
}

const sw = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.clients.claim()})()));\n`;
await writeDist('/sw.js', Buffer.from(sw, 'utf8'));

const summary = {
  source: SOURCE,
  oldBundlePath,
  newBundlePath,
  bundleSha256: digest,
  build: 'v7-touchmove-commit',
  commitThresholdPx: 105,
};
await writeDist('/V7_BUILD.json', Buffer.from(JSON.stringify(summary, null, 2), 'utf8'));
console.log('V7_BUILD|PASS|' + JSON.stringify(summary));
