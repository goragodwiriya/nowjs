/**
 * Page lifecycle (Now.js audit 2026-11-10, phase 7: P4).
 *
 * `beforeunload` is not a reliable "leaving the page" signal: mobile browsers
 * skip it when a tab is closed from the switcher or the app is backgrounded,
 * and when the page goes into the back/forward cache the page is not gone at
 * all. `pagehide` is sent in both cases (persisted tells which).
 *
 * - ApiService, EventManager, NotificationManager, ReactiveManager,
 *   ScrollManager and TemplateManager add no `beforeunload` listener.
 *   (EventSystemManager's delegated window listeners, which let an app register
 *   its own beforeunload handler, are not counted.)
 * - `pagehide` saves what used to be saved on `beforeunload`: the ApiService
 *   cache (storageType local) and ScrollManager's scroll positions.
 * - A page restored from the back/forward cache works as before: the cleanup
 *   timers of EventManager, ReactiveManager and TemplateManager run again and
 *   NotificationManager still has its container.
 * - EventManager's cleanup timer starts again when a hidden page becomes
 *   visible (it stopped for good before, like TemplateManager's did — B8).
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

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>a</title></head><body>
<main id="main"><p>page A</p><a id="go" href="/b">to B</a></main>
<script>
// Record the unload-type listeners the core adds to window
window.__listeners = [];
const add = window.addEventListener;
window.addEventListener = function (type, ...rest) {
  if (/^(beforeunload|unload|pagehide|pageshow)$/.test(type)) {
    const stack = new Error().stack || '';
    if (!/setupGlobalHandlers/.test(stack)) window.__listeners.push(type);
  }
  return add.call(this, type, ...rest);
};
window.__restored = 0;
add.call(window, 'pageshow', e => { if (e.persisted) window.__restored++; });
// Which intervals are really running (clearInterval leaves the id in the managers' state)
window.__active = new Set();
const setI = window.setInterval, clearI = window.clearInterval;
window.setInterval = function (...a) { const id = setI.apply(this, a); window.__active.add(id); return id; };
window.clearInterval = function (id) { window.__active.delete(id); return clearI.call(this, id); };
window.__running = () => ({
  event: window.__active.has(EventManager.state.cleanupTimer),
  reactive: window.__active.has(ReactiveManager.state.cleanupTimer),
  template: window.__active.has(TemplateManager.state.cleanupInterval)
});
</script>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({
  environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false},
  api: {cache: {enabled: true, storageType: 'local'}},
  scroll: {enabled: true}
});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  if (path === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (path === '/b') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end('<!doctype html><title>b</title><p id="b">page B</p>');
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(page);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`);
};
const errors = [];

const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/a', {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);
await sleep(200);

// --- listeners ------------------------------------------------------------------
console.log('listeners');
const listeners = await tab.evaluate(() => window.__listeners);
check('the managers add no beforeunload listener', !listeners.includes('beforeunload'), listeners);
check('the managers add no unload listener', !listeners.includes('unload'), listeners);

// --- hidden, then visible again ------------------------------------------------------------
console.log('visibility');
const vis = await tab.evaluate(() => {
  let state = 'visible';
  Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => state});
  const before = window.__running();
  state = 'hidden';
  document.dispatchEvent(new Event('visibilitychange'));
  const hidden = window.__running();
  state = 'visible';
  document.dispatchEvent(new Event('visibilitychange'));
  delete document.visibilityState;
  return {before, hidden, ...window.__running()};
});
check('the three cleanup timers run after init', vis.before.event && vis.before.reactive && vis.before.template, vis);
check('they stop while the page is hidden', !vis.hidden.event && !vis.hidden.reactive && !vis.hidden.template, vis);
check('EventManager cleanup timer runs again after the page was hidden', vis.event, vis);
check('ReactiveManager and TemplateManager timers run again after the page was hidden', vis.reactive && vis.template, vis);

// --- back/forward cache --------------------------------------------------------------------
console.log('back/forward cache');
await Promise.all([tab.waitForNavigation(), tab.click('#go')]);
await sleep(300);
await tab.goBack();
await sleep(600);
const restored = await tab.evaluate(() => ({
  restored: window.__restored,
  ...window.__running(),
  notificationContainer: !!NotificationManager.state.container?.isConnected,
  notificationInitialized: NotificationManager.state.initialized
}));
check('the page comes back from the back/forward cache', restored.restored === 1, restored);
if (restored.restored === 1) {
  check('restored page: EventManager, ReactiveManager and TemplateManager timers run', restored.event && restored.reactive && restored.template, restored);
  check('restored page: NotificationManager was not torn down', restored.notificationContainer && restored.notificationInitialized, restored);
  const shown = await tab.evaluate(async () => {
    NotificationManager.success('back again');
    await new Promise(r => setTimeout(r, 100));
    return document.body.textContent.includes('back again');
  });
  check('restored page: a notification still shows', shown);
  const listenersAfter = await tab.evaluate(() => window.__listeners);
  check('restoring adds no further unload listeners', listenersAfter.filter(t => t === 'pagehide').length === listeners.filter(t => t === 'pagehide').length, {before: listeners, after: listenersAfter});
}

// A tab of its own: a pagehide that is not persisted means the page is going away
const tab2 = await browser.newPage();
tab2.on('pageerror', e => errors.push(String(e)));
await tab2.goto(origin + '/a', {waitUntil: 'load'});
await tab2.evaluate(() => window.__ready);
await sleep(200);
// --- pagehide saves what has to survive the page ---------------------------------------
console.log('pagehide saves state');
const saved = await tab2.evaluate(() => {
  localStorage.removeItem('api_cache');
  localStorage.removeItem('scroll_positions');
  ApiService.cache.set('GET:/api/x', {data: {ok: 1}, timestamp: Date.now(), expiresAt: Date.now() + 60000});
  ScrollManager.state.scrollRestoration.set('/a', {position: 120, timestamp: Date.now()});
  // What a mobile browser sends when the app is backgrounded and the tab discarded:
  // pagehide, never beforeunload
  window.dispatchEvent(new PageTransitionEvent('pagehide', {persisted: false}));
  return {api: localStorage.getItem('api_cache'), scroll: localStorage.getItem('scroll_positions')};
});
check('pagehide saves the ApiService cache', !!saved.api && saved.api.includes('GET:/api/x'), saved.api);
check('pagehide saves the scroll positions', !!saved.scroll && saved.scroll.includes('"/a"'), saved.scroll);

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
