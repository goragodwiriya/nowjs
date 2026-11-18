/**
 * Proof that `data-depends` narrows every autocomplete by other fields of its form.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/form-elements/text-elements.md →
 * "Filtering by other fields" (text inputs) and special-elements.md (tags).
 *
 * Run from this folder: node autocomplete-depends.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const users = [
  {value: '11', text: 'Alice Smith', department: '1'},
  {value: '12', text: 'Alan Jones', department: '2'},
  {value: '13', text: 'Alba White', department: '2'}
];

const requests = [];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <select name="department" id="department">
    <option value="">all</option>
    <option value="1">One</option>
    <option value="2">Two</option>
  </select>
  <label><input type="checkbox" name="status[]" value="1"> a</label>
  <label><input type="checkbox" name="status[]" value="2"> b</label>
  <label><input type="radio" name="kind" value="x"> x</label>
  <label><input type="radio" name="kind" value="y"> y</label>
  <select name="roles[]" id="roles" multiple>
    <option value="r1">r1</option>
    <option value="r2">r2</option>
  </select>
  <input type="text" name="locked" value="L" disabled>
  <input type="text" id="team" name="team" data-element="tags">
  <input type="text" id="person" name="person" data-autocomplete="true" data-source="/users" data-min-length="2"
         data-depends="department,status,kind,roles,locked,team,dept:department">
  <input type="text" id="members" name="members" data-element="tags" data-source="/users" data-min-length="2"
         data-depends="department">
</form>
<form id="f2">
  <select name="department" id="department2">
    <option value="">all</option>
    <option value="1">One</option>
    <option value="2">Two</option>
  </select>
  <input type="text" id="local_person" name="local_person" data-autocomplete="true" data-source="peopleList"
         data-min-length="1" data-depends="department">
  <input type="text" id="local_members" name="local_members" data-element="tags" data-options-key="people"
         data-depends="department">
</form>
<form id="f3">
  <select name="group" id="group">
    <option value="">all</option>
    <option value="1">One</option>
    <option value="2">Two</option>
  </select>
  <input type="text" id="keep_person" name="keep_person" data-autocomplete="true" data-source="/users" data-min-length="2" data-depends="department:group">
  <input type="text" id="clear_person" name="clear_person" data-autocomplete="true" data-source="/users" data-min-length="2"
         data-depends="department:group" data-depends-clear="true">
  <input type="text" id="keep_tags" name="keep_tags" data-element="tags" data-source="/users" data-min-length="2" data-depends="department:group">
  <input type="text" id="clear_tags" name="clear_tags" data-element="tags" data-source="/users" data-min-length="2"
         data-depends="department:group" data-depends-clear="true">
</form>
<script>
// A list source with a property to filter on, and one row without it (always shown)
window.peopleList = [
  {value: '11', text: 'Alice Smith', department: '1'},
  {value: '12', text: 'Alan Jones', department: '2'},
  {value: '14', text: 'Alma Guest'}
];
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
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (url.pathname === '/users') {
    requests.push(req.url);
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const dept = url.searchParams.get('department');
    const data = users.filter(u => u.text.toLowerCase().includes(q) && (!dept || u.department === dept));
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data}));
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

const type = (id, text) => tab.evaluate((id, text) => {
  const el = document.getElementById(id);
  el.focus();
  el.value = text;
  el.dispatchEvent(new Event('input', {bubbles: true}));
}, id, text);
const rows = id => tab.evaluate(id => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  return (inst.list || []).map(li => li.textContent);
}, id);
const pickRow = (id, index) => tab.evaluate((id, index) => {
  const inst = ElementManager.getInstanceByElement(document.getElementById(id));
  inst.list[index].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
}, id, index);
/** Change a field the way a user does: set it, then fire `change`. */
const change = (selector, apply) => tab.evaluate((selector, apply) => {
  const el = document.querySelector(selector);
  if (apply === 'check') el.checked = true;
  else if (apply.startsWith('options:')) {
    const want = apply.slice(8).split(',');
    Array.from(el.options).forEach(o => { o.selected = want.includes(o.value); });
  } else el.value = apply;
  el.dispatchEvent(new Event('change', {bubbles: true}));
}, selector, apply);
const lastRequest = () => decodeURIComponent(requests[requests.length - 1] || '');
const hidden = (form, name) => tab.evaluate((form, name) =>
  Array.from(document.querySelectorAll(`#${form} input[type="hidden"][name="${name}"], #${form} input[type="hidden"][name="${name}[]"]`)).map(i => i.value).join(','), form, name);

