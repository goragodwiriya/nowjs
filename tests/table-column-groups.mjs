/**
 * Proof that a table repeats its column-group prototypes for the lists the
 * response sends (columnGroups), so a report with a column per leave type or
 * per day keeps its markup in the template and its API sends data only.
 *
 *   <th data-column-group="types"><span class="one_line" title="{topic}">{topic}</span></th>
 *   <th data-group-of="types" data-field="taken_{id}" data-template="<a href='${taken_url_{id}}'>${taken_{id}}</a>">Taken</th>
 *   response: {columnGroups: {types: [{id: 1, topic: 'Sick'}, ...]}, data: [{taken_1: ...}]}
 *
 * Before this, such a table either drew itself with a script or took its
 * columns, templates included, from the API (data-dynamic-columns).
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const BUNDLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

let types = [{id: 1, topic: 'Sick <b>'}, {id: 2, topic: 'Personal'}];
let doc = 'monthly';
const requests = [];

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="report" data-source="/report" data-page-size="10">
  <thead>
    <tr>
      <th data-field="name" data-sort="name" rowspan="2" data-i18n>Name</th>
      <th data-column-group="types" class="center"><span class="one_line" title="{topic}">{topic}</span></th>
    </tr>
    <tr>
      <th data-group-of="types" data-field="limit_{id}" class="center" data-cell-class="center" data-i18n>Limit</th>
      <th data-group-of="types" data-field="taken_{id}" data-sort="taken_{id}" class="center" data-cell-class="center"
          data-template="<a href='\${taken_url_{id}}'>\${taken_{id}}</a>" data-i18n>Taken</th>
      <th data-group-of="types" data-field="remain_{id}" class="center" data-cell-class="center" data-i18n>Remain</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
<table data-table="days" data-source="/days">
  <thead>
    <tr>
      <th data-field="name">Employee</th>
      <th data-column-group="days" data-field="d_{key}" class="center">{label}</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
<table data-table="docs" data-source="/docs">
  <thead>
    <tr>
      <th data-field="name">Employee</th>
      <th data-column-group="monthly" data-field="date" class="center">Date</th>
      <th data-column-group="monthly" data-field="tax" class="right">Tax</th>
      <th data-column-group="yearly" data-field="address">Address</th>
      <th data-column-group="yearly" data-field="total" class="right">Total</th>
      <th data-field="note">Note</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>
<div data-component="api" data-endpoint="/bound">
  <table data-table="bound" data-attr="data:matrix">
    <thead>
      <tr>
        <th data-field="name">Employee</th>
        <th data-column-group="docs" data-field="doc_{key}_text" class="center">{name}</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
</div>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
})();
window.headOf = (id) => [...document.querySelectorAll('[data-table="' + id + '"] thead tr')].map(tr => [...tr.children].map(th => ({
  text: th.textContent.trim(), field: th.dataset.field || '', span: th.colSpan, html: th.innerHTML
})));
window.rowsOf = (id) => [...document.querySelectorAll('[data-table="' + id + '"] tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim()));
</script>
</body></html>`;

const rows = () => [
  {name: 'Arisa', limit_1: '30', taken_1: '2', taken_url_1: '/leave?type=1&who=arisa', remain_1: '28', limit_2: '3', taken_2: '1', taken_url_2: '/leave?type=2', remain_2: '2',
    limit_3: 'x', taken_3: '0', taken_url_3: '#', remain_3: 'x'}
];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (url.pathname.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(url.pathname.startsWith('/lang/th') ? {Name: 'ชื่อ', Limit: 'จำกัด', Taken: 'ลา', Remain: 'คงเหลือ'} : {}));
  }
  if (url.pathname === '/report') {
    requests.push(url.searchParams);
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: rows(), columnGroups: {types}, meta: {total: 1, page: 1, pageSize: 10, totalPages: 1}}}));
  }
  if (url.pathname === '/bound') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {matrix: {
      data: [{name: 'Arisa', doc_d1_text: 'Signed'}, {name: 'Mintra', doc_d1_text: 'Waiting', doc_d2_text: 'Read'}],
      columnGroups: {docs: [{key: 'd1', name: 'Contract'}, {key: 'd2', name: 'Policy'}]}
    }}}));
  }
  if (url.pathname === '/docs') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {
      data: [{name: 'Arisa', date: '2026-01-31', tax: '100', address: 'Bangkok', total: '1,200', note: 'ok'}],
      columnGroups: {monthly: doc === 'monthly' ? [{key: 'monthly'}] : [], yearly: doc === 'yearly' ? [{key: 'yearly'}] : []},
      meta: {total: 1}
    }}));
  }
  if (url.pathname === '/days') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {
      data: [{name: 'Arisa', d_0101: 'Day', d_0102: 'Night'}],
      columnGroups: {days: [{key: '0101', label: 'Mon 1'}, {key: '0102', label: 'Tue 2'}]},
      meta: {total: 1}
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

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(500);

let head = await tab.evaluate(() => window.headOf('report'));
check('one group cell per item, spanning its three sub-columns',
  head[0].length === 3 && head[0][1].text === 'Sick <b>' && head[0][1].span === 3 && head[0][2].text === 'Personal' && head[0][2].span === 3,
  JSON.stringify(head[0].map(h => [h.text, h.span])));
check('the item text goes in escaped (no markup from data)', !/<b>/.test(head[0][1].html.replace(/&lt;b&gt;/g, '')) && /title="Sick &lt;b&gt;"/.test(head[0][1].html), head[0][1].html);
check('sub-columns repeat per item with their fields filled in and translated labels',
  head[1].map(h => h.field).join() === 'limit_1,taken_1,remain_1,limit_2,taken_2,remain_2' && head[1].map(h => h.text).join() === 'จำกัด,ลา,คงเหลือ,จำกัด,ลา,คงเหลือ',
  JSON.stringify(head[1].map(h => [h.field, h.text])));
let body = await tab.evaluate(() => window.rowsOf('report'));
check('cells line up under their columns', JSON.stringify(body[0]) === JSON.stringify(['Arisa', '30', '2', '28', '3', '1', '2']), JSON.stringify(body[0]));
const link = await tab.evaluate(() => document.querySelector('[data-table="report"] tbody td[data-field="taken_1"] a')?.getAttribute('href'));
check('the cell template of a prototype uses the fields of its item', link === '/leave?type=1&who=arisa', link);

const before = requests.length;
await tab.evaluate(() => document.querySelector('[data-table="report"] thead th[data-field="taken_2"]').click());
await sleep(600);
check('a generated column sorts like any other (sort=taken_2)', requests.length > before && /^taken_2/.test(requests[requests.length - 1].get('sort') || ''), String(requests[requests.length - 1]?.get('sort')));

// The same lists again: the header is kept (no rebuild)
const marked = await tab.evaluate(() => { document.querySelector('[data-table="report"] thead th[data-field="limit_1"]').dataset.mark = 'same'; return true; });
await tab.evaluate(() => TableManager.loadTableData('report'));
await sleep(500);
check('the same lists do not rebuild the header', marked && await tab.evaluate(() => document.querySelector('[data-table="report"] thead th[data-field="limit_1"]')?.dataset.mark === 'same'));

// Another list: one more type
types = [{id: 1, topic: 'Sick'}, {id: 2, topic: 'Personal'}, {id: 3, topic: 'Vacation'}];
await tab.evaluate(() => TableManager.loadTableData('report'));
await sleep(500);
head = await tab.evaluate(() => window.headOf('report'));
body = await tab.evaluate(() => window.rowsOf('report'));
check('a changed list rebuilds the groups (3 types, 9 sub-columns)', head[0].length === 4 && head[1].length === 9 && body[0].length === 10, JSON.stringify([head[0].map(h => h.text), head[1].length, body[0].length]));

// A group without sub-columns is itself the column (one per day)
head = await tab.evaluate(() => window.headOf('days'));
body = await tab.evaluate(() => window.rowsOf('days'));
check('a single-row group: one column per item', JSON.stringify(head[0].map(h => [h.text, h.field])) === JSON.stringify([['Employee', 'name'], ['Mon 1', 'd_0101'], ['Tue 2', 'd_0102']]) && JSON.stringify(body[0]) === JSON.stringify(['Arisa', 'Day', 'Night']),
  JSON.stringify([head[0], body[0]]));

// Several cells share a group name: a list of one item shows them all in their places, an empty list hides them
const docsView = () => tab.evaluate(() => [window.headOf('docs')[0].map(h => h.field).join(), window.rowsOf('docs')[0].join()]);
let docs = await docsView();
check('cells sharing a group name show together in their places (one item)', docs[0] === 'name,date,tax,note' && docs[1] === 'Arisa,2026-01-31,100,ok', JSON.stringify(docs));
doc = 'yearly';
await tab.evaluate(() => TableManager.loadTableData('docs'));
await sleep(500);
docs = await docsView();
check('another list switches to the other set of columns', docs[0] === 'name,address,total,note' && docs[1] === 'Arisa,Bangkok,1,200,ok', JSON.stringify(docs));

// A table bound to page data (data-attr="data:matrix"): the column groups come with the bound object
head = await tab.evaluate(() => window.headOf('bound'));
body = await tab.evaluate(() => window.rowsOf('bound'));
check('a bound table gets its column groups from the bound object (data + columnGroups)',
  JSON.stringify(head[0].map(h => h.text)) === JSON.stringify(['Employee', 'Contract', 'Policy']) && JSON.stringify(body) === JSON.stringify([['Arisa', 'Signed', ''], ['Mintra', 'Waiting', 'Read']]),
  JSON.stringify([head[0].map(h => h.text), body]));

await tab.evaluate(() => I18nManager.setLocale('en'));
await sleep(400);
head = await tab.evaluate(() => window.headOf('report'));
check('sub-column labels follow the locale', head[1].slice(0, 3).map(h => h.text).join() === 'Limit,Taken,Remain', JSON.stringify(head[1].slice(0, 3).map(h => h.text)));

check('no errors or warnings on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
