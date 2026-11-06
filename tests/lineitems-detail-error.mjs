/**
 * A failed `data-detail-api` / `data-load-api` request must tell the user why.
 *
 * Why this matters: `_fetchJson` used to turn any `success: false` into `null`, so a
 * detail API that refuses a product on purpose (400 "This product does not count
 * stock") left the row unadded and the screen silent — the only trace was a 400 in
 * the network tab. A failed load-from request also cleared the rows already entered.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const REFUSED = 'This product does not count stock';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="doc">
  <input type="text" id="code" data-role="code">
  <select id="po"><option value="">-</option><option value="1">ok</option><option value="2">bad</option></select>
  <table data-line-items="items" data-detail-api="/detail"
         data-listen-select="[data-role='code']" data-api-params="[data-role]"
         data-load-from="#po" data-load-api="/load" data-load-param="id">
    <thead><tr>
      <th data-field="code">Code</th>
      <th data-field="topic">Topic</th>
    </tr></thead>
    <tbody></tbody>
  </table>
</form>
<script src="/core.js"></script>
<script>
window.__events = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  const table = document.querySelector('[data-line-items]');
  ['add', 'detailError', 'sourceError', 'sourceLoaded', 'clear'].forEach(name => {
    table.addEventListener('lineitems:' + name, e => window.__events.push({name, message: e.detail.error?.message || ''}));
  });
})();
</script>
</body></html>`;

const json = (res, status, body) => {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (url.pathname === '/detail') {
    const code = url.searchParams.get('code');
    if (code === 'SERVICE') return json(res, 400, {success: false, message: REFUSED, code: 400, data: null});
    if (code === 'BROKEN') {
      res.writeHead(500, {'Content-Type': 'text/html'});
      return res.end('<html>Fatal error</html>');
    }
    return json(res, 200, {success: true, data: {code, topic: 'Item ' + code}});
  }
  if (url.pathname === '/load') {
    if (url.searchParams.get('id') === '2') return json(res, 403, {success: false, message: 'Permission required', code: 403, data: null});
    return json(res, 200, {success: true, data: [{code: 'L1', topic: 'Loaded 1'}]});
  }
  if (url.pathname === '/favicon.ico') {
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
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const scan = async code => {
  await tab.evaluate(c => {
    const input = document.getElementById('code');
    input.value = c;
    input.dispatchEvent(new Event('change', {bubbles: true}));
  }, code);
  await sleep(400);
};
const pickSource = async value => {
  await tab.evaluate(v => {
    const select = document.getElementById('po');
    select.value = v;
    select.dispatchEvent(new Event('change', {bubbles: true}));
  }, value);
  await sleep(400);
};
const state = () => tab.evaluate(() => ({
  rows: document.querySelectorAll('[data-line-items] tbody tr').length,
  notices: [...document.querySelectorAll('.notification-error .notification-message')].map(n => n.textContent.trim()),
  events: window.__events.splice(0)
}));
const dismissAll = () => tab.evaluate(() => window.NotificationManager?.clear?.() ?? document.querySelectorAll('.notification').forEach(n => n.remove()));

await scan('P001');
let s = await state();
check('รหัสที่ API รับ ได้แถวใหม่ ไม่มีข้อความผิดพลาด', s.rows === 1 && s.notices.length === 0, JSON.stringify(s));

await scan('SERVICE');
s = await state();
check('detail API ตอบ 400 — ไม่เพิ่มแถว', s.rows === 1, 'rows=' + s.rows);
check('detail API ตอบ 400 — แสดงข้อความของ API ให้ผู้ใช้เห็น', s.notices.includes(REFUSED), JSON.stringify(s.notices));
check('detail API ตอบ 400 — ส่ง lineitems:detailError พร้อมข้อความ',
  s.events.some(e => e.name === 'detailError' && e.message === REFUSED), JSON.stringify(s.events));
await dismissAll();
await sleep(400);

await scan('BROKEN');
s = await state();
check('ตอบ 500 เป็น HTML — ไม่เพิ่มแถว ไม่พังทั้งหน้า', s.rows === 1 && errors.length === 0, 'rows=' + s.rows);
check('ตอบ 500 เป็น HTML — ไม่โชว์ข้อความ parse JSON ให้ผู้ใช้', !s.notices.some(n => /JSON|token/i.test(n)), JSON.stringify(s.notices));
await dismissAll();
await sleep(400);

await pickSource('2');
s = await state();
check('data-load-api ตอบ 403 — แถวที่กรอกไว้ยังอยู่', s.rows === 1, 'rows=' + s.rows);
check('data-load-api ตอบ 403 — แสดงข้อความของ API', s.notices.includes('Permission required'), JSON.stringify(s.notices));
check('data-load-api ตอบ 403 — ส่ง lineitems:sourceError ไม่ใช่ sourceLoaded',
  s.events.some(e => e.name === 'sourceError') && !s.events.some(e => e.name === 'sourceLoaded'), JSON.stringify(s.events));

await pickSource('1');
s = await state();
check('data-load-api สำเร็จ ยังโหลดตามเดิม (ล้างแล้วใส่รายการจาก API)', s.rows === 1 && s.events.some(e => e.name === 'sourceLoaded'), JSON.stringify(s));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
