/**
 * A menu its API component loads again keeps the state the user left it in
 * (owner's report 2026-11-11: collapse the sidebar, press a button in a table
 * that opens a modal, and the sidebar opens up again).
 *
 * The app's sidebar is an ApiComponent (api/index/auth/me) with
 * data-refresh-event="form:submitted,table:action,auth:restored" around a
 * <nav data-component="menu" data-source="data.menus">. Every table action and
 * form save reloads it, and MenuManager destroyed the menu and rendered it
 * again: destroying removed body.sidemenu-close (the collapsed sidebar opened)
 * and rendering expanded the active item's submenu (body.sidemenu-sub-expanded).
 *
 * - The same items again: the menu is left as it is.
 * - Different items: they are rendered, and a collapsed sidebar stays collapsed
 *   with no submenu open, as the toggle leaves it; an expanded sidebar still
 *   opens the active item's submenu.
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

let version = 1;
const menus = () => [
  {title: 'Home', url: '/', icon: 'icon-home'},
  {title: 'Settings', icon: 'icon-settings', children: [
    {title: 'Profile', url: '/profile'},
    {title: 'Security', url: '/security'}
  ]},
  ...(version > 1 ? [{title: 'Reports', url: '/reports', icon: 'icon-report'}] : []),
  ...(version > 2 ? [{title: 'Logs', url: '/logs', icon: 'icon-list'}] : [])
];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/now.core.min.css"></head><body>
<aside class="sidebar sidemenu-panel">
  <div id="side" data-component="api" data-endpoint="/me" data-url-params="false" data-refresh-event="form:submitted,table:action">
    <nav class="sidemenu" data-component="menu" data-source="data.menus"></nav>
  </div>
</aside>
<main id="main"><p>profile page</p></main>
<script src="/now.core.min.js"></script>
<script>
window.__ready = Now.init({environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
</script>
</body></html>`;

let meHits = 0;
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = path.match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (file && existsSync(DIST + file[1])) {
    res.writeHead(200, {'Content-Type': (file[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(DIST + file[1], 'utf8'));
  }
  if (path === '/me') {
    meHits++;
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {menus: menus()}}));
  }
  if (path === '/profile') {
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
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`);
};
const errors = [];
const tab = await browser.newPage();
await tab.setViewport({width: 1400, height: 900});
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/profile', {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);
await tab.waitForFunction(() => document.querySelectorAll('.sidemenu a').length >= 3, {timeout: 5000});
await sleep(300);

const state = () => tab.evaluate(() => {
  const nav = document.querySelector('.sidemenu');
  return {
    body: document.body.className.split(/\s+/).filter(Boolean).sort().join(' '),
    items: [...nav.querySelectorAll('a')].map(a => a.textContent.trim()).join(','),
    openSubmenus: nav.querySelectorAll('[aria-expanded="true"]').length,
    active: nav.querySelector('a.active')?.textContent.trim() || null,
    navNode: nav.querySelector('ul') === window.__ul
  };
});
const refresh = async () => {
  const before = meHits;
  await tab.evaluate(() => EventManager.emit('table:action', {action: 'detail', id: 1}));
  const start = Date.now();
  while (meHits === before && Date.now() - start < 3000) await sleep(50);
  await sleep(500);
};

let s = await state();
check('the active item is the one of this page, its group opened', s.active === 'Profile' && s.openSubmenus === 1, s);

console.log('collapsed sidebar, same items');
await tab.evaluate(() => {
  const menu = [...MenuManager.state.menus.values()].find(m => m.element?.classList.contains('sidemenu'));
  MenuManager.toggleMenu(menu);
  window.__ul = document.querySelector('.sidemenu ul');
});
await sleep(500);
s = await state();
check('the toggle collapses the sidebar and closes its submenus', /sidemenu-close/.test(s.body) && s.openSubmenus === 0, s);
await refresh();
s = await state();
check('a table action reloads the sidebar', meHits >= 2, meHits);
check('the sidebar stays collapsed', /sidemenu-close/.test(s.body), s);
check('no submenu opens (no sidemenu-sub-expanded)', s.openSubmenus === 0 && !/sidemenu-sub-expanded/.test(s.body), s);
check('the same items are left as they are (not rendered again)', s.navNode, s);

console.log('collapsed sidebar, new items');
version = 2;
await refresh();
s = await state();
check('the new items are shown', s.items.includes('Reports'), s);
check('the sidebar stays collapsed with no submenu open', /sidemenu-close/.test(s.body) && s.openSubmenus === 0 && !/sidemenu-sub-expanded/.test(s.body), s);
check('the active item is still marked', s.active === 'Profile', s);
const toggleAgain = await tab.evaluate(async () => {
  const menu = [...MenuManager.state.menus.values()].find(m => m.element?.classList.contains('sidemenu'));
  return {open: MenuManager.isMenuOpen(menu), toggle: menu.elements?.toggle?.getAttribute('aria-expanded') ?? null};
});
check('the new menu knows it is collapsed (the toggle opens it next)', toggleAgain.open === true && (toggleAgain.toggle === null || toggleAgain.toggle === 'true'), toggleAgain);

console.log('expanded sidebar, new items');
await tab.evaluate(async () => {
  const menu = [...MenuManager.state.menus.values()].find(m => m.element?.classList.contains('sidemenu'));
  await MenuManager.closeMenu(menu);
});
await sleep(400);
version = 3;
await tab.evaluate(() => { window.__ul = null; });
await refresh();
s = await state();
check('an expanded sidebar stays expanded', !/sidemenu-close/.test(s.body), s);
check('and opens the active item\'s group as before', s.active === 'Profile' && s.openSubmenus === 1, s);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
