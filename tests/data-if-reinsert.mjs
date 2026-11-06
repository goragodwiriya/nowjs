/**
 * A data-if that was false must come back when the template is processed again
 * with data that makes it true.
 *
 * Why this matters: a false data-if detaches its element and leaves a comment.
 * The directive walk only meets elements still in the tree, so a second pass
 * with new data never reached the detached one — while elements still shown
 * were re-evaluated and could be removed. A GET search form with
 * data-submit-target therefore never showed its results when the page opened
 * with none ("no rooms yet" → Search → nothing), and its "no result" message
 * never appeared either.
 *
 * Also covered: the element goes back where it was even when the sibling it
 * stood before was removed since, a list that did not change keeps each row's
 * own item, and a false data-if still keeps its subtree out of the page.
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="find" action="/find" method="get" data-load-api="/find" data-load-query-params="true"
      data-submit-target="#results" data-show-success-inline="false" data-show-success-in-notification="false">
  <input type="text" id="q" name="q" data-attr="value:q">
  <button type="submit" id="go">go</button>
  <div id="results">
    <p class="summary" data-text="state.summary"></p>
    <section class="grid" data-if="state.items && state.items.length > 0" data-for="item in state.items">
      <template><article data-text="item.name"></article></template>
    </section>
    <div class="none" data-if="state.searched && (!state.items || state.items.length === 0)">none</div>
    <div class="hint" data-if="!state.searched">hint</div>
  </div>
</form>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
</script>
</body></html>`;

const rooms = {a: ['Room A', 'Room B'], z: []};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (url.pathname === '/find') {
    const q = url.searchParams.get('q') || '';
    const searched = q !== '';
    const items = searched ? (rooms[q] || []).map(name => ({name})) : [];
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: {q, searched, items, summary: searched ? `${items.length} found` : ''}}));
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
  const inst = window.FormManager && FormManager.getInstanceByElement(document.querySelector('form'));
  return inst && inst.state.dataOnLoadCalled;
}, {timeout: 5000});
await sleep(300);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const view = () => tab.evaluate(() => ({
  rows: [...document.querySelectorAll('#results .grid article')].map(a => a.textContent),
  grid: !!document.querySelector('#results .grid'),
  none: !!document.querySelector('#results .none'),
  hint: !!document.querySelector('#results .hint'),
  summary: document.querySelector('#results .summary').textContent,
  order: [...document.querySelectorAll('#results > *')].map(e => e.className)
}));
// FormManager ignores a second submit within 2 s (doubleSubmitTimeout)
const search = async (q) => {
  await tab.evaluate((q) => { document.getElementById('q').value = q; }, q);
  const response = tab.waitForResponse(r => r.url().includes('/find?'), {timeout: 5000});
  await tab.evaluate(() => document.getElementById('go').click());
  await response;
  await sleep(2300);
  return view();
};

// 1. ฟอร์มค้นหาที่แสดงผลในหน้าเดิม (data-submit-target)
let v = await view();
check('เปิดหน้า: มีแค่คำแนะนำ (ผลและข้อความไม่พบถูกถอด)', v.hint && !v.grid && !v.none, JSON.stringify(v));
v = await search('a');
check('ค้นแล้วมีผล: รายการกลับมาและวาดครบ', v.grid && v.rows.join() === 'Room A,Room B' && !v.hint && !v.none, JSON.stringify(v));
v = await search('z');
check('ค้นแล้วไม่พบ: ข้อความไม่พบกลับมา รายการถูกถอด', v.none && !v.grid && !v.hint && v.summary === '0 found', JSON.stringify(v));
v = await search('a');
check('ค้นอีกครั้งมีผล: รายการกลับมาอีก', v.grid && v.rows.join() === 'Room A,Room B' && !v.none, JSON.stringify(v));
check('องค์ประกอบกลับมาตรงตำแหน่งเดิม', v.order.join() === 'summary,grid', JSON.stringify(v.order));

// 2. ประมวล directive ซ้ำตรง ๆ
const direct = await tab.evaluate(() => {
  const host = document.createElement('div');
  // ไม่มีช่องว่างคั่น: พี่น้องถัดไปของ .a คือ .b ซึ่งจะถูกถอดเองในรอบถัดไป
  host.innerHTML = '<p class="a" data-if="show"><b data-text="label"></b></p><p class="b" data-if="!show"></p><p class="c"></p>';
  document.body.appendChild(host);
  const run = (state) => {
    TemplateManager.processDataDirectives(host, {state});
    return [...host.children].map(e => e.className + (e.firstElementChild ? ':' + e.firstElementChild.textContent : '')).join();
  };
  return [run({show: false, label: 'x'}), run({show: true, label: 'y'}), run({show: false, label: 'z'}), run({show: true, label: 'w'})];
});
check('ซ่อน → แสดง → ซ่อน → แสดง ตามข้อมูลแต่ละรอบ', JSON.stringify(direct) === JSON.stringify(['b,c', 'a:y,c', 'b,c', 'a:w,c']), JSON.stringify(direct));

// 3. แถวของ data-for ที่ไม่ได้วาดใหม่ (รายการเดิม) ยังใช้ item ของแถวตัวเอง
const rows = await tab.evaluate(() => {
  const host = document.createElement('div');
  host.innerHTML = '<ul data-for="item in list"><template><li><i data-if="item.on && flag" data-text="item.n"></i></li></template></ul>';
  document.body.appendChild(host);
  const list = [{n: '1', on: true}, {n: '2', on: false}, {n: '3', on: true}];
  const run = (flag) => {
    TemplateManager.processDataDirectives(host, {state: {list, flag}});
    return [...host.querySelectorAll('li')].map(li => li.textContent).join('|');
  };
  return [run(false), run(true)];
});
check('แถวเดิมกลับมาด้วย item ของตัวเอง', JSON.stringify(rows) === JSON.stringify(['||', '1||3']), JSON.stringify(rows));

// 4. data-if ที่ยังเท็จไม่ปล่อยลูกเข้าหน้า
const stillOut = await tab.evaluate(() => {
  const host = document.createElement('div');
  host.innerHTML = '<div data-if="ok"><span class="inner" data-text="t"></span></div>';
  document.body.appendChild(host);
  TemplateManager.processDataDirectives(host, {state: {ok: false, t: 'a'}});
  TemplateManager.processDataDirectives(host, {state: {ok: false, t: 'b'}});
  return host.querySelectorAll('.inner').length;
});
check('เงื่อนไขยังเท็จ: ไม่ถูกใส่กลับ', stillOut === 0, String(stillOut));

check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
