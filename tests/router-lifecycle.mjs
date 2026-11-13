/**
 * Router and lifecycle (Now.js audit 2026-11-10, phase 5: B5–B10, part of S11).
 *
 * - B5  a path that carries the router base and a #hash ('/app/user#tab', or a
 *       link written that way) opens the route, not the 404 page.
 * - B6  navigations are sequenced: the last one asked for wins. A navigation
 *       started while a slow template loads, Back pressed during the load, or a
 *       navigation started while an async guard is still running never leaves
 *       the address bar and the content on different pages.
 * - B7  Ctrl/Meta/Shift/Alt clicks and non-primary buttons are left to the
 *       browser (new tab, new window, download); a plain click is still routed.
 * - B8  TemplateManager's cleanup timer starts again when the page becomes
 *       visible after being hidden.
 * - B9  401/403 from FormManager, ApiComponent and TableManager, the
 *       RedirectManager location fallbacks, ErrorRenderer's Home/Login buttons
 *       and the router's built-in 404 page all keep the router base.
 * - B10 RedirectManager no longer sends the skipAuthCheck option nobody reads.
 * - S11 initializeManagers names the manager that failed (and says so loudly
 *       for SecurityManager); route params cannot turn a template name into
 *       inline HTML or climb out of its folder with '..'; getCookie decodes and
 *       copes with a name set on two paths; isPathExcluded compares resolved
 *       paths, not raw strings.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const visits = [];
const fetched = [];

// --- SPA shell: router enabled, base /app -----------------------------------
const spaPage = origin => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<nav><a id="hashlink" href="/app/user#sec">user</a> <a id="lk" href="/app/fast">fast</a></nav>
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
      base: '/app',
      mode: 'history',
      auth: {enabled: false},
      routes: {
        '/': {template: '${origin}/tpl/home.html'},
        '/user': {template: '${origin}/tpl/user.html'},
        '/fast': {template: '${origin}/tpl/fast.html'},
        '/slow': {template: '${origin}/tpl/slow.html'},
        '/a': {template: '${origin}/tpl/a.html'},
        '/b': {template: '${origin}/tpl/b.html'},
        '/guarded': {template: '${origin}/tpl/guarded.html'},
        '/doc/:module/:page': {template: '${origin}/tpl/:module/:page.html'},
        '/p/:name': {template: ':name'}
      }
    }
  });
})();
</script>
</body></html>`;

// --- Plain page: router disabled, base /plain -------------------------------
const plainBody = {
  form403: '<form data-form="f" action="/save" method="post" data-load-api="/api/s403"><input name="a"></form>',
  form401: '<form data-form="f" action="/save" method="post" data-load-api="/api/s401"><input name="a"></form>',
  api403: '<div data-component="api" data-endpoint="/api/s403" data-url-params="false"><p data-text="x"></p></div>',
  api401: '<div data-component="api" data-endpoint="/api/s401" data-url-params="false"><p data-text="x"></p></div>',
  table403: '<table data-table="t" data-source="/api/s403" data-page-size="0"><thead><tr><th data-field="a">a</th></tr></thead><tbody></tbody></table>',
  table401: '<table data-table="t" data-source="/api/s401" data-page-size="0"><thead><tr><th data-field="a">a</th></tr></thead><tbody></tbody></table>',
  redirect: '',
  fallback: '',
  errhome: '',
  errlogin: ''
};
const plainScript = {
  table403: "TableManager.initTable(document.querySelector('[data-table]'));",
  table401: "TableManager.initTable(document.querySelector('[data-table]'));",
  redirect: "RedirectManager.requireAuth({showNotification: false, preserveQuery: false, preserveHash: false});",
  fallback: "RedirectManager.performFallbackRedirect('forbidden', {});",
  errhome: "ErrorRenderer.renderNetworkError(); document.querySelector('#main [data-action=\"home\"]').click();",
  errlogin: "ErrorRenderer.renderAuthError(); document.querySelector('#main [data-action=\"login\"]').click();"
};
const plainPage = name => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main">${plainBody[name] ?? ''}</main>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production',
    allowEval: false,
    auth: {enabled: false},
    i18n: {enabled: false},
    router: {enabled: false, base: '/plain'}
  });
  ${plainScript[name] ?? ''}
})();
</script>
</body></html>`;

// --- Init failure pages -----------------------------------------------------
const initPage = which => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main"></main>
<script src="/core.js"></script>
<script>
${which === 'security'
    ? "SecurityManager.init = async () => { throw new Error('csrf meta broke'); };"
    : "Now.registerManager('boomer', {init: async () => { throw new Error('kaboom'); }});"}
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}}).catch(e => String(e));
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const origin = `http://${req.headers.host}`;
  const send = (status, body, type = 'text/html') => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(body);
  };

  if (url.pathname === '/core.js') return send(200, readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript');
  if (url.pathname === '/table.js') return send(200, readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript');
  if (url.pathname === '/favicon.ico') return send(204, '');
  if (url.pathname === '/api/s403') return send(403, JSON.stringify({success: false, message: 'no entry'}), 'application/json');
  if (url.pathname === '/api/s401') return send(401, JSON.stringify({success: false, message: 'login'}), 'application/json');
  if (url.pathname.startsWith('/api/')) return send(200, JSON.stringify({success: true, data: {}}), 'application/json');

  if (url.pathname.startsWith('/tpl/') || url.pathname === '/secret.html') {
    fetched.push(url.pathname);
    const name = url.pathname.replace(/^\/tpl\//, '').replace(/\.html$/, '');
    if (url.pathname === '/secret.html') return send(200, '<div class="tpl">SECRET</div>');
    if (!/^(home|user|fast|slow|a|b|guarded|docs\/intro)$/.test(name)) return send(404, '');
    if (name === 'slow') await sleep(800);
    return send(200, `<div class="tpl">${name}</div>`);
  }

  if (url.pathname.startsWith('/init/')) return send(200, initPage(url.pathname.slice(6)));

  if (url.pathname.startsWith('/plain/')) {
    const name = url.searchParams.get('case');
    if (name) return send(200, plainPage(name));
    visits.push(url.pathname + url.search);
    return send(200, `<!doctype html><p id="landed">${url.pathname}</p>`);
  }

  if (url.pathname === '/app' || url.pathname.startsWith('/app/')) {
    visits.push(url.pathname + url.search);
    return send(200, spaPage(origin));
  }

  visits.push(url.pathname + url.search);
  return send(200, '<!doctype html><p id="outside">outside the app</p>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/app/a', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(200);

const view = () => tab.evaluate(() => ({
  url: location.pathname + location.search + location.hash,
  tpl: document.querySelector('#main .tpl')?.textContent || (document.querySelector('#main .error-code-number') ? '404' : null),
  loading: document.body.classList.contains('loading')
}));
const goto = async path => {
  await tab.evaluate(p => RouterManager.navigate(p), path);
  await sleep(150);
};

// --- B5: base + hash ----------------------------------------------------------
console.log('B5 base survives a hash');
await goto('/a');
await goto('/app/user#tab');
let v = await view();
check("navigate('/app/user#tab') opens /user", v.tpl === 'user' && v.url === '/app/user#tab', v);

await goto('/a');
await tab.click('#hashlink');
await sleep(200);
v = await view();
check('a link href="/app/user#sec" opens /user', v.tpl === 'user' && v.url === '/app/user#sec', v);

await goto('/a');
await goto('/user#top');
v = await view();
check("navigate('/user#top') without the base still works", v.tpl === 'user' && v.url === '/app/user#top', v);

// --- B6: sequencing ------------------------------------------------------------
console.log('B6 the last navigation wins');
await goto('/a');
await tab.evaluate(() => {
  RouterManager.navigate('/slow');
  setTimeout(() => RouterManager.navigate('/fast'), 100);
});
await sleep(1400);
v = await view();
check('navigation started while a slow template loads is not dropped', v.url === '/app/fast' && v.tpl === 'fast', v);
check('loading state cleared afterwards', v.loading === false, v);

await goto('/a');
fetched.length = 0;
await tab.evaluate(() => {
  RouterManager.navigate('/slow');
  setTimeout(() => RouterManager.navigate('/slow'), 50);
});
await sleep(1400);
v = await view();
check('asking again for the page that is loading (double click) loads it once', v.url === '/app/slow' && v.tpl === 'slow' && fetched.filter(f => f === '/tpl/slow.html').length === 1, {v, fetched});

await goto('/a');
await tab.evaluate(() => {
  RouterManager.navigate('/slow');
  setTimeout(() => RouterManager.navigate('/slow?page=2'), 50);
});
await sleep(2200);
v = await view();
check('the same page with another query while it loads is not swallowed', v.url === '/app/slow?page=2' && v.tpl === 'slow', v);

await goto('/a');
await goto('/b');
await tab.evaluate(() => {
  RouterManager.navigate('/slow');
  setTimeout(() => history.back(), 100);
});
await sleep(1400);
v = await view();
check('Back while a template loads: URL and content stay on the same page', v.url === '/app/b' && v.tpl === 'b', v);

await goto('/a');
await tab.evaluate(() => {
  if (!window.__guardAdded) {
    window.__guardAdded = true;
    RouterManager.beforeEach(async to => {
      if (to.path === '/guarded') await new Promise(r => setTimeout(r, 600));
      return true;
    });
  }
  RouterManager.navigate('/guarded');
  setTimeout(() => RouterManager.navigate('/fast'), 50);
});
await sleep(1200);
v = await view();
check('navigation started during an async guard wins over the guarded one', v.url === '/app/fast' && v.tpl === 'fast', v);
check('loading state cleared after superseded navigations', v.loading === false, v);

// --- B7: modifier clicks ---------------------------------------------------------
console.log('B7 modifier clicks are left to the browser');
await goto('/a');
const clicks = await tab.evaluate(() => {
  const out = {};
  const link = document.getElementById('lk');
  let prevented = null;
  const spy = e => {
    prevented = e.defaultPrevented;
    e.preventDefault(); // keep the test page in place
  };
  window.addEventListener('click', spy);
  for (const [name, init] of Object.entries({
    ctrl: {ctrlKey: true},
    meta: {metaKey: true},
    shift: {shiftKey: true},
    alt: {altKey: true},
    middle: {button: 1}
  })) {
    prevented = null;
    link.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window, ...init}));
    out[name] = {routed: prevented, url: location.pathname};
  }
  prevented = null;
  link.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}));
  out.plain = {routed: prevented};
  window.removeEventListener('click', spy);
  return out;
});
for (const name of ['ctrl', 'meta', 'shift', 'alt', 'middle']) {
  check(`${name}-click is not intercepted`, clicks[name].routed === false && clicks[name].url === '/app/a', clicks[name]);
}
await sleep(200);
v = await view();
check('plain click is still routed', clicks.plain.routed === true && v.url === '/app/fast', {clicks: clicks.plain, v});

// --- S11: route params in template names -------------------------------------------
console.log('S11 route params in template names');
await goto('/a');
fetched.length = 0;
await goto('/doc/../secret');
await sleep(150);
v = await view();
check("param '..' does not climb out of the template folder", !fetched.includes('/secret.html') && v.tpl !== 'SECRET', {fetched, v});

await goto('/a');
await goto('/p/<b id="injected">x<b>');
await sleep(150);
const injected = await tab.evaluate(() => !!document.getElementById('injected'));
check('a param that starts with "<" is not used as inline HTML', injected === false);

// --- B8: cleanup timer ------------------------------------------------------------
console.log('B8 cleanup timer restarts');
const timer = await tab.evaluate(async () => {
  let vis = 'visible';
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => vis});
  const before = !!TemplateManager.state.cleanupInterval;
  vis = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  const hidden = !!TemplateManager.state.cleanupInterval;
  vis = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  const visible = !!TemplateManager.state.cleanupInterval;
  delete document.visibilityState;
  return {before, hidden, visible};
});
check('timer runs at start', timer.before === true, timer);
check('timer stops while hidden', timer.hidden === false, timer);
check('timer starts again when visible', timer.visible === true, timer);

// --- S11: getCookie and isPathExcluded ------------------------------------------------
console.log('S11 getCookie and isPathExcluded');
const cookie = await tab.evaluate(() => {
  document.cookie = 'XSRF-TOKEN=a%2Bb%3D; path=/';
  document.cookie = 'dup=root; path=/';
  document.cookie = 'dup=app; path=/app';
  return {
    encoded: SecurityManager.getCookie('XSRF-TOKEN'),
    dup: SecurityManager.getCookie('dup'),
    missing: SecurityManager.getCookie('nope')
  };
});
check('getCookie decodes the value', cookie.encoded === 'a+b=', cookie);
check('getCookie reads a name set on two paths (most specific first)', cookie.dup === 'app', cookie);
check('getCookie returns null for a missing cookie', cookie.missing === null, cookie);

const excluded = await tab.evaluate(() => ({
  public: SecurityManager.isPathExcluded('api/public/list'),
  dotdot: SecurityManager.isPathExcluded('api/public/../index/save'),
  query: SecurityManager.isPathExcluded('/auth/verify?id=1'),
  absolute: SecurityManager.isPathExcluded(location.origin + '/auth/verify'),
  foreign: SecurityManager.isPathExcluded('https://evil.example/auth/verify'),
  other: SecurityManager.isPathExcluded('/auth/verify-all')
}));
check("'api/public/list' is excluded", excluded.public === true, excluded);
check("'api/public/../index/save' is not excluded", excluded.dotdot === false, excluded);
check("'/auth/verify?id=1' is excluded like '/auth/verify'", excluded.query === true, excluded);
check('the same path written as a full URL is excluded', excluded.absolute === true, excluded);
check('the same path on another origin is not excluded', excluded.foreign === false, excluded);
check("'/auth/verify-all' is not excluded by the exact entry '/auth/verify'", excluded.other === false, excluded);

// --- B10: skipAuthCheck --------------------------------------------------------------
console.log('B10 RedirectManager options');
const opts = await tab.evaluate(async () => {
  const original = RouterManager.navigate;
  let seen = null;
  RouterManager.navigate = async (path, params, options) => {
    seen = {path, options};
    return true;
  };
  try {
    await RedirectManager.redirect('forbidden', {showNotification: false});
  } finally {
    RouterManager.navigate = original;
  }
  return seen;
});
check('RedirectManager hands the router a route path', opts?.path === '/403', opts);
check('RedirectManager no longer sends skipAuthCheck', opts && !('skipAuthCheck' in opts.options), opts);

// --- B9: the router's own 404 page ---------------------------------------------------------
console.log('B9 redirects keep the base');
await goto('/no-such-page');
await sleep(150);
visits.length = 0;
const homeButton = await tab.evaluate(() => !!document.querySelector('#main .icon-home'));
check('router 404 page has a Home button', homeButton);
if (homeButton) {
  await tab.evaluate(() => document.querySelector('#main .icon-home').click());
  await sleep(600);
  const where = await tab.evaluate(() => location.pathname);
  check("404 page Home goes to the app's home, not the site root", where === '/app' || where === '/app/', where);
}
await tab.close();

// --- B9: plain pages (router disabled) -------------------------------------------------------
const plainCases = [
  ['form403', 'FormManager 403', /^\/plain\/403(\?|$)/],
  ['form401', 'FormManager 401', /^\/plain\/login(\?|$)/],
  ['api403', 'ApiComponent 403', /^\/plain\/403(\?|$)/],
  ['api401', 'ApiComponent 401', /^\/plain\/login(\?|$)/],
  ['table403', 'TableManager 403', /^\/plain\/403(\?|$)/],
  ['table401', 'TableManager 401', /^\/plain\/login(\?|$)/],
  ['redirect', 'RedirectManager location fallback', /^\/plain\/login(\?|$)/],
  ['fallback', 'RedirectManager.performFallbackRedirect', /^\/plain\/403(\?|$)/],
  ['errhome', 'ErrorRenderer Home', /^\/plain\/?$/],
  ['errlogin', 'ErrorRenderer Login', /^\/plain\/login(\?|$)/]
];
for (const [name, label, expected] of plainCases) {
  const p = await browser.newPage();
  p.on('pageerror', e => errors.push(`${name}: ${e}`));
  visits.length = 0;
  await p.goto(`${origin}/plain/start?case=${name}`, {waitUntil: 'domcontentloaded'});
  await sleep(1500);
  const where = await p.evaluate(() => location.pathname + location.search).catch(() => null);
  check(`${label} goes to ${expected.source.replace(/\\/g, '').replace(/\(\?\|\$\)|\?\$|\$/g, '').replace('^', '')}`, expected.test(where || ''), {where, visits: [...visits]});
  if (name === 'form403' || name === 'api403' || name === 'table403') {
    check(`${label} carries the server message`, /message=no(\+|%20)entry/.test(where || ''), where);
  }
  await p.close();
}

// --- S11: initializeManagers -----------------------------------------------------------------
console.log('S11 initializeManagers reports failures');
for (const which of ['boomer', 'security']) {
  const p = await browser.newPage();
  const logs = [];
  p.on('console', m => (m.type() === 'error' || m.type() === 'warn' || m.type() === 'warning') && logs.push(m.text()));
  await p.goto(`${origin}/init/${which}`, {waitUntil: 'networkidle0'});
  await p.evaluate(() => window.__ready);
  await sleep(100);
  if (which === 'boomer') {
    check('a failing manager is logged with its name', logs.some(l => l.includes('boomer')), logs);
  } else {
    check('a failing SecurityManager is reported as a security problem', logs.some(l => /SecurityManager/.test(l) && /CSRF|security/i.test(l)), logs);
  }
  await p.close();
}

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
