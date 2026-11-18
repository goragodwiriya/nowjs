/**
 * Proof that data-empty-text on a column header is shown for a null value,
 * that data-load-target takes several comma-separated targets, and that a
 * select in a load target fills from the options of the response.
 *
 * A cell whose value is null or undefined skips its template and shows the
 * column's empty text. The renderer read attributes.emptyText, and generated
 * headers wrote data-empty-text, but the column definitions never read the
 * attribute from the header, so the cell stayed blank ("people" of a role that
 * is not counted showed nothing instead of "-").
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const BUNDLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<p id="top"><span data-text="options.total"></span></p>
<table data-table="roles" data-source="/rows" data-load-target="#top, #bottom, #side">
  <thead><tr>
    <th data-field="role">Role</th>
    <th data-field="count" data-empty-text="-" data-template="\${count} people">People</th>
    <th data-field="note">Note</th>
  </tr></thead>
  <tbody></tbody>
</table>
<p id="bottom"><span data-text="options.total + ' roles'"></span></p>
<form id="side"><select id="pick" data-options-key="kinds"></select></form>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(path === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: [
      {id: 1, role: 'HR', count: 2, note: 'x'},
      {id: 2, role: 'Applicant', count: null, note: null}
    ], options: {total: 2, kinds: [{value: 'a', text: 'Alpha'}, {value: 'b', text: 'Beta'}]}, meta: {total: 2}}}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 400));

const rows = await tab.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())));
check('a value goes through the template', rows[0][1] === '2 people', JSON.stringify(rows[0]));
check('null shows data-empty-text of the header (was: blank)', rows[1][1] === '-', JSON.stringify(rows[1]));
check('a column without data-empty-text stays blank for null', rows[1][2] === '', JSON.stringify(rows[1]));
const targets = await tab.evaluate(() => [document.querySelector('#top').textContent.trim(), document.querySelector('#bottom').textContent.trim()]);
check('data-load-target with two selectors binds the response into both', targets[0] === '2' && targets[1] === '2 roles', JSON.stringify(targets));
const picked = await tab.evaluate(() => [...document.querySelectorAll('#pick option')].map(o => o.value + ':' + o.textContent));
check('a select in a load target takes its options from the response (data-options-key)', JSON.stringify(picked) === '["a:Alpha","b:Beta"]', JSON.stringify(picked));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
