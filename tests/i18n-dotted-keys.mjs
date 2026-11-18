/**
 * Proof that a single word ending in a dot is translated, and that a fieldset
 * holding a wide table does not widen the page.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 * Before the fix, I18nManager.lookupEntry() split every key without a space on
 * dots: "No." became ["No", ""] and "Loading..." became ["Loading", "", "", ""],
 * so `data-i18n>No.<` and `{LNG_Loading...}` always showed English even though
 * the catalog had them. A dotted path ("menu.home") must keep working.
 *
 * A <fieldset> defaults to min-width: min-content, so a table wider than the
 * screen inside .tablebody pushed the whole page wider instead of scrolling in
 * its box (Now/css/reset.css now sets min-width: 0).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const CSS = '../Now/dist/now.core.min.css';

const translations = {
  'No.': 'เลขที่',
  'Loading...': 'กำลังโหลด...',
  Language: 'ภาษา',
  menu: {home: 'หน้าแรก'}
};

const cells = Array.from({length: 12}, (_, i) => `<td><input type="text" value="${i}"></td>`).join('');
const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<span id="no" data-i18n>No.</span>
<span id="loading" data-i18n>Loading...</span>
<span id="path" data-i18n>menu.home</span>
<span id="lng" title="{LNG_No.}">x</span>
<form><fieldset id="box"><legend>Wide</legend>
  <div class="tablebody"><table class="table border fullwidth"><tbody><tr>${cells}</tr></tbody></table></div>
</fieldset></form>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({
  environment: 'production', allowEval: false, auth: {enabled: false},
  paths: {translations: '/lang'},
  i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (req.url === '/core.css') {
    res.writeHead(200, {'Content-Type': 'text/css; charset=utf-8'});
    return res.end(readFileSync(CSS, 'utf8'));
  }
  if (req.url.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(req.url.startsWith('/lang/th') ? translations : {}));
  }
  res.writeHead(req.url === '/favicon.ico' ? 204 : 404);
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
await tab.setViewport({width: 400, height: 800});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 300)); // let the i18n DOM observer's debounce run

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}`);
const text = id => tab.evaluate(x => document.getElementById(x).textContent, id);
const t = key => tab.evaluate(k => Now.translate(k), key);

// 1. A single word ending in a dot is a key of its own
eq('data-i18n "No." is translated', await text('no'), 'เลขที่');
eq('data-i18n "Loading..." is translated', await text('loading'), 'กำลังโหลด...');
eq('translate("No.") returns the catalog text', await t('No.'), 'เลขที่');
eq('{LNG_No.} in an attribute is translated', await tab.evaluate(() => document.getElementById('lng').getAttribute('title')), 'เลขที่');

// 2. A dotted path still reaches a nested section
eq('data-i18n "menu.home" still reads the nested entry', await text('path'), 'หน้าแรก');
eq('translate("menu.home") still reads the nested entry', await t('menu.home'), 'หน้าแรก');
eq('an unknown dotted word shows its own name', await t('Nope.'), 'Nope.');

// 3. A fieldset no longer grows to its widest content
const layout = await tab.evaluate(() => {
  const box = document.getElementById('box');
  const body = box.querySelector('.tablebody');
  return {
    page: document.documentElement.scrollWidth - window.innerWidth,
    minWidth: getComputedStyle(box).minWidth,
    scrolls: body.scrollWidth > body.clientWidth
  };
});
eq('fieldset min-width is 0', layout.minWidth, '0px');
check('the page is not wider than the screen', layout.page <= 0, `overflow ${layout.page}px`);
check('the wide table scrolls inside .tablebody instead', layout.scrolls === true, JSON.stringify(layout));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
