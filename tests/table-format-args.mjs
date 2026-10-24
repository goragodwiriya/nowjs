/**
 * Proof that a table column's data-format accepts arguments after a colon,
 * spelled the way data-text spells them (`number:2`, `date:D MMM YYYY` ...).
 *
 * formatValue() used to compare the whole string with the format names, so
 * `number:2` matched nothing and the raw value was shown with no warning.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const TABLE = process.env.NOW_TABLE || '../Now/dist/now.table.min.js';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0">
  <thead><tr>
    <th data-field="price" data-format="number:2">number:2</th>
    <th data-field="qty" data-format="number">number</th>
    <th data-field="explicit" data-format="number:2" data-decimals="0">explicit wins</th>
    <th data-field="rate" data-format="percent:1">percent:1</th>
    <th data-field="when" data-format="datetime:YYYY-MM-DD HH:mm">datetime with a colon in the pattern</th>
    <th data-field="day" data-format="date:DD/MM/YYYY">date</th>
    <th data-field="note" data-format="truncate:5">truncate</th>
    <th data-field="money" data-format="currency:USD:en-US:0">currency</th>
  </tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
})();
</script>
</body></html>`;

const rows = [{
  id: 1,
  price: 1234.5,
  qty: 7,
  explicit: 1234.4,
  rate: 12.345,
  when: '2026-10-10 06:15:00',
  day: '2026-10-10',
  note: 'abcdefghij',
  money: 1500
}];

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js' || req.url === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(req.url === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (req.url.startsWith('/rows')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ok: true, data: rows}));
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
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=en-US'],
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.waitForSelector('[data-table="probe"] tbody td');

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const cells = await tab.evaluate(() => {
  const out = {};
  document.querySelectorAll('[data-table="probe"] tbody tr:first-child td[data-field]').forEach(td => {
    out[td.dataset.field] = td.textContent.trim();
  });
  return out;
});
const eq = (name, field, expected) => check(name, cells[field] === expected, `got ${JSON.stringify(cells[field])}`);

eq('number:2 shows two decimals', 'price', '1,234.50');
eq('number without arguments keeps its default (0 decimals)', 'qty', '7');
eq('an explicit data-decimals wins over the argument', 'explicit', '1,234');
eq('percent:1 shows one decimal', 'rate', '12.3%');
eq('a date pattern that contains a colon is kept whole', 'when', '2026-10-10 06:15');
eq('date:pattern', 'day', '10/10/2026');
eq('truncate:5 (the length includes the ellipsis)', 'note', 'ab...');
check('currency:USD:en-US:0 uses the currency and no decimals', /1,500/.test(cells.money) && !/\.00/.test(cells.money) && /\$|USD/.test(cells.money), `got ${JSON.stringify(cells.money)}`);

const direct = await tab.evaluate(() => ({
  pass: TableManager.formatValue(2.5, 'number:3'),
  keep: TableManager.formatValue(2.5, 'number:3', {decimals: 1}),
  plain: TableManager.formatValue(2.5, 'number')
}));
check('formatValue() direct call: number:3', direct.pass === '2.500', `got ${JSON.stringify(direct.pass)}`);
check('formatValue() direct call: an option passed in wins', direct.keep === '2.5', `got ${JSON.stringify(direct.keep)}`);
check('formatValue() direct call: a plain name is unchanged', direct.plain === '3', `got ${JSON.stringify(direct.plain)}`);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
