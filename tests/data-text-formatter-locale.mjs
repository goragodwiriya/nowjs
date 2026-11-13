/**
 * Proof that a data-text written through a formatter follows the locale.
 *
 * TemplateManager re-ran data-text bindings on locale:changed only when the
 * expression held a {LNG_} marker. A date formatted with `| date` (or
 * data-format="date") is written in the locale too — Thai month names and the
 * Buddhist year — so `meta.from | date` kept the first locale until the page
 * was loaded again, while the table under it changed.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="t" data-validate="false" data-load-api="/load">
  <span id="pipe" data-text="from | date"></span>
  <span id="attr" data-text="to" data-format="date"></span>
  <span id="plain" data-text="name"></span>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
  await new Promise(r => setTimeout(r, 300));
})();
window.texts = () => ['pipe', 'attr', 'plain'].map(id => document.getElementById(id).textContent.trim());
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
    return res.end('{}');
  }
  if (req.url.startsWith('/load')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: {from: '2026-01-01', to: '2026-12-31', name: 'Mintra'}}}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(300);

let texts = await tab.evaluate(() => window.texts());
check('dates start in Thai (month name, Buddhist year)', /ม\.ค\./.test(texts[0]) && /2569/.test(texts[0]) && /ธ\.ค\./.test(texts[1]), JSON.stringify(texts));

await tab.evaluate(() => I18nManager.setLocale('en'));
await sleep(300);
texts = await tab.evaluate(() => window.texts());
check('after switching to English: `| date` is English (was: stayed Thai)', /Jan/.test(texts[0]) && /2026/.test(texts[0]), JSON.stringify(texts));
check('and data-format="date" too', /Dec/.test(texts[1]) && /2026/.test(texts[1]), JSON.stringify(texts));
check('a binding without a formatter keeps its value', texts[2] === 'Mintra', JSON.stringify(texts));

await tab.evaluate(() => I18nManager.setLocale('th'));
await sleep(300);
texts = await tab.evaluate(() => window.texts());
check('and back to Thai', /ม\.ค\./.test(texts[0]) && /ธ\.ค\./.test(texts[1]), JSON.stringify(texts));

check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
