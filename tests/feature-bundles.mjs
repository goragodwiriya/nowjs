/**
 * Feature bundles load the first time a page uses them (Now.js audit 2026-11-10,
 * phase 7: P1, owner's choice — all of them, apps that call them directly fixed).
 *
 * now.core.min.js carried code most pages never run: the code editor, sync,
 * edit-in-place, the task monitor, SecurityConfig, CalendarManager, the image
 * gallery, the icon picker, tabs, line items, Sortable and the rich text field
 * glue — 15% of the core, gzipped. They are now bundles of their own in
 * Now/dist (now.<name>.min.js, and .css where they have styles), and the core
 * loads one when the page needs it:
 *
 * - markup that uses it, on the page at start or added later
 *   ([data-component="tabs"|"sortable"|"editinplace"|"task-monitor"|
 *   "image-gallery"|"icon-picker"], [data-calendar], [data-line-items],
 *   data-element="code"|"richtext");
 * - the core code that uses it (a row-sortable table, line items bound by
 *   ApiComponent, sync.enabled in Now.init);
 * - Now.require(name), for app code that uses one directly
 *   (Now.require('Sortable'), Now.require('SyncManager'), …).
 *
 * The bundles come from the folder now.core.min.js was loaded from, with the
 * same ?v= query. A manager in a bundle gets its Now.init config as the core's
 * managers do. ServiceWorkerManager adds the bundles it has not cached yet to
 * the precache list, so they are there offline.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const LAZY = ['CodeEditor', 'CodeElementFactory', 'SyncManager', 'EditInPlaceManager', 'TaskMonitorComponent',
  'SecurityConfig', 'CalendarManager', 'ImageGallery', 'IconPicker', 'TabsComponent', 'LineItemsManager',
  'Sortable', 'RichTextElementFactory', 'ImageCropper'];

const head = (scripts = '') => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/Now/dist/now.core.min.css?v=t1"></head><body>`;
const core = '<script src="/Now/dist/now.core.min.js?v=t1"></script>';
const table = '<script src="/Now/dist/now.table.min.js?v=t1"></script>';
const INIT = "{environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}, sync: {enabled: false, syncInterval: 12345, autoSync: false}}";
const boot = (init = INIT, extra = '') => `<script>
window.__ready = (async () => {
  await Now.init(${init});
  if (window.TableManager) await TableManager.init();
  ${extra}
})();
</script>`;

const FEATURES = `
<div id="tabs" data-component="tabs">
  <div class="tab-buttons"><button class="tab-button" data-tab="a">A</button><button class="tab-button" data-tab="b">B</button></div>
  <div class="tab-content"><div class="tab-pane" data-tab="a">pane A</div><div class="tab-pane" data-tab="b">pane B</div></div>
</div>
<ul id="list" data-component="sortable"><li>1</li><li>2</li><li>3</li></ul>
<div id="cal" data-calendar data-calendar-locale="en"></div>
<span id="eip" data-component="editinplace" data-field="name">John</span>
<div id="tm" data-component="task-monitor" data-endpoint="/jobs" data-items="data.active" data-interval="60000"></div>
<div id="gallery" data-component="image-gallery"><img src="/a.png" alt="a"><img src="/b.png" alt="b"></div>
<div id="icons" data-component="icon-picker" data-name="icon"></div>
<form id="f" data-form="codeform"><textarea id="code" name="config" data-element="code" data-language="json">{"a": 1}</textarea></form>
<div data-component="api" data-endpoint="/order" data-url-params="false">
  <table id="li" data-line-items="items" data-merge-key="code" data-attr="data:items">
    <thead><tr><th data-field="code" data-display-only="true">Code</th><th data-field="qty" data-display-only="true">Qty</th></tr></thead>
    <tbody></tbody>
  </table>
</div>
<table id="rows" data-table="rows" data-row-sortable="true" data-source="rows" data-page-size="0"><thead><tr><th data-field="name">Name</th></tr></thead><tbody></tbody></table>`;

const pages = {
  '/plain': head() + '<main id="main"><p>nothing here</p></main>' + core + boot(),
  '/features': head() + `<main id="main">${FEATURES}</main>` + core + table +
    boot(INIT, "TableManager.setData('rows', [{id: '1', name: 'x'}, {id: '2', name: 'y'}]);"),
  '/later': head() + '<main id="main"><p>empty</p></main>' + core + boot(),
  '/onload': head() + `<main id="main">
<div id="order" data-component="api" data-endpoint="/order" data-url-params="false" data-on-load="onOrder">
  <table id="li2" data-line-items="items" data-merge-key="code" data-attr="data:items">
    <thead><tr><th data-field="code" data-display-only="true">Code</th><th data-field="qty" data-display-only="true">Qty</th></tr></thead>
    <tbody></tbody>
  </table>
</div></main>
<script>
// An app's data-on-load handler that uses the line items of its markup at once,
// as parts' and erp's order forms do
window.__rendered = [];
document.addEventListener('api:content-rendered', e => {
  window.__rendered.push(e.target.querySelectorAll('[data-line-items] tbody tr').length);
});
window.onOrder = function (element) {
  const table = element.querySelector('[data-line-items]');
  const instance = window.LineItemsManager?.getInstance(table) || window.LineItemsManager?.create(table);
  window.__onload = {manager: typeof window.LineItemsManager, instance: !!instance, rows: table.querySelectorAll('tbody tr').length};
  return () => { window.__cleaned = true; };
};
</script>` + core + boot(),
  '/syncon': head() + '<main id="main"></main>' + core +
    boot("{environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}, sync: {enabled: true, autoSync: false, syncInterval: 54321}}"),
  '/sw': head() + '<main id="main"></main>' + core + '<script src="/Now/dist/now.serviceworker.min.js?v=t1"></script>' + boot()
};

const requests = [];
let failOnce = new Set();
const server = http.createServer((req, res) => {
  const [path, query = ''] = req.url.split('?');
  const send = (status, body, type) => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(body);
  };
  if (path.startsWith('/Now/dist/')) {
    const file = path.slice('/Now/dist/'.length);
    requests.push(file + (query ? '?' + query : ''));
    if (failOnce.has(file)) {
      failOnce.delete(file);
      return send(404, 'not found', 'text/plain');
    }
    if (!/^[\w.-]+$/.test(file) || !existsSync(DIST + file)) return send(404, 'not found', 'text/plain');
    // The line items bundle arrives after the API data: rendering must wait for it
    const delay = file === 'now.lineitems.min.js' ? 400 : 0;
    return setTimeout(() => send(200, readFileSync(DIST + file, 'utf8'), file.endsWith('.css') ? 'text/css' : 'application/javascript'), delay);
  }
  if (path === '/order') return send(200, JSON.stringify({success: true, data: {items: [{code: 'A', qty: 1}, {code: 'B', qty: 2}, {code: 'C', qty: 3}]}}), 'application/json');
  if (path === '/jobs') return send(200, JSON.stringify({success: true, data: {active: [{id: 1, label: 'Import', progress: 40, status: 'running'}]}}), 'application/json');
  if (/\.png$/.test(path)) {
    res.writeHead(200, {'Content-Type': 'image/png'});
    return res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  }
  if (pages[path]) return send(200, pages[path], 'text/html');
  return send(204, '', 'text/plain');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 700) : ''}`);
};
const errors = [];
const open = async path => {
  requests.length = 0;
  const tab = await browser.newPage();
  tab.on('pageerror', e => errors.push(path + ': ' + String(e)));
  await tab.goto(origin + path, {waitUntil: 'load'});
  await tab.evaluate(() => window.__ready);
  return tab;
};
const featureRequests = () => requests.filter(r => !/^now\.(core|table|serviceworker)\.min\./.test(r));

// --- a page that uses none of them ---------------------------------------------------------
console.log('a page that uses none of them');
let tab = await open('/plain');
await sleep(300);
// Chrome has a native window.SyncManager (Background Sync): not Now.js's
const OURS = "name => window[name] !== undefined && !(typeof window[name] === 'function' && /\\[native code\\]/.test(Function.prototype.toString.call(window[name])))";
let s = await tab.evaluate((lazy, ours) => ({
  present: lazy.filter(eval(ours)),
  require: typeof Now.require,
  tel: !!ElementManager.state.elements.get('tel'),
  date: !!ElementManager.state.elements.get('date')
}), LAZY, OURS);
check('the core does not carry them', s.present.length === 0, s.present);
check('and loads none of them', featureRequests().length === 0, featureRequests());
check('Now.require() is there', s.require === 'function', s);
check('the core keeps <input type="tel"> (MaskElementFactory) and the date field', s.tel && s.date, s);

s = await tab.evaluate(async () => {
  await Now.require('Sortable');
  const sortable = typeof Sortable;
  await Now.require('SyncManager');
  let unknown = null;
  try {
    await Now.require('NoSuchThing');
  } catch (e) {
    unknown = String(e.message || e);
  }
  return {sortable, interval: SyncManager.config.syncInterval, syncInitialized: SyncManager.state.initialized, unknown};
});
check('Now.require(\'Sortable\') loads it', s.sortable === 'function', s);
check('the bundle comes from the core\'s folder with the core\'s ?v=', featureRequests().length > 0 && featureRequests().every(r => /\?v=t1$/.test(r)), featureRequests());
check('a manager in a bundle gets its Now.init config (SyncManager, still disabled)', s.interval === 12345 && s.syncInitialized === false, s);
check('Now.require() of something unknown rejects', !!s.unknown && /NoSuchThing/.test(s.unknown), s);
s = await tab.evaluate(async () => {
  const before = document.querySelectorAll('script[src*="now.sortable"]').length;
  await Promise.all([Now.require('Sortable'), Now.require('sortable')]);
  return {before, after: document.querySelectorAll('script[src*="now.sortable"]').length};
});
check('a bundle is loaded once however often it is required', s.before === 1 && s.after === 1, s);
s = await tab.evaluate(async () => {
  const out = {};
  for (const key of Object.keys(Now.features)) {
    try {
      await Now.require(key);
      out[key] = Now.hasFeature(key) && Now.features[key].globals.every(global => window[global] !== undefined);
    } catch (e) {
      out[key] = String(e.message);
    }
  }
  return out;
});
check('every bundle defines the globals Now.features lists for it', Object.values(s).every(v => v === true), s);
await tab.close();

// --- markup on the page at start ------------------------------------------------------------
console.log('markup on the page at start');
tab = await open('/features');
await tab.waitForFunction(() => window.Sortable && window.TabsComponent && window.CalendarManager && window.LineItemsManager &&
  window.CodeEditor && window.EditInPlaceManager && window.TaskMonitorComponent && window.ImageGallery && window.IconPicker,
  {timeout: 5000}).catch(() => {});
await sleep(600);
s = await tab.evaluate(() => {
  const $ = id => document.getElementById(id);
  const code = ElementManager.getInstanceByElement($('code'));
  return {
    tabs: !!$('tabs').querySelector('.tab-pane.active'),
    sortable: !!window.Sortable?.state?.instances?.has?.($('list')),
    calendar: $('cal').classList.contains('calendar-container'),
    eip: !!$('eip').editInPlace,
    tm: !!window.TaskMonitorComponent?.state?.instances?.has?.($('tm')),
    gallery: $('gallery').classList.contains('ig'),
    galleryCss: !!document.querySelector('link[href*="now.gallery.min.css"]') && getComputedStyle($('gallery')).position !== '',
    icons: $('icons').querySelectorAll('input[type="radio"]').length,
    code: !!(code && code.editor && window.CodeEditor && code.editor instanceof CodeEditor),
    lineItems: $('li').querySelectorAll('tbody tr').length,
    rowSort: !!TableManager.state.tables.get('rows')?.sortable
  };
});
check('tabs', s.tabs, s);
check('sortable', s.sortable, s);
check('[data-calendar]', s.calendar, s);
check('edit in place', s.eip, s);
check('task monitor', s.tm, s);
check('image gallery, with its stylesheet', s.gallery && s.galleryCss, s);
check('icon picker', s.icons > 0, s);
check('data-element="code" gets the code editor (not the plain field)', s.code, s);
check('line items bound by ApiComponent get their rows', s.lineItems === 3, s);
check('a row-sortable table gets Sortable', s.rowSort, s);
const counts = featureRequests().reduce((acc, r) => ({...acc, [r]: (acc[r] || 0) + 1}), {});
check('each bundle is requested once', Object.values(counts).every(n => n === 1), counts);
await tab.close();

// --- markup added later ------------------------------------------------------------------------
console.log('markup added later');
tab = await open('/later');
await sleep(200);
const none = featureRequests().length;
s = await tab.evaluate(async () => {
  const main = document.getElementById('main');
  main.insertAdjacentHTML('beforeend', `<div id="t1" data-component="tabs">
    <div class="tab-buttons"><button class="tab-button" data-tab="a">A</button><button class="tab-button" data-tab="b">B</button></div>
    <div class="tab-content"><div class="tab-pane" data-tab="a">A</div><div class="tab-pane" data-tab="b">B</div></div></div>
    <ul id="l1" data-component="sortable"><li>1</li><li>2</li></ul>`);
  const start = Date.now();
  while (!(window.TabsComponent && window.Sortable) && Date.now() - start < 4000) await new Promise(r => setTimeout(r, 50));
  await new Promise(r => setTimeout(r, 300));
  const first = {tabs: !!document.querySelector('#t1 .tab-pane.active'), sortable: !!Sortable.state.instances.has(document.getElementById('l1'))};
  // Once loaded, the component's own observer takes the next ones
  main.insertAdjacentHTML('beforeend', `<div id="t2" data-component="tabs">
    <div class="tab-buttons"><button class="tab-button" data-tab="c">C</button></div>
    <div class="tab-content"><div class="tab-pane" data-tab="c">C</div></div></div>`);
  await new Promise(r => setTimeout(r, 400));
  return {...first, second: !!document.querySelector('#t2 .tab-pane.active')};
});
check('nothing is loaded before the markup comes', none === 0, none);
check('tabs added later', s.tabs, s);
check('sortable added later', s.sortable, s);
check('tabs added after the bundle is loaded', s.second, s);
await tab.close();

// --- a data-on-load handler whose markup uses a feature ------------------------------------------
console.log('a data-on-load handler whose markup uses a feature');
tab = await open('/onload');
await tab.waitForFunction(() => window.__onload, {timeout: 5000}).catch(() => {});
s = await tab.evaluate(() => ({
  ...window.__onload,
  cleanup: typeof TemplateManager.state.activeScripts.get(document.getElementById('order'))?.cleanupFn
}));
check('it runs once the bundle is loaded and finds LineItemsManager and the table\'s instance', s.manager === 'object' && s.instance, s);
check('the rows bound by ApiComponent are there when it runs', s.rows === 3, s);
check('the cleanup function it returns is kept', s.cleanup === 'function', s);
const rendered = await tab.evaluate(() => window.__rendered);
check('api:content-rendered fires with the rows in place, though the bundle came after the data', rendered.length > 0 && rendered[0] === 3, rendered);
await tab.close();

// --- sync.enabled in Now.init --------------------------------------------------------------------
console.log('sync.enabled in Now.init');
tab = await open('/syncon');
s = await tab.evaluate(() => ({initialized: window.SyncManager?.state?.initialized, interval: window.SyncManager?.config?.syncInterval}));
check('SyncManager is loaded and set up by the time Now.init() resolves', s.initialized === true && s.interval === 54321, s);
await tab.close();

// --- a bundle that fails to load ----------------------------------------------------------------
console.log('a bundle that fails to load');
tab = await open('/plain');
failOnce = new Set(['now.tabs.min.js', 'now.gallery.min.js']);
s = await tab.evaluate(async () => {
  let first = null;
  try {
    await Now.require('TabsComponent');
    first = 'resolved';
  } catch (e) {
    first = 'rejected';
  }
  let second = null;
  try {
    await Now.require('TabsComponent');
    second = typeof TabsComponent;
  } catch (e) {
    second = 'rejected';
  }
  // A bundle with a stylesheet: its script fails, its stylesheet loads
  let gallery = null;
  try {
    await Now.require('ImageGallery');
  } catch (e) {
    await Now.require('ImageGallery');
    gallery = typeof ImageGallery;
  }
  return {first, second, gallery, galleryCss: document.querySelectorAll('link[href*="now.gallery.min.css"]').length};
});
check('Now.require() rejects when the bundle fails to load', s.first === 'rejected', s);
check('and the next Now.require() tries again', s.second === 'object', s);
check('trying again does not add its stylesheet twice', s.gallery === 'object' && s.galleryCss === 1, s);
await tab.close();

// --- service worker precache ----------------------------------------------------------------------
console.log('service worker precache');
tab = await open('/sw');
s = await tab.evaluate(async () => {
  const urls = Now.featureUrls();
  // One already in the cache, as the service worker leaves it after a visit that used it
  const cache = await caches.open('feature-bundles-test');
  await cache.put(urls[0], new Response('cached'));
  let sent = null;
  ServiceWorkerManager.config.precache = ['/index.html'];
  ServiceWorkerManager.state.registration = {active: {postMessage: message => { sent = message; }}};
  await ServiceWorkerManager.updateConfig();
  await caches.delete('feature-bundles-test');
  return {urls, precache: sent?.payload?.precacheUrls || null};
});
check('Now.featureUrls() lists the bundles with the core\'s ?v=', Array.isArray(s.urls) && s.urls.length >= 12 && s.urls.every(u => /\/Now\/dist\/now\.[a-z]+\.min\.(js|css)\?v=t1$/.test(u)), s.urls);
check('ServiceWorkerManager adds the bundles to the precache list, after the app\'s own', !!s.precache && s.precache[0] === '/index.html' && s.urls.slice(1).every(u => s.precache.includes(u)), s.precache);
check('a bundle already cached is not fetched again', !!s.precache && !s.precache.includes(s.urls[0]), s.precache);
await tab.close();

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
