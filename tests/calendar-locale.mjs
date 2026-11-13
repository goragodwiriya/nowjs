/**
 * Calendars and date fields work before I18nManager has a locale (Now.js audit
 * 2026-11-10, phase 7 follow-up, owner: "fix every finding").
 *
 * CalendarManager, the date field (DateElementFactory) and Utils.date took the
 * locale from I18nManager.getCurrentLocale() whenever I18nManager existed. That
 * is null until I18nManager has set a locale — always with i18n disabled, and
 * before Now.init() has loaded the translations — and the day names then did
 * null.split(): every page with [data-calendar] threw at load, and with i18n
 * disabled Now.init() itself rejected.
 *
 * Now, without a current locale they use <html lang>, then 'en', as they
 * already did when there is no I18nManager at all.
 *
 * RouterManager.render() did the same with i18n enabled but not initialized
 * (its init failed or has not finished): setLocale(null) — "Unsupported locale:
 * null" shown to the user as an error notification. It now uses the default
 * locale.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = (lang, i18n, before = '') => `<!doctype html>
<html${lang ? ` lang="${lang}"` : ''}><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main">
  <div id="cal" data-calendar></div>
  <form id="f" data-form="f"><input type="date" id="d" name="d" value="2026-11-11"></form>
</main>
<script src="/now.core.min.js"></script>
<script>
window.__ready = (async () => {
  ${before}
  await Now.init({environment: 'production', auth: {enabled: false}, router: {enabled: false},
    i18n: ${i18n ? "{enabled: true, defaultLocale: 'th', availableLocales: ['th']}, paths: {translations: '/language'}" : '{enabled: false}'}});
  await Now.require('CalendarManager');
})();
</script>
</body></html>`;

const routePage = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body><main id="main"></main>
<script src="/now.core.min.js"></script>
<script>
window.__ready = Now.init({environment: 'production', auth: {enabled: false},
  paths: {translations: '/language'}, i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['th']},
  router: {enabled: true, mode: 'history', auth: {enabled: false}, routes: {'/route': {template: '/tpl/home.html'}}}});
</script>
</body></html>`;

const pages = {
  '/route': routePage,
  '/off-th': page('th', false),
  '/off': page('', false),
  // CalendarManager used before Now.init() has set a locale
  '/early': page('th', true, "await Now.require('CalendarManager'); window.__early = CalendarManager.getDayNames({locale: 'auto'});")
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = path.match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (file && existsSync(DIST + file[1])) {
    res.writeHead(200, {'Content-Type': (file[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(DIST + file[1], 'utf8'));
  }
  if (path === '/tpl/home.html') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end('<p id="home">home</p>');
  }
  if (path === '/language/th.json') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end('{}');
  }
  if (pages[path]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[path]);
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
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 600) : ''}`);
};

const open = async path => {
  const errors = [];
  const tab = await browser.newPage();
  tab.on('pageerror', e => errors.push(String(e).split('\n')[0]));
  await tab.goto(origin + path, {waitUntil: 'load'});
  const init = await tab.evaluate(() => window.__ready.then(() => 'resolved', e => 'rejected: ' + e.message));
  await new Promise(r => setTimeout(r, 400));
  const out = await tab.evaluate(() => {
    const input = document.getElementById('d');
    const instance = ElementManager.getInstanceByElement(input);
    try {
      instance?.toggle?.();
    } catch (e) {
      return {toggle: String(e)};
    }
    const days = [...document.querySelectorAll('.days-header .day-name')].map(d => d.textContent);
    return {
      calendar: document.getElementById('cal').classList.contains('calendar-container'),
      calendarText: document.getElementById('cal').textContent,
      fieldDays: days.slice(0, 2),
      early: window.__early ? window.__early.slice(0, 2) : null
    };
  });
  await tab.close();
  return {init, errors, ...out};
};

console.log('i18n disabled, <html lang="th">');
let s = await open('/off-th');
check('Now.init() resolves', s.init === 'resolved', s);
check('the calendar renders, no error', s.calendar && s.errors.length === 0, s);
check('the date field opens with day names', s.fieldDays.length === 2 && !s.toggle, s);
check('both use <html lang>', s.fieldDays[0] === 'อ' && /อา|จันทร์/.test(s.calendarText), {fieldDays: s.fieldDays, calendar: s.calendarText.slice(0, 120)});

console.log('i18n disabled, no <html lang>');
s = await open('/off');
check('Now.init() resolves and nothing throws', s.init === 'resolved' && s.errors.length === 0, s);
check('English day names', /^S/.test(s.fieldDays[0] || ''), s);

console.log('CalendarManager before Now.init() has a locale');
s = await open('/early');
check('day names from <html lang>, no error', Array.isArray(s.early) && s.early.length === 2 && s.errors.length === 0 && s.init === 'resolved', s);

console.log('RouterManager with i18n enabled but not initialized');
{
  const tab = await browser.newPage();
  const errs = [];
  tab.on('pageerror', e => errs.push(String(e).split('\n')[0]));
  await tab.goto(origin + '/route', {waitUntil: 'load'});
  await tab.evaluate(() => window.__ready);
  const r = await tab.evaluate(async () => {
    const handled = [];
    const handle = ErrorManager.handle.bind(ErrorManager);
    ErrorManager.handle = (error, ...rest) => { handled.push(String(error?.message || error)); return handle(error, ...rest); };
    // as when I18nManager.init() failed or has not finished
    I18nManager.state.initialized = false;
    I18nManager.state.current = null;
    await RouterManager.render('<p id="rendered">x</p>');
    return {handled, rendered: !!document.getElementById('rendered'), locale: I18nManager.state.current};
  });
  check('no "Unsupported locale: null" error, the content is rendered', !r.handled.some(m => /Unsupported locale/.test(m)) && r.rendered && errs.length === 0, {...r, errs});
  check('the default locale is set', r.locale === 'th', r);
  await tab.close();
}

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
