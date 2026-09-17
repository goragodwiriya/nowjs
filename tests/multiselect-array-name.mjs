/**
 * A multiple select named `name[]` must submit under `name`, the same way a
 * checkbox group named `name[]` already does.
 *
 * Why this matters: getFormData used the raw name for the JSON body and added
 * another `[]` for FormData. The JSON body carried the key `columns[]`, which
 * Kotchasan's `post('columns')` never finds, and FormData carried `columns[][]`,
 * which PHP turns into an array of one-item arrays. On the server the field
 * came in empty either way, with no error in the browser.
 *
 * Runs the real built bundle in a real browser and checks both bodies a submit
 * can send: jsonData (plain AJAX) and formData (the upload path).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="t" action="/save" method="post">
  <select name="columns[]" multiple>
    <option value="a" selected>a</option>
    <option value="b">b</option>
    <option value="c" selected>c</option>
  </select>
  <select name="tags" multiple>
    <option value="x" selected>x</option>
    <option value="y">y</option>
  </select>
  <select name="none[]" multiple>
    <option value="n">n</option>
  </select>
  <input type="checkbox" name="flags[]" value="1" checked>
  <input type="checkbox" name="flags[]" value="2">
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
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
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

const body = await tab.evaluate(async () => {
  const form = document.querySelector('form');
  const instance = FormManager.getInstanceByElement(form) || await FormManager.initForm(form);
  const {formData, jsonData} = FormManager.getFormData(instance);
  const entries = {};
  for (const [key, value] of formData.entries()) {
    (entries[key] ||= []).push(value);
  }
  return {json: jsonData, form: entries};
});

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const show = v => JSON.stringify(v);

check('JSON: select ชื่อ columns[] ต้องส่งเป็นคีย์ columns',
  same(body.json.columns, ['a', 'c']) && !('columns[]' in body.json), show(body.json));

check('FormData: select ชื่อ columns[] ต้องส่งเป็น columns[] ไม่ใช่ columns[][]',
  same(body.form['columns[]'], ['a', 'c']) && !('columns[][]' in body.form), show(body.form));

check('select ชื่อ tags (ไม่มี []) ยังส่งแบบเดิม',
  same(body.json.tags, ['x']) && same(body.form['tags[]'], ['x']));

check('select ชื่อ none[] ที่ไม่ได้เลือกอะไรต้องได้อาเรย์ว่างใต้คีย์ none',
  same(body.json.none, []) && !('none[]' in body.json), show(body.json));

check('checkbox ชื่อ flags[] ไม่ถูกกระทบ',
  same(body.json.flags, ['1']) && same(body.form['flags[]'], ['1']));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
