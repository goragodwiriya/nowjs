/**
 * Proof that a second element carrying an id already used on the page (a modal
 * over a form with the same field ids) does not take over the first one.
 *
 * ElementManager indexes instances by id as well as by element. It used to treat
 * any other element under the same id as stale and destroy its instance — the
 * form's autocomplete silently turned back into a plain input, and
 * getInstanceByElement() on the form's field returned the modal field's instance,
 * so script writes landed in the modal.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="page">
  <input type="text" id="code" name="code" data-autocomplete="true" data-source="/codes" data-min-length="2">
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
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (req.url.startsWith('/codes')) {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: [{value: 'C1', text: 'C1 Alpha'}]}));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url); res.writeHead(404);
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
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

/** State of the form's own field, read without going through the id */
const formField = () => tab.evaluate(() => {
  const el = document.querySelector('#page input[name="code_text"], #page input[name="code"]:not([type="hidden"])');
  const inst = ElementManager.getInstanceByElement(el);
  return {
    name: el.getAttribute('name'),
    hidden: !!document.querySelector('#page input[type="hidden"][name="code"]'),
    ownInstance: !!inst && inst.element === el,
    value: el.value
  };
});

// 1. A modal-like container with the same id is scanned while the form is on screen
await tab.evaluate(() => {
  const box = document.createElement('div');
  box.id = 'box';
  box.innerHTML = '<form><input type="text" id="code" name="code"></form>';
  document.body.appendChild(box);
  ElementManager.scan(box);
});

let state = await formField();
check('the form field stays an autocomplete', state.name === 'code_text' && state.hidden, JSON.stringify(state));
check('the form field keeps its own instance', state.ownInstance, JSON.stringify(state));

check('the second element never gets the form field’s instance', await tab.evaluate(() => {
  const boxEl = document.querySelector('#box input');
  const inst = ElementManager.getInstanceByElement(boxEl);
  return !inst || inst.element === boxEl;
}));

// 2. A write through the first element with that id reaches the form, not the box
await tab.evaluate(() => {
  const el = document.getElementById('code');
  ElementManager.getInstanceByElement(el).value = {value: 'C1', text: 'C1 Alpha'};
});
state = await formField();
check('a write through getInstanceByElement lands in the form field', state.value === 'C1 Alpha', state.value);
check('the box field is left alone', await tab.evaluate(() => document.querySelector('#box input').value) === '');

// 3. Closing the box tears down only what the box created
await tab.evaluate(() => {
  const box = document.getElementById('box');
  box.remove();
  ElementManager.destroyContainer(box);
});
state = await formField();
check('closing the box leaves the form field enhanced', state.name === 'code_text' && state.hidden && state.ownInstance, JSON.stringify(state));
check('the id finds the form field again after the box is gone', await tab.evaluate(() =>
  ElementManager.getInstance('code')?.element === document.querySelector('#page input[name="code_text"]')));

// 4. A genuinely stale instance (its element left the page) is still replaced
const replaced = await tab.evaluate(() => {
  const old = document.querySelector('#page input[name="code_text"]');
  const oldInstance = ElementManager.getInstanceByElement(old);
  const form = document.getElementById('page');
  form.innerHTML = '<input type="text" id="code" name="code" data-autocomplete="true" data-source="/codes" data-min-length="2">';
  ElementManager.scan(form);
  const fresh = document.getElementById('code');
  const inst = ElementManager.getInstance('code');
  return {fresh: inst?.element === fresh, notOld: inst !== oldInstance, name: fresh.getAttribute('name')};
});
check('a stale instance whose element left the page is replaced', replaced.fresh && replaced.notOld && replaced.name === 'code_text', JSON.stringify(replaced));

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
