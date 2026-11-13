/**
 * Proof that the footer totals of a table follow an edit made in its rows.
 *
 *   <table data-editable-rows="true" data-show-footer="true" data-footer-aggregates='{"weight":"sum"}'>
 *
 * A form whose criteria carry weights that must add up to 100 shows the sum
 * while the weights are typed. The footer used to be computed only when the
 * table was drawn, so a page drew its own table to keep a live total.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const BUNDLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div data-component="api" data-endpoint="/form">
  <table data-table="criteria" data-editable-rows="true" data-attr="data:criteria" data-show-footer="true" data-footer-aggregates='{"weight":"sum"}'>
    <thead><tr>
      <th data-field="title" data-cell-element="text">Criterion</th>
      <th data-field="weight" data-cell-element="number" data-min="0" data-max="100">Weight</th>
    </tr></thead>
    <tbody></tbody>
    <tfoot><tr><td class="label">Total</td><td class="total"></td></tr></tfoot>
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

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(path === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (path === '/form') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {criteria: [{title: 'Skill', weight: 60}, {title: 'Team', weight: 40}]}}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
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
const total = () => tab.evaluate(() => document.querySelector('tfoot td.total')?.textContent.trim());

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(600);

check('the footer sums the rows when the table is drawn', await total() === '100', await total());
await tab.evaluate(() => {
  const input = document.querySelectorAll('tbody tr')[1].querySelector('td[data-field="weight"] input');
  input.value = '30';
  input.dispatchEvent(new Event('change', {bubbles: true}));
});
await sleep(300);
check('an edited weight changes the total at once (was: stayed 100 until the table was drawn again)', await total() === '90', await total());
await tab.evaluate(() => document.querySelectorAll('tbody tr')[1].querySelector('button.plus').click());
await sleep(400);
const afterAdd = await tab.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => tr.querySelector('td[data-field="weight"] input')?.value));
await tab.evaluate(() => {
  const rows = document.querySelectorAll('tbody tr');
  const set = (tr, v) => { const input = tr.querySelector('td[data-field="weight"] input'); input.value = v; input.dispatchEvent(new Event('change', {bubbles: true})); };
  set(rows[0], '50');
  set(rows[2], '20');
});
await sleep(300);
check('rows added with the + button count in the total too', await total() === '100', JSON.stringify([afterAdd, await total()]));
check('the static label of the footer stays', await tab.evaluate(() => document.querySelector('tfoot td.label')?.textContent.trim()) === 'Total');
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
