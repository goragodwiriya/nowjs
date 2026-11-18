/**
 * Proof that the chosen locale reaches the server through a cookie.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 *
 * I18nManager kept the choice in localStorage only. Kotchasan picks its
 * language file from the `my_lang` cookie, which the switcher never wrote, so
 * the server rendered in the site's default language — API text, email — while
 * the page showed another. A reload did not help: the server writes the
 * language it used back into the cookie on every request.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const translations = {Save: 'บันทึก'};

const page = cookieName => `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<span id="label" data-i18n>{LNG_Save}</span>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']${cookieName === undefined ? '' : ', cookieName: ' + JSON.stringify(cookieName)}}
  });
  await new Promise(r => setTimeout(r, 100));
})();
window.state = () => ({
  locale: I18nManager.getCurrentLocale(),
  label: document.getElementById('label').textContent,
  cookie: document.cookie,
  stored: localStorage.getItem('app_lang')
});
</script>
</body></html>`;

// The language the server would render in: the my_lang cookie of the request
let seenByServer = null;
// Mimic Kotchasan\Language: every response writes back the language it used,
// the request's my_lang or the site default (th) when there is none
let mimicKotchasan = true;

const server = http.createServer((req, res) => {
  const cookie = (req.headers.cookie || '').split(';').map(c => c.trim()).find(c => c.startsWith('my_lang='));
  const used = cookie ? cookie.slice('my_lang='.length) : 'th';
  const headers = mimicKotchasan ? {'Set-Cookie': `my_lang=${used}; path=/`} : {};
  if (req.url === '/' || req.url === '/?no-cookie') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', ...headers});
    return res.end(page(req.url === '/?no-cookie' ? null : undefined));
  }
  if (req.url === '/api') {
    seenByServer = cookie ? cookie.slice('my_lang='.length) : '';
    res.writeHead(200, {'Content-Type': 'application/json', ...headers});
    return res.end('{}');
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const errors = [];
const open = async (context, path = '/') => {
  const tab = await context.newPage();
  tab.on('pageerror', e => errors.push(String(e)));
  tab.on('console', m => m.type() === 'error' && errors.push(m.text()));
  await tab.goto(base + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  return tab;
};
const callApi = tab => tab.evaluate(() => fetch('/api', {credentials: 'same-origin'}).then(r => r.text()));
const switchTo = (tab, locale) => tab.evaluate(async l => {
  await I18nManager.setLocale(l);
  return state();
}, locale);

// 1. A first visit starts in the server's language
let context = await browser.createBrowserContext();
let tab = await open(context);
const first = await tab.evaluate(() => state());
check('first visit starts in the server language', first.locale === 'th' && first.cookie.includes('my_lang=th'), JSON.stringify(first));

// 2. A switch reaches the server on the next request
const en = await switchTo(tab, 'en');
await callApi(tab);
check('switching writes the cookie and localStorage', en.cookie.includes('my_lang=en') && en.stored === 'en', JSON.stringify(en));
check('the next request carries the new locale to the server', seenByServer === 'en', JSON.stringify(seenByServer));

// 3. A reload keeps the choice on both sides
await tab.close();
tab = await open(context);
const reloaded = await tab.evaluate(() => state());
await callApi(tab);
check('reload keeps the chosen locale', reloaded.locale === 'en' && reloaded.label === 'Save', JSON.stringify(reloaded));
check('the server still sees it after reload', seenByServer === 'en', JSON.stringify(seenByServer));
await context.close();

// 4. The cookie wins over localStorage (a cookie the server set, e.g. ?lang=)
context = await browser.createBrowserContext();
tab = await open(context);
await switchTo(tab, 'en');
await tab.evaluate(() => { document.cookie = 'my_lang=th; path=/'; });
await tab.close();
tab = await open(context);
const cookieWins = await tab.evaluate(() => state());
check('the cookie is read before localStorage', cookieWins.locale === 'th' && cookieWins.label === 'บันทึก', JSON.stringify(cookieWins));
await context.close();

// 5. No cookie (a server that does not set one): localStorage restores the
//    choice and seeds the cookie
mimicKotchasan = false;
context = await browser.createBrowserContext();
tab = await open(context);
await switchTo(tab, 'en');
await tab.evaluate(() => { document.cookie = 'my_lang=; path=/; max-age=0'; });
await tab.close();
tab = await open(context);
const fromStorage = await tab.evaluate(() => state());
check('without a cookie localStorage restores the choice and writes the cookie',
  fromStorage.locale === 'en' && fromStorage.cookie.includes('my_lang=en'), JSON.stringify(fromStorage));
await context.close();

// 6. cookieName: null keeps the choice in localStorage only
context = await browser.createBrowserContext();
tab = await open(context, '/?no-cookie');
const off = await switchTo(tab, 'en');
check('cookieName: null writes no cookie', off.locale === 'en' && !off.cookie.includes('my_lang') && off.stored === 'en', JSON.stringify(off));
await context.close();

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
