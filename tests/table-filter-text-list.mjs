/**
 * Proof that a text filter with options types and picks from a list (as an
 * input with a datalist), while a select filter lists the options.
 *
 *   <th data-field="member_id" data-filter="true" data-type="text">Name</th>
 *   response: {filters: {member_id: [{value: 7, text: 'Arisa'}, ...]}}
 *
 * The box shows the text of an option and the filter sends its value
 * (member_id=8, not "Mintra"). A text filter without options still filters
 * on the typed text. Before, a text filter dropped the options of the response.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const TABLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

const people = [{id: 7, name: 'Arisa', note: 'abc'}, {id: 8, name: 'Mintra', note: 'xyz'}, {id: 9, name: 'Thana', note: 'abd'}];
const requests = [];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="report" data-source="/rows" data-page-size="10">
  <thead><tr>
    <th data-field="member_id" data-filter="true" data-type="text" data-template="\${name}">Name</th>
    <th data-field="note" data-filter="true" data-type="text">Note</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (url.pathname === '/rows') {
    requests.push(url.searchParams);
    const member = url.searchParams.get('member_id') || '';
    const note = url.searchParams.get('note') || '';
    const rows = people.filter(p => (member === '' || String(p.id) === member) && (note === '' || p.note.includes(note)))
      .map(p => ({id: p.id, member_id: p.id, name: p.name, note: p.note}));
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {
      data: rows,
      // The "All" entry of a select is no suggestion for a text box
      filters: {member_id: [{value: '', text: 'All items'}, ...people.map(p => ({value: p.id, text: p.name}))]},
      // The server echoes the filter it used; "nobody" comes back as 0 (toInt), which names no option
      meta: {total: rows.length, page: 1, pageSize: 10, totalPages: 1, member_id: member === '' ? 0 : Number(member)}
    }}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => ['error', 'warn'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const last = () => requests[requests.length - 1];
const rows = () => tab.evaluate(() => [...document.querySelectorAll('[data-table="report"] tbody tr')].map(tr => tr.cells[0].textContent.trim()));
const box = '#filter_member_id_report';

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(600);

const control = await tab.evaluate((box) => {
  const el = document.querySelector(box);
  return el ? {tag: el.tagName, type: el.type} : null;
}, box);
check('a text filter with options is a box to type in, not a select', control && control.tag === 'INPUT' && control.type === 'text', JSON.stringify(control));
const empty = await tab.$eval(box, el => el.value);
check('a value echoed in meta that names no option (0) stays out of the box', empty === '', JSON.stringify(empty));

// Type part of a name: the list offers the matching options, not "All items"
await tab.click(box);
await tab.type(box, 'Min');
await sleep(700);
const offered = await tab.evaluate(() => [...document.querySelectorAll('.autocomplete-list li')].filter(li => li.offsetParent !== null).map(li => li.textContent.trim()));
check('typing offers the matching options of the response', offered.length === 1 && offered[0] === 'Mintra', JSON.stringify(offered));
const typedRequests = requests.length;
await sleep(1300);
check('typing alone does not filter on the partial text', requests.length === typedRequests, String(requests.length - typedRequests));

// Pick the option: the filter sends its value, the box shows its text
await tab.evaluate(() => {
  const li = [...document.querySelectorAll('.autocomplete-list li')].find(item => item.textContent.trim() === 'Mintra');
  li?.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
});
await sleep(1500);
check('a pick sends the value of the option (member_id=8)', last()?.get('member_id') === '8', String(last()?.get('member_id')));
check('the box shows the text of the option and the rows follow',
  await tab.$eval(box, el => el.value) === 'Mintra' && JSON.stringify(await rows()) === '["Mintra"]', JSON.stringify(await rows()));

// Emptied box: no filter
await tab.$eval(box, el => { el.focus(); el.select(); });
await tab.keyboard.press('Backspace');
await sleep(1500);
check('emptying the box clears the filter', (last()?.get('member_id') || '') === '' && (await rows()).length === 3, String(last()?.get('member_id')));

// The whole text of an option typed, then leaving the box
await tab.type(box, 'arisa');
await tab.evaluate((box) => document.querySelector(box).blur(), box);
await tab.evaluate((box) => document.querySelector(box).dispatchEvent(new Event('change', {bubbles: true})), box);
await sleep(1500);
check('typing the text of an option and leaving the box sends its value (member_id=7)', last()?.get('member_id') === '7', String(last()?.get('member_id')));

// A text filter without options still filters on the typed text
await tab.click('#filter_note_report');
await tab.type('#filter_note_report', 'ab');
await sleep(1500);
check('a text filter without options filters on the typed text', last()?.get('note') === 'ab', String(last()?.get('note')));

// Opening with ?member_id=8: the box shows the name, not the number
const reload = await browser.newPage();
reload.on('pageerror', e => errors.push(String(e)));
await reload.goto(base + '/?member_id=8', {waitUntil: 'networkidle0'});
await reload.evaluate(() => window.__ready);
await sleep(800);
const opened = await reload.$eval(box, el => el.value);
check('a value from the address shows as the text of its option', opened === 'Mintra', opened);

check('no errors or warnings on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
