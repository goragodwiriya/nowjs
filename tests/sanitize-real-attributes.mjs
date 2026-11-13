/**
 * The request sanitizer may only touch real attributes, and must give the same
 * result whether or not the form has a file attached.
 *
 * Why this matters: it used to remove anything shaped like on...= from any text,
 * so a link to ?month=12 was saved as ?m12 and contenteditable="false" as
 * c"false". A submit with a file attached skipped it altogether, so the same
 * text arrived in two different forms.
 *
 * Each cleaned result is also parsed by the browser's own HTML parser: no event
 * handler or javascript: URL may survive, however oddly the tag is written.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync, writeFileSync, mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const form = (id, attrs = '') => `<form id="${id}" data-form="${id}" action="/save/${id}" method="post"
  data-ajax-submit="true" data-csrf="false" data-reset="false" ${attrs}>
  <textarea name="detail" style="display:none"></textarea>
  <input type="file" name="pictures" multiple>
  <input type="hidden" name="tags[]" value="one">
  <input type="hidden" name="tags[]" value="two">
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

/** Read a multipart body into its text fields (repeats become arrays) and files. */
const parseMultipart = (body, contentType) => {
  const boundary = /boundary=(.+)$/.exec(contentType)[1];
  const fields = {};
  const files = [];
  for (const part of body.toString('latin1').split(`--${boundary}`)) {
    const name = /name="([^"]+)"/.exec(part);
    if (!name) continue;
    const start = part.indexOf('\r\n\r\n') + 4;
    const content = Buffer.from(part.slice(start, part.lastIndexOf('\r\n')), 'latin1').toString('utf8');
    const filename = /filename="([^"]*)"/.exec(part);
    if (filename) {
      files.push({field: name[1], filename: filename[1], content});
    } else if (name[1] in fields) {
      fields[name[1]] = [].concat(fields[name[1]], content);
    } else {
      fields[name[1]] = content;
    }
  }
  return {fields, files};
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
      received.push(contentType.includes('multipart/')
        ? {multipart: true, ...parseMultipart(body, contentType)}
        : {multipart: false, fields: JSON.parse(body.toString('utf8')), files: []});
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

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? '✔' : '✘'} ${name}${ok ? '' : `  — ${detail}`}`);
};

const open = async () => {
  await tab.goto(base, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
};

await open();

const clean = values => tab.evaluate(list => list.map(v => SecurityManager.sanitizeInput(v)), values);

// Ordinary text and ordinary attributes stay exactly as written
const untouched = [
  'report?month=12',
  'monthly = 5 and button = 3',
  'a < b onclick=x > c',
  'onclick=alert(1)',
  'ใช้ javascript: เขียนโค้ด',
  // A string that is not HTML is left alone (the server validates what it stores)
  'javascript:alert(1)',
  '  javascript:javascript:alert(1)',
  '<p>ใช้ javascript: เขียนโค้ด</p>',
  '<a href="report?month=12">x</a>',
  "<a href='report?month=12'>x</a>",
  '<a href=report?month=12>x</a>',
  '<a href=/a/b?month=12 id=c>x</a>',
  '<p contenteditable="false">y</p>',
  '<a data-onclick="x" title="onclick=alert(1)">y</a>',
  '<a title="ใช้ javascript: เขียน">x</a>',
  '<a onclick=x',
  '<b x="onclick=y>z',
  '<p class="a"  id=\'b\'\n  title=c >d</p>'
];
const keep = await clean(untouched);
untouched.forEach((value, i) => {
  check(`ไม่แตะ ${JSON.stringify(value)}`, keep[i] === value, JSON.stringify(keep[i]));
});

// What must go, and exactly what is left
const changed = [
  ['<b onclick="x()">y</b>', '<b>y</b>'],
  ["<b onclick='x()'>y</b>", '<b>y</b>'],
  ['<b onclick=x()>y</b>', '<b>y</b>'],
  ['<b onclick>y</b>', '<b>y</b>'],
  ['<B ONCLICK="x()">y</B>', '<B>y</B>'],
  ['<b\nonclick = "x()"\n>y</b>', '<b\n>y</b>'],
  ['<img src=x onerror=alert(1)>', '<img src=x>'],
  ['<img src="x"onerror=alert(1)>', '<img src="x">'],
  ['<svg/onload=alert(1)>', '<svg>'],
  ['<img onerror=x />', '<img />'],
  ['<a title="a>b" onclick="c">d</a>', '<a title="a>b">d</a>'],
  ['<a href="x?month=12" onclick="y()" id="z">m</a>', '<a href="x?month=12" id="z">m</a>'],
  ['<a onclick="x" onmouseover="y">z</a>', '<a>z</a>'],
  ['a<b onclick=x>c<i onclick=y>d', 'a<b>c<i>d'],
  ['<a href="javascript:x()">y</a>', '<a href="x()">y</a>'],
  ["<a href=' JavaScript:x()'>y</a>", "<a href='x()'>y</a>"],
  ['<a href=javascript:x()>y</a>', '<a href=x()>y</a>'],
  ['a<script>alert(1)</script>b', 'ab'],
  ['a<SCRIPT src="x"></SCRIPT>b', 'ab']
];
const got = await clean(changed.map(c => c[0]));
changed.forEach(([value, expected], i) => {
  check(`${JSON.stringify(value)} → ${JSON.stringify(expected)}`, got[i] === expected, JSON.stringify(got[i]));
});

// The browser's own parser is the judge of what counts as an attribute
const odd = [
  '<img/src=x/onerror=y>',
  '<a\tonclick=x>a</a>',
  '<a\fonclick=x>a</a>',
  '<a\ronclick=x>a</a>',
  '<a b="c"/onclick=x>a</a>',
  "<a b='c'onclick=x>a</a>",
  '<a b=c"onclick=x>a</a>',
  '<a onclick =x>a</a>',
  '<a onclick= x>a</a>',
  '<a =onclick=x>a</a>',
  '<a"onclick=x>a</a>',
  '<p<img onerror=x>',
  '<img src=x onerror\n=\ny>',
  '<a b=">" onclick=x>a</a>',
  '<a b=\'"\' onclick="y">a</a>',
  '<a b="\'" onclick=\'y\'>a</a>',
  '<a onclick="x" onclick="y" onclick=z>a</a>',
  '<div><span onmouseover=x><img src=y onerror=z></span></div>',
  '<a href="&#106;" onclick=x>a</a>',
  '<a href=" javascript:x" xlink:href="javascript:y">a</a>',
  '<x-y onfoo=bar>a</x-y>',
  '<a one=1 onx=2>a</a>'
];
const survivors = await tab.evaluate(list => list.map(value => {
  const cleaned = SecurityManager.sanitizeInput(value);
  const holder = document.createElement('template');
  holder.innerHTML = cleaned;
  const bad = [];
  holder.content.querySelectorAll('*').forEach(el => {
    for (const attr of el.attributes) {
      if (/^on/i.test(attr.name) || /^\s*javascript:/i.test(attr.value)) bad.push(`${attr.name}=${attr.value}`);
    }
  });
  return {cleaned, bad};
}), odd);
odd.forEach((value, i) => {
  check(`เบราว์เซอร์ไม่เห็น handler ใน ${JSON.stringify(value)}`, survivors[i].bad.length === 0, `${survivors[i].cleaned} ${survivors[i].bad}`);
});

// Long text must stay fast whatever it looks like
for (const [name, unit] of [
  ['แท็กไม่ปิด', '<a '], ['quote ไม่ปิด', '<a b="'], ['quote สลับ', "<a b='c' "], ['แท็กปิดครบ', '<a b=c>'],
  ['handler ทุกแท็ก', '<a onclick=x>'], ['ข้อความล้วน', 'ทดสอบ onclick= ']
]) {
  const ms = await tab.evaluate(u => {
    const value = u.repeat(Math.ceil(500000 / u.length));
    const started = performance.now();
    SecurityManager.sanitizeInput(value);
    return performance.now() - started;
  }, unit);
  check(`ข้อความ 500,000 ตัวอักษร (${name}) ต้องไม่ช้า`, ms < 2000, `${Math.round(ms)} ms`);
}

// A real submit, both ways
const dir = mkdtempSync(join(tmpdir(), 'sanitize-real-attributes-'));
const fileA = join(dir, 'a.txt');
const fileB = join(dir, 'b.txt');
writeFileSync(fileA, 'file a');
writeFileSync(fileB, 'file b');

const submit = async (id, value, files = []) => {
  await open();
  const at = received.length;
  await tab.evaluate(async id => {
    const el = document.getElementById(id);
    if (!FormManager.getInstanceByElement(el)) await FormManager.initForm(el);
  }, id);
  await tab.$eval(`#${id} textarea`, (t, v) => { t.value = v; }, value);
  if (files.length) {
    const input = await tab.$(`#${id} input[type="file"]`);
    await input.uploadFile(...files);
  }
  await tab.click(`#${id} button[type="submit"]`);
  for (let i = 0; i < 200 && received.length === at; i++) {
    await new Promise(r => setTimeout(r, 50));
  }
  return received[at] || {fields: {}, files: []};
};

