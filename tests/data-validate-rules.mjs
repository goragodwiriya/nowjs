/**
 * Validation rules written in data-validate must run, and a value that passes
 * them must be valid.
 *
 * Why this matters: createInstance() stored the whole result of
 * parseValidationRules() ({rules: [...], validating}) as validationRules, while
 * validateSpecific() loops over validationRules as an array. Looping over the
 * object threw "object is not iterable", validate() caught it and marked the
 * field invalid — so any filled field carrying data-validate (the documented
 * `data-validate="required"`, a custom window.validators rule, ...) could never
 * become valid and its form could never be submitted.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <span class="form-control"><input type="text" id="code" name="code" data-validate="required"></span>
  <span class="form-control"><input type="text" id="even" name="even" data-validate="evenDigits"></span>
  <span class="form-control"><input type="text" id="other" name="other"></span>
</form>
<script>
window.validators = {evenDigits: v => /^[0-9]*$/.test(v) && v.length % 2 === 0};
</script>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  ElementManager.init();
  ElementManager.scan(document);
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
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
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Type a value as the user would, leave the field, and report its state. */
const enter = async (id, value) => {
  await tab.click('#' + id);
  await tab.keyboard.down('Control');
  await tab.keyboard.press('KeyA');
  await tab.keyboard.up('Control');
  await tab.keyboard.press('Backspace');
  await tab.keyboard.type(value, {delay: 20});
  await tab.click('#other');
  await sleep(450);
  return tab.evaluate(id => {
    const el = document.getElementById(id);
    const inst = ElementManager.getInstanceByElement(el);
    return {invalid: el.classList.contains('invalid'), valid: inst.isValid()};
  }, id);
};
const show = v => JSON.stringify(v);

let s = await enter('code', 'POS-01');
check('data-validate="required" ที่กรอกแล้ว → ผ่าน', !s.invalid && s.valid, show(s));

s = await enter('even', '1234');
check('กฎที่กำหนดเอง (window.validators) ค่าถูก → ผ่าน', !s.invalid && s.valid, show(s));

s = await enter('even', '123');
check('กฎที่กำหนดเอง ค่าผิด → ไม่ผ่าน', s.invalid && !s.valid, show(s));

s = await enter('even', '12');
check('แก้ให้ถูก → กลับมาผ่าน', !s.invalid && s.valid, show(s));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
