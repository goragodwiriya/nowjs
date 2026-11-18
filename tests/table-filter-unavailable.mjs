/**
 * Proof that a filter the response turns off (`filters: {field: false}`) is
 * hidden, and comes back when a later response offers options again.
 *
 * The case: a report a manager filters by employee and department, while a
 * staff member sees only their own rows. The same page and the same columns
 * serve both; the API says which filters the viewer can use, and sends data
 * only (no HTML, no per-viewer column templates).
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const BUNDLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

let staff = true;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="balance" data-source="/rows" data-page-size="10">
  <thead><tr>
    <th data-field="year" data-filter="true" data-type="select" data-show-all="false" data-hidden="true">Year</th>
    <th data-field="member_id" data-filter="true" data-type="select" data-template="\${member_name}">Employee</th>
    <th data-field="department" data-filter="true" data-type="select" data-template="\${department_name}">Department</th>
    <th data-field="leave_topic">Leave type</th>
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
window.shown = () => Object.fromEntries(['year', 'member_id', 'department'].map(field => {
  const el = document.getElementById('filter_' + field + '_balance');
  const box = el && el.closest('.filter-control');
  return [field, !!box && box.offsetParent !== null ? [...el.options].map(o => o.value).join(',') : null];
}));
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
    return res.end(JSON.stringify({
      success: true,
      // A staff member's own rows: two leave types, one department
      data: [
        {member_id: 7, member_name: 'Mintra', department: '1', department_name: 'Sales', leave_topic: 'Sick'},
        {member_id: 7, member_name: 'Mintra', department: '1', department_name: 'Sales', leave_topic: 'Personal'}
      ],
      filters: {
        year: [{value: '2026', text: '2026'}],
        member_id: staff ? false : [{value: '7', text: 'Mintra'}, {value: '8', text: 'Arisa'}],
        department: staff ? false : [{value: '1', text: 'Sales'}, {value: '2', text: 'HR'}]
      },
      meta: {total: 2, year: 2026}
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
tab.on('console', m => ['error', 'warn'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await sleep(400);

let shown = await tab.evaluate(() => window.shown());
check('filters: {member_id: false, department: false} hides those two controls', shown.member_id === null && shown.department === null, JSON.stringify(shown));
check('the other filters stay (year)', shown.year === '2026', JSON.stringify(shown));
const rows = await tab.evaluate(() => [...document.querySelectorAll('[data-table="balance"] tbody tr')].map(tr => tr.querySelector('td').textContent.trim()));
check('the columns still show the data of the rows', rows.join() === 'Mintra,Mintra', JSON.stringify(rows));
check('no options were made up from the rows for a filter turned off', await tab.evaluate(() => {
  const el = document.getElementById('filter_member_id_balance');
  return [...el.options].every(o => o.value !== '7');
}));

// The viewer may now use them (another response, same page): they come back
staff = false;
await tab.evaluate(() => TableManager.loadTableData('balance'));
await sleep(500);
shown = await tab.evaluate(() => window.shown());
check('a later response with options shows them again, with an "All" option first', shown.member_id === ',7,8' && shown.department === ',1,2', JSON.stringify(shown));

staff = true;
await tab.evaluate(() => TableManager.loadTableData('balance'));
await sleep(500);
shown = await tab.evaluate(() => window.shown());
check('and false hides them again', shown.member_id === null && shown.department === null, JSON.stringify(shown));

check('no errors or warnings on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
