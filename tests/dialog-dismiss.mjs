/**
 * Proof that a dialog can always be left, sits in the middle of the screen, and
 * does not run what a message contains.
 *
 * Runs the real built bundle in a real browser and presses real keys.
 *
 * Regressions guarded: closing with Escape, the close button or the backdrop left
 * the promise of alert/confirm/prompt pending forever; dialogs were measured before
 * being in the page and sat off to the right; a message string ran `onerror`
 * attributes; templates given to init() wiped out the built-in ones; destroy() left
 * Escape bound and init() unable to bring the manager back.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here + '../Now/dist/now.core.min.js';
const CSS = here + '../Now/dist/now.core.min.css';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<button id="opener">open</button>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({
  environment: 'production', allowEval: false, auth: {enabled: false},
  dialog: {templates: {notice: '<div class="dialog-body"></div><div class="dialog-footer"></div>'}}
});
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
await tab.setViewport({width: 1200, height: 800});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Open a dialog, close it the way `close` says, and report what its promise gave. */
const dismiss = async (kind, how) => {
  await tab.evaluate((kind) => {
    window.__answer = 'pending';
    DialogManager[kind]('message', kind === 'prompt' ? 'typed' : 'Title').then(v => {
      window.__answer = v;
    });
  }, kind);
  await sleep(60);
  if (how === 'escape') await tab.keyboard.press('Escape');
  if (how === 'close') await tab.click('.dialog .dialog-close');
  if (how === 'backdrop') await tab.mouse.click(5, 5);
  await sleep(350);
  return tab.evaluate(() => window.__answer);
};

for (const how of ['escape', 'close', 'backdrop']) {
  check(`confirm closed with ${how} resolves to false`, (await dismiss('confirm', how)) === false);
  check(`prompt closed with ${how} resolves to null`, (await dismiss('prompt', how)) === null);
  check(`alert closed with ${how} resolves`, (await dismiss('alert', how)) === true);
}

// Custom buttons replace the ones that answer, but the promise still settles
await tab.evaluate(() => {
  window.__answer = 'pending';
  DialogManager.confirm('message', 'Title', {buttons: {x: {text: 'X', callback: () => {}}}}).then(v => {
    window.__answer = v;
  });
});
await sleep(60);
await tab.click('.dialog .dialog-footer button');
await sleep(350);
check('confirm with its buttons replaced still settles', (await tab.evaluate(() => window.__answer)) === false);

// A button answers once, however fast it is pressed
const clicks = await tab.evaluate(async () => {
  let runs = 0;
  const dialog = DialogManager.custom({title: 'T', message: 'M', buttons: {ok: {text: 'OK', callback: () => runs++}}});
  await new Promise(r => setTimeout(r, 60));
  const button = dialog.querySelector('.dialog-footer button');
  button.click();
  button.click();
  await new Promise(r => setTimeout(r, 300));
  return runs;
});
check('clicking twice while it closes runs the callback once', clicks === 1, clicks);

// An Enter held down before the dialog opened does not answer it
await tab.evaluate(() => {
  window.__answer = 'pending';
  DialogManager.confirm('delete?', 'Title').then(v => {
    window.__answer = v;
  });
});
await sleep(60);
await tab.keyboard.down('Enter');   // the press that belongs to the dialog
await tab.keyboard.up('Enter');
await sleep(350);
check('a fresh Enter answers the confirm', (await tab.evaluate(() => window.__answer)) === true);

await tab.evaluate(() => {
  window.__answer = 'pending';
  DialogManager.confirm('delete?', 'Title').then(v => {
    window.__answer = v;
  });
});
await sleep(60);
const repeat = await tab.evaluate(() => {
  const event = new KeyboardEvent('keydown', {key: 'Enter', repeat: true, bubbles: true, cancelable: true});
  document.querySelector('.dialog .btn-primary').dispatchEvent(event);
  return event.defaultPrevented;
});
check('a held Enter (key repeat) is ignored', repeat === true);
await tab.keyboard.press('Escape');
await sleep(350);

