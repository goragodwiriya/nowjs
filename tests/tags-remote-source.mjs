/**
 * Proof that a tags input searches an endpoint named by `data-source`, and that
 * `data-allow-new="false"` keeps typed text out of the tags.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/form-elements/special-elements.md →
 * TagsElementFactory "Searching an endpoint" and "Only picked values".
 *
 * Run from this folder: node tags-remote-source.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

// The endpoint matches on name OR username; the label only shows the name
const users = [
  {value: '11', text: 'Alice Smith', username: 'alice@example.com'},
  {value: '12', text: 'Bob Jones', username: 'bob@example.com'},
  {value: '13', text: 'Carol White', username: 'zed@example.com'}
];

const requests = [];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <input type="text" id="people" name="people" data-element="tags" data-source="/users" data-min-length="2" data-allow-new="false">
</form>
<form id="f2">
  <input type="text" id="free" name="free" data-element="tags" data-source="/users" data-min-length="2">
</form>
<form id="f3">
  <input type="text" id="slow" name="slow" data-element="tags" data-source="/slow" data-min-length="1">
</form>
<form id="f4">
  <input type="text" id="local" name="local" data-element="tags" list="local-list">
  <datalist id="local-list">
    <option value="1" label="JavaScript">
    <option value="2" label="Python">
  </datalist>
</form>
<form id="f5">
  <input type="text" id="empty" name="empty" data-element="tags" data-source="/nothing" data-min-length="2">
</form>
<form id="f6">
  <input type="text" id="dflt" name="dflt" data-element="tags" data-source="/users">
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

const matching = q => users.filter(u => (u.text + ' ' + u.username).toLowerCase().includes(q.toLowerCase()));

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  const send = data => {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify({success: true, message: 'Search completed', data}));
  };
  if (url.pathname === '/users') {
    requests.push(req.url);
    return send(matching(url.searchParams.get('q') || ''));
  }
  if (url.pathname === '/nothing') {
    requests.push(req.url);
    return send(null);
  }
  if (url.pathname === '/slow') {
    // "a" answers late, "al" answers at once — the late answer must not win
    const q = url.searchParams.get('q') || '';
    return setTimeout(() => send(q === 'a' ? [{value: '99', text: 'stale answer'}] : matching(q)), q === 'a' ? 900 : 0);
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url);
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
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Focus the input and type `text` (one input event, like a paste of keystrokes). */
const type = (id, text) => tab.evaluate((id, text) => {
  const el = document.getElementById(id);
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', {bubbles: true}));
}, id, text);
/** Labels of the open suggestion rows of an input. */
const rows = id => tab.evaluate(id => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  return (inst.list || []).map(li => li.textContent);
}, id);
const isOpen = id => tab.evaluate(id => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  return !!(inst.dropdownPanel?.isOpen() && inst.dropdownPanel.currentTarget === inst.input);
}, id);
/** Values the form would submit for a tags field. */
const submitted = (form, name) => tab.evaluate((form, name) =>
  Array.from(document.querySelectorAll(`#${form} input[type="hidden"][name="${name}[]"]`)).map(i => i.value).join(','), form, name);
const chips = id => tab.evaluate(id => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  return inst.tags.map(t => t.value).join(',');
}, id);
const pickRow = (id, index) => tab.evaluate((id, index) => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  inst.list[index].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
}, id, index);
const pressEnter = id => tab.evaluate(id => {
  const el = document.getElementById(id);
  el.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
}, id);

// 1. Typing asks the endpoint with ?q=
await type('people', 'al');
await sleep(700);
check('typing sends GET <source>?q=<typed>', requests.includes('/users?q=al'), requests.join(' '));
check('the answer fills the suggestions', (await rows('people')).join('|') === 'Alice Smith', (await rows('people')).join('|'));

// 2. Rows the endpoint matched on a hidden column are not filtered out again
await type('people', 'zed');
await sleep(700);
check('a row matched on a column the label does not show is kept',
  (await rows('people')).join('|') === 'Carol White', (await rows('people')).join('|'));

// 3. Picking a row adds a chip with the row text and submits the row value
await pickRow('people', 0);
await sleep(150);
check('the picked row becomes a chip with its text', await chips('people') === 'Carol White', await chips('people'));
check('the picked row submits its value', await submitted('f1', 'people') === '13', await submitted('f1', 'people'));
check('the typing box is cleared after a pick', await tab.evaluate(() => document.getElementById('people').value) === '');
check('the suggestions close after a pick (there is no query left to ask with)', await isOpen('people') === false);

