/**
 * The programmatic-change guard must cover any binding that calls an API, not only
 * the binding literally named `requestApi`.
 *
 * Why this matters: an app-defined action that wraps `requestApi` and then refreshes
 * the surrounding component builds a loop that is easy to write and hard to see —
 * request → refresh → re-bind the input → synthetic `change` → request → …
 *
 * Runs the real built bundle in a real browser.
 *
 * Asserts on **whether the action runs**, not on HTTP hits: the dispatch decision is
 * what this change touches, and `requestApi` needs an app's HTTP configuration that a
 * bare harness does not have. Counting requests here would test the harness, not Now.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

let hits = 0;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<input type="checkbox" id="plain" data-action="change:requestApi"
       data-api-url="/save" data-api-method="post">

<input type="checkbox" id="wrapped" data-action="change:appRefresh"
       data-api-url="/save" data-api-method="post">

<input type="checkbox" id="optin" data-action="change:appRefresh"
       data-api-url="/save" data-api-method="post"
       data-request-api-on-programmatic-change="true">

<input type="checkbox" id="norequest" data-action="change:plainAction">

<script src="/core.js"></script>
<script>
window.__appRefreshRuns = 0;
window.__plainActionRuns = 0;
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});

  const events = window.EventSystemManager;

  // An app-defined action that wraps requestApi — the shape this guard has to cover
  events.registerAction('appRefresh', () => { window.__appRefreshRuns++; });

  // A change-bound action that makes no request at all — must stay untouched
  events.registerAction('plainAction', () => { window.__plainActionRuns++; });
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (req.url.startsWith('/save')) {
    hits++;
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({ok: true}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(404);
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
tab.on('console', m => console.log('    [console]', m.type(), m.text()));
tab.on('request', r => { if (!r.url().endsWith('/core.js') && r.url() !== base + '/') console.log('    [req]', r.method(), r.url()); });

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Programmatic assignment, exactly what a component re-bind does
const poke = id => tab.evaluate((sel) => {
  const el = document.getElementById(sel);
  el.checked = !el.checked;
  el.dispatchEvent(new Event('change', {bubbles: true}));
}, id);

const runsOf = async (counter, id, useClick = false) => {
  const before = await tab.evaluate(c => window[c], counter);
  useClick ? await tab.click('#' + id) : await poke(id);
  await sleep(300);
  return (await tab.evaluate(c => window[c], counter)) - before;
};

check('action ที่ห่อ requestApi ต้องไม่ทำงานเมื่อค่าถูกเปลี่ยนแบบ programmatic',
  await runsOf('__appRefreshRuns', 'wrapped') === 0);

check('ตัวที่ขอ opt-in ไว้ต้องยังทำงาน',
  await runsOf('__appRefreshRuns', 'optin') === 1);

check('คนกดจริงต้องยังทำงาน',
  await runsOf('__appRefreshRuns', 'wrapped', true) === 1);

check('action ที่ไม่มี data-api-url ต้องไม่ถูกกระทบ',
  await runsOf('__plainActionRuns', 'norequest') === 1);

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
