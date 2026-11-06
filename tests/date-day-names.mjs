/**
 * Proof that Utils.date.format writes day names (dddd · ddd) in the locale of
 * the page, as its documentation said it did.
 *
 *   <p data-text="meta.date | date:'dddd D MMMM YYYY'"></p>  →  "จันทร์ 15 มกราคม 2574"
 *
 * The tokens were missing: "dddd" came out literally ("dddd 15 มกราคม 2574").
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>t</title></head><body>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const out = await tab.evaluate(() => ({
  thFull: Utils.date.format('2031-01-13', 'dddd D MMMM YYYY', 'th'),
  thShort: Utils.date.format('2031-01-13', 'ddd D MMM YY', 'th'),
  enFull: Utils.date.format('2031-01-13', 'dddd D MMMM YYYY', 'en'),
  enShort: Utils.date.format('2031-01-18', 'ddd, MMM D', 'en'),
  plain: Utils.date.format('2031-01-13', 'D MMM YYYY', 'en')
}));
check('dddd · D MMMM YYYY in Thai (Buddhist year)', out.thFull === 'จันทร์ 13 มกราคม 2574', out.thFull);
check('ddd short Thai day name', out.thShort === 'จ. 13 ม.ค. 74', out.thShort);
check('dddd in English, the replaced name is not scanned again ("Monday" keeps its M)', out.enFull === 'Monday 13 January 2031', out.enFull);
check('ddd short English day name', out.enShort === 'Sat, Jan 18', out.enShort);
check('patterns without day names are unchanged', out.plain === '13 Jan 2031', out.plain);
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
