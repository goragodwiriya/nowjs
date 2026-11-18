/**
 * An intended path like /..//evil.example resolves on this origin but to the
 * path //evil.example, which code using location.pathname as a URL would take
 * to another site: RedirectManager.isSafeIntendedPath refuses it, and
 * RedirectManager.redirect('after_login') with it never leaves the origin and
 * never lands on a // path — with and without the router, at base / and /app
 * (Now.js audit 2026-11-11, phase 5: L8). Ordinary paths stay safe.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const shell = (origin, router, base) => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body><main id="main"></main>
<script src="/core.js"></script><script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false},
  router: ${router
    ? `{enabled: true, base: '${base}', mode: 'history', auth: {enabled: false}, routes: {'/': {template: '${origin}/tpl/home.html'}, '/login': {template: '${origin}/tpl/home.html'}}}`
    : `{enabled: false, base: '${base}'}`}});
</script></body></html>`;

let origin;
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript'});
    return res.end(readFileSync(DIST + 'now.core.min.js'));
  }
  if (path.startsWith('/tpl/')) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end('<p>tpl</p>');
  }
  const shellMatch = /^\/(r|p)(\/app)?\/login$/.exec(path);
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(shellMatch ? shell(origin, shellMatch[1] === 'r', shellMatch[2] ? '/app' : '/') : '<p>landed</p>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

const payloads = ['/..//evil.example', '/a/../..//evil.example/x', '/./..//evil.example'];
const starts = {'/r/login': 'router, base /', '/r/app/login': 'router, base /app', '/p/login': 'no router, base /', '/p/app/login': 'no router, base /app'};
for (const [start, label] of Object.entries(starts)) {
  console.log(label);
  for (const payload of payloads) {
    const tab = await browser.newPage();
    const external = [];
    await tab.setRequestInterception(true);
    tab.on('request', r => {
      if (new URL(r.url()).origin !== origin) {
        external.push(r.url());
        r.abort();
      } else {
        r.continue();
      }
    });
    await tab.goto(origin + start + '?redirect=' + encodeURIComponent(payload), {waitUntil: 'networkidle0'});
    await tab.evaluate(() => window.__ready);
    const safe = await tab.evaluate(p => RedirectManager.isSafeIntendedPath(p), payload);
    check(`${payload} is not a safe intended path`, safe === false, safe);
    await tab.evaluate(() => RedirectManager.redirect('after_login', {showNotification: false})).catch(() => {});
    await new Promise(r => setTimeout(r, 600));
    const final = tab.url();
    check(`${payload} stays on this origin`, external.length === 0 && new URL(final).origin === origin, JSON.stringify({final, external}));
    check(`${payload} does not land on a // path`, !new URL(final).pathname.startsWith('//'), final);
    await tab.close();
  }
}

console.log('ordinary paths');
{
  const tab = await browser.newPage();
  await tab.goto(origin + '/p/login', {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  const got = await tab.evaluate(() => ['/dashboard', '/orders?id=1#x', '/a/../b', '/users/7'].filter(p => !RedirectManager.isSafeIntendedPath(p)));
  check('/dashboard, /orders?id=1#x, /a/../b, /users/7 are still safe', got.length === 0, JSON.stringify(got));
  await tab.close();
}

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
