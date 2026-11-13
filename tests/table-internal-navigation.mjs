/**
 * Proof of when the remember settings of a table apply and when they do not.
 *
 * A click in a menu, or an address opened in the browser (or a link that names
 * the table's parameters), is a new visit: the remember settings decide how the
 * table starts. Everything else the user does inside the app — saving a form,
 * a row action, a redirect, a plain link, back and forward, a reload — brings
 * back every choice: filters with or without data-remember, the search, the
 * page, the page size and the sort.
 *
 * **The bug this pins down.** The list of articles: search, edit a row, save.
 * The save answers redirect "back", which is history.back(). Back counted as a
 * new visit and the search is not in the address, so the search box came back
 * empty.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 *
 *   cd tests && node table-internal-navigation.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const TABLE = '../Now/dist/now.table.min.js';
const SEARCH = 'แจกฟรี';

const shell = origin => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<nav class="sidemenu"><ul><li><a id="menu" href="/articles?module_id=5">Articles</a></li><li><a id="menu-plain" href="/plain">Plain</a></li></ul></nav>
<nav data-component="menu"><ul><li><a id="menu-component" href="/articles?module_id=5">Articles</a></li></ul></nav>
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
        '/articles': {template: '${origin}/tpl/articles.html', title: 'list'},
        '/article': {template: '${origin}/tpl/article.html', title: 'form'},
        '/plain': {template: '${origin}/tpl/plain.html', title: 'plain'}
      }
    }
  });
  await TableManager.init();
})();
</script>
</body></html>`;

// Built like the list of articles in gcms.in.th: filters on the header with
// their options from the API, a search box, a page size and a default sort.
// Only the year is remembered between visits.
const LIST_TPL = `
<a id="to-form" href="/article?id=1" data-params="module_id">Add</a>
<table data-table="articles" data-source="/api/articles" data-search-columns="topic" data-page-size="10" data-default-sort="id desc"
       data-action-params="module_id" data-action-url="/api/action" data-row-actions='{"edit": {"label": "Edit","className": "btn"}}'>
  <thead><tr>
    <th data-field="id" data-sort="id">ID</th>
    <th data-field="topic" data-sort="topic">Topic</th>
    <th data-field="category_id" data-filter="true" data-filter-key="category_id" data-type="select" data-show-all="true" data-all-value="0">Category</th>
    <th data-field="published" data-filter="true" data-type="select" data-show-all="true" data-all-value="" data-options='{"0":"No","1":"Yes"}'>Published</th>
    <th data-field="year" data-filter="true" data-type="select" data-show-all="true" data-all-value="" data-remember="true" data-options='{"2025":"2025","2026":"2026"}'>Year</th>
  </tr></thead>
  <tbody></tbody>
</table>`;

const FORM_TPL = `
<form data-form="article" action="/api/save" method="post" data-ajax-submit="true">
  <input type="text" name="topic" value="x">
  <button type="submit" id="save">Save</button>
</form>
<form data-form="articlelist" action="/api/save-list" method="post" data-ajax-submit="true">
  <input type="text" name="topic" value="x">
  <button type="submit" id="save-list">Save, then the list</button>
</form>
<a id="to-list" href="/articles?module_id=5">Back to the list</a>
<a id="to-pending" href="/articles?module_id=5&published=0">Unpublished</a>`;

const PLAIN_TPL = `
<table data-table="plain" data-source="/api/articles" data-page-size="10" data-search-columns="topic" data-remember-state="false"
       data-action-url="/api/action" data-row-actions='{"edit": {"label": "Edit","className": "btn"}}'>
  <thead><tr>
    <th data-field="id" data-sort="id">ID</th>
    <th data-field="topic">Topic</th>
  </tr></thead>
  <tbody></tbody>
</table>`;

const ROWS = Array.from({length: 90}, (_, i) => ({
  id: i + 1,
  module_id: 5,
  topic: `${i % 2 ? SEARCH : 'อื่น ๆ'} ${String(i + 1).padStart(2, '0')}`,
  category_id: (i % 3) + 1,
  published: i % 2,
  year: 2025 + (i % 2)
}));
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
  if (url.pathname.startsWith('/tpl/')) {
    const body = {'/tpl/articles.html': LIST_TPL, '/tpl/article.html': FORM_TPL, '/tpl/plain.html': PLAIN_TPL}[url.pathname];
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end(body);
  }
  if (url.pathname === '/api/articles') {
    requests.push(url.searchParams);
    const q = url.searchParams;
    let rows = ROWS.slice();
    if (q.get('search')) rows = rows.filter(r => r.topic.includes(q.get('search')));
    if (q.get('category_id') && q.get('category_id') !== '0') rows = rows.filter(r => String(r.category_id) === q.get('category_id'));
    if (q.get('published')) rows = rows.filter(r => String(r.published) === q.get('published'));
    if (q.get('year')) rows = rows.filter(r => String(r.year) === q.get('year'));
    const pageSize = parseInt(q.get('pageSize') || '10', 10);
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(parseInt(q.get('page') || '1', 10), totalPages);
    return json(res, {
      data: rows.slice((page - 1) * pageSize, page * pageSize),
      filters: {category_id: [{value: '1', text: 'One'}, {value: '2', text: 'Two'}, {value: '3', text: 'Three'}]},
      meta: {page, pageSize, total, totalPages}
    });
  }
  if (url.pathname === '/api/action') {
    return json(res, {success: true, data: {actions: [{type: 'redirect', url: '/article?id=1&module_id=5', delay: 0}]}});
  }
  if (url.pathname === '/api/save') {
    return json(res, {success: true, message: 'Saved', data: {actions: [{type: 'redirect', url: 'back', delay: 0}]}});
  }
  if (url.pathname === '/api/save-list') {
    return json(res, {success: true, message: 'Saved', data: {actions: [{type: 'redirect', url: '/articles?module_id=5', delay: 0}]}});
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
const click = selector => tab.evaluate(sel => document.querySelector(sel).click(), selector);

const open = async (path) => {
  requests = [];
  await tab.goto(base + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(500);
};
const reload = async () => {
  requests = [];
  await tab.reload({waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(800);
};
/** Runs a step that lands on a page, and waits until it has settled. */
const step = async (how, wait = 1000) => {
  requests = [];
  await how();
  await sleep(wait);
};
const setFilter = async (name, value) => {
  await tab.evaluate((n, v) => {
    const el = document.querySelector(`#filter_${n}_articles`);
    el.value = v;
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }, name, value);
  await sleep(1300); // filter changes are debounced (1s)
};
const typeSearch = async (text, id = 'articles') => {
  await tab.evaluate((value, tableId) => {
    const el = document.querySelector(`#search_${tableId}`);
    el.value = value;
    el.dispatchEvent(new Event('input', {bubbles: true}));
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }, text, id);
  await sleep(1300);
};
const goPage = page => tab.evaluate(p => [...document.querySelectorAll('.pagination-button')].find(b => b.textContent.trim() === p).click(), String(page));
const openEditor = async () => {
  await click('table[data-table] .row-actions-cell button');
  await sleep(1000);
};
const ui = () => tab.evaluate(() => ({
  search: document.querySelector('#search_articles')?.value,
  category: document.querySelector('#filter_category_id_articles')?.value,
  published: document.querySelector('#filter_published_articles')?.value,
  year: document.querySelector('#filter_year_articles')?.value,
  pageSize: document.querySelector('#pageSize_articles')?.value,
  sorted: document.querySelector('th[data-sort="topic"]')?.classList.contains('sort_asc')
}));

