/**
 * data-row-actions: `condition` on a submenu item decides per row, like a top-level one.
 *
 * It was read only on the top level, so "Delete" inside an "Actions" dropdown with
 * a condition still showed on every row. Now each submenu item is checked against
 * its row, and a dropdown left with no item for a row is not built at all.
 *
 * Runs the real built bundles in a real browser (cd tests first).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const DIST = (process.env.NOW_DIST || '../Now/dist').replace(/\/?$/, '/');

const ROWS = [
  {id: 1, name: 'Working', status: '1', locked: false},
  {id: 2, name: 'Resigned', status: '3', locked: false},
  {id: 3, name: 'Locked', status: '3', locked: true}
];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="t" data-source="/rows" data-page-size="0" data-row-actions='{
  "view": {"label": "View", "className": "btn view"},
  "more": {
    "label": "More",
    "className": "btn more",
    "submenu": {
      "edit": {"label": "Edit", "className": "sub-edit", "condition": "!locked"},
      "delete": {"label": "Delete", "className": "sub-delete", "condition": "status != 3"}
    }
  }
}'>
  <thead><tr><th data-field="name">name</th></tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="t"]'));
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
    return res.end(readFileSync(DIST + (path === '/core.js' ? 'now.core.min.js' : 'now.table.min.js'), 'utf8'));
  }
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: ROWS}));
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
await tab.waitForFunction(() => document.querySelectorAll('[data-table="t"] tbody tr').length === 3, {timeout: 5000}).catch(() => {});

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};

const rows = await tab.evaluate(() => [...document.querySelectorAll('[data-table="t"] tbody tr')].map(tr => ({
  name: tr.cells[0].textContent.trim(),
  view: !!tr.querySelector('.view'),
  more: !!tr.querySelector('.more'),
  edit: !!tr.querySelector('.sub-edit'),
  del: !!tr.querySelector('.sub-delete')
})));

check('both submenu items on a row that passes both', rows[0], {name: 'Working', view: true, more: true, edit: true, del: true});
check('submenu item hidden by its own condition', rows[1], {name: 'Resigned', view: true, more: true, edit: true, del: false});
check('no dropdown when no submenu item is left', rows[2], {name: 'Locked', view: true, more: false, edit: false, del: false});

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
