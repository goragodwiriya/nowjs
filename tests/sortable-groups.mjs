/**
 * Sortable: dragging between the lists of a group, and the instance lifecycle.
 *
 * What broke:
 * - Releasing an item outside every list of its group left it in the last list
 *   the pointer had passed, and auto-saved it there — on a kanban board a card
 *   dropped on a column that is not in the group landed in the column beside it.
 * - The original item only went transparent while its same-sized placeholder
 *   was added, so its list grew by one item and everything below jumped away
 *   from the pointer.
 * - A window scroll listener (bound anew, so destroy() never removed it) read
 *   pageY off a scroll event, got NaN, and stopped the edge auto-scroll on its
 *   first tick: the page only scrolled while the mouse kept moving.
 * - An instance created disabled never attached its listeners, so enable() did
 *   nothing and destroy() threw.
 * - Sortable.create() overwrote the options passed in code with its defaults
 *   (draggable '.item' became '[draggable="true"]', handle became undefined).
 * - Space never toggled the selection (e.key is ' ', not 'Space').
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 *
 *   cd tests && node sortable-groups.mjs
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here+'../Now/dist/now.core.min.js';

const list = (id, status) => `<div class="col" id="${id}" data-component="sortable" data-group="board" data-draggable=".card"
  data-status="${status}" data-sortable-api="/save" data-sortable-stage-attr="data-status" data-sortable-update-field="status">`;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title>
<style>
  body { margin: 0; font: 14px sans-serif; }
  .board { display: grid; grid-template-columns: repeat(3, 200px); gap: 60px; align-items: start; padding: 20px; }
  .col { display: flex; flex-direction: column; gap: 8px; min-height: 60px; padding: 8px; background: #eee; }
  .card { height: 40px; background: #fff; border: 1px solid #999; }
  .spacer { height: 3000px; }
</style></head><body>
<div class="board">
  ${list('a', 'todo')}<div class="card" data-id="1">1</div><div class="card" data-id="2">2</div><div class="card" data-id="3">3</div></div>
  ${list('b', 'doing')}</div>
  ${list('c', 'done')}</div>
</div>
<ul id="coded"><li class="it">x</li><li class="it">y</li></ul>
<ul id="off"><li class="it">p</li><li class="it">q</li><li class="it">r</li></ul>
<div class="spacer"></div>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

const saved = [];
const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (req.url === '/save') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      saved.push(body);
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, message: '', data: {}}));
    });
    return;
  }
  res.writeHead(204);
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
await tab.setViewport({width: 1000, height: 700});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 300));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const centre = (selector) => tab.$eval(selector, n => {
  const r = n.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
});
const ids = (id) => tab.$eval('#'+id, n => [...n.querySelectorAll('.card')].map(c => c.dataset.id).join(','));
/** Press on `from`, then visit each point in turn (viewport coordinates) and release. */
const drag = async (from, points, beforeRelease) => {
  await tab.mouse.move(from.x, from.y);
  await tab.mouse.down();
  await tab.mouse.move(from.x + 5, from.y + 5, {steps: 3});
  await sleep(100);
  for (const point of points) {
    await tab.mouse.move(point.x, point.y, {steps: 15});
    await sleep(150);
  }
  if (beforeRelease) {
    await beforeRelease();
  }
  await tab.mouse.up();
  await sleep(400);
};

// 1. Moving a card into another list of the group still works and saves
await drag(await centre('[data-id="1"]'), [await centre('#b')]);
check('a card dropped on another list of the group moves there', (await ids('b')) === '1', `a=${await ids('a')} b=${await ids('b')}`);
check('…and is saved with that list\'s value', saved.length === 1 && JSON.parse(saved[0]).status === 'doing' && JSON.parse(saved[0]).id === '1', saved.join(' | '));

// 2. Released outside every list: back where it came from, nothing saved
const ends = [];
await tab.evaluate(() => {
  window.__ends = [];
  document.addEventListener('sortable:end', e => window.__ends.push([e.detail.from.id, e.detail.to.id]));
});
const below = await tab.$eval('#c', n => {
  const r = n.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.bottom + 120};
});
let placeholderIn = null;
await drag(await centre('[data-id="2"]'), [await centre('#b'), await centre('#c'), below], async () => {
  placeholderIn = await tab.evaluate(() => document.querySelector('.sortable-placeholder')?.parentNode?.id || null);
});
ends.push(...await tab.evaluate(() => window.__ends));
check('released outside every list: the placeholder went back to the source list', placeholderIn === 'a', String(placeholderIn));
check('…the card stays in its place and nothing is saved', (await ids('a')) === '2,3' && (await ids('c')) === '' && saved.length === 1,
  `a=${await ids('a')} c=${await ids('c')} saved=${saved.length}`);