// In the middle of the screen
const position = await tab.evaluate(async () => {
  const dialog = DialogManager.custom({title: 'T', message: 'M', buttons: {ok: {text: 'OK', callback: () => {}}}});
  await new Promise(r => setTimeout(r, 60));
  const rect = dialog.getBoundingClientRect();
  DialogManager.close(dialog);
  return {left: rect.left, right: innerWidth - rect.right, top: rect.top, bottom: innerHeight - rect.bottom};
});
await sleep(300);
check('the dialog is centred', Math.abs(position.left - position.right) <= 1 && Math.abs(position.top - position.bottom) <= 1, JSON.stringify(position));

// Messages do not run code
const message = await tab.evaluate(async () => {
  DialogManager.alert(`<b>bold</b><img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script>
    <a id="bad" href="java\nscript:window.__xss=3">x</a><a id="good" href="/page">y</a><iframe srcdoc="<script>parent.__xss=4<\/script>"></iframe>`, 'T');
  await new Promise(r => setTimeout(r, 100));
  const body = document.querySelector('.dialog .dialog-body');
  const out = {
    xss: window.__xss,
    bold: !!body.querySelector('b'),
    img: body.querySelector('img')?.hasAttribute('onerror'),
    script: !!body.querySelector('script'),
    iframe: !!body.querySelector('iframe'),
    badHref: body.querySelector('#bad')?.hasAttribute('href'),
    goodHref: body.querySelector('#good')?.getAttribute('href')
  };
  DialogManager.closeAll();
  return out;
});
await sleep(300);
check('a message string cannot run code', message.xss === undefined && !message.img && !message.script && !message.iframe && !message.badHref, JSON.stringify(message));
check('ordinary markup in a message stays', message.bold && message.goodHref === '/page', JSON.stringify(message));

// Templates from init() are added to the built-in ones
const templates = await tab.evaluate(async () => {
  const notice = DialogManager.custom({template: 'notice', message: 'hello'});
  const out = {notice: notice.querySelector('.dialog-body').textContent, close: !!notice.querySelector('.dialog-close')};
  DialogManager.close(notice);
  DialogManager.alert('built in', 'T');
  await new Promise(r => setTimeout(r, 60));
  out.alert = document.querySelector('.dialog:not(.hiding) .dialog-body').textContent;
  DialogManager.closeAll();
  return out;
});
await sleep(300);
check('a template from init() works', templates.notice === 'hello' && templates.close === false, JSON.stringify(templates));
check('the built-in templates survive it', templates.alert === 'built in', JSON.stringify(templates));

// Stacked dialogs give focus back one layer at a time
const stacked = await tab.evaluate(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.getElementById('opener').focus();
  const first = DialogManager.custom({title: '1', buttons: {a: {text: 'A', callback: () => {}}}});
  await wait(60);
  const firstButton = first.querySelector('.dialog-footer button');
  const second = DialogManager.custom({title: '2', buttons: {b: {text: 'B', callback: () => {}}}});
  await wait(60);
  DialogManager.close(second);
  await wait(300);
  const afterSecond = document.activeElement === firstButton;
  DialogManager.close(first);
  await wait(300);
  return {afterSecond, afterFirst: document.activeElement?.id};
});
check('closing the top dialog returns focus to the one below', stacked.afterSecond, JSON.stringify(stacked));
check('closing the last dialog returns focus to what opened it', stacked.afterFirst === 'opener', JSON.stringify(stacked));

// destroy() and init() again
const restart = await tab.evaluate(async () => {
  DialogManager.destroy();
  const a = DialogManager.custom({title: 'after destroy', buttons: {ok: {text: 'OK', callback: () => {}}}});
  const hadEscape = !!DialogManager._keydownHandler;
  DialogManager.close(a);
  await new Promise(r => setTimeout(r, 300));
  await DialogManager.init();
  return {hadEscape, escapeBack: !!DialogManager._keydownHandler, built: !!a.querySelector('.dialog-title')};
});
check('destroy() unbinds Escape', restart.hadEscape === false, JSON.stringify(restart));
check('init() brings the manager back after destroy()', restart.escapeBack && restart.built, JSON.stringify(restart));
check('Escape works again', (await dismiss('confirm', 'escape')) === false);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
