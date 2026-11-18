/**
 * URLs that come from data are checked before a table cell, a row action, a
 * filter action, a menu item or a bound link uses them (Now.js audit 2026-11-11,
 * phase 2: N2, N4, L1).
 *
 * - TableManager data-template: a row value in href/src/... goes through
 *   TemplateManager.safeAttributeValue() after the cell is filled.
 * - Row actions (`"url": "{link}"`, _self and _blank) and filter actions
 *   (data-filter-actions) never navigate to or open a javascript: URL.
 * - MenuManager.renderFromData: item.url through SecurityManager.sanitizeUrl
 *   ('#' when refused); item.data keeps only the data-* names untrusted HTML
 *   keeps (SecurityManager.config.html.dataAttributes).
 * - ModalDataBinder (pre-existing modal) does not put a javascript: URL into
 *   href or src; FileElementFactory leaves out an existing file (from an API)
 *   whose url sanitizeUrl refuses, and quotes an image's url in CSS
 *   (SecurityManager.cssUrl) so a ) or a quote stays part of it.
 * Paths and http(s) links keep working.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const J = n => `javascript:window.__x.push('${n}')//`;
// the same inside an HTML attribute quoted with '
const JA = n => `javascript:window.__x.push(&#39;${n}&#39;)//`;
const ROWS = [
  {id: 1, name: 'bad', link: J('row-link'), img: J('row-img')},
  {id: 2, name: 'good', link: '/orders?id=2&x=a b', img: '/img/2.png'},
  {id: 3, name: 'ext', link: 'https://example.com/a', img: 'data:image/png;base64,AAAA'}
];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div id="main"></div>
<table data-table="t1" data-source="/rows" data-page-size="0" data-row-actions='{
 "open": {"title": "Open", "className": "btn open", "method": "get", "url": "{link}"},
 "blank": {"title": "Blank", "className": "btn blank", "method": "get", "url": "{link}", "target": "_blank"}
}' data-filter-actions='{
 "bad": {"label": "Bad", "url": "${JA('filter-link')}", "type": "link", "className": "fa-bad"},
 "badblank": {"label": "Bad blank", "url": "${JA('filter-blank')}", "type": "link", "target": "_blank", "className": "fa-badblank"},
 "good": {"label": "Good", "url": "/reports", "type": "link", "className": "fa-good"}
}'>
<thead><tr><th data-field="name">name</th>
<th data-field="link" data-template="<a class='tl' href='\${link}'>\${name}</a><img class='ti' src='\${img}'><a class='tx' href='/fixed?n=\${name}'>x</a>">link</th></tr></thead><tbody></tbody></table>

<button id="pm-open" data-modal="pm" data-modal-bind="link:badlink, pic:badpic" data-badlink="${JA('binder')}" data-badpic="${JA('binder-img')}">o</button>
<button id="pm2-open" data-modal="pm2" data-modal-bind="link:goodlink" data-goodlink="/orders/2">o</button>
<div id="pm" class="modal"><a id="pm-a" data-modal-target="link">a</a><img id="pm-img" data-modal-target="pic"></div>
<div id="pm2" class="modal"><a id="pm2-a" data-modal-target="link">a</a></div>

<div class="f"><div class="fz"><input type="file" id="files" data-element="file" data-preview="true" name="files" data-files='[{"url": "${JA('file-href')}x.pdf", "name": "x.pdf"}, {"url": "/files/ok.pdf", "name": "ok.pdf"}, {"url": "/files/we\\&quot;ird).png", "name": "w.png"}]'></div></div>

<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false},
    security: {html: {dataAttributes: ['data-badge']}}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="t1"]'));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: ROWS}));
  }
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript'],
    '/table.js': [readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript']
  };
  const file = files[path] || (path.startsWith('/now.') && path.endsWith('.js')
    ? [readFileSync(DIST + path.slice(1), 'utf8'), 'application/javascript'] : null);
  if (!file) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': `${file[1]}; charset=utf-8`});
  res.end(file[0]);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('dialog', d => {
  errors.push('DIALOG:' + d.message());
  d.dismiss();
});
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 600));

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

// Clicks are recorded; a click on a link with a path is stopped so the page stays
const setup = () => tab.evaluate(() => {
  window.__x = [];
  window.__opened = [];
  window.__routed = [];
  window.open = (u, t) => {
    window.__opened.push(String(u));
    return null;
  };
  if (window.RouterManager) {
    RouterManager.navigate = (u) => {
      window.__routed.push(String(u));
      return Promise.resolve(true);
    };
  }
  if (!window.__guard) {
    window.__guard = true;
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a');
      const href = a?.getAttribute('href') || '';
      if (a && !/^\s*javascript:/i.test(href)) e.preventDefault();
    }, false);
  }
});

// --- data-template cells ---------------------------------------------------------
console.log('data-template cells');
await setup();
const cells = await tab.evaluate(async () => {
  const rows = [...document.querySelectorAll('[data-table="t1"] tbody tr')];
  const out = rows.map(tr => ({
    tl: tr.querySelector('.tl')?.getAttribute('href') ?? null,
    ti: tr.querySelector('.ti')?.getAttribute('src') ?? null,
    tx: tr.querySelector('.tx')?.getAttribute('href') ?? null,
    text: tr.querySelector('.tl')?.textContent
  }));
  document.querySelectorAll('[data-table="t1"] tbody .tl').forEach(a => a.click());
  await new Promise(r => setTimeout(r, 300));
  return {rows: out, executed: [...window.__x]};
});
const [bad, good, ext] = cells.rows;
check('three rows rendered', cells.rows.length === 3, JSON.stringify(cells.rows));
check('a javascript: row value does not reach href', bad && !/javascript/i.test(bad.tl || ''), JSON.stringify(bad));
check('a javascript: row value does not reach img src', bad && !/javascript/i.test(bad.ti || ''), JSON.stringify(bad));
check('the cell still shows its text', bad?.text === 'bad', JSON.stringify(bad));
check('a path row value is kept in href (as escaped text)', good?.tl === '/orders?id=2&x=a b', JSON.stringify(good));
check('an https link and a data:image src are kept', ext?.tl === 'https://example.com/a' && ext?.ti === 'data:image/png;base64,AAAA', JSON.stringify(ext));
check('a fixed template URL with a row value is kept', good?.tx === '/fixed?n=good', JSON.stringify(good));
check('clicking the cell links ran nothing', cells.executed.length === 0, JSON.stringify(cells.executed));

// --- row actions -------------------------------------------------------------------
console.log('row actions');
await setup();
const actions = await tab.evaluate(async () => {
  const rows = [...document.querySelectorAll('[data-table="t1"] tbody tr')];
  const click = (tr, cls) => tr.querySelector(`.btn.${cls}, [data-action="${cls}"]`)?.click();
  click(rows[0], 'blank');
  await new Promise(r => setTimeout(r, 300));
  click(rows[0], 'open');
  await new Promise(r => setTimeout(r, 400));
  const badOpened = [...window.__opened];
  const badExecuted = [...window.__x];
  click(rows[1], 'open');
  await new Promise(r => setTimeout(r, 300));
  click(rows[1], 'blank');
  await new Promise(r => setTimeout(r, 300));
  return {badOpened, badExecuted, routed: [...window.__routed], opened: [...window.__opened], location: location.href};
});
check('a javascript: row URL is not opened in a new window', !actions.badOpened.some(u => /javascript/i.test(u)), JSON.stringify(actions.badOpened));
check('a javascript: row URL does not run (_self and _blank)', actions.badExecuted.length === 0, JSON.stringify(actions.badExecuted));
check('the page did not navigate away', actions.location === origin + '/', actions.location);
check('a path row URL still navigates through the router', actions.routed.some(u => u.startsWith('/orders?id=2')), JSON.stringify(actions.routed));
check('a path row URL still opens with _blank', actions.opened.some(u => u.startsWith('/orders?id=2')), JSON.stringify(actions.opened));

// --- filter actions ------------------------------------------------------------------
console.log('filter actions');
await setup();
const filters = await tab.evaluate(async () => {
  const t = document.querySelector('[data-table="t1"]').closest('.table-container') || document;
  const found = {bad: !!t.querySelector('.fa-bad'), good: !!t.querySelector('.fa-good')};
  t.querySelector('.fa-bad')?.click();
  t.querySelector('.fa-badblank')?.click();
  await new Promise(r => setTimeout(r, 300));
  const badExecuted = [...window.__x];
  const badOpened = [...window.__opened];
  return {found, badExecuted, badOpened, location: location.href, goodHref: t.querySelector('.fa-good') ? 'present' : 'missing'};
});
check('a javascript: filter action does not run', filters.badExecuted.length === 0, JSON.stringify(filters.badExecuted));
check('a javascript: filter action is not opened', !filters.badOpened.some(u => /javascript/i.test(u)), JSON.stringify(filters.badOpened));
check('a filter action with a path is still there', filters.found.good, JSON.stringify(filters.found));

// --- menus ----------------------------------------------------------------------------
console.log('menus');
await setup();
const menu = await tab.evaluate(async () => {
  window.pwn = () => window.__x.push('pwn');
  const nav = document.createElement('nav');
  document.body.appendChild(nav);
  MenuManager.renderFromData(nav, [
    {title: 'bad', url: " \tjava\nscript:window.__x.push('menu-url')", data: {action: 'click:pwn', on: 'click:pwn', onLoad: 'pwn', component: 'api', apiUrl: '/x'}},
    {title: 'good', url: '/settings?a=1', data: {badge: '3'}},
    {title: 'mail', url: 'mailto:a@example.com'}
  ]);
  await new Promise(r => setTimeout(r, 200));
  const lis = [...nav.querySelectorAll(':scope > ul > li')];
  const out = lis.map(li => ({href: li.querySelector('a')?.getAttribute('href'), attrs: [...li.attributes].map(a => a.name + '=' + a.value)}));
  lis.forEach(li => {
    li.click();
    li.querySelector('a')?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  nav.remove();
  return {items: out, executed: [...window.__x]};
});
check('a javascript: menu url becomes #', menu.items[0]?.href === '#', JSON.stringify(menu.items[0]));
check('directive keys in item.data are not set', !menu.items[0]?.attrs.some(a => /^data-(action|on|on-load|component|api-url)=/.test(a)), JSON.stringify(menu.items[0]?.attrs));
check('clicking the menu ran nothing', menu.executed.length === 0, JSON.stringify(menu.executed));
check('a path menu url is kept', menu.items[1]?.href === '/settings?a=1', JSON.stringify(menu.items[1]));
check('a data-* name in config.html.dataAttributes is kept', menu.items[1]?.attrs.includes('data-badge=3'), JSON.stringify(menu.items[1]?.attrs));
check('a mailto: menu url is kept', menu.items[2]?.href === 'mailto:a@example.com', JSON.stringify(menu.items[2]));

// --- ModalDataBinder (pre-existing modal) ---------------------------------------------
console.log('ModalDataBinder');
await setup();
const bound = await tab.evaluate(async () => {
  document.getElementById('pm-open').click();
  await new Promise(r => setTimeout(r, 200));
  const out = {href: document.getElementById('pm-a').getAttribute('href'), src: document.getElementById('pm-img').getAttribute('src')};
  document.getElementById('pm-a').click();
  document.getElementById('pm2-open').click();
  await new Promise(r => setTimeout(r, 200));
  out.good = document.getElementById('pm2-a').getAttribute('href');
  await new Promise(r => setTimeout(r, 200));
  out.executed = [...window.__x];
  return out;
});
check('a bound javascript: link becomes #', bound.href === '#', JSON.stringify(bound));
check('a bound javascript: image src is not kept', !/javascript/i.test(bound.src || ''), JSON.stringify(bound));
check('a bound path link is kept', bound.good === '/orders/2', JSON.stringify(bound));
check('clicking the bound link ran nothing', bound.executed.length === 0, JSON.stringify(bound.executed));

// --- FileElementFactory existing files -------------------------------------------------
console.log('existing files');
await setup();
const files = await tab.evaluate(async () => {
  await Now.getManager('element').scan(document.querySelector('.f'));
  await new Promise(r => setTimeout(r, 300));
  const links = [...document.querySelectorAll('a.image-preview')];
  const out = {hrefs: links.map(a => a.getAttribute('href'))};
  out.bg = [...document.querySelectorAll('div.image-preview')].map(d => d.style.backgroundImage);
  links.forEach(a => a.click());
  await new Promise(r => setTimeout(r, 300));
  out.executed = [...window.__x];
  return out;
});
check('only the files with an allowed url are shown', files.hrefs.length === 1 && files.bg.length === 1, JSON.stringify(files));
check('an image url with ) and " stays one CSS url()', files.bg[0] === 'url("/files/we\\"ird).png")', JSON.stringify(files.bg));
check('a javascript: file url does not reach href', !files.hrefs.some(h => /javascript/i.test(h || '')), JSON.stringify(files.hrefs));
check('a path file url is kept', files.hrefs.includes('/files/ok.pdf'), JSON.stringify(files.hrefs));
check('clicking the file links ran nothing', files.executed.length === 0, JSON.stringify(files.executed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
