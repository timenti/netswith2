import { createHash } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = 'https://plennor.vercel.app';
const OUT = path.resolve('dist');
const UA = 'Plennor-iOS-v6-Isolated-Test/1.0';

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
    throw new Error(`${label}: post-replacement verification failed`);
  }
  console.log(`V6_PATCH|${label}|PASS`);
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
  const bytes = await fetchBytes(urlPath);
  return bytes.toString('utf8');
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
if (!html.includes('id="plennor-shell"')) throw new Error('live Plennor shell marker missing');

const bundleMatch = html.match(/<script\s+src=["']([^"']*\/_expo\/static\/js\/web\/index-[^"']+\.js)["'][^>]*>/);
if (!bundleMatch) throw new Error('live bundle path not found');
const oldBundlePath = bundleMatch[1];
let bundle = await fetchText(oldBundlePath);
console.log(`V6_SOURCE|bundle=${oldBundlePath}|bytes=${bundle.length}`);

// Root cause seen on real iOS: Safari can finish a horizontal drag with
// touchcancel. Live Plennor currently calls onCancel() there, so the UI moves
// during the drag and springs back on release. Commit the locked drag instead.
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

// The live shell still adds the full iPhone safe-area inset plus 8px below
// the floating island. The island itself already has enough height, so this
// duplicates bottom clearance. Anchor it to the viewport edge and keep the
// composer exactly 80px above it.
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

// Keep the proven 100dvh viewport model. Do not use screen.height or a second
// JS dock translation layer; those can fight Safari's dynamic toolbar.
if (!html.includes("window.__PLENNOR_IOS_VIEWPORT_FIX__ = 'v2-fixed-dvh'")) {
  throw new Error('unexpected viewport implementation: v2-fixed-dvh marker missing');
}
console.log('V6_PATCH|fixed-dvh-kept|PASS');

const digest = createHash('sha256').update(bundle).digest('hex');
const newBundlePath = oldBundlePath.replace(/index-[^/]+\.js$/, `index-v6-${digest.slice(0, 24)}.js`);
html = html.replace(oldBundlePath, newBundlePath);
html = html.replace(/<title>[^<]*<\/title>/, '<title>Plennor v6 iOS Test</title>');

const marker = `<script id="plennor-v6-marker">window.__PLENNOR_IOS_TEST_BUILD__='v6-real-bundle-touchcancel-zero-gap';</script>`;
if (!html.includes('</head>')) throw new Error('index </head> missing');
html = html.replace('</head>', `${marker}\n</head>`);

await writeDist('/', Buffer.from(html, 'utf8'));
await writeDist(newBundlePath, Buffer.from(bundle, 'utf8'));

// Local manifest for Add to Home Screen testing.
const manifestBytes = await fetchBytes('/manifest.webmanifest', true);
if (manifestBytes) {
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  manifest.name = 'Plennor v6 Test';
  manifest.short_name = 'Plennor v6';
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

// Copy the rest of the live shell assets referenced by its service worker,
// excluding the old JS bundle that we intentionally replaced.
const liveSw = await fetchText('/sw.js');
const assetsMatch = liveSw.match(/const\s+ASSETS\s*=\s*(\[[\s\S]*?\]);/);
if (assetsMatch) {
  const assets = JSON.parse(assetsMatch[1]);
  for (const asset of assets) {
    if (typeof asset !== 'string' || !asset.startsWith('/')) continue;
    if (asset === '/' || asset === '/manifest.webmanifest' || asset === '/sw.js' || asset === oldBundlePath) continue;
    const bytes = await fetchBytes(asset, true);
    if (bytes) await writeDist(asset, bytes);
  }
}

// A cacheless service worker makes repeated iPhone tests deterministic and
// guarantees a newly deployed v6 bundle is not replaced by an older shell.
const sw = `self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));\nself.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())await caches.delete(key);await self.clients.claim()})()));\n`;
await writeDist('/sw.js', Buffer.from(sw, 'utf8'));

const summary = {
  source: SOURCE,
  oldBundlePath,
  newBundlePath,
  bundleSha256: digest,
  build: 'v6-real-bundle-touchcancel-zero-gap',
};
await writeDist('/V6_BUILD.json', Buffer.from(JSON.stringify(summary, null, 2), 'utf8'));
console.log('V6_BUILD|PASS|' + JSON.stringify(summary));
