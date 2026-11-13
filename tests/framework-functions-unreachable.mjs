/**
 * Names from a response or a directive never reach the framework's own objects
 * (Now.js audit 2026-11-11, phase 1: N1).
 *
 * - Now.resolveFunction() does not resolve a path that starts at a global Now.js
 *   puts on window (Now, ResponseHandler, SecurityManager, http, TableManager,
 *   RichTextEditor, ...) nor one that passes through such an object; the list is
 *   built from the sources at build time (Now.frameworkGlobals).
 * - Nor does a framework function an app put under its own name
 *   (App.init = SecurityManager.init, myInit = TemplateManager.init).
 * - App functions on window still resolve (pwn, Cart.clear).
 * - EventManager.emit and LineItemsManager.recalculate are registered by the
 *   framework, so callback 'EventManager.emit' and data-on 'LineItemsManager.recalculate' work.
 * - SecurityManager.init() run again cannot widen config.html, and config.html is
 *   frozen; Now.init({security: {html}}) is where an app sets it.
 * - ResponseHandler.showModal() given a string cleans it at the untrusted level;
 *   a modal action with html still shows its markup, showErrorModal still shows text.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div id="main"></div>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, security: {html: {iframeHosts: ['www.google.com/maps/embed']}}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript'],
    '/table.js': [readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript']
  };
  const path = req.url.split('?')[0];
  const file = files[path] || (path.startsWith('/now.') && path.endsWith('.js')
    ? [readFileSync(DIST + path.slice(1), 'utf8'), 'application/javascript'] : null);
  if (!file) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': `${file[1]}; charset=utf-8`});
  res.end(file[0]);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('dialog', d => {
  errors.push('DIALOG:' + d.message());
  d.dismiss();
});
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

// --- resolveFunction -----------------------------------------------------------
console.log('Now.resolveFunction');
const r = await tab.evaluate(() => {
  window.pwn = () => 1;
  window.Cart = {clear() {}};
  // an app object that holds a framework object
  window.App = {rh: window.ResponseHandler, sm: {init: window.SecurityManager.init}};
  const framework = ['ResponseHandler.showModal', 'ResponseHandler.process', 'ResponseHandler.executeAction', 'ResponseHandler.registerHandler',
    'SecurityManager.init', 'SecurityManager.setSafeHtml', 'Now.init', 'Now.mergeConfig', 'Now.registerFunction', 'Now.loadScript', 'Now.require',
    'TemplateManager.init', 'RouterManager.init', 'RouterManager.navigate', 'ApiService.init', 'ApiService.post', 'simpleFetch.post', 'AuthManager.logout',
    'StorageManager.clear', 'ComponentManager.define', 'EventSystemManager.registerAction', 'Utils.function.debounce', 'DialogManager.alert',
    'NotificationManager.success', 'TableManager.init', 'MenuManager.init', 'I18nManager.setLocale', 'EventManager.on', 'EventManager.off',
    'App.rh.showModal', 'App.rh.process'];
  // the framework's functions under an app's own name
  window.myInit = window.TemplateManager.init;
  window.App.post = window.http.post;
  const aliased = ['App.sm.init', 'myInit', 'App.post'];
  return {
    reached: framework.filter(n => !!Now.resolveFunction(n)),
    pwn: !!Now.resolveFunction('pwn'),
    cart: Now.resolveFunction('Cart.clear')?.thisArg === window.Cart,
    aliased: aliased.filter(n => !!Now.resolveFunction(n)),
    emit: typeof Now.resolveFunction('EventManager.emit')?.fn === 'function',
    recalc: typeof Now.resolveFunction('LineItemsManager.recalculate')?.fn === 'function',
    list: Array.isArray(Now.frameworkGlobals) ? Now.frameworkGlobals : [...(Now.frameworkGlobals || [])]
  };
});
check('no framework function resolves by name', r.reached.length === 0, JSON.stringify(r.reached));
check('a framework function under an app name does not resolve (App.sm.init, myInit, App.post)', r.aliased.length === 0, JSON.stringify(r.aliased));
check('an app function on window still resolves', r.pwn);
check('an app dotted path still resolves on its object', r.cart);
check('EventManager.emit is registered by the framework', r.emit);
check('LineItemsManager.recalculate is registered by the framework', r.recalc);
const expected = ['Now', 'ResponseHandler', 'SecurityManager', 'http', 'simpleFetch', 'Utils', 'Modal', 'TableManager', 'GraphComponent', 'LineItemsManager', 'RichTextEditor', 'QueueManager'];
check('the framework globals list comes from the sources (core, table, graph, features, editor)', expected.every(n => r.list.includes(n)), expected.filter(n => !r.list.includes(n)).join(', '));

// --- callback actions ---------------------------------------------------------
console.log('callback actions');
const cb = await tab.evaluate(async () => {
  window.__x = [];
  const act = a => ResponseHandler.process({success: true, actions: [a]}).catch(e => String(e));
  await act({type: 'callback', function: 'ResponseHandler.showModal', args: ['<img src=x onerror="window.__x.push(\'cb-showModal\')">', {title: 't'}]});
  await new Promise(r => setTimeout(r, 400));
  window.modal?.hide?.();
  await new Promise(r => setTimeout(r, 250));
  await act({type: 'callback', function: 'SecurityManager.init', args: [{html: {urlSchemes: ['http:', 'https:', 'javascript:']}}]});
  await act({type: 'callback', function: 'App.rh.showModal', args: ['<img src=x onerror="window.__x.push(\'cb-app-rh\')">']});
  await new Promise(r => setTimeout(r, 400));
  window.modal?.hide?.();
  await new Promise(r => setTimeout(r, 250));
  const got = [];
  EventManager.on('appointment:reload', () => got.push('reload'));
  await act({type: 'callback', function: 'EventManager.emit', args: ['appointment:reload']});
  await new Promise(r => setTimeout(r, 100));
  return {executed: [...window.__x], schemes: SecurityManager.config.html.urlSchemes, js: SecurityManager.sanitizeHtml('<a href="javascript:1">x</a>'), emitted: got};
});
check('callback ResponseHandler.showModal does not run', !cb.executed.includes('cb-showModal'), JSON.stringify(cb.executed));
check('callback through an app object holding ResponseHandler does not run', !cb.executed.includes('cb-app-rh'), JSON.stringify(cb.executed));
check('callback SecurityManager.init does not add javascript:', !cb.schemes.includes('javascript:'), JSON.stringify(cb.schemes));
check('javascript: links are still cleaned after it', cb.js === '<a>x</a>', cb.js);
check("callback 'EventManager.emit' (timeline) still emits", cb.emitted.length === 1, JSON.stringify(cb.emitted));

// --- SecurityManager.init called again directly --------------------------------
console.log('SecurityManager.init run again');
const si = await tab.evaluate(async () => {
  const before = JSON.stringify(SecurityManager.config.html);
  await SecurityManager.init({html: {urlSchemes: ['javascript:'], tags: ['script', 'iframe'], dataAttributes: ['data-on'], iframeHosts: ['https://evil.example/'],
    attributes: {'*': ['onclick']}, templateTags: ['script']}, csp: {enabled: false}});
  let pushed = 'no error';
  try {
    SecurityManager.config.html.urlSchemes.push('javascript:');
  } catch (e) {
    pushed = e.constructor.name;
  }
  return {same: JSON.stringify(SecurityManager.config.html) === before, pushed, hosts: SecurityManager.config.html.iframeHosts, js: SecurityManager.sanitizeHtml('<a href="javascript:1" onclick="x" data-on="click:pwn">x</a><script>1</script>'),
    cspStillApplies: SecurityManager.config.csp.enabled === false};
});
check('a second init leaves config.html as it was', si.same);
check('sanitizeHtml still drops javascript:, onclick, data-on and script', si.js === '<a>x</a>', si.js);
check('a second init still applies its other sections', si.cspStillApplies);
check('config.html cannot be changed in place after init', si.pushed === 'TypeError', si.pushed);
check('Now.init({security: {html}}) sets the rules and keeps the defaults', si.hosts.includes('www.google.com/maps/embed') && si.hosts.some(h => h.includes('youtube')), JSON.stringify(si.hosts));

// --- showModal and friends --------------------------------------------------------
console.log('modals');
const m = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  await ResponseHandler.showModal('<b>bold</b><img src=x onerror="window.__x.push(\'direct\')">', {title: 't'});
  await new Promise(r => setTimeout(r, 300));
  out.direct = window.modal.body.innerHTML;
  window.modal.hide();
  await new Promise(r => setTimeout(r, 250));
  await ResponseHandler.process({success: true, actions: [{type: 'modal', html: '<b>from-action</b><img src=x onerror="window.__x.push(\'action\')">'}]});
  await new Promise(r => setTimeout(r, 300));
  out.action = window.modal.body.innerHTML;
  window.modal.hide();
  await new Promise(r => setTimeout(r, 250));
  ResponseHandler.showErrorModal('<i>oops</i>');
  await new Promise(r => setTimeout(r, 100));
  out.error = window.modal.body.textContent.replace(/\s+/g, ' ').trim();
  out.errorTags = window.modal.body.querySelectorAll('i').length;
  window.modal.hide();
  await new Promise(r => setTimeout(r, 250));
  await ResponseHandler.process({success: true, actions: [{type: 'modal', content: '<p>{{name}}</p>', data: {name: 'templated'}}]});
  await new Promise(r => setTimeout(r, 300));
  out.content = window.modal.body.textContent.trim();
  window.modal.hide();
  await new Promise(r => setTimeout(r, 250));
  out.executed = [...window.__x];
  return out;
});
check('showModal(string) keeps markup', /<b>bold<\/b>/.test(m.direct), m.direct);
check('showModal(string) drops onerror', !/onerror/.test(m.direct), m.direct);
check('a modal action with html still shows its markup', /<b>from-action<\/b>/.test(m.action) && !/onerror/.test(m.action), m.action);
check('showErrorModal still shows its message as text', m.error.includes('<i>oops</i>') && m.errorTags === 0, m.error);
check('a modal action with content and data still renders', m.content === 'templated', m.content);
check('no modal markup ran', m.executed.length === 0, JSON.stringify(m.executed));

// --- directives ------------------------------------------------------------------
console.log('directives');
const d = await tab.evaluate(async () => {
  window.__x = [];
  window.__hit = name => window.__x.push(name);
  const orig = ResponseHandler.showModal;
  ResponseHandler.showModal = function(...a) {
    window.__x.push('dir-showModal');
    return orig.apply(this, a);
  };
  const tpl = `<button id="d1" data-on="click:ResponseHandler.showModal('x')">1</button>
    <button id="d2" data-action="click:ResponseHandler.showModal">2</button>
    <button id="d3" data-on="click:pwn2">3</button>`;
  window.pwn2 = () => window.__x.push('app-fn');
  const frag = await ResponseHandler.renderModalContent(tpl, {});
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 200));
  ['d1', 'd2', 'd3'].forEach(id => host.querySelector('#' + id)?.click());
  await new Promise(r => setTimeout(r, 300));
  ResponseHandler.showModal = orig;
  host.remove();
  return [...window.__x];
});
check('data-on / data-action naming ResponseHandler.showModal do nothing', !d.includes('dir-showModal'), JSON.stringify(d));
check('data-on naming an app function still runs', d.includes('app-fn'), JSON.stringify(d));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
