/**
 * Response attributes follow the same rules as template bindings; object data
 * is a URL; template errors are shown as text (Now.js audit 2026-11-11, phase 4:
 * L2, L3, L4).
 *
 * - SecurityManager.isForbiddenAttribute(): on*, srcdoc, http-equiv and every
 *   directive that turns markup into behaviour (data-on, data-action,
 *   data-script, data-on-load, data-html, data-component, data-api-*,
 *   data-attr, data-if, data-for, data-model, data-bind). ResponseHandler
 *   (update attr/attrs, attribute) and TemplateManager.safeAttributeValue()
 *   (data-attr, {{ }} in attributes) both use it.
 * - SecurityManager.isUrlAttribute(): the URL attributes of the sanitizer
 *   (href, src, action, formaction, poster, cite, background, xlink:href, data,
 *   codebase, ping, manifest), so <object data> is checked everywhere; a
 *   srcset from a response is checked as well.
 * - TemplateManager.renderError() escapes the message.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
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
<script>
window.__x = [];
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript']
  };
  const file = files[path];
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
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

const DIRECTIVES = ['data-on', 'data-action', 'data-script', 'data-on-load', 'data-html', 'data-component', 'data-api-url', 'data-api-method',
  'data-attr', 'data-if', 'data-for', 'data-model', 'data-bind'];

// --- response update / attribute actions --------------------------------------------
console.log('response actions');
const resp = await tab.evaluate(async (DIRECTIVES) => {
  window.__x = [];
  window.pwn = () => window.__x.push('pwn');
  const host = document.createElement('div');
  host.innerHTML = '<button id="rb">rb</button><object id="ro"></object><div id="rd"></div><img id="ri"><a id="ra">a</a><a id="ok">ok</a>';
  document.body.appendChild(host);
  const act = a => ResponseHandler.process({success: true, actions: [a]}).catch(e => String(e));
  const attrs = Object.fromEntries(DIRECTIVES.map(n => [n, n === 'data-component' ? 'api' : 'click:pwn']));
  await act({type: 'update', target: '#rb', method: 'attrs', attrs});
  await act({type: 'update', target: '#rd', method: 'attr', attr: 'data-action', content: 'click:pwn'});
  await act({type: 'attribute', target: '#ra', name: 'data-on', value: 'click:pwn'});
  await act({type: 'update', target: '#ro', method: 'attr', attr: 'data', content: "javascript:window.__x.push('obj')"});
  await act({type: 'update', target: '#ri', method: 'attrs', attrs: {srcset: "javascript:alert(1) 1x, /ok.png 2x", src: '/ok.png'}});
  await act({type: 'update', target: '#ok', method: 'attrs', attrs: {href: '/orders?id=1', title: 'Orders', 'data-id': '7', 'aria-label': 'x'}});
  await new Promise(r => setTimeout(r, 300));
  host.querySelector('#rb').click();
  host.querySelector('#rd').click();
  host.querySelector('#ra').click();
  await new Promise(r => setTimeout(r, 300));
  const names = el => [...el.attributes].map(a => a.name);
  const out = {rb: names(host.querySelector('#rb')), rd: names(host.querySelector('#rd')), ra: names(host.querySelector('#ra')),
    ro: host.querySelector('#ro').getAttribute('data'), ri: host.querySelector('#ri').getAttribute('srcset'),
    ok: Object.fromEntries([...host.querySelector('#ok').attributes].map(a => [a.name, a.value])),
    rbClass: host.querySelector('#rb').className, executed: [...window.__x]};
  host.remove();
  return out;
}, DIRECTIVES);
check('update attrs sets no directive attribute', !resp.rb.some(n => n.startsWith('data-')), JSON.stringify(resp.rb));
check('data-component from a response does not make an ApiComponent', !/api-component/.test(resp.rbClass), resp.rbClass);
check('update attr data-action is not set', !resp.rd.includes('data-action'), JSON.stringify(resp.rd));
check('the attribute action does not set data-on', !resp.ra.includes('data-on'), JSON.stringify(resp.ra));
check('clicking ran nothing', resp.executed.length === 0, JSON.stringify(resp.executed));
check('<object data> from a response is not javascript:', !/javascript/i.test(resp.ro || ''), resp.ro);
check('srcset from a response drops javascript:', !/javascript/i.test(resp.ri || ''), resp.ri);
check('plain attributes and a path href are still set', resp.ok.href === '/orders?id=1' && resp.ok.title === 'Orders' && resp.ok['data-id'] === '7' && resp.ok['aria-label'] === 'x', JSON.stringify(resp.ok));

// --- template bindings ---------------------------------------------------------------------
console.log('template bindings');
const tpl = await tab.evaluate(async () => {
  window.__x = [];
  const t = `<object id="o1" data-attr="data:u"></object><object id="o2" data="{{u}}"></object>
    <div id="d1" data-attr="data-component:comp, data-api-url:p, data-if:p, data-model:p, data-bind:p, data-for:p">d</div>
    <a id="a1" data-attr="data-id:id, data-api:p, href:path">a</a>`;
  const frag = await ResponseHandler.renderModalContent(t, {u: "javascript:window.__x.push('o')", comp: 'api', p: '/x', id: 7, path: '/orders/7'});
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 300));
  const names = el => [...el.attributes].map(a => a.name);
  return {o1: host.querySelector('#o1').getAttribute('data'), o2: host.querySelector('#o2').getAttribute('data'), d1: names(host.querySelector('#d1')),
    a1: Object.fromEntries([...host.querySelector('#a1').attributes].map(a => [a.name, a.value]))};
});
check('data-attr="data:u" on <object> is not javascript:', !/javascript/i.test(tpl.o1 || ''), tpl.o1);
check('data="{{u}}" on <object> is not javascript:', !/javascript/i.test(tpl.o2 || ''), tpl.o2);
check('data-attr does not set data-component, data-api-*, data-if, data-model, data-bind, data-for', !tpl.d1.some(n => /^data-(component|api-url|if|model|bind|for)$/.test(n)), JSON.stringify(tpl.d1));
check('data-attr still sets data-id, data-api and href', tpl.a1['data-id'] === '7' && tpl.a1['data-api'] === '/x' && tpl.a1.href === '/orders/7', JSON.stringify(tpl.a1));

// --- one source ----------------------------------------------------------------------
console.log('one source');
const src = await tab.evaluate((DIRECTIVES) => {
  const sm = window.SecurityManager;
  return {
    hasForbidden: typeof sm.isForbiddenAttribute === 'function',
    hasUrl: typeof sm.isUrlAttribute === 'function',
    forbidden: typeof sm.isForbiddenAttribute === 'function' ? [...DIRECTIVES, 'onclick', 'srcdoc', 'http-equiv'].filter(n => !sm.isForbiddenAttribute(n)) : null,
    allowed: typeof sm.isForbiddenAttribute === 'function' ? ['title', 'data-id', 'data-api', 'href', 'class'].filter(n => sm.isForbiddenAttribute(n)) : null,
    url: typeof sm.isUrlAttribute === 'function' ? ['href', 'src', 'data', 'cite', 'ping', 'xlink:href', 'formaction'].filter(n => !sm.isUrlAttribute(n)) : null,
    tmSafe: TemplateManager.safeAttributeValue(document.createElement('div'), 'data-bind', 'x'),
    tmData: TemplateManager.safeAttributeValue(document.createElement('object'), 'data', 'javascript:1')
  };
}, DIRECTIVES);
check('SecurityManager.isForbiddenAttribute covers every directive, on*, srcdoc, http-equiv', src.hasForbidden && src.forbidden.length === 0, JSON.stringify(src.forbidden));
check('it leaves plain attributes alone', src.hasForbidden && src.allowed.length === 0, JSON.stringify(src.allowed));
check('SecurityManager.isUrlAttribute covers href, src, data, cite, ping, xlink:href, formaction', src.hasUrl && src.url.length === 0, JSON.stringify(src.url));
check('TemplateManager.safeAttributeValue uses the same rules', src.tmSafe === null && src.tmData === null, JSON.stringify(src));

// --- renderError -------------------------------------------------------------------------
console.log('renderError');
const re = await tab.evaluate(async () => {
  window.__x = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.innerHTML = TemplateManager.renderError(new Error('<img src=x onerror="window.__x.push(\'renderError\')"> & more'));
  await new Promise(r => setTimeout(r, 300));
  return {text: host.textContent.replace(/\s+/g, ' ').trim(), imgs: host.querySelectorAll('img').length, executed: [...window.__x]};
});
check('renderError shows the message as text', re.imgs === 0 && re.text.includes('<img src=x') && re.text.includes('& more'), JSON.stringify(re));
check('renderError runs nothing', re.executed.length === 0, JSON.stringify(re.executed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
