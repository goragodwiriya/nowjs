/**
 * Proof that a table footer written in the page template keeps the spans of
 * its cells when a response is bound into it.
 *
 *   <table data-table="report" data-source="/rows" data-load-target="tfoot">
 *     <tfoot><tr><td colspan="2" class="right">Total</td><td data-text="options.total | number:2"></td></tr></tfoot>
 *
 * Binding the response into a data-load-target sanitizes that element against
 * an allow list of attributes per tag. td and th had no entry, so colspan and
 * rowspan were dropped on the first load: the label shrank to one column and
 * the total landed under the wrong column (loan creditors report). Now td/th
 * keep colspan · rowspan · headers (th also scope · abbr) and col/colgroup keep
 * span; event handlers are still removed.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_TABLE=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || new URL('../Now/dist/now.core.min.js', import.meta.url);
const TABLE = process.env.NOW_TABLE || new URL('../Now/dist/now.table.min.js', import.meta.url);

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="report" data-source="/rows" data-load-target="tfoot" data-url-params="false">
  <thead><tr><th data-field="day">Day</th><th data-field="name">Name</th><th data-field="amount" data-format="number:2">Amount</th></tr></thead>
  <tbody></tbody>
  <tfoot><tr><td colspan="2" class="right" onclick="window.__clicked = 1">Total</td><td id="total" data-text="options.total | number:2"></td></tr></tfoot>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  await TableManager.init();
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
    return res.end(readFileSync(path === '/core.js' ? CORE : TABLE, 'utf8'));
  }
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: [{id: 1, day: '2030-06-01', name: 'A', amount: 10}, {id: 2, day: '2030-06-02', name: 'B', amount: 20.5}],
      meta: {page: 1, pageSize: 25, total: 2}, options: {total: 30.5}}));
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
await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 1200));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const foot = await tab.evaluate(() => [...document.querySelectorAll('tfoot td')].map((td) => [td.colSpan, td.className, td.textContent.trim(), td.hasAttribute('onclick')]));
check('the response is bound into the footer', foot[1] && foot[1][2] === '30.50', JSON.stringify(foot));
check('the footer label keeps colspan="2" and its class', foot[0] && foot[0][0] === 2 && foot[0][1] === 'right', JSON.stringify(foot[0]));
check('an event handler attribute is still removed', foot[0] && foot[0][3] === false, JSON.stringify(foot[0]));
check('no JS errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
