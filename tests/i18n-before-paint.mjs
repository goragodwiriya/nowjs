/**
 * Proof that markup added to the page is translated before the browser paints
 * it (I18nManager `translateBeforePaint`, on by default) — and that turning the
 * option off brings back the deferred translation.
 *
 * The DOM observer used to wait until the page had been quiet for 50 ms, and
 * setLocale() re-translated the page 100 ms later; every SPA navigation showed
 * `{LNG_xxx}` markers and English keys for a few frames. A requestAnimationFrame
 * callback runs right before the next paint, so what it sees is what would have
 * been painted.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const translations = {Hello: 'สวัสดี', World: 'โลก', Save: 'บันทึก'};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<div id="stage"></div>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
})();

// Insert markup in one task and report what the next frame would paint
window.firstFrame = html => new Promise(resolve => {
  const stage = document.getElementById('stage');
  stage.innerHTML = html;
  requestAnimationFrame(() => resolve(stage.innerText.replace(/\\s+/g, ' ').trim()
    + ' | ' + Array.from(stage.querySelectorAll('[placeholder]')).map(e => e.placeholder).join(',')));
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

const markup = '<p><span data-i18n>Hello</span> {LNG_World}</p><input placeholder="{LNG_Save}">';
const translated = 'สวัสดี โลก | บันทึก';

// 1. On by default: the first painted frame is already translated
check('translateBeforePaint is on by default', await tab.evaluate(() => I18nManager.config.translateBeforePaint) === true);
let frame = await tab.evaluate(html => firstFrame(html), markup);
check('data-i18n, {LNG_} text and attributes are translated in the first frame', frame === translated, `got ${JSON.stringify(frame)}`);

// 2. A smart-mode data-i18n inside another one settles instead of rewriting itself forever
const churn = await tab.evaluate(async () => {
  await firstFrame('<div data-i18n><span data-i18n><b>x</b> {LNG_World}</span> {LNG_Hello}</div>');
  let records = 0;
  const counter = new MutationObserver(list => { records += list.length; });
  counter.observe(document.getElementById('stage'), {childList: true, subtree: true});
  await new Promise(r => setTimeout(r, 300));
  counter.disconnect();
  return {records, text: document.getElementById('stage').innerText.replace(/\s+/g, ' ').trim()};
});
check('nested smart-mode data-i18n is translated once and then left alone', churn.records === 0 && churn.text === 'x โลก สวัสดี', JSON.stringify(churn));

// 3. TemplateManager's i18n pass (used after data-for / data-html) runs before paint too
const scheduled = await tab.evaluate(() => new Promise(resolve => {
  I18nManager.destroyDOMObserver();
  const stage = document.getElementById('stage');
  stage.innerHTML = '<span data-i18n>Save</span>';
  TemplateManager.scheduleI18nUpdate(stage);
  requestAnimationFrame(() => {
    const text = stage.textContent.trim();
    I18nManager.setupDOMObserver();
    resolve(text);
  });
}));
check('TemplateManager.scheduleI18nUpdate translates before the next frame', scheduled === 'บันทึก', `got ${JSON.stringify(scheduled)}`);

// 4. A locale switch is applied as soon as setLocale() resolves
await tab.evaluate(html => firstFrame(html), '<span id="hello" data-i18n>Hello</span>');
await sleep(300);
const switched = await tab.evaluate(async () => {
  const before = document.getElementById('hello').textContent;
  await I18nManager.setLocale('en');
  const after = document.getElementById('hello').textContent;
  await I18nManager.setLocale('th');
  return {before, after};
});
check('setLocale() re-translates the page before it resolves', switched.before === 'สวัสดี' && switched.after === 'Hello', JSON.stringify(switched));

// 5. Turned off: the deferred behaviour is back
await tab.evaluate(() => { I18nManager.config.translateBeforePaint = false; });
frame = await tab.evaluate(html => firstFrame(html), markup);
check('off: the first frame still shows the untranslated markup', frame.includes('{LNG_World}'), `got ${JSON.stringify(frame)}`);
await sleep(300);
const later = await tab.evaluate(() => document.getElementById('stage').innerText.replace(/\s+/g, ' ').trim());
check('off: it is still translated a moment later', later === 'สวัสดี โลก', `got ${JSON.stringify(later)}`);
await tab.evaluate(() => { I18nManager.config.translateBeforePaint = true; });

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
