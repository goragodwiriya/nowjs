/**
 * Proof that a cell template formats a value with ${field|formatter:args},
 * through the same formatters as data-format, and escapes the result.
 *
 *   data-template="<a href='/run?id=${id}'>${month_date|date:MMMM YYYY}</a><small>${from|date} – ${to|date}</small>"
 *
 * A cell that joins several dates or amounts could only show them raw
 * (2031-01-01) or ask the server for text already formatted in one language.
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
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="runs" data-source="/rows">
  <thead><tr>
    <th data-field="month_date" data-template="<a href='/run?id=\${id}'>\${month_date|date:MMMM YYYY}</a><small>\${from|date} – \${to|date}</small>">Period</th>
    <th data-field="net" data-template="<b>\${net|number:2}</b> \${note|truncate:5}">Net</th>
    <th data-field="tags" data-each="tags" data-template="<i>\${at|date:D MMM}</i>">Days</th>
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
      {id: 7, month_date: '2031-01-01', from: '2031-01-01', to: '2031-01-31', net: 12345.5, note: '<b>bonus</b>', tags: [{at: '2031-01-05'}, {at: '2031-01-06'}]},
      {id: 8, month_date: '2031-02-01', from: '', to: '', net: 0, note: '', tags: []}
    ], meta: {total: 2}}}));
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

const rows = await tab.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => ({
  link: tr.querySelector('td[data-field="month_date"] a')?.textContent, href: tr.querySelector('td[data-field="month_date"] a')?.getAttribute('href'),
  range: tr.querySelector('td[data-field="month_date"] small')?.textContent,
  net: tr.querySelector('td[data-field="net"]')?.textContent.trim(), netHtml: tr.querySelector('td[data-field="net"]')?.innerHTML,
  days: [...tr.querySelectorAll('td[data-field="tags"] i')].map(i => i.textContent)
})));
check('${field|date:pattern} formats a date in the cell', rows[0].link === 'January 2031' && rows[0].href === '/run?id=7', JSON.stringify(rows[0]));
check('${field|date} uses the default pattern of the formatter', rows[0].range === '1 Jan 2031 – 31 Jan 2031', rows[0].range);
check('${field|number:2} and ${field|truncate:5} — the formatted value is escaped', /^12,345\.50 /.test(rows[0].net) && !/<b>bonus/.test(rows[0].netHtml.replace(/^<b>[^<]*<\/b>/, '')), rows[0].netHtml);
check('an empty value stays empty (no "Invalid date")', rows[1].range === ' – ', JSON.stringify(rows[1].range));
check('the pipe works inside data-each with the fields of the item', JSON.stringify(rows[0].days) === '["5 Jan","6 Jan"]', JSON.stringify(rows[0].days));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
