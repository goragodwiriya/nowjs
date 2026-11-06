/**
 * Proof that a RichTextEditor created through RichTextElementFactory (the way admin
 * forms get it, data-element="richtext") leaves images and iframes to the editor:
 * a broken <img> stays a visible, clickable image instead of being hidden behind a
 * "media unavailable" text box, iframes are placeholders that load nothing, and the
 * boxes / display:none that older versions saved into articles are cleaned away on
 * load and on save.
 *
 * Runs the real built bundles in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.CORE || '../Now/dist/now.core.min.js';
const JS = process.env.EDITOR || '../Now/dist/richtext-editor.min.js';
const CSS = process.env.EDITOR_CSS || '../Now/dist/richtext-editor.min.css';

const FALLBACK = (kind) => `<div class="rte-media-fallback" contenteditable="false" data-rte-media-fallback="${kind}" hidden=""><div>`
  + `<strong>${kind === 'image' ? 'Image unavailable' : 'Embedded content unavailable'}</strong><span>There is media content here</span></div></div>`;

// Content as older versions could have saved it
const legacy = '<p>before</p>'
  + `<div><img src="/old-missing.png" alt="เก่า" style="display: none;">${FALLBACK('image')}</div>`
  + `<div class="rte-iframe-wrapper"><iframe src="https://viewer.example.com/pdf" style="width:100%;height:600px;border:0;display: none;"></iframe>${FALLBACK('embed')}</div>`
  + '<p>after</p>';

const fresh = '<p>start</p>'
  + '<p><img src="/missing.png" alt="รูปที่หาย"></p>'
  + '<div class="rte-iframe-wrapper" style="margin:1em 0;"><iframe src="https://maps.example.com/embed" style="width:100%;height:450px;border:0;display:block;"></iframe></div>'
  + '<p>end</p>';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css"></head><body style="width:800px">
<form>
  <textarea id="initial" name="initial" data-element="richtext">${fresh.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
  <textarea id="loaded" name="loaded" data-element="richtext"></textarea>
</form>
<script src="/core.js"></script>
<script src="/editor.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  window.initial = RichTextElementFactory.enhance(document.getElementById('initial'));
  window.loaded = RichTextElementFactory.enhance(document.getElementById('loaded'));
  // FormManager hands loaded data to the element this way
  window.loaded.setValue(${JSON.stringify(legacy)});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const send = (type, body) => {
    res.writeHead(200, {'Content-Type': type});
    res.end(body);
  };
  if (path === '/') return send('text/html; charset=utf-8', page);
  if (path === '/core.js') return send('application/javascript; charset=utf-8', readFileSync(CORE, 'utf8'));
  if (path === '/editor.js') return send('application/javascript; charset=utf-8', readFileSync(JS, 'utf8'));
  if (path === '/editor.css') return send('text/css; charset=utf-8', readFileSync(CSS, 'utf8'));
  res.writeHead(404);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

const tab = await browser.newPage();
await tab.setViewport({width: 900, height: 1600});
const errors = [];
const external = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.setRequestInterception(true);
tab.on('request', req => {
  if (req.url().startsWith(base) || req.url().startsWith('data:')) return req.continue();
  external.push(req.url());
  req.abort();
});

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
// Older versions swapped in their text box 1.8 s after an iframe failed to load
await new Promise(r => setTimeout(r, 2500));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      ${JSON.stringify(detail)}`}`);
};

const inspect = (id) => tab.evaluate((id) => {
  const area = document.getElementById(id).parentElement.querySelector('.rte-content')
    || document.querySelectorAll('.rte-content')[id === 'initial' ? 0 : 1];
  const images = [...area.querySelectorAll('img:not([data-rte-embed])')].map(img => {
    const r = img.getBoundingClientRect();
    return {
      src: img.getAttribute('src'),
      display: getComputedStyle(img).display,
      broken: img.hasAttribute('data-rte-broken'),
      w: Math.round(r.width),
      h: Math.round(r.height),
      hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === img
    };
  });
  return {
    fallbacks: area.querySelectorAll('.rte-media-fallback, [data-rte-media-fallback]').length,
    iframes: area.querySelectorAll('iframe').length,
    embeds: area.querySelectorAll('img[data-rte-embed]').length,
    embedsVisible: [...area.querySelectorAll('img[data-rte-embed]')].every(e => getComputedStyle(e).display !== 'none'),
    images
  };
}, id);

for (const id of ['initial', 'loaded']) {
  const s = await inspect(id);
  const label = id === 'initial' ? 'textarea content' : 'setValue() of old content';
  check(`${label}: no "media unavailable" text box in the editor`, s.fallbacks === 0, s);
  check(`${label}: the broken image is shown as a clickable image`,
    s.images.length === 1 && s.images[0].display !== 'none' && s.images[0].broken
    && s.images[0].w >= 120 && s.images[0].h >= 90 && s.images[0].hit, s.images);
  check(`${label}: the iframe is a visible placeholder, not a live iframe`,
    s.iframes === 0 && s.embeds === 1 && s.embedsVisible, s);
}

const initialValue = await tab.evaluate(() => window.initial.getValue());
check('getValue() of untouched content is the content as given', initialValue === fresh, initialValue);

const loadedValue = await tab.evaluate(() => window.loaded.getValue());
check('getValue() of old content has no fallback boxes and nothing left hidden',
  !loadedValue.includes('rte-media-fallback') && !loadedValue.includes('display: none')
  && loadedValue.includes('<img src="/old-missing.png" alt="เก่า">')
  && loadedValue.includes('<iframe src="https://viewer.example.com/pdf" style="width: 100%; height: 600px; border: 0px;"></iframe>'), loadedValue);

check('nothing is loaded from the embedded sites', external.length === 0, external);
check('no page errors', errors.length === 0, errors);

if (process.env.SHOT) await tab.screenshot({path: process.env.SHOT, fullPage: true});

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
