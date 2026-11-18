/**
 * Proof that data-cell-disabled on a column header disables the control of the
 * rows whose field says so, that a control left enabled still posts its change
 * to data-action-url, and that the documented settings of a cell control
 * (data-allow-empty, data-read-only, data-disabled) reach it.
 *
 *   <th data-field="status" data-cell-element="select" data-options-key="statuses" data-cell-disabled="!can_mark">
 *
 * A status the viewer may change on some rows only (a task of another team)
 * used to need a script that drew the table: a header could only disable the
 * control of every row. The settings of the control were read from the column
 * definition, but no header attribute was ever copied into it: data-read-only
 * and data-disabled on a header did nothing.
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
<table data-table="tasks" data-source="/rows" data-action-url="/action">
  <thead><tr>
    <th data-field="name">Task</th>
    <th data-field="status" data-cell-element="select" data-options-key="statuses" data-allow-empty="false" data-cell-disabled="!can_mark">Status</th>
    <th data-field="note" data-cell-element="text" data-cell-disabled="locked">Note</th>
    <th data-field="code" data-cell-element="text" data-read-only="true">Code</th>
    <th data-field="kind" data-cell-element="select" data-options-key="statuses" data-disabled="true">Kind</th>
  </tr></thead>
  <tbody></tbody>
</table>
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

const posted = [];
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
      {id: 1, name: 'Mine', status: '0', can_mark: true, note: 'a', locked: false, code: 'T-1', kind: '1'},
      {id: 2, name: 'Other team', status: '2', can_mark: false, note: 'b', locked: true, code: 'T-2', kind: '1'}
    ], options: {statuses: [{value: '0', text: 'Waiting'}, {value: '1', text: 'Doing'}, {value: '2', text: 'Done'}]}, meta: {total: 2}}}));
  }
  if (path === '/action') {
    let body = '';
    req.on('data', c => body += c);
    return req.on('end', () => {
      posted.push(body);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, message: 'Saved', data: {}}));
    });
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

const cells = await tab.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => {
  const select = tr.querySelector('td[data-field="status"] select');
  const input = tr.querySelector('td[data-field="note"] input');
  return {value: select?.value, disabled: select?.disabled, noteDisabled: input?.disabled};
}));
check('"!can_mark": the row that may be marked has an enabled select with its value', cells[0]?.disabled === false && cells[0]?.value === '0', JSON.stringify(cells[0]));
check('"!can_mark": the row of another team shows its value in a disabled select', cells[1]?.disabled === true && cells[1]?.value === '2', JSON.stringify(cells[1]));
check('"locked" (no !): disabled when the field is true only', cells[0]?.noteDisabled === false && cells[1]?.noteDisabled === true, JSON.stringify(cells.map(c => c.noteDisabled)));
const settings = await tab.evaluate(() => {
  const tr = document.querySelector('tbody tr[data-id="1"]');
  const values = (field) => [...tr.querySelector(`td[data-field="${field}"] select`).options].map(o => o.value);
  return {status: values('status'), codeReadOnly: tr.querySelector('td[data-field="code"] input').readOnly,
    kindDisabled: tr.querySelector('td[data-field="kind"] select').disabled};
});
check('a select with data-allow-empty="false" offers only the options of its key', JSON.stringify(settings.status) === '["0","1","2"]', JSON.stringify(settings));
check('data-read-only and data-disabled reach the control of every row (were: ignored)', settings.codeReadOnly === true && settings.kindDisabled === true, JSON.stringify(settings));

await tab.evaluate(() => {
  const select = document.querySelector('tbody tr[data-id="1"] td[data-field="status"] select');
  select.value = '2';
  select.dispatchEvent(new Event('change', {bubbles: true}));
});
await new Promise(r => setTimeout(r, 600));
const sent = posted[0] || '';
let body = {};
try {body = JSON.parse(sent);} catch (e) { /* not JSON */ }
check('an enabled select posts its change to data-action-url (action update · field · ids · value)',
  body.action === 'update' && body.field === 'status' && String(Object.values(body.ids || {})[0]) === '1' && String(body.value) === '2', sent);
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
