/**
 * Proof that a dialog opens with focus on its default button, so Enter
 * answers it straight away.
 *
 * Runs the real built bundle in a real browser and presses real keys.
 *
 * Regression guarded: show() looked for `.dialog-button-primary`, a class no
 * button ever had, so focus fell through to the first focusable element — the
 * header close button. Enter then closed the dialog instead of pressing OK.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here+'../Now/dist/now.core.min.js';
const CSS = here+'../Now/dist/now.core.min.css';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<button id="opener">open</button>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
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
  if (req.url === '/core.css') {
    res.writeHead(200, {'Content-Type': 'text/css; charset=utf-8'});
    return res.end(readFileSync(CSS, 'utf8'));
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

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Describe whatever currently holds focus inside the open dialog. */
const focused = () => tab.evaluate(() => {
  const el = document.activeElement;
  if (!el || !el.closest('.dialog')) return {inDialog: false, tag: el?.tagName};
  return {
    inDialog: true,
    tag: el.tagName,
    isClose: el.classList.contains('dialog-close'),
    text: el.textContent.trim(),
    isInput: el.classList.contains('dialog-input'),
    selected: el.classList.contains('dialog-input')
      ? el.value.substring(el.selectionStart, el.selectionEnd)
      : null
  };
});

/** Open a dialog from the page, as a click on #opener would. */
const open = (fn) => tab.evaluate((src) => {
  window.__answer = undefined;
  document.getElementById('opener').focus();
  // eslint-disable-next-line no-new-func
  new Function(src)();
}, fn);

const answer = () => tab.evaluate(() => window.__answer);
const openDialogs = () => tab.evaluate(() => document.querySelectorAll('.dialog').length);

// 1. alert: focus on OK, Enter dismisses it through OK
await open(`DialogManager.alert('saved', 'Title').then(v => { window.__answer = v; });`);
await sleep(50);
let f = await focused();
check('alert focuses its OK button, not the close button',
  f.inDialog && f.tag === 'BUTTON' && !f.isClose && f.text === 'OK', JSON.stringify(f));
await tab.keyboard.press('Enter');
await sleep(400);
check('Enter on alert resolves through OK', (await answer()) === true, JSON.stringify(await answer()));
check('alert is gone after Enter', (await openDialogs()) === 0);

// 2. confirm: focus on Confirm, Enter confirms
await open(`DialogManager.confirm('delete?', 'Title').then(v => { window.__answer = v; });`);
await sleep(50);
f = await focused();
check('confirm focuses Confirm', f.inDialog && f.text === 'Confirm', JSON.stringify(f));
await tab.keyboard.press('Enter');
await sleep(400);
check('Enter on confirm resolves to true', (await answer()) === true, JSON.stringify(await answer()));

// 3. Escape still cancels a confirm even though focus sits on Confirm
await open(`DialogManager.confirm('delete?', 'Title').then(v => { window.__answer = v; });`);
await sleep(50);
await tab.keyboard.press('Escape');
await sleep(400);
check('Escape still closes the confirm', (await openDialogs()) === 0);

// 4. custom: `default: true` picks a button that is not .btn-primary
await open(`DialogManager.custom({
  title: 'Pick',
  message: 'which?',
  buttons: {
    keep: {text: 'Keep', class: 'btn-primary', callback: () => { window.__answer = 'keep'; }},
    later: {text: 'Later', default: true, callback: () => { window.__answer = 'later'; }}
  }
});`);
await sleep(50);
f = await focused();
check('custom: the button marked default:true gets focus', f.text === 'Later', JSON.stringify(f));
await tab.keyboard.press('Enter');
await sleep(400);
check('custom: Enter presses the default button', (await answer()) === 'later', JSON.stringify(await answer()));

// 5. a dialog with no footer buttons still lands focus on the close button
await open(`DialogManager.custom({title: 'Info', message: 'no buttons'});`);
await sleep(50);
f = await focused();
check('no footer buttons: falls back to the close button', f.isClose === true, JSON.stringify(f));
await tab.keyboard.press('Escape');
await sleep(400);

// 6. prompt: focus on the input with the default value already selected
await open(`DialogManager.prompt('name?', 'Somchai', 'Title').then(v => { window.__answer = v; });`);
await sleep(50);
f = await focused();
check('prompt focuses its input', f.isInput === true, JSON.stringify(f));
check('prompt selects the default value at once', f.selected === 'Somchai', JSON.stringify(f.selected));
await tab.keyboard.press('Enter');
await sleep(400);
check('Enter right away resolves with the default value',
  (await answer()) === 'Somchai', JSON.stringify(await answer()));

// 7. prompt: type over the selection, Enter submits what was typed
await open(`DialogManager.prompt('name?', 'Somchai', 'Title').then(v => { window.__answer = v; });`);
await sleep(50);
await tab.keyboard.type('Malee');
await tab.keyboard.press('Enter');
await sleep(400);
check('Enter in the prompt input submits the typed value',
  (await answer()) === 'Malee', JSON.stringify(await answer()));

// 8. closing gives focus back to what opened the dialog
const back = await tab.evaluate(() => document.activeElement?.id);
check('focus returns to the opener after close', back === 'opener', back);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
