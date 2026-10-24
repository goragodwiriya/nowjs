/**
 * Proof that I18nManager.interpolate() only touches what it is asked to.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/I18nManager.md → "Brace rules":
 * `{LNG_xxx}` is the only marker searched for, `{name}` is replaced only when the
 * caller passed it, and every other `{...}` is left as written.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const TABLE = '../Now/dist/now.table.min.js';

const translations = {
  Guest: 'ผู้มาเยือน',
  Level: 'ระดับ',
  Active: 'ใช้งาน',
  'Selected {count} rows': 'เลือก {count} รายการ',
  'Go to page {page}': 'ไปที่หน้า {page}',
  YEAR_OFFSET: 543,
  DATE_SHORT: ['อา.', 'จ.']
};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0" data-show-caption="true">
  <thead><tr>
    <th data-field="plain">plain</th>
    <th data-field="fmt" data-formatter="asText">formatter</th>
    <th data-field="key" data-template="<span data-i18n>\${key}</span>">data-i18n</th>
    <th data-field="level" data-format="lookup" data-filter="true" data-type="select">lookup</th>
    <th data-field="kind" data-format="lookup" data-options='{"g":"Guest"}'>lookup-object</th>
    <th data-field="none" data-format="lookup" data-options='{"x":"X"}'>lookup-miss</th>
    <th data-field="htmlOpt" data-template="\${htmlOpt}">html i18n (template)</th>
    <th data-field="htmlRaw" data-template="\${htmlRaw}">html no flag (template)</th>
    <th data-field="htmlDef">html i18n (plain column)</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.asText = (cell, value) => { cell.textContent = value; };
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false, auth: {enabled: false},
    paths: {translations: '/lang'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['en', 'th']}
  });
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
</body></html>`;

const rows = [{
  id: 1,
  plain: '{"a":1} {LNG_Guest}',
  fmt: '{"a":1} {LNG_Guest} {{7*7}} {Guest}',
  key: '{"a":1}',
  level: 2,
  kind: 'g',
  none: '{LNG_Guest}',
  htmlOpt: {html: '<span title="{LNG_Guest}">{LNG_Guest} {"a":1}</span>', i18n: true},
  htmlRaw: {html: '<span title="{LNG_Guest}">{LNG_Guest}</span>'},
  htmlDef: {html: '<b>{LNG_Guest}</b>', i18n: true}
}];
const levelOptions = [{value: 1, text: '{LNG_Level} 1'}, {value: 2, text: '{LNG_Level} 2'}];

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js' || req.url === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(req.url === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (req.url.startsWith('/lang/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify(req.url.startsWith('/lang/th') ? translations : {}));
  }
  if (req.url.startsWith('/rows')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ok: true, data: rows, options: {level: levelOptions}, filters: {level: levelOptions}}));
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
await tab.waitForSelector('[data-table="probe"] tbody td');
await new Promise(r => setTimeout(r, 300)); // let the i18n DOM observer's debounce run

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}`);

const t = (key, params) => tab.evaluate((k, p) => Now.translate(k, p), key, params);
const i = (text, params) => tab.evaluate((x, p) => I18nManager.interpolate(x, p), text, params);

// 1. The two things interpolate is for still work
eq('{LNG_x} is translated', await i('{LNG_Guest}'), 'ผู้มาเยือน');
eq('a param the caller passed is substituted', await t('Selected {count} rows', {count: 3}), 'เลือก 3 รายการ');
eq('a catalog key with a param', await t('Go to page {page}', {page: 7}), 'ไปที่หน้า 7');
eq('LNG then param, in one string', await i('{LNG_Guest} {n}', {n: 2}), 'ผู้มาเยือน 2');

// 2. Everything else is left as written
eq('JSON beside an LNG marker keeps its braces', await i('{"a":1} {LNG_Guest}'), '{"a":1} ผู้มาเยือน');
eq('a template expression is not mangled', await i('{{7*7}}'), '{{7*7}}');
eq('a bare {Key} is no longer looked up in the catalog', await i('{Guest}'), '{Guest}');
eq('a missing param stays visible', await t('Selected {count} rows'), 'เลือก {count} รายการ');
eq('an unknown LNG key shows its own name', await i('{LNG_Nope}'), 'Nope');
eq('a param value is inserted verbatim, not scanned', await i('{v}', {v: '{LNG_Guest}'}), '{LNG_Guest}');
eq('a param set to undefined is treated as not passed', await i('{v}', {v: undefined}), '{v}');
eq('translate() of data with braces returns it unchanged', await t('{"a":1}'), '{"a":1}');

// 2b. Only the catalog's own entries are keys. Names Object.prototype carries used
//     to resolve to built-ins: {LNG___proto__} showed "[object Object]",
//     {LNG_toString} showed function source, and translate('constructor') threw.
const ts = key => tab.evaluate(k => { try { return Now.translate(k); } catch (e) { return 'THROW ' + e.message; } }, key);
eq('{LNG___proto__} shows its own name', await i('{LNG___proto__}'), '__proto__');
eq('{LNG_toString} shows its own name', await i('{LNG_toString}'), 'toString');
eq('{LNG_constructor} beside text shows its own name', await i('{LNG_constructor} x'), 'constructor x');
eq('translate("constructor") returns the text', await ts('constructor'), 'constructor');
eq('translate("__proto__") returns the text', await ts('__proto__'), '__proto__');
eq('translate("Guest.toString") as a dotted path returns the text', await ts('Guest.toString'), 'Guest.toString');
eq('hasTranslation("toString") is false', await tab.evaluate(() => I18nManager.hasTranslation('toString')), false);
eq('hasTranslation("Guest") is still true', await tab.evaluate(() => I18nManager.hasTranslation('Guest')), true);
// own entries that are not text keep working
eq('{LNG_YEAR_OFFSET} (a number) is still inserted', await i('{LNG_YEAR_OFFSET}'), '543');
eq('translate("YEAR_OFFSET") (a number) returns it as text', await ts('YEAR_OFFSET'), '543');
eq('translate("DATE_SHORT") (a list) returns the key, not a throw', await ts('DATE_SHORT'), 'DATE_SHORT');

// 3. The same through the DOM, where row data meets the observer
const cells = await tab.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-table="probe"] tbody td').forEach(td => { out[td.dataset.field] = td.textContent; });
  return out;
});
eq('plain data cell (translate="no") is untouched', cells.plain, '{"a":1} {LNG_Guest}');
eq('formatter cell: observer translates {LNG_x}, leaves the rest', cells.fmt, '{"a":1} ผู้มาเยือน {{7*7}} {Guest}');
eq('data-i18n around a value with braces keeps them', cells.key, '{"a":1}');

// 3b. data-format="lookup": the option label is a catalog string, so its {LNG_x} is resolved
//     (the filter select shows the same option translated); a plain label and a raw value are not
eq('lookup: {LNG_x} in an option label is translated', cells.level, 'ระดับ 2');
eq('lookup: a plain label is shown as written, not looked up as a key', cells.kind, 'Guest');
eq('lookup: a row value that matches no option is returned untouched', cells.none, '{LNG_Guest}');
const filterText = await tab.evaluate(() => {
  const sel = Array.from(document.querySelectorAll('select')).find(s => Array.from(s.options).some(o => o.value === '2'));
  return sel ? Array.from(sel.options).find(o => o.value === '2').text : Array.from(document.querySelectorAll('select')).map(s => s.outerHTML.slice(0, 80));
});
eq('lookup and its filter select agree', filterText, 'ระดับ 2');

// 3c. {html, i18n: true}: server-composed markup carrying {LNG_x} is translated on the client,
//     text and attributes alike, in a template column and a plain one; without the flag the
//     template column shows the markup as it came
const html = await tab.evaluate(() => {
  const td = f => document.querySelector(`[data-table="probe"] tbody td[data-field="${f}"]`);
  return {
    opt: td('htmlOpt').textContent, optTitle: td('htmlOpt').querySelector('span')?.getAttribute('title'),
    raw: td('htmlRaw').textContent, rawTitle: td('htmlRaw').querySelector('span')?.getAttribute('title'),
    def: td('htmlDef').innerHTML, defNo: td('htmlDef').getAttribute('translate')
  };
});
eq('{html, i18n:true} in a template column: text translated, other braces kept', html.opt, 'ผู้มาเยือน {"a":1}');
eq('{html, i18n:true}: attributes translated too', html.optTitle, 'ผู้มาเยือน');
eq('{html} without the flag in a template column stays as it came', html.raw, '{LNG_Guest}');
eq('{html} without the flag: attribute untouched as well', html.rawTitle, '{LNG_Guest}');
eq('{html, i18n:true} in a plain column: markup kept, marker translated', html.def, '<b>ผู้มาเยือน</b>');
eq('{html, i18n:true} in a plain column is marked translate="no"', html.defNo, 'no');

// 3d. Switching locale re-renders from the raw value, so the html cell follows the UI language
await tab.evaluate(() => I18nManager.setLocale('en'));
await new Promise(r => setTimeout(r, 600));
const after = await tab.evaluate(() => ({
  opt: document.querySelector('[data-table="probe"] tbody td[data-field="htmlOpt"]').textContent,
  level: document.querySelector('[data-table="probe"] tbody td[data-field="level"]').textContent
}));
eq('{html, i18n:true} follows a locale switch without a request', after.opt, 'Guest {"a":1}');
eq('lookup follows a locale switch too', after.level, 'Level 2');
await tab.evaluate(() => I18nManager.setLocale('th'));
await new Promise(r => setTimeout(r, 600));

// 4. The caption: the visitor's search term is HTML-escaped and is not scanned for params
const caption = await tab.evaluate(async () => {
  window.__xss = false;
  const t = TableManager.state.tables.get('probe');
  t.config.params.search = '<img src=x onerror="window.__xss=true"> {count}';
  TableManager.updateTableCaption(t, 5, 1);
  await new Promise(r => setTimeout(r, 100));
  const c = document.querySelector('[data-table="probe"] caption');
  return {html: c.innerHTML, strong: c.querySelector('strong')?.textContent, img: !!c.querySelector('img'), xss: window.__xss};
});
check('caption: search term is escaped, no element is created', !caption.img && !caption.xss, caption.html);
eq('caption: a {count} typed by the visitor is shown, not substituted', caption.strong, '<img src=x onerror="window.__xss=true"> {count}');

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
