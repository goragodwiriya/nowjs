/**
 * Template directives and data (Now.js audit 2026-11-10, phase 2: S2 S4 B2 B3 B4).
 *
 * - Data never becomes code: data-html content is inert (no directives, no
 *   {{ }}), untrusted HTML loses every data-* attribute, a URL from data cannot
 *   be javascript:, and an attribute named on* or srcdoc is never set.
 * - A directive that names a function (data-on, data-script, data-on-load,
 *   data-action) finds it through Now.resolveFunction(): registered functions
 *   first, then window — own properties only, no built-in (native) function,
 *   no eval/Function/setTimeout/…, no path through constructor/prototype.
 * - data-on keeps every argument (commas and parentheses inside strings) and
 *   every event (no 100 ms throttle).
 * - {{ }} puts the value in as written ($& stays $&).
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
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

const hits = [];
const server = http.createServer((req, res) => {
  hits.push(req.method + ' ' + req.url);
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  res.writeHead(200, {'Content-Type': 'application/json'});
  res.end('{"success":true,"data":{}}');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
const dialogs = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('dialog', d => {
  dialogs.push(d.message());
  d.dismiss();
});
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Data never becomes code (probe p2/p3) ----------------------------------
const data = await tab.evaluate(async () => {
  window.__x = [];
  delete window.pwned;
  const frag = await ResponseHandler.renderModalContent(
    '<a id="l1" data-attr="href:site">x</a><a id="l2" href="{{site}}">y</a>' +
    '<a id="mail" data-attr="href:\'mailto:\' + email">m</a><a id="rel" data-attr="href:\'../api/x?id=\' + id">r</a>' +
    '<a id="ev" data-attr="onclick:site, srcdoc:site, title:name">e</a>' +
    '<img id="img" data-attr="src:pic">' +
    '<div id="h" data-html="bio"></div><p id="t">{{name}}</p><p id="t2">{{a}} and {{b}}</p>',
    {
      site: 'javascript:window.__x.push("js-href")', email: 'a@example.com', id: 7,
      name: '$& <b>', a: '{{b}}', b: '$1', pic: 'data:image/png;base64,iVBORw0KGgo=',
      bio: '<span id="inj" data-on="click:eval(\'window.pwned=1337\')" data-action="click:requestApi" data-api-url="/steal">hi {{site}}</span>'
    }
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 100));
  const q = (s) => host.querySelector(s);
  const out = {
    l1: q('#l1')?.getAttribute('href') ?? null,
    l2: q('#l2')?.getAttribute('href') ?? null,
    mail: q('#mail')?.getAttribute('href') ?? null,
    rel: q('#rel')?.getAttribute('href') ?? null,
    evAttrs: q('#ev') ? [...q('#ev').attributes].map(a => a.name).filter(n => n !== 'id' && !n.startsWith('data-')) : null,
    evTitle: q('#ev')?.getAttribute('title'),
    img: q('#img')?.getAttribute('src') ?? null,
    h: q('#h')?.innerHTML,
    t: q('#t')?.textContent,
    t2: q('#t2')?.textContent
  };
  q('#l1')?.click();
  q('#l2')?.click();
  q('#inj')?.click();
  await new Promise(r => setTimeout(r, 400));
  out.executed = [...window.__x];
  out.pwned = window.pwned;
  host.remove();
  return out;
});
check('data-attr href from data cannot be javascript:', !data.l1, data.l1);
check('href="{{field}}" from data cannot be javascript:', !data.l2, data.l2);
check('data-attr href keeps mailto: built in the template', data.mail === 'mailto:a@example.com', data.mail);
check('data-attr href keeps a ../ link', data.rel === '../api/x?id=7', data.rel);
check('data-attr never sets on* or srcdoc, other names still work', JSON.stringify(data.evAttrs) === '["title"]' && data.evTitle === '$& <b>', JSON.stringify(data.evAttrs) + ' ' + data.evTitle);
check('data-attr src keeps data:image', (data.img || '').startsWith('data:image/png'), data.img);
check('data-html content loses its directives', data.h !== undefined && !/data-on|data-action|data-api/.test(data.h), data.h);
check('data-html content keeps {{ }} as text', /hi \{\{site\}\}/.test(data.h || ''), data.h);
check('{{name}} with $& shows $& as written', data.t === '$& <b>', data.t);
check('a value that looks like {{ }} is not evaluated again', data.t2 === '{{b}} and $1', data.t2);
check('nothing from data ran', data.executed.length === 0 && data.pwned === undefined, JSON.stringify(data));
check('no request was sent by injected data-action', !hits.some(h => h.includes('/steal')), hits.join(', '));

// --- data-on arguments and events (probe p3) --------------------------------
const on = await tab.evaluate(async () => {
  const calls = [];
  window.record = (...a) => calls.push(a.filter(v => typeof v !== 'object'));
  const frag = await ResponseHandler.renderModalContent(
    '<button id="b1" type="button" data-on="click:record(\'a\', \'b\')">b</button>' +
    '<button id="b2" type="button" data-on="click:record(\'x, y\', 2, \'(z)\')">b</button>' +
    '<button id="b3" type="button" data-on="click:record(n + 1, label)">b</button>' +
    '<span id="b4" data-on="click:record(\'one\'), mouseover:record(\'two\')">s</span>' +
    '<input id="i" data-on="input:record(\'in\')">',
    {n: 41, label: 'L'}
  );
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 100));
  host.querySelector('#b1').click();
  host.querySelector('#b2').click();
  host.querySelector('#b3').click();
  host.querySelector('#b4').click();
  host.querySelector('#b4').dispatchEvent(new MouseEvent('mouseover', {bubbles: true}));
  const input = calls.length;
  const i = host.querySelector('#i');
  for (let k = 0; k < 5; k++) {
    i.value += 'x';
    i.dispatchEvent(new Event('input', {bubbles: true}));
    await new Promise(r => setTimeout(r, 30));
  }
  await new Promise(r => setTimeout(r, 200));
  host.remove();
  return {calls: calls.map(c => JSON.stringify(c)), inputs: calls.length - input};
});
check("data-on record('a', 'b') gets both arguments", on.calls[0] === '["a","b"]', on.calls[0]);
check('data-on keeps commas and parentheses inside a string', on.calls[1] === '["x, y",2,"(z)"]', on.calls[1]);
check('data-on evaluates expression arguments', on.calls[2] === '[42,"L"]', on.calls[2]);
check('data-on with two bindings runs each', on.calls[3] === '["one"]' && on.calls[4] === '["two"]', JSON.stringify(on.calls));
check('data-on runs for every input event (5 of 5)', on.inputs === 5, on.inputs);

// --- Functions a directive may reach ----------------------------------------
const fns = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  window.appInit = (el) => {
    window.__x.push('appInit:' + el.id);
  };
  window.App = {
    count: 0,
    inc() {
      this.count++;
    }
  };
  const has = typeof Now.resolveFunction === 'function';
  if (typeof Now.registerFunction === 'function') {
    Now.registerFunction('registeredInit', (el) => window.__x.push('registered:' + el.id));
  }
  const Now_ = has ? Now : {resolveFunction: () => 'missing'};
  out.resolveTypes = {
    appInit: typeof Now_.resolveFunction('appInit')?.fn,
    registered: typeof Now_.resolveFunction('registeredInit')?.fn,
    dotted: typeof Now_.resolveFunction('App.inc')?.fn,
    eval: Now_.resolveFunction('eval'),
    Function: Now_.resolveFunction('Function'),
    setTimeout: Now_.resolveFunction('setTimeout'),
    alert: Now_.resolveFunction('alert'),
    nativeFetch: Now_.resolveFunction('fetch'),
    viaWindow: Now_.resolveFunction('window.eval'),
    ctor: Now_.resolveFunction('App.inc.constructor'),
    proto: Now_.resolveFunction('App.__proto__.toString'),
    toString: Now_.resolveFunction('App.toString'),
    bracket: Now_.resolveFunction('App["inc"]')
  };
  const host = document.createElement('div');
  host.innerHTML =
    '<div id="s1" data-script="appInit"></div>' +
    '<div id="s2" data-script="registeredInit"></div>' +
    '<div id="s3" data-script="setTimeout"></div>' +
    '<button id="a1" type="button" data-action="click:App.inc">a</button>' +
    '<button id="a2" type="button" data-action="click:Function(\'window.__x.push(1)\')">a</button>' +
    '<button id="a3" type="button" data-action="click:App.inc.constructor(\'window.__x.push(2)\')">a</button>';
  document.body.appendChild(host);
  host.querySelectorAll('[data-script]').forEach(el => TemplateManager.processDataScript(el, {state: {}}));
  host.querySelector('#a1').click();
  host.querySelector('#a2').click();
  host.querySelector('#a3').click();
  const frag = await ResponseHandler.renderModalContent(
    '<button id="e1" type="button" data-on="click:eval(\'window.__x.push(3)\')">e</button>' +
    '<button id="e2" type="button" data-on="click:alert(\'hi\')">e</button>' +
    '<button id="e3" type="button" data-on="click:App.inc">e</button>',
    {}
  );
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 50));
  host.querySelector('#e1').click();
  host.querySelector('#e2').click();
  host.querySelector('#e3').click();
  await new Promise(r => setTimeout(r, 300));
  out.count = window.App.count;
  out.executed = [...window.__x];
  host.remove();
  return out;
});
const r = fns.resolveTypes;
check('a global app function and a registered one resolve', r.appInit === 'function' && r.registered === 'function' && r.dotted === 'function', JSON.stringify(r));
check('eval, Function, setTimeout, alert, fetch do not resolve', [r.eval, r.Function, r.setTimeout, r.alert, r.nativeFetch].every(v => v === null), JSON.stringify(r));
check('window.*, constructor, __proto__, inherited and bracket paths do not resolve', [r.viaWindow, r.ctor, r.proto, r.toString, r.bracket].every(v => v === null), JSON.stringify(r));
check('data-script runs an app function and a registered one, not setTimeout', fns.executed.includes('appInit:s1') && fns.executed.includes('registered:s2') && fns.executed.length === 2, JSON.stringify(fns.executed));
check('data-action and data-on call a method with its object as this', fns.count === 2, fns.count);
check('no dialog was opened by data-on="click:alert(...)"', dialogs.length === 0, dialogs.join(' | '));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
