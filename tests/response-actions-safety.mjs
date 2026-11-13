/**
 * Server response actions and error pages (Now.js audit 2026-11-10, phase 3: S3, part of S11).
 *
 * - callback / confirm.onConfirm call only what Now.resolveFunction() allows:
 *   app functions and registered ones (EventManager.emit still works), never
 *   eval, setTimeout or another built-in.
 * - modal html/content from a response is untrusted HTML; a modal title is text.
 * - redirect and download stay on this origin unless the origin is in
 *   ResponseHandler.config.allowedOrigins or the action says external: true
 *   (http/https only); a javascript: URL never runs.
 * - ErrorRenderer, AuthErrorHandler.renderBasicError, the GraphRenderer SVG
 *   <desc> and HTML an autocomplete callback returns do not run markup from data.
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
<script src="/graph.js"></script>
<script src="/auth-error.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript'],
    '/graph.js': [readFileSync(DIST + 'now.graph.min.js', 'utf8'), 'application/javascript'],
    // AuthErrorHandler is not part of any bundle: load its source
    '/auth-error.js': [readFileSync(DIST + '../js/AuthErrorHandler.js', 'utf8'), 'application/javascript']
  };
  const file = files[req.url];
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

// --- callback and confirm.onConfirm ------------------------------------------
const cb = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  window.setInventoryProduct = (row) => window.__x.push('app:' + row.id);
  window.Cart = {items: 2, clear() {
    this.items = 0;
  }};
  EventManager.on('appointment:reload', () => window.__x.push('emit'));
  const run = (action) => ResponseHandler.process({success: true, actions: [action]});
  await run({type: 'callback', function: 'eval', args: ['window.__x.push("callback-eval")']});
  await run({type: 'callback', function: 'setTimeout', args: ['window.__x.push("callback-setTimeout")', 0]});
  await run({type: 'callback', function: 'Function', args: ['window.__x.push("callback-Function")']});
  await run({type: 'callback', function: 'Cart.clear.constructor', args: ['window.__x.push("callback-ctor")']});
  await run({type: 'callback', function: 'setInventoryProduct', args: [{id: 7}]});
  await run({type: 'callback', function: 'EventManager.emit', args: ['appointment:reload']});
  await run({type: 'callback', function: 'Cart.clear'});
  const realConfirm = DialogManager.confirm;
  DialogManager.confirm = async () => true;
  await run({type: 'confirm', message: 'ok?', onConfirm: 'eval'});
  window.confirmed = () => window.__x.push('confirmed');
  await run({type: 'confirm', message: 'ok?', onConfirm: 'confirmed'});
  DialogManager.confirm = realConfirm;
  await new Promise(r => setTimeout(r, 300));
  out.executed = [...window.__x];
  out.cartItems = window.Cart.items;
  return out;
});
check('callback cannot reach eval, setTimeout, Function or a constructor', !cb.executed.some(x => x.startsWith('callback-')), JSON.stringify(cb.executed));
check('callback still calls an app function with its arguments', cb.executed.includes('app:7'), JSON.stringify(cb.executed));
check('callback EventManager.emit still works (timeline)', cb.executed.includes('emit'), JSON.stringify(cb.executed));
check('callback Cart.clear runs with Cart as this', cb.cartItems === 0, cb.cartItems);
check('confirm.onConfirm calls an app function, not eval', cb.executed.includes('confirmed'), JSON.stringify(cb.executed));

// --- modal -------------------------------------------------------------------
const modal = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  await ResponseHandler.process({success: true, actions: [{type: 'modal', html: '<p>hi</p><img src=x onerror="window.__x.push(\'modal-html\')">', title: '<img src=x onerror="window.__x.push(\'modal-title\')">Title & more'}]});
  await new Promise(r => setTimeout(r, 300));
  const m = window.modal?.modal;
  out.body = m?.querySelector('.modal-body')?.innerHTML || '';
  out.titleText = m?.querySelector('.modal-title')?.textContent || '';
  out.titleImg = !!m?.querySelector('.modal-title img');
  window.modal?.hide();
  await new Promise(r => setTimeout(r, 700));
  await ResponseHandler.process({success: true, actions: [{type: 'modal', content: '<b>c</b><img src=x onerror="window.__x.push(\'modal-content\')">', title: 'C'}]});
  await new Promise(r => setTimeout(r, 300));
  out.content = window.modal?.modal?.querySelector('.modal-body')?.innerHTML || '';
  window.modal?.hide();
  const own = new Modal({title: 'A & <b>B</b>', content: '<form id="appform"><input name="q"></form>'});
  own.setTitle('<img src=x onerror="window.__x.push(\'setTitle\')">X');
  out.ownTitle = own.modal.querySelector('.modal-title').textContent;
  out.ownTitleImg = !!own.modal.querySelector('.modal-title img');
  out.ownForm = !!own.modal.querySelector('#appform input');
  const fresh = new Modal({title: 'A & <b>B</b>'});
  out.freshTitle = fresh.modal.querySelector('.modal-title').textContent;
  await new Promise(r => setTimeout(r, 300));
  out.executed = [...window.__x];
  return out;
});
check('modal html from a response loses onerror and keeps its text', /<p>hi<\/p>/.test(modal.body) && !/onerror/.test(modal.body), modal.body);
check('modal content from a response loses onerror', /<b>c<\/b>/.test(modal.content) && !/onerror/.test(modal.content), modal.content);
check('modal title from a response is text', !modal.titleImg && modal.titleText.startsWith('<img') && modal.titleText.includes('Title & more'), modal.titleText);
check('Modal.setTitle and the constructor title are text', !modal.ownTitleImg && modal.ownTitle === '<img src=x onerror="window.__x.push(\'setTitle\')">X' && modal.freshTitle === 'A & <b>B</b>', `${modal.ownTitle} | ${modal.freshTitle}`);
check("an app's own Modal content (a form) still renders", modal.ownForm === true);
check('no modal markup ran', modal.executed.length === 0, JSON.stringify(modal.executed));

// --- redirect and download ---------------------------------------------------
const nav = await tab.evaluate(async (origin) => {
  window.__x = [];
  const opened = [];
  const clicked = [];
  const realOpen = window.open;
  window.open = (url, target) => {
    opened.push(String(url) + '|' + target);
    return null;
  };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {
    clicked.push(this.getAttribute('href'));
  };
  const run = (action) => ResponseHandler.process({success: true, actions: [action]});
  const before = location.href;
  await run({type: 'redirect', url: 'javascript:window.__x.push("redirect-js")', delay: 0});
  await run({type: 'redirect', url: ' java\tscript:window.__x.push("redirect-js2")', delay: 0, target: '_blank'});
  await run({type: 'redirect', url: 'https://evil.example/phish', delay: 0, target: '_blank'});
  await run({type: 'redirect', url: 'https://customer.example/api/index/auth/loginas?token=t', delay: 0, target: '_blank', external: true});
  await run({type: 'redirect', url: 'javascript:alert(1)', delay: 0, target: '_blank', external: true});
  await run({type: 'redirect', url: origin + '/inside', delay: 0, target: '_blank'});
  ResponseHandler.config.allowedOrigins = ['https://main.example'];
  await run({type: 'redirect', url: 'https://main.example/order?token=x', delay: 0, target: '_blank'});
  ResponseHandler.config.allowedOrigins = [];
  await run({type: 'download', url: 'javascript:window.__x.push("download-js")'});
  await run({type: 'download', url: 'https://evil.example/file.exe'});
  await run({type: 'download', url: '/export.php?id=1', filename: 'a.pdf'});
  await run({type: 'download', url: 'https://cdn.example/file.pdf', external: true});
  await new Promise(r => setTimeout(r, 300));
  window.open = realOpen;
  HTMLAnchorElement.prototype.click = realClick;
  return {opened, clicked, executed: [...window.__x], same: location.href === before};
}, origin);
check('a javascript: redirect never runs (with or without tab/space tricks)', !nav.executed.length && nav.same && !nav.opened.some(u => /script:/i.test(u)), JSON.stringify(nav));
check('a redirect to another origin is refused by default', !nav.opened.some(u => u.startsWith('https://evil.example')), JSON.stringify(nav.opened));
check("a redirect with external: true opens the other origin (bluprint login-as)", nav.opened.includes('https://customer.example/api/index/auth/loginas?token=t|_blank'), JSON.stringify(nav.opened));
check('a same-origin absolute redirect still works', nav.opened.some(u => u.startsWith(origin + '/inside')), JSON.stringify(nav.opened));
check('a redirect to an origin in allowedOrigins works (oms tenant → main site)', nav.opened.some(u => u.startsWith('https://main.example/order')), JSON.stringify(nav.opened));
check('download refuses javascript: and other origins, keeps same-origin and external', JSON.stringify(nav.clicked) === JSON.stringify(['/export.php?id=1', 'https://cdn.example/file.pdf']), JSON.stringify(nav.clicked));

// --- error pages, SVG desc, autocomplete callback ----------------------------
const pages = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  const bad = '<img src=x onerror="window.__x.push(\'%s\')">';
  ErrorRenderer.renderError(new Error('boom'), {containerId: 'main', title: bad.replace('%s', 'er-title'), message: bad.replace('%s', 'er-message')});
  await new Promise(r => setTimeout(r, 200));
  const main = document.getElementById('main');
  out.erTitle = main.querySelector('.error-title')?.textContent || '';
  out.erImg = main.querySelectorAll('img').length;
  window.AuthErrorHandler.renderBasicError({}, {message: bad.replace('%s', 'auth-message')});
  await new Promise(r => setTimeout(r, 200));
  out.authText = main.querySelector('.auth-error-content p')?.textContent || '';
  out.authImg = main.querySelectorAll('img').length;
  // GraphRenderer SVG export: <desc> carries translated text with data in it
  const box = document.createElement('div');
  box.style.width = '300px';
  box.style.height = '200px';
  document.body.appendChild(box);
  const g = new GraphRenderer(box, {type: 'line', animation: false});
  g.setData([{name: 's', data: [{label: 'a', value: 1}, {label: 'b', value: 2}]}]);
  g.getAccessibilityDescription = () => 'x</desc><img src=x onerror="window.__x.push(\'desc\')"><desc>';
  let svgText = '';
  const realCreate = URL.createObjectURL;
  URL.createObjectURL = (blob) => {
    blob.text().then(t => {
      svgText = t;
    });
    return 'blob:x';
  };
  const realClick = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function() {};
  try {
    g.exportToImage('g', 'svg');
  } catch (e) {
    out.exportError = String(e);
  }
  await new Promise(r => setTimeout(r, 300));
  URL.createObjectURL = realCreate;
  HTMLAnchorElement.prototype.click = realClick;
  // Autocomplete callback that returns HTML built from item data
  window.acRender = ({value}) => '<b>' + value + '</b>';
  const form = document.createElement('form');
  form.innerHTML = '<input type="text" id="ac" name="ac" data-autocomplete="true" data-source="acList" data-callback="acRender">';
  window.acList = {1: 'one'};
  document.body.appendChild(form);
  ElementManager.scan(form);
  await new Promise(r => setTimeout(r, 200));
  const inst = ElementManager.getInstanceByElement(form.querySelector('#ac'));
  const li = inst?.createListItem?.('1', '<img src=x onerror="window.__x.push(\'ac\')">one', '');
  out.acHtml = li ? li.innerHTML : 'no-instance';
  out.svgHasImg = /<img/i.test(svgText);
  out.svgDesc = (svgText.match(/<desc>[\s\S]*?<\/desc>/) || [''])[0];
  out.executed = [...window.__x];
  return out;
});
check('ErrorRenderer shows title and message as text', pages.erTitle.includes('<img') && pages.erImg === 0, JSON.stringify(pages));
check('AuthErrorHandler.renderBasicError shows the message as text', pages.authText.includes('<img') && pages.authImg === 0, JSON.stringify(pages));
check('GraphRenderer SVG <desc> is text', !pages.svgHasImg && /&lt;img/.test(pages.svgDesc), pages.svgDesc || pages.exportError);
check('an autocomplete callback keeps its markup but loses onerror', /<b>/.test(pages.acHtml) && !/onerror/.test(pages.acHtml), pages.acHtml);
check('no error-page, SVG or autocomplete markup ran', pages.executed.length === 0, JSON.stringify(pages.executed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
