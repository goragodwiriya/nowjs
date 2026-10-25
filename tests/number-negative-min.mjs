/**
 * A number input with a negative min must accept negative values.
 *
 * Why this matters: NumberElementFactory filters keystrokes itself and lets
 * "-" through only when allowNegative is on, and its validation turns a
 * negative value positive otherwise. allowNegative ignored min, so
 * <input type="number" min="-1"> refused "-", and a stored -1 became 1 as soon
 * as the field was validated — a native number input accepts both. Editable
 * table cells (TableManager → ElementManager.create) go through the same path
 * with min from the column definition.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="t" action="/save" method="post">
  <input type="number" name="neg" min="-1" max="366" step="0.01">
  <input type="number" name="plain">
  <div id="cells"></div>
</form>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
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

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.evaluate(async () => {
  const form = document.querySelector('form');
  if (!FormManager.getInstanceByElement(form)) await FormManager.initForm(form);
  // An editable table cell: TableManager passes min/precision/step from the
  // column definition (dataset values are strings) to ElementManager.create
  const cell = ElementManager.create('number', {name: 'cell[1]', id: 'cell_1', min: '-1', precision: 2, step: 0.01, value: '3'});
  document.getElementById('cells').appendChild(cell.wrapper || cell.element);
});

const typed = async (sel, text) => {
  await tab.evaluate(s => { document.querySelector(s).value = ''; }, sel);
  // EventSystemManager drops a keydown that follows the previous one within
  // 1000/maxThrottleRate ms, so type at human speed or the filter never runs.
  await tab.type(sel, text, {delay: 40});
  const whileTyping = await tab.$eval(sel, el => el.value);
  await tab.evaluate(s => document.querySelector(s).blur(), sel);
  const afterBlur = await tab.$eval(sel, el => el.value);
  return {whileTyping, afterBlur};
};

const loaded = (name, value) => tab.evaluate((n, v) => {
  const form = document.querySelector('form');
  FormManager.setFormData(FormManager.getInstanceByElement(form), {[n]: v});
  const el = form.querySelector(`[name="${n}"]`);
  el.dispatchEvent(new Event('change', {bubbles: true}));
  el.blur();
  return el.value;
}, name, value);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const show = v => JSON.stringify(v);

let r = await typed('[name="neg"]', '-1');
check('min="-1" พิมพ์ -1 ได้', r.whileTyping === '-1' && r.afterBlur === '-1', show(r));

r = await typed('[name="neg"]', '7.5');
check('min="-1" step="0.01" พิมพ์ 7.5 ได้', r.afterBlur === '7.5', show(r));

r = await loaded('neg', -1);
check('min="-1" โหลดค่า -1 แล้วตรวจค่า ยังเป็น -1 (เดิมกลายเป็น 1)', r === '-1', show(r));

r = await typed('[name="plain"]', '-1');
check('ไม่มี min ยังกัน "-" เหมือนเดิม', r.whileTyping === '1', show(r));

r = await typed('#cell_1', '-1');
check('ช่องที่สร้างด้วย ElementManager.create (ช่องในตาราง) min "-1": พิมพ์ -1 ได้', r.afterBlur === '-1', show(r));

r = await typed('#cell_1', '0.5');
check('ช่องในตาราง precision 2: พิมพ์ 0.5 ได้', r.afterBlur === '0.5', show(r));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
