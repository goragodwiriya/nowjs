/**
 * Proof that a page's API can choose the active menu item with `menu_path`,
 * and that a response without it leaves the menu exactly as before.
 *
 * **The case this pins down.** A detail page (`/order?id=2`) belongs to one of
 * several filtered menu links (`/orders?status=QUO`, `/orders?status=INV`).
 * Its route can only say `menuPath: '/orders'`; no link matches that exactly,
 * so the best-prefix fallback always lit the first link, whatever the record
 * was. Only the server knows which link the record belongs to.
 *
 * The sidebar loads its own data, so the menu may be rendered before or after
 * the page data arrives; both orders are checked. A response that arrives after
 * the page was left must not move the next page's menu.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node menu-path-from-api.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const shell = origin => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main"></main>
<script src="/core.js"></script>
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
        '/orders': {template: '${origin}/tpl/orders.html', title: 'list'},
        '/order': {template: '${origin}/tpl/order.html', title: 'form', menuPath: '/orders'},
        '/view': {template: '${origin}/tpl/view.html', title: 'view', menuPath: '/orders'}
      }
    }
  });
})();
</script>
</body></html>`;

// Every page carries its own sidebar that loads the menu, like the admin templates
const SIDEBAR = `
<div data-component="api" data-endpoint="/api/me">
  <nav class="sidemenu" data-component="menu" data-source="data.menus"></nav>
</div>`;

const TEMPLATES = {
  '/tpl/orders.html': `${SIDEBAR}<p id="list">list</p>`,
  '/tpl/order.html': `${SIDEBAR}
<form data-form="order" action="/api/save" method="post" data-ajax-submit="true" data-load-api="/api/order" data-load-query-params="true">
  <input type="text" name="order_no">
</form>`,
  '/tpl/view.html': `${SIDEBAR}
<div data-component="api" data-endpoint="/api/view"><span data-text="data.order_no"></span></div>`
};

const MENUS = [
  {title: 'Quotation', url: '/orders?status=QUO'},
  {title: 'Invoice', url: '/orders?status=INV'},
  {title: 'Receipt', url: '/orders?status=REC'}
];

// Per-test knobs: how long each endpoint takes, and what the order API answers
const delay = {me: 0, order: 0, view: 0};
const orders = {
  1: {id: 1, order_no: 'Q-1'},
  2: {id: 2, order_no: 'I-2', menu_path: '/orders?status=INV'},
  5: {id: 5, order_no: 'R-5', menu_path: '/orders?status=REC'}
};

const json = (res, body, ms = 0) => setTimeout(() => {
  res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
}, ms);

let origin = '';
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (TEMPLATES[url.pathname]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end(TEMPLATES[url.pathname]);
  }
  if (url.pathname === '/api/me') {
    return json(res, {success: true, data: {menus: MENUS}}, delay.me);
  }
  if (url.pathname === '/api/order') {
    // Kotchasan shape: successResponse(['data' => $order, 'options' => ...])
    const order = orders[url.searchParams.get('id')] || {id: 0};
    return json(res, {success: true, data: {data: order, options: {}}}, delay.order);
  }
  if (url.pathname === '/api/view') {
    // The other shape: successResponse($row) — the fields are the data itself
    return json(res, {success: true, data: {id: 4, order_no: 'I-4', menu_path: '/orders?status=INV'}}, delay.view);
  }
  if (!url.pathname.startsWith('/api/') && !url.pathname.includes('.')) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(shell(origin));
  }
  console.log('404:', req.url);
  res.writeHead(404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;

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

/** hrefs of the active menu links once every request has answered */
const active = async () => {
  await tab.waitForNetworkIdle({idleTime: 300});
  await sleep(100); // the menu renders in a requestAnimationFrame
  return tab.evaluate(() => [...document.querySelectorAll('.sidemenu a.active')].map(a => a.getAttribute('href')));
};
const go = path => tab.evaluate(p => RouterManager.navigate(p), path);
const same = (got, want) => JSON.stringify(got) === JSON.stringify(want);

await tab.goto(origin + '/orders?status=QUO', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

let got = await active();
check('a list link matches its own address', same(got, ['/orders?status=QUO']), JSON.stringify(got));

// 1. no menu_path: the route's menuPath decides, exactly as before
await go('/order?id=1');
got = await active();
check('no menu_path → the route menuPath decides as before (first link)', same(got, ['/orders?status=QUO']), JSON.stringify(got));

// 2. menu_path, the menu is rendered first and the page data later
delay.me = 0;
delay.order = 400;
await go('/order?id=2');
got = await active();
check('menu_path selects its link (menu first, data later)', same(got, ['/orders?status=INV']), JSON.stringify(got));

// 3. menu_path, the page data first and the menu rendered later
delay.me = 500;
delay.order = 0;
await go('/order?id=5');
got = await active();
check('menu_path survives a menu rendered after the data', same(got, ['/orders?status=REC']), JSON.stringify(got));
delay.me = 0;

// 4. data-component="api" with the fields at the top level of data
await go('/view?id=4');
got = await active();
check('an API component can send menu_path too', same(got, ['/orders?status=INV']), JSON.stringify(got));

// 5. the choice ends with the page
await go('/order?id=1');
got = await active();
const config = await tab.evaluate(() => RouterManager.state.current.menuPath);
check('the next page without menu_path falls back to the route again', same(got, ['/orders?status=QUO']) && config === '/orders',
  JSON.stringify(got) + ' menuPath=' + config);

// 6. a response that arrives after the page was left
delay.order = 700;
await go('/order?id=2');
await sleep(150);
delay.order = 0;
await go('/orders?status=REC');
await sleep(900);
got = await active();
check('a late response from the page left behind does not move the menu', same(got, ['/orders?status=REC']), JSON.stringify(got));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
