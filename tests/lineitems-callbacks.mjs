/**
 * LineItemsManager: what callbacks receive, and options given to init().
 *
 * - data-on-calculate gets number/currency columns as numbers. The inputs show
 *   formatted text ("45,000.00"), so parseFloat() in a callback read 45 and
 *   2 × 45,000 came out as 90. Same for a cell button (data-button-click).
 * - init({deleteConfirm: true}) after the manager started itself
 *   (DOMContentLoaded) was dropped: the second init() returned at once.
 *   A table's attribute that is absent now keeps the init() value instead of
 *   forcing false (deleteConfirm, allowDelete, merge, mergeKey, loadClear …).
 * - The delete button asks with DialogManager; removeRow() from code does not ask.
 * - No console warning for a table without data-listen-select (filled by
 *   setData or data-load-from); a selector the table names and that is missing
 *   is still reported.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle folder.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const DIST = process.env.NOW_DIST
  ? 'file://' + process.env.NOW_DIST.replace(/\/?$/, '/')
  : new URL('../Now/dist/', import.meta.url);

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="doc" data-form="doc">
  <table id="t1" data-line-items="items" data-on-calculate="calc">
    <thead><tr>
      <th data-field="sku" data-display-only="true">SKU</th>
      <th data-field="quantity" data-type="number">Qty</th>
      <th data-field="unit_price" data-type="currency" data-button-click="addVat">Price</th>
      <th data-field="note" data-type="text">Note</th>
      <th data-field="subtotal" data-type="currency" data-readonly="true">Subtotal</th>
    </tr></thead>
    <tbody></tbody>
  </table>
  <input id="total">
  <table id="t2" data-line-items="other" data-listen-select="#missing"><thead><tr><th data-field="sku">SKU</th></tr></thead><tbody></tbody></table>
  <table id="t3" data-line-items="third" data-delete-confirm="false"><thead><tr><th data-field="sku">SKU</th></tr></thead><tbody></tbody></table>
</form>
<script>
window.__seen = [];
window.__warnings = [];
const warn = console.warn;
console.warn = (...args) => { window.__warnings.push(args.join(' ')); warn.apply(console, args); };
window.calc = ({items}) => {
  window.__seen = items.map(i => ({quantity: i.quantity, unit_price: i.unit_price, note: i.note}));
  let total = 0;
  const rows = items.map(i => {
    const subtotal = i.quantity * i.unit_price;
    total += subtotal;
    return {subtotal: subtotal.toFixed(2)};
  });
  return {items: rows, '#total': total.toFixed(2)};
};
window.addVat = value => { window.__vatGot = value; return (value * 1.07).toFixed(2); };
</script>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', auth: {enabled: false}});
  await Now.require('LineItemsManager');
  // The app's own init after the manager started itself
  LineItemsManager.init({deleteConfirm: true});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const feature = path.match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) {
    res.writeHead(200, {'Content-Type': (feature[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(new URL(feature[1], DIST), 'utf8'));
  }
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL('now.core.min.js', DIST), 'utf8'));
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const sleep = ms => new Promise(r => setTimeout(r, ms));
let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};

await tab.evaluate(() => LineItemsManager.getInstance(document.getElementById('t1')).setData([
  {sku: 'A', quantity: 2, unit_price: 45000, note: '1,5'},
  {sku: 'B', quantity: 3, unit_price: 2890.5, note: 'x'}
]));
await sleep(200);
const state = () => tab.evaluate(() => ({
  seen: window.__seen,
  subtotals: [...document.querySelectorAll('#t1 tbody input[name*="[subtotal]"]')].map(i => i.value),
  total: document.getElementById('total').value
}));
let s = await state();
check('callback gets numbers for number/currency columns', s.seen, [
  {quantity: 2, unit_price: 45000, note: '1,5'},
  {quantity: 3, unit_price: 2890.5, note: 'x'}
]);
check('subtotals from the numbers', s.subtotals, ['90,000.00', '8,671.50']);
check('total', s.total, '98671.50');

// cell button: the action function gets the number too
await tab.evaluate(() => document.querySelector('#t1 tbody tr button[data-action]:not([data-action=delete])').click());
await sleep(200);
s = await state();
check('data-button-click gets a number', await tab.evaluate(() => window.__vatGot), 45000);
check('button result recalculated', s.subtotals[0], '96,300.00');

// deleteConfirm from init() after the auto-start
check('init() options reach existing tables', await tab.evaluate(() => [
  LineItemsManager.getInstance(document.getElementById('t1')).config.deleteConfirm,
  LineItemsManager.getInstance(document.getElementById('t3')).config.deleteConfirm
]), [true, false]);

// delete button asks with DialogManager
await tab.evaluate(() => document.querySelector('#t1 tbody tr button[data-action=delete]').click());
await sleep(400);
check('delete button opens a confirm dialog, row kept meanwhile', await tab.evaluate(() => [
  !!document.querySelector('.dialog.show'),
  document.querySelectorAll('#t1 tbody tr').length
]), [true, 2]);
await tab.evaluate(() => [...document.querySelectorAll('.dialog.show button')].find(b => /confirm/i.test(b.textContent)).click());
await sleep(400);
check('confirmed: row removed, totals recalculated', await tab.evaluate(() => [
  document.querySelectorAll('#t1 tbody tr').length,
  document.getElementById('total').value
]), [1, '8671.50']);

// removeRow() from code does not ask
await tab.evaluate(() => {
  const inst = LineItemsManager.getInstance(document.getElementById('t1'));
  inst.removeRow(inst.rows[0].index);
});
await sleep(200);
check('removeRow() from code removes without a dialog', await tab.evaluate(() => [
  document.querySelectorAll('#t1 tbody tr').length,
  !!document.querySelector('.dialog.show')
]), [0, false]);

const warnings = await tab.evaluate(() => window.__warnings.filter(w => w.includes('Could not find select input')));
check('only the named, missing selector is reported', warnings.map(w => w.replace(/.*input:\s*/, '')), ['#missing']);

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
