/**
 * Proof that the label of a filter the table builds from a column header
 * follows the locale, and that data-unit puts a unit after the filter box.
 *
 *   label    without data-label the filter used the text of the header, which
 *            I18nManager had already translated: the label had no key left
 *            to translate again, so it kept the first locale ("แผนก" on an
 *            English page). It now takes the key the header text came from
 *            (data-i18n), or the label a generated header was built from.
 *   unit     data-unit="days" on the <th> (or unit in the columns of the
 *            response) → <span class="unit"> after the box, translated like
 *            the label. ElementFactory takes `unit` for any field it wraps.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const BUNDLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

const translations = {
  Department: 'แผนก', Status: 'สถานะ', 'Review from': 'ทบทวนตั้งแต่', days: 'วัน', Name: 'ชื่อ', Date: 'วันที่', 'Leave Request': 'ใบลา'
};

const boot = body => `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
${body}
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
})();
window.filters = () => [...document.querySelectorAll('.filter-control')].map(box => ({
  label: box.querySelector('label')?.textContent.trim(),
  unit: [...box.querySelectorAll('.form-control > .unit')].map(u => u.textContent.trim()).join('|'),
  unitAfterInput: !!box.querySelector('.form-control > input + .unit')
}));
</script>
</body></html>`;

const pages = {
  '/template': boot(`<table data-table="wf" data-source="/rows" data-page-size="10">
    <thead><tr>
      <th data-field="period" data-filter="true" data-type="daterange" data-range-names="from,to" data-hidden="true" data-i18n>{LNG_Date}</th>
      <th data-field="review_leaves" data-filter="true" data-type="number" data-min="1" data-unit="Leave Request" data-hidden="true" data-i18n>Review from</th>
      <th data-field="review_days" data-filter="true" data-type="number" data-step="0.5" data-unit="{LNG_days}" data-hidden="true" data-label="{LNG_Review from}">x</th>
      <th data-field="name" data-i18n>Name</th>
      <th data-field="department" data-filter="true" data-type="select" data-options='{"1":"A"}' data-i18n>{LNG_Department}</th>
      <th data-field="status" data-filter="true" data-type="select" data-options='{"1":"A"}' data-i18n>Status</th>
    </tr></thead><tbody></tbody></table>`),
  '/dynamic': boot(`<table data-table="dyn" data-source="/columns" data-page-size="10" data-dynamic-columns="true">
    <thead></thead><tbody></tbody></table>`)
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (pages[path]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[path]);
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(path === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (path.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(path.startsWith('/lang/th') ? translations : {}));
  }
  if (path === '/rows' || path === '/columns') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({
      success: true,
      data: [{id: 1, name: 'A', department: '1', status: '1', review_days: 2}],
      columns: path === '/columns' ? [
        {field: 'name', label: 'Name'},
        {field: 'review_days', label: 'Review from', filter: true, type: 'number', unit: 'days'},
        {field: 'department', label: 'Department', filter: true, type: 'select', options: {1: 'A'}}
      ] : undefined,
      meta: {total: 1}
    }));
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
const open = async url => {
  await tab.goto(base + url, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(400);
};
const switchTo = async locale => {
  await tab.evaluate(locale => I18nManager.setLocale(locale), locale);
  await sleep(300);
};
const show = list => JSON.stringify(list.map(f => f.unit ? `${f.label} [${f.unit}]` : f.label));

// ------------------------------------------------------------ headers in the template
await open('/template');
let filters = await tab.evaluate(() => window.filters());
check('labels start in the page locale (header text, data-i18n key, {LNG_} marker, data-label)',
  show(filters) === JSON.stringify(['วันที่', 'ทบทวนตั้งแต่ [ใบลา]', 'ทบทวนตั้งแต่ [วัน]', 'แผนก', 'สถานะ']), show(filters));
check('data-unit is a <span class="unit"> right after the input, inside the box',
  filters[1].unitAfterInput && filters[2].unitAfterInput && !filters[3].unit, JSON.stringify(filters.map(f => f.unitAfterInput)));

await switchTo('en');
filters = await tab.evaluate(() => window.filters());
check('after switching to English every label and unit is English (was: "แผนก" / "สถานะ" stayed Thai)',
  show(filters) === JSON.stringify(['Date', 'Review from [Leave Request]', 'Review from [days]', 'Department', 'Status']), show(filters));

await switchTo('th');
filters = await tab.evaluate(() => window.filters());
check('and back to Thai', show(filters) === JSON.stringify(['วันที่', 'ทบทวนตั้งแต่ [ใบลา]', 'ทบทวนตั้งแต่ [วัน]', 'แผนก', 'สถานะ']), show(filters));

// ------------------------------------------------------------ headers from the response (data-dynamic-columns)
await open('/dynamic');
filters = await tab.evaluate(() => window.filters());
check('columns of the response: label and unit in the page locale', show(filters) === JSON.stringify(['ทบทวนตั้งแต่ [วัน]', 'แผนก']), show(filters));
await switchTo('en');
filters = await tab.evaluate(() => window.filters());
check('columns of the response: both follow the locale', show(filters) === JSON.stringify(['Review from [days]', 'Department']), show(filters));

check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
