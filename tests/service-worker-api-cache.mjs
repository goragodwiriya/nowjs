/**
 * Proof that the app's service worker keeps API answers only while they may stay
 * on the device.
 *
 * service-worker.js answers GET /api/... network-first and stored every 200 in
 * the cache, so what the API told one user was still there offline for the
 * next person on the same device, and an endpoint that sent
 * Cache-Control: no-store was stored all the same.
 *
 * Now a response with no-store is not stored, and an API answer of 401 (the
 * session is gone) removes every cached API response; files stay.
 *
 * Runs the real adminframework service-worker.js (SW overrides its path) in a
 * real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const SW = process.env.SW || here + '../../adminframework/service-worker.js';

const page = `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>
<script>
window.__ready = (async () => {
  await navigator.serviceWorker.register('/app/service-worker.js', {scope: '/app/'});
  await navigator.serviceWorker.ready;
})();
</script></body></html>`;

let protectedStatus = 401;
// true = API requests get no answer at all (the connection is cut), as offline
let offline = false;
const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (offline && path.startsWith('/app/api/')) {
    req.socket.destroy();
    return;
  }
  const send = (status, body, type, headers = {}) => {
    res.writeHead(status, {'Content-Type': type, ...headers});
    res.end(body);
  };
  if (path === '/app/') return send(200, page, 'text/html; charset=utf-8');
  if (path === '/app/service-worker.js') return send(200, readFileSync(SW, 'utf8'), 'application/javascript');
  if (path === '/app/api/data') return send(200, '{"data":"row of the user"}', 'application/json');
  if (path === '/app/api/secret') return send(200, '{"data":"must not stay"}', 'application/json', {'Cache-Control': 'no-cache, no-store, must-revalidate'});
  if (path === '/app/api/protected') return send(protectedStatus, '{"success":false}', 'application/json');
  send(404, '', 'text/plain');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/app/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
// the page that registered the worker is not controlled by it: load it again
await tab.reload({waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const cached = () => tab.evaluate(async () => {
  const names = await caches.keys();
  const urls = [];
  for (const name of names) {
    for (const key of await (await caches.open(name)).keys()) urls.push(new URL(key.url).pathname);
  }
  return {names, urls};
});
const settle = () => new Promise(r => setTimeout(r, 400));

const controlled = await tab.evaluate(() => Boolean(navigator.serviceWorker.controller));
check('the page is controlled by the service worker', controlled);

await tab.evaluate(async () => {
  await (await fetch('/app/api/data')).text();
  await (await fetch('/app/api/secret')).text();
});
await settle();
let state = await cached();
check('an API answer is cached (network-first, as before)', state.urls.includes('/app/api/data'), JSON.stringify(state.urls));
check('an API answer with Cache-Control: no-store is not cached', !state.urls.includes('/app/api/secret'), JSON.stringify(state.urls));

// a file in the same cache, to show the 401 leaves files alone
const cacheName = state.names.find(name => name.startsWith('now-js-cache@/app/#'));
await tab.evaluate(async (name) => {
  await (await caches.open(name)).put('/app/style.css?v=1', new Response('body{}', {headers: {'Content-Type': 'text/css'}}));
}, cacheName);

protectedStatus = 200;
await tab.evaluate(async () => (await fetch('/app/api/protected')).text());
await settle();
state = await cached();
check('an API answer of 200 keeps the cached API answers', state.urls.includes('/app/api/data'), JSON.stringify(state.urls));

protectedStatus = 401;
const status = await tab.evaluate(async () => (await fetch('/app/api/protected')).status);
await settle();
state = await cached();
check('the page still gets the 401', status === 401, String(status));
check('an API answer of 401 removes the cached API answers', !state.urls.some(url => url.includes('/api/')), JSON.stringify(state.urls));
check('and leaves the cached files', state.urls.includes('/app/style.css'), JSON.stringify(state.urls));

// apiCacheMaxAge: offline, an API answer older than the limit is not shown
await tab.evaluate(() => navigator.serviceWorker.controller.postMessage({type: 'UPDATE_CONFIG', payload: {apiCacheMaxAge: 2}}));
await settle();
await tab.evaluate(async () => (await fetch('/app/api/data')).text());
await settle();
offline = true;
const fresh = await tab.evaluate(async () => {
  try {
    const response = await fetch('/app/api/data');
    return {status: response.status, body: await response.text()};
  } catch (e) {
    return {error: String(e)};
  }
});
check('offline, an API answer younger than apiCacheMaxAge comes from the cache', fresh.status === 200 && fresh.body.includes('row of the user'), JSON.stringify(fresh));
await new Promise(r => setTimeout(r, 2500));
const stale = await tab.evaluate(async () => {
  try {
    const response = await fetch('/app/api/data');
    return {status: response.status};
  } catch (e) {
    return {error: String(e)};
  }
});
await settle();
state = await cached();
check('offline, an API answer older than apiCacheMaxAge is not shown', Boolean(stale.error), JSON.stringify(stale));
check('and is removed from the cache', !state.urls.includes('/app/api/data'), JSON.stringify(state.urls));
offline = false;

// ServiceWorkerManager.clearApiCache() sends CLEAR_API_CACHE
await tab.evaluate(async () => (await fetch('/app/api/data')).text());
await settle();
const before = (await cached()).urls.includes('/app/api/data');
await tab.evaluate(() => navigator.serviceWorker.controller.postMessage({type: 'CLEAR_API_CACHE'}));
await settle();
state = await cached();
check('CLEAR_API_CACHE removes the cached API answers and keeps the files',
  before && !state.urls.some(url => url.includes('/api/')) && state.urls.includes('/app/style.css'), JSON.stringify(state.urls));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
