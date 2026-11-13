/**
 * EventSystemManager listens to a window event only while a handler wants it
 * (Now.js audit 2026-11-10, phase 7, owner's choice).
 *
 * It used to add a capture listener on window for every window event type at
 * init — popstate, hashchange, resize, scroll, load, pagehide,
 * visibilitychange, beforeunload, online, offline, message, storage — whether
 * any handler was registered or not. Every scroll then ran handleWindowEvent()
 * and filtered all registered handlers, and a beforeunload listener was always
 * on the page. Eight of those types (load … storage) are not even in
 * supportedEvents, so addHandler() refuses them and their listeners could
 * never reach a handler.
 *
 * - init() adds no window listener.
 * - The first handler of a type adds one listener; more handlers of the same
 *   type share it; removing the last one removes it.
 * - Handlers work as before: a window handler, and an element-scoped scroll
 *   handler that only hears its own element.
 * - A scroll with no scroll handler does not reach handleWindowEvent().
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
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main"><div id="box" style="height:80px;overflow:auto"><div style="height:400px">box</div></div><div style="height:3000px">tall</div></main>
<script>
// Window listeners added and removed by EventSystemManager, by type
window.__win = {};
const add = window.addEventListener, remove = window.removeEventListener;
const fromEsm = () => /EventSystemManager|setupGlobalHandlers|WindowListener|addHandler|removeHandler/.test(new Error().stack || '');
window.addEventListener = function (type, ...rest) {
  if (fromEsm()) window.__win[type] = (window.__win[type] || 0) + 1;
  return add.call(this, type, ...rest);
};
window.removeEventListener = function (type, ...rest) {
  if (fromEsm()) window.__win[type] = (window.__win[type] || 0) - 1;
  return remove.call(this, type, ...rest);
};
</script>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
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
await tab.goto(origin + '/', {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);
await sleep(100);

const live = () => tab.evaluate(() => Object.fromEntries(Object.entries(window.__win).filter(([, n]) => n > 0)));

console.log('nothing is listened to at start');
let l = await live();
check('init() adds no window listener', Object.keys(l).length === 0, l);

const idle = await tab.evaluate(async () => {
  let calls = 0;
  const orig = EventSystemManager.handleWindowEvent;
  EventSystemManager.handleWindowEvent = function (...a) { calls++; return orig.apply(this, a); };
  window.scrollTo(0, 500);
  await new Promise(r => setTimeout(r, 150));
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 150));
  EventSystemManager.handleWindowEvent = orig;
  return calls;
});
check('a scroll with no scroll handler does not reach handleWindowEvent()', idle === 0, idle);

console.log('handlers add and remove the listener they need');
const r = await tab.evaluate(async () => {
  const out = {};
  window.__hits = [];
  const a = EventSystemManager.addHandler(window, 'hashchange', () => window.__hits.push('a'));
  const b = EventSystemManager.addHandler(window, 'hashchange', () => window.__hits.push('b'));
  out.afterTwo = window.__win.hashchange || 0;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  out.hits = [...window.__hits].sort().join(',');
  EventSystemManager.removeHandler(a);
  out.afterOne = window.__win.hashchange || 0;
  window.__hits = [];
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  out.hitsAfterOne = window.__hits.join(',');
  EventSystemManager.removeHandler(b);
  out.afterNone = window.__win.hashchange || 0;
  window.__hits = [];
  window.dispatchEvent(new HashChangeEvent('hashchange'));
  out.hitsAfterNone = window.__hits.length;
  return out;
});
check('two hashchange handlers share one window listener', r.afterTwo === 1, r);
check('both handlers run', r.hits === 'a,b', r);
check('removing one keeps the listener for the other', r.afterOne === 1 && r.hitsAfterOne === 'b', r);
check('removing the last removes the listener', r.afterNone === 0 && r.hitsAfterNone === 0, r);

const scroll = await tab.evaluate(async () => {
  const box = document.getElementById('box');
  const hits = {box: 0, win: 0};
  const id1 = EventSystemManager.addHandler(box, 'scroll', () => hits.box++);
  box.scrollTop = 100;
  await new Promise(r => setTimeout(r, 150));
  const boxAfterBox = hits.box;
  window.scrollTo(0, 400);
  await new Promise(r => setTimeout(r, 150));
  const boxAfterPage = hits.box;
  const id2 = EventSystemManager.addHandler(window, 'scroll', () => hits.win++);
  window.scrollTo(0, 0);
  await new Promise(r => setTimeout(r, 150));
  const listeners = window.__win.scroll || 0;
  EventSystemManager.removeHandler(id1);
  EventSystemManager.removeHandler(id2);
  return {boxAfterBox, boxAfterPage, win: hits.win, listeners, after: window.__win.scroll || 0};
});
check('an element-scoped scroll handler hears its element', scroll.boxAfterBox >= 1, scroll);
check('it does not hear the page scroll', scroll.boxAfterPage === scroll.boxAfterBox, scroll);
check('a window scroll handler hears the page scroll', scroll.win >= 1, scroll);
check('element and window scroll handlers share one listener, removed with the last', scroll.listeners === 1 && scroll.after === 0, scroll);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
