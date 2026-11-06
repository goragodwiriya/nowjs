/**
 * Proof that a side menu kept across page changes (a router layout) shows the
 * page's link: the submenu holding it stays expanded and is scrolled into view —
 * and that a mounted component re-rendering on a locale change keeps the inline
 * styles scripts gave it.
 *
 * **What went wrong once the sidebar stopped being rebuilt.** On route:changed
 * MenuManager expanded the branch of the active link, then closed every submenu
 * — that branch included. It only looked right while the sidebar was rebuilt
 * after each page and expanded again from its data. And a locale change
 * re-rendered every component through TemplateManager.processTemplate(), which
 * sanitized the live subtree again: style attributes were rewritten down to the
 * allow list, so a logo tinted through a --tint-image custom property became a
 * blank box.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 *
 *   cd tests && node menu-active-in-layout.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css">
<style>#side{height:240px;overflow-y:auto}</style></head><body>
<main id="main" role="main"></main>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']},
    router: {
      enabled: true, base: '/', mode: 'history', auth: {enabled: false},
      layout: '<div class="shell"><nav class="sidemenu" id="side"></nav><div class="badge" data-component="badge"></div><section data-router-outlet></section></div>',
      routes: {
        '/': {template: '<p id="home">home</p>'},
        '/item-3': {template: '<p id="item3">item 3</p>'},
        '/theme': {template: '<p id="theme">theme</p>'},
        '/email': {template: '<p id="email">email</p>'}
      }
    }
  });
  Now.getManager('component').define('badge', {
    template: '<div class="badge"><span class="mark" style="color: red">mark</span></div>'
  });
  const items = Array.from({length: 20}, (_, i) => ({title: 'Item ' + i, url: '/item-' + i}));
  items.push({title: 'Settings', children: [
    {title: 'General', url: '/general'},
    {title: 'Theme', url: '/theme'},
    {title: 'Email', url: '/email'}
  ]});
  MenuManager.renderFromData(document.querySelector('#side'), items);
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (['/', '/item-3', '/theme', '/email'].includes(url)) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url === '/core.js' || url === '/core.css') {
    const css = url === '/core.css';
    res.writeHead(200, {'Content-Type': css ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(css ? '../Now/dist/now.core.min.css' : CORE, 'utf8'));
  }
  if (url.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(url.startsWith('/lang/th') ? {Settings: 'ตั้งค่า'} : {}));
  }
  if (url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const tab = await browser.newPage();
await tab.setViewport({width: 1280, height: 800});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = () => new Promise(r => setTimeout(r, 400));
const go = async path => {
  await tab.evaluate(p => RouterManager.navigate(p), path);
  await settle();
};

/** State of the settings submenu and whether the active link is inside #side's visible area */
const menuState = () => tab.evaluate(() => {
  const side = document.querySelector('#side');
  const active = side.querySelector('a.active');
  const group = Array.from(side.querySelectorAll('button[aria-haspopup]')).find(b => b.textContent.includes('ตั้งค่า') || b.textContent.includes('Settings'));
  const box = side.getBoundingClientRect();
  const rect = active?.getBoundingClientRect();
  return {
    active: active?.getAttribute('href') || '',
    expanded: group?.getAttribute('aria-expanded'),
    hidden: group?.content?.getAttribute('aria-hidden'),
    visible: getComputedStyle(group.content).visibility,
    inView: !!rect && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1,
    tabindex: active?.getAttribute('tabindex'),
    scrollTop: Math.round(side.scrollTop)
  };
});

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await settle();

await go('/theme');
let m = await menuState();
check('a link inside a submenu: the submenu stays expanded after the page change',
  m.active === '/theme' && m.expanded === 'true' && m.hidden === 'false' && m.visible === 'visible', JSON.stringify(m));
check('the active link is scrolled into the menu\'s visible area', m.inView && m.scrollTop > 0, `scrollTop ${m.scrollTop}`);
check('the active link is reachable by keyboard', m.tabindex !== '-1', String(m.tabindex));

await go('/email');
m = await menuState();
check('moving within the same submenu keeps it expanded', m.active === '/email' && m.expanded === 'true' && m.inView, JSON.stringify(m));

await go('/item-3');
m = await menuState();
check('a link outside the submenu closes it', m.active === '/item-3' && m.expanded === 'false', JSON.stringify(m));
check('and scrolls the menu back to that link', m.inView, `scrollTop ${m.scrollTop}`);

// Back into the closed submenu: expanded again and focusable again
await go('/theme');
m = await menuState();
check('returning to a link in a closed submenu expands it again', m.expanded === 'true' && m.inView && m.tabindex !== '-1', JSON.stringify(m));

// A mounted component re-rendered by a locale change keeps runtime inline styles
const styleBefore = await tab.evaluate(() => {
  const mark = document.querySelector('.badge .mark');
  mark.style.setProperty('--tint-image', 'url("/logo.svg")');
  return mark.getAttribute('style');
});
await tab.evaluate(() => I18nManager.setLocale('en'));
await settle();
const styleAfter = await tab.evaluate(() => document.querySelector('.badge .mark')?.getAttribute('style'));
check('a locale change does not strip inline custom properties from a mounted component',
  /--tint-image/.test(styleAfter || ''), `${styleBefore} → ${styleAfter}`);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
