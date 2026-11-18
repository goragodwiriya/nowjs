/**
 * Proof that a footer the page template writes itself keeps its bound values
 * when the table draws its rows.
 *
 *   <form data-load-api="/order">
 *     <table data-table="items" data-attr="data:items">
 *       ...
 *       <tfoot><tr><td>Sub total</td><td data-text="subtotal | number:2"></td></tr></tfoot>
 *
 * A document page shows its lines as a bound table and its totals (sub total ·
 * shipping · grand total) in the footer, filled from the same response with
 * data-text. setupFooter() put every footer cell back to the markup it captured
 * on the first draw — the empty cell from before the data arrived — so each
 * draw of the rows wiped the totals and only the labels were left. Now only the
 * cells the table fills itself (data-sum / data-aggregate, or a column in
 * data-footer-aggregates) are reset; an aggregate in the same footer still
 * follows the rows.
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
<form data-form="order" data-validate="false" data-load-api="/order">
  <table data-table="items" data-attr="data:items" data-url-params="false">
    <thead><tr>
      <th data-field="code">Code</th>
      <th data-field="qty">Qty</th>
      <th data-field="total" data-format="number:2">Amount</th>
    </tr></thead>
    <tbody></tbody>
    <tfoot>
      <tr><td colspan="2">Sub total</td><td id="subtotal" data-text="subtotal | number:2"></td></tr>
      <tr><td colspan="2">Shipping</td><td id="shipping"><b data-text="shipping | number:2"></b></td></tr>
      <tr><td colspan="2">Lines</td><td id="sum" data-sum="total" data-format="number:2">0</td></tr>
    </tfoot>
  </table>
</form>
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
  if (path === '/order') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: {
      items: [{id: 1, code: 'A', qty: 1, total: 1000}, {id: 2, code: 'B', qty: 2, total: 234.5}],
      subtotal: 1234.5, shipping: 50
    }}}));
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
const footer = () => tab.evaluate(() => ({
  subtotal: document.getElementById('subtotal').textContent.trim(),
  shipping: document.getElementById('shipping').textContent.trim(),
  sum: document.getElementById('sum').textContent.trim(),
  rows: document.querySelectorAll('table[data-table="items"] tbody tr[data-id]').length
}));

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(800);

// 1. After the page and the table have both drawn
let f = await footer();
check('the rows are drawn from the bound data', f.rows === 2, JSON.stringify(f));
check('a footer cell bound with data-text keeps its value (sub total)', f.subtotal === '1,234.50', JSON.stringify(f));
check('a bound element inside a footer cell keeps its value (shipping)', f.shipping === '50.00', JSON.stringify(f));
check('an aggregate in the same footer still sums the rows (data-sum)', f.sum === '1,234.50', JSON.stringify(f));

// 2. The table draws again with other rows
await tab.evaluate(() => TableManager.setData('items', [{id: 1, code: 'A', qty: 1, total: 10}, {id: 3, code: 'C', qty: 1, total: 5}]));
await sleep(400);
f = await footer();
check('after another draw the bound totals are still there', f.subtotal === '1,234.50' && f.shipping === '50.00', JSON.stringify(f));
check('…and the aggregate follows the new rows (10 + 5)', f.sum === '15.00', JSON.stringify(f));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
