/**
 * Proof that data-each repeats a cell template for each item of an array field
 * of the row, reading ${key} from the item first and then from the row.
 *
 *   <th data-field="tags" data-each="tags" data-template="<span class='tag is-${tag}'>${text}</span>">
 *
 * A day with several badges (late · overtime …) or a person with several
 * skills used to need a script that drew the table, or markup composed by the
 * server: a cell template could only show one value of each field.
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
<table data-table="days" data-source="/rows">
  <thead><tr>
    <th data-field="name">Name</th>
    <th data-field="tags" data-each="tags" data-template="<span class='tag is-\${tag}' title='\${name}'>\${text}</span>">Status</th>
    <th data-field="skills" data-each="skills" data-template="<i>\${item}</i>">Skills</th>
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
      {id: 1, name: 'Arisa', tags: [{tag: 'late', text: 'Late'}, {tag: 'ot', text: 'Overtime <b>2h</b>'}], skills: ['SQL', 'PHP']},
      {id: 2, name: 'Mintra', tags: [], skills: []}
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

const cells = await tab.evaluate(() => [...document.querySelectorAll('tbody tr')].map(tr => ({
  tags: [...tr.querySelectorAll('td[data-field="tags"] span.tag')].map(s => ({cls: s.className, text: s.textContent, title: s.title, html: s.innerHTML})),
  skills: [...tr.querySelectorAll('td[data-field="skills"] i')].map(i => i.textContent)
})));
check('one template per item, with the fields of the item', JSON.stringify(cells[0].tags.map(t => [t.cls, t.text])) === JSON.stringify([['tag is-late', 'Late'], ['tag is-ot', 'Overtime <b>2h</b>']]), JSON.stringify(cells[0].tags));
check('a value of an item is escaped (no markup from data)', !/<b>/.test(cells[0].tags[1].html), cells[0].tags[1].html);
check('a key the item does not have comes from the row', cells[0].tags.every(t => t.title === 'Arisa'), JSON.stringify(cells[0].tags.map(t => t.title)));
check('${item} is the item itself for a list of plain values', JSON.stringify(cells[0].skills) === '["SQL","PHP"]', JSON.stringify(cells[0].skills));
check('an empty list leaves the cell empty', cells[1].tags.length === 0 && cells[1].skills.length === 0, JSON.stringify(cells[1]));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
