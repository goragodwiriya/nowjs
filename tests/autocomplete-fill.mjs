/**
 * Proof that an autocomplete selection fills the other fields of its form.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/form-elements/text-elements.md →
 * "Filling other fields from the selected item" and "What the input shows after a choice".
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const rows = [
  {
    value: 'SN-001',
    text: 'SN-001 : Notebook',
    topic: 'Notebook',
    price: '25000',
    note: 'in service',
    active: '1',
    condition: 'used',
    tags: 'office,mobile',
    display_only: 'shown in a plain element'
  },
  {value: 'SN-002', text: 'SN-002 : Printer', topic: 'Printer', price: '8000', note: '', active: '', condition: 'new', tags: 'office'}
];

// A code search: `text` is the search line, `customer_no` is what the code field shows
const codes = [
  {value: 'C0001', text: 'C0001 Alpha Co. (HQ)', customer_no: 'C0001', customer_id: {value: '7', text: 'Alpha Co. (HQ)'}},
  {value: 'C0002', text: 'C0002 Beta Ltd.'}
];

const courses = [
  {value: 'MA101', text: 'MA101 Mathematics', code: 'MA101', course_name: 'Mathematics'}
];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <input type="text" id="product_no" name="product_no" data-autocomplete="true" data-source="/find" data-min-length="2">
  <input type="text" id="topic" name="topic" readonly>
  <input type="text" id="price" name="price">
  <textarea id="note" name="note"></textarea>
  <input type="checkbox" id="active" name="active" value="1">
  <label><input type="radio" name="condition" value="new"> new</label>
  <label><input type="radio" name="condition" value="used"> used</label>
  <select id="tags" name="tags" multiple>
    <option value="office">office</option>
    <option value="mobile">mobile</option>
  </select>
  <span id="display_only"></span>
  <input type="hidden" name="id" value="42">
</form>

<form id="f2">
  <input type="text" id="other_topic" name="topic">
</form>

<form id="f3">
  <input type="text" id="mapped_no" name="mapped_no" data-autocomplete="true" data-source="/find"
         data-min-length="2" data-fill="equipment:topic">
  <input type="text" id="equipment" name="equipment">
  <input type="text" id="price_f3" name="price">
</form>

<form id="f4">
  <input type="text" id="off_no" name="off_no" data-autocomplete="true" data-source="/find"
         data-min-length="2" data-fill="false">
  <input type="text" id="topic_f4" name="topic">
</form>

<form id="f5">
  <input type="text" id="customer_no" name="customer_no" data-autocomplete="true" data-source="/codes"
         data-min-length="2" data-fill="customer_id">
  <input type="text" id="customer_id" name="customer_id" data-autocomplete="true" data-source="/codes"
         data-min-length="2" data-fill="false">
</form>

<form id="f6">
  <input type="text" id="course_code" name="course_code" data-autocomplete="true" data-source="/courses"
         data-min-length="2" data-fill="course_code:code,course_name">
  <input type="text" id="course_name" name="course_name">
</form>

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
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  const lists = {'/find': rows, '/codes': codes, '/courses': courses};
  const list = Object.keys(lists).find(path => req.url.startsWith(path));
  if (list) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: lists[list]}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url); res.writeHead(404);
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
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Type into an autocomplete input and pick the row at `index` from the dropdown. */
const pick = async (id, typed, index = 0) => {
  await tab.evaluate((id, typed) => {
    const el = document.getElementById(id);
    el.focus();
    el.value = typed;
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }, id, typed);
  await sleep(700);
  await tab.evaluate((id, index) => {
    const inst = ElementManager.getInstanceByElement(document.getElementById(id));
    const li = inst.list[index];
    li.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
  }, id, index);
  await sleep(150);
};

const val = id => tab.evaluate(id => document.getElementById(id).value, id);
const hidden = (form, name) => tab.evaluate((form, name) =>
  document.querySelector(`#${form} input[type="hidden"][name="${name}"]`).value, form, name);

// 1. Every property of the selected item lands in the field of the same id
await pick('product_no', 'SN');
check('fills a text field of the same name', await val('topic') === 'Notebook', await val('topic'));
check('fills a second text field in the same pass', await val('price') === '25000', await val('price'));
check('fills a textarea', await val('note') === 'in service', await val('note'));