check('…sortable:end reports the same list', ends.length === 1 && ends[0][0] === 'a' && ends[0][1] === 'a', JSON.stringify(ends));

// 3. The dragged item gives its space to the placeholder instead of keeping it
const heights = {};
const source = await tab.$eval('[data-id="2"]', n => n.parentNode.id);
heights.before = await tab.$eval('#'+source, n => n.offsetHeight);
await drag(await centre('[data-id="2"]'), [], async () => {
  heights.during = await tab.$eval('#'+source, n => n.offsetHeight);
});
check('the source list keeps its height while dragging (no jump)', heights.before === heights.during, JSON.stringify(heights));

// 4. Holding the pointer still at the bottom edge keeps scrolling the page
await tab.evaluate(() => window.scrollTo(0, 0));
const start = await centre('[data-id="2"]');
await tab.mouse.move(start.x, start.y);
await tab.mouse.down();
await tab.mouse.move(start.x + 5, start.y + 5, {steps: 3});
await tab.mouse.move(start.x, 695, {steps: 10});
await sleep(900);
const scrolled = await tab.evaluate(() => window.scrollY);
await tab.mouse.move(start.x, 300, {steps: 5});
await tab.mouse.up();
await sleep(300);
await tab.evaluate(() => window.scrollTo(0, 0));
check('auto-scroll keeps going while the pointer rests at the edge', scrolled > 150, `scrollY=${scrolled}`);

// 5. Sortable.create() keeps the options given in code
const coded = await tab.evaluate(() => {
  const s = Sortable.create(document.getElementById('coded'), {draggable: '.it', handle: '.grip'});
  return {draggable: s.options.draggable, handle: s.options.handle};
});
check('Sortable.create() keeps draggable/handle passed in code', coded.draggable === '.it' && coded.handle === '.grip', JSON.stringify(coded));

// 6. Created disabled → enable() works · destroy() is safe and lets go of the element
await tab.evaluate(() => {
  window.__off = new Sortable(document.getElementById('off'), {draggable: '.it', disabled: true});
  window.__off.enable();
});
const p = await centre('#off .it:first-child');
const r = await tab.$eval('#off .it:last-child', n => {
  const b = n.getBoundingClientRect();
  return {x: b.left + 10, y: b.bottom - 2};
});
await drag(p, [r]);
const offOrder = await tab.$eval('#off', n => [...n.children].map(li => li.textContent).join(''));
check('an instance created disabled can be enabled', offOrder === 'qrp', offOrder);
const lifecycle = await tab.evaluate(() => {
  const out = {};
  try {
    new Sortable(document.createElement('div'), {disabled: true}).destroy();
    out.disabledDestroy = 'ok';
  } catch (e) {
    out.disabledDestroy = e.message;
  }
  const column = document.getElementById('c');
  const instance = Sortable.getInstance(column);
  instance.destroy();
  out.registry = Sortable.getInstance(column) === null;
  out.group = !Sortable.groups.board.includes(instance);
  out.property = column._sortableInstance === undefined;
  try {
    instance.destroy();
    out.twice = 'ok';
  } catch (e) {
    out.twice = e.message;
  }
  return out;
});
check('destroy() of a disabled instance does not throw', lifecycle.disabledDestroy === 'ok', lifecycle.disabledDestroy);
check('destroy() leaves the registry, the group and the element', lifecycle.registry && lifecycle.group && lifecycle.property, JSON.stringify(lifecycle));
check('destroy() twice is harmless', lifecycle.twice === 'ok', lifecycle.twice);

// 7. Space toggles the selection of the focused item
const selected = await tab.evaluate(() => {
  const card = document.querySelector('[data-id="3"]');
  card.tabIndex = 0;
  card.focus();
  let fired = null;
  card.addEventListener('sortable:select', e => fired = e.detail.selected, {once: true});
  card.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true, cancelable: true}));
  return {cls: card.classList.contains('selected'), fired};
});
check('Space toggles the selection and fires sortable:select', selected.cls && selected.fired === true, JSON.stringify(selected));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(failed ? `\n${failed} FAILED` : '\nALL OK');
process.exit(failed ? 1 : 0);
