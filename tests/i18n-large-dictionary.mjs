/**
 * Proof that translating [data-i18n] elements does not cost more with a larger
 * dictionary, and that an empty dictionary still gives the same text.
 *
 * **The cost this pins down.** _translateI18nElement() checked for an empty map
 * with `Object.keys(translations).length === 0` on every element, copying every
 * key of the locale each time. With oms's Thai file (4,846 keys) the DOM observer
 * spent ~145ms translating the 207 items of a freshly rendered sidebar menu — in
 * the microtasks of the menu's requestAnimationFrame, so Chrome reported
 * "[Violation] 'requestAnimationFrame' handler took 84ms" on every page.
 * The shortcut never changed the result: getTranslation() on an empty map falls
 * back to interpolate() exactly as the shortcut did.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node i18n-large-dictionary.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

// A dictionary the size of a real application, and a tiny one
const large = {Save: 'บันทึก', Cancel: 'ยกเลิก'};
for (let i = 0; i < 5000; i++) {
  large[`Key ${i}`] = `ข้อความ ${i}`;
}
const small = {Save: 'Save', Cancel: 'Cancel', 'Key 1': 'Text 1'};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th', 'xx']}
  });
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url.startsWith('/core.js')) {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  const lang = /^\/lang\/(\w+)\.json/.exec(req.url);
  if (lang) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({th: large, en: small, xx: {}}[lang[1]] || {}));
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

/** Median time to translate 400 fresh [data-i18n] elements in a locale */
const timeIn = locale => tab.evaluate(async loc => {
  await I18nManager.setLocale(loc);
  const runs = [];
  for (let r = 0; r < 5; r++) {
    const box = document.createElement('div');
    for (let i = 0; i < 400; i++) {
      const span = document.createElement('span');
      span.setAttribute('data-i18n', i % 2 ? 'Key ' + i : 'Missing ' + i);
      span.textContent = 'x';
      box.appendChild(span);
    }
    document.body.appendChild(box);
    const t0 = performance.now();
    I18nManager.translateNode(box);
    runs.push(performance.now() - t0);
    box.remove();
  }
  runs.sort((a, b) => a - b);
  return runs[2];
}, locale);

const largeMs = await timeIn('th');
const smallMs = await timeIn('en');
check('translating does not grow with the dictionary (5,000 keys vs 3)', largeMs <= Math.max(smallMs * 4, 15),
  `th ${largeMs.toFixed(1)}ms · en ${smallMs.toFixed(1)}ms`);

// The same text as before for an empty dictionary: markers unwrapped, plain text kept
const empty = await tab.evaluate(async () => {
  await I18nManager.setLocale('xx');
  const box = document.createElement('div');
  box.innerHTML = '<span id="m" data-i18n>{LNG_Hello} world</span><span id="p" data-i18n>Plain text</span>'
    + '<span id="k" data-i18n="{LNG_Save}">Save<i class="badge"></i></span>';
  document.body.appendChild(box);
  I18nManager.translateNode(box);
  const out = {
    marker: box.querySelector('#m').textContent,
    plain: box.querySelector('#p').textContent,
    keyed: box.querySelector('#k').firstChild.textContent,
    badgeKept: !!box.querySelector('#k .badge')
  };
  box.remove();
  return out;
});
check('empty dictionary: {LNG_} markers unwrapped, plain text kept, injected child kept',
  empty.marker === 'Hello world' && empty.plain === 'Plain text' && empty.keyed === 'Save' && empty.badgeKept, JSON.stringify(empty));

// And a real translation still happens
const translated = await tab.evaluate(async () => {
  await I18nManager.setLocale('th');
  const box = document.createElement('div');
  box.innerHTML = '<span id="s" data-i18n>Save</span><span id="k" data-i18n="Cancel">Cancel<i></i></span>';
  document.body.appendChild(box);
  I18nManager.translateNode(box);
  const out = {simple: box.querySelector('#s').textContent, keyed: box.querySelector('#k').firstChild.textContent};
  box.remove();
  return out;
});
check('a large dictionary still translates (simple and keyed modes)', translated.simple === 'บันทึก' && translated.keyed === 'ยกเลิก',
  JSON.stringify(translated));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
