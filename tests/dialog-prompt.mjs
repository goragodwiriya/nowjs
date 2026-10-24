/**
 * Proof that DialogManager.prompt() can actually be typed into.
 *
 * Runs the real built bundle in a real browser, so what is proven here is what
 * ships — not a mock of it.
 *
 * Regression guarded: a prompt opened WITH a message used to lose its <input>,
 * because the message replaced the whole .dialog-body the input lived in. The
 * dialog then looked like an alert and every OK resolved to null, so callers
 * could never tell "typed nothing" from "cancelled".
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here+'../Now/dist/now.core.min.js';
const CSS = here+'../Now/dist/now.core.min.css';

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

/** Open a prompt, type `typed` (null = leave untouched), then press OK or Cancel. */
const run = async (message, typed, button) => {
  await tab.evaluate((message) => {
    window.__answer = undefined;
    DialogManager.prompt(message, '', 'Title').then(v => {
      window.__answer = v;
    });
  }, message);
  await sleep(400);

  const shape = await tab.evaluate(() => {
    const dialog = document.querySelector('.dialog');
    const input = dialog.querySelector('.dialog-input');
    return {
      hasInput: !!input,
      visible: !!input && input.offsetParent !== null,
      body: dialog.querySelector('.dialog-body').textContent.trim(),
      buttons: [...dialog.querySelectorAll('.dialog-footer button')].map(b => b.textContent.trim())
    };
  });

  if (typed !== null) {
    await tab.evaluate((typed) => {
      const input = document.querySelector('.dialog .dialog-input');
      input.focus();
      input.value = typed;
      input.dispatchEvent(new Event('input', {bubbles: true}));
    }, typed);
  }

  await tab.evaluate((button) => {
    const buttons = [...document.querySelectorAll('.dialog .dialog-footer button')];
    const target = buttons.find(b => b.textContent.trim().toLowerCase() === button);
    target.click();
  }, button);
  await sleep(500);

  const answer = await tab.evaluate(() => window.__answer);
  return {shape, answer};
};

// 1. A prompt WITH a message still has a usable input (the regression)
const typedCase = await run('Why is this account unreachable?', 'moved abroad', 'ok');
check('keeps the input when a message is given', typedCase.shape.hasInput);
check('the input is actually visible on screen', typedCase.shape.visible);
check('shows the message next to the input',
  typedCase.shape.body.includes('Why is this account unreachable?'), typedCase.shape.body);
check('OK resolves with what was typed',
  typedCase.answer === 'moved abroad', JSON.stringify(typedCase.answer));

// 2. Cancel still means cancel
const cancelled = await run('Why is this account unreachable?', 'ignored text', 'cancel');
check('Cancel resolves to null', cancelled.answer === null, JSON.stringify(cancelled.answer));

// 3. OK with an empty input is an empty string, not null — callers can tell
//    "typed nothing" from "cancelled"
const empty = await run('Why is this account unreachable?', null, 'ok');
check('OK without typing resolves to an empty string',
  empty.answer === '', JSON.stringify(empty.answer));

// 4. alert/confirm still put their message in the body as before
const alertBody = await tab.evaluate(async () => {
  DialogManager.alert('plain alert message', 'Title');
  await new Promise(r => setTimeout(r, 300));
  const dialog = document.querySelector('.dialog');
  const body = dialog.querySelector('.dialog-body');
  const text = body.textContent.trim();
  [...document.querySelectorAll('.dialog .dialog-footer button')].pop().click();
  return {text, hasMessageBox: !!body.querySelector('.dialog-message')};
});
check('alert keeps writing into .dialog-body', alertBody.text === 'plain alert message', alertBody.text);
check('alert gains no extra wrapper', alertBody.hasMessageBox === false);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
