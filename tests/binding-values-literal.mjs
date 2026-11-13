/**
 * A value a binding wrote is shown as it is: {{ }} inside data is never
 * evaluated (Now.js audit 2026-11-11, phase 3: N3).
 *
 * Data {inj: '{{secret}}/{{ 7*7 }}', secret: 'S3CRET'} used to show S3CRET/49
 * through data-text, and through {{it.name}}, data-text and title="{{it.name}}"
 * inside data-for: directives wrote the value first and processInterpolation
 * then walked the same subtree, finding the {{ }} that came from data.
 * Template {{ }} still works, and a binding still shows a new value when the
 * template renders again.
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

const INJ = '{{secret}}/{{ 7*7 }}';
const ITEM = '{{secret}}|{{ 7*7 }}';

// --- outside a loop --------------------------------------------------------------
console.log('outside a loop');
const top = await tab.evaluate(async (INJ) => {
  const tpl = `<p id="dt" data-text="inj"></p>
    <p id="dt2" data-text="inj | uppercase"></p>
    <p id="dt3">{{inj}}</p>
    <p id="da" data-attr="title:inj">a</p>
    <p id="tpl">{{ 6*7 }} {{name}}</p>
    <p id="tpla" title="{{name}}!">t</p>`;
  const frag = await ResponseHandler.renderModalContent(tpl, {inj: INJ, secret: 'S3CRET', name: 'Ann'});
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 300));
  const q = id => host.querySelector('#' + id);
  return {dt: q('dt').textContent, dt2: q('dt2').textContent, dt3: q('dt3').textContent, da: q('da').getAttribute('title'),
    tpl: q('tpl').textContent, tpla: q('tpla').getAttribute('title')};
}, INJ);
check('data-text shows {{ }} from data as it is', top.dt === INJ, top.dt);
check('data-text with a formatter shows it as it is (uppercase)', top.dt2 === INJ.toUpperCase(), top.dt2);
check('{{inj}} in the template shows the value as it is', top.dt3 === INJ, top.dt3);
check('data-attr title shows the value as it is', top.da === INJ, top.da);
check('{{ }} written in the template is still evaluated', top.tpl === '42 Ann', top.tpl);
check('{{ }} in a template attribute is still evaluated', top.tpla === 'Ann!', top.tpla);

// --- inside data-for ---------------------------------------------------------------
console.log('inside data-for');
const loop = await tab.evaluate(async () => {
  const tpl = `<div id="L" data-for="it in items"><template><p class="a">{{it.name}}</p><p class="b" data-text="it.name"></p><a class="c" title="{{it.name}}">l</a><span class="d" data-attr="title:it.name">d</span></template></div>
    <div id="L3" data-for="it in items"><template><p class="i">{{index}}: {{it.name}} / {{ 1+1 }}</p></template></div>`;
  const frag = await ResponseHandler.renderModalContent(tpl, {secret: 'S3CRET', items: [{name: '{{secret}}|{{ 7*7 }}'}, {name: 'plain'}]});
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.appendChild(frag);
  await new Promise(r => setTimeout(r, 300));
  const all = (root, sel, fn) => [...host.querySelectorAll(`#${root} ${sel}`)].map(fn);
  return {
    a: all('L', '.a', e => e.textContent), b: all('L', '.b', e => e.textContent), c: all('L', '.c', e => e.getAttribute('title')), d: all('L', '.d', e => e.getAttribute('title')),
    i: all('L3', '.i', e => e.textContent)
  };
});
const want = [ITEM, 'plain'];
const same = (got) => JSON.stringify(got) === JSON.stringify(want);
check('{{it.name}} shows the item as it is', same(loop.a), JSON.stringify(loop.a));
check('data-text="it.name" shows the item as it is', same(loop.b), JSON.stringify(loop.b));
check('title="{{it.name}}" shows the item as it is', same(loop.c), JSON.stringify(loop.c));
check('data-attr="title:it.name" shows the item as it is', same(loop.d), JSON.stringify(loop.d));
check('{{index}}, {{it.name}} and {{ 1+1 }} in the loop template still work', JSON.stringify(loop.i) === JSON.stringify([`0: ${ITEM} / 2`, '1: plain / 2']), JSON.stringify(loop.i));

// --- rendering again -------------------------------------------------------------------
console.log('rendering again');
const again = await tab.evaluate(async () => {
  const host = document.createElement('div');
  host.innerHTML = `<p id="r1" data-text="msg"></p><ul id="r2" data-for="it in items"><template><li data-text="it"></li></template></ul><p id="r3" data-attr="title:msg">x</p>`;
  document.body.appendChild(host);
  const render = state => {
    TemplateManager.processDataDirectives(host, {state});
    TemplateManager.processInterpolation(host, {state});
  };
  render({msg: '{{a}}', a: 'A', items: ['{{a}}', 'x']});
  const first = {t: host.querySelector('#r1').textContent, l: [...host.querySelectorAll('#r2 li')].map(e => e.textContent), a: host.querySelector('#r3').title};
  render({msg: 'second {{a}}', a: 'A', items: ['y', '{{a}}', 'z']});
  const second = {t: host.querySelector('#r1').textContent, l: [...host.querySelectorAll('#r2 li')].map(e => e.textContent), a: host.querySelector('#r3').title};
  render({msg: 'third', a: 'A', items: []});
  const third = {t: host.querySelector('#r1').textContent, l: [...host.querySelectorAll('#r2 li')].map(e => e.textContent), a: host.querySelector('#r3').title};
  host.remove();
  return {first, second, third};
});
check('first render shows the values as they are', again.first.t === '{{a}}' && JSON.stringify(again.first.l) === '["{{a}}","x"]' && again.first.a === '{{a}}', JSON.stringify(again.first));
check('a second render shows the new values', again.second.t === 'second {{a}}' && JSON.stringify(again.second.l) === '["y","{{a}}","z"]' && again.second.a === 'second {{a}}', JSON.stringify(again.second));
check('a third render shows the new values', again.third.t === 'third' && again.third.l.length === 0 && again.third.a === 'third', JSON.stringify(again.third));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
