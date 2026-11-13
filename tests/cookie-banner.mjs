/**
 * Proof of the cookie consent bar (js/components/CookieBanner.js of adminframework,
 * shared with every project by cli-framework-sync).
 *
 * It used to be shown nowhere: the projects built on adminframework did not load it
 * and frontend-settings did not send cookie_policy; the bar linked to `${WEB_URL}privacy`
 * with a WEB_URL that only the gcms themes define (ReferenceError elsewhere), and a page
 * with EventManager but no AppConfigManager waited 5 s for an event that never came.
 *
 * Now:
 * - shown only when cookie_policy is on and the visitor has not answered;
 * - a card at the bottom centre on a desktop, the full width at the bottom on a phone;
 * - links to the privacy policy and the terms of service under WEB_URL, else under the
 *   router base; the DPO e-mail (data_controller) is text, never markup;
 * - Accept / Refuse are kept (version, timestamp) and the bar stays away after a reload;
 * - the settings come from AppConfigManager when the page has it (one request), else
 *   straight from the API.
 *
 * Runs the real built bundle and the app file in a real browser against a real HTTP
 * server. NOW_CORE / COOKIE_BANNER=<path> run it against other files.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const FILES = {
  '/core.js': process.env.NOW_CORE || '../Now/dist/now.core.min.js',
  '/cookie.js': process.env.COOKIE_BANNER || '../../adminframework/js/components/CookieBanner.js'
};

const DPO_HTML = '"><img src=x onerror="window.__x.push(\'dpo\')">@example.com';
let settings = {cookie_policy: true, data_controller: 'dpo@example.com'};
const hits = [];

/**
 * @param {URLSearchParams} q
 *   web    — value of a global WEB_URL ('' = none)
 *   cfg    — '1' = Now.init with AppConfigManager loading frontend-settings
 *   locale — i18n locale
 */
