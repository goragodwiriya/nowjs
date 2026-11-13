/**
 * Proof that formatter arguments are parsed the same way everywhere
 * (Utils.string.parseFormatter): data-text pipes, data-format on a bound
 * element, and data-format on a table column.
 *
 * applyFormatters() used to split the expression on every colon, so
 * `datetime:D/M/YYYY HH:mm` lost everything after "HH" and the minutes were
 * never shown; a quoted pattern — the spelling the docs use, `date:'D MMM YYYY'`
 * — kept its quotes. Now a date formatter takes everything after its name as one
 * pattern, quotes are dropped, and a colon inside quotes belongs to the argument.
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
  <span id="pipe_time" data-text="created_at | datetime:YYYY-MM-DD HH:mm"></span>
  <span id="pipe_quoted" data-text="created_at | datetime:'YYYY-MM-DD HH:mm'"></span>
  <span id="pipe_date" data-text="created_at | date:'DD/MM/YYYY'"></span>
  <span id="pipe_only_time" data-text="created_at | time:HH:mm"></span>
  <span id="attr_time" data-text="created_at" data-format="datetime:DD/MM/YYYY HH:mm"></span>
  <span id="pipe_number" data-text="price | number:2"></span>
  <span id="pipe_currency" data-text="price | currency:USD:en-US:0"></span>
  <span id="pipe_default" data-text="missing | default:'n/a: none'"></span>
  <span id="pipe_chain" data-text="price | number:1 | default:'-'"></span>
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
    return res.end(JSON.stringify({success: true, data: {data: {created_at: '2026-10-10 06:15:00', price: 1234.5, missing: null}}}));
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

// 1. data-text on the page
await eq('data-text pipe: a pattern with a colon keeps its minutes', 'pipe_time', '2026-10-10 06:15');
await eq('data-text pipe: a quoted pattern, quotes dropped', 'pipe_quoted', '2026-10-10 06:15');
await eq('data-text pipe: date with a quoted pattern', 'pipe_date', '10/10/2026');
await eq('data-text pipe: time:HH:mm', 'pipe_only_time', '06:15');
await eq('data-format on a bound element: a pattern with a colon', 'attr_time', '10/10/2026 06:15');
await eq('number:2 is unchanged', 'pipe_number', '1,234.50');
check('currency:USD:en-US:0 still takes three arguments',
  /1,23[45]/.test(await text('pipe_currency')) && !/\.\d/.test(await text('pipe_currency')), await text('pipe_currency'));
await eq('a colon inside quotes belongs to the argument', 'pipe_default', 'n/a: none');
await eq('a chain of formatters still works', 'pipe_chain', '1,234.5');

// 2. The parser itself
const parsed = await tab.evaluate(() => ({
  plain: Utils.string.parseFormatter('uppercase'),
  number: Utils.string.parseFormatter('number:2'),
  currency: Utils.string.parseFormatter('currency:THB:th-TH:2'),
  date: Utils.string.parseFormatter('datetime:D MMM YYYY HH:mm:ss'),
  quoted: Utils.string.parseFormatter("default:'a:b':\"c\""),
  spaced: Utils.string.parseFormatter(' date : D/M/YYYY ')
}));
check('parseFormatter: no arguments', parsed.plain.name === 'uppercase' && parsed.plain.args.length === 0, JSON.stringify(parsed.plain));
check('parseFormatter: one argument', JSON.stringify(parsed.number) === '{"name":"number","args":["2"]}', JSON.stringify(parsed.number));
check('parseFormatter: several arguments', JSON.stringify(parsed.currency.args) === '["THB","th-TH","2"]', JSON.stringify(parsed.currency));
check('parseFormatter: a date pattern is one argument', JSON.stringify(parsed.date.args) === '["D MMM YYYY HH:mm:ss"]', JSON.stringify(parsed.date));
check('parseFormatter: quoted arguments', JSON.stringify(parsed.quoted.args) === '["a:b","c"]', JSON.stringify(parsed.quoted));
check('parseFormatter: the name is trimmed', parsed.spaced.name === 'date', JSON.stringify(parsed.spaced));

// 3. A table column uses the same parser
const cell = await tab.evaluate(() => ({
  quoted: TableManager.formatValue('2026-10-10 06:15:00', "datetime:'DD/MM/YYYY HH:mm'"),
  plain: TableManager.formatValue('2026-10-10 06:15:00', 'datetime:DD/MM/YYYY HH:mm')
}));
check('table data-format: a quoted pattern, quotes dropped', cell.quoted === '10/10/2026 06:15' && cell.plain === '10/10/2026 06:15', JSON.stringify(cell));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
