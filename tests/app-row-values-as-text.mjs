/**
 * Proof that the app code in js/ writes values from the server as text.
 *
 * 1. js/global.js formatTableOptionStatus (data-formatter of status columns in
 *    booking, eleave, borrow, parts, ...) built
 *      `<span class="status${index}" data-i18n>${label}</span>`
 *    into innerHTML. The label is the option text from the API or, for a value
 *    that is not one of the options, the row's own value — so either one ran as
 *    markup. Now the span is built with textContent; data-i18n stays, so an
 *    option label is still translated.
 *
 * 2. js/components/GallerySlideshow.js [data-gallery-widget] joined a.url,
 *    a.cover_url and a.topic of api/gallery/lists into innerHTML. A topic with a
 *    quote (Text::topic strips tags but not quotes) added attributes to the
 *    <img>. Now each card is built with DOM: the URLs pass
 *    SecurityManager.sanitizeUrl and the topic is text.
 *
 * Runs the real built bundles and the app files in a real browser against a
 * real HTTP server. nowjs has no js/global.js of its own, so the adminframework
 * copy is used. NOW_CORE / NOW_TABLE / APP_GLOBAL / APP_GALLERY=<path> run it
 * against other files.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const FILES = {
  '/core.js': process.env.NOW_CORE || '../Now/dist/now.core.min.js',
  '/table.js': process.env.NOW_TABLE || '../Now/dist/now.table.min.js',
  '/global.js': process.env.APP_GLOBAL || '../../adminframework/js/global.js',
  '/gallery.js': process.env.APP_GALLERY || '../js/components/GallerySlideshow.js'
};

const hook = name => `<img src=x onerror="window.__x.push('${name}')">`;
const ROWS = [
  {id: 1, status: '0'},
  {id: 2, status: '1'},
  {id: 3, status: '2'},
  {id: 4, status: hook('row-value')},
  {id: 5, status: '9" onmouseover="window.__x.push(\'row-attr\')'}
];
const OPTIONS = {status: {'0': 'Pending', '1': 'Approved', '2': hook('option-label')}};
const ALBUMS = [
  {id: 1, topic: 'Sea & "sun"', url: '/gallery/id/1', cover_url: '/cover1.png'},
  {id: 2, topic: 'x" onload="window.__x.push(\'topic-attr\')', url: '/gallery/id/2', cover_url: '/cover1.png'},
  {id: 3, topic: hook('topic-html'), url: 'javascript:window.__x.push("album-href")', cover_url: 'javascript:void 0'},
  {id: 4, topic: 'data', url: 'https://example.com/a', cover_url: 'data:image/png;base64,iVBORw0KGgo='}
];
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

const page = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0">
  <thead><tr>
    <th data-field="id">id</th>
    <th data-field="status" data-formatter="formatTableOptionStatus">Status</th>
  </tr></thead>
  <tbody></tbody>
</table>
<div id="albums" data-gallery-widget data-limit="4"></div>
<script>window.__x = []; window.WEB_URL = '/';</script>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script src="/global.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false},
    i18n: {enabled: true, defaultLocale: 'de', availableLocales: ['en', 'de'], observeDOM: true}});
  await I18nManager.setLocale('de', true);
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
<script src="/gallery.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = body => {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (FILES[url.pathname]) {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(FILES[url.pathname], 'utf8'));
  }
  if (url.pathname.endsWith('/de.json')) return json({Pending: 'Ausstehend', Approved: 'Genehmigt'});
  if (url.pathname === '/rows') return json({success: true, data: {data: ROWS, options: OPTIONS, meta: {total: ROWS.length}}});
  if (url.pathname === '/api/gallery/lists') return json({success: true, data: ALBUMS});
  if (url.pathname === '/cover1.png') {
    res.writeHead(200, {'Content-Type': 'image/png'});
    return res.end(PNG);
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
await tab.setRequestInterception(true);
tab.on('request', request => request.url().startsWith('http://127.0.0.1') || request.url().startsWith('data:')
  ? request.continue() : request.respond({status: 204, body: ''}));
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.waitForFunction(() => document.querySelectorAll('[data-table="probe"] tbody tr').length === 5, {timeout: 8000}).catch(() => null);
await tab.waitForFunction(() => document.querySelectorAll('#albums a').length > 0, {timeout: 5000}).catch(() => null);
// let the i18n DOM observer translate the rendered rows
await new Promise(r => setTimeout(r, 700));

const out = await tab.evaluate(async () => {
  const cells = [...document.querySelectorAll('[data-table="probe"] tbody tr')].map(tr => {
    const cell = tr.querySelector('td[data-field="status"]');
    const span = cell?.querySelector('span');
    return {
      id: tr.querySelector('td[data-field="id"]')?.textContent.trim(),
      cls: span?.className ?? null,
      text: span?.textContent ?? null,
      i18n: span?.hasAttribute('data-i18n') ?? false,
      elements: cell ? cell.querySelectorAll('*').length : 0
    };
  });
  const cards = [...document.querySelectorAll('#albums a.now-gallery-card')].map(a => ({
    href: a.getAttribute('href'),
    src: a.querySelector('img')?.getAttribute('src') ?? null,
    alt: a.querySelector('img')?.getAttribute('alt') ?? null,
    info: a.querySelector('.now-gallery-card-info')?.textContent ?? null,
    elements: a.querySelectorAll('*').length
  }));
  const onAttrs = [...document.querySelectorAll('body *')].flatMap(n => [...n.attributes].filter(a => /^on/i.test(a.name)).map(a => `${n.tagName} ${a.name}`));
  document.querySelectorAll('[data-table="probe"] tbody span, #albums *').forEach(n => n.dispatchEvent(new MouseEvent('mouseover', {bubbles: true})));
  await new Promise(r => setTimeout(r, 300));
  return {cells, cards, onAttrs, ran: [...window.__x]};
});

const cell = id => out.cells.find(c => c.id === String(id)) || {};
check('an option label is shown and translated (data-i18n kept)', cell(1).text === 'Ausstehend' && cell(1).cls === 'status0' && cell(1).i18n, JSON.stringify(cell(1)));
check('the second option gets the second status class', cell(2).text === 'Genehmigt' && cell(2).cls === 'status1', JSON.stringify(cell(2)));
check('an option label with markup is shown as text', cell(3).text === OPTIONS.status['2'] && cell(3).elements === 1, JSON.stringify(cell(3)));
check('a row value that is not an option is shown as text (status-1)', cell(4).text === ROWS[3].status && cell(4).cls === 'status-1' && cell(4).elements === 1, JSON.stringify(cell(4)));
check('a row value with a quote stays text', cell(5).text === ROWS[4].status && cell(5).elements === 1, JSON.stringify(cell(5)));

const card = i => out.cards[i] || {};
check('the widget shows a card per album', out.cards.length === 4, String(out.cards.length));
check('a topic with & and quotes is shown as it is, in the text and in alt',
  card(0).info === 'Sea & "sun"' && card(0).alt === 'Sea & "sun"' && card(0).href === '/gallery/id/1' && card(0).src === '/cover1.png', JSON.stringify(card(0)));
check('a topic with a quote adds no attribute to the <img>', card(1).alt === ALBUMS[1].topic && card(1).elements === 2, JSON.stringify(card(1)));
check('a topic with markup is text; javascript: url and cover are dropped',
  card(2).info === ALBUMS[2].topic && card(2).href === null && card(2).src === null && card(2).elements === 2, JSON.stringify(card(2)));
check('an https link and a data:image cover are kept', card(3).href === 'https://example.com/a' && card(3).src === ALBUMS[3].cover_url, JSON.stringify(card(3)));

check('no element got an on* attribute from the data', out.onAttrs.length === 0, out.onAttrs.join(', '));
check('no value ran script', out.ran.length === 0, JSON.stringify(out.ran));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