const page = q => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<p>content</p>
<script>window.__x = [];${q.get('web') ? ` var WEB_URL = ${JSON.stringify(q.get('web'))};` : ''}</script>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/language'},
    i18n: {enabled: true, defaultLocale: ${JSON.stringify(q.get('locale') || 'en')}, availableLocales: ['en', 'th']},
    ${q.get('cfg') === '1' ? "config: {enabled: true, api: {enabled: true, configUrl: '/site/api/index/config/frontend-settings', cacheResponse: true}}," : ''}
  });
  await I18nManager.setLocale(${JSON.stringify(q.get('locale') || 'en')}, true);
  await new Promise(resolve => {
    const s = document.createElement('script');
    s.src = '/cookie.js';
    s.onload = resolve;
    document.head.appendChild(s);
  });
  await new Promise(r => setTimeout(r, 600));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = body => {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page(url.searchParams));
  }
  if (FILES[url.pathname]) {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(FILES[url.pathname], 'utf8'));
  }
  if (url.pathname === '/language/th.json') return json({Accept: 'ยอมรับ', Refuse: 'ปฏิเสธ', 'Privacy Policy': 'นโยบายความเป็นส่วนตัว'});
  if (url.pathname.endsWith('/api/index/config/frontend-settings')) {
    hits.push(url.pathname);
    return json({success: true, data: {variables: {}, ...settings}});
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

/**
 * Open the page in a fresh context (empty localStorage unless `tab` is reused)
 */
async function open(query = '', {width = 1280, height = 800, tab = null} = {}) {
  if (!tab) {
    const context = await browser.createBrowserContext();
    tab = await context.newPage();
    tab.errors = [];
    tab.on('pageerror', e => tab.errors.push(String(e)));
    await tab.setRequestInterception(true);
    tab.on('request', r => r.url().startsWith(base) ? r.continue() : r.respond({status: 204, body: ''}));
  }
  await tab.setViewport({width, height});
  hits.length = 0;
  await tab.goto(`${base}/?${query}`, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  return tab;
}

const readBanner = tab => tab.evaluate(() => {
  const el = document.getElementById('cookie-consent-banner');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const a = [...el.querySelectorAll('a')].map(x => x.getAttribute('href'));
  return {
    rect: {left: r.left, right: r.right, width: r.width, bottom: r.bottom},
    vw: document.documentElement.clientWidth,
    vh: window.innerHeight,
    links: a,
    text: el.textContent,
    accept: el.querySelector('[data-cookie-accept]')?.textContent,
    decline: el.querySelector('[data-cookie-decline]')?.textContent,
    privacy: el.querySelector('[data-cookie-more]')?.textContent,
    dpoElements: el.querySelector('.cookie-banner__dpo')?.querySelectorAll('*').length ?? null,
    ran: [...window.__x]
  };
});

// 1. Desktop, no WEB_URL, no AppConfigManager (as adminframework without the theme global)
settings = {cookie_policy: true, data_controller: 'dpo@example.com'};
let tab = await open('');
let b = await readBanner(tab);
check('the bar is shown when cookie_policy is on', !!b);
check('no ReferenceError without a WEB_URL global', tab.errors.length === 0, tab.errors.join(' | '));
check('settings asked straight from the API (no AppConfigManager)', hits.length === 1 && hits[0] === '/api/index/config/frontend-settings', JSON.stringify(hits));
check('desktop: a card centred at the bottom, not the full width',
  b && Math.abs((b.rect.left + b.rect.right) / 2 - b.vw / 2) < 2 && b.rect.width <= 760 && b.rect.width < b.vw - 20 && b.vh - b.rect.bottom > 4,
  JSON.stringify(b?.rect));
check('links to privacy, terms and the DPO e-mail',
  b && b.links.join(',') === '/privacy,/terms,mailto:dpo@example.com', JSON.stringify(b?.links));

// 2. Accept is kept and the bar stays away after a reload
await tab.click('[data-cookie-accept]');
await new Promise(r => setTimeout(r, 700));
let stored = await tab.evaluate(() => JSON.parse(localStorage.getItem('cookie_consent') || 'null'));
check('Accept hides the bar and keeps the answer',
  !(await readBanner(tab)) && stored?.accepted === true && stored?.version === '1' && stored?.timestamp > 0, JSON.stringify(stored));
await open('', {tab});
check('after Accept a reload shows no bar and asks nothing', !(await readBanner(tab)) && hits.length === 0, JSON.stringify(hits));
await tab.browserContext().close();

// 3. Phone: the full width at the bottom; Refuse is kept too
tab = await open('', {width: 375, height: 700});
b = await readBanner(tab);
check('phone: the full width, flush with the bottom',
  b && b.rect.left === 0 && Math.abs(b.rect.width - b.vw) < 1 && Math.abs(b.vh - b.rect.bottom) < 1, JSON.stringify(b?.rect));
await tab.click('[data-cookie-decline]');
await new Promise(r => setTimeout(r, 700));
stored = await tab.evaluate(() => JSON.parse(localStorage.getItem('cookie_consent') || 'null'));
check('Refuse hides the bar and keeps the answer', !(await readBanner(tab)) && stored?.accepted === false, JSON.stringify(stored));
await tab.browserContext().close();

// 4. An answer of an older policy version asks again
tab = await open('');
await tab.evaluate(() => localStorage.setItem('cookie_consent', JSON.stringify({version: '0', timestamp: Date.now(), accepted: true})));
await open('', {tab});
check('an answer to an older policy version shows the bar again', !!(await readBanner(tab)));
await tab.browserContext().close();

// 5. Off: no bar
settings = {cookie_policy: false, data_controller: 'dpo@example.com'};
tab = await open('');
check('no bar when cookie_policy is off', !(await readBanner(tab)) && tab.errors.length === 0, tab.errors.join(' | '));
await tab.browserContext().close();

// 6. A theme WEB_URL; the DPO value with markup is text
settings = {cookie_policy: true, data_controller: DPO_HTML};
tab = await open('web=' + encodeURIComponent('/site/'));
b = await readBanner(tab);
check('with a WEB_URL the links and the request are under it',
  b && b.links[0] === '/site/privacy' && b.links[1] === '/site/terms' && hits[0] === '/site/api/index/config/frontend-settings',
  JSON.stringify({links: b?.links, hits}));
check('a DPO value with markup is shown as text', b && b.text.includes(DPO_HTML) && b.dpoElements === 2 && b.ran.length === 0,
  JSON.stringify({elements: b?.dpoElements, ran: b?.ran}));
await tab.browserContext().close();

// 7. With AppConfigManager: its answer is used, no second request; text in the locale
settings = {cookie_policy: '1', data_controller: ''};
tab = await open('cfg=1&locale=th&web=' + encodeURIComponent('/site/'));
b = await readBanner(tab);
check('with AppConfigManager its settings are used (one request)', !!b && hits.length === 1, JSON.stringify(hits));
check('no DPO line when data_controller is empty', b && b.dpoElements === null && b.links.length === 2, JSON.stringify(b?.links));
check('the bar is in the visitor\'s language', b && b.accept === 'ยอมรับ' && b.decline === 'ปฏิเสธ' && b.privacy === 'นโยบายความเป็นส่วนตัว',
  JSON.stringify({accept: b?.accept, decline: b?.decline, privacy: b?.privacy}));
check('no errors on the page', tab.errors.length === 0, tab.errors.join(' | '));
await tab.browserContext().close();

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