/** Everything the user chose on the list: a search, three filters, a sort, a page size and a page. */
const choose = async () => {
  await typeSearch(SEARCH);
  await setFilter('category_id', '2');
  await setFilter('published', '1');
  await setFilter('year', '2026');
  await tab.evaluate(() => {
    const el = document.querySelector('#pageSize_articles');
    el.value = '25';
    el.dispatchEvent(new Event('change', {bubbles: true}));
  });
  await sleep(1300);
  // A click moves the sort along asc, desc, none
  for (let i = 0; i < 3 && !(await tab.evaluate(() => document.querySelector('th[data-sort="topic"]').classList.contains('sort_asc'))); i++) {
    await click('th[data-sort="topic"]');
    await sleep(600);
  }
};
const chose = q => q.get('search') === SEARCH && q.get('category_id') === '2' && q.get('published') === '1' && q.get('year') === '2026'
  && q.get('pageSize') === '25' && q.get('sort') === 'topic asc';
const shows = u => u.search === SEARCH && u.category === '2' && u.published === '1' && u.year === '2026' && u.pageSize === '25' && u.sorted === true;

async function allBack(label) {
  const q = last();
  const u = await ui();
  check(`${label}: every choice reaches the API`, chose(q), q.toString());
  check(`${label}: every control shows its choice`, shows(u), JSON.stringify(u));
}

/** What a new visit starts with: only what the remember settings keep. */
async function startsOver(label) {
  const q = last();
  const u = await ui();
  check(`${label}: no search and no filter without data-remember`,
    !q.get('search') && (!q.get('category_id') || q.get('category_id') === '0') && !q.get('published')
    && u.search === '' && (u.category === '' || u.category === '0') && u.published === '', `${q.toString()} ${JSON.stringify(u)}`);
  check(`${label}: page size, sort and the filter with data-remember stay`,
    q.get('pageSize') === '25' && q.get('sort') === 'topic asc' && q.get('year') === '2026' && u.year === '2026', q.toString());
}

// ---------------------------------------------------------------- from the menu
await open('/articles?module_id=5');
check('an address opened in the browser starts from the defaults',
  last().get('pageSize') === '10' && !last().get('search') && last().get('sort') === 'id desc', last().toString());
await choose();
check('the choices reach the API', chose(last()), last().toString());

// ---------------------------------------------------------------- the reported case
await openEditor();
await step(() => click('#save'), 1500);
await allBack('search → edit → save (redirect back)');

