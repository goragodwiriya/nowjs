/**
 * The body-wide MutationObservers do work per batch, not per node pair or per
 * node (Now.js audit 2026-11-10, phase 7: P3, owner: "do it").
 *
 * Measured on the app's demo table (1,000 rows set three times): I18nManager's
 * observer took 394 ms of the 2.4 s, every other observer together 30 ms.
 *
 * - I18nManager kept only the outermost of the added nodes by testing every
 *   node against every other (nodes.some(other => other.contains(node))):
 *   1,000 rows = a million contains() calls per render. Now each node looks up
 *   its own ancestors in a Set.
 * - EventSystemManager started a timer for every removed element (3,000 rows
 *   removed = 3,000 timers) to release its handlers. Now only removed elements
 *   that have handlers are kept, and one timer releases them.
 * - MenuManager ran querySelectorAll('[data-menu-id]') on every removed element.
 *   Now one deferred pass checks the menus it knows.
 *
 * What they do is the same: translations, handlers released when their element
 * leaves the page (kept when it is only moved), menus destroyed when they go
 * and set up when they come.
 *
 * (Merging them into CoreObserver, as HANDOFF suggested, was not done:
 * CoreObserver stops observing while its own handlers run and processes 10 ms
 * plus a frame later, so a merged I18nManager would paint {LNG_...} first and
 * EventSystemManager/MenuManager would miss what components add and remove.)
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<nav id="menuA" class="sidemenu" data-component="menu"><ul><li><a href="/x">X</a></li></ul></nav>
<div id="holder"><nav id="menuB" class="topmenu" data-component="menu"><ul><li><a href="/y">Y</a></li></ul></nav></div>
<main id="main"><table><tbody id="rows"></tbody></table><div id="host"></div></main>
<script src="/now.core.min.js"></script>
<script>
window.__ready = Now.init({environment: 'production', auth: {enabled: false}, router: {enabled: false},
  paths: {translations: '/language'}, i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['th']}});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = path.match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (file && existsSync(DIST + file[1])) {
    res.writeHead(200, {'Content-Type': (file[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(DIST + file[1], 'utf8'));
  }
  if (path === '/language/th.json') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({Edit: 'แก้ไข', Delete: 'ลบ'}));
  }
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : ''}`);
};
const errors = [];
const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/', {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);
await sleep(300);

const N = 2000;

console.log('I18nManager: 2,000 rows added at once');
let s = await tab.evaluate(async n => {
  const contains = Node.prototype.contains;
  let calls = 0;
  Node.prototype.contains = function (...a) { calls++; return contains.apply(this, a); };
  let translated = 0;
  const translateNode = I18nManager.translateNode;
  I18nManager.translateNode = function (...a) { translated++; return translateNode.apply(this, a); };
  const tbody = document.getElementById('rows');
  for (let i = 0; i < n; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><button title="{LNG_Edit}"><span>e</span></button></td><td data-i18n>Delete</td>`;
    tbody.appendChild(tr);
  }
  await new Promise(r => setTimeout(r, 100));
  Node.prototype.contains = contains;
  I18nManager.translateNode = translateNode;
  const last = tbody.lastElementChild;
  return {calls, translated, title: last.querySelector('button').title, text: last.cells[1].textContent};
}, N);
check(`${N} added rows are not compared pair by pair (contains() calls)`, s.calls < N * 4, s);
check('each row is translated once, as before', s.translated === N, s);
check('their attributes and data-i18n are translated', s.title === 'แก้ไข' && s.text === 'ลบ', s);

console.log('EventSystemManager: 2,000 rows removed at once');
s = await tab.evaluate(async n => {
  const tbody = document.getElementById('rows');
  const kept = tbody.rows[0], gone = tbody.rows[1], moved = tbody.rows[2];
  const ids = {
    kept: EventSystemManager.addHandler(kept, 'click', () => {}),
    gone: EventSystemManager.addHandler(gone, 'click', () => {}),
    moved: EventSystemManager.addHandler(moved, 'click', () => {})
  };
  const setTimeoutOrig = window.setTimeout;
  let timers = 0;
  window.setTimeout = function (...a) { timers++; return setTimeoutOrig.apply(this, a); };
  const host = document.getElementById('host');
  // every row but the first leaves; the third is put back in the same task
  [...tbody.rows].slice(1).forEach(tr => tr.remove());
  host.appendChild(moved);
  await new Promise(r => setTimeoutOrig(r, 0));
  const timersInBatch = timers;
  window.setTimeout = setTimeoutOrig;
  await new Promise(r => setTimeoutOrig(r, 50));
  return {
    timers: timersInBatch,
    kept: EventSystemManager.state.handlers.has(ids.kept),
    gone: EventSystemManager.state.handlers.has(ids.gone),
    moved: EventSystemManager.state.handlers.has(ids.moved)
  };
}, N);
check(`removing ${N} rows does not start a timer per row`, s.timers < 50, s);
check('the handler of a removed element is released', s.gone === false, s);
check('a handler whose element stays, or is only moved, is kept', s.kept && s.moved, s);

console.log('MenuManager: menus removed and added');
s = await tab.evaluate(async n => {
  const qsa = Element.prototype.querySelectorAll;
  let menuQueries = 0;
  Element.prototype.querySelectorAll = function (sel, ...a) { if (/data-menu-id/.test(sel)) menuQueries++; return qsa.call(this, sel, ...a); };
  const tbody = document.getElementById('rows');
  for (let i = 0; i < n; i++) tbody.appendChild(document.createElement('tr'));
  await new Promise(r => setTimeout(r, 20));
  tbody.replaceChildren();
  await new Promise(r => setTimeout(r, 50));
  const rowsQueries = menuQueries;
  Element.prototype.querySelectorAll = qsa;
  const count = () => MenuManager.state.menus.size;
  const before = count();
  document.getElementById('menuA').remove();
  document.getElementById('holder').remove();
  await new Promise(r => setTimeout(r, 80));
  const afterRemove = count();
  document.getElementById('main').insertAdjacentHTML('beforeend', '<nav id="menuC" class="sidemenu" data-component="menu"><ul><li><a href="/z">Z</a></li></ul></nav>');
  await new Promise(r => setTimeout(r, 80));
  return {rowsQueries, before, afterRemove, afterAdd: count(), cSetUp: !!document.getElementById('menuC').dataset.menuId};
}, N);
check(`removing ${N} rows does not search each of them for menus`, s.rowsQueries < 10, s);
check('a removed menu, and one inside a removed element, are destroyed', s.before === 2 && s.afterRemove === 0, s);
check('a menu added later is set up', s.afterAdd === 1 && s.cSetUp, s);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
