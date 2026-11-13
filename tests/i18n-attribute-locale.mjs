/**
 * Proof that a `{LNG_xxx}` marker in an attribute follows the locale.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 *
 * I18nManager replaced the marker in title / alt / aria-label / placeholder
 * with its translation and kept nothing, so the next locale had nothing left
 * to translate: the topbar of adminframework showed its "Switch language" and
 * "Toggle theme" tooltips in the first locale forever. Placeholders set by
 * ElementFactory kept their source in data-i18n-placeholder, but re-translated
 * it with interpolate() only, so a plain key ("Save") stayed English.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const translations = {'Toggle theme': 'สลับธีม', 'Switch language': 'เปลี่ยนภาษา', Save: 'บันทึก', Search: 'ค้นหา'};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<button id="static" title="{LNG_Toggle theme}" aria-label="{LNG_Switch language}">x</button>
<button id="keyed" data-i18n-title="Save" title="Save">x</button>
<input id="keyed-placeholder" data-i18n-placeholder="Search">
<span translate="no"><button id="excluded" title="{LNG_Save}">x</button></span>
<div id="bar" data-component="bar"></div>
<div id="stage"></div>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
  Now.getManager('component').define('bar', {
    template: '<header><button id="component" class="dropdown" title="{LNG_Toggle theme}"><span>EN</span></button></header>'
  });
  await new Promise(r => setTimeout(r, 200));
})();
window.attrs = () => ({
  static: document.getElementById('static').title + ' / ' + document.getElementById('static').getAttribute('aria-label'),
  keyed: document.getElementById('keyed').title,
  keyedPlaceholder: document.getElementById('keyed-placeholder').placeholder,
  excluded: document.getElementById('excluded').title,
  component: document.getElementById('component')?.title,
  inserted: document.getElementById('inserted')?.alt,
  scripted: document.getElementById('scripted')?.title
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
  if (req.url.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(req.url.startsWith('/lang/th') ? translations : {}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url); res.writeHead(404);
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

// Markup inserted after start-up goes through the DOM observer (translateNode)
await tab.evaluate(() => new Promise(resolve => {
  document.getElementById('stage').innerHTML = '<img id="inserted" alt="{LNG_Save}">'
    + '<button id="scripted" title="{LNG_Save}">x</button>';
  requestAnimationFrame(() => resolve());
}));
// A script takes over the title after it was translated
await tab.evaluate(() => { document.getElementById('scripted').title = 'Custom'; });

const switchTo = locale => tab.evaluate(async locale => {
  await I18nManager.setLocale(locale);
  await new Promise(r => setTimeout(r, 100));
  return attrs();
}, locale);

const th = await tab.evaluate(() => attrs());
const en = await switchTo('en');
const back = await switchTo('th');

check('static markup is translated at start', th.static === 'สลับธีม / เปลี่ยนภาษา', JSON.stringify(th.static));
check('static markup follows the switch to English', en.static === 'Toggle theme / Switch language', JSON.stringify(en.static));
check('static markup follows the switch back to Thai', back.static === 'สลับธีม / เปลี่ยนภาษา', JSON.stringify(back.static));
check('component template title follows the locale', th.component === 'สลับธีม' && en.component === 'Toggle theme' && back.component === 'สลับธีม',
  JSON.stringify([th.component, en.component, back.component]));
check('inserted markup follows the locale', th.inserted === 'บันทึก' && en.inserted === 'Save' && back.inserted === 'บันทึก',
  JSON.stringify([th.inserted, en.inserted, back.inserted]));
check('data-i18n-title holding a plain key is translated', th.keyed === 'บันทึก' && en.keyed === 'Save' && back.keyed === 'บันทึก',
  JSON.stringify([th.keyed, en.keyed, back.keyed]));
check('data-i18n-placeholder holding a plain key is translated', th.keyedPlaceholder === 'ค้นหา' && en.keyedPlaceholder === 'Search' && back.keyedPlaceholder === 'ค้นหา',
  JSON.stringify([th.keyedPlaceholder, en.keyedPlaceholder, back.keyedPlaceholder]));
check('a title a script replaced is left alone', en.scripted === 'Custom' && back.scripted === 'Custom', JSON.stringify([en.scripted, back.scripted]));
check('translate="no" keeps the marker', th.excluded === '{LNG_Save}' && en.excluded === '{LNG_Save}', JSON.stringify([th.excluded, en.excluded]));

// A marker written again later wins over the stored source
const rewritten = await tab.evaluate(async () => {
  const el = document.getElementById('static');
  el.title = '{LNG_Save}';
  I18nManager.translateAttributes();
  const first = el.title;
  await I18nManager.setLocale('en');
  const second = el.title;
  await I18nManager.setLocale('th');
  return [first, second, el.getAttribute('data-i18n-title')];
});
check('a marker written later replaces the stored one', rewritten[0] === 'บันทึก' && rewritten[1] === 'Save' && rewritten[2] === '{LNG_Save}', JSON.stringify(rewritten));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
