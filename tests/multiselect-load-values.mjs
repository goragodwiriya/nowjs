/**
 * <select multiple> filled by a form's data-load-api.
 *
 * FormManager sets the values (data-attr="value:provinces") before ElementManager
 * enhances the select, so TemplateManager falls back to the plain element. It used
 * to do `select.value = String(["10","11"])`, which matches no option: an array
 * selected nothing and only a single value worked. It now selects every listed
 * option, from an array, a JSON array string or a single value.
 *
 * Also: data-max-display sets how many selections the trigger names before
 * "+n items" (MultiSelectElementFactory maxDisplayItems, default 2), and a
 * required multi-select with nothing selected reaches FormManager on submit.
 * The select is hidden, so a native `required` made the browser block the
 * submit silently ("An invalid form control is not focusable") and no message
 * appeared; it is now kept as data-required and validated by the factory.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="f" data-load-api="/load">
  <select id="many" name="many" multiple data-options-key="many" data-attr="value:many"></select>
  <select id="one" name="one" multiple data-options-key="one" data-attr="value:one"></select>
  <select id="json" name="json" multiple data-options-key="many" data-attr="value:json"></select>
  <select id="none" name="none" multiple data-options-key="many" data-attr="value:none"></select>
  <select id="num" name="num" multiple data-options-key="many" data-attr="value:num"></select>
</form>
<form data-form="g">
<select id="d2" multiple><option value="a" selected>A</option><option value="b" selected>B</option><option value="c" selected>C</option></select>
<select id="d4" multiple data-max-display="4"><option value="a" selected>A</option><option value="b" selected>B</option><option value="c" selected>C</option><option value="d" selected>D</option><option value="e" selected>E</option></select>
<select id="d3" multiple data-max-display-items="3"><option value="a" selected>A</option><option value="b" selected>B</option><option value="c" selected>C</option><option value="d" selected>D</option></select>
<select id="d0" multiple data-max-display="x"><option value="a" selected>A</option><option value="b" selected>B</option><option value="c" selected>C</option></select>
</form>
<form data-form="r" id="r" data-validate="true">
  <select id="req" name="req" multiple required><option value="a">A</option><option value="b">B</option></select>
  <div class="comment" id="result_req">hint</div>
  <button type="submit">go</button>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', auth: {enabled: false}});
})();
</script>
</body></html>`;

const opts = n => Array.from({length: n}, (_, i) => ({value: String(i + 1), text: 'Item ' + (i + 1)}));
const load = {
  success: true,
  data: {
    many: ['1', '3'],
    one: '2',
    json: '["2","4"]',
    none: [],
    num: [1, 4],
    options: {many: opts(5), one: opts(3)}
  }
};

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  if (req.url.split('?')[0] === '/load') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify(load));
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.waitForFunction(() => document.getElementById('many').options.length === 5, {timeout: 5000}).catch(() => {});
await new Promise(r => setTimeout(r, 300));

const state = id => tab.evaluate(id => {
  const el = document.getElementById(id);
  return {
    values: Array.from(el.selectedOptions).map(o => o.value),
    display: el.nextElementSibling?.querySelector('.dropdown-display')?.textContent ?? null
  };
}, id);

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};

// The fix: arrays from data-load-api select every listed option
check('array of values', (await state('many')).values, ['1', '3']);
check('array of numbers', (await state('num')).values, ['1', '4']);
check('JSON array string', (await state('json')).values, ['2', '4']);
check('trigger names the loaded selection', (await state('many')).display, 'Item 1, Item 3');
// Unchanged
check('single value', (await state('one')).values, ['2']);
check('empty array selects nothing', (await state('none')).values, []);

// data-max-display
check('default names 2 then +n', (await state('d2')).display.replace(/\s+\S+$/, ''), 'A, B +1');
check('data-max-display="4"', (await state('d4')).display.replace(/\s+\S+$/, ''), 'A, B, C, D +1');
check('data-max-display-items alias', (await state('d3')).display.replace(/\s+\S+$/, ''), 'A, B, C +1');
check('invalid data-max-display keeps 2', (await state('d0')).display.replace(/\s+\S+$/, ''), 'A, B +1');

// required: submit with nothing selected shows the factory message
const submitted = await tab.evaluate(async () => {
  const form = document.getElementById('r');
  let invalid = false;
  form.addEventListener('invalid', () => { invalid = true; }, true);
  form.querySelector('button[type=submit]').click();
  await new Promise(r => setTimeout(r, 1500));
  const el = document.getElementById('req');
  return {
    browserBlocked: invalid,
    nativeRequired: el.required,
    dataRequired: el.dataset.required,
    message: document.getElementById('result_req').textContent
  };
});
check('required does not block the submit', submitted.browserBlocked, false);
check('native required moved to data-required', [submitted.nativeRequired, submitted.dataRequired], [false, 'true']);
check('required message shown', submitted.message, 'Please select at least one option');

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
