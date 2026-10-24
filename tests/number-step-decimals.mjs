/**
 * A number input with a fractional step must accept a decimal point.
 *
 * Why this matters: NumberElementFactory renders type="number" as a text
 * field and filters keystrokes itself, letting the decimal separator through
 * only when precision > 0. Precision defaulted to 0 and ignored step, so
 * <input type="number" step="0.1"> refused "." outright and a bound value of
 * 85.5 was displayed as 85 — a native number input accepts both.
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
  <input type="number" name="tenth" step="0.1" min="0" max="300">
  <input type="number" name="quarter" step="0.25">
  <input type="number" name="whole">
  <input type="number" name="forced0" step="0.1" data-precision="0">
  <input type="number" name="forced2" step="0.1" data-precision="2">
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
});

const typed = async (name, text) => {
  const sel = `[name="${name}"]`;
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
  return form.querySelector(`[name="${n}"]`).value;
}, name, value);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const show = v => JSON.stringify(v);

let r = await typed('tenth', '85.5');
check('step="0.1" พิมพ์ 85.5 ได้', r.whileTyping === '85.5' && r.afterBlur === '85.5', show(r));

r = await loaded('tenth', 85.5);
check('step="0.1" โหลดค่า 85.5 แล้วแสดง 85.5', r === '85.5', show(r));

r = await typed('quarter', '1.25');
check('step="0.25" พิมพ์ 1.25 ได้', r.afterBlur === '1.25', show(r));

r = await typed('whole', '1.5');
check('ไม่มี step (จำนวนเต็ม) ยังกัน "." เหมือนเดิม', r.whileTyping === '15', show(r));

r = await typed('forced0', '1.5');
check('data-precision="0" ชนะ step="0.1"', r.whileTyping === '15', show(r));

r = await typed('forced2', '1.25');
check('data-precision="2" ชนะ step="0.1"', r.afterBlur === '1.25', show(r));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
