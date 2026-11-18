/**
 * TableManager: what a row drop sends, and what a server export saves.
 *
 * Row sort (data-row-sortable + data-sort-url)
 * - The drop compared each row's data-id with d.id. An editable table's rows carry
 *   the internal "row_N" key and ids are numbers, so nothing matched: instance.data
 *   was emptied and the other pages of a client-side table were dropped. The order
 *   sent to the server carried "row_N" too.
 * - Now: rows are matched by their identity, only the shown page's slots are
 *   reordered, and the server gets the row's own id and its place in the whole list.
 *
 * Server export (data-export-url)
 * - It went through HttpClient, which reads a body by content type: an .xlsx came
 *   out corrupt, a CSV lost its BOM, a .json was parsed and saved as "[object Object]",
 *   and every export was requested twice. Now the file is fetched once as a blob and
 *   saved byte for byte, without page/pageSize/total in the query.
 *
 * Client export: CSV starts with a UTF-8 BOM; "excel" is written as CSV named .csv.
 *
 * Runs the real built bundles in a real browser (cd tests first). NOW_DIST overrides the bundle folder.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const DIST = (process.env.NOW_DIST || '../Now/dist').replace(/\/?$/, '/');

const ROWS = Array.from({length: 15}, (_, i) => ({id: i + 1, name: 'ไทย ' + (i + 1)}));
// Bytes no text decoding survives: a zip header, a NUL, invalid UTF-8
const BINARY = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0xff, 0xfe, 0x80, 0x41, 0x0a]);
const seen = [];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="rows" data-page-size="10" data-editable-rows="true" data-row-sortable="true" data-sort-url="/sort">
  <thead><tr><th data-field="id">id</th><th data-field="name">name</th></tr></thead>
  <tbody></tbody>
</table>
<table data-table="srv" data-source="/list" data-page-size="5" data-export-url="/export">
  <thead><tr><th data-field="name" data-filter="true">name</th></tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="rows"]'));
  TableManager.initTable(document.querySelector('[data-table="srv"]'));
  TableManager.setData('rows', ${JSON.stringify(ROWS)});
  window.__saved = [];
  TableManager.downloadBlob = async (blob, filename) => {
    const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
    window.__saved.push({filename, bytes});
  };
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (type, body, headers = {}) => {
    res.writeHead(200, {'Content-Type': type, ...headers});
    res.end(body);
  };
  // Feature bundles (Sortable): the core loads them from its own folder (Now.require)
  const feature = url.pathname.match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) return send(feature[2] === 'css' ? 'text/css' : 'application/javascript; charset=utf-8', readFileSync(DIST + feature[1], 'utf8'));
  if (url.pathname === '/') return send('text/html; charset=utf-8', page);
  if (url.pathname === '/core.js') return send('application/javascript; charset=utf-8', readFileSync(DIST + 'now.core.min.js', 'utf8'));
  if (url.pathname === '/table.js') return send('application/javascript; charset=utf-8', readFileSync(DIST + 'now.table.min.js', 'utf8'));
  if (url.pathname === '/list') {
    return send('application/json', JSON.stringify({success: true, data: {data: ROWS.slice(0, 5), meta: {page: 1, pageSize: 5, total: 15, totalPages: 3}}}));
  }
  if (url.pathname === '/sort') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      seen.push({path: '/sort', body: JSON.parse(body || '{}')});
      send('application/json', JSON.stringify({success: true, data: {}}));
    });
    return;
  }
  if (url.pathname === '/export') {
    seen.push({path: '/export', query: Object.fromEntries(url.searchParams)});
    const format = url.searchParams.get('format');
    if (format === 'excel') {
      return send('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', BINARY, {'Content-Disposition': 'attachment; filename="rows.xlsx"'});
    }
    if (format === 'csv') {
      return send('text/csv; charset=utf-8', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('name\nไทย\n')]), {'Content-Disposition': 'attachment; filename="rows.csv"'});
    }
    return send('application/json; charset=utf-8', JSON.stringify([{name: 'ไทย'}]), {'Content-Disposition': 'attachment; filename="rows.json"'});
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 400));

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};

// Drop row 3 on top of page 1
const after = await tab.evaluate(async () => {
  TableManager.enableRowSort('rows');
  const table = TableManager.state.tables.get('rows');
  for (let i = 0; i < 50 && !table.sortable; i++) await new Promise(r => setTimeout(r, 100));
  const tbody = table.element.tBodies[0];
  tbody.insertBefore(tbody.rows[2], tbody.rows[0]);
  await table.sortable.options.onEnd({});
  return table.data.map(d => d.id);
});
await new Promise(r => setTimeout(r, 300));
check('every row kept, the shown page reordered', after, [3, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
const sort = seen.find(s => s.path === '/sort');
check('order sent with the rows\' own ids and positions', sort?.body?.order?.slice(0, 4), [
  {id: 3, position: 0}, {id: 1, position: 1}, {id: 2, position: 2}, {id: 4, position: 3}
]);

// Server export: bytes saved as sent, one request per export, no paging params
for (const format of ['excel', 'csv', 'json']) {
  await tab.evaluate(f => TableManager.exportData('srv', f), format);
  await new Promise(r => setTimeout(r, 300));
}
const saved = await tab.evaluate(() => window.__saved);
const exports = seen.filter(s => s.path === '/export');
check('one request per export', exports.map(e => e.query.format), ['excel', 'csv', 'json']);
check('no page/pageSize/total in the export query', exports.some(e => ['page', 'pageSize', 'total', 'totalPages'].some(k => k in e.query)), false);
check('xlsx saved byte for byte', saved[0] && {name: saved[0].filename, bytes: saved[0].bytes}, {name: 'rows.xlsx', bytes: [...BINARY]});
check('server CSV keeps its BOM', saved[1]?.bytes.slice(0, 3), [0xef, 0xbb, 0xbf]);
check('json saved as the server wrote it', saved[2] && Buffer.from(saved[2].bytes).toString('utf8'), JSON.stringify([{name: 'ไทย'}]));

// Client export
await tab.evaluate(() => { window.__saved = []; });
await tab.evaluate(() => TableManager.exportData('rows', 'csv', {filename: 'a.csv'}));
await tab.evaluate(() => TableManager.exportData('rows', 'excel', {filename: 'b.xlsx'}));
await new Promise(r => setTimeout(r, 300));
const client = await tab.evaluate(() => window.__saved.map(s => ({name: s.filename, bom: s.bytes.slice(0, 3)})));
check('client CSV starts with a BOM', client[0], {name: 'a.csv', bom: [0xef, 0xbb, 0xbf]});
check('client "excel" is saved as .csv', client[1]?.name, 'b.csv');

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}
await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
