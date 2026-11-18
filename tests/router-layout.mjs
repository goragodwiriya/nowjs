/**
 * Proof that a layout shared by the routed pages (sidebar, topbar, footer) stays
 * mounted across page changes, and that components outside the routed content
 * are no longer mounted again on every navigation.
 *
 * **The flicker this pins down.** Each page template carried its own sidebar
 * and topbar, so every navigation rebuilt them and their api components fetched
 * the signed-in user again — the menu went blank until the answer came back.
 * Moving them out of the templates did not help: after rendering, the router
 * called ComponentManager.initializeExistingElements() over the whole document,
 * whose "already mounted" check required `instance.state.initialized`, which
 * nothing ever set — so the sidebar outside `#main` was rebuilt anyway.
 *
 * Covers: `router.layout` and per-route `layout` (a template file, `false`, or
 * an in-page `<template>`), the layout being rebuilt after something wrote over
 * the main element, a layout without an outlet leaving the page as it was,
 * history navigation, data-if not remounting components elsewhere, the new page
 * being translated without emitting locale:changed, and a persistent api
 * component still answering its refresh event after several page changes.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 *
 *   cd tests && node router-layout.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const translations = {Hello: 'สวัสดี', World: 'โลก', Footer: 'ท้ายหน้า'};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<template id="layout-inline"><div class="inline-shell"><nav data-component="shellbox"></nav><section data-router-outlet></section></div></template>
<aside data-component="outside"></aside>
<main id="main" role="main"></main>
<script src="/core.js"></script>
<script>
window.__locale = 0;
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']},
    router: {
      enabled: true, base: '/', mode: 'history', auth: {enabled: false},
      layout: 'layouts/app.html',
      routes: {
        '/': {template: 'a.html', title: 'A'},
        '/b': {template: 'b.html', title: 'B'},
        '/c': {template: 'c.html', title: 'C'},
        '/login': {template: 'login.html', title: 'Login', layout: false},
        '/inline': {template: 'b.html', title: 'Inline', layout: '#layout-inline'},
        '/broken': {template: 'a.html', title: 'Broken', layout: 'layouts/no-outlet.html'}
      }
    }
  });
  const cm = Now.getManager('component');
  cm.define('shellbox', {
    template: '<nav class="shell"><div data-component="api" data-endpoint="/me" data-refresh-event="profile:saved"><b data-text="data.name">placeholder</b></div></nav>'
  });
  cm.define('outside', {
    template: '<aside class="outside"><div data-component="api" data-endpoint="/outside"><i data-text="data.name">placeholder</i></div></aside>'
  });
  EventManager.on('locale:changed', () => window.__locale++);
})();
</script>
</body></html>`;

const files = {
  '/templates/layouts/app.html': '<div class="app-shell"><aside data-component="shellbox"></aside><div class="app-body" data-router-outlet></div><footer data-i18n>Footer</footer></div>',
  '/templates/layouts/no-outlet.html': '<div class="no-outlet">no outlet here</div>',
  '/templates/a.html': '<section id="pa"><h1 data-i18n>Hello</h1></section>',
  '/templates/b.html': '<section id="pb"><h1 data-i18n>World</h1></section>',
  '/templates/c.html': '<section id="pc" data-component="api" data-endpoint="/flag"><p class="flag" data-if="data.on">shown</p></section>',
  '/templates/login.html': '<form id="login">login</form>'
};

const hits = {me: 0, outside: 0};

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (['/', '/b', '/c', '/login', '/inline', '/broken'].includes(url)) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (files[url]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(files[url]);
  }
  if (url.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(url.startsWith('/lang/th') ? translations : {}));
  }
  if (url === '/me' || url === '/outside') {
    const key = url.slice(1);
    hits[key]++;
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: {name: `${key} #${hits[key]}`}}));
  }
  if (url === '/flag') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: {on: true}}));
  }
  if (url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url);
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
let errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const settle = () => new Promise(r => setTimeout(r, 500));
const go = async path => {
  const result = await tab.evaluate(p => RouterManager.navigate(p), path);
  await settle();
  return result;
};

/** What is on screen now, plus element identities kept on window for comparison */
const snap = () => tab.evaluate(() => {
  const main = document.querySelector('#main');
  const shell = main.querySelector('.app-shell');
  const nav = main.querySelector('nav.shell');
  const outlet = main.querySelector('[data-router-outlet]');
  return {
    shellIsKept: !!shell && shell === window.__shell,
    navIsKept: !!nav && nav === window.__nav,
    outsideIsKept: document.querySelector('aside.outside') === window.__outside,
    hasShell: !!shell,
    name: nav?.querySelector('b')?.textContent || '',
    outlet: outlet ? outlet.firstElementChild?.id || '' : '',
    mainChild: main.firstElementChild?.className || main.firstElementChild?.id || '',
    heading: (outlet || main).querySelector('h1')?.textContent || '',
    footer: main.querySelector('footer')?.textContent || '',
    locale: window.__locale
  };
});
const remember = () => tab.evaluate(() => {
  window.__shell = document.querySelector('#main .app-shell');
  window.__nav = document.querySelector('#main nav.shell');
  window.__outside = document.querySelector('aside.outside');
});

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await settle();

