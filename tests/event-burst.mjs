/**
 * Proof that EventSystemManager never drops a discrete event.
 *
 * Its filter used to rate-limit every event type to 60 per second, per type and
 * page-wide, with no trailing call. A barcode scanner types faster than that, so
 * the last `input` events were dropped and an autocomplete kept a truncated
 * value in its hidden input; a script dispatching `change` on two fields in the
 * same tick only reached the first handler. Rate limiting is now opt-in through
 * `config.filtering.throttledEvents` and is meant for continuous events only.
 *
 * Runs the real built bundle in a real browser against a real HTTP server.
 * NOW_CORE=<path> runs it against another build (e.g. the previous one).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form id="f1">
  <input type="text" id="code" name="code" data-autocomplete="true" data-source="/find" data-min-length="50">
  <input type="text" id="a" name="a">
  <input type="text" id="b" name="b">
  <button type="button" id="btn">button</button>
  <div id="wheel" style="height:40px;overflow:auto"><div style="height:400px"></div></div>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  ElementManager.init();
  ElementManager.scan(document);
  window.__calls = {change: [], click: 0, wheel: 0};
  EventSystemManager.addHandler(document.getElementById('a'), 'change', () => __calls.change.push('a'));
  EventSystemManager.addHandler(document.getElementById('b'), 'change', () => __calls.change.push('b'));
  EventSystemManager.addHandler(document.getElementById('btn'), 'click', () => { __calls.click++; });
  EventSystemManager.addHandler(document.getElementById('wheel'), 'wheel', () => { __calls.wheel++; });
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
  if (req.url.startsWith('/find')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: []}));
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
const sleep = ms => new Promise(r => setTimeout(r, ms));

// 1. A barcode scanner: one input event per character, all inside one task
const scanned = await tab.evaluate(() => {
  const el = document.getElementById('code');
  el.focus();
  const code = 'AS69-000123';
  for (let i = 1; i <= code.length; i++) {
    el.value = code.slice(0, i);
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }
  return document.querySelector('#f1 input[type="hidden"][name="code"]').value;
});
check('a scanner burst keeps the whole code in the autocomplete hidden input', scanned === 'AS69-000123', `got ${JSON.stringify(scanned)}`);

// 2. A script setting several fields at once
const changed = await tab.evaluate(() => {
  __calls.change = [];
  for (const id of ['a', 'b']) {
    const el = document.getElementById(id);
    el.value = 'x';
    el.dispatchEvent(new Event('change', {bubbles: true}));
  }
  return __calls.change.join(',');
});
check('change dispatched on two fields in the same tick reaches both handlers', changed === 'a,b', `got ${JSON.stringify(changed)}`);

const clicks = await tab.evaluate(() => {
  __calls.click = 0;
  for (let i = 0; i < 5; i++) document.getElementById('btn').click();
  return __calls.click;
});
check('five programmatic clicks run the handler five times', clicks === 5, `got ${clicks}`);

const wheelBurst = () => tab.evaluate(() => {
  __calls.wheel = 0;
  for (let i = 0; i < 5; i++) {
    document.getElementById('wheel').dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: 10}));
  }
  return __calls.wheel;
});

// 3. Throttling is opt-in, per event type
check('nothing is rate-limited by default (wheel ×5 → 5)', await wheelBurst() === 5);

await tab.evaluate(() => { EventSystemManager.config.filtering.throttledEvents = ['wheel']; });
await sleep(50);
check('a type listed in throttledEvents is rate-limited (wheel ×5 → 1)', await wheelBurst() === 1);

await tab.evaluate(() => { EventSystemManager.config.filtering.throttledEvents = new Set(['wheel']); });
await sleep(50);
check('throttledEvents also accepts a Set', await wheelBurst() === 1);

const stillDiscrete = await tab.evaluate(() => {
  __calls.click = 0;
  for (let i = 0; i < 5; i++) document.getElementById('btn').click();
  return __calls.click;
});
check('listing wheel leaves other types alone (click ×5 → 5)', stillDiscrete === 5, `got ${stillDiscrete}`);

await tab.evaluate(() => { EventSystemManager.config.filtering.enabled = false; });
check('filtering.enabled = false turns rate limiting off', await wheelBurst() === 5);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
