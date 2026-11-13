/**
 * Regressions found by running the playground's example tests (2026-11-06).
 *
 * Runs the real built bundle in a real browser. Each block names the bug it
 * guards against.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here + '../Now/dist/now.core.min.js';
const CSS = here + '../Now/dist/now.core.min.css';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const files = {'/': [page, 'text/html'], '/core.js': [readFileSync(CORE, 'utf8'), 'application/javascript'], '/core.css': [readFileSync(CSS, 'utf8'), 'text/css']};
  const file = files[req.url];
  if (!file) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': `${file[1]}; charset=utf-8`});
  res.end(file[0]);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

// --- Utils -------------------------------------------------------------------
const utils = await tab.evaluate(async () => {
  const date = new Date('2024-01-01T00:00:00Z');
  const clone = Utils.object.deepClone({when: date, list: [date]});

  // debounceAsync: earlier calls of a burst used to stay pending forever
  let runs = 0;
  const debounced = Utils.function.debounceAsync(async (x) => {
    runs++;
    return x * 2;
  }, 20);
  const all = await Promise.race([
    Promise.all([debounced(1), debounced(2), debounced(3)]),
    new Promise(r => setTimeout(() => r('timeout'), 1000))
  ]);
  const failing = Utils.function.debounceAsync(async () => {
    throw new Error('nope');
  }, 10);
  const rejected = await Promise.allSettled([failing(), failing()]);

  return {
    dateIsDate: clone.when instanceof Date && clone.when.getTime() === date.getTime() && clone.when !== date,
    nestedDate: clone.list[0] instanceof Date,
    all, runs,
    rejected: rejected.map(r => r.status),
    basename: [Utils.path.basename('/path/to/dir/'), Utils.path.basename('/path/to/file.txt'), Utils.path.basename('a//')]
  };
});
check('deepClone copies a Date as a Date', utils.dateIsDate && utils.nestedDate);
check('debounceAsync settles every call of a burst with the one result', JSON.stringify(utils.all) === '[6,6,6]' && utils.runs === 1, JSON.stringify(utils));
check('debounceAsync rejects every call of a burst when the run fails', utils.rejected.join() === 'rejected,rejected', utils.rejected.join());
check('basename ignores a trailing slash', utils.basename.join() === 'dir,file.txt,a', utils.basename.join());

// --- EventSystemManager -----------------------------------------------------------
const events = await tab.evaluate(async () => {
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const zone = document.createElement('div');
  const other = document.createElement('div');
  document.body.append(zone, other);

  EventSystemManager.addHandler(zone, 'dragover', e => e.preventDefault());
  const dragover = new DragEvent('dragover', {bubbles: true, cancelable: true});
  zone.dispatchEvent(dragover);

  const moves = [];
  EventSystemManager.addHandler(zone, 'mousemove', e => moves.push(e.originalEvent.clientX));
  [1, 2, 3].forEach(x => zone.dispatchEvent(new MouseEvent('mousemove', {bubbles: true, clientX: x})));
  const beforeFrame = moves.length;
  await frame();

  let zoneScrolls = 0;
  let windowScrolls = 0;
  EventSystemManager.addHandler(zone, 'scroll', () => zoneScrolls++);
  EventSystemManager.addHandler(window, 'scroll', () => windowScrolls++);
  other.dispatchEvent(new Event('scroll'));
  zone.dispatchEvent(new Event('scroll'));

  zone.remove();
  other.remove();
  return {prevented: dragover.defaultPrevented, beforeFrame, moves, zoneScrolls, windowScrolls};
});
check('dragover handlers run during the event, so preventDefault() lets files be dropped', events.prevented);
check('batched mousemove handlers wait for the next frame', events.beforeFrame === 0);
check('batched mousemove handlers do run, once per frame, with the latest event', JSON.stringify(events.moves) === '[3]', JSON.stringify(events.moves));
check('a scroll handler on an element ignores other elements\' scrolls', events.zoneScrolls === 1, events.zoneScrolls);
check('a scroll handler on window still hears every scroll', events.windowScrolls === 2, events.windowScrolls);

// --- ElementFactory and the field factories -------------------------------------------
const fields = await tab.evaluate(async () => {
  const text = ElementManager.create('text', {id: 'fx-text', wrapper: 'div', label: 'Name', comment: 'Hint'});
  const structural = ['wrapper', 'label', 'comment'].map(key => text.element[key] instanceof Element);
  const inputHandlers = EventSystemManager.state.elementHandlers.get(text.element)?.get('input')?.size;

  const currency = ElementManager.create('currency', {id: 'fx-cur', showSymbol: true, symbol: '$'});
  const precision = currency.precision;
  currency.symbol = '€';
  currency.symbolPosition = 'after';
  currency.value = '10';

  const mask = ElementManager.create('mask', {id: 'fx-mask', format: 'tel', value: '1234567890'});

  return {structural, inputHandlers, precision, symbolValue: currency.value, mask: mask.value};
});
check('element.wrapper, .label and .comment stay the built nodes', fields.structural.every(Boolean), JSON.stringify(fields.structural));
// Two input handlers belong to a text field: the base validation one and the
// text factory's own. Binding twice made it three (validation ran twice).
check('a text field binds its input handlers once', fields.inputHandlers === 2, fields.inputHandlers);
check('a currency field reports its precision (2)', fields.precision === 2, fields.precision);
check('instance.<option> = value takes effect (currency symbol)', fields.symbolValue === '10.00€', fields.symbolValue);
check('a mask field shows the value it was created with masked', fields.mask === '12-3456-7890', fields.mask);

const groups = await tab.evaluate(() => {
  const select = SelectElementFactory.create({
    id: 'fx-groups',
    placeholder: 'Pick',
    options: [
      {label: 'Fruit', options: [{value: 'a', text: 'Apple'}, {value: 'b', text: 'Banana'}]},
      {label: 'Veg', options: [{value: 'c', text: 'Carrot'}]}
    ]
  }).element;
  return {groups: select.querySelectorAll('optgroup').length, options: select.options.length, placeholder: select.options[0].dataset.placeholder};
});
check('SelectElementFactory.create() renders grouped options as <optgroup>', groups.groups === 2 && groups.options === 4 && groups.placeholder === 'true', JSON.stringify(groups));

// --- SearchElementFactory ----------------------------------------------------------------
const search = await tab.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const queries = [];
  const field = ElementManager.create('search', {
    id: 'fx-search',
    wrapper: 'div',
    minLength: 1,
    searchDelay: 40,
    onSearch: async (q) => {
      queries.push(q);
      await wait(q === 'a' ? 120 : 10);
      return q === 'a' ? ['stale'] : ['<img src=x onerror="window.__xss=1">Apple', 'Banana'];
    }
  });
  document.body.appendChild(field.wrapper);
  const type = (value) => {
    field.element.value = value;
    field.element.dispatchEvent(new Event('input', {bubbles: true}));
  };

  type('a');
  await wait(60);       // 'a' is now searching (slow)
  type('ap');
  await wait(10);
  type('app');
  await wait(250);

  const container = field.element.resultsContainer;
  const texts = [...container.querySelectorAll('.search-result-item')].map(li => li.textContent);
  const key = k => field.element.dispatchEvent(new KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true}));
  key('ArrowDown');
  key('ArrowDown');
  const active = container.querySelector('.search-result-item.active')?.textContent;
  key('Enter');
  const picked = field.element.value;

  type('b');
  await wait(100);
  key('Escape');

  return {
    wrapperClass: field.wrapper.classList.contains('search'),
    queries, texts, xss: window.__xss === 1, active, picked,
    closedByEscape: container.style.display === 'none'
  };
});
check('a search field built with a wrapper gets the "search" class', search.wrapperClass);
check('typing searches after the delay, once per burst', JSON.stringify(search.queries.slice(0, 2)) === '["a","app"]', JSON.stringify(search.queries));
check('a slower answer to an earlier query does not replace the newer results', search.texts.length === 2 && !search.texts.includes('stale'), JSON.stringify(search.texts));
check('result text is escaped, not run as HTML', !search.xss && search.texts[0].startsWith('<img'), JSON.stringify(search.texts[0]));
check('arrow keys move through the results and Enter picks one', search.active === 'Banana' && search.picked === 'Banana', JSON.stringify(search));
check('Escape closes the results', search.closedByEscape);

// --- MenuManager ---------------------------------------------------------------------------
const menu = await tab.evaluate(async () => {
  const nav = document.createElement('nav');
  nav.className = 'topmenu responsive-menu';
  nav.innerHTML = '<ul><li><button>Sub</button><ul><li><a href="#">x</a></li></ul></li></ul>';
  document.body.appendChild(nav);
  const instance = await MenuManager.createMenu(nav);
  if (!instance) return 'no menu';
  await MenuManager.openMenu(instance);
  await MenuManager.openSubmenu(instance, instance.elements.submenus[0]);
  const closing = MenuManager.closeMenu(instance);
  MenuManager.destroyMenu(instance.id);
  nav.remove();
  try {
    await closing;
    return 'ok';
  } catch (error) {
    return String(error);
  }
});
check('destroying a menu while it closes does not throw', menu === 'ok', menu);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