// ---------------------------------------------------------------- every internal way back
await openEditor();
await step(() => tab.goBack(), 1500);
await allBack('the back button');

await step(() => tab.goForward(), 1000);
await step(() => tab.goBack(), 1500);
await allBack('forward to the form, then back');

await openEditor();
await step(() => click('#save-list'), 1500);
await allBack('a save that redirects to the path of the list');

await openEditor();
await step(() => click('#to-list'), 1500);
await allBack('a plain link to the list');

await openEditor();
await reload();
await step(() => click('#save'), 2500);
await allBack('a reloaded form, then save (back loads the document again)');

await reload();
await allBack('a reload of the list');

// A page of the results survives as well
await tab.evaluate(() => {
  const el = document.querySelector('#pageSize_articles');
  el.value = '10';
  el.dispatchEvent(new Event('change', {bubbles: true}));
});
await sleep(1300);
await goPage(2);
await sleep(600);
const page = last().get('page');
await openEditor();
await step(() => click('#save'), 1500);
check('the page of a search comes back', page === '2' && last().get('page') === '2', last().toString());

// ---------------------------------------------------------------- a new visit
await choose();
await openEditor();
await step(() => click('#menu'), 1500);
await startsOver('a menu click from the form');

// The page is kept inside the app, and a new visit starts on page one
const toPage2 = async () => {
  await goPage(2);
  await sleep(600);
  return last().get('page');
};
const page1 = () => !last().get('page') || last().get('page') === '1';
const onPage2 = await toPage2();
await openEditor();
await step(() => click('#save'), 1500);
check('without a search, the page comes back after a save', onPage2 === '2' && last().get('page') === '2', last().toString());
await openEditor();
await step(() => click('#menu'), 1500);
check('a menu click from the form starts on page one', page1(), last().toString());
await toPage2();
await step(() => click('#menu-component'), 1500);
check('a menu click on the list itself starts on page one', page1(), last().toString());
await toPage2();
await open('/articles?module_id=5');
check('an address opened in the same tab starts on page one', page1(), last().toString());
await open('/articles?module_id=5&page=2');
check('an address that names a page still opens on it', last().get('page') === '2', last().toString());

await choose();
await step(() => click('#menu-component'), 1500);
await startsOver('a menu click on the list itself (data-component="menu")');

// That visit goes on as any other: built again, or back from the form, it keeps
// what was chosen since the click
await typeSearch(SEARCH);
await openEditor();
await step(() => click('#save'), 1500);
const afterMenu = await ui();
check('choices made after a menu click are kept like any other', last().get('search') === SEARCH && afterMenu.search === SEARCH, last().toString());

await choose();
await open('/articles?module_id=5');
await startsOver('an address opened in the browser');

await choose();
await openEditor();
await step(() => click('#to-pending'), 1500);
const linked = await ui();
check('a link that names table parameters shows what it names, without the old search',
  last().get('published') === '0' && !last().get('search') && (!last().get('category_id') || last().get('category_id') === '0') && linked.search === '' && linked.published === '0',
  `${last().toString()} ${JSON.stringify(linked)}`);

// ---------------------------------------------------------------- built again on the same visit
await step(() => click('#menu'), 1500);
await typeSearch(SEARCH);
await setFilter('category_id', '3');
await step(async () => {
  await tab.evaluate(() => {
    const old = document.querySelector('table[data-table="articles"]');
    const copy = old.cloneNode(false);
    copy.innerHTML = '<thead>' + [...old.querySelectorAll('thead tr')].map(tr => tr.outerHTML).join('') + '</thead><tbody></tbody>';
    copy.removeAttribute('data-table-initialized');
    copy.classList.remove('table-initialized');
    old.replaceWith(copy);
    TableManager.initTable(copy);
  });
}, 1200);
check('a table built again right after a menu click keeps the search and filters',
  last().get('search') === SEARCH && last().get('category_id') === '3', last().toString());

// ---------------------------------------------------------------- another list
await open('/articles?module_id=6');
check('another module_id is another list', !last().get('search') && last().get('pageSize') === '10', last().toString());

// ---------------------------------------------------------------- data-remember-state="false"
await open('/plain');
await typeSearch(SEARCH, 'plain');
await tab.evaluate(() => {
  const el = document.querySelector('#pageSize_plain');
  el.value = '25';
  el.dispatchEvent(new Event('change', {bubbles: true}));
});
await sleep(1300);
await openEditor();
await step(() => tab.goBack(), 1500);
const plainBack = await tab.evaluate(() => document.querySelector('#search_plain').value);
check('without remembered state, the back button still keeps every choice',
  last().get('search') === SEARCH && last().get('pageSize') === '25' && plainBack === SEARCH, `${last().toString()} box="${plainBack}"`);
await step(() => click('#menu'), 1000);
await step(() => click('#menu-plain'), 1500);
check('without remembered state, a menu click starts from the defaults',
  !last().get('search') && last().get('pageSize') === '10', last().toString());

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
