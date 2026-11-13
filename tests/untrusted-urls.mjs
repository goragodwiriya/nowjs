/**
 * URLs that come from data go through the same checks as everywhere else
 * (Now.js audit 2026-11-10, follow-up of the unaudited parts, owner: "fix every
 * pending item").
 *
 * - FormManager followed `redirectUrl` / `redirect.url` from a submit response
 *   as it was. It now goes where a `redirect` action may go
 *   (ResponseHandler.isAllowedNavigation): http(s) on this origin, an origin in
 *   ResponseHandler.config.allowedOrigins, or another origin the response marks
 *   `external: true`. No app sends these fields today.
 * - FormBuilderManager set the form's action to the schema's submission
 *   endpoint as it was; a `javascript:` endpoint ran when the form was
 *   submitted without ajax. It now has to pass SecurityManager.sanitizeUrl().
 * - The rich text editor's gallery put the uploaded files' URLs into
 *   `src="..."` unescaped, and the column count into a style.
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
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/richtext-editor.min.css"></head><body>
<main id="main"><form id="f" data-form="f"><input name="a"></form><form id="built"></form><textarea id="ed"></textarea></main>
<script src="/now.core.min.js"></script>
<script src="/now.formbuilder.min.js"></script>
<script src="/richtext-editor.min.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
  window.editor = RichTextEditor.create(document.getElementById('ed'), {});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const file = path.match(/^\/((?:now\.[a-z]+|richtext-editor)\.min\.(js|css))$/);
  if (file && existsSync(DIST + file[1])) {
    res.writeHead(200, {'Content-Type': (file[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(DIST + file[1], 'utf8'));
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end(page);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail).slice(0, 500) : ''}`);
};
const errors = [];
const tab = await browser.newPage();
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);

console.log('FormManager: redirect from a submit response');
let s = await tab.evaluate(() => {
  const form = document.getElementById('f');
  const go = data => FormManager.determineRedirectUrl(form, {success: true, data}, {});
  ResponseHandler.config.allowedOrigins = ['https://pay.example'];
  return {
    path: go({redirectUrl: '/orders?id=1'}),
    sameOrigin: go({redirectUrl: location.origin + '/x'}),
    script: go({redirectUrl: 'javascript:alert(1)'}),
    other: go({redirectUrl: 'https://evil.example/x'}),
    backslash: go({redirectUrl: '/\\evil.example'}),
    allowed: go({redirect: {url: 'https://pay.example/checkout'}}),
    external: go({redirect: {url: 'https://bank.example/pay', external: true}}),
    externalScript: go({redirect: {url: 'javascript:alert(1)', external: true}})
  };
});
check('a path and a URL of this origin are followed', s.path === '/orders?id=1' && s.sameOrigin?.endsWith('/x'), s);
check('javascript:, another origin and /\\evil.example are not', !s.script && !s.other && !s.backslash, s);
check('an origin in ResponseHandler.config.allowedOrigins is followed', s.allowed === 'https://pay.example/checkout', s);
check('another origin the response marks external is followed, never a script', s.external === 'https://bank.example/pay' && !s.externalScript, s);

console.log('FormBuilderManager: submission endpoint');
s = await tab.evaluate(() => {
  const form = document.getElementById('built');
  FormBuilderManager.applyFormSettings(form, {submission: {method: 'post', endpoint: 'javascript:alert(document.domain)'}});
  const script = form.getAttribute('action');
  FormBuilderManager.applyFormSettings(form, {submission: {endpoint: '/api/forms/submit'}});
  return {script, path: form.getAttribute('action')};
});
check('a javascript: endpoint does not become the form action', !s.script || !/^\s*javascript:/i.test(s.script), s);
check('a path endpoint does', s.path === '/api/forms/submit', s);

console.log('Rich text editor: gallery markup');
s = await tab.evaluate(() => {
  const plugin = window.editor.getPlugin('galleryUpload');
  const html = plugin._buildGalleryHtml([
    {url: '/u/a.jpg" onerror="window.__x=1', alt: 'a"b'},
    {url: '/u/b.jpg?w=1&h=2', alt: 'b'}
  ], '3;background:url(javascript:1)');
  const box = document.createElement('div');
  box.innerHTML = html;
  const imgs = [...box.querySelectorAll('img')];
  return {
    handlers: imgs.some(img => [...img.attributes].some(a => /^on/i.test(a.name))),
    first: imgs[0]?.getAttribute('src'),
    second: imgs[1]?.getAttribute('src'),
    alt: imgs[0]?.getAttribute('alt'),
    style: box.firstElementChild?.getAttribute('style')
  };
});
check('a URL with a quote stays inside src (no attribute of its own)', !s.handlers && s.first === '/u/a.jpg" onerror="window.__x=1', s);
check('a URL with & and an alt with a quote come out as written', s.second === '/u/b.jpg?w=1&h=2' && s.alt === 'a"b', s);
check('the column count is a number', /--rte-gallery-columns:\s*3\s*$/.test(s.style || ''), s);

check('no page errors', errors.length === 0, errors);
await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
