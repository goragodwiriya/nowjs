/**
 * A form must send a long value whole, whichever way it is submitted.
 *
 * Why this matters: SecurityManager.sanitizeInput used to cut every string in a
 * request body at 10,000 characters without a word. The editor showed the whole
 * article, the database could hold it, and the end was lost on save, usually in
 * the middle of a tag. A save with a file attached went through XMLHttpRequest
 * and kept everything, so the same article could save whole or cut.
 *
 * The other cleaning (script tags, javascript:, on...=) must still happen, and
 * data-sanitize-input="false" must still turn it off.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const SECURITY_CONFIG = '../Now/js/SecurityConfig.js';

// The textarea is hidden as RichTextEditor hides its own: laying out half a
// million Thai characters on screen would take Chrome minutes.
const form = (id, attrs = '') => `<form id="${id}" data-form="${id}" action="/save/${id}" method="post"
  data-ajax-submit="true" data-csrf="false" data-reset="false" ${attrs}>
  <textarea name="detail" style="display:none"></textarea>
  <input type="file" name="picture">
  <input type="hidden" name="after" value="kept">
  <button type="submit">Save</button>
</form>`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
${form('plain')}
${form('optout', 'data-sanitize-input="false"')}
<script src="/core.js"></script>
<script>
// Client-side body cleaning is off by default since 2026-11-10: this test is about how it behaves when on
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, security: {sanitization: {enabled: true}}});
</script>
</body></html>`;

const received = [];

/** Pull the text fields out of a multipart body. */
const parseMultipart = (body, contentType) => {
  const boundary = /boundary=(.+)$/.exec(contentType)[1];
  const fields = {};
  for (const part of body.toString('latin1').split(`--${boundary}`)) {
    const name = /name="([^"]+)"/.exec(part);
    if (!name || /filename="/.test(part)) continue;
    const start = part.indexOf('\r\n\r\n') + 4;
    fields[name[1]] = Buffer.from(part.slice(start, part.lastIndexOf('\r\n')), 'latin1').toString('utf8');
  }
  return fields;
};

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (req.url.startsWith('/save/')) {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const contentType = req.headers['content-type'] || '';
      const fields = contentType.includes('multipart/')
        ? parseMultipart(body, contentType)
        : JSON.parse(body.toString('utf8'));
      received.push({url: req.url, contentType, skip: req.headers['x-skip-sanitize'] || null, fields});
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, code: 200, message: 'ok', data: {}}));
    });
    return;
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

const dir = mkdtempSync(join(tmpdir(), 'sanitize-keeps-length-'));
const upload = join(dir, 'a.txt');
writeFileSync(upload, 'file');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? '✔' : '✘'} ${name}${ok ? '' : `  — ${detail}`}`);
};

const open = async () => {
  await tab.goto(base, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
};

/** Fill a form on a fresh page, optionally attach a file, click Save, return what the server got. */
const submit = async (id, value, withFile = false) => {
  await open();
  const at = received.length;
  await tab.evaluate(async id => {
    const el = document.getElementById(id);
    if (!FormManager.getInstanceByElement(el)) await FormManager.initForm(el);
  }, id);
  await tab.$eval(`#${id} textarea`, (t, v) => { t.value = v; }, value);
  if (withFile) {
    const input = await tab.$(`#${id} input[type="file"]`);
    await input.uploadFile(upload);
  }
  await tab.click(`#${id} button[type="submit"]`);
  for (let i = 0; i < 200 && received.length === at; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  return received[at] || {fields: {}};
};

const END = '<p><a href="/x" id="github" rel="nofollow">END</a></p>';
const long = n => 'ทดสอบ'.repeat(Math.ceil(n / 5)).slice(0, n - END.length) + END;

await open();

// The sanitizer itself
const direct = await tab.evaluate(v => SecurityManager.sanitizeInput(v), long(30000));
check('sanitizeInput ต้องคงสตริง 30,000 ตัวอักษรไว้ครบ', direct === long(30000), `ได้ ${direct.length}`);

const config = await tab.evaluate(() => Object.keys(SecurityManager.config.sanitization));
check('config ของ sanitization ต้องไม่มีค่าความยาว', !config.some(k => /length/i.test(k)), config.join());
check(
  'SecurityConfig ต้องไม่มีค่าความยาว',
  !/maxInputLength/.test(readFileSync(new URL(SECURITY_CONFIG, import.meta.url), 'utf8'))
);

// Still cleaned
const cleaned = await tab.evaluate(() => [
  SecurityManager.sanitizeInput('a<script>alert(1)</script>b'),
  SecurityManager.sanitizeInput('<a href="javascript:x()">y</a>'),
  SecurityManager.sanitizeInput('<b onclick="x()">y</b>')
]);
check('ยังลบแท็ก script', cleaned[0] === 'ab', cleaned[0]);
check('ยังลบ javascript:', !cleaned[1].includes('javascript:'), cleaned[1]);
check('ยังลบ event handler', !/onclick\s*=/.test(cleaned[2]), cleaned[2]);

// Every size around the old limit, through a real submit
for (const size of [9999, 10000, 10001, 50000, 500000]) {
  const value = long(size);
  const got = await submit('plain', value);
  check(`ฟอร์มไม่แนบไฟล์ส่ง ${size} ตัวอักษรครบ`, got.fields.detail === value, `ได้ ${got.fields.detail?.length}`);
}

const plainValue = long(50000);
const plain = await submit('plain', plainValue);
check('ฟอร์มไม่แนบไฟล์ส่งเป็น JSON', plain.contentType?.includes('application/json'), String(plain.contentType));
check('ฟิลด์ที่อยู่หลังข้อความยาวยังมาครบ', plain.fields.after === 'kept', String(plain.fields.after));

// With a file attached the same text must arrive the same way
const withFile = await submit('plain', plainValue, true);
check('ฟอร์มแนบไฟล์ส่งเป็น multipart', withFile.contentType?.includes('multipart/'), String(withFile.contentType));
check('แนบไฟล์แล้วข้อความเดียวกันมาครบ', withFile.fields.detail === plainValue, `ได้ ${withFile.fields.detail?.length}`);
check(
  'แนบไฟล์หรือไม่ ข้อความที่มาถึงต้องเหมือนกัน',
  withFile.fields.detail === plain.fields.detail,
  `แนบไฟล์ ${withFile.fields.detail?.length} / ไม่แนบ ${plain.fields.detail?.length}`
);

// The opt-out still works and still skips the cleaning
const optValue = `${long(20000)}<a href="report?month=12">m</a>`;
const opt = await submit('optout', optValue);
check('data-sanitize-input="false" ส่ง header', opt.skip === 'true', String(opt.skip));
check('data-sanitize-input="false" ส่งข้อความไม่แตะต้อง', opt.fields.detail === optValue, `ได้ ${opt.fields.detail?.length}`);

check('ไม่มี JS error', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
rmSync(dir, {recursive: true, force: true});

const passed = results.filter(Boolean).length;
console.log(`\n ผ่าน ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
