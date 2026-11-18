/**
 * A factory's static customValidateValue runs (ElementFactory.validateValue).
 *
 * SelectElementFactory and MultiSelectElementFactory declare their check as a
 * static method; only the instance was looked at, so it never ran and a required
 * select said the generic "Please fill in" instead of its own "Please select an
 * option". The factory now names the problem; other fields keep the generic text.
 *
 * Runs the real built bundle in a real browser (cd tests first). NOW_DIST overrides the bundle folder.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const DIST = (process.env.NOW_DIST || '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="f" id="f" data-validate="true">
  <select id="pick" name="pick" required><option value="">--</option><option value="a">A</option></select>
  <div id="result_pick"></div>
  <select id="many" name="many" multiple required><option value="a">A</option></select>
  <div id="result_many"></div>
  <input id="txt" name="txt" required>
  <div id="result_txt"></div>
  <select id="free" name="free"><option value="">--</option><option value="a">A</option></select>
  <div id="result_free"></div>
  <button type="submit">go</button>
</form>
<script src="/core.js"></script>
<script>window.__ready = Now.init({environment: 'production', auth: {enabled: false}});</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
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
await new Promise(r => setTimeout(r, 300));

// What FormManager runs on submit (a visible required field is first checked by the browser itself)
await tab.evaluate(async () => {
  const fm = Now.getManager('form');
  await fm.validateForm(fm.state.forms.get('f'));
});
await new Promise(r => setTimeout(r, 300));

const got = await tab.evaluate(() => Object.fromEntries(['pick', 'many', 'txt', 'free'].map(id => [id, document.getElementById('result_' + id).textContent])));

let failed = 0;
const check = (label, a, b) => {
  const ok = a === b;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(a)}${ok ? '' : ' want ' + JSON.stringify(b)}`);
};
check('required select says so in its own words', got.pick, 'Please select an option');
check('required multi-select', got.many, 'Please select at least one option');
check('required text keeps the generic message', got.txt, 'Please fill in');
check('optional select has no error', got.free, '');

// Choosing a value clears the select's error
await tab.evaluate(() => { const s = document.getElementById('pick'); s.value = 'a'; s.dispatchEvent(new Event('change', {bubbles: true})); });
await new Promise(r => setTimeout(r, 300));
check('a chosen value clears it', await tab.evaluate(() => document.getElementById('result_pick').textContent), '');

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
