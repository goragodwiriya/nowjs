/**
 * The app's service worker keeps the app usable offline (Now.js audit 2026-11-10,
 * phase 7 follow-up, owner: "fix every finding").
 *
 * service-worker.js (the same file in every app) and the precache list in
 * js/main.js did not do what they were meant to:
 *
 * - cachePatterns ('\.js$', '\.css$' …) were tested against the whole URL, so
 *   every file index.php loads with ?v= (the core, the bundles, styles.css,
 *   main.js) was network-only: offline, the app could not even load
 *   now.core.min.js.
 * - main.js precached those files without ?v=, URLs the page never asks for.
 * - every page load made the worker download the whole precache list again.
 * - the config (patterns, strategies) only lived in the worker's memory: a
 *   worker the browser stopped and started again had none until a page sent it.
 *
 * Now:
 * - a precached or once-loaded versioned file is served from the cache, also
 *   offline and also by a worker that was just restarted;
 * - a second visit downloads none of the versioned files again;
 * - feature bundles the page never used online still load offline;
 * - after a deploy (new ?v=) the new files are cached and the old ones dropped;
 * - ServiceWorkerManager.cacheUrls() works (the worker had no CACHE_URLS).
 *
 * The page mirrors index.php; the versioning and ServiceWorkerManager.init()
 * code is taken from the real adminframework js/main.js, and the worker is the
 * real adminframework service-worker.js (SW overrides its path).
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const NOW = DIST + '../';
const APP = (process.env.APP || here + '../../adminframework').replace(/\/?$/, '/');
const SW = process.env.SW || APP + 'service-worker.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- the boot script: the real main.js versioning and service worker set-up ---------------------
const main = readFileSync(APP + 'js/main.js', 'utf8');
const versioning = main.slice(main.indexOf('const mainScriptVersion'), main.indexOf('document.addEventListener(\'DOMContentLoaded\''));
const swStart = main.indexOf('if (typeof ServiceWorkerManager !== \'undefined\') {');
let depth = 0, swEnd = swStart;
for (let i = main.indexOf('{', swStart); i < main.length; i++) {
  if (main[i] === '{') depth++;
  if (main[i] === '}' && --depth === 0) { swEnd = i + 1; break; }
}
const swBlock = main.slice(swStart, swEnd);
if (!versioning.includes('function versionedUrl') || !swBlock.includes('precache')) throw new Error('main.js layout changed: versionedUrl / ServiceWorkerManager.init not found');
const bootJs = `${versioning}
document.addEventListener('DOMContentLoaded', async () => {
  const currentPath = window.location.pathname;
  const currentDir = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
  await Now.init({environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
  window.__booted = true;
  ${swBlock}
});`;

let version = 't1';
const page = () => `<!doctype html>
<html><head><meta charset="utf-8"><title>app</title>
<link rel="stylesheet" href="Now/dist/now.core.min.css?v=${version}">
<link rel="stylesheet" href="Now/css/fonts.css?v=${version}">
<link rel="stylesheet" href="css/styles.css?v=${version}">
</head><body>
<main id="main" role="main"><p id="hello">app ${version}</p></main>
<script src="Now/dist/now.core.min.js?v=${version}"></script>
<script src="Now/dist/now.table.min.js?v=${version}"></script>
<script src="Now/dist/now.graph.min.js?v=${version}"></script>
<script src="Now/dist/now.serviceworker.min.js?v=${version}"></script>
<script src="js/main.js?v=${version}"></script>
<script src="js/global.js?v=${version}"></script>
</body></html>`;

let offline = false;
const requests = [];
const server = http.createServer((req, res) => {
  if (offline) {
    req.socket.destroy();
    return;
  }
  const [path, query = ''] = req.url.split('?');
  requests.push(path + (query ? '?' + query : ''));
  const send = (status, body, type) => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache'});
    res.end(body);
  };
  if (path === '/app/' || path === '/app/index.php') return send(200, page(), 'text/html');
  if (path === '/app/service-worker.js') return send(200, readFileSync(SW, 'utf8'), 'application/javascript');
  if (path === '/app/js/main.js') return send(200, bootJs, 'application/javascript');
  if (path === '/app/js/global.js') return send(200, 'window.__global = true;', 'application/javascript');
  if (path === '/app/css/styles.css') return send(200, 'body{margin:0}', 'text/css');
  if (path === '/app/css/extra.css') return send(200, 'p{margin:0}', 'text/css');
  const file = path.match(/^\/app\/Now\/((?:dist|css)\/[\w./-]+)$/);
  if (file && !file[1].includes('..') && existsSync(NOW + file[1])) {
    const type = file[1].endsWith('.css') ? 'text/css' : file[1].endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
    return send(200, readFileSync(NOW + file[1]), type);
  }
  return send(404, 'not found', 'text/plain');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 700) : ''}`);
};
const errors = [];
const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
const cdp = await tab.createCDPSession();
await cdp.send('ServiceWorker.enable');

const cached = urls => tab.evaluate(async list => {
  const out = {};
  for (const url of list) out[url] = !!(await caches.match(url));
  return out;
}, urls);
const until = async (fn, ms = 8000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await sleep(100);
  }
  return false;
};
const v = (file, ver = version) => `${origin}/app/${file}?v=${ver}`;

// --- first visit, online ------------------------------------------------------------------
console.log('first visit, online');
await tab.goto(origin + '/app/', {waitUntil: 'load'});
await tab.waitForFunction(() => window.__booted, {timeout: 5000});
await until(() => tab.evaluate(() => !!navigator.serviceWorker.controller));
const features = await tab.evaluate(() => Now.featureUrls());
const versioned = ['Now/dist/now.core.min.js', 'Now/dist/now.core.min.css', 'Now/dist/now.table.min.js', 'Now/dist/now.serviceworker.min.js', 'css/styles.css', 'js/main.js'].map(f => v(f));
await until(async () => Object.values(await cached([...versioned, ...features])).every(Boolean));
let c = await cached(versioned);
check('the files the page loads with ?v= are in the cache under the URL the page asks for', Object.values(c).every(Boolean), c);
c = await cached(features);
check('so are the feature bundles the page has not used', Object.values(c).every(Boolean), c);
const extra = `${origin}/app/css/extra.css?v=x`;
await tab.evaluate(url => ServiceWorkerManager.cacheUrls([url]), extra);
await until(async () => (await cached([extra]))[extra]);
check('ServiceWorkerManager.cacheUrls() puts URLs in the cache', (await cached([extra]))[extra]);

// --- second visit, online -----------------------------------------------------------------
console.log('second visit, online');
await sleep(300);
requests.length = 0;
await tab.reload({waitUntil: 'load'});
await tab.waitForFunction(() => window.__booted, {timeout: 5000});
await sleep(1500);
const again = requests.filter(r => /\?v=t1$/.test(r));
check('a second visit downloads none of the versioned files again', again.length === 0, again);

// --- offline, after the browser stopped the worker ------------------------------------------
console.log('offline, after the browser stopped the worker');
await cdp.send('ServiceWorker.stopAllWorkers');
offline = true;
await tab.reload({waitUntil: 'load'}).catch(e => errors.push('reload ' + e.message));
const booted = await tab.waitForFunction(() => window.__booted, {timeout: 5000}).then(() => true, () => false);
check('the app boots offline (core, styles and main.js from the cache)', booted, await tab.evaluate(() => ({now: typeof window.Now, hello: document.getElementById('hello')?.textContent})).catch(e => e.message));
if (booted) {
  const tabs = await tab.evaluate(async () => {
    document.getElementById('main').insertAdjacentHTML('beforeend', `<div id="t" data-component="tabs">
      <div class="tab-buttons"><button class="tab-button" data-tab="a">A</button><button class="tab-button" data-tab="b">B</button></div>
      <div class="tab-content"><div class="tab-pane" data-tab="a">A</div><div class="tab-pane" data-tab="b">B</div></div></div>`);
    const start = Date.now();
    while (!document.querySelector('#t .tab-pane.active') && Date.now() - start < 4000) await new Promise(r => setTimeout(r, 50));
    return !!document.querySelector('#t .tab-pane.active');
  });
  check('a feature bundle never used online loads offline', tabs);
}
offline = false;

// --- a deploy (new ?v=) --------------------------------------------------------------------------
console.log('a deploy');
version = 't2';
await tab.reload({waitUntil: 'load'});
await tab.waitForFunction(() => window.__booted, {timeout: 5000});
await tab.reload({waitUntil: 'load'});
await tab.waitForFunction(() => window.__booted, {timeout: 5000});
const fresh = ['Now/dist/now.core.min.js', 'js/main.js'].map(f => v(f, 't2'));
const stale = ['Now/dist/now.core.min.js', 'js/main.js', 'Now/dist/now.tabs.min.js'].map(f => v(f, 't1'));
await until(async () => Object.values(await cached(fresh)).every(Boolean) && !Object.values(await cached(stale)).some(Boolean));
check('after a deploy the page gets the new files', await tab.evaluate(() => document.getElementById('hello').textContent) === 'app t2');
c = await cached(fresh);
check('and they are cached', Object.values(c).every(Boolean), c);
c = await cached(stale);
check('the previous deploy\'s copies are dropped', !Object.values(c).some(Boolean), c);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
