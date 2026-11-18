/**
 * PageNavigator: internal links load server-rendered pages into #main without a reload.
 *
 * The server answers a request carrying `X-Partial-Page: 1` with JSON (content, title,
 * head, styles) and echoes the header; any other answer, a `reload` flag or a leave
 * guard saying no must turn into a normal page load, so a link never does nothing.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const CORE_CSS = '../Now/dist/now.core.min.css';
const log = [];
let extLoads = 0;

const head = name => `<meta name="description" content="desc ${name}" data-page-meta>`
  + `<link rel="canonical" href="/page/${name}" data-page-meta>`;

const content = name => `<h1 id="title">${name}</h1>
<p>
  <a id="to-a" href="/page/a">A</a> <a id="to-b" href="/page/b">B</a> <a id="to-c" href="/page/c">C</a>
  <a id="to-full" href="/full">full</a> <a id="to-reload" href="/reload">reload</a>
  <a id="to-redirect" href="/redirect">redirect</a> <a id="to-off" href="/page/a" data-navigate="false">off</a>
  <a id="to-hash" href="#section">hash</a> <a id="to-blank" href="/page/a" target="_blank">blank</a>
  <a id="to-slow" href="/page/slow">slow</a> <a id="to-download" href="/download">download</a>
</p>
<form id="search" method="get" action="/page/s"><input name="q" value="hello world"><button id="search-go">go</button></form>
<form id="post" method="post" action="/page/p"><button id="post-go">post</button></form>
<div style="height:3000px"></div>
<div id="section">section</div>
<script>
  window.__inline = (window.__inline || 0) + 1;
  document.addEventListener('DOMContentLoaded', () => { window.__dcl = (window.__dcl || []).concat('${name}'); });
</script>
<script src="/ext.js"></script>`;

const fullPage = name => `<!doctype html>
<html><head><meta charset="utf-8"><title>T ${name}</title>${head(name)}<link rel="stylesheet" href="/core.css"></head><body>
<header style="height:90px;background:rgb(37, 99, 235)">header</header>
<main id="main">${content(name)}</main>
<script src="/core.js"></script>
<script>
window.__marker = 'doc-' + Math.random();
window.__events = [];
window.__init = (async () => {
  await Now.init({
    environment: 'production',
    allowEval: false,
    auth: {enabled: false},
    i18n: {enabled: false},
    router: {enabled: false},
    navigator: {enabled: true},
    // ScrollManager scrolls to #main on route:changed unless told not to (scroll: false)
    scroll: {enabled: true, selectors: {content: '#main'}}
  });
  EventManager.on('route:changed', e => __events.push('route:' + e.data.path));
  EventManager.on('page:loaded', e => __events.push('loaded:' + e.data.data.menu));
  document.addEventListener('page:loaded', e => __events.push('dom:' + e.detail.data.menu));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const partial = req.headers['x-partial-page'] === '1';
  const send = (status, type, body, headers = {}) => {
    res.writeHead(status, {'Content-Type': type, 'Cache-Control': 'no-store', ...headers});
    res.end(body);
  };

  if (url.pathname === '/core.js') {
    return send(200, 'application/javascript; charset=utf-8', readFileSync(CORE, 'utf8'));
  }
  if (url.pathname === '/core.css') {
    return send(200, 'text/css; charset=utf-8', readFileSync(CORE_CSS, 'utf8'));
  }
  if (url.pathname === '/favicon.ico') {
    return send(204, 'text/plain', '');
  }
  if (url.pathname === '/ext.js') {
    extLoads++;
    return send(200, 'application/javascript', 'window.__ext = (window.__ext || 0) + 1;');
  }
  if (url.pathname === '/c.css') {
    return send(200, 'text/css', '#title{color:rgb(1, 2, 3)}');
  }

  log.push(`${partial ? 'P' : 'F'} ${url.pathname}${url.search}`);
  if (url.pathname === '/redirect') {
    return send(302, 'text/plain', '', {Location: '/page/c'});
  }
  if (url.pathname === '/full') {
    // A page that cannot answer partially: plain HTML whatever was asked
    return send(200, 'text/html; charset=utf-8', fullPage('full'));
  }
  if (url.pathname === '/download') {
    // A file: never a page, whatever was asked
    return send(200, 'application/octet-stream', 'x'.repeat(2048), {'Content-Disposition': 'attachment; filename="a.bin"'});
  }
  if (url.pathname === '/reload' && partial) {
    return send(200, 'application/json', JSON.stringify({reload: true}), {'X-Partial-Page': '1'});
  }
  const name = (url.pathname.match(/^\/page\/(\w+)$/) || [null, url.pathname.slice(1) || 'a'])[1];
  if (partial && name === 'slow') {
    // Slow enough to watch the progress bar wait at its first step
    return setTimeout(() => send(200, 'application/json', JSON.stringify({title: 'T slow', content: content('slow'), menu: 'slow'}),
      {'X-Partial-Page': '1'}), 1500);
  }
  if (partial) {
    return send(200, 'application/json', JSON.stringify({
      title: `T ${name}`,
      content: content(name),
      head: head(name),
      styles: name === 'c' ? ['/c.css'] : [],
      menu: name
    }), {'X-Partial-Page': '1', Vary: 'X-Partial-Page'});
  }
  send(200, 'text/html; charset=utf-8', fullPage(name));
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
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${pass || !detail ? '' : '  — ' + detail}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const view = () => tab.evaluate(() => ({
  url: location.pathname + location.search + location.hash,
  title: document.title,
  h1: document.querySelector('#title')?.textContent,
  marker: window.__marker,
  desc: document.querySelector('meta[name="description"]')?.content,
  pageMeta: document.head.querySelectorAll('[data-page-meta]').length,
  inline: window.__inline,
  dcl: (window.__dcl || []).join(),
  ext: window.__ext,
  events: (window.__events || []).join(),
  cssLinks: document.querySelectorAll('link[rel="stylesheet"][href$="/c.css"]').length,
  color: getComputedStyle(document.querySelector('#title')).color,
  scrollY: Math.round(window.scrollY),
}));
const click = id => tab.evaluate(sel => document.querySelector(sel).click(), id);
const clickAndReload = async id => {
  await Promise.all([tab.waitForNavigation({waitUntil: 'networkidle0'}), click(id)]);
  await tab.evaluate(() => window.__init);
};

await tab.goto(base + '/page/a', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__init);
const first = await view();

// 1. A plain internal link swaps #main and pushes the URL; the document stays
log.length = 0;
await tab.evaluate(() => { window.__events = []; });
await click('#to-b');
await sleep(400);
let v = await view();
check('internal link loads the page partially, without a reload',
  v.marker === first.marker && v.url === '/page/b' && v.h1 === 'b' && log.join() === 'P /page/b', JSON.stringify({v, log}));
check('title and the data-page-meta head tags are replaced',
  v.title === 'T b' && v.desc === 'desc b' && v.pageMeta === 2, JSON.stringify(v));
check('inline script of the new content runs, and its DOMContentLoaded listener is called',
  v.inline === 2 && v.dcl === 'a,b', JSON.stringify(v));
check('an external script already on the page is not loaded again', v.ext === 1 && extLoads === 1, `ext=${v.ext} loads=${extLoads}`);
check('route:changed and page:loaded (EventManager and DOM) are emitted',
  v.events === 'route:/page/b,loaded:b,dom:b', v.events);

// 2. Stylesheets a page needs are added once
await click('#to-c');
await sleep(400);
await click('#to-a');
await sleep(400);
await click('#to-c');
await sleep(400);
v = await view();
check('a stylesheet from `styles` is added once and applies', v.cssLinks === 1 && v.color === 'rgb(1, 2, 3)', JSON.stringify(v));

// 3. Back restores the previous page and where the reader was on it
await click('#to-b');
await sleep(400);
await tab.evaluate(() => window.scrollTo(0, 1500));
await sleep(100);
await click('#to-a');
await sleep(400);
v = await view();
check('a new page starts at the top', v.scrollY === 0 && v.h1 === 'a', JSON.stringify(v));
log.length = 0;
await tab.evaluate(() => history.back());
await sleep(500);
v = await view();
check('Back loads the previous page and restores its scroll position',
  v.url === '/page/b' && v.h1 === 'b' && v.scrollY === 1500 && log.join() === 'P /page/b', JSON.stringify({v, log}));
await tab.evaluate(() => history.forward());
await sleep(500);
v = await view();
check('Forward loads the next page again', v.url === '/page/a' && v.h1 === 'a', JSON.stringify(v));

// 4. In-page anchors stay with the browser, both ways
log.length = 0;
await click('#to-hash');
await sleep(300);
await tab.evaluate(() => history.back());
await sleep(300);
v = await view();
check('a #fragment link and Back from it do not fetch', log.length === 0 && v.url === '/page/a' && v.h1 === 'a', JSON.stringify({v, log}));

// 5. A redirect the server followed shows its final address
log.length = 0;
await click('#to-redirect');
await sleep(500);
v = await view();
check('a redirected request shows the final address', v.url === '/page/c' && v.h1 === 'c' && v.marker === first.marker, JSON.stringify({v, log}));

// 6. Links that must load normally
const navigable = await tab.evaluate(() => [
  PageNavigator.isNavigable('/page/a'),
  PageNavigator.isNavigable('/index.php?module=x'),
  PageNavigator.isNavigable('/files/report.pdf'),
  PageNavigator.isNavigable('https://example.com/page/a'),
  PageNavigator.isNavigable('mailto:a@b.c'),
]);
check('pages are navigable; files, other origins and mailto are not',
  JSON.stringify(navigable) === '[true,true,false,false,false]', JSON.stringify(navigable));
log.length = 0;
await tab.evaluate(() => {
  window.__blank = null;
  document.addEventListener('click', e => { window.__blank = e.defaultPrevented; e.preventDefault(); }, {once: true});
});
await click('#to-blank');
await sleep(200);
check('a target="_blank" link is left to the browser', log.length === 0 && (await tab.evaluate(() => window.__blank)) === false, JSON.stringify(log));

// 7. Progress bar: runs to 80% and waits, fills and fades once the page is in
const bar = () => tab.evaluate(() => {
  const el = document.querySelector('.page-progress');
  const m = el ? getComputedStyle(el).transform.match(/matrix\(([^,]+)/) : null;
  return el ? {cls: el.className, scale: m ? +(+m[1]).toFixed(2) : 0, loading: document.body.classList.contains('loading'), color: getComputedStyle(el).backgroundColor} : null;
});
await click('#to-slow');
await sleep(800);
let b = await bar();
check('while loading the bar waits at 80%', b?.cls === 'page-progress is-loading' && b.scale === 0.8 && b.loading, JSON.stringify(b));
check('over a header in its own colour (primary) the bar turns white', b?.color === 'rgb(255, 255, 255)', JSON.stringify(b));
await sleep(1300);
b = await bar();
v = await view();
check('once the page is in the bar fills to 100%, fades and resets', v.h1 === 'slow' && b?.cls === 'page-progress' && b.scale === 0 && !b.loading, JSON.stringify(b));

// 8. GET forms load like links; POST forms are left alone
log.length = 0;
await tab.evaluate(() => document.querySelector('#search-go').click());
await sleep(500);
v = await view();
check('a GET form loads its result partially', v.url === '/page/s?q=hello+world' && v.h1 === 's' && v.marker === first.marker
  && log.join() === 'P /page/s?q=hello+world', JSON.stringify({v, log}));

// 9. A link that turns out to be a download: normal load, and nothing stays "loading"
log.length = 0;
await click('#to-download');
await sleep(3500);
b = await bar();
v = await view();
check('a download link ends its loading state and the page stays', v.marker === first.marker && !b.loading && b.cls === 'page-progress'
  && log.join() === 'P /download,F /download', JSON.stringify({b, log}));

// 10. View transition (opt-in) swaps the page the same way
await tab.evaluate(() => { PageNavigator.config.transition = true; });
await click('#to-b');
await sleep(800);
v = await view();
await tab.evaluate(() => { PageNavigator.config.transition = false; });
check('with transition: true the page is swapped inside a view transition', v.h1 === 'b' && v.url === '/page/b' && v.marker === first.marker, JSON.stringify(v));

log.length = 0;
await Promise.all([tab.waitForNavigation({waitUntil: 'networkidle0'}), tab.evaluate(() => document.querySelector('#post-go').click())]);
await tab.evaluate(() => window.__init);
check('a POST form is a normal submission', log.join() === 'F /page/p', JSON.stringify(log));

// 11. Fallbacks to a normal load
log.length = 0;
await clickAndReload('#to-off');
v = await view();
check('data-navigate="false" loads normally', v.url === '/page/a' && log.join() === 'F /page/a', JSON.stringify(log));

log.length = 0;
await clickAndReload('#to-full');
v = await view();
check('an answer without the partial-page header becomes a normal load',
  v.url === '/full' && v.h1 === 'full' && log.join() === 'P /full,F /full', JSON.stringify(log));

log.length = 0;
await clickAndReload('#to-reload');
v = await view();
check('reload: true becomes a normal load', v.url === '/reload' && log.join() === 'P /reload,F /reload', JSON.stringify(log));

log.length = 0;
await tab.evaluate(() => { window.__leave = []; PageNavigator.beforeLeave(url => { window.__leave.push(url); return false; }); });
const marker = (await view()).marker;
await clickAndReload('#to-b');
v = await view();
check('a leave guard returning false makes it a normal load',
  v.url === '/page/b' && v.marker !== marker && log.join() === 'F /page/b', JSON.stringify(log));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
