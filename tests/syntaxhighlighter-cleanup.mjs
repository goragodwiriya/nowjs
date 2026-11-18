/**
 * SyntaxHighlighterComponent.cleanup() removes its own locale:changed listener.
 *
 * cleanup() called Now.off('locale:changed'), and Now has no off(): it threw a
 * TypeError and stopped before the instances were destroyed. It now calls the
 * unsubscribe function EventManager.on() returned, so other components'
 * locale:changed listeners stay, and init() run twice still listens once.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<pre><code class="language-js">const a = 1;</code></pre>
<script src="/Now/dist/now.core.min.js?v=t1"></script>
<script src="/Now/dist/now.syntaxhighlighter.min.js?v=t1"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path.startsWith('/Now/dist/') && existsSync(DIST + path.slice(10))) {
    res.writeHead(200, {'Content-Type': path.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + path.slice(10)));
  }
  res.writeHead(path === '/favicon.ico' ? 204 : 404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : '  ' + JSON.stringify(detail)}`);
};

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const s = await tab.evaluate(async () => {
  const count = () => EventManager.state.events.get('locale:changed')?.size || 0;
  let other = 0;
  EventManager.on('locale:changed', () => { other++; });
  // Now.init may have started the component already (it is a registered manager)
  const base = count();
  await SyntaxHighlighterComponent.init();
  await SyntaxHighlighterComponent.init();
  const afterInit = count();
  let threw = null;
  try {
    SyntaxHighlighterComponent.cleanup();
  } catch (e) {
    threw = String(e);
  }
  const afterCleanup = count();
  await EventManager.emit('locale:changed', {locale: 'th'});
  return {base, afterInit, afterCleanup, threw, other, initialized: SyntaxHighlighterComponent.state.initialized};
});

check('init() twice leaves one listener of its own (no duplicate)', s.afterInit - s.base <= 1 && s.afterInit - s.afterCleanup === 1, s);
check('cleanup() does not throw', s.threw === null, s);
check('cleanup() removes its own listener only: the other one still runs', s.afterCleanup === s.afterInit - 1 && s.other === 1, s);
check('cleanup() finishes (initialized is false)', s.initialized === false, s);
check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