const raw = 'a<script>x()</script>b <a href="report?month=12" onclick="y()">m</a> ใช้ javascript: เขียน';
const expected = 'ab <a href="report?month=12">m</a> ใช้ javascript: เขียน';

const plainJson = await submit('plain', raw);
const plainFile = await submit('plain', raw, [fileA, fileB]);
check('ไม่แนบไฟล์ส่งเป็น JSON', plainJson.multipart === false);
check('แนบไฟล์ส่งเป็น multipart', plainFile.multipart === true);
check('ไม่แนบไฟล์: ลบเฉพาะที่ควรลบ', plainJson.fields.detail === expected, plainJson.fields.detail);
check('แนบไฟล์: ลบเฉพาะที่ควรลบ', plainFile.fields.detail === expected, plainFile.fields.detail);
check('แนบไฟล์: ไฟล์ทั้งสองมาครบทั้งชื่อและเนื้อหา',
  plainFile.files.length === 2 && plainFile.files[0].filename === 'a.txt' && plainFile.files[0].content === 'file a'
  && plainFile.files[1].filename === 'b.txt' && plainFile.files[1].content === 'file b',
  JSON.stringify(plainFile.files));
check('แนบไฟล์: ฟิลด์ที่ส่งหลายค่ามาครบ', JSON.stringify(plainFile.fields['tags[]']) === '["one","two"]', JSON.stringify(plainFile.fields));

