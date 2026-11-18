/**
 * Security defaults (Now.js audit 2026-11-10, phase 6: S10, rest of S11).
 *
 * - Markup the framework builds itself carries no inline event handlers: the
 *   ResponseHandler error modal (Close), AuthErrorHandler.renderBasicError
 *   (Go Back, Retry) and the router's built-in 404 page (Reload, Home) work on
 *   a page whose Content-Security-Policy allows no inline script.
 * - CSP violation reports are bounded: a repeated violation is recorded and
 *   reported once, distinct ones up to csp.maxViolations / csp.maxReports, and
 *   initializing SecurityManager again does not add a second listener.
 * - SecurityManager.init() run again with the same options does not grow the
 *   arrays in its config (CSP directives, csrf.requireForMethods, excludePaths).
 * - Defaults chosen by the owner: the CSP script-src has no 'unsafe-inline' or
 *   'unsafe-eval' and reportUri is empty; a JWT handed to JavaScript stays in
 *   memory (jwt.storage 'memory'), a token an older version left in
 *   localStorage is removed, and jwt.storage 'localStorage' still stores it.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const STRICT_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'";
let reports = 0;

const page = (initScript, extra = '') => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main"><p>start</p></main>
<script src="/core.js"></script>
${extra}
<script src="${initScript}"></script>
</body></html>`;

// No inline script on the strict page: the CSP would block it
const strictInit = `window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
window.__violations = [];
document.addEventListener('securitypolicyviolation', e => window.__violations.push(e.violatedDirective + ' ' + (e.sample || '')));`;
const plainInit = `window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false},
  security: {csp: {enabled: true, reportUri: 'api/csp-report', directives: {'script-src': ['https://cdn.example']}}, csrf: {excludePaths: ['/hook/*']}}});`;

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const JWT = `${b64({alg: 'HS256', typ: 'JWT'})}.${b64({sub: '1', exp: Math.floor(Date.now() / 1000) + 3600})}.c2ln`;
// An older version wrote the token to localStorage; it must be gone after init
const jwtInit = `try { localStorage.setItem('auth_jwt', ${JSON.stringify(JWT)}); } catch (e) {}
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (status, body, type = 'text/html', headers = {}) => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store', ...headers});
    res.end(body);
  };
  if (url.pathname === '/core.js') return send(200, readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript');
  if (url.pathname === '/auth-error.js') return send(200, readFileSync(DIST + '../js/AuthErrorHandler.js', 'utf8'), 'application/javascript');
  if (url.pathname === '/strict-init.js') return send(200, strictInit, 'application/javascript');
  if (url.pathname === '/plain-init.js') return send(200, plainInit, 'application/javascript');
  if (url.pathname.endsWith('/api/csp-report')) {
    reports++;
    return send(204, '', 'application/json');
  }
  if (url.pathname.endsWith('/api/auth/refresh')) return send(200, JSON.stringify({success: true, token: JWT, data: {token: JWT}}), 'application/json');
  if (url.pathname.startsWith('/api/')) return send(200, '{"success":true,"data":{}}', 'application/json');
  if (url.pathname === '/jwt-init.js') return send(200, jwtInit, 'application/javascript');
  if (url.pathname.startsWith('/jwt')) return send(200, page('/jwt-init.js'));
  if (url.pathname === '/favicon.ico') return send(204, '');
  if (url.pathname.startsWith('/strict')) {
    return send(200, page('/strict-init.js', '<script src="/auth-error.js"></script>'), 'text/html', {'Content-Security-Policy': STRICT_CSP});
  }
  if (url.pathname.startsWith('/plain')) return send(200, page('/plain-init.js'));
  return send(200, '<!doctype html><p id="outside">home</p>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
};
const errors = [];

// --- framework markup under a CSP without 'unsafe-inline' ---------------------
console.log('framework markup works without inline script');
const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/strict/a', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const inlineAttrs = () => tab.evaluate(() => [...document.querySelectorAll('*')]
  .flatMap(el => [...el.attributes].filter(a => /^on/i.test(a.name)).map(a => `${el.tagName.toLowerCase()}[${a.name}]`)));

// ResponseHandler error modal
await tab.evaluate(() => ResponseHandler.showErrorModal('Something <b>failed</b>'));
await sleep(400);
let attrs = await inlineAttrs();
check('error modal has no inline handler', attrs.length === 0, attrs);
const closeSel = await tab.evaluate(() => {
  const btn = [...document.querySelectorAll('.error-modal button')].find(b => /close/i.test(b.textContent));
  if (!btn) return null;
  btn.id = '__close';
  return '#__close';
});
check('error modal has a Close button', !!closeSel);
if (closeSel) {
  await tab.click(closeSel);
  await sleep(500);
  const open = await tab.evaluate(() => window.modal?.visible === true);
  check('Close closes the error modal', open === false);
}

// A modal from a server response: its HTML is untrusted (no on*, no directives, no form controls)
await tab.evaluate(() => ResponseHandler.process({success: true, actions: [{type: 'modal', html: "<p onclick='alert(1)'>detail</p>"}]}));
await sleep(500);
attrs = await inlineAttrs();
check('server modal HTML loses its onclick', attrs.length === 0, attrs);
await tab.evaluate(() => window.modal?.hide());
await sleep(300);

// AuthErrorHandler.renderBasicError
await tab.evaluate(() => {
  history.pushState({}, '', '/strict/b');
  AuthErrorHandler.renderBasicError({}, {message: 'Access denied'});
});
attrs = await inlineAttrs();
check('AuthErrorHandler error page has no inline handler', attrs.length === 0, attrs);
const back = await tab.evaluate(() => {
  const btn = [...document.querySelectorAll('.auth-error-actions button')].find(b => /back/i.test(b.textContent));
  if (!btn) return null;
  btn.click();
  return true;
});
await sleep(400);
check('Go Back goes back', back === true && await tab.evaluate(() => location.pathname) === '/strict/a', await tab.evaluate(() => location.pathname));
await tab.evaluate(() => AuthErrorHandler.renderBasicError({}, {}));
await tab.evaluate(() => { window.__marker = 1; });
await Promise.all([
  tab.waitForNavigation({timeout: 3000}).catch(() => null),
  tab.evaluate(() => [...document.querySelectorAll('.auth-error-actions button')].find(b => /retry/i.test(b.textContent))?.click())
]);
check('Retry reloads the page', await tab.evaluate(() => window.__marker === undefined).catch(() => false));
await tab.evaluate(() => window.__ready);

// Router built-in 404 page
await tab.evaluate(() => RouterManager.renderDefault404Page('/missing'));
attrs = await inlineAttrs();
check('router 404 page has no inline handler', attrs.length === 0, attrs);
await tab.evaluate(() => { window.__marker = 1; });
await Promise.all([
  tab.waitForNavigation({timeout: 3000}).catch(() => null),
  tab.evaluate(() => document.querySelector('#main .error-actions [data-action="reload"]')?.click())
]);
check('404 Reload reloads the page', await tab.evaluate(() => window.__marker === undefined).catch(() => false));
await tab.evaluate(() => window.__ready);

const violations = await tab.evaluate(() => window.__violations);
check('no inline-script CSP violation on the strict page', !violations.some(v => /script-src/.test(v)), violations);
await tab.close();

// --- bounded CSP reports ------------------------------------------------------
console.log('CSP reports are bounded');
const p2 = await browser.newPage();
p2.on('pageerror', e => errors.push(String(e)));
await p2.goto(origin + '/plain/a', {waitUntil: 'networkidle0'});
await p2.evaluate(() => window.__ready);
await sleep(200);

const fire = (count, distinct) => p2.evaluate((count, distinct) => {
  for (let i = 0; i < count; i++) {
    const e = new Event('securitypolicyviolation');
    Object.defineProperties(e, {
      violatedDirective: {value: 'img-src'},
      blockedURI: {value: distinct ? `https://evil.example/${i}.png` : 'https://evil.example/same.png'},
      sourceFile: {value: location.href},
      lineNumber: {value: 1}
    });
    document.dispatchEvent(e);
  }
}, count, distinct);

reports = 0;
await fire(200, false);
await sleep(800);
let stored = await p2.evaluate(() => SecurityManager.state.violations.size);
check('a violation repeated 200 times is reported once', reports === 1, reports);
check('a repeated violation is stored once', stored === 1, stored);

// initializing again must not add a second listener
await p2.evaluate(() => SecurityManager.init({}));
reports = 0;
await p2.evaluate(() => {
  const e = new Event('securitypolicyviolation');
  Object.defineProperties(e, {violatedDirective: {value: 'font-src'}, blockedURI: {value: 'https://fonts.example/x.woff2'}, sourceFile: {value: ''}, lineNumber: {value: 0}});
  document.dispatchEvent(e);
});
await sleep(500);
check('after a second init a new violation is reported once', reports === 1, reports);

reports = 0;
await fire(300, true);
await sleep(1500);
stored = await p2.evaluate(() => SecurityManager.state.violations.size);
const limits = await p2.evaluate(() => ({maxViolations: SecurityManager.config.csp.maxViolations, maxReports: SecurityManager.config.csp.maxReports}));
check('distinct violations are reported up to csp.maxReports', typeof limits.maxReports === 'number' && reports <= limits.maxReports && reports > 0, {reports, limits});
check('distinct violations are stored up to csp.maxViolations', typeof limits.maxViolations === 'number' && stored <= limits.maxViolations, {stored, limits});

// --- init again does not grow config arrays --------------------------------------
console.log('config arrays do not grow on a second init');
const arrays = await p2.evaluate(async () => {
  const opts = {csp: {enabled: true, reportUri: 'api/csp-report', directives: {'script-src': ['https://cdn.example']}}, csrf: {excludePaths: ['/hook/*']}};
  await SecurityManager.init(opts);
  await SecurityManager.init(opts);
  const c = SecurityManager.config;
  return {
    script: c.csp.directives['script-src'],
    methods: c.csrf.requireForMethods,
    exclude: c.csrf.excludePaths,
    metas: document.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').length
  };
});
const dupes = list => list.filter((v, i) => list.indexOf(v) !== i);
check('script-src keeps the app host once and has no duplicates', arrays.script.filter(v => v === 'https://cdn.example').length === 1 && dupes(arrays.script).length === 0, arrays.script);
check("script-src still has the default 'self'", arrays.script.includes("'self'"), arrays.script);
check('csrf.requireForMethods has no duplicates', dupes(arrays.methods).length === 0 && arrays.methods.length === 4, arrays.methods);
check('csrf.excludePaths keeps defaults and the app entry once', dupes(arrays.exclude).length === 0 && arrays.exclude.includes('/hook/*') && arrays.exclude.includes('/auth/verify'), arrays.exclude);
check('one CSP meta tag', arrays.metas === 1, arrays.metas);
await p2.close();

// --- defaults chosen by the owner ---------------------------------------------------
console.log('defaults: CSP script-src and JWT storage');
const p3 = await browser.newPage();
p3.on('pageerror', e => errors.push(String(e)));
await p3.goto(origin + '/jwt/a', {waitUntil: 'networkidle0'});
await p3.evaluate(() => window.__ready);
const defaults = await p3.evaluate(() => ({
  script: SecurityManager.config.csp.directives['script-src'],
  reportUri: SecurityManager.config.csp.reportUri,
  storage: SecurityManager.config.jwt.storage
}));
check("default script-src has no 'unsafe-inline' or 'unsafe-eval'", !defaults.script.some(v => /unsafe-(inline|eval)/.test(v)) && defaults.script.includes("'self'"), defaults.script);
check('default csp.reportUri is empty (no endpoint exists)', defaults.reportUri === '', defaults.reportUri);
check("default jwt.storage is 'memory'", defaults.storage === 'memory', defaults.storage);
check('a token left in localStorage by an older version is removed', await p3.evaluate(() => localStorage.getItem('auth_jwt')) === null);
const mem = await p3.evaluate(async () => {
  await SecurityManager.refreshJWTToken();
  return {stored: localStorage.getItem('auth_jwt'), held: SecurityManager.getJWTToken()};
});
check('a refreshed token stays in memory, not in localStorage', mem.stored === null && mem.held === JWT, mem);
const local = await p3.evaluate(async () => {
  SecurityManager.config.jwt.storage = 'localStorage';
  await SecurityManager.refreshJWTToken();
  const out = {stored: localStorage.getItem('auth_jwt'), held: SecurityManager.getJWTToken()};
  await SecurityManager.clearJWTToken();
  out.cleared = localStorage.getItem('auth_jwt');
  return out;
});
check("jwt.storage 'localStorage' still stores and clears the token", local.stored === JWT && local.held === JWT && local.cleared === null, local);
await p3.close();

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
