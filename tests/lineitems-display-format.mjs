/**
 * data-format / data-formatter on a data-display-only column of LineItemsManager.
 *
 * Why this matters: a display-only cell used to show the raw value and turned 0 into a
 * blank cell, so APIs had to send pre-formatted text (stock_text) for the line-items
 * form. A value of 0 must show, a format must apply, a formatter must get the whole row.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="doc">
  <input type="text" id="code" data-role="code">
  <table data-line-items="items" data-detail-api="/detail"
         data-merge-key="code" data-listen-select="[data-role='code']" data-api-params="[data-role]">
    <thead><tr>
      <th data-field="code" data-display-only="true">Code</th>
      <th data-field="on_hand" data-display-only="true">Plain</th>
      <th data-field="price" data-display-only="true" data-format="number:2">Formatted</th>
      <th data-field="stock_view" data-display-only="true" data-formatter="formatStock">Formatter</th>
    </tr></thead>
    <tbody></tbody>
  </table>
</form>
<script src="/core.js"></script>
<script>
window.formatStock = (cell, value, row) => {
  cell.textContent = Number(row.stock) < 0 ? 'Unlimited' : row.stock + ' ' + row.unit;
};
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
</script>
</body></html>`;

const ROWS = {
  P1: {id: 1, code: 'P1', on_hand: 0, price: 1234.5, stock: 5, unit: 'pcs'},
  P2: {id: 2, code: 'P2', on_hand: 7, price: 0, stock: -1, unit: 'pcs'},
  P3: {id: 3, code: 'P3', on_hand: null, price: null, stock: 0, unit: 'box'}
};

const json = (res, status, body) => {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  // Feature bundles: the core loads them from its own folder (Now.require)
  const feature = req.url.split('?')[0].match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) {
    res.writeHead(200, {'Content-Type': (feature[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(new URL(feature[1], process.env.NOW_DIST ? 'file://' + process.env.NOW_DIST.replace(/\/?$/, '/') : new URL('../Now/dist/', import.meta.url)), 'utf8'));
  }
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (url.pathname === '/detail') {
    return json(res, 200, {success: true, data: ROWS[url.searchParams.get('code')] || {}});
  }
  res.writeHead(url.pathname === '/favicon.ico' ? 204 : 404);
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
await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const row = async code => {
  await tab.evaluate(c => {
    const input = document.getElementById('code');
    input.value = c;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }, code);
  await sleep(400);
  return tab.evaluate(c => {
    const tr = [...document.querySelectorAll('[data-line-items] tbody tr')].find(t => t.innerText.includes(c)) || document.querySelector('[data-line-items] tbody tr:last-child');
    return [...tr.querySelectorAll('td[data-field]')].slice(1).map(td => td.textContent);
  }, code);
};

let cells = await row('P1');
check('display-only shows 0 instead of a blank cell', cells[0] === '0', JSON.stringify(cells));
check('data-format runs the named formatter', cells[1] === '1,234.50', cells[1]);
check('data-formatter gets the whole row', cells[2] === '5 pcs', cells[2]);

cells = await row('P2');
check('data-format formats 0 as a number', cells[1] === '0.00', cells[1]);
check('data-formatter chooses from row data', cells[2] === 'Unlimited', cells[2]);

cells = await row('P3');
check('null stays blank with and without a format', cells[0] === '' && cells[1] === '', JSON.stringify(cells));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
