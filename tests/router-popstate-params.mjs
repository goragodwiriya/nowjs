/**
 * Proof that browser Back resolves route params from the path, not from history.state.
 *
 * **The bug this pins down.** `handlePopState` passed `event.state.params` to
 * `processRoute`, which used them as the route params. TableManager (paging, sorting)
 * and FormManager (submitQueryParams) rewrite the address with
 * `replaceState({}, …)`, wiping those params. Going Back to such an entry of a
 * parameterised route (`/widgets/:module` with template `widgets/:module/:module.html`)
 * left `:module` unresolved and fetched `widgets/:module/:module.html` — a page that
 * does not exist. Routes without params (e.g. `/mailtemplates`) were unaffected, and
 * the first table page worked because nothing had called replaceState yet.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const fetched = [];

const page = origin => `<!doctype html>
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
    router: {
      enabled: true,
      base: '/',
      mode: 'history',
      auth: {enabled: false},
      routes: {
        '/widgets/:module': {template: '${origin}/tpl/:module/:module.html', title: 'list'},
        '/widgets/:module/:page': {template: '${origin}/tpl/:module/:page.html', title: 'form'}
      }
    }
  });
})();
</script>
</body></html>`;

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
  if (url.pathname.startsWith('/tpl/')) {
    const file = decodeURIComponent(url.pathname);
    fetched.push(file);
    if (file.includes(':')) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
    return res.end(`<div class="tpl">${file}</div>`);
  }
  // History-mode SPA: every route is served the same shell
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(page(`http://${req.headers.host}`));
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

await tab.goto(base + '/widgets/textlinks', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const view = () => tab.evaluate(() => ({
  url: location.pathname + location.search,
  tpl: document.querySelector('.tpl')?.textContent || null,
}));

/**
 * List page → (table paging rewrites the URL and wipes history.state) → form → Back
 */
async function backFromForm(wipe) {
  fetched.length = 0;
  await tab.evaluate(() => RouterManager.navigate('/widgets/textlinks', {}));
  await sleep(300);
  // What TableManager.updateUrlParams did before the fix
  await tab.evaluate(w => history.replaceState(w ? {} : history.state, '', '/widgets/textlinks?pageSize=25&page=2&sort=link_order+asc'), wipe);
  await tab.evaluate(() => RouterManager.navigate('/widgets/textlinks/write', {id: '3'}));
  await sleep(300);
  await tab.evaluate(() => history.back());
  await sleep(500);
  return {...(await view()), fetched: [...fetched]};
}

// 1. The reported case: history.state wiped by replaceState({})
let r = await backFromForm(true);
check('Back to a list whose history.state was wiped resolves :module from the path',
  r.url === '/widgets/textlinks?pageSize=25&page=2&sort=link_order+asc' && r.tpl === '/tpl/textlinks/textlinks.html'
  && !r.fetched.some(f => f.includes(':')), JSON.stringify(r));

// 2. history.state intact still works
r = await backFromForm(false);
check('Back to a list with intact history.state still works',
  r.tpl === '/tpl/textlinks/textlinks.html' && !r.fetched.some(f => f.includes(':')), JSON.stringify(r));

// 3. Forward to the two-param route, its history.state wiped too, resolves both params from the path
await tab.evaluate(() => history.forward());
await sleep(500);
await tab.evaluate(() => history.replaceState({}, '', location.pathname + location.search));
await tab.evaluate(() => history.back());
await sleep(500);
fetched.length = 0;
await tab.evaluate(() => history.forward());
await sleep(500);
r = {...(await view()), fetched: [...fetched]};
check('Forward to /widgets/:module/:page resolves both params',
  r.tpl === '/tpl/textlinks/write.html' && !r.fetched.some(f => f.includes(':')), JSON.stringify(r));

// 4. The route:changed payload carries the params from the path
fetched.length = 0;
const payload = await tab.evaluate(async () => {
  let got = null;
  const off = EventManager.on('route:changed', e => { got = e.data.params; });
  history.back();
  await new Promise(r => setTimeout(r, 500));
  if (typeof off === 'function') off();
  return got;
});
check('route:changed after Back reports params from the path', payload?.module === 'textlinks', JSON.stringify(payload));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
