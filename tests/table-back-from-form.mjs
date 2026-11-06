/**
 * Proof that a list whose columns come from the API (data-dynamic-columns)
 * comes back from its edit form on the same page, page size and sort — the
 * Settings → Languages flow: row "edit" → form → save answers redirect "back".
 *
 * **The bug this pins down.** parseRememberedSort() kept only the columns it
 * found as th[data-sort] in the header. A dynamic-columns table has no header
 * until the first response, so the remembered sort was always discarded:
 * returning without table parameters in the address (menu link, a redirect to
 * the list's path) restored page 2 and the page size under the default sort —
 * different rows on "the same" page.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 *
 *   cd tests && node table-back-from-form.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const TABLE = '../Now/dist/now.table.min.js';

const shell = origin => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main"></main>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production',
    allowEval: false,
    auth: {enabled: false},
    i18n: {enabled: false},
    security: {csrf: {enabled: false}},
    router: {
      enabled: true,
      base: '/',
      mode: 'history',
      auth: {enabled: false},
      routes: {
        '/languages': {template: '${origin}/tpl/languages.html', title: 'list'},
        '/language': {template: '${origin}/tpl/language.html', title: 'form'}
      }
    }
  });
  await TableManager.init();
})();
</script>
</body></html>`;

const LIST_TPL = `
<form data-table-filter="languages" class="table_nav">
  <select name="pageSize">
    <option value="10">10</option><option value="25">25</option><option value="50">50</option>
  </select>
  <input type="search" name="search">
</form>
<table data-table="languages" data-source="/api/languages" data-default-sort="id desc" data-page-size="25"
       data-row-actions='{"edit": {"label": "Edit","className": "btn btn-success icon-edit"}}'
       data-action-url="/api/action" data-dynamic-columns="true">
  <tbody></tbody>
</table>`;

const FORM_TPL = `
<form data-form="editlanguage" action="/api/save" method="post" data-ajax-submit="true">
  <input type="text" name="key" value="x">
  <button type="submit" id="save">Save</button>
</form>`;

const ROWS = Array.from({length: 120}, (_, i) => ({id: i + 1, key: `key ${String(i + 1).padStart(3, '0')}`, th: `th ${i + 1}`}));
const COLUMNS = [
  {field: 'id', label: 'ID', sort: 'id', type: 'number'},
  {field: 'key', label: 'Key', sort: 'key', searchable: true},
  {field: 'th', label: 'TH', sort: 'th'}
];
const json = (res, body) => {
  res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
};
let requests = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === '/tpl/languages.html' || url.pathname === '/tpl/language.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end(url.pathname === '/tpl/languages.html' ? LIST_TPL : FORM_TPL);
  }
  if (url.pathname === '/api/languages') {
    requests.push(url.searchParams);
    const q = url.searchParams;
    let rows = ROWS.slice();
    if (q.get('search')) rows = rows.filter(r => r.key.includes(q.get('search')));
    const sort = q.get('sort') || 'id desc';
    const [field, dir] = sort.split(',')[0].split(' ');
    rows.sort((x, y) => (x[field] > y[field] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    const pageSize = parseInt(q.get('pageSize') || '25', 10);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parseInt(q.get('page') || '1', 10), totalPages);
    return json(res, {data: rows.slice((page - 1) * pageSize, page * pageSize), columns: COLUMNS, meta: {page, pageSize, total, totalPages}});
  }
  if (url.pathname === '/api/action') {
    let body = '';
    req.on('data', c => body += c);
    return req.on('end', () => {
      const id = (body.match(/"?id"?\W+(\d+)/) || [])[1] || '1';
      json(res, {success: true, data: {actions: [{type: 'redirect', url: '/language?id=' + id, delay: 0}]}});
    });
  }
  if (url.pathname === '/api/save') {
    return json(res, {success: true, message: 'Saved', data: {actions: [{type: 'redirect', url: 'back', delay: 0}]}});
  }
  // History-mode SPA: every route is served the same shell
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(shell(`http://${req.headers.host}`));
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const last = () => requests[requests.length - 1] || new URLSearchParams();
const address = () => tab.evaluate(() => decodeURIComponent(location.pathname + location.search).replace(/\+/g, ' '));
const view = () => tab.evaluate(() => ({
  firstRow: document.querySelector('table[data-table="languages"] tbody tr td:not(.row-actions-cell):not(.checkbox-cell)')?.textContent?.trim() || null,
  rows: document.querySelectorAll('table[data-table="languages"] tbody tr').length,
  sortTh: [...document.querySelectorAll('table[data-table="languages"] th.sort_asc, table[data-table="languages"] th.sort_desc')].map(th => th.dataset.sort + ':' + th.className.match(/sort_(asc|desc)/)[1]).join(','),
  pageSizeSelect: document.querySelector('form[data-table-filter="languages"] select[name="pageSize"]')?.value
}));

const goPage2 = () => tab.evaluate(() => [...document.querySelectorAll('.pagination-button')].find(b => b.textContent.trim() === '2').click());
const openEditor = () => tab.evaluate(() => document.querySelector('table[data-table="languages"] .row-actions-cell button').click());

await tab.goto(base + '/languages', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(800);

// 50 per page, sorted by key, page 2
await tab.evaluate(() => {
  const el = document.querySelector('form[data-table-filter="languages"] select[name="pageSize"]');
  el.value = '50';
  el.dispatchEvent(new Event('change', {bubbles: true}));
});
await sleep(1500); // filter changes are debounced (1s)
await tab.click('table[data-table="languages"] th[data-sort="key"]');
await sleep(800);
await goPage2();
await sleep(800);
const before = await view();
check('list set up: 50 per page, key asc, page 2',
  last().get('pageSize') === '50' && last().get('sort') === 'key asc' && last().get('page') === '2', last().toString());

/**
 * Leaves the list for the editor, comes back by `how`, and checks the list
 * shows what it showed before.
 */
