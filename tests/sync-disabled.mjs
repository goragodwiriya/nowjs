/**
 * SyncManager does nothing while it is disabled (Now.js audit 2026-11-10, phase 7).
 *
 * Every app passes sync: {enabled: false}, yet SyncManager.init() set up
 * StorageManager, created the pending-operations IndexedDB store and added
 * online/offline/visibility listeners on every page load — 28 ms of a
 * 35 ms Now.init() on a 4x slower CPU.
 *
 * - With enabled: false, init() leaves storage and the page alone.
 * - SyncManager.enable() still sets everything up and turns syncing on.
 * - With enabled: true in the config, init() sets up as before.
 *
 * SyncManager is a feature bundle since (phase 7, P1): with enabled: false it
 * is not even loaded, and app code requires it before enable().
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = enabled => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body><main id="main"></main>
<script>
window.__online = 0;
const add = window.addEventListener;
window.addEventListener = function (type, ...rest) {
  if (type === 'online' || type === 'offline') window.__online++;
  return add.call(this, type, ...rest);
};
</script>
<script src="/core.js"></script>
<script>
window.__created = [];
const create = StorageManager.createDatabase.bind(StorageManager);
StorageManager.createDatabase = (config) => { window.__created.push(Object.keys(config.stores || {})); return create(config); };
window.__ready = Now.init({environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false},
  storage: {enabled: true, type: 'indexeddb', name: 'now_test_storage'},
  sync: {enabled: ${enabled}, autoSync: false}});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  // Feature bundles: the core loads them from its own folder (Now.require)
  const feature = req.url.split('?')[0].match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) {
    res.writeHead(200, {'Content-Type': (feature[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(new URL(feature[1], process.env.NOW_DIST ? 'file://' + process.env.NOW_DIST.replace(/\/?$/, '/') : new URL('../Now/dist/', import.meta.url)), 'utf8'));
  }
  const path = req.url.split('?')[0];
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  if (path === '/off' || path === '/on') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page(path === '/on'));
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
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`);
};
const errors = [];
const open = async path => {
  const tab = await browser.newPage();
  tab.on('pageerror', e => errors.push(String(e)));
  await tab.goto(origin + path, {waitUntil: 'load'});
  await tab.evaluate(() => window.__ready);
  return tab;
};
const syncStore = created => created.some(stores => stores.some(s => /pending/i.test(s)));

console.log('disabled');
let tab = await open('/off');
let s = await tab.evaluate(() => ({loaded: Now.hasFeature('SyncManager'), created: window.__created, online: window.__online}));
check('init() with enabled: false creates no sync store', !syncStore(s.created), s);
const offListeners = s.online;
check('init() with enabled: false does not even load SyncManager', s.loaded === false, s);

s = await tab.evaluate(async () => {
  await Now.require('SyncManager');
  await SyncManager.enable();
  return {initialized: SyncManager.state.initialized, enabled: SyncManager.state.enabled, created: window.__created, online: window.__online};
});
check('enable() sets SyncManager up and turns it on', s.initialized === true && s.enabled === true && syncStore(s.created) && s.online === offListeners + 2, {...s, offListeners});
await tab.close();

console.log('enabled in the config');
tab = await open('/on');
s = await tab.evaluate(() => ({initialized: SyncManager.state.initialized, created: window.__created, online: window.__online}));
check('init() with enabled: true sets up as before', s.initialized === true && syncStore(s.created), s);
// SyncManager adds one online and one offline listener when it is set up
check('init() with enabled: false adds none of SyncManager\'s online/offline listeners', s.online - offListeners === 2, {on: s.online, off: offListeners});
await tab.close();

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
