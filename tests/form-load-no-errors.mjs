/**
 * Loading a form's data must not mark its empty required fields as errors.
 *
 * Why this matters: setFormData assigns every field through the element's value
 * setter, and that setter used to run the full validation and show its result.
 * A new-record form (all values empty) therefore opened with every required
 * field outlined red and "Please fill in" before the user had typed anything.
 *
 * What must still happen: the user's own edits validate, the submit validates
 * every field, and a valid value set from code clears an error already shown.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="t" action="/save" method="post" data-ajax-submit="true" data-validate="true" data-load-api="/load">
  <span class="form-control"><input type="text" id="name" name="name" data-attr="value:name" required></span>
  <span class="form-control"><input type="tel" id="phone" name="phone" maxlength="10" data-attr="value:phone" required></span>
  <span class="form-control"><input type="email" id="email" name="email" data-attr="value:email" required></span>
  <span class="form-control"><input type="text" id="note" name="note" data-attr="value:note"></span>
  <button type="submit" id="save">save</button>
</form>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
</script>
</body></html>`;

let saved = 0;
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (req.url.startsWith('/load')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {data: {name: '', phone: '', email: '', note: ''}}}));
  }
  if (req.url.startsWith('/save')) {
    saved++;
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: null}));
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
const sleep = ms => new Promise(r => setTimeout(r, ms));
await tab.waitForFunction(() => {
  const form = document.querySelector('form');
  const inst = window.FormManager && FormManager.getInstanceByElement(form);
  return inst && inst.state.dataOnLoadCalled;
}, {timeout: 5000});
await sleep(300);

// In an app the fields are enhanced before the data arrives (the template is
// rendered, then the form loads). On this bare page the first load can beat the
// enhancement, so load again now that every field has its element instance —
// this is the setFormData → value setter path a real form goes through.
await tab.evaluate(() => {
  const form = document.querySelector('form');
  FormManager.setFormData(FormManager.getInstanceByElement(form), {name: '', phone: '', email: '', note: ''});
});
await sleep(300);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const invalid = () => tab.evaluate(() => [...document.querySelectorAll('.invalid')].map(e => e.id || e.className));

// 1. ฟอร์มใหม่ที่ทุกช่องว่าง
check('โหลดฟอร์มแล้วไม่มีช่องไหนขึ้นข้อผิดพลาด', (await invalid()).length === 0, JSON.stringify(await invalid()));

// 2. ส่งฟอร์มโดยไม่กรอก → ต้องขึ้นข้อผิดพลาดครบทุกช่องบังคับ และไม่ส่งข้อมูล
// (ส่ง event แบบเดียวกับ FormManager.submit() — การคลิกปุ่มจริงถูก native validation
// ของเบราว์เซอร์หยุดไว้ก่อนเพราะช่อง required ว่าง)
await tab.evaluate(() => {
  document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
});
await sleep(500);
const afterSubmit = await tab.evaluate(() => ['name', 'phone', 'email', 'note'].map(id => document.getElementById(id).classList.contains('invalid')));
check('กดบันทึก → ช่องบังคับทั้ง 3 ขึ้นข้อผิดพลาด', afterSubmit[0] && afterSubmit[1] && afterSubmit[2], JSON.stringify(afterSubmit));
check('กดบันทึก → ช่องไม่บังคับไม่ขึ้นข้อผิดพลาด', !afterSubmit[3]);
check('ข้อมูลไม่ถูกส่ง', saved === 0, String(saved));

// 3. ค่าที่ถูกต้องที่โค้ดใส่เข้าไป ต้องล้างข้อผิดพลาดที่ขึ้นอยู่
await tab.evaluate(() => {
  document.getElementById('name').value = 'สมชาย';
});
await sleep(100);
check('โค้ดใส่ค่าที่ถูกต้อง → ล้างข้อผิดพลาดที่ขึ้นอยู่',
  !(await tab.evaluate(() => document.getElementById('name').classList.contains('invalid'))));

// 4. ผู้ใช้ลบค่าออกเอง → ต้องขึ้นข้อผิดพลาดทันทีเหมือนเดิม
await tab.click('#name');
await tab.keyboard.down('Control');
await tab.keyboard.press('KeyA');
await tab.keyboard.up('Control');
await tab.keyboard.press('Backspace');
await tab.click('#note');
await sleep(500);
check('ผู้ใช้ลบค่าในช่องบังคับ → ขึ้นข้อผิดพลาด',
  await tab.evaluate(() => document.getElementById('name').classList.contains('invalid')));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
