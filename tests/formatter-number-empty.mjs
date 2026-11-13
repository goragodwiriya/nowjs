/**
 * Proof that the number formatters of data-text leave a value that is not a
 * number as it is.
 *
 * `x | number:2` used to run Number(x).toLocaleString(): a missing value showed
 * 0.00 (null) or NaN (undefined — every binding before its data arrives, and a
 * field the response leaves out), and a stand-in such as '-' showed NaN. A
 * reconciliation card with no statement balance entered yet read "Difference
 * 0.00", which means the books agree. A table cell with data-format="number:2"
 * already showed such a value empty (TableManager.formatValue). Now number,
 * currency and percent format finite numbers and numeric strings only, so
 * `x | number:2 | default:'-'` and `x == null ? '-' : x | number:2` work.
 * `x | bytes` (1536 → 1.5 KB) is the byte formatter of a table cell
 * (data-format="bytes") for data-text, with the same rule.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || new URL('../Now/dist/now.core.min.js', import.meta.url);
const TABLE = process.env.NOW_TABLE || new URL('../Now/dist/now.table.min.js', import.meta.url);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="t" data-validate="false" data-load-api="/load">
  <span id="null_number" data-text="balance | number:2"></span>
  <span id="missing_number" data-text="nothing | number:2"></span>
  <span id="empty_number" data-text="blank | number:2"></span>
  <span id="null_default" data-text="balance | number:2 | default:'-'"></span>
  <span id="null_ternary" data-text="balance == null ? '-' : balance | number:2"></span>
  <span id="value_ternary" data-text="price == null ? '-' : price | number:2"></span>
  <span id="zero_number" data-text="zero | number:2"></span>
  <span id="price_number" data-text="price | number:2"></span>
  <span id="string_number" data-text="numeric | number:2"></span>
  <span id="null_currency" data-text="balance | currency"></span>
  <span id="price_currency" data-text="price | currency"></span>
  <span id="null_percent" data-text="balance | percent"></span>
  <span id="rate_percent" data-text="rate | percent"></span>
  <span id="size_bytes" data-text="size | bytes"></span>
  <span id="null_bytes" data-text="balance | bytes"></span>
  <span id="null_bytes_default" data-text="balance | bytes | default:'-'"></span>
</form>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
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
  if (req.url.startsWith('/load')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: {
      balance: null, blank: '', zero: 0, price: 1234.5, numeric: '1234.5', rate: 0.25, size: 1536
    }}}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(404);
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
await new Promise(r => setTimeout(r, 500));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const text = id => tab.evaluate(i => document.getElementById(i).textContent.trim(), id);
const eq = async (name, id, expected) => {
  const actual = await text(id);
  check(name, actual === expected, `got ${JSON.stringify(actual)}`);
};

// 1. A value that is not there stays empty (was 0.00 / NaN)
await eq('null | number:2 is empty', 'null_number', '');
await eq('a field the response leaves out | number:2 is empty', 'missing_number', '');
await eq("'' | number:2 is empty", 'empty_number', '');
await eq('null | currency is empty', 'null_currency', '');
await eq('null | percent is empty', 'null_percent', '');

// 2. A stand-in for a missing value
await eq("null | number:2 | default:'-' shows -", 'null_default', '-');
await eq("x == null ? '-' : x | number:2 shows - for null", 'null_ternary', '-');
await eq("x == null ? '-' : x | number:2 formats a number", 'value_ternary', '1,234.50');

// 3. Numbers are formatted as before
await eq('0 | number:2 is 0.00 (zero is a number)', 'zero_number', '0.00');
await eq('1234.5 | number:2', 'price_number', '1,234.50');
await eq("a numeric string '1234.5' | number:2", 'string_number', '1,234.50');
await eq('1234.5 | currency', 'price_currency', '1,234.50');
await eq('0.25 | percent', 'rate_percent', '25%');
await eq('1536 | bytes (the byte formatter of a table cell, for data-text)', 'size_bytes', '1.5 KB');
await eq('null | bytes is empty', 'null_bytes', '');
await eq("null | bytes | default:'-' shows -", 'null_bytes_default', '-');

// 4. The formatter on its own (Utils.string.applyFormatters)
const direct = await tab.evaluate(() => ({
  undef: Utils.string.applyFormatters(undefined, ['number:2'], {}),
  dash: Utils.string.applyFormatters('-', ['number:2'], {}),
  bool: Utils.string.applyFormatters(true, ['number'], {}),
  num: Utils.string.applyFormatters(7, ['number:1'], {})
}));
check('applyFormatters: undefined, "-" and true pass through · 7 → 7.0',
  direct.undef === undefined && direct.dash === '-' && direct.bool === true && direct.num === '7.0', JSON.stringify(direct));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
