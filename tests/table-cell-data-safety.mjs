/**
 * Proof that what a row *holds* is what a cell *shows* — and that `data-if`
 * inside a cell template actually decides.
 *
 * **The bugs this pins down.**
 *
 * 1. `data-template` cells substituted `${field}` first and ran the template
 *    engines afterwards, so a stored value of `{{7*7}}` rendered as 49 and a
 *    stored `{LNG_Cancel}` came out translated. Nothing executed (the evaluator is
 *    sandboxed) but any user could put words into a table that the author never
 *    wrote. Values now go back into the finished HTML only.
 *
 * 2. `data-if` on an element inside a cell template never removed anything:
 *    TemplateManager hides asynchronously (it awaits the hide animation), and the
 *    cell HTML was read back before that. Every conditional button therefore
 *    showed on every row. It is decided synchronously now, against the row.
 *
 * 3. I18nManager's DOM observer translated `{LNG_...}` wherever it appeared,
 *    including in plain data cells. Data cells now carry `translate="no"`, which
 *    I18nManager honours for every element beneath it — the same attribute a
 *    template uses around any user-supplied text it renders.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

const ROWS = [
  {id: 1, title: 'plain title', note: 'note {{7*7}} and {LNG_Cancel}', can_edit: true, status: 'A'},
  {id: 2, title: '{LNG_Cancel} in a title', note: '<b>bold</b> & "quoted"', can_edit: false, status: 'B'},
  {id: 3, title: 'null flag', note: '', can_edit: null, status: 'C'},
];

const page = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0">
  <thead><tr>
    <th data-field="title">title</th>
    <th data-field="note" data-template="<span class='note'>\${note}</span><button class='edit' data-if='\${can_edit}'>{LNG_Edit}</button><button class='not-first' data-if='\${id != 1}'>x</button>"></th>
    <th data-field="status" data-template="<i class='st-\${status}'>{LNG_Status}</i>"></th>
  </tr></thead>
  <tbody></tbody>
</table>
<p id="verbatim" translate="no" data-text="user_text"></p>
<p id="normal" data-text="user_text"></p>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  // a non-English locale served from /translations/de.json (English is never translated)
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false},
    i18n: {enabled: true, defaultLocale: 'de', availableLocales: ['en', 'de'], observeDOM: true}});
  await I18nManager.setLocale('de', true);
  TemplateManager.processDataDirectives(document.body, {state: {user_text: '{LNG_Cancel}'}, data: {user_text: '{LNG_Cancel}'}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (url.pathname.endsWith('/de.json')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({Cancel: 'Abbrechen', Edit: 'Bearbeiten', Status: 'Zustand'}));
  }
  if (url.pathname === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ok: true, data: ROWS}));
  }
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
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
// the console line for a 404 does not name the URL; the response event does — keep only the latter
tab.on('console', m => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errors.push(m.text()));
tab.on('requestfailed', r => errors.push('requestfailed ' + r.url()));
tab.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.waitForFunction(() => document.querySelectorAll('[data-table="probe"] tbody tr').length === 3, {timeout: 5000});
// let the i18n DOM observer run over the freshly rendered rows
await new Promise(r => setTimeout(r, 600));

const got = await tab.evaluate(() => {
  const rows = Array.from(document.querySelectorAll('[data-table="probe"] tbody tr'));
  return rows.map(tr => ({
    title: tr.children[0].textContent,
    titleNoTranslate: tr.children[0].getAttribute('translate'),
    note: tr.querySelector('.note').textContent,
    noteHtml: tr.querySelector('.note').innerHTML,
    editButton: !!tr.querySelector('button.edit'),
    editLabel: tr.querySelector('button.edit') ? tr.querySelector('button.edit').textContent : null,
    notFirst: !!tr.querySelector('button.not-first'),
    statusClass: tr.querySelector('i').className,
    statusLabel: tr.querySelector('i').textContent,
  }));
});
const verbatim = await tab.$eval('#verbatim', el => el.textContent);
const normal = await tab.$eval('#normal', el => el.textContent);
await browser.close();
server.close();

const failures = [];
const check = (label, ok, detail) => { if (!ok) failures.push(label + (detail === undefined ? '' : ' → ' + JSON.stringify(detail))); };

// 1. plain data cells show exactly what the row holds, and are marked translate="no"
check('plain cell shows the stored {LNG_...} verbatim', got[1].title === '{LNG_Cancel} in a title', got[1].title);
check('plain cell is marked translate="no"', got[0].titleNoTranslate === 'no', got[0].titleNoTranslate);
// 2. template cells: row values are neither evaluated nor translated, and are escaped
check('template value {{7*7}} is not evaluated', got[0].note === 'note {{7*7}} and {LNG_Cancel}', got[0].note);
check('template value <b> is escaped, not parsed', got[1].noteHtml === '&lt;b&gt;bold&lt;/b&gt; &amp; "quoted"', got[1].noteHtml);
check('template value {LNG_} is not translated', got[0].note.includes('{LNG_Cancel}'), got[0].note);
// 3. the template's own {LNG_...} tokens are still translated
check('template-authored {LNG_Edit} is translated', got[0].editLabel === 'Bearbeiten', got[0].editLabel);
check('template-authored {LNG_Status} is translated', got[0].statusLabel === 'Zustand', got[0].statusLabel);
check('${status} inside a class attribute works', got[1].statusClass === 'st-B', got[1].statusClass);
// 4. data-if inside a cell decides per row
check('data-if="${can_edit}" true → button shown', got[0].editButton === true);
check('data-if="${can_edit}" false → button removed', got[1].editButton === false);
check('data-if="${can_edit}" null → button removed', got[2].editButton === false);
check('data-if="${id != 1}" → hidden on row 1 only', got[0].notFirst === false && got[1].notFirst === true && got[2].notFirst === true, got.map(g => g.notFirst));
// 5. translate="no" on data-text bindings
check('data-text inside translate="no" shows the value verbatim', verbatim === '{LNG_Cancel}', verbatim);
check('data-text elsewhere still translates (existing behaviour)', normal === 'Abbrechen', normal);
check('no page errors', errors.length === 0, errors);

if (failures.length) {
  console.error('FAIL\n  ' + failures.join('\n  '));
  process.exit(1);
}
console.log('ok — ' + (14 - failures.length) + ' checks passed');
