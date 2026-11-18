/**
 * Proof that tables bound with data-attr="data:..." inside a data-component
 * get their rows whatever shape and depth the bound value has.
 *
 *   <div data-component="api" data-endpoint="/page">
 *     <table data-table="earnings" data-attr="data:preview.earnings">   <!-- a nested path -->
 *     <table data-table="matrix" data-attr="data:matrix">               <!-- {data, columnGroups} -->
 *
 * ApiComponent read only the first name of the path (data:preview.earnings
 * read `preview`) and called `boundData.columns` on it: a page whose `preview`
 * was null (an employee with no payslip yet — oms /payroll-my) threw
 * "Cannot read properties of null (reading 'columns')" on every load. It also
 * passed on only {columns, data} objects and arrays, so a bound table that
 * carries its column groups ({data, columnGroups}) got nothing from it.
 * Now the whole path is read, a null/missing value leaves the table alone, and
 * an object with a data array (columnGroups included) is handed to the table.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || new URL('../Now/dist/now.core.min.js', import.meta.url);
const TABLE = process.env.NOW_TABLE || new URL('../Now/dist/now.table.min.js', import.meta.url);

const page = (endpoint) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<div data-component="api" data-endpoint="${endpoint}" data-url-params="false">
  <p id="name" data-text="name"></p>
  <table data-table="earnings" data-attr="data:preview.earnings" data-url-params="false">
    <thead><tr><th data-field="label">Item</th><th data-field="amount" data-format="number:2">Amount</th></tr></thead>
    <tbody></tbody>
  </table>
  <table data-table="matrix" data-attr="data:matrix" data-url-params="false">
    <thead><tr><th data-field="name">Name</th><th data-column-group="docs" data-field="d_{key}">{label}</th></tr></thead>
    <tbody></tbody>
  </table>
</div>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  await TableManager.init();
})();
</script>
</body></html>`;

const payloads = {
  '/full': {name: 'Mintra', preview: {earnings: [{id: 1, label: 'Salary', amount: 30000}, {id: 2, label: 'OT', amount: 1500.5}]},
    matrix: {data: [{id: 7, name: 'Somchai', d_a: 'signed', d_b: 'read'}], columnGroups: {docs: [{key: 'a', label: 'Policy'}, {key: 'b', label: 'Contract'}]}}},
  '/empty': {name: 'Arisa', preview: null, matrix: {data: [], columnGroups: {docs: []}}}
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/full.html' || path === '/empty.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page(path.replace('.html', '')));
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(path === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (payloads[path]) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: payloads[path]}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US']});

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const open = async (path) => {
  const tab = await browser.newPage();
  const errors = [];
  tab.on('pageerror', e => errors.push(String(e)));
  tab.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await tab.goto(base + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(1200);
  const view = await tab.evaluate(() => ({
    name: document.getElementById('name').textContent,
    earnings: [...document.querySelectorAll('table[data-table="earnings"] tbody tr[data-id]')].map((tr) => tr.textContent.replace(/\s+/g, ' ').trim()),
    heads: [...document.querySelectorAll('table[data-table="matrix"] thead th')].map((th) => th.textContent.trim()),
    matrix: [...document.querySelectorAll('table[data-table="matrix"] tbody tr[data-id]')].map((tr) => [...tr.cells].map((td) => td.textContent.trim()))
  }));
  await tab.close();
  return {view, errors};
};

let r = await open('/full.html');
check('a nested path (data:preview.earnings) fills the table with the nested rows', r.view.earnings.length === 2 && r.view.earnings[0].includes('Salary')
  && r.view.earnings[1].includes('1,500.50'), JSON.stringify(r.view.earnings));
check('an object with a data array and columnGroups fills the table and its column groups', r.view.heads.join('|') === 'Name|Policy|Contract'
  && JSON.stringify(r.view.matrix) === JSON.stringify([['Somchai', 'signed', 'read']]), JSON.stringify(r.view));
check('no JS errors with full data', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));

r = await open('/empty.html');
check('a null parent (preview: null) leaves the table empty without an error', r.view.name === 'Arisa' && r.view.earnings.length === 0, JSON.stringify(r.view));
check('no JS errors with a null bound value', r.errors.length === 0, r.errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
