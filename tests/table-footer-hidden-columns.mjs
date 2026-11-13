/**
 * Proof that the footer a table builds for itself lines up with the columns
 * when some columns are hidden.
 *
 *   <table data-table="journals" data-show-footer="true" data-footer-aggregates='{"debit":"sum","credit":"sum"}'>
 *     <th data-field="source" data-filter="true" data-hidden="true">Show</th>   <!-- a filter only -->
 *     <th data-field="code">Account</th> <th data-field="debit">Debit</th> <th data-field="credit">Credit</th>
 *
 * A column that exists only to carry a filter (data-hidden="true") is hidden in
 * the header and in every row, but ensureFooterStructure() gave it a footer cell
 * that stayed visible — so every footer cell after it sat one column to the
 * right: the debit total under Credit and the credit total past the last column
 * (oms /accounting-journals · /inventory-product-stock). Now the footer cell of
 * a hidden column is hidden too, and toggleColumnVisibility() hides and shows
 * it along with the header and the rows.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || new URL('../Now/dist/now.core.min.js', import.meta.url);
const TABLE = process.env.NOW_TABLE || new URL('../Now/dist/now.table.min.js', import.meta.url);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="journals" data-source="/journals" data-show-footer="true" data-footer-aggregates='{"debit":"sum","credit":"sum"}'>
  <thead><tr>
    <th data-field="source" data-filter="true" data-type="select" data-hidden="true">Show</th>
    <th data-field="code">Account</th>
    <th data-field="debit" data-format="number:2">Debit</th>
    <th data-field="credit" data-format="number:2">Credit</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  await TableManager.init();
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(path === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (path === '/journals') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {
      data: [
        {id: 1, source: 'manual', code: '111201', debit: 1000, credit: null},
        {id: 2, source: 'manual', code: '411100', debit: null, credit: 1000},
        {id: 3, source: 'order', code: '113100', debit: 250.5, credit: null}
      ],
      filters: {source: [{value: '', text: 'All'}, {value: 'manual', text: 'Manual'}]},
      meta: {page: 1, pageSize: 0, total: 3, totalPages: 1}
    }}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
// What the eye sees: the visible header labels and, under each of them, the visible footer text
const layout = () => tab.evaluate(() => {
  const table = document.querySelector('table[data-table="journals"]');
  const visible = (cells) => [...cells].filter((c) => c.offsetParent !== null && getComputedStyle(c).display !== 'none');
  const heads = visible(table.querySelectorAll('thead th'));
  const foot = visible(table.querySelectorAll('tfoot td'));
  const under = (label) => {
    const th = heads.find((h) => h.textContent.trim() === label);
    if (!th) return null;
    const x = th.getBoundingClientRect().left;
    const td = foot.find((c) => Math.abs(c.getBoundingClientRect().left - x) < 2);
    return td ? td.textContent.trim() : null;
  };
  return {
    heads: heads.map((h) => h.textContent.trim()),
    footCount: foot.length,
    debit: under('Debit'),
    credit: under('Credit'),
    account: under('Account')
  };
});

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(800);

let l = await layout();
check('the hidden filter column is not shown in the header', l.heads.join('|') === 'Account|Debit|Credit', JSON.stringify(l));
check('the footer shows one cell per visible column (no cell of the hidden column)', l.footCount === 3, JSON.stringify(l));
check('the debit total sits under Debit', l.debit === '1,250.50', JSON.stringify(l));
check('the credit total sits under Credit', l.credit === '1,000.00', JSON.stringify(l));

// Showing the hidden column brings its footer cell back, hiding it again removes it
await tab.evaluate(() => TableManager.toggleColumnVisibility('journals', 'source', true));
await sleep(200);
l = await layout();
check('toggleColumnVisibility(true): header and footer gain the column together', l.heads.length === 4 && l.footCount === 4
  && l.debit === '1,250.50' && l.credit === '1,000.00', JSON.stringify(l));
await tab.evaluate(() => TableManager.toggleColumnVisibility('journals', 'code', false));
await sleep(200);
l = await layout();
check('toggleColumnVisibility(false) of another column: totals stay under their headers', l.heads.length === 3 && l.footCount === 3
  && l.debit === '1,250.50' && l.credit === '1,000.00', JSON.stringify(l));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
