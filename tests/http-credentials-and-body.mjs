/**
 * Credentials stay on trusted origins, request bodies are sent as given
 * (Now.js audit 2026-11-10, phase 4: S5 S7 B1).
 *
 * - The CSRF token (header and body _token) and the Authorization header go
 *   only to this page's origin or one in SecurityManager.config.trustedOrigins;
 *   a token in a response from another origin is not adopted; GET/HEAD carry no
 *   CSRF token; the caller's body object is never changed.
 * - RedirectManager.isSafeIntendedPath, and FormManager.isValidRedirectUrl
 *   (login ?redirect=, intended_url), resolve the path the way the browser
 *   does: /\evil.example and /<tab>/evil.example are not ours.
 * - Client-side body sanitization is off by default: what the caller sends is
 *   what the server gets, the same through ajax, ajax with a file and a normal
 *   submit. Turned on, it keeps arrays, Date, File/Blob and leaves strings that
 *   are not HTML alone; data-sanitize-input="false" still opts a form out.
 *
 * The other origin is the same server reached as localhost instead of 127.0.0.1.
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, mkdtempSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const LONG = '<p>' + 'ทดสอบ <b>ข้อความ</b> '.repeat(900) + '<a href="report?month=12" onclick="x()">end</a></p>';

const page = (csrf) => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title>${csrf ? `<meta name="csrf-token" content="${'a'.repeat(64)}">` : ''}</head><body>
<form id="ajax" data-form="ajax" action="/api/echo/ajax" method="post" data-ajax-submit="true" data-reset="false">
  <textarea name="detail" style="display:none"></textarea>
  <input type="hidden" name="tags[]" value="one"><input type="hidden" name="tags[]" value="two">
  <button type="submit">Save</button>
</form>
<form id="file" data-form="file" action="/api/echo/file" method="post" data-ajax-submit="true" data-reset="false">
  <textarea name="detail" style="display:none"></textarea>
  <input type="hidden" name="tags[]" value="one"><input type="hidden" name="tags[]" value="two">
  <input type="file" name="picture">
  <button type="submit">Save</button>
</form>
<form id="normal" action="/api/echo/normal" method="post" enctype="multipart/form-data">
  <textarea name="detail" style="display:none"></textarea>
  <input type="hidden" name="tags[]" value="one"><input type="hidden" name="tags[]" value="two">
  <button type="submit">Save</button>
</form>
<form id="optout" data-form="optout" action="/api/echo/optout" method="post" data-ajax-submit="true" data-reset="false" data-sanitize-input="false">
  <textarea name="detail" style="display:none"></textarea>
  <button type="submit">Save</button>
</form>
<form id="xhrcross" data-form="xhrcross" action="CROSS/api/echo/xhrcross" method="post" data-ajax-submit="true" data-reset="false">
  <input type="text" name="name" value="x">
  <input type="file" name="picture">
  <button type="submit">Save</button>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, security: {csrf: {enabled: ${csrf}, autoRefresh: false, tokenUrl: '/api/csrf'}}});
  document.getElementById('xhrcross').action = location.origin.replace('127.0.0.1', 'localhost') + '/api/echo/xhrcross';
})();
</script>
</body></html>`;

const received = [];
const readBody = (req) => new Promise(resolve => {
  const chunks = [];
  req.on('data', c => chunks.push(c));
  req.on('end', () => resolve(Buffer.concat(chunks)));
});
const parseMultipart = (buf, type) => {
  const boundary = '--' + /boundary=(?:"([^"]+)"|([^;]+))/.exec(type).slice(1).find(Boolean);
  const fields = {};
  const files = [];
  for (const part of buf.toString('latin1').split(boundary).slice(1, -1)) {
    const [head, ...rest] = part.split('\r\n\r\n');
    const value = Buffer.from(rest.join('\r\n\r\n').replace(/\r\n$/, ''), 'latin1').toString('utf8');
    const name = /name="([^"]+)"/.exec(head)?.[1];
    if (/filename="/.test(head)) files.push(name);
    else if (name in fields) fields[name] = [].concat(fields[name], value);
    else fields[name] = value;
  }
  return {fields, files};
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': req.headers['access-control-request-headers'] || '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Expose-Headers': 'X-CSRF-Token'
  };
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors);
    return res.end();
  }
  if (url.pathname === '/' || url.pathname === '/nocsrf') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page(url.pathname === '/'));
  }
  if (url.pathname === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  if (url.pathname.startsWith('/api/')) {
    const body = await readBody(req);
    const type = req.headers['content-type'] || '';
    let parsed = null;
    if (type.includes('application/json')) parsed = JSON.parse(body.toString('utf8') || 'null');
    else if (type.includes('multipart/')) parsed = parseMultipart(body, type);
    else if (type.includes('urlencoded')) parsed = Object.fromEntries(new URLSearchParams(body.toString('utf8')));
    received.push({
      host: req.headers.host, path: url.pathname, method: req.method,
      csrf: req.headers['x-csrf-token'] || null, auth: req.headers.authorization || null,
      raw: body.toString('utf8'), type, parsed
    });
    const headers = {'Content-Type': 'application/json', ...cors};
    if (url.searchParams.get('rotate')) headers['X-CSRF-Token'] = url.searchParams.get('rotate');
    if (url.pathname === '/api/csrf') {
      res.writeHead(200, headers);
      return res.end(JSON.stringify({success: true, data: {csrf_token: 'b'.repeat(64)}}));
    }
    res.writeHead(200, headers);
    return res.end(JSON.stringify({success: true, data: {}}));
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const same = `http://127.0.0.1:${port}`;
const cross = `http://localhost:${port}`;

const dir = mkdtempSync(join(tmpdir(), 'http-credentials-'));
const upload = join(dir, 'a.txt');
writeFileSync(upload, 'file');

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
const open = async (path = '/') => {
  await tab.goto(same + path, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
};

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};
const take = (pred) => received.filter(pred).pop();

// --- Tokens stay on trusted origins (probe p4) -------------------------------
await open('/');
const token = await tab.evaluate(() => SecurityManager.state.csrfToken);
const p4 = await tab.evaluate(async ({same, cross}) => {
  const out = {};
  const body = {a: 1};
  await http.post(cross + '/api/x-post', body);
  await http.get(cross + '/api/x-get');
  await http.post(same + '/api/s-post', body);
  await http.get(same + '/api/s-get');
  await simpleFetch.post(cross + '/api/sf-cross', {b: 2});
  await simpleFetch.post(same + '/api/sf-same', {b: 2});
  out.bodyKeys = Object.keys(body);
  // Bearer token in storage strategy
  localStorage.setItem('nowjs_test_bearer', 'BEARER-SECRET');
  ApiService.config.security.bearerTokenKey = 'nowjs_test_bearer';
  ApiService.config.security.authStrategy = 'storage';
  ApiService.config.security.bearerPrefix = 'Bearer ';
  ApiService.setupBearerAuth();
  await http.get(cross + '/api/bearer-cross');
  await http.get(same + '/api/bearer-same');
  // A token in another origin's response is not adopted, ours is
  const before = SecurityManager.state.csrfToken;
  await http.get(cross + '/api/rot-cross?rotate=' + 'e'.repeat(64));
  out.afterCross = SecurityManager.state.csrfToken === before && http.csrfToken === before;
  await http.get(same + '/api/rot-same?rotate=' + 'c'.repeat(64));
  out.afterSame = SecurityManager.state.csrfToken;
  return out;
}, {same, cross});
const r = (p) => take(x => x.path === p);
check('POST to another origin carries no X-CSRF-Token', r('/api/x-post') && !r('/api/x-post').csrf, JSON.stringify(r('/api/x-post')));
check('POST to another origin carries no _token in the body', r('/api/x-post') && !('_token' in (r('/api/x-post').parsed || {})), r('/api/x-post')?.raw);
check('GET to another origin carries no X-CSRF-Token', r('/api/x-get') && !r('/api/x-get').csrf, JSON.stringify(r('/api/x-get')));
check('same-origin POST still carries the token (header and _token)', r('/api/s-post')?.csrf === token && r('/api/s-post')?.parsed?._token === token, JSON.stringify(r('/api/s-post')));
check('same-origin GET carries no CSRF token', r('/api/s-get') && !r('/api/s-get').csrf, JSON.stringify(r('/api/s-get')));
check("the caller's body object is not changed", JSON.stringify(p4.bodyKeys) === '["a"]', JSON.stringify(p4.bodyKeys));
check('simpleFetch: no token to another origin, token to ours', r('/api/sf-cross') && !r('/api/sf-cross').csrf && !('_token' in (r('/api/sf-cross').parsed || {})) && !!r('/api/sf-same')?.csrf, JSON.stringify([r('/api/sf-cross'), r('/api/sf-same')?.csrf]));
check('Authorization goes to our origin only', !r('/api/bearer-cross')?.auth && r('/api/bearer-same')?.auth === 'Bearer BEARER-SECRET', JSON.stringify([r('/api/bearer-cross')?.auth, r('/api/bearer-same')?.auth]));
check('a CSRF token in another origin\'s response is not adopted', p4.afterCross === true, String(p4.afterCross));
check('a CSRF token in our own response is adopted', p4.afterSame === 'c'.repeat(64), p4.afterSame);

// FormManager upload (XMLHttpRequest) to another origin
await open('/');
const xhrInput = await tab.$('#xhrcross input[type="file"]');
await xhrInput.uploadFile(upload);
await tab.evaluate(async () => {
  const el = document.getElementById('xhrcross');
  if (!FormManager.getInstanceByElement(el)) await FormManager.initForm(el);
});
await tab.click('#xhrcross button[type="submit"]');
for (let i = 0; i < 100 && !take(x => x.path === '/api/echo/xhrcross'); i++) await new Promise(res => setTimeout(res, 50));
const xc = take(x => x.path === '/api/echo/xhrcross');
check('a form upload to another origin carries no CSRF token', xc && !xc.csrf && !('_token' in (xc.parsed?.fields || {})), JSON.stringify(xc && {csrf: xc.csrf, fields: xc.parsed?.fields}));

// --- Intended path after login (S7) ------------------------------------------
const paths = await tab.evaluate(() => ({
  backslash: RedirectManager.isSafeIntendedPath('/\\evil.example/x'),
  tab: RedirectManager.isSafeIntendedPath('/\t/evil.example'),
  newline: RedirectManager.isSafeIntendedPath('/\n/evil.example'),
  dashboard: RedirectManager.isSafeIntendedPath('/dashboard'),
  query: RedirectManager.isSafeIntendedPath('/orders?id=1&tab=2')
}));
check('isSafeIntendedPath refuses /\\evil.example and tab/newline tricks', !paths.backslash && !paths.tab && !paths.newline, JSON.stringify(paths));
check('isSafeIntendedPath keeps /dashboard and a path with a query', paths.dashboard && paths.query, JSON.stringify(paths));
// FormManager's own check (login ?redirect=, intended_url) — the same tricks
const formPaths = await tab.evaluate(() => ({
  backslash: FormManager.isValidRedirectUrl('/\\evil.example/x'),
  tab: FormManager.isValidRedirectUrl('/\t/evil.example'),
  newline: FormManager.isValidRedirectUrl('/\n/evil.example'),
  other: FormManager.isValidRedirectUrl('https://evil.example/x'),
  scheme: FormManager.isValidRedirectUrl('javascript:alert(1)'),
  dashboard: FormManager.isValidRedirectUrl('/dashboard?tab=2'),
  sameOrigin: FormManager.isValidRedirectUrl(location.origin + '/orders')
}));
check('FormManager.isValidRedirectUrl refuses /\\evil.example, tab/newline tricks, other origins and javascript:', !formPaths.backslash && !formPaths.tab && !formPaths.newline && !formPaths.other && !formPaths.scheme, JSON.stringify(formPaths));
check('FormManager.isValidRedirectUrl keeps a path on this site and a URL of this origin', formPaths.dashboard && formPaths.sameOrigin, JSON.stringify(formPaths));

// --- Request body as given (probe p5), CSRF off ------------------------------
await open('/nocsrf');
const sentP5 = await tab.evaluate(async () => {
  const input = {ids: [1, 2, 3], items: [{id: 1, note: 'a < b and c > d'}], html: '<p onclick="x()">hi</p>', when: new Date(0), q: 'javascript:void(0)'};
  await http.post('/api/p5', input);
  return {expected: JSON.stringify(input), enabled: SecurityManager.config.sanitization.enabled};
});
check('client body sanitization is off by default', sentP5.enabled === false, String(sentP5.enabled));
check('the body the server gets is byte for byte what the caller sent', r('/api/p5')?.raw === sentP5.expected, r('/api/p5')?.raw);

// --- The same long HTML and array through ajax, ajax + file, normal submit ---
const submit = async (id, withFile) => {
  await open('/nocsrf');
  await tab.evaluate(async (id) => {
    const el = document.getElementById(id);
    if (el.dataset.form && !FormManager.getInstanceByElement(el)) await FormManager.initForm(el);
  }, id);
  await tab.$eval(`#${id} textarea`, (t, v) => {
    t.value = v;
  }, LONG);
  if (withFile) await (await tab.$(`#${id} input[type="file"]`)).uploadFile(upload);
  const at = received.length;
  await tab.click(`#${id} button[type="submit"]`);
  for (let i = 0; i < 200 && received.length === at; i++) await new Promise(res => setTimeout(res, 50));
  const got = received[at];
  const fields = got?.parsed?.fields || got?.parsed || {};
  return {detail: fields.detail, tags: fields['tags[]'] ?? fields.tags, type: got?.type};
};
const viaAjax = await submit('ajax', false);
const viaFile = await submit('file', true);
const viaNormal = await submit('normal', false);
check('long HTML (> 10,000 characters) arrives whole through ajax', viaAjax.detail === LONG, `${viaAjax.detail?.length} of ${LONG.length}`);
check('... through ajax with a file', viaFile.detail === LONG, `${viaFile.detail?.length} of ${LONG.length}`);
check('... and through a normal submit', viaNormal.detail === LONG, `${viaNormal.detail?.length} of ${LONG.length}`);
check('the array arrives as two values on every route', [viaAjax, viaFile, viaNormal].every(v => JSON.stringify(v.tags) === '["one","two"]'), JSON.stringify([viaAjax.tags, viaFile.tags, viaNormal.tags]));

// --- Sanitization turned on ---------------------------------------------------
await open('/nocsrf');
await tab.evaluate(async () => {
  SecurityManager.config.sanitization.enabled = true;
  await http.post('/api/on', {ids: [1, 2], rows: [{a: 1}], when: new Date(0), html: '<b onclick="x()">y</b>', q: 'javascript:void(0)', n: 5, t: 'a < b'});
  const blob = new Blob(['z'], {type: 'text/plain'});
  const fd = new FormData();
  fd.append('html', '<i onclick="y()">z</i>');
  fd.append('file', blob, 'z.txt');
  await http.post('/api/on-fd', fd);
});
const on = r('/api/on')?.parsed || {};
check('turned on: arrays stay arrays, Date stays a date', JSON.stringify(on.ids) === '[1,2]' && JSON.stringify(on.rows) === '[{"a":1}]' && on.when === '1970-01-01T00:00:00.000Z', JSON.stringify(on));
check('turned on: HTML is cleaned, strings that are not HTML are left alone', on.html === '<b>y</b>' && on.q === 'javascript:void(0)' && on.t === 'a < b' && on.n === 5, JSON.stringify(on));
const onFd = r('/api/on-fd')?.parsed || {};
check('turned on: FormData keeps its file and cleans its HTML', JSON.stringify(onFd.files) === '["file"]' && onFd.fields?.html === '<i>z</i>', JSON.stringify(onFd));

await open('/nocsrf');
await tab.evaluate(() => {
  SecurityManager.config.sanitization.enabled = true;
});
await tab.evaluate(async () => {
  const el = document.getElementById('optout');
  if (!FormManager.getInstanceByElement(el)) await FormManager.initForm(el);
});
await tab.$eval('#optout textarea', t => {
  t.value = '<b onclick="x()">kept</b>';
});
const atOpt = received.length;
await tab.click('#optout button[type="submit"]');
for (let i = 0; i < 100 && received.length === atOpt; i++) await new Promise(res => setTimeout(res, 50));
check('turned on: data-sanitize-input="false" still sends the form as written', received[atOpt]?.parsed?.detail === '<b onclick="x()">kept</b>', JSON.stringify(received[atOpt]?.parsed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
rmSync(dir, {recursive: true, force: true});
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