let s = await snap();
check('first page renders inside the layout outlet', s.hasShell && s.outlet === 'pa', JSON.stringify({outlet: s.outlet}));
check('layout and page are translated', s.heading === 'สวัสดี' && s.footer === 'ท้ายหน้า', `${s.heading} / ${s.footer}`);
check('layout api component rendered its data', s.name === 'me #1', s.name);

await remember();
const before = {...hits};
for (const path of ['/b', '/', '/b']) {
  await go(path);
}
s = await snap();
check('layout element is the same after 3 page changes', s.shellIsKept && s.navIsKept);
check('layout api component did not fetch again', hits.me === before.me, `${hits.me - before.me} extra`);
check('component outside #main is not mounted again', s.outsideIsKept && hits.outside === before.outside,
  `${hits.outside - before.outside} extra fetches`);
check('new page went into the outlet and was translated', s.outlet === 'pb' && s.heading === 'โลก', `${s.outlet} ${s.heading}`);
check('navigation does not emit locale:changed', s.locale === 0, `${s.locale} times`);

// data-if showing content must not remount components elsewhere
await go('/c');
const flag = await tab.evaluate(() => document.querySelector('#pc .flag')?.textContent || '');
s = await snap();
check('data-if inside the page still renders', flag === 'shown', flag);
check('data-if does not remount the layout or outside components',
  s.shellIsKept && s.navIsKept && s.outsideIsKept && hits.me === before.me && hits.outside === before.outside);

// The persistent api component kept its bindings through the page cleanups
await tab.evaluate(() => EventManager.emit('profile:saved'));
await settle();
s = await snap();
check('layout api component still refreshes on its event', s.name === `me #${hits.me}` && hits.me === before.me + 1, s.name);

// History navigation keeps the layout too
await go('/b');
await tab.evaluate(() => history.back());
await settle();
s = await snap();
check('history back renders inside the same layout', s.shellIsKept && s.outlet === 'pc', s.outlet);

// layout: false — the page fills #main, no layout
await go('/login');
s = await snap();
check('route with layout: false renders without the layout', !s.hasShell && s.mainChild === 'login', s.mainChild);

// Back into the app — the layout is built again with fresh data
const meBeforeReturn = hits.me;
await go('/');
s = await snap();
check('returning to a layout route builds the layout again', s.hasShell && !s.shellIsKept && s.outlet === 'pa');
check('rebuilt layout fetched its data once', hits.me === meBeforeReturn + 1, `${hits.me - meBeforeReturn} fetches`);

// Something wrote over #main (an auth error page) — the next page rebuilds the layout
await remember();
await tab.evaluate(() => {
  document.querySelector('#main').innerHTML = '<p class="auth-error">error</p>';
});
await go('/b');
s = await snap();
check('layout is rebuilt after #main was overwritten', s.hasShell && !s.shellIsKept && s.outlet === 'pb', s.outlet);

// A layout from a <template> in the page
await go('/inline');
const inline = await tab.evaluate(() => {
  const shell = document.querySelector('#main .inline-shell');
  return {shell: !!shell, page: shell?.querySelector('[data-router-outlet] #pb') ? 'pb' : ''};
});
check('in-page <template> layout renders with the page in its outlet', inline.shell && inline.page === 'pb', JSON.stringify(inline));

// A layout without an outlet fails before tearing anything down
const errorsBefore = errors.length;
const broken = await go('/broken');
const stillThere = await tab.evaluate(() => !!document.querySelector('#main .inline-shell [data-router-outlet] #pb'));
check('layout without an outlet fails and leaves the page as it was', broken === false && stillThere, `navigate() → ${broken}`);
check('the failure names the missing outlet', errors.slice(errorsBefore).some(e => /data-router-outlet/.test(e)));
errors = errors.slice(0, errorsBefore);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
