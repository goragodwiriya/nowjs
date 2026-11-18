/**
 * Proof that `RouterManager.navigate(path, params)` decides "same page" on the URL it
 * would actually write — the path's own query merged with `params`.
 *
 * **The bug this pins down.** The same-path shortcut compared the current query with
 * the query spelled inside `path` only. `params` never took part, although they land
 * in the address bar exactly like `?key=value` does. So on `/verify`,
 * `navigate('/verify', {id: 'A'})` compared '' with '' and returned without doing
 * anything — a form that submitted that way did nothing on its first use — while
 * `navigate('/verify?id=A')` worked. `data-param-*` links hit the same wall.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<nav>
  <a id="link-param" href="/verify" data-param-id="L">verify L</a>
</nav>
<main id="main"></main>
<script src="/core.js"></script>
<script>
window.__renders = [];
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
        '/verify': {template: '<div class="verify">verify</div>', title: 'verify'},
        '/other': {template: '<div class="other">other</div>', title: 'other'}
      }
    }
  });
  EventManager.on('route:changed', () => window.__renders.push(location.pathname + location.search));
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
  // History-mode SPA: every route is served the same shell
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(page);
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

await tab.goto(base + '/verify', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Runs one navigation and reports what it did: the address afterwards, how many
 * renders it caused and how many history entries it added
 */
async function go(path, params, options) {
  const before = await tab.evaluate(() => ({renders: window.__renders.length, history: history.length}));
  await tab.evaluate((p, q, o) => RouterManager.navigate(p, q, o), path, params, options);
  await sleep(300);
  const after = await tab.evaluate(() => ({
    url: location.pathname + location.search + location.hash,
    renders: window.__renders.length,
    history: history.length,
  }));

  return {url: after.url, rendered: after.renders - before.renders, pushed: after.history - before.history};
}

// 1. The reported case: params only, while on the bare path
let r = await go('/verify', {id: 'A'});
check('params alone on the same path navigate', r.url === '/verify?id=A' && r.rendered === 1, JSON.stringify(r));

// 2. The same URL again, spelled either way, is still a no-op
r = await go('/verify', {id: 'A'});
check('the same params again do nothing', r.url === '/verify?id=A' && r.rendered === 0 && r.pushed === 0, JSON.stringify(r));
r = await go('/verify?id=A');
check('the same query written into the path does nothing either', r.rendered === 0 && r.pushed === 0, JSON.stringify(r));

// 3. Different params navigate
r = await go('/verify', {id: 'B'});
check('different params navigate', r.url === '/verify?id=B' && r.rendered === 1, JSON.stringify(r));

// 4. Dropping the query still navigates, and a bare path on a bare page does not
r = await go('/verify', {});
check('no params from a page with a query navigates to the bare path', r.url === '/verify' && r.rendered === 1, JSON.stringify(r));
r = await go('/verify');
check('the bare path on the bare page does nothing', r.rendered === 0 && r.pushed === 0, JSON.stringify(r));

// 5. The path's query and params are merged, and key order does not matter
r = await go('/verify?x=1', {id: 'C'});
check('path query and params are merged', r.url === '/verify?x=1&id=C' && r.rendered === 1, JSON.stringify(r));
r = await go('/verify', {id: 'C', x: '1'});
check('the same merged query in another order does nothing', r.rendered === 0 && r.pushed === 0, JSON.stringify(r));

// 6. A hash change on an unchanged URL still only moves the hash
r = await go('/verify#tab2', {x: '1', id: 'C'});
check('a hash change on the same URL updates the hash without rendering', r.url === '/verify?x=1&id=C#tab2' && r.rendered === 0 && r.pushed === 1, JSON.stringify(r));

// 7. force still re-renders an unchanged URL
r = await go('/verify', {x: '1', id: 'C'}, {force: true});
check('force still renders the same URL', r.rendered === 1, JSON.stringify(r));

// 8. Another path is unaffected
r = await go('/other', {id: 'Z'});
check('another path navigates with its params', r.url === '/other?id=Z' && r.rendered === 1, JSON.stringify(r));

// 9. A data-param link to the page you are on (the click handler passes params separately)
await go('/verify');
const before = await tab.evaluate(() => window.__renders.length);
await tab.click('#link-param');
await sleep(300);
const link = await tab.evaluate(() => ({url: location.pathname + location.search, renders: window.__renders.length}));
check('a data-param-* link to the current path navigates', link.url === '/verify?id=L' && link.renders - before === 1, JSON.stringify(link));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