// 1. Nothing chosen: no filter parameters at all
await type('person', 'al');
await sleep(700);
check('empty filter fields add no parameters', lastRequest() === '/users?q=al', lastRequest());

// 2. Each kind of field sends what a form submit would send
await change('#department', '2');
await change('input[name="status[]"][value="2"]', 'check');
await change('input[name="kind"][value="y"]', 'check');
await change('#roles', 'options:r1,r2');
await tab.evaluate(() => ElementManager.getInstanceByElement(document.getElementById('team')).addTag('t9', 'Team 9'));
await type('person', 'al');
await sleep(700);
const sent = lastRequest();
check('a select sends its value', sent.includes('&department=2'), sent);
check('a checkbox group sends only its checked boxes as an array', sent.includes('&status[]=2') && !sent.includes('status[]=1'), sent);
check('a radio group sends the checked radio', sent.includes('&kind=y') && !sent.includes('kind=x'), sent);
check('a multiple select sends every selected option', sent.includes('&roles[]=r1&roles[]=r2'), sent);
check('a disabled field is not sent', !sent.includes('locked'), sent);
check('a tags field sends its tags as an array', sent.includes('&team[]=t9'), sent);
check('param:field sends a field under another name', sent.includes('&dept=2'), sent);
check('the endpoint answer is shown as filtered', (await rows('person')).join('|') === 'Alan Jones|Alba White', (await rows('person')).join('|'));

// 3. Tags with an endpoint send the same parameters
await type('members', 'al');
await sleep(700);
check('tags: data-depends goes to the endpoint', lastRequest() === '/users?q=al&department=2', lastRequest());
check('tags: the filtered answer is shown', (await rows('members')).join('|') === 'Alan Jones|Alba White', (await rows('members')).join('|'));

// 4. A list source is filtered on the row property named like the parameter
await change('#department2', '1');
await type('local_person', 'al');
await sleep(700);
check('list: rows of another department are hidden', (await rows('local_person')).join('|') === 'Alice Smith|Alma Guest', (await rows('local_person')).join('|'));
await change('#department2', '');
await type('local_person', 'al');
await sleep(700);
check('list: an empty filter field shows every row', (await rows('local_person')).length === 3, (await rows('local_person')).join('|'));

await tab.evaluate(() => TagsElementFactory.populateFromOptions(document.getElementById('local_members'), {people: window.peopleList}, 'people'));
await change('#department2', '2');
await tab.evaluate(() => document.getElementById('local_members').focus());
await sleep(150);
check('tags list: focus shows only matching rows and rows without the property',
  (await rows('local_members')).join('|') === 'Alan Jones|Alma Guest', (await rows('local_members')).join('|'));

// 5. Changing a filter keeps what was picked, unless data-depends-clear="true"
await change('#group', '2');
await type('keep_person', 'al');
await sleep(700);
await pickRow('keep_person', 0);
await type('clear_person', 'al');
await sleep(700);
await pickRow('clear_person', 0);
await type('keep_tags', 'al');
await sleep(700);
await pickRow('keep_tags', 0);
await type('clear_tags', 'al');
await sleep(700);
await pickRow('clear_tags', 0);
await sleep(150);
check('picks are in place before the filter changes',
  (await hidden('f3', 'keep_person')) === '12' && (await hidden('f3', 'clear_person')) === '12'
  && (await hidden('f3', 'keep_tags')) === '12' && (await hidden('f3', 'clear_tags')) === '12');
await change('#group', '1');
await sleep(100);
check('default: a text pick stays after the filter changes', await hidden('f3', 'keep_person') === '12', await hidden('f3', 'keep_person'));
check('default: tags stay after the filter changes', await hidden('f3', 'keep_tags') === '12', await hidden('f3', 'keep_tags'));
check('data-depends-clear: the text pick is emptied', await hidden('f3', 'clear_person') === '' &&
  await tab.evaluate(() => document.getElementById('clear_person').value) === '');
check('data-depends-clear: the tags are removed', await hidden('f3', 'clear_tags') === '', await hidden('f3', 'clear_tags'));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