async function roundTrip(label, how) {
  await openEditor();
  await sleep(1000);
  requests = [];
  await how();
  await sleep(1500);
  const after = await view();
  const q = last();
  check(`${label}: same page size, page and sort requested`,
    q.get('pageSize') === '50' && q.get('page') === '2' && q.get('sort') === 'key asc', q.toString());
  check(`${label}: same rows, sort indicator and page-size selector`,
    after.firstRow === before.firstRow && after.sortTh === 'key:asc' && after.pageSizeSelect === '50',
    `${before.firstRow} → ${after.firstRow}, ${after.sortTh}, ${after.pageSizeSelect}`);
}

// 1. Save answers redirect "back": the address still carries the table state
await roundTrip('save → back', () => tab.evaluate(() => document.querySelector('#save').click()));

// 2. Back to the list through the menu: no table parameters in the address,
//    the remembered state is all there is — and the header does not exist yet
await roundTrip('menu link', () => tab.evaluate(() => RouterManager.navigate('/languages')));

// 3. A remembered sort column the API no longer sends is dropped once the
//    header arrives, instead of staying in the address and in storage
await tab.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('now.table:/languages'));
  localStorage.setItem(key, JSON.stringify({...JSON.parse(localStorage.getItem(key)), sort: 'gone asc'}));
});
await tab.evaluate(() => RouterManager.navigate('/language?id=1'));
await sleep(800);
await tab.evaluate(() => RouterManager.navigate('/languages'));
await sleep(1500);
const stale = await tab.evaluate(() => {
  const key = Object.keys(localStorage).find(k => k.startsWith('now.table:/languages'));
  return {address: decodeURIComponent(location.search), kept: JSON.parse(localStorage.getItem(key) || 'null')};
});
check('a remembered column that no longer exists is dropped',
  !stale.address.includes('gone') && !(stale.kept?.sort || '').includes('gone'), JSON.stringify(stale));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
