/**
 * Attributes that name a callback (data-formatter, data-sorter, data-filter-fn,
 * data-validate-fn, data-on-calculate, data-callback, data-cascade-callback,
 * data-scroll-callback, ...) find it with Now.getFunction(), the rules of
 * Now.resolveFunction(): app functions and dotted app paths work, built-ins and
 * the framework's own functions are never called (Now.js audit 2026-11-11,
 * phase 5: L7).
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const ROWS = [{id: 1, name: 'b', score: 2}, {id: 2, name: 'a', score: 1}];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div id="main"></div>
<table data-table="t1" data-source="/rows" data-page-size="0">
<thead><tr>
  <th data-field="id">id</th>
  <th data-field="name" data-formatter="fmtName">name</th>
  <th data-field="score" data-formatter="App.fmt.score">score</th>
</tr></thead><tbody></tbody></table>
<table data-table="t2" data-source="/rows" data-page-size="0">
<thead><tr>
  <th data-field="name" data-formatter="ResponseHandler.showModal">name</th>
  <th data-field="score" data-formatter="alert">score</th>
</tr></thead><tbody></tbody></table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__x = [];
function fmtName(cell, value) { cell.textContent = 'N:' + value; }
window.App = {prefix: 'S:', fmt: {score(cell, value) { cell.textContent = (this && this.prefix === undefined ? 'S:' : 'S:') + value; }}};
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  const orig = ResponseHandler.showModal;
  ResponseHandler.showModal = function(...a) { window.__x.push('showModal'); return orig.apply(this, a); };
  window.alert = () => window.__x.push('alert');
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: ROWS}));
  }
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript'],
    '/table.js': [readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript']
  };
  const file = files[path];
  if (!file) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': `${file[1]}; charset=utf-8`});
  res.end(file[0]);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 600));

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

console.log('Now.getFunction');
const g = await tab.evaluate(() => {
  if (typeof Now.getFunction !== 'function') return {missing: true};
  window.Cart = {n: 3, count() { return this.n; }};
  return {
    app: typeof Now.getFunction('fmtName') === 'function',
    dotted: Now.getFunction('Cart.count')?.() === 3,
    blocked: ['alert', 'eval', 'setTimeout', 'ResponseHandler.showModal', 'Now.init', 'SecurityManager.init', 'nope', ''].filter(n => Now.getFunction(n) !== null)
  };
});
check('Now.getFunction exists', !g.missing);
check('an app function is found', g.app);
check('a dotted app path is called on its object', g.dotted);
check('built-ins, framework functions and unknown names give null', Array.isArray(g.blocked) && g.blocked.length === 0, JSON.stringify(g.blocked));

console.log('table data-formatter');
const t = await tab.evaluate(async () => {
  await new Promise(r => setTimeout(r, 200));
  const cells = (id, i) => [...document.querySelectorAll(`[data-table="${id}"] tbody tr`)].map(tr => tr.children[i]?.textContent.trim());
  return {name: cells('t1', 1), score: cells('t1', 2), bad: [cells('t2', 0), cells('t2', 1)], executed: [...window.__x]};
});
check('an app formatter runs', JSON.stringify(t.name) === '["N:b","N:a"]', JSON.stringify(t.name));
check('a dotted app formatter runs', JSON.stringify(t.score) === '["S:2","S:1"]', JSON.stringify(t.score));
check('data-formatter naming alert or ResponseHandler.showModal calls nothing', t.executed.length === 0, JSON.stringify(t.executed));
check('those cells still show their values', JSON.stringify(t.bad) === '[["b","a"],["2","1"]]', JSON.stringify(t.bad));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
