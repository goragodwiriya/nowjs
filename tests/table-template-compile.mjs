/**
 * A data-template column is processed once per render, not once per row
 * (Now.js audit 2026-11-10, phase 7: P2, owner's choice — only where it adds no risk).
 *
 * Every template cell ran i18n.interpolate and TemplateManager.processTemplateString
 * (parse, directives, serialize) on its column's template with the row values
 * held back as slot tokens — the same work for every row. 1,000 rows with two
 * template columns took 1,219 ms against 694 ms without them (CPU 4x slower).
 *
 * - During a body render, a column's template whose result cannot depend on the
 *   row is processed at most twice (the second run checks the result is the same)
 *   and reused for the other rows.
 * - Templates whose result can depend on the row ({{ }}, TemplateManager
 *   directives, form controls) are still processed for every row.
 * - Every cell comes out exactly as the per-row path makes it: each rendered row
 *   is compared with the same row rendered on its own (renderRow outside
 *   renderTable, which never uses the cache), values with markup, quotes,
 *   slot-like text and i18n tokens included.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const N = 300;
const rows = Array.from({length: N}, (_, i) => ({
  id: i + 1,
  topic: i % 7 === 0 ? `<script>alert(${i})</script> & "q" 'a'` : `หัวข้อที่ ${i}`,
  phone: i % 11 === 0 ? 'javascript:alert(1)' : `08${10000000 + i}`,
  status: ['active', 'inactive', 'pending'][i % 3],
  price: i * 12.5,
  tags: i % 4 === 0 ? [] : [{tag: 'a', text: 'A'}, {tag: 'b', text: `B${i}`}],
  can_edit: i % 2 === 0,
  note: i % 5 === 0 ? '%%NOWCELL0%% {LNG_Delete} {{1+1}} ${id}' : (i % 13 === 0 ? null : `note ${i}`),
  html: i % 9 === 0 ? {html: '<b>bold</b><img src=x onerror=alert(1)>'} : `plain ${i}`,
  mustache: i, textDirective: `t${i}`, control: i
}));

// Cacheable: no {{ }}, no TemplateManager directive, no form control
const CACHEABLE = {
  topic: "<span title='${topic}' class='one_line'>${topic}</span>",
  phone: "<a href='tel:${phone}'>${phone}</a>",
  status: "<span class='status ${status}' data-i18n>{LNG_${status}}</span>",
  price: "<b>${price|number:2}</b> <small>{LNG_Baht}</small>",
  edit: "<button class='edit' data-if='${can_edit}'>{LNG_Edit}</button><i data-if='${id != 1}'>x</i>${missing}",
  tags: "<span class='tag is-${tag}'>${text}</span>",
  note: "<em data-i18n='${note}'>${note}</em>",
  html: "<div class='h'>${html}</div>"
};
// Per row: their result can depend on the row
const PER_ROW = {
  mustache: "<span>{{ id }}</span>",
  textDirective: "<span data-text='topic'></span>",
  control: "<input type='checkbox' value='${id}'>"
};

const th = (field, template, extra = '') => `<th data-field="${field}"${extra} data-template="${template.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">${field}</th>`;
const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<main id="main">
<table data-table="t" data-page-size="0" data-auto-load="false"><thead><tr>
  <th data-field="id">id</th>
  ${Object.entries(CACHEABLE).map(([f, t]) => th(f === 'edit' ? 'can_edit' : f, t, f === 'tags' ? ' data-each="tags"' : '')).join('\n  ')}
  ${Object.entries(PER_ROW).map(([f, t]) => th(f, t)).join('\n  ')}
</tr></thead><tbody></tbody></table>
</main>
<script src="/core.js"></script><script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, router: {enabled: false},
    paths: {translations: '/language'},
    i18n: {enabled: true, defaultLocale: 'th', availableLocales: ['th']}});
  TableManager.initTable(document.querySelector('[data-table]'));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + (path === '/core.js' ? 'now.core.min.js' : 'now.table.min.js'), 'utf8'));
  }
  if (path === '/language/th.json') {
    res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8'});
    return res.end(JSON.stringify({active: 'ใช้งาน', inactive: 'ไม่ใช้งาน', pending: 'รอ', Baht: 'บาท', Edit: 'แก้ไข', Delete: 'ลบ'}));
  }
  if (path === '/favicon.ico' || path.endsWith('.json')) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(page);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 600) : ''}`);
};
const errors = [];
const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
tab.on('dialog', d => { errors.push('DIALOG ' + d.message()); d.dismiss(); });
await tab.goto(origin + '/', {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);

const out = await tab.evaluate(async (data, cacheable, perRow) => {
  // processTemplateString calls per column template during one render
  // processTemplateString calls per column, the column known from renderCell
  const byColumn = {};
  let current = null;
  const origCell = TableManager.renderCell;
  TableManager.renderCell = function (table, tableId, row, field, ...rest) {
    current = field;
    try { return origCell.call(this, table, tableId, row, field, ...rest); } finally { current = null; }
  };
  const orig = TemplateManager.processTemplateString.bind(TemplateManager);
  TemplateManager.processTemplateString = (...a) => {
    if (current) byColumn[current] = (byColumn[current] || 0) + 1;
    return orig(...a);
  };
  TableManager.setData('t', data);
  await new Promise(r => setTimeout(r, 50));
  TemplateManager.processTemplateString = orig;
  TableManager.renderCell = origCell;
  if (byColumn.can_edit !== undefined) { byColumn.edit = byColumn.can_edit; delete byColumn.can_edit; }

  // Every rendered row against the same row rendered on its own (no cache)
  const table = TableManager.state.tables.get('t');
  const rendered = [...document.querySelectorAll('[data-table="t"] tbody tr')];
  const mismatches = [];
  rendered.forEach((tr, index) => {
    const single = TableManager.renderRow(table, 't', table.data[index], index);
    // ElementManager gives each enhanced control a random id: not template output
    const plain = html => html.replace(/ id="[a-z]+-[0-9a-f]{8}-[0-9a-f-]{27}"/g, ' id="(generated)"');
    if (plain(single.innerHTML) !== plain(tr.innerHTML) && mismatches.length < 3) {
      const a = plain(tr.innerHTML), b = plain(single.innerHTML);
      let at = 0;
      while (at < a.length && a[at] === b[at]) at++;
      mismatches.push({index, at, rendered: a.slice(Math.max(0, at - 80), at + 120), single: b.slice(Math.max(0, at - 80), at + 120)});
    }
  });
  const ids = new Set(rendered.map(tr => tr.querySelector('td[data-field="control"] input')?.id).filter(Boolean));
  return {byColumn, rows: rendered.length, mismatches, uniqueIds: ids.size};
}, rows, Object.keys(CACHEABLE), Object.keys(PER_ROW));

check(`all ${N} rows render`, out.rows === N, out.rows);
// data-each templates differ by the number of items, so tags has one entry per count
for (const column of Object.keys(CACHEABLE)) {
  const limit = column === 'tags' ? 4 : 2;
  check(`column ${column}: its template is processed at most ${limit} times for ${N} rows`, (out.byColumn[column] || 0) > 0 && out.byColumn[column] <= limit, out.byColumn);
}
for (const column of Object.keys(PER_ROW)) {
  check(`column ${column}: processed for every row (its result can depend on the row)`, (out.byColumn[column] || 0) >= N, out.byColumn);
}
check('every cell is exactly what the per-row path makes (ids ElementManager generates aside)', out.mismatches.length === 0, out.mismatches);
check('controls in a per-row template still get ids of their own', out.uniqueIds === out.rows, {uniqueIds: out.uniqueIds, rows: out.rows});

const cells = await tab.evaluate(() => {
  const first = document.querySelector('[data-table="t"] tbody tr');
  const q = s => first.querySelector(s);
  const all = [...document.querySelectorAll('[data-table="t"] tbody tr')];
  return {
    escaped: !document.querySelector('[data-table="t"] tbody script') && !document.querySelector('[data-table="t"] tbody img[onerror]'),
    status: q('td[data-field="status"]')?.textContent.trim(),
    price: q('td[data-field="price"]')?.textContent.trim(),
    editShown: !!all[0].querySelector('button.edit'), editHidden: !all[1].querySelector('button.edit'),
    xHiddenOnFirst: !all[0].querySelector('i'), xShownOnSecond: !!all[1].querySelector('i')
  };
});
check('values with markup stay text, no script or handler in the table', cells.escaped, cells);
check('{LNG_${status}} and {LNG_Baht} are translated', cells.status === 'ใช้งาน' && /บาท$/.test(cells.price), cells);
check('data-if is still decided for each row', cells.editShown && cells.editHidden && cells.xHiddenOnFirst && cells.xShownOnSecond, cells);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
