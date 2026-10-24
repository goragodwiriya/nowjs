/**
 * Proof that typing into a table's built-in search box is never cut off by the
 * search it triggers: the box keeps focus and every keystroke survives a
 * response that comes back while the user is still typing.
 *
 * The case that broke was a table whose headers come from the response
 * (data-dynamic-columns) in a language other than English: the translated
 * header text never matched the response's label, so every response rebuilt
 * the headers and the filter bar, replacing the search box being typed into.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node table-search-typing.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

const translations = {ID: 'รหัส', Name: 'ชื่อ', Status: 'สถานะ'};

const boot = (tables) => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
${tables}
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
  document.querySelectorAll('table[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const markupTable = `
<table data-table="users" data-source="/rows" data-page-size="10" data-search-columns="name" data-show-checkbox="true"
  data-actions='{"delete":"Delete"}' data-action-url="/action" data-action-button="Process|btn-success">
  <thead><tr>
    <th data-field="id" data-sort="id" data-i18n>ID</th>
    <th data-field="name" data-sort="name" data-i18n>Name</th>
    <th data-field="status" data-filter="true" data-type="select" data-show-all="true" data-all-value="" data-i18n>Status</th>
  </tr></thead>
  <tbody></tbody>
</table>`;

const dynamicTable = `
<table data-table="users" data-source="/rows?columns=1" data-page-size="10" data-show-checkbox="true"
  data-actions='{"delete":"Delete"}' data-action-url="/action" data-action-button="Process|btn-success"
  data-dynamic-columns="true">
  <tbody></tbody>
</table>`;

const pages = {
  '/markup': boot(markupTable),
  '/dynamic': boot(dynamicTable)
};

const ROWS = Array.from({length: 57}, (_, i) => ({id: i + 1, name: `user ${String(i + 1).padStart(2, '0')}`, status: i % 2 ? 1 : 0}));
let requests = [];
let delay = 0;

const columns = (search) => [
  // A search for "swap" answers with other columns, which must still be rebuilt
  {field: 'id', label: search === 'swap' ? 'Code' : 'ID', sort: 'id', type: 'number', i18n: true},
  {field: 'name', label: 'Name', sort: 'name', searchable: true, i18n: true},
  {field: 'status', label: 'Status', filter: true, type: 'select', i18n: true}
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  if (pages[url.pathname]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[url.pathname]);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (url.pathname.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(url.pathname.startsWith('/lang/th') ? translations : {}));
  }
  if (url.pathname === '/rows') {
    requests.push(url.searchParams);
    if (delay) await new Promise(r => setTimeout(r, delay));
    const q = url.searchParams;
    let rows = ROWS.slice();
    if (q.get('status') !== null && q.get('status') !== '') rows = rows.filter(r => String(r.status) === q.get('status'));
    if (q.get('search') && q.get('search') !== 'swap') rows = rows.filter(r => r.name.includes(q.get('search')));
    const pageSize = parseInt(q.get('pageSize') || '10', 10);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parseInt(q.get('page') || '1', 10), totalPages);
    const body = {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      meta: {page, pageSize, total, totalPages, search: q.get('search') || ''},
      filters: {status: [{value: '1', text: 'Active'}, {value: '0', text: 'Inactive'}]}
    };
    if (q.get('columns')) body.columns = columns(q.get('search'));
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify(body));
  }
  res.writeHead(url.pathname === '/favicon.ico' ? 204 : 404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const errors = [];
const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const open = async (path) => {
  requests = [];
  delay = 0;
  await tab.goto(base + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(300);
};
const state = () => tab.evaluate(() => {
  const el = document.getElementById('search_users');
  return {
    same: el === window.__box,
    focused: document.activeElement === el,
    value: el?.value,
    headers: Array.from(document.querySelectorAll('table[data-table="users"] thead th[data-field]')).map(th => th.textContent.trim()).join('/'),
    sameThead: document.querySelector('table[data-table="users"] thead') === window.__thead
  };
});
const searches = () => requests.map(r => r.get('search')).join(' | ');

for (const path of ['/markup', '/dynamic']) {
  console.log(`\n${path}`);
  await open(path);
  await tab.evaluate(() => {
    window.__box = document.getElementById('search_users');
    window.__thead = document.querySelector('table[data-table="users"] thead');
  });
  let s = await state();
  check('headers are translated', s.headers === 'รหัส/ชื่อ/สถานะ', s.headers);
  await tab.click('#search_users');

  // Type, pause past the debounce so a search goes out, and keep typing while
  // its response is still on its way back.
  delay = 700;
  await tab.keyboard.type('user', {delay: 120});
  await sleep(1150); // debounce fires, request in flight
  await tab.keyboard.type(' 1', {delay: 120});
  await sleep(800); // first response lands while the second debounce waits
  s = await state();
  check('box keeps focus while a search returns mid-typing', s.focused && s.same, JSON.stringify(s));
  check('typed text survives the first response', s.value === 'user 1', JSON.stringify(s.value));
  check('unchanged headers are left in place', s.sameThead, JSON.stringify(s));

  await tab.keyboard.type('2', {delay: 120});
  await sleep(2200);
  s = await state();
  check('box keeps focus after the last search', s.focused && s.same, JSON.stringify(s));
  check('every keystroke kept', s.value === 'user 12', JSON.stringify(s.value));
  check('last request searches the full text', requests[requests.length - 1]?.get('search') === 'user 12', searches());
  const rows = await tab.evaluate(() => document.querySelectorAll('table[data-table="users"] tbody tr').length);
  check('table shows the matching row', rows === 1, `rows=${rows}`);

  // Typing that keeps going sends nothing until it stops: the debounce
  // restarts on every key.
  requests = [];
  delay = 300;
  await tab.keyboard.press('Backspace');
  await tab.keyboard.press('Backspace');
  for (const ch of '0000000') {
    await tab.keyboard.type(ch);
    await sleep(400);
  }
  check('no request while typing keeps going', requests.length === 0, `requests=${requests.length}`);
  await sleep(1600);
  s = await state();
  check('one request once typing stops', requests.length === 1 && requests[0].get('search') === 'user 0000000', searches());
  check('focus kept after a burst', s.focused && s.same && s.value === 'user 0000000', JSON.stringify(s));

  if (path === '/dynamic') {
    // Columns that really change are still rebuilt
    delay = 0;
    await tab.evaluate(() => {
      const el = document.getElementById('search_users');
      el.value = 'swap';
      el.dispatchEvent(new Event('input', {bubbles: true}));
    });
    await sleep(1500);
    s = await state();
    check('changed columns are rebuilt', !s.sameThead && s.headers === 'Code/ชื่อ/สถานะ', JSON.stringify(s));
  }
}

console.log(errors.length ? `\npage errors:\n  ${errors.join('\n  ')}` : '\nno page errors');
await browser.close();
server.close();
const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
