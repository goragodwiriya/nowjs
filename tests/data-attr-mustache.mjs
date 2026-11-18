/**
 * {{ }} inside data-attr (2026-11-13).
 *
 * Since SecurityManager.isForbiddenAttribute() lists data-attr (2026-11-11),
 * TemplateManager.processInterpolation() refused to write the data-attr it had
 * just filled from {{ }} and removed it: every form that wrote
 * data-attr="value:topic[{{lng}}]" inside a data-for (GCMS article and
 * category forms) loaded empty, with nothing in the console.
 *
 * processInterpolation() now leaves data-attr as written and processDataAttr()
 * resolves {{ }} inside each expression after it has read the attribute names,
 * every value as a literal (TemplateManager._fillAttrPlaceholders), so:
 * - value:topic[{{lng}}], value:topic[{{lng.value}}] and value:topic[lng] fill
 *   the field, and the data-attr attribute stays;
 * - a value cannot add a binding (onclick, title) or rename one, read another
 *   field, call a function (registered, or in the state by name) or close a
 *   string: only letters, marks, digits, _ . - and spaces go in, anything else
 *   is left out with a console warning;
 * - inside a quoted string a plain value goes in as it is ('item-{{id}}'), a
 *   URL does not (style:'url({{img}})' is left out — concatenate instead);
 * - string concatenation (name:'prefix[' + type.code + ']') works;
 * - data-options-key="opts_{{k}}" still builds its key path.
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

// Renders a template the way a form or modal does and returns what the elements ended up with
const render = (template, data) => tab.evaluate(async (template, data) => {
  window.__x = [];
  window.pwn = () => window.__x.push('pwn');
  const frag = await ResponseHandler.renderModalContent(template, data);
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 300));
  host.querySelectorAll('input, textarea, a, div[id]').forEach(el => el.click && el.click());
  await new Promise(r => setTimeout(r, 100));
  const out = {};
  host.querySelectorAll('[id]').forEach(el => {
    out[el.id] = {
      value: 'value' in el ? el.value : null,
      attrs: Object.fromEntries([...el.attributes].map(a => [a.name, a.value]))
    };
  });
  out.__executed = [...window.__x];
  host.remove();
  return out;
}, template, data);

// --- {{ }} inside data-attr in a data-for -------------------------------------------
console.log('data-attr inside data-for');
const lang = await render(`
  <div data-for="lng in languages"><template>
    <input id="m_{{lng}}" data-attr="value:topic[{{lng}}]">
    <input id="v_{{lng}}" data-attr="value:topic[lng]">
    <textarea id="t_{{lng}}" data-attr="value:detail[{{lng}}]"></textarea>
  </template></div>
  <div data-for="lng in options"><template>
    <input id="o_{{lng.value}}" data-attr="value:topic[{{lng.value}}]">
  </template></div>`, {
  languages: ['en', 'th'],
  options: [{value: 'en', text: 'English'}, {value: 'th', text: 'ไทย'}],
  topic: {en: 'Hello', th: 'สวัสดี'},
  detail: {en: '<p>Body</p>', th: '<p>เนื้อหา</p>'}
});
check('value:topic[{{lng}}] fills each language', lang.m_en?.value === 'Hello' && lang.m_th?.value === 'สวัสดี', JSON.stringify([lang.m_en, lang.m_th]));
check('the data-attr attribute is kept', lang.m_en?.attrs['data-attr'] === 'value:topic[{{lng}}]', JSON.stringify(lang.m_en?.attrs));
check('value:topic[lng] fills each language', lang.v_en?.value === 'Hello' && lang.v_th?.value === 'สวัสดี', JSON.stringify([lang.v_en, lang.v_th]));
check('a textarea gets the HTML as its value', lang.t_en?.value === '<p>Body</p>' && lang.t_th?.value === '<p>เนื้อหา</p>', JSON.stringify([lang.t_en, lang.t_th]));
check('value:topic[{{lng.value}}] fills each language', lang.o_en?.value === 'Hello' && lang.o_th?.value === 'สวัสดี', JSON.stringify([lang.o_en, lang.o_th]));

// --- a value cannot add or rename a binding ---------------------------------------
console.log('hostile values');
const evil = await render(`
  <div data-for="k in keys"><template>
    <input id="e_{{k.id}}" data-attr="value:topic[{{k.key}}]">
  </template></div>
  <a id="h1" data-attr="title:'x{{p}}'">a</a>`, {
  keys: [
    {id: 1, key: 'en], onclick:pwn, title:topic[en'},
    {id: 2, key: "en'], onclick:pwn, x:['"},
    {id: 3, key: 'en, onfocus:pwn'}
  ],
  p: "', onclick:pwn, data-on:'click:pwn",
  topic: {en: 'Hello'}
});
const attrNames = el => Object.keys(el?.attrs || {});
const added = ['e_1', 'e_2', 'e_3', 'h1'].flatMap(id => attrNames(evil[id]).filter(n => /^on|^title$|^x$|^data-on$/.test(n) && !(id === 'h1' && n === 'title')));
check('no onclick, onfocus, data-on or extra binding from a value', added.length === 0, JSON.stringify(added));
check('clicking ran nothing', evil.__executed.length === 0, JSON.stringify(evil.__executed));
check("a value cannot close the string it sits in (title:'x{{p}}')", !/onclick|data-on/.test(evil.h1?.attrs.title || ''), JSON.stringify(evil.h1?.attrs));

// A value is a literal: it reads no other field and calls nothing
const lit = await tab.evaluate(async () => {
  window.__calls = [];
  window.globalFn = () => window.__calls.push('global');
  ExpressionEvaluator.registerFunction('probeFn', () => {window.__calls.push('registered'); return 'R';});
  const warnings = [];
  const warn = console.warn;
  console.warn = (...a) => {warnings.push(a.map(String).join(' ')); warn.apply(console, a);};
  const frag = await ResponseHandler.renderModalContent(`
    <div data-for="k in keys"><template><input id="l_{{k.id}}" data-attr="value:topic[{{k.key}}]"></template></div>`, {
    keys: [
      {id: 1, key: 'en] + secret + topic[en'},
      {id: 2, key: 'en] + probeFn() + topic[en'},
      {id: 3, key: 'en] + globalFn() + topic[en'},
      {id: 4, key: 'secret'},
      {id: 5, key: 'leak'},
      {id: 6, key: "en'] + secret + topic['en"},
      {id: 7, key: 'ภาษา'},
      {id: 8, key: 'en'}
    ],
    topic: {en: 'Hello', secret: 'topic-secret', leak: 'topic-leak', ภาษา: 'ไทย'},
    secret: 'SECRET',
    leak: () => {window.__calls.push('state'); return 'en';}
  });
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 300));
  console.warn = warn;
  const out = Object.fromEntries([...host.querySelectorAll('input')].map(i => [i.id, i.value]));
  host.remove();
  return {out, calls: window.__calls, warned: warnings.filter(w => /not a plain value/.test(w)).length};
});
check('a value cannot read another field (+ secret +)', !Object.values(lit.out).some(v => /SECRET/.test(v)), JSON.stringify(lit.out));
check('a value calls nothing: registered, global, or a state function named by the value', lit.calls.length === 0, JSON.stringify(lit.calls));
check('a plain key is a literal key, not a variable (secret → topic.secret, leak → topic.leak)', lit.out.l_4 === 'topic-secret' && lit.out.l_5 === 'topic-leak', JSON.stringify(lit.out));
check('a Thai key works (topic[{{k}}] with ภาษา)', lit.out.l_7 === 'ไทย', JSON.stringify(lit.out));
check('a value that is not plain is left out and warned about', lit.out.l_1 === '' && lit.out.l_6 === '' && lit.warned >= 4, JSON.stringify(lit));

// --- quoted strings, numbers and concatenation ------------------------------------
console.log('quoted strings, numbers and concatenation');
const str = await render(`
  <div id="bg" data-attr="style:'background-image:url({{img}})'">bg</div>
  <a id="q1" data-attr="title:'item-{{id}}', data-id:'{{id}}'">q</a>
  <div data-for="i in idx"><template><input id="n_{{i}}" data-attr="value:items[{{i}}]"></template></div>
  <div data-for="type in order_types"><template>
    <input id="c_{{type.code}}" data-attr="placeholder:type.code, name:'prefix[' + type.code + ']', value:type.value">
  </template></div>
  <div id="bg2" data-attr="style:'background-image:url(' + img + ')'">bg2</div>`, {
  img: '/datas/a.jpg',
  id: 7,
  idx: [0, 2],
  items: ['zero', 'one', 'two'],
  order_types: [{code: 'RX', value: 'R-'}, {code: 'TX', value: 'T-'}]
});
check("a URL is not spliced into a string (style:'url({{img}})' is left out)", !/a\.jpg/.test(str.bg?.attrs.style || ''), JSON.stringify(str.bg?.attrs));
check("a plain value goes into a string as it is (title:'item-{{id}}')", str.q1?.attrs.title === 'item-7' && str.q1?.attrs['data-id'] === '7', JSON.stringify(str.q1?.attrs));
check('digits stay a number key (items[{{i}}])', str.n_0?.value === 'zero' && str.n_2?.value === 'two', JSON.stringify([str.n_0, str.n_2]));
check("style:'background-image:url(' + img + ')'", /url\(["']?\/datas\/a\.jpg["']?\)/.test(str.bg2?.attrs.style || ''), JSON.stringify(str.bg2?.attrs));
check("name:'prefix[' + type.code + ']' builds the field name", str.c_RX?.attrs.name === 'prefix[RX]' && str.c_TX?.attrs.name === 'prefix[TX]', JSON.stringify([str.c_RX?.attrs, str.c_TX?.attrs]));
check('placeholder and value come from the item', str.c_RX?.attrs.placeholder === 'RX' && str.c_RX?.value === 'R-' && str.c_TX?.value === 'T-', JSON.stringify([str.c_RX, str.c_TX]));

// --- data-options-key keeps its key path ----------------------------------------
console.log('data-options-key');
const opt = await tab.evaluate(async () => {
  const frag = await ResponseHandler.renderModalContent(`
    <div data-for="a in attrs"><template>
      <select id="s_{{a.id}}" data-options-key="attr_{{a.id}}_options"></select>
    </template></div>`, {attrs: [{id: 5}]});
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 200));
  const key = host.querySelector('#s_5')?.getAttribute('data-options-key');
  host.remove();
  return key;
});
check('data-options-key="attr_{{a.id}}_options" becomes attr_5_options', opt === 'attr_5_options', opt);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
