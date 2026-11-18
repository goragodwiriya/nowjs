/**
 * Proof that rendering a sidemenu does not read the position of its submenus,
 * while a topmenu still keeps its flyouts inside the viewport.
 *
 * **The cost this pins down.** checkResponsiveState() ran checkAndAdjustPosition()
 * on every submenu, and its getBoundingClientRect() forced a layout of the whole
 * page inside the requestAnimationFrame that renders the sidebar. Sidebar
 * submenus open in the flow of the list, so the offsets it sets do nothing to
 * them. On an admin page (25 submenus, 182 links) that one read was 75% of the
 * synchronous render: ~20ms, ~80ms on a 4x slower CPU. (Most of the "[Violation]
 * 'requestAnimationFrame' handler took 84ms" seen there came from the microtasks
 * after it — see i18n-large-dictionary.mjs.)
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node menu-sidebar-no-forced-layout.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<aside class="sidemenu-panel"><nav class="sidemenu" id="side"></nav></aside>
<nav class="topmenu" id="top"></nav>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js' || req.url === '/core.css') {
    const css = req.url === '/core.css';
    res.writeHead(200, {'Content-Type': css ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(css ? '../Now/dist/now.core.min.css' : CORE, 'utf8'));
  }
  if (req.url === '/favicon.ico') {
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

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

/** Renders a menu from data and counts the position reads it made on submenus */
const render = selector => tab.evaluate(sel => {
  const data = Array.from({length: 6}, (_, i) => ({
    title: 'Group ' + i,
    children: Array.from({length: 5}, (_, j) => ({title: 'Item ' + i + '.' + j, url: '/item-' + i + '-' + j}))
  }));
  const reads = [];
  const original = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function () {
    if (this.matches('ul ul')) reads.push(this.id);
    return original.call(this);
  };
  try {
    MenuManager.renderFromData(document.querySelector(sel), data);
  } finally {
    Element.prototype.getBoundingClientRect = original;
  }
  return reads.length;
}, selector);

const sideReads = await render('#side');
check('rendering a sidemenu reads no submenu position', sideReads === 0, `${sideReads} reads`);

const topReads = await render('#top');
check('rendering a desktop topmenu still checks its flyouts', topReads === 6, `${topReads} reads`);

// Opening a sidebar submenu still works without the position check
const opened = await tab.evaluate(async () => {
  const button = document.querySelector('#side > ul > li > button');
  button.click();
  await new Promise(r => setTimeout(r, 400));
  const ul = button.nextElementSibling;
  return {expanded: button.getAttribute('aria-expanded'), visible: getComputedStyle(ul).visibility, style: ul.getAttribute('style') || ''};
});
check('a sidebar submenu still opens', opened.expanded === 'true' && opened.visible === 'visible' && !/left|right|top/.test(opened.style),
  JSON.stringify(opened));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
