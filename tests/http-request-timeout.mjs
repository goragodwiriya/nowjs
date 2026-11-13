/**
 * Proof that one request can carry its own timeout.
 *
 * Runs the real built bundle in a real browser against a tiny fake API, so
 * what is proven here is what ships.
 *
 * Need: HttpClient aborted every request after the client-wide 30 s, with no
 * per-request override, so a legitimately long call (AI theme generation in
 * GCMS takes 30-90 s) always failed with 408 "Request timeout" while raising
 * the global limit would have weakened every other request. Now
 * `options.timeout` (ms) overrides the limit for that request only and
 * 0 removes it; ApiService passes the option through.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here+'../Now/dist/now.core.min.js';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<script src="/core.js"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false});
</script>
</body></html>`;

const bodies = [];
const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, {'Content-Type': 'text/html'}); return res.end(page); }
  if (req.url === '/core.js') { res.writeHead(200, {'Content-Type': 'application/javascript'}); return res.end(readFileSync(CORE, 'utf8')); }
  if (req.url.startsWith('/slow')) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      if (body) bodies.push(body);
      // slower than the client-wide limit set below, faster than the overrides
      setTimeout(() => {
        res.writeHead(200, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({success: true, data: {ok: 1}}));
      }, 1200);
    });
    return;
  }
  res.writeHead(404); res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const tab = await browser.newPage();
await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const run = (fn) => tab.evaluate(fn);
// the shared client gives up after 400 ms in this test (production default: 30 s)
await run(() => { window.__defaultTimeout = http.timeout; http.setTimeout(400); });

const plain = await run(async () => { const r = await http.get('/slow?a'); return {success: r.success, status: r.status}; });
check('a request without its own timeout still stops at the client limit', plain.status === 408 && !plain.success, JSON.stringify(plain));

const longer = await run(async () => { const r = await http.get('/slow?b', {timeout: 3000}); return {success: r.success, status: r.status}; });
check('options.timeout extends the limit for that request', longer.success === true && longer.status === 200, JSON.stringify(longer));

const unlimited = await run(async () => { const r = await http.post('/slow', {a: 1}, {timeout: 0}); return {success: r.success, status: r.status}; });
check('options.timeout 0 removes the limit', unlimited.success === true, JSON.stringify(unlimited));

const viaApi = await run(async () => {
  try {
    const r = await ApiService.post('/slow', {b: 2}, {timeout: 3000});
    return {success: r.success, status: r.status};
  } catch (e) {
    return {error: e.message};
  }
});
check('ApiService.post passes options.timeout through', viaApi.success === true, JSON.stringify(viaApi));

const after = await run(async () => { const r = await http.get('/slow?c'); return {status: r.status}; });
check('the override does not leak into later requests', after.status === 408, JSON.stringify(after));
check('timeout is not sent as part of the request body', bodies.length > 0 && bodies.every(b => !b.includes('timeout')), bodies.join(' | '));

await run(() => http.setTimeout(window.__defaultTimeout));
await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
