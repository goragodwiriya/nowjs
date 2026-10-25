/**
 * Editable number cells of a table must take the decimals and sign their
 * column asks for, the same way a number field in a form does.
 *
 * What broke: a column that came from the response (data-dynamic-columns) with
 * `precision` lost it — only `decimals` was copied onto the header — and a
 * column with only a fractional `step` stayed at precision 0, while a form
 * field raises precision to fit its step. Either way the cell refused ".",
 * so typing 7.5 saved 75. A negative `min` must allow "-" (a stored -1 must
 * not become 1).
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 *
 *   cd tests && node table-number-cells.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="dyn" data-source="/rows" data-page-size="0" data-dynamic-columns="true"><tbody></tbody></table>
<table data-table="markup" data-source="/rows" data-page-size="0">
  <thead><tr>
    <th data-field="name">Name</th>
    <th data-field="m" data-cell-element="number" data-precision="2" data-min="-1">M</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  document.querySelectorAll('table[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const columns = [
  {field: 'name', label: 'Name'},
  {field: 'p', label: 'P', cellElement: 'number', precision: '1', step: '0.1'},
  {field: 's', label: 'S', cellElement: 'number', step: '0.5'},
  {field: 'd', label: 'D', cellElement: 'number', decimals: 2, min: -1, max: 365},
  {field: 'i', label: 'I', cellElement: 'number'}
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(url.pathname === '/core.js' ? CORE : BUNDLE, import.meta.url), 'utf8'));
  }
  if (url.pathname === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({
      data: [{id: 1, name: 'a', p: '3', s: '', d: '-1', i: '2', m: '-1'}],
      meta: {page: 1, pageSize: 0, total: 1, totalPages: 1},
      columns
    }));
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
await tab.waitForFunction('document.querySelector("#dyn_i_1") && document.querySelector("#markup_m_1")', {timeout: 8000});

const typed = async (sel, text) => {
  await tab.evaluate(s => { document.querySelector(s).value = ''; }, sel);
  // EventSystemManager drops a keydown that follows the previous one within
  // 1000/maxThrottleRate ms, so type at human speed or the filter never runs.
  await tab.type(sel, text, {delay: 40});
  await tab.evaluate(s => document.querySelector(s).blur(), sel);
  return tab.$eval(sel, el => el.value);
};
const shown = sel => tab.$eval(sel, el => el.value);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const show = v => JSON.stringify(v);

let r = await typed('#dyn_p_1', '7.5');
check('คอลัมน์จาก API precision "1": พิมพ์ 7.5 ได้', r === '7.5', show(r));

r = await typed('#dyn_s_1', '7.5');
check('คอลัมน์จาก API มีแค่ step "0.5": พิมพ์ 7.5 ได้ (เหมือนช่องในฟอร์ม)', r === '7.5', show(r));

r = await shown('#dyn_d_1');
check('คอลัมน์จาก API min -1: ค่า -1 ที่โหลดมาแสดงเป็น -1', r === '-1', show(r));

r = await typed('#dyn_d_1', '-1');
check('คอลัมน์จาก API min -1: พิมพ์ -1 ได้', r === '-1', show(r));

r = await typed('#dyn_d_1', '0.25');
check('คอลัมน์จาก API decimals 2: พิมพ์ 0.25 ได้', r === '0.25', show(r));

r = await typed('#dyn_i_1', '7.5');
check('คอลัมน์จำนวนเต็ม (ไม่มี step/precision) ยังกัน "." เหมือนเดิม', r === '75', show(r));

r = await typed('#markup_m_1', '-0.25');
check('หัวตารางใน HTML data-precision="2" data-min="-1": พิมพ์ -0.25 ได้', r === '-0.25', show(r));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
