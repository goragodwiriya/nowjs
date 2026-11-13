/**
 * PageNavigator + AppConfigManager: the site config binds the page PageNavigator swaps in.
 *
 * AppConfigManager binds the config it loads (site title, social login client ids, ...)
 * to the whole document once. A page PageNavigator puts into #main must get the same
 * pass, or a login page reached by a link has no client id on its social buttons and
 * its title stays empty until a reload. Markup outside #main is not bound again, and the
 * swapped page is bound exactly as a full load binds it.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
let configLoads = 0;

const content = name => `<h1 id="title" data-text="data.web_title">-</h1>
<p id="name">${name}</p>
<div id="google" data-attr="data-username:data.google_client_id" data-social-provider="google"></div>
<p id="register" data-if="data.user_register === 1">register</p>
<p id="closed" data-if="data.user_register === 0">closed</p>
<form id="own" data-load-api="/never"><span id="own-title" data-text="data.web_title">own</span></form>
<a id="to-login" href="/page/login">login</a> <a id="to-home" href="/page/home">home</a>`;

const fullPage = name => `<!doctype html>
<html><head><meta charset="utf-8"><title>T ${name}</title></head><body>
<header><span id="header-title" data-text="data.web_title">-</span></header>
<main id="main">${content(name)}</main>
<script src="/core.js"></script>
<script>
window.__marker = 'doc-' + Math.random();
window.__init = (async () => {
  await Now.init({
    environment: 'production',
    allowEval: false,
    auth: {enabled: false},
    i18n: {enabled: false},
    router: {enabled: false},
    navigator: {enabled: true},
    config: {enabled: true, defaultTheme: 'light', storageKey: 't', api: {enabled: true, configUrl: '/config', cacheResponse: true}}
  });
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
  if (url.pathname === '/favicon.ico') {
    return send(204, 'text/plain', '');
  }
  if (url.pathname === '/config') {
    configLoads++;
    return send(200, 'application/json', JSON.stringify({
      success: true,
      data: {variables: {}, web_title: 'My Site', google_client_id: 'abc123', user_register: 1}
    }));
  }
  const name = (url.pathname.match(/^\/page\/(\w+)$/) || [null, 'home'])[1];
  if (partial) {
    return send(200, 'application/json', JSON.stringify({title: `T ${name}`, content: content(name)}),
      {'X-Partial-Page': '1'});
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
const check = (label, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `  -> ${detail}`}`);
};
const state = () => tab.evaluate(() => ({
  marker: window.__marker,
  name: document.getElementById('name')?.textContent,
  title: document.getElementById('title')?.textContent,
  username: document.getElementById('google')?.dataset.username ?? null,
  register: !!document.getElementById('register'),
  closed: !!document.getElementById('closed'),
  own: document.getElementById('own-title')?.textContent,
  header: document.getElementById('header-title')?.textContent
}));

try {
  await tab.goto(`${base}/page/home`, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__init);
  await tab.waitForFunction(() => document.getElementById('title').textContent === 'My Site', {timeout: 5000}).catch(() => {});
  let s = await state();
  check('full load: config binds the title in #main', s.title === 'My Site', JSON.stringify(s));
  check('full load: config binds the client id', s.username === 'abc123', JSON.stringify(s));
  check('full load: header bound too', s.header === 'My Site', JSON.stringify(s));

  const marker = s.marker;
  const fullOwn = s.own;
  // The header is marked so a second pass over it would show
  await tab.evaluate(() => { document.getElementById('header-title').textContent = 'kept'; });

  await tab.click('#to-login');
  await tab.waitForFunction(() => document.getElementById('name')?.textContent === 'login', {timeout: 5000}).catch(() => {});
  s = await state();
  check('link: the page loaded without a reload', s.name === 'login' && s.marker === marker, JSON.stringify(s));
  check('link: title in the swapped page bound', s.title === 'My Site', JSON.stringify(s));
  check('link: social client id bound on the swapped page', s.username === 'abc123', JSON.stringify(s));
  check('link: data-if evaluated on the swapped page', s.register === true && s.closed === false, JSON.stringify(s));
  check('link: form[data-load-api] bound as on a full load', s.own === fullOwn, `${s.own} vs ${fullOwn}`);
  check('link: markup outside #main not bound again', s.header === 'kept', JSON.stringify(s));
  check('link: config fetched once (cached)', configLoads === 1, `loads=${configLoads}`);

  await tab.goBack();
  await tab.waitForFunction(() => document.getElementById('name')?.textContent === 'home', {timeout: 5000}).catch(() => {});
  s = await state();
  check('back: the page brought back is bound as well', s.title === 'My Site' && s.username === 'abc123', JSON.stringify(s));

  check('no page errors', errors.length === 0, errors.join(' | '));
} finally {
  await browser.close();
  server.close();
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
