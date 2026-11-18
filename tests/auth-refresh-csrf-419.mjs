/**
 * Proof that a stale CSRF token no longer kills the session refresh.
 *
 * Runs the real built bundle in a real browser against a tiny fake API, so
 * what is proven here is what ships.
 *
 * Regression guarded: AuthManager.refreshToken() goes through simpleFetch,
 * which bypasses the http interceptors. When the PHP session behind the CSRF
 * token disappeared (idle GC, laptop sleep), the refresh got 419 and simply
 * returned false — nothing adopted the rotated X-CSRF-Token the server sent
 * back, nothing re-fetched a token, and the timer was never re-armed, so the
 * user was silently logged out a few minutes later. Now the rotated token is
 * adopted from every simpleFetch response and a 419 refresh is retried once
 * after re-fetching the token.
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
window.__ready = (async () => {
  await Now.init({
    environment: 'production', allowEval: false,
    auth: {
      enabled: true, autoInit: true,
      endpoints: {verify: '/api/auth/verify', me: '/api/auth/me', login: '/api/auth/login', logout: '/api/auth/logout', refresh: '/api/auth/refresh'},
      security: {autoRefresh: false}
    },
    security: {csrf: {enabled: true, headerName: 'X-CSRF-Token', metaName: 'csrf-token', tokenUrl: '/api/auth/csrf-token'}}
  });
})();
</script>
</body></html>`;

// --- fake server: tokens are only valid while they live in "the session" ---
let session = new Set();        // tokens the current server session knows
let mint = 0;
const newToken = () => { const t = ('t'+(++mint)).padEnd(64, '0'); session.add(t); return t; };
const log = [];

const json = (res, status, body, token) => {
  res.writeHead(status, {'Content-Type': 'application/json', 'X-CSRF-Token': token});
  res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
  if (req.url === '/') { res.writeHead(200, {'Content-Type': 'text/html'}); return res.end(page); }
  if (req.url === '/core.js') { res.writeHead(200, {'Content-Type': 'application/javascript'}); return res.end(readFileSync(CORE, 'utf8')); }

  const sent = req.headers['x-csrf-token'];
  log.push({url: req.url, method: req.method, token: sent});

  if (req.url === '/api/auth/csrf-token') {
    return json(res, 200, {success: true, data: {csrf_token: newToken()}}, newToken());
  }
  if (req.url === '/api/auth/verify' || req.url === '/api/auth/me') {
    return json(res, 200, {success: true, data: {id: 1, name: 'u', permission: []}}, newToken());
  }
  if (req.url === '/api/auth/refresh') {
    if (!sent || !session.has(sent)) {
      // Same shape as Kotchasan: 419 + a token minted in the (new) session.
      return json(res, 419, {success: false, message: 'Invalid CSRF Token', code: 419}, newToken());
    }
    return json(res, 200, {success: true, data: {expires_in: 3600, token_type: 'Bearer', user: {id: 1, name: 'u', permission: []}}}, newToken());
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

// 1. Happy path: the token the page holds is one the session knows.
const meta1 = await tab.evaluate(() => document.querySelector('meta[name="csrf-token"]')?.content);
check('page holds a token minted by the server', !!meta1 && session.has(meta1), meta1);

// 2. The server session dies (GC / sleep): every token the page has is now unknown.
session = new Set();
log.length = 0;
const refreshed = await tab.evaluate(() => AuthManager.refreshToken());
const refreshCalls = log.filter(l => l.url === '/api/auth/refresh');
// The original production bug: AuthManager added 'X-CSRF-TOKEN' and simpleFetch
// 'X-CSRF-Token'; the browser merged them into "tok, tok" and the server's
// 64-hex format check rejected every refresh with 419.
check('refresh sends the CSRF header exactly once', refreshCalls.every(c => c.token && !c.token.includes(',')), refreshCalls[0]?.token);
check('refresh after session loss still succeeds', refreshed === true);
check('first refresh got 419, then exactly one retry', refreshCalls.length === 2, `${refreshCalls.length} calls`);
check('retry used a token from the new session', refreshCalls.length === 2 && session.has(refreshCalls[1].token), refreshCalls[1]?.token);
check('page now holds a token the new session knows',
  await tab.evaluate(() => document.querySelector('meta[name="csrf-token"]').content).then(t => session.has(t)));
check('SecurityManager state follows the meta tag',
  await tab.evaluate(() => SecurityManager.state.csrfToken === document.querySelector('meta[name="csrf-token"]').content));

// 3. A plain simpleFetch GET rotates the token too (this is what keeps it fresh).
session = new Set();
await tab.evaluate(() => simpleFetch.get('/api/auth/me'));
check('simpleFetch adopts the rotated token from any response',
  await tab.evaluate(() => document.querySelector('meta[name="csrf-token"]').content).then(t => session.has(t)));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
process.exit(failed ? 1 : 0);
