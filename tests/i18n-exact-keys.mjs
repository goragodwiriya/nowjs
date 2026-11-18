/**
 * Proof that translation keys match exactly, character for character, in every
 * case: "save" and "SAVE" are not translated by a catalog that holds "Save".
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 *
 * Keys that differ only by case are kept out of the catalog when it is saved
 * (the language editor and import treat them as one key) — lookups never fold
 * case, so the text a page asks for is the text the catalog was written with.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const TABLE = '../Now/dist/now.table.min.js';

const translations = {
  Save: 'บันทึก',
  'Leave Request': 'ใบลา',
  'No.': 'เลขที่',
  active: 'ใช้งาน',
  menu: {Home: 'หน้าแรก'}
};

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<span id="exact" data-i18n>Save</span>
<span id="lower" data-i18n>save</span>
<span id="upper" data-i18n>SAVE</span>
<span id="sentence" data-i18n>leave request</span>
<span id="attr" title="{LNG_LEAVE REQUEST}">x</span>
<span id="attr-exact" title="{LNG_Leave Request}">x</span>
<table data-table="probe" data-source="/rows" data-page-size="0">
  <thead><tr><th data-field="status" data-template="<span>{LNG_\${status}}</span>">status</th></tr></thead>
  <tbody></tbody>
</table>
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
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
</body></html>`;

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
    return res.end(JSON.stringify({ok: true, data: [{id: 1, status: 'active'}, {id: 2, status: 'ACTIVE'}]}));
  }
  res.writeHead(req.url === '/favicon.ico' ? 204 : 404);
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
const t = key => tab.evaluate(k => Now.translate(k), key);
const text = id => tab.evaluate(x => document.getElementById(x).textContent, id);
const title = id => tab.evaluate(x => document.getElementById(x).getAttribute('title'), id);

// 1. The key as written is translated
eq('translate("Save")', await t('Save'), 'บันทึก');
eq('translate("Leave Request")', await t('Leave Request'), 'ใบลา');
eq('translate("No.") — a dotted single word', await t('No.'), 'เลขที่');
eq('translate("menu.Home") — a dotted path', await t('menu.Home'), 'หน้าแรก');

// 2. Another case is another key — never translated
eq('translate("save") is not "Save"', await t('save'), 'save');
eq('translate("SAVE") is not "Save"', await t('SAVE'), 'SAVE');
eq('a sentence key in another case', await t('leave REQUEST'), 'leave REQUEST');
eq('a dotted single word in another case', await t('no.'), 'no.');
eq('a dotted path in another case', await t('MENU.home'), 'MENU.home');
eq('hasTranslation("SAVE") is false', await tab.evaluate(() => I18nManager.hasTranslation('SAVE')), false);

// 3. Through the DOM
eq('data-i18n "Save"', await text('exact'), 'บันทึก');
eq('data-i18n "save" stays', await text('lower'), 'save');
eq('data-i18n "SAVE" stays', await text('upper'), 'SAVE');
eq('data-i18n sentence in lower case stays', await text('sentence'), 'leave request');
eq('{LNG_...} in an attribute, exact', await title('attr-exact'), 'ใบลา');
eq('{LNG_...} in an attribute, other case', await title('attr'), 'LEAVE REQUEST');
const cells = await tab.evaluate(() => [...document.querySelectorAll('[data-table="probe"] tbody td')].map(td => td.textContent));
eq('table {LNG_${field}}: row value "active"', cells[0], 'ใช้งาน');
eq('table {LNG_${field}}: row value "ACTIVE" stays', cells[1], 'ACTIVE');

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
