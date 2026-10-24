/**
 * Picking an autocomplete row must fill the form from that row, even when
 * another row has the same key.
 *
 * Why this matters: a sub-district name exists in many provinces (ศรีภูมิ is in
 * both น่าน and เชียงใหม่). selectItem() looked the picked row up again by its
 * key, found the first row with that key, and filled amphur/province/IDs from
 * it — whichever row the user clicked. The saved address was in the wrong
 * province and nothing on screen said so except the auto-filled fields.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

const rows = [
  {value: 'ศรีภูมิ', text: 'ศรีภูมิ / ท่าวังผา / น่าน', amphur: 'ท่าวังผา', province: 'น่าน', provinceID: '124'},
  {value: 'ศรีภูมิ', text: 'ศรีภูมิ / เมืองเชียงใหม่ / เชียงใหม่', amphur: 'เมืองเชียงใหม่', province: 'เชียงใหม่', provinceID: '171'},
  {value: 'ศรีภูมิ', text: 'ศรีภูมิ / กลางเวียง / น่าน', amphur: 'กลางเวียง', province: 'น่าน', provinceID: '124'}
];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <input type="text" id="district" name="district" data-autocomplete="true" data-source="/find" data-min-length="1">
  <input type="text" id="amphur" name="amphur">
  <input type="text" id="province" name="province">
  <input type="hidden" id="provinceID" name="provinceID">
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
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (req.url.startsWith('/find')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: rows}));
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
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const val = id => tab.evaluate(id => document.getElementById(id).value, id);

const open = async () => {
  await tab.evaluate(() => {
    const el = document.getElementById('district');
    el.focus();
    el.value = 'ศรี';
    el.dispatchEvent(new Event('input', {bubbles: true}));
  });
  await sleep(700);
};

/** Click (mousedown) the row at `index`. */
const clickRow = async index => {
  await open();
  await tab.evaluate(index => {
    const inst = ElementManager.getInstanceByElement(document.getElementById('district'));
    inst.list[index].dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
  }, index);
  await sleep(150);
};

// 1. Mouse: the second row shares its key with the first
await clickRow(1);
check('คลิกแถวที่ 2 → จังหวัดของแถวที่ 2', await val('province') === 'เชียงใหม่', await val('province'));
check('คลิกแถวที่ 2 → รหัสจังหวัดของแถวที่ 2', await val('provinceID') === '171', await val('provinceID'));
check('คลิกแถวที่ 2 → อำเภอของแถวที่ 2', await val('amphur') === 'เมืองเชียงใหม่', await val('amphur'));
check('ข้อความในช่องเป็นของแถวที่คลิก', await val('district') === rows[1].text, await val('district'));

// 2. The last row, also sharing the key
await clickRow(2);
check('คลิกแถวที่ 3 → อำเภอของแถวที่ 3', await val('amphur') === 'กลางเวียง', await val('amphur'));

// 3. The first row still works
await clickRow(0);
check('คลิกแถวที่ 1 → จังหวัดของแถวที่ 1', await val('province') === 'น่าน', await val('province'));
check('คลิกแถวที่ 1 → อำเภอของแถวที่ 1', await val('amphur') === 'ท่าวังผา', await val('amphur'));

// 4. Keyboard: ArrowDown to the second row, Enter
await open();
// Keys are spaced like a person types: EventSystemManager drops a second
// keydown that arrives within 1/60 s of the previous one
await tab.keyboard.press('ArrowDown');
await sleep(60);
await tab.keyboard.press('Enter');
await sleep(150);
check('ลูกศรลง + Enter → จังหวัดของแถวที่ 2', await val('province') === 'เชียงใหม่', await val('province'));
check('ลูกศรลง + Enter → อำเภอของแถวที่ 2', await val('amphur') === 'เมืองเชียงใหม่', await val('amphur'));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
