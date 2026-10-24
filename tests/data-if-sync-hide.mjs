/**
 * A component inside a false data-if must never be created, and the elements
 * after it must still be rendered.
 *
 * Why this matters: data-for appends each clone to the document before it
 * processes data-if, which queues ComponentManager's MutationObserver. data-if
 * used to remove the element after `await`ing an (already resolved) animation
 * promise, so the observer ran first and created the component — a dashboard
 * whose blocks pick their kind with data-if created a graph inside every table
 * and calendar block, and each one fetched the block's URL ("Invalid series").
 *
 * Removing the element synchronously exposed a second bug: the directive walk
 * is a TreeWalker, which cannot climb out of a detached node, so every element
 * after the removed one was silently skipped (no data-text, no data-attr).
 *
 * Runs the real built bundle in a real browser.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const GRAPH = '../Now/dist/now.graph.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div data-component="api" data-endpoint="/blocks">
  <div id="list" data-for="block in blocks">
    <template>
      <section>
        <div class="slot" data-if="!block.kind || block.kind == 'graph'" data-component="graph" data-attr="data-type:block.type,data-url:block.url"></div>
        <p class="after" data-text="block.kind"></p>
        <div class="tail" data-if="block.kind == 'table'" data-attr="data-src:block.url"></div>
      </section>
    </template>
  </div>
</div>
<script src="/core.js"></script>
<script src="/graph.js"></script>
<script>
// GraphComponent watches the DOM with its own MutationObserver (as in an app)
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}})
  .then(() => window.GraphComponent.init());
</script>
</body></html>`;

const hits = {};
const json = (res, body) => {
  res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
  res.end(JSON.stringify(body));
};
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  hits[path] = (hits[path] || 0) + 1;
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(CORE, import.meta.url), 'utf8'));
  }
  if (path === '/graph.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(new URL(GRAPH, import.meta.url), 'utf8'));
  }
  if (path === '/blocks') {
    return json(res, {success: true, data: {blocks: [{kind: 'table', url: '/t1'}, {kind: 'graph', type: 'line', url: '/g1'}]}});
  }
  if (path === '/g1' || path === '/t1' || path === '/t2') {
    return json(res, {success: true, data: [{name: 'Sales', data: [{label: 'Jan', value: 1}, {label: 'Feb', value: 2}]}]});
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
await tab.waitForFunction(() => document.querySelectorAll('#list section').length === 2, {timeout: 5000});
await sleep(1500);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const state = await tab.evaluate(() => ({
  after: [...document.querySelectorAll('.after')].map(e => e.textContent.trim()),
  slots: document.querySelectorAll('.slot').length,
  tails: [...document.querySelectorAll('.tail')].map(e => e.getAttribute('data-src'))
}));

check('component ใน data-if ที่เป็นเท็จไม่ถูกสร้าง (ไม่มีคำขอ /t1)', !hits['/t1'], JSON.stringify(hits));
check('component ใน data-if ที่เป็นจริงทำงานตามปกติ', hits['/g1'] >= 1 && state.slots === 1, JSON.stringify(state));
check('องค์ประกอบที่ตามหลัง data-if ที่ถูกถอด ยังถูกวาด (data-text)', JSON.stringify(state.after) === '["table","graph"]', JSON.stringify(state.after));
check('data-if/data-attr ที่ตามหลังยังทำงาน', JSON.stringify(state.tails) === '["/t1"]', JSON.stringify(state.tails));
// ลำดับที่กำหนดได้แน่นอน: ต่อเข้า DOM ก่อน (MutationObserver ของ GraphComponent ถูกคิวไว้แล้ว)
// แล้วประมวล directive — เมื่อ processDataDirectives คืนค่า องค์ประกอบที่ data-if เป็นเท็จต้องหลุดแล้ว
const direct = await tab.evaluate(() => {
  const host = document.createElement('div');
  host.innerHTML = '<div class="a" data-if="show" data-component="graph" data-url="/t2"></div>'
    + '<p class="b" data-text="label"></p><i class="c" data-if="!show" data-attr="data-x:label"></i>';
  document.body.appendChild(host);
  TemplateManager.processDataDirectives(host, {state: {show: false, label: 'x'}});
  return {
    detachedNow: !host.querySelector('.a'),
    text: host.querySelector('.b').textContent,
    tail: host.querySelector('.c')?.getAttribute('data-x') || null
  };
});
await sleep(1000);
check('data-if ที่เป็นเท็จถอดองค์ประกอบทันที (ก่อน MutationObserver ทำงาน)', direct.detachedNow, JSON.stringify(direct));
check('…กราฟข้างในไม่ถูกสร้าง (ไม่มีคำขอ /t2)', !hits['/t2'], JSON.stringify(hits));
check('…องค์ประกอบถัดไปยังถูกประมวล', direct.text === 'x' && direct.tail === 'x', JSON.stringify(direct));
check('ไม่มี JS error', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r).length;
console.log(`\n ผ่าน ${results.length - failed}/${results.length}`);
process.exit(failed ? 1 : 0);
