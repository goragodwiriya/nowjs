/**
 * Proof that an offline session does not outlive its token.
 *
 * When the verify endpoint cannot be reached, AuthManager.checkAuthStatus()
 * restores the profile it cached at the last successful verify, so a dropped
 * connection does not throw the user back to the login page. The profile was
 * restored however old it was: a device closed without logging out kept its
 * user signed in offline - with the API answers the service worker kept - for
 * whoever opened it next.
 *
 * Now a profile verified longer ago than security.offlineSessionMaxAge
 * (default 24 h, the access token lifetime) is not restored: the local session
 * is cleared and ServiceWorkerManager.clearApiCache() drops the cached API
 * answers. A server that answers "no" still clears the session as before.
 *
 * Runs the real built core in a real browser against a real HTTP server whose
 * verify endpoint cuts the connection. NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (path === '/verify-down') {
    // offline: no answer at all
    req.socket.destroy();
    return;
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

// Profile verified `age` ms ago, verify endpoint unreachable
const offlineCheck = (age, maxAge) => tab.evaluate(async (age, maxAge) => {
  const calls = [];
  // the page loads the core only: ServiceWorkerManager (now.serviceworker bundle) is a stand-in
  window.ServiceWorkerManager = {
    clearApiCache: async () => {
      calls.push('clearApiCache');
      return true;
    }
  };
  AuthManager.config.endpoints.verify = '/verify-down';
  if (maxAge !== undefined) AuthManager.config.security.offlineSessionMaxAge = maxAge;
  const profile = {id: 7, name: 'Last user'};
  if (age !== null) profile.timestamp = Date.now() - age;
  localStorage.setItem(AuthManager.config.token.storageKey, JSON.stringify(profile));
  const result = await AuthManager.checkAuthStatus();
  return {
    authenticated: result.authenticated,
    offline: result.offline === true,
    user: result.user?.name ?? null,
    stored: localStorage.getItem(AuthManager.config.token.storageKey) !== null,
    calls
  };
}, age, maxAge);

const hour = 60 * 60 * 1000;
let r = await offlineCheck(hour);
check('offline, a profile verified 1 h ago keeps the user signed in (offline: true)', r.authenticated && r.offline && r.user === 'Last user' && r.stored, JSON.stringify(r));
r = await offlineCheck(25 * hour);
check('offline, a profile verified 25 h ago is not restored', !r.authenticated && r.user === null, JSON.stringify(r));
check('and the cached profile is removed', !r.stored, JSON.stringify(r));
check('and the service worker is told to drop the cached API answers', r.calls.includes('clearApiCache'), JSON.stringify(r.calls));
r = await offlineCheck(null);
check('offline, a profile without the time of its verify is not restored', !r.authenticated && !r.stored, JSON.stringify(r));
r = await offlineCheck(25 * hour, 0);
check('offlineSessionMaxAge 0 keeps the old behaviour (no limit)', r.authenticated && r.offline, JSON.stringify(r));
r = await offlineCheck(3 * hour, 2 * hour);
check('offlineSessionMaxAge is honoured (2 h limit, verified 3 h ago)', !r.authenticated, JSON.stringify(r));

check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