// 4. Below data-min-length nothing is asked
requests.length = 0;
await type('people', 'b');
await sleep(700);
check('a query shorter than data-min-length asks nothing', requests.length === 0, requests.join(' '));

// 5. data-allow-new="false": Enter on typed text adds nothing
await tab.evaluate(() => ElementManager.getInstanceByElement(document.getElementById('people')).hide());
await type('people', 'nobody here');
await sleep(700);
await tab.evaluate(() => ElementManager.getInstanceByElement(document.getElementById('people')).hide());
await pressEnter('people');
await sleep(100);
check('data-allow-new="false": Enter does not turn typed text into a tag',
  await submitted('f1', 'people') === '13', await submitted('f1', 'people'));
check('data-allow-new="false": the typed text stays to be corrected',
  await tab.evaluate(() => document.getElementById('people').value) === 'nobody here');

// 6. data-allow-new="false": pasting a list adds nothing
await tab.evaluate(() => {
  const el = document.getElementById('people');
  el.focus();
  el.value = 'x,y';
  el.dispatchEvent(new Event('paste', {bubbles: true}));
});
await sleep(100);
check('data-allow-new="false": a pasted list does not become tags',
  await submitted('f1', 'people') === '13', await submitted('f1', 'people'));

// 7. Enter on a highlighted row picks it, even with data-allow-new="false"
await type('people', 'bo');
await sleep(700);
await pressEnter('people');
await sleep(150);
check('Enter picks the highlighted suggestion', await submitted('f1', 'people') === '13,12', await submitted('f1', 'people'));

// 8. Without data-allow-new, typed text still becomes a tag (behaviour unchanged)
await type('free', 'nobody');
await sleep(700);
await tab.evaluate(() => ElementManager.getInstanceByElement(document.getElementById('free')).hide());
await pressEnter('free');
await sleep(100);
check('default: Enter turns typed text into a tag', await submitted('f2', 'free') === 'nobody', await submitted('f2', 'free'));
await tab.evaluate(() => {
  const el = document.getElementById('free');
  el.focus();
  el.value = 'x, y';
  el.dispatchEvent(new Event('paste', {bubbles: true}));
});
await sleep(100);
check('default: a pasted list splits on the default separator ","',
  await submitted('f2', 'free') === 'nobody,x,y', await submitted('f2', 'free'));

// 8b. Without data-min-length an endpoint waits for the class default (2), never asked empty
requests.length = 0;
await tab.evaluate(() => document.getElementById('dflt').focus());
await type('dflt', 'a');
await sleep(700);
check('no data-min-length: focus and one character ask nothing', requests.length === 0, requests.join(' '));
await type('dflt', 'al');
await sleep(700);
check('no data-min-length: two characters ask the endpoint', requests.includes('/users?q=al'), requests.join(' '));

// 9. A slower answer to an older query never replaces the newer one
await type('slow', 'a');
await sleep(400);
await type('slow', 'al');
await sleep(1500);
check('a late answer to an older query is dropped',
  (await rows('slow')).join('|') === 'Alice Smith', (await rows('slow')).join('|'));

// 10. An endpoint answering data: null closes the suggestions instead of keeping old rows
await type('empty', 'zz');
await sleep(700);
check('data: null shows no suggestions', (await rows('empty')).length === 0 && await isOpen('empty') === false);

// 11. Values bound with their labels show the labels (how an edit form shows saved picks)
await tab.evaluate(() => {
  const inst = ElementManager.getInstanceByElement(document.getElementById('people'));
  inst.setValue([{key: '11', value: 'Alice Smith'}, {key: '12', value: 'Bob Jones'}]);
});
check('bound {key, value} pairs show their labels', await chips('people') === 'Alice Smith,Bob Jones', await chips('people'));
check('bound {key, value} pairs submit their keys', await submitted('f1', 'people') === '11,12', await submitted('f1', 'people'));

// 12. A list source keeps filtering on the client and showing all on focus (behaviour unchanged)
await tab.evaluate(() => document.getElementById('local').focus());
await sleep(100);
check('list source: focus shows every option', (await rows('local')).join('|') === 'JavaScript|Python', (await rows('local')).join('|'));
await type('local', 'py');
await sleep(700);
check('list source: typing filters on the client', (await rows('local')).join('|') === 'Python', (await rows('local')).join('|'));
await pickRow('local', 0);
await sleep(150);
check('list source: the options open again after a pick', await isOpen('local') === true);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
