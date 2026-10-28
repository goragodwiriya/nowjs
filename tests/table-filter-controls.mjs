/**
 * Proof that the filter bar a table builds from its column headers covers what
 * a hand-written filter form was used for:
 *
 *   data-search-placeholder   the text of the search box (instead of the column names)
 *   data-type="number"        min / step / precision of the column reach the filter box
 *   data-type="tabs"          a row of tabs from filters in the response, with counts
 *   a table inside a form     Enter in a filter box filters, and does not submit that form
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const BUNDLE = '../Now/dist/now.table.min.js';
const CSS = '../Now/dist/now.core.min.css';

const requests = [];

const boot = (body, extra = '') => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
${body}
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: true, availableLocales: ['en', 'th']}});
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
  ${extra}
})();
</script>
</body></html>`;

const ordersTable = `<div class="tablebody">
<table data-table="orders" data-source="/rows" data-page-size="10" data-search-columns="order_no,customer"
       data-search-placeholder="Order number or customer">
  <thead><tr>
    <th data-field="stage" data-filter="true" data-type="tabs" data-show-all="false" data-hidden="true">Stage</th>
    <th data-field="order_no">Order</th>
    <th data-field="amount" data-filter="true" data-type="number" data-min="0" data-step="0.01" data-hidden="true">Amount</th>
  </tr></thead>
  <tbody></tbody>
</table></div>`;

const pages = {
  '/orders': boot(ordersTable),
  '/plain': boot(`<table data-table="plain" data-source="/rows" data-page-size="10" data-search-columns="order_no,customer">
    <thead><tr><th data-field="order_no">Order</th></tr></thead><tbody></tbody></table>`),
  '/static-tabs': boot(`<table data-table="local" data-page-size="0">
    <thead><tr>
      <th data-field="id">id</th>
      <th data-field="kind" data-filter="true" data-type="tabs" data-options='{"a":"Apples","b":"Bananas"}'>Kind</th>
    </tr></thead><tbody></tbody></table>`, `
    TableManager.setData('local', [{id: 1, kind: 'a'}, {id: 2, kind: 'b'}, {id: 3, kind: 'a'}]);`),
  '/in-form': boot(`<form id="save" action="/save" method="post">
    ${ordersTable}
    <button type="submit">Save</button>
  </form>`, `
    window.__submits = 0;
    document.getElementById('save').addEventListener('submit', e => { e.preventDefault(); window.__submits++; });`)
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (pages[path]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[path]);
  }
  if (path === '/core.js' || path === '/table.js' || path === '/core.css') {
    const file = {'/core.js': CORE, '/table.js': BUNDLE, '/core.css': CSS}[path];
    res.writeHead(200, {'Content-Type': path.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(file, 'utf8'));
  }
  if (path.startsWith('/language/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end('{}');
  }
  if (path === '/rows') {
    const params = new URL(req.url, 'http://x').searchParams;
    requests.push(params);
    const stage = params.get('stage') || 'all';
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({
      success: true,
      data: [{id: 1, order_no: 'SO-1', amount: 10}],
      // The server says which stage it shows (its default when none is asked for)
      meta: {total: 1, stage},
      filters: {
        stage: [
          {value: 'all', text: 'All orders'},
          {value: 'verify', text: 'Check payment', count: 3},
          {value: 'ship', text: 'To ship', count: 0}
        ]
      }
    }));
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
const open = async url => {
  await tab.goto(base + url, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(300);
};
const last = () => requests[requests.length - 1] || new URLSearchParams();
const tabsOf = tableId => tab.evaluate(tableId => [...document.querySelectorAll(`[data-table="${tableId}"]`)[0]
  .closest('.tablebody, body').querySelectorAll('.table-filter-tabs .tab-button')].map(b => ({
  value: b.dataset.value,
  text: b.firstChild.textContent.trim(),
  badge: b.querySelector('.badge-danger')?.textContent || '',
  active: b.classList.contains('active') && b.getAttribute('aria-selected') === 'true'
})), tableId);

// ------------------------------------------------------------ search placeholder
await open('/orders');
const placeholder = await tab.evaluate(() => document.getElementById('search_orders').placeholder);
check('data-search-placeholder is the text of the search box', placeholder === 'Order number or customer', placeholder);
await open('/plain');
const plainPlaceholder = await tab.evaluate(() => document.getElementById('search_plain').placeholder);
check('without it the box names the searched columns', plainPlaceholder === 'Search in: order_no, customer', plainPlaceholder);

// ------------------------------------------------------------ tabs
await open('/orders');
let tabs = await tabsOf('orders');
check('tabs come from filters in the response, in order', tabs.map(t => t.value).join(',') === 'all,verify,ship', JSON.stringify(tabs));
check('data-show-all="false": no "All items" tab of its own', !tabs.some(t => t.value === ''), JSON.stringify(tabs.map(t => t.value)));
check('a count above zero is a badge beside the text', tabs[1].text === 'Check payment' && tabs[1].badge === '3' && tabs[2].badge === '' && tabs[0].badge === '',
  JSON.stringify(tabs.map(t => [t.text, t.badge])));
check('the stage the server reports in meta is the active tab', tabs.filter(t => t.active).map(t => t.value).join() === 'all', JSON.stringify(tabs));
check('the tabs are a row of their own in the filter bar', await tab.evaluate(() => {
  const tabs = document.querySelector('.table-filter-tabs');
  return tabs.parentElement.classList.contains('table_nav') && getComputedStyle(tabs).flexBasis === '100%' && tabs.getAttribute('role') === 'tablist';
}));

const before = requests.length;
await tab.click('.table-filter-tabs .tab-button[data-value="verify"]');
await sleep(400);
tabs = await tabsOf('orders');
check('a click filters at once (one request, no debounce)', requests.length === before + 1 && last().get('stage') === 'verify', `requests ${requests.length - before} stage=${last().get('stage')}`);
check('the clicked tab is active, the others not', tabs.filter(t => t.active).map(t => t.value).join() === 'verify', JSON.stringify(tabs));
check('the tab is written to the address', await tab.evaluate(() => new URLSearchParams(location.search).get('stage')) === 'verify');
const again = requests.length;
await tab.click('.table-filter-tabs .tab-button[data-value="verify"]');
await sleep(300);
check('clicking the active tab does not reload', requests.length === again);

await tab.goto(base + '/orders?stage=ship', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(300);
tabs = await tabsOf('orders');
check('a link with ?stage= opens on that tab', last().get('stage') === 'ship' && tabs.filter(t => t.active).map(t => t.value).join() === 'ship', JSON.stringify(tabs));

await open('/static-tabs');
tabs = await tabsOf('local');
check('data-options tabs with the "All items" tab first', tabs.map(t => t.value).join(',') === ',a,b' && tabs[0].text === 'All items' && tabs[0].active, JSON.stringify(tabs));
await tab.click('.table-filter-tabs .tab-button[data-value="a"]');
await sleep(200);
const localRows = await tab.evaluate(() => [...document.querySelectorAll('[data-table="local"] tbody tr')].map(tr => tr.querySelector('td').textContent.trim()).join(','));
check('a client-side table filters its rows by the tab', localRows === '1,3', localRows);

// ------------------------------------------------------------ number filter
await open('/orders');
const amount = '#filter_amount_orders';
const typed = requests.length;
await tab.click(amount);
await tab.type(amount, '7.5');
await sleep(1400);
check('a number box filters when it is committed, not on every key', requests.length === typed, `requests ${requests.length - typed}`);
await tab.keyboard.press('Enter');
await sleep(1400);
check('step 0.01 keeps the decimal point (7.5, not 75)', last().get('amount') === '7.5', `amount=${last().get('amount')}`);
await tab.evaluate(sel => { document.querySelector(sel).value = ''; }, amount);
await tab.type(amount, '-2');
await tab.keyboard.press('Tab');
await sleep(1400);
check('min 0: a minus sign cannot be typed', last().get('amount') === '2', `amount=${last().get('amount')}`);

// ------------------------------------------------------------ inside a form
await open('/in-form');
await tab.click('#search_orders');
await tab.type('#search_orders', 'SO-1');
await tab.keyboard.press('Enter');
await sleep(1400);
const formRun = await tab.evaluate(() => ({submits: window.__submits}));
check('Enter in the search box does not submit the form around the table', formRun.submits === 0, JSON.stringify(formRun));
check('…and the search is still applied', last().get('search') === 'SO-1', `search=${last().get('search')}`);
await tab.click('button[type="submit"]');
await sleep(200);
check('the form still submits from its own button', await tab.evaluate(() => window.__submits) === 1);
const committed = requests.length;
await tab.click('#filter_amount_orders');
await tab.type('#filter_amount_orders', '12');
await tab.keyboard.press('Enter');
await sleep(1400);
check('Enter in a number box inside the form filters by it (no submit)', last().get('amount') === '12' && await tab.evaluate(() => window.__submits) === 1,
  `amount=${last().get('amount')} submits=${await tab.evaluate(() => window.__submits)}`);
await tab.keyboard.press('Tab');
await sleep(1400);
check('…once: leaving the box afterwards does not load again', requests.length === committed + 1, `requests ${requests.length - committed}`);
const tabButtonsInForm = await tab.evaluate(() => [...document.querySelectorAll('#save .table-filter-tabs button')].every(b => b.type === 'button'));
check('tab buttons inside a form are type="button"', tabButtonsInForm);

check('no JS errors or warnings during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