check('ticks a checkbox from a truthy value',
  await tab.evaluate(() => document.getElementById('active').checked) === true);

check('selects the matching radio of the group',
  await tab.evaluate(() => document.querySelector('input[name="condition"]:checked')?.value) === 'used');

check('selects every value of a multiple select',
  (await tab.evaluate(() => Array.from(document.getElementById('tags').selectedOptions).map(o => o.value).join(','))) === 'office,mobile');

check('writes text into an element that is not a form control',
  await tab.evaluate(() => document.getElementById('display_only').textContent) === 'shown in a plain element');

// 2. Protocol keys and the form's own id are never touched
check('never overwrites the form’s own id field',
  await tab.evaluate(() => document.querySelector('#f1 input[name="id"]').value) === '42');

check('never overwrites the autocomplete’s own visible input',
  await val('product_no') === 'SN-001 : Notebook', await val('product_no'));

check('keeps the selected key in the hidden input',
  await tab.evaluate(() => document.querySelector('#f1 input[type="hidden"][name="product_no"]').value) === 'SN-001');

// 3. Another form on the same page is left alone
check('does not reach into another form', await val('other_topic') === '', await val('other_topic'));

// 4. A second selection replaces the first, empty properties clear their field
await pick('product_no', 'SN', 1);
check('a later selection replaces the earlier values', await val('topic') === 'Printer', await val('topic'));
check('an empty property clears its field', await val('note') === '', await val('note'));
check('a falsy value unticks the checkbox',
  await tab.evaluate(() => document.getElementById('active').checked) === false);
check('an item without a property clears what the previous one filled',
  await tab.evaluate(() => document.getElementById('display_only').textContent) === '');

// 5. Typing again drops the filled data instead of leaving it stale
await tab.evaluate(() => {
  const el = document.getElementById('product_no');
  el.focus();
  el.value = 'SN-0';
  el.dispatchEvent(new Event('input', {bubbles: true}));
});
await sleep(150);
check('typing after a selection clears the filled fields', await val('topic') === '', await val('topic'));

// 6. data-fill maps a differently named field and turns the rest off
await pick('mapped_no', 'SN');
check('data-fill maps a property onto a differently named field',
  await val('equipment') === 'Notebook', await val('equipment'));
check('data-fill limits filling to what it lists',
  await val('price_f3') === '', await val('price_f3'));

// 7. data-fill="false" turns filling off
await pick('off_no', 'SN');
check('data-fill="false" fills nothing', await val('topic_f4') === '', await val('topic_f4'));

// 8. What the input shows after a choice: the item's own column, not the search line
await pick('customer_no', 'C0');
check('shows the item property named like the field', await val('customer_no') === 'C0001', await val('customer_no'));
check('submits the item value', await hidden('f5', 'customer_no') === 'C0001', await hidden('f5', 'customer_no'));
check('a {value, text} pair fills an autocomplete with its text',
  await val('customer_id') === 'Alpha Co. (HQ)', await val('customer_id'));
check('a {value, text} pair fills the hidden value of that autocomplete',
  await hidden('f5', 'customer_id') === '7', await hidden('f5', 'customer_id'));

await pick('customer_no', 'C0', 1);
check('an item without that property keeps the search text',
  await val('customer_no') === 'C0002 Beta Ltd.', await val('customer_no'));

await pick('course_code', 'MA');
check('data-fill aimed at the field itself names the property it shows',
  await val('course_code') === 'MA101', await val('course_code'));
check('the rest of that data-fill still fills', await val('course_name') === 'Mathematics', await val('course_name'));

// 9. Typed text that matches nothing chosen stays as typed
await tab.evaluate(() => {
  const el = document.getElementById('customer_no');
  el.focus();
  el.value = 'free text';
  el.dispatchEvent(new Event('input', {bubbles: true}));
  el.blur();
});
await sleep(700);
check('text typed without choosing stays in the input', await val('customer_no') === 'free text', await val('customer_no'));
check('text typed without choosing is what gets submitted',
  await hidden('f5', 'customer_no') === 'free text', await hidden('f5', 'customer_no'));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
