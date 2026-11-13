/**
 * Sanitizer: the tags trusted templates keep, the nodes untrusted HTML keeps,
 * and where a data:image URL may load (Now.js audit 2026-11-11, phase 5: L5, L6).
 *
 * - Trusted templates keep SVG drawing (g, path, circle, rect, line, polyline,
 *   polygon, ellipse, text, tspan, defs, linearGradient, radialGradient, stop,
 *   use, symbol, clipPath, mask, title) and optgroup, del, ins, q, address, dfn,
 *   bdi, bdo, data, hgroup, search. script, foreignObject, animate, set and
 *   animateTransform still go with their content; <use> points at #id only.
 * - Untrusted HTML keeps element and text nodes only (no processing
 *   instruction, CDATA or comment).
 * - data:image is an image URL on image tags only (img, source, video, input,
 *   picture) — never on iframe, embed or object, at either level, from a
 *   binding or from a response.
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

const SVG_DATA = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' onload='1'/>";

// --- trusted templates -------------------------------------------------------------
console.log('trusted templates');
const t = await tab.evaluate(() => {
  const clean = html => SecurityManager.sanitizeHtml(html, {trusted: true});
  const d = html => {
    const box = document.createElement('div');
    box.innerHTML = clean(html);
    return box;
  };
  const icon = d(`<svg viewBox="0 0 24 24"><title>Icon</title><defs><linearGradient id="g1"><stop offset="0"/></linearGradient><radialGradient id="g2"><stop offset="1"/></radialGradient><clipPath id="c"><rect width="1" height="1"/></clipPath><mask id="m"><rect width="1" height="1"/></mask><symbol id="s"><path d="M0 0"/></symbol></defs>
    <g fill="url(#g1)"><path d="M0 0h24"/><circle cx="1" cy="1" r="1"/><rect x="1" y="1" width="2" height="2"/><line x1="0" y1="0" x2="1" y2="1"/><polyline points="1 2"/><polygon points="1 2 3"/><ellipse cx="1" cy="1" rx="1" ry="2"/><text>t<tspan>s</tspan></text><use href="#s"/></g></svg>`);
  const names = [...icon.querySelectorAll('svg *')].map(e => e.localName);
  const bad = d(`<svg><script>window.__x.push('svg-script')</script><foreignObject><img src=x onerror="window.__x.push('fo')"></foreignObject><animate attributeName="href" values="javascript:1"/><set attributeName="onclick" to="x"/><animateTransform attributeName="transform"/><use href="https://evil.example/x.svg#a"/><use xlink:href="javascript:alert(1)"/><use href="#ok"/></svg>`);
  const uses = [...bad.querySelectorAll('use')].map(u => u.getAttribute('href') ?? u.getAttribute('xlink:href'));
  const plain = d(`<select name="s"><optgroup label="G"><option>1</option></optgroup></select><del>d</del><ins>i</ins><q>q</q><address>a</address><dfn>f</dfn><bdi>b</bdi><bdo dir="rtl">o</bdo><data value="1">v</data><hgroup><h1>h</h1></hgroup><search>s</search>`);
  return {
    names,
    badTags: [...bad.querySelectorAll('svg *')].map(e => e.localName),
    uses,
    plainTags: [...plain.querySelectorAll('*')].map(e => e.localName),
    optgroup: plain.querySelector('optgroup option')?.textContent,
    comment: clean('<div><!-- note --><p>x</p></div>'),
    pi: clean('a<?php echo 1 ?>b')
  };
});
const svgWant = ['title', 'defs', 'lineargradient', 'stop', 'radialgradient', 'clippath', 'rect', 'mask', 'symbol', 'path', 'g', 'circle', 'line', 'polyline', 'polygon', 'ellipse', 'text', 'tspan', 'use'];
check('SVG drawing tags are kept', svgWant.every(n => t.names.map(x => x.toLowerCase()).includes(n)), JSON.stringify(t.names));
check('script, foreignObject, animate, set, animateTransform still go', !t.badTags.some(n => /^(script|foreignobject|animate|set|animatetransform|img)$/i.test(n)), JSON.stringify(t.badTags));
check('<use> keeps #id only', JSON.stringify(t.uses) === JSON.stringify([null, null, '#ok']), JSON.stringify(t.uses));
check('optgroup, del, ins, q, address, dfn, bdi, bdo, data, hgroup, search are kept', ['optgroup', 'del', 'ins', 'q', 'address', 'dfn', 'bdi', 'bdo', 'data', 'hgroup', 'search'].every(n => t.plainTags.includes(n)), JSON.stringify(t.plainTags));
check('an option inside optgroup is kept', t.optgroup === '1', t.optgroup);
check('a template keeps its comments', t.comment.includes('<!-- note -->'), t.comment);
check('a template drops a processing instruction', !/<\?/.test(t.pi), t.pi);

// --- untrusted HTML ---------------------------------------------------------------
console.log('untrusted HTML');
const u = await tab.evaluate(() => {
  const clean = html => SecurityManager.sanitizeHtml(html);
  const types = html => {
    const tpl = document.createElement('template');
    tpl.innerHTML = clean(html);
    const all = [];
    const walk = n => {
      for (const c of n.childNodes) {
        all.push(c.nodeType);
        walk(c);
      }
    };
    walk(tpl.content);
    return all;
  };
  return {pi: clean('a<?php echo 1 ?>b<![CDATA[x]]><!-- c -->c'), types: types('a<?x y?><b>b</b><!-- c --><![CDATA[z]]>')};
});
check('untrusted HTML drops a processing instruction', !/<\?/.test(u.pi), u.pi);
check('untrusted HTML keeps element and text nodes only', u.types.every(n => n === 1 || n === 3), JSON.stringify(u.types));

// --- data:image ----------------------------------------------------------------------
console.log('data:image');
const di = await tab.evaluate(async (SVG_DATA) => {
  const both = html => [SecurityManager.sanitizeHtml(html), SecurityManager.sanitizeHtml(html, {trusted: true})];
  const out = {};
  out.img = both(`<img src="${SVG_DATA}">`);
  out.png = both(`<img src="data:image/png;base64,AAAA">`);
  out.iframe = both(`<iframe src="${SVG_DATA}"></iframe>`)[1];
  out.embed = both(`<embed src="${SVG_DATA}">`)[1];
  out.object = both(`<object data="${SVG_DATA}"></object>`)[1];
  // bindings
  const frag = await ResponseHandler.renderModalContent(`<iframe id="bi" data-attr="src:u"></iframe><iframe id="bp" data-attr="src:p"></iframe><img id="bm" data-attr="src:p"><embed id="be" src="{{u}}">`, {u: SVG_DATA, p: 'data:image/png;base64,AAAA'});
  const host = document.createElement('div');
  host.appendChild(frag);
  out.bindIframe = host.querySelector('#bi').getAttribute('src');
  out.bindImg = host.querySelector('#bm').getAttribute('src');
  out.bindIframePng = host.querySelector('#bp').getAttribute('src');
  out.bindEmbed = host.querySelector('#be').getAttribute('src');
  // response
  host.insertAdjacentHTML('beforeend', '<iframe id="ri"></iframe><img id="rm">');
  document.body.appendChild(host);
  await ResponseHandler.process({success: true, actions: [
    {type: 'update', target: '#ri', method: 'attr', attr: 'src', content: SVG_DATA},
    {type: 'update', target: '#rm', method: 'attr', attr: 'src', content: 'data:image/png;base64,AAAA'}]});
  out.respIframe = host.querySelector('#ri').getAttribute('src');
  out.respImg = host.querySelector('#rm').getAttribute('src');
  host.remove();
  return out;
}, SVG_DATA);
check('img keeps a data:image/png at both levels', di.png.every(h => h.includes('data:image/png')), JSON.stringify(di.png));
check('a trusted template iframe loses a data:image src', !/data:/.test(di.iframe), di.iframe);
check('a trusted template embed loses a data:image src', !/data:/.test(di.embed), di.embed);
check('a trusted template object loses a data:image data', !/data:/.test(di.object), di.object);
check('data-attr src on an iframe refuses data:image', !/data:/.test(di.bindIframe || ''), di.bindIframe);
check('{{ }} src on an embed refuses data:image', !/data:/.test(di.bindEmbed || ''), di.bindEmbed);
check('data-attr src on an iframe refuses data:image/png too', !/data:/.test(di.bindIframePng || ''), di.bindIframePng);
check('data-attr src on an img keeps data:image/png', di.bindImg === 'data:image/png;base64,AAAA', di.bindImg);
check('a response iframe src refuses data:image', !/data:/.test(di.respIframe || ''), di.respIframe);
check('a response img src keeps data:image/png', di.respImg === 'data:image/png;base64,AAAA', di.respImg);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
