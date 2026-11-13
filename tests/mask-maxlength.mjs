/**
 * A masked input must accept a complete value even when its maxlength was
 * written for the unmasked value.
 *
 * Why this matters: <input type="tel" maxlength="10"> is the natural way to
 * say "a 10-digit phone number", but the tel mask turns 0812345678 into
 * 08-1234-5678 (12 characters). The browser stopped typing part-way and the
 * element validation reported "Must be no more than 10 characters", so a
 * required phone field could never be submitted.
 *
 * Runs the real built bundle in a real browser with real keystrokes.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <input type="tel" id="phone" name="phone" maxlength="10" required>
  <input type="tel" id="roomy" name="roomy" maxlength="20">
  <input type="text" id="plain" name="plain" maxlength="10">
  <input type="text" id="other" name="other">
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  ElementManager.init();
  ElementManager.scan(document);
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
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
const prop = (id, name) => tab.evaluate((id, name) => document.getElementById(id)[name], id, name);

check('maxlength ของช่องที่มี mask ขยายให้พอกับ mask', await prop('phone', 'maxLength') === 12, String(await prop('phone', 'maxLength')));
check('maxlength ที่ยาวกว่า mask อยู่เหมือนเดิม', await prop('roomy', 'maxLength') === 20, String(await prop('roomy', 'maxLength')));
check('ช่องที่ไม่มี mask ไม่ถูกแตะ', await prop('plain', 'maxLength') === 10, String(await prop('plain', 'maxLength')));

// พิมพ์จริงทีละปุ่ม แล้วออกจากช่อง — เริ่มพิมพ์ทันทีหลังคลิก (ก่อนตัวจับเวลาของ focus
// ทำงาน) เดิมตัวเลขแรกถูกเลือกไว้แล้วถูกตัวถัดไปพิมพ์ทับ 0812345678 กลายเป็น 81-2345-678
await tab.click('#phone');
await tab.keyboard.type('0812345678', {delay: 30});
await tab.click('#other');
await sleep(400);

check('พิมพ์เบอร์ 10 หลักได้ครบ', await prop('phone', 'value') === '08-1234-5678', await prop('phone', 'value'));
const state = await tab.evaluate(() => {
  const el = document.getElementById('phone');
  const inst = ElementManager.getInstanceByElement(el);
  return {invalid: el.classList.contains('invalid'), valid: inst.isValid(), error: inst.getError()};
});
check('ไม่ขึ้นข้อผิดพลาดความยาว', !state.invalid && state.valid, JSON.stringify(state));

// พฤติกรรมเดิมที่ต้องคงไว้: โฟกัสช่องที่มีค่าอยู่แล้ว → เลือกกลุ่มแรกไว้ให้พิมพ์ทับ
await tab.click('#other');
await tab.evaluate(() => document.getElementById('phone').focus());
await sleep(60);
const sel = await tab.evaluate(() => {
  const el = document.getElementById('phone');
  return [el.selectionStart, el.selectionEnd];
});
check('โฟกัสช่องที่มีค่า → เลือกกลุ่มแรก (เหมือนเดิม)', sel[0] === 0 && sel[1] === 2, JSON.stringify(sel));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
