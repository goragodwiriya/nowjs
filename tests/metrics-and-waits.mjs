/**
 * Bounded metrics and no polling waits (Now.js audit 2026-11-10, phase 7: P5).
 *
 * - Now keeps its performance metrics in a Map. With performance.monitoring on,
 *   every recorded metric was kept for the life of the page; and with the
 *   default errorReporting, every error that reaches Now.handleError (uncaught
 *   errors and rejections included) was kept with its stack even with
 *   monitoring off. Now at most performance.maxMetrics entries are kept, the
 *   oldest dropped first, and two metrics in the same millisecond do not
 *   overwrite each other.
 * - ApiComponent binding data-attr="data:..." to a line-items table that the
 *   render has just put in the page waited for it with setInterval(100 ms):
 *   the rows came at least 100 ms after the data. Now the line-items instance
 *   is created on the spot and the rows are there when api:content-rendered fires.
 * - A bound table that TableManager cannot set up (no table id) was retried
 *   30 times, 100 ms apart, logging the same error each time. Now it is tried
 *   once.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const page = (body, init) => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main">${body}</main>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__rendered = [];
document.addEventListener('api:content-rendered', e => {
  const table = e.target.querySelector('[data-line-items]');
  window.__rendered.push({rows: table ? table.querySelectorAll('tbody tr').length : -1, at: performance.now()});
});
window.__ready = (async () => {
  await Now.init(${init});
  if (window.TableManager) await TableManager.init();
})();
</script>
</body></html>`;

const INIT = "{environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}}";
const pages = {
  '/metrics': page('<p>metrics</p>', "{environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}, performance: {monitoring: true}}"),
  '/errors': page('<p>errors</p>', INIT),
  '/lineitems': page(`
<div data-component="api" data-endpoint="/order" data-url-params="false">
  <h1 data-text="number"></h1>
  <div data-if="items">
    <table data-line-items="items" data-merge-key="code" data-attr="data:items">
      <thead><tr><th data-field="code" data-display-only="true">Code</th><th data-field="qty" data-display-only="true">Qty</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</div>`, INIT),
  '/badtable': page(`
<div data-component="api" data-endpoint="/rows" data-url-params="false">
  <table data-table="" data-attr="data:rows"><thead><tr><th data-field="name">Name</th></tr></thead><tbody></tbody></table>
</div>`, INIT)
};

const server = http.createServer((req, res) => {
  // Feature bundles: the core loads them from its own folder (Now.require)
  const feature = req.url.split('?')[0].match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) {
    res.writeHead(200, {'Content-Type': (feature[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(new URL(feature[1], process.env.NOW_DIST ? 'file://' + process.env.NOW_DIST.replace(/\/?$/, '/') : new URL('../Now/dist/', import.meta.url)), 'utf8'));
  }
  const path = req.url.split('?')[0];
  const send = (status, body, type) => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(body);
  };
  if (path === '/core.js') return send(200, readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript');
  if (path === '/table.js') return send(200, readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript');
  if (path === '/order') return send(200, JSON.stringify({success: true, data: {number: 'PO-1', items: [{code: 'A', qty: 1}, {code: 'B', qty: 2}, {code: 'C', qty: 3}]}}), 'application/json');
  if (path === '/rows') return send(200, JSON.stringify({success: true, data: {rows: [{name: 'x'}]}}), 'application/json');
  if (pages[path]) return send(200, pages[path], 'text/html');
  return send(204, '', 'text/plain');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`);
};
const open = async (path) => {
  const tab = await browser.newPage();
  const logs = [];
  tab.on('console', m => logs.push(m.type() + ' ' + m.text()));
  tab.on('pageerror', e => logs.push('pageerror ' + e));
  await tab.goto(origin + path, {waitUntil: 'load'});
  await tab.evaluate(() => window.__ready);
  return {tab, logs};
};

// --- metrics ------------------------------------------------------------------------
console.log('metrics are bounded');
let {tab} = await open('/metrics');
const metrics = await tab.evaluate(() => {
  // Metrics spread over time, as on a page left open: one per millisecond
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => ++clock;
  try {
    for (let i = 0; i < 5000; i++) Now.recordPerformance('component-render', {duration: 1, i});
  } finally {
    Date.now = realNow;
  }
  // and a burst within one millisecond
  for (let i = 0; i < 5; i++) Now.recordPerformance('burst', {duration: 1, i});
  const max = Now.config.performance.maxMetrics;
  const values = [...Now.state.performance.metrics.values()];
  const renders = values.filter(m => m.name === 'component-render');
  return {size: Now.state.performance.metrics.size, max, newest: renders[renders.length - 1]?.i, burst: values.filter(m => m.name === 'burst').length};
});
check('5,000 metrics with monitoring on keep at most performance.maxMetrics', typeof metrics.max === 'number' && metrics.size <= metrics.max, metrics);
check('the newest metrics are kept', metrics.newest === 4999, metrics);
check('metrics recorded in the same millisecond do not overwrite each other', metrics.burst === 5, metrics);
await tab.close();

({tab} = await open('/errors'));
const errors = await tab.evaluate(() => {
  const before = Now.state.performance.metrics.size;
  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => ++clock;
  try {
    for (let i = 0; i < 2000; i++) Now.logErrorMetrics(new Error('repeating ' + i));
  } finally {
    Date.now = realNow;
  }
  return {before, after: Now.state.performance.metrics.size, max: Now.config.performance.maxMetrics, monitoring: Now.config.performance.monitoring};
});
check('2,000 errors (monitoring off, errorReporting on) keep at most performance.maxMetrics', typeof errors.max === 'number' && errors.after <= errors.max, errors);
await tab.close();

// --- line items bound by ApiComponent ---------------------------------------------------------
console.log('line items get their rows without waiting');
let logs;
({tab, logs} = await open('/lineitems'));
await sleep(600);
const li = await tab.evaluate(() => ({
  rendered: window.__rendered,
  rows: document.querySelectorAll('[data-line-items] tbody tr').length
}));
check('the rows are there in the end', li.rows === 3, li);
check('the rows are there when api:content-rendered fires (no 100 ms wait)', li.rendered.length > 0 && li.rendered[li.rendered.length - 1].rows === 3, li);
await tab.close();

// --- a table that cannot be set up --------------------------------------------------------------
console.log('a table that cannot be set up is tried once');
({tab, logs} = await open('/badtable'));
await sleep(400);
const early = logs.filter(l => /Table ID is required/.test(l)).length;
await sleep(3200);
const late = logs.filter(l => /Table ID is required/.test(l)).length;
// TableManager's own scan, TemplateManager's data-attr binding and ApiComponent's
// binding each try once
check('the failing table set-up is not retried', early <= 3 && late === early, {early, late});
await tab.close();

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
