/**
 * Proof that TableManager auto refresh behaves as documented.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/TableManager.md → "Automatic Refresh".
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

let hits = 0;
let holdMs = 0;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0" data-show-checkbox="true">
  <thead><tr><th data-field="id">id</th><th data-field="name">name</th></tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js' || req.url === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(req.url === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (req.url.startsWith('/rows')) {
    hits++;
    if (holdMs) await new Promise(r => setTimeout(r, holdMs));
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ok: true, data: [{id: 1, name: 'row-' + hits}]}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url); res.writeHead(404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. Default is off — existing tables must not start polling
hits = 0;
await sleep(2500);
check('off by default — no polling at all', hits === 0, `${hits} requests in 2.5s`);

// 2. setRefreshInterval starts it, at roughly the requested rate
await tab.evaluate(() => TableManager.setRefreshInterval('probe', 1));
hits = 0;
await sleep(3400);
const polled = hits;
check('setRefreshInterval(1) polls at about that rate', polled >= 2 && polled <= 4, `${polled} requests in 3.4s`);

// 3. table:refreshed fires for each automatic reload
const events = await tab.evaluate(async () => {
  window.__events = 0;
  EventManager.on('table:refreshed', () => window.__events++);
  await new Promise(r => setTimeout(r, 2400));
  return window.__events;
});
check('emits table:refreshed on each reload', events >= 1, `${events} events`);

// 4. Selected rows pause the timer instead of having the selection wiped
await tab.evaluate(() => {
  const t = TableManager.state.tables.get('probe');
  t.selectedRows = [{id: 1}];
});
hits = 0;
await sleep(2500);
const whileSelected = hits;
await tab.evaluate(() => {
  TableManager.state.tables.get('probe').selectedRows = [];
});
check('skips the tick while rows are selected', whileSelected === 0, `${whileSelected} requests while selected`);

// 4b. A hidden tab must not poll, and must catch up once when it comes back
await tab.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
});
hits = 0;
await sleep(2500);
const whileHidden = hits;
check('hidden tab does not poll', whileHidden === 0, `${whileHidden} requests while hidden`);

hits = 0;
await tab.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'visible'});
  document.dispatchEvent(new Event('visibilitychange'));
});
await sleep(400);
check('reloads once immediately when the tab returns', hits >= 1, `${hits} requests within 0.4s of returning`);

// 5. A slow endpoint must not let requests stack up
holdMs = 2000;
hits = 0;
await sleep(4200);
const slow = hits;
holdMs = 0;
check('slow endpoint never stacks requests', slow <= 3, `${slow} requests in 4.2s against a 2s endpoint`);

// 6. setRefreshInterval(0) stops it
await tab.evaluate(() => TableManager.setRefreshInterval('probe', 0));
await sleep(300);
hits = 0;
await sleep(2500);
check('setRefreshInterval(0) stops it', hits === 0, `${hits} requests after stopping`);
check('getRefreshInterval reports the truth',
  await tab.evaluate(() => TableManager.getRefreshInterval('probe')) === 0);

// 7. destroyTable must not leave a timer behind
await tab.evaluate(() => TableManager.setRefreshInterval('probe', 1));
await sleep(1200);
await tab.evaluate(() => TableManager.destroyTable('probe'));
hits = 0;
await sleep(2500);
check('destroyTable leaves no timer behind', hits === 0, `${hits} requests after destroyTable`);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
