/**
 * A checkbox bound to an API value must read '0' as unchecked.
 *
 * Why this matters: MySQL enum('1','0') and tinyint columns arrive as the
 * strings '0'/'1'. Boolean('0') is true, so setFormData (checkbox case),
 * data-attr="checked:x" and data-checked="x" all showed a suspended/offline
 * switch as ON for every row, and the next save wrote '1' back.
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
  <input type="checkbox" name="plain" value="1">
  <input type="checkbox" name="attr" value="1" data-attr="checked:attr">
  <input type="checkbox" name="checked" value="1" data-checked="checked">
  <button type="button" data-attr="disabled:flag">b</button>
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

const load = value => tab.evaluate(async v => {
  const form = document.querySelector('form');
  const instance = FormManager.getInstanceByElement(form) || await FormManager.initForm(form);
  FormManager.setFormData(instance, {plain: v, attr: v, checked: v, flag: v});
  const q = n => form.querySelector(`[name="${n}"]`);
  return {
    plain: q('plain').checked,
    attr: q('attr').checked,
    attrAttribute: q('attr').hasAttribute('checked'),
    checked: q('checked').checked,
    disabled: form.querySelector('button').disabled
  };
}, value);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const show = v => JSON.stringify(v);
const allFalse = r => !r.plain && !r.attr && !r.attrAttribute && !r.checked && !r.disabled;
const allTrue = r => r.plain && r.attr && r.attrAttribute && r.checked && r.disabled;

for (const v of ['1', 1, true, 'yes']) {
  const r = await load(v);
  check(`ค่า ${show(v)} ต้องติ๊ก/disabled ทุกตัว`, allTrue(r), show(r));
}
for (const v of ['0', 0, false, '', 'false', null, undefined]) {
  const r = await load(v);
  check(`ค่า ${show(v)} ต้องไม่ติ๊ก/ไม่ disabled ทุกตัว`, allFalse(r), show(r));
}

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
