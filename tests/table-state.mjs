/**
 * Proof that TableManager remembers each table's state and column widths as
 * documented (docs/en/TableManager.md → "Remembered State", "Column Resizing").
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node table-state.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

const boot = (tables) => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title>
<style>table{width:900px}.col-resizer{position:absolute;top:0;right:0;width:8px;height:100%;cursor:col-resize;touch-action:none}</style>
</head><body>
${tables}
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  document.querySelectorAll('table[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const usersTable = (extra = '') => `
<table data-table="users" data-source="/rows" data-page-size="10" data-search-columns="name" ${extra}>
  <thead><tr>
    <th data-field="id" data-sort="id">ID</th>
    <th data-field="name" data-sort="name">Name</th>
    <th data-field="status" data-filter="true" data-type="select" data-options='{"1":"Active","0":"Inactive"}'>Status</th>
    <th data-field="note">Note</th>
  </tr></thead>
  <tbody></tbody>
</table>`;

const pages = {
  '/list': boot(usersTable()),
  '/plain': boot(usersTable('data-remember-state="false"')),
  '/local': boot(`
<table data-table="local" data-page-size="10">
  <thead><tr><th data-field="id">ID</th><th data-field="name">Name</th></tr></thead>
  <tbody>${Array.from({length: 15}, (_, i) => `<tr><td>${i + 1}</td><td>row ${i + 1}</td></tr>`).join('')}</tbody>
</table>`),
  '/two': boot(`
<table data-table="a" data-source="/rows?t=a" data-page-size="10">
  <thead><tr><th data-field="id" data-sort="id">ID</th><th data-field="name">Name</th></tr></thead><tbody></tbody>
</table>
<table data-table="b" data-source="/rows?t=b" data-page-size="10">
  <thead><tr><th data-field="id" data-sort="id">ID</th><th data-field="name">Name</th></tr></thead><tbody></tbody>
</table>`)
};

const ROWS = Array.from({length: 57}, (_, i) => ({id: i + 1, name: `user ${String(i + 1).padStart(2, '0')}`, status: i % 2 ? 1 : 0, note: ''}));
let requests = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (pages[url.pathname]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[url.pathname]);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (url.pathname === '/rows') {
    requests.push(url.searchParams);
    const q = url.searchParams;
    let rows = ROWS.slice();
    if (q.get('status') !== null && q.get('status') !== '') rows = rows.filter(r => String(r.status) === q.get('status'));
    if (q.get('search')) rows = rows.filter(r => r.name.includes(q.get('search')));
    if (q.get('sort')) {
      const [field, dir] = q.get('sort').split(',')[0].split(' ');
      rows.sort((x, y) => (x[field] > y[field] ? 1 : -1) * (dir === 'desc' ? -1 : 1));
    }
    const pageSize = parseInt(q.get('pageSize') || '10', 10);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parseInt(q.get('page') || '1', 10), totalPages);
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({data: rows.slice((page - 1) * pageSize, page * pageSize), meta: {page, pageSize, total, totalPages}}));
  }
  if (url.pathname === '/all') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify(ROWS.slice(0, 15)));
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

const open = async (tab, path) => {
  requests = [];
  await tab.goto(base + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(300);
};
const last = () => requests[requests.length - 1] || new URLSearchParams();
const address = tab => tab.evaluate(() => decodeURIComponent(location.search).replace(/\+/g, ' '));
const setControl = async (tab, selector, value) => {
  await tab.evaluate((sel, val) => {
    const el = document.querySelector(sel);
    el.value = val;
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }, selector, value);
  await sleep(1300); // filter changes are debounced (1s)
};

const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

// ---------------------------------------------------------------- remembered state
await open(tab, '/list?module_id=5');
check('first visit loads the defaults', last().get('pageSize') === '10' && !last().get('status'), last().toString());
check('first visit leaves the address alone', (await address(tab)) === '?module_id=5', await address(tab));

await setControl(tab, '#pageSize_users', '25');
await setControl(tab, '#filter_status_users', '1');
await tab.click('th[data-sort="name"]');
await sleep(500);
await tab.evaluate(() => [...document.querySelectorAll('.pagination-button')].find(b => b.textContent.trim() === '2').click());
await sleep(500);
check('choices reach the API', last().get('pageSize') === '25' && last().get('status') === '1' && last().get('sort') === 'name asc' && last().get('page') === '2', last().toString());

await open(tab, '/list?module_id=5');
check('coming back restores page size, filter, sort and page', last().get('pageSize') === '25' && last().get('status') === '1' && last().get('sort') === 'name asc' && last().get('page') === '2', last().toString());
const ui = await tab.evaluate(() => ({
  size: document.querySelector('#pageSize_users').value,
  status: document.querySelector('#filter_status_users').value,
  sorted: document.querySelector('th[data-sort="name"]').classList.contains('sort_asc')
}));
check('the controls show the restored state', ui.size === '25' && ui.status === '1' && ui.sorted, JSON.stringify(ui));
check('the address then shows the restored state', /pageSize=25/.test(await address(tab)) && /status=1/.test(await address(tab)), await address(tab));

await open(tab, '/list?module_id=6');
check('another module_id is another list (defaults)', last().get('pageSize') === '10' && !last().get('status'), last().toString());

const tab2 = await browser.newPage();
await open(tab2, '/list?module_id=5');
check('a new tab keeps page size, filter and sort but starts at page 1', last().get('pageSize') === '25' && last().get('status') === '1' && last().get('sort') === 'name asc' && (!last().get('page') || last().get('page') === '1'), last().toString());
await tab2.close();

await open(tab, '/list?module_id=5&pageSize=50');
check('an address with table parameters wins and is shown as it is', last().get('pageSize') === '50' && !last().get('status'), last().toString());

await open(tab, '/plain?module_id=5');
await setControl(tab, '#pageSize_users', '100');
await open(tab, '/plain?module_id=5');
check('data-remember-state="false" remembers nothing', last().get('pageSize') === '10', last().toString());

await open(tab, '/list?module_id=5');
await tab.evaluate(() => TableManager.clearTableCache('users'));
const leftovers = await tab.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter(k => k.includes(':users')));
check('clearTableCache forgets the table', leftovers.length === 0, JSON.stringify(leftovers));

// ---------------------------------------------------------------- stale page on a client-side table
await open(tab, '/local?page=9');
const localRows = await tab.evaluate(() => [...document.querySelectorAll('table[data-table="local"] tbody tr')].map(tr => tr.cells[0].textContent.trim()));
check('a page past the end of a client-side table shows the last page', localRows[0] === '11' && localRows.length === 5, localRows.join(','));

// ---------------------------------------------------------------- two tables on one page
await open(tab, '/two');
await tab.evaluate(() => [...TableManager.state.tables.get('a').paginationWrapper.querySelectorAll('.pagination-button')]
  .find(b => b.textContent.trim() === '2').click());
await sleep(500);
const twoAddress = await address(tab);
check('two tables write tableId.key to the address', /a\.page=2/.test(twoAddress) && !/(^|[?&])page=/.test(twoAddress), twoAddress);
await open(tab, '/two?a.page=3');
const pagesTwo = requests.map(q => `${q.get('t')}:${q.get('page')}`).sort().join(' ');
check('each table reads only its own parameters', pagesTwo === 'a:3 b:1', pagesTwo);

// ---------------------------------------------------------------- column resizing
await open(tab, '/list?module_id=5');
const handleBox = async (field) => tab.evaluate(f => {
  const r = document.querySelector(`th[data-field="${f}"] .col-resizer`).getBoundingClientRect();
  return {x: r.x + r.width / 2, y: r.y + r.height / 2};
}, field);
const widthOf = field => tab.evaluate(f => document.querySelector(`th[data-field="${f}"]`).offsetWidth, field);

let box = await handleBox('id');
const before = await widthOf('id');
await tab.mouse.move(box.x, box.y);
await tab.mouse.down();
await tab.mouse.move(box.x + 80, box.y, {steps: 5});
await tab.mouse.up();
await sleep(200);
const after = await widthOf('id');
// the table keeps its width, so the neighbours give way and the result is close to, not exactly, +80px
check('dragging a border with the mouse resizes the column', after - before >= 70 && after - before <= 90, `${before}px → ${after}px`);
const stored = await tab.evaluate(() => JSON.parse(localStorage.getItem('now.table.columns:/list:users') || 'null'));
check('widths are stored per field', stored && stored.id && stored.name && stored.status && !Array.isArray(stored), JSON.stringify(stored));
const sortedByDrag = await tab.evaluate(() => document.querySelector('th[data-sort="id"]').classList.contains('sort_asc') || document.querySelector('th[data-sort="id"]').classList.contains('sort_desc'));
check('the drag does not sort the column', !sortedByDrag, '');

await open(tab, '/list?module_id=5');
const restored = await tab.evaluate(() => ({w: document.querySelector('th[data-field="id"]').style.width, layout: document.querySelector('table[data-table="users"]').style.tableLayout}));
check('widths come back on the next visit', restored.w === stored.id && restored.layout === 'fixed', JSON.stringify(restored));

await tab.focus('th[data-field="name"] .col-resizer');
const nameBefore = await widthOf('name');
await tab.keyboard.press('ArrowRight');
const nameAfter = await widthOf('name');
check('arrow keys on a focused border resize the column', nameAfter - nameBefore >= 8 && nameAfter - nameBefore <= 14, `${nameBefore}px → ${nameAfter}px`);

box = await handleBox('name');
const tabT = await browser.newPage();
await tabT.emulate({viewport: {width: 1200, height: 800, hasTouch: true, isMobile: false}, userAgent: await browser.userAgent()});
await open(tabT, '/list?module_id=7');
const tbox = await tabT.evaluate(() => {
  const r = document.querySelector('th[data-field="status"] .col-resizer').getBoundingClientRect();
  return {x: r.x + r.width / 2, y: r.y + r.height / 2, w: document.querySelector('th[data-field="status"]').offsetWidth};
});
await tabT.touchscreen.touchStart(tbox.x, tbox.y);
await tabT.touchscreen.touchMove(tbox.x + 30, tbox.y);
await tabT.touchscreen.touchMove(tbox.x + 60, tbox.y);
await tabT.touchscreen.touchEnd();
await sleep(200);
const touchW = await tabT.evaluate(() => document.querySelector('th[data-field="status"]').offsetWidth);
check('a touch drag resizes the column', touchW - tbox.w >= 50, `${tbox.w}px → ${touchW}px`);
await tabT.close();

box = await handleBox('id');
await tab.mouse.click(box.x, box.y, {count: 2});
await sleep(200);
const reset = await tab.evaluate(() => ({
  w: document.querySelector('th[data-field="id"]').style.width,
  layout: document.querySelector('table[data-table="users"]').style.tableLayout,
  stored: localStorage.getItem('now.table.columns:/list:users')
}));
check('double-clicking a border returns every column to automatic width', reset.w === '' && reset.layout === '' && reset.stored === null, JSON.stringify(reset));

// widths saved by older releases (an array in table order) are converted once
await tab.evaluate(() => {
  localStorage.setItem('table_users_columns', JSON.stringify(['120px', '300px', '200px', '280px']));
});
await open(tab, '/list?module_id=5');
const migrated = await tab.evaluate(() => ({
  now: JSON.parse(localStorage.getItem('now.table.columns:/list:users') || 'null'),
  old: localStorage.getItem('table_users_columns'),
  name: document.querySelector('th[data-field="name"]').style.width
}));
check('old index-ordered widths are converted to field keys', migrated.now && migrated.now.name === '300px' && migrated.old === null && migrated.name === '300px', JSON.stringify(migrated));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