const optJson = await submit('optout', raw);
const optFile = await submit('optout', raw, [fileA]);
check('data-sanitize-input="false" ไม่แนบไฟล์: ไม่แตะ', optJson.fields.detail === raw, optJson.fields.detail);
check('data-sanitize-input="false" แนบไฟล์: ไม่แตะ', optFile.fields.detail === raw, optFile.fields.detail);
check('data-sanitize-input="false" แนบไฟล์: ไฟล์มาครบ', optFile.files.length === 1 && optFile.files[0].filename === 'a.txt');

// With cleaning turned off (the default) the file route must not clean on its own
await open();
const notStarted = await tab.evaluate(async () => {
  const original = SecurityManager.config.sanitization.enabled;
  SecurityManager.config.sanitization.enabled = false;
  const el = document.getElementById('plain');
  const instance = FormManager.getInstanceByElement(el) || await FormManager.initForm(el);
  let body = null;
  const send = FormManager.submitWithProgress;
  FormManager.submitWithProgress = (i, url, formData) => { body = formData.get('detail'); return Promise.resolve({success: true, data: {}}); };
  const formData = new FormData();
  formData.append('detail', '<b onclick="x()">y</b>');
  const file = document.querySelector('#plain input[type="file"]');
  const transfer = new DataTransfer();
  transfer.items.add(new File(['x'], 'x.txt'));
  file.files = transfer.files;
  await FormManager.submitAjax(instance, {formData, jsonData: {}});
  FormManager.submitWithProgress = send;
  SecurityManager.config.sanitization.enabled = original;
  return body;
});
check('ปิดการกรองอยู่: เส้นทางแนบไฟล์ต้องไม่ลบเอง', notStarted === '<b onclick="x()">y</b>', String(notStarted));

check('ไม่มี JS error', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
rmSync(dir, {recursive: true, force: true});

const passed = results.filter(Boolean).length;
console.log(`\n ผ่าน ${passed}/${results.length}`);
process.exit(passed === results.length ? 0 : 1);
