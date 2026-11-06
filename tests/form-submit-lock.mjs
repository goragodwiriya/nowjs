/**
 * Proof of how FormManager guards against a double submit.
 *
 * It used to drop, without a word, every submit that came within two seconds of
 * the previous one — while the submit button was enabled again. A form that came
 * back with a validation error could be corrected, the button clicked, and
 * nothing happened. The guard is now the lock the visitor can see:
 *
 *   - while a submit is in flight every submit button is disabled and loading;
 *   - a failed submit unlocks at once, so it can be corrected and sent again;
 *   - a successful submit that navigates away stays locked until the page changes
 *     (doubleSubmitTimeout at most);
 *   - only a double click (doubleClickTime, 500 ms) is still dropped silently.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || new URL('../Now/dist/now.core.min.js', import.meta.url);

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="fa" data-form="fa" action="/save" method="post" data-ajax-submit="true" data-validate="false">
  <input type="text" id="fa_name" name="name">
  <button type="submit" id="fa_btn" class="btn icon-save">Save</button>
  <button type="submit" id="fa_btn2" class="btn">Save and close</button>
  <button type="submit" id="fa_off" class="btn" disabled>Disabled by the app</button>
</form>
<button type="submit" id="fa_outside" form="fa" class="btn">Outside</button>

<form id="fb" data-form="fb" action="/leave" method="post" data-ajax-submit="true" data-validate="false" data-double-submit-timeout="900">
  <input type="text" name="name" value="x">
  <button type="submit" id="fb_btn" class="btn">Save</button>
</form>

<form id="fc" data-form="fc" action="/table" method="post" data-ajax-submit="true" data-validate="false">
  <input type="text" name="name" value="x">
  <button type="submit" id="fc_btn" class="btn">Save</button>
</form>

<form id="fd" data-form="fd" action="/fast" method="post" data-ajax-submit="true" data-validate="false" data-prevent-double-submit="false">
  <input type="text" name="name" value="x">
  <button type="submit" id="fd_btn" class="btn">Scan</button>
</form>

<form id="fe" data-form="fe" action="/save" method="post" data-ajax-submit="true" data-validate="false" data-loading-text="Saving...">
  <input type="text" name="name" value="x">
  <button type="submit" id="fe_btn" class="btn">Save</button>
</form>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
window.snap = id => {
  const b = document.getElementById(id);
  return {disabled: b.disabled, loading: b.classList.contains('loading'), busy: b.getAttribute('aria-busy'), text: b.textContent.trim(),
    form: b.form ? b.form.classList.contains('submitting') : null};
};
window.submitForm = id => document.getElementById(id).dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
</script>
</body></html>`;

const hits = {};
const json = (res, status, body, delay = 250) => setTimeout(() => {
  res.writeHead(status, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(body));
}, delay);

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (path === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    hits[path] = (hits[path] || 0) + 1;
    if (path === '/save') {
      const name = /"name":"([^"]*)"/.exec(body)?.[1] ?? '';
      return name === ''
        ? json(res, 400, {success: false, message: 'Validation failed', errors: {name: 'Please fill in'}})
        : json(res, 200, {success: true, message: 'Saved', data: {actions: [{type: 'notification', level: 'success', message: 'Saved'}]}});
    }
    if (path === '/leave') {
      // A redirect that fires long after the test is over
      return json(res, 200, {success: true, data: {actions: [{type: 'redirect', url: '/next', delay: 60000}]}}, 100);
    }
    if (path === '/table') {
      return json(res, 200, {success: true, data: {actions: [{type: 'redirect', url: 'reload', target: 'someTable'}]}}, 100);
    }
    if (path === '/fast') {
      return json(res, 200, {success: true, data: {actions: []}}, 300);
    }
    res.writeHead(404);
    res.end();
  });
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
tab.on('console', m => m.type() === 'error' && !/400|Bad Request/.test(m.text()) && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 300));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const snap = id => tab.evaluate(i => window.snap(i), id);
const submit = id => tab.evaluate(i => window.submitForm(i), id);

// 1. In flight: every submit button is locked and says so
await submit('fa'); // empty name → 400 after 250 ms
await sleep(80);
let s = await snap('fa_btn');
check('in flight: the submit button is disabled and loading', s.disabled && s.loading && s.busy === 'true' && s.form === true, JSON.stringify(s));
check('in flight: the button keeps its own label (no hard-coded text)', s.text === 'Save', s.text);
s = await snap('fa_btn2');
const outside = await snap('fa_outside');
check('in flight: the other submit buttons are locked too, including one outside the form', s.disabled && s.loading && outside.disabled && outside.loading, JSON.stringify({s, outside}));
await submit('fa');
await sleep(350);
check('in flight: a second submit is ignored', hits['/save'] === 1, `requests ${hits['/save']}`);

// 2. A failed submit unlocks at once and can be sent again straight away
s = await snap('fa_btn');
const off = await snap('fa_off');
check('after an error: the buttons are unlocked', !s.disabled && !s.loading && s.busy === null && s.form === false, JSON.stringify(s));
check('after an error: a button the app had disabled stays disabled', off.disabled === true && off.loading === false, JSON.stringify(off));
await sleep(300); // 730 ms after the first submit — far less than the old 2 s window
await tab.type('#fa_name', 'Somchai');
await submit('fa');
await sleep(450);
check('after an error: correcting the form and submitting again goes through', hits['/save'] === 2, `requests ${hits['/save']}`);

// 3. A double click is one submit
await sleep(600);
hits['/save'] = 0;
await tab.evaluate(async () => {
  window.submitForm('fa');
  await new Promise(r => setTimeout(r, 120));
  window.submitForm('fa');
});
await sleep(900);
check('a double click sends one request', hits['/save'] === 1, `requests ${hits['/save']}`);

// 4. Saved and navigating away: locked, visibly, until the page changes
await submit('fb');
await sleep(400); // response came at ~100 ms
s = await snap('fb_btn');
check('saved + redirect pending: the form stays locked and loading', s.disabled && s.loading && s.form === true, JSON.stringify(s));
await submit('fb');
await sleep(150);
check('saved + redirect pending: another submit is ignored', hits['/leave'] === 1, `requests ${hits['/leave']}`);
await sleep(700); // past data-double-submit-timeout="900"
s = await snap('fb_btn');
check('the lock is released when the navigation never happens (doubleSubmitTimeout)', !s.disabled && !s.loading, JSON.stringify(s));

// 5. Saved and staying: unlocked as soon as the response is handled
await submit('fc');
await sleep(350);
s = await snap('fc_btn');
check('saved + table reload only: unlocked right away', !s.disabled && !s.loading, JSON.stringify(s));

// 6. data-prevent-double-submit="false": every submit is sent, even overlapping ones,
//    and the button stays enabled — a disabled submit button makes the browser swallow Enter
const during6 = await tab.evaluate(async () => {
  window.submitForm('fd');
  await new Promise(r => setTimeout(r, 60));
  const state = window.snap('fd_btn');
  window.submitForm('fd');
  return state;
});
await sleep(600);
check('prevent-double-submit off: overlapping submits are both sent', hits['/fast'] === 2, `requests ${hits['/fast']}`);
check('prevent-double-submit off: the button is never disabled (Enter keeps working)', during6.disabled === false && during6.form === true, JSON.stringify(during6));

// 7. data-loading-text swaps the label while in flight, and puts it back
await submit('fe');
await sleep(80);
s = await snap('fe_btn');
const during = s.text;
await sleep(500);
s = await snap('fe_btn');
check('data-loading-text is shown while in flight and restored after', during === 'Saving...' && s.text === 'Save', `${during} → ${s.text}`);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
