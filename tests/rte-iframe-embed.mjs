/**
 * Proof that RichTextEditor shows each <iframe> as a placeholder while editing
 * (like CKEditor's fake objects) — nothing is loaded, so no error text shows in its
 * place — that the placeholder can be clicked, deleted and double-clicked to edit,
 * and that getContent() returns the real iframes exactly as they were given.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const JS = '../Now/dist/richtext-editor.min.js';
const CSS = '../Now/dist/richtext-editor.min.css';

const MAP = '<iframe src="https://maps.example.com/embed?pb=1&amp;z=2" style="width:100%;height:450px;border:0;display:block;" allowfullscreen="" loading="lazy"></iframe>';
const VIDEO = '<iframe src="https://video.example.com/embed/abc" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen=""></iframe>';
const LEGACY = '<iframe src="https://legacy.example.com/page" width="560" height="315" frameborder="0"></iframe>';

const content = '<p>before</p>'
  + `<div class="rte-iframe-wrapper" style="margin:1em 0;">${MAP}</div>`
  + `<div class="rte-video-wrapper" style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; margin: 1em 0;">${VIDEO}</div>`
  + `<p>${LEGACY}</p>`
  + '<p>after</p>';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css"></head><body style="width:800px">
<textarea id="body">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
<script src="/editor.js"></script>
<script>
window.editor = new RichTextEditor('#body', {plugins: ['image', 'iframe'], image: {fileBrowser: {enabled: false}}});
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/editor.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(JS, 'utf8'));
  }
  if (path === '/editor.css') {
    res.writeHead(200, {'Content-Type': 'text/css; charset=utf-8'});
    return res.end(readFileSync(CSS, 'utf8'));
  }
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
await tab.setViewport({width: 900, height: 1400});
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      ${JSON.stringify(detail)}`}`);
};

const state = () => tab.evaluate(() => {
  const area = document.querySelector('.rte-content');
  return {
    iframes: area.querySelectorAll('iframe').length,
    embeds: [...area.querySelectorAll('img[data-rte-embed]')].map(img => {
      const r = img.getBoundingClientRect();
      const parent = img.parentElement.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        title: img.title,
        w: Math.round(r.width),
        h: Math.round(r.height),
        parentW: Math.round(parent.width),
        parentH: Math.round(parent.height),
        hitIsImg: hit === img
      };
    })
  };
});
const html = () => tab.evaluate(() => window.editor.getContent());
const pause = (ms = 150) => new Promise(r => setTimeout(r, ms));

let s = await state();
check('no live <iframe> in the editing area, one placeholder per iframe',
  s.iframes === 0 && s.embeds.length === 3, s);
check('nothing is loaded from the embedded sites', external.length === 0, external);
const [map, video, legacy] = s.embeds;
check('a placeholder takes its iframe\'s size',
  map.h === 450 && map.w === map.parentW && legacy.w === 560 && legacy.h === 315, s.embeds);
check('a responsive video placeholder fills its wrapper',
  video.w === video.parentW && video.h === video.parentH && video.h > 0, video);
check('a placeholder shows where it points (title)',
  map.title.startsWith('https://maps.example.com/') && legacy.title === 'https://legacy.example.com/page', s.embeds);
check('the centre of each placeholder is clickable', s.embeds.every(e => e.hitIsImg), s.embeds);
check('getContent() returns the original iframes unchanged', await html() === content, await html());

// Double-click a placeholder → iframe dialog (not the image dialog), pre-filled
const centre = (sel, i = 0) => tab.$$eval(sel, (els, i) => {
  const r = els[i].getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
}, i);
let at = await centre('.rte-content img[data-rte-embed]', 2);
await tab.mouse.click(at.x, at.y, {count: 2});
await pause(250);
const dialog = await tab.evaluate(() => {
  const open = document.querySelector('.rte-dialog.open');
  return {
    iframe: !!open?.querySelector('#rte-iframe-url'),
    image: !!open?.querySelector('#rte-image-url'),
    url: document.getElementById('rte-iframe-url')?.value,
    width: document.getElementById('rte-iframe-width')?.value,
    height: document.getElementById('rte-iframe-height')?.value
  };
});
check('double-click opens the iframe dialog pre-filled from the iframe',
  dialog.iframe && !dialog.image && dialog.url === 'https://legacy.example.com/page'
  && dialog.width === '560' && dialog.height === '315', dialog);

await tab.evaluate(() => {
  document.getElementById('rte-iframe-url').value = 'https://legacy.example.com/other';
  document.getElementById('rte-iframe-height').value = '400';
  document.querySelector('.rte-dialog.open .rte-dialog-btn-primary').click();
});
await pause(250);
let out = await html();
check('editing changes only what was edited, in place',
  out.includes('<p><iframe src="https://legacy.example.com/other" width="560" height="400" frameborder="0"></iframe></p>')
  && !out.includes('legacy.example.com/page'), out);
s = await state();
check('the edited iframe is a placeholder again', s.iframes === 0 && s.embeds.length === 3, s);

// Editing a responsive video keeps its absolute positioning
at = await centre('.rte-content img[data-rte-embed]', 1);
await tab.mouse.click(at.x, at.y, {count: 2});
await pause(250);
await tab.evaluate(() => {
  document.getElementById('rte-iframe-url').value = 'https://video.example.com/embed/xyz';
  document.querySelector('.rte-dialog.open .rte-dialog-btn-primary').click();
});
await pause(250);
out = await html();
check('editing a responsive video keeps its wrapper styling',
  out.includes('<iframe src="https://video.example.com/embed/xyz" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen="">'), out);

// Click + Delete removes the embed together with its now-empty wrapper
at = await centre('.rte-content img[data-rte-embed]', 0);
await tab.mouse.click(at.x, at.y);
await tab.keyboard.press('Delete');
await pause();
out = await html();
check('click + Delete removes the iframe and its wrapper',
  !out.includes('maps.example.com') && !out.includes('rte-iframe-wrapper') && out.includes('<p>before</p>'), out);

await tab.evaluate(() => window.editor.history.undo());
await pause();
s = await state();
out = await html();
check('undo brings it back, as a placeholder', out.includes(MAP) && s.iframes === 0 && s.embeds.length === 3, {s, out});

// Paste: an iframe becomes a placeholder; a forged placeholder cannot smuggle markup
const paste = (pasted) => tab.evaluate((pasted) => {
  const area = document.querySelector('.rte-content');
  area.focus();
  const range = document.createRange();
  range.selectNodeContents(area.lastElementChild);
  range.collapse(false);
  getSelection().removeAllRanges();
  getSelection().addRange(range);
  const dt = new DataTransfer();
  dt.setData('text/html', pasted);
  area.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
}, pasted);
await paste('<iframe src="https://pasted.example.com/x" width="300" height="200"></iframe>');
await pause();
s = await state();
out = await html();
check('a pasted iframe becomes a placeholder and is saved as an iframe',
  s.iframes === 0 && s.embeds.length === 4 && out.includes('<iframe src="https://pasted.example.com/x" width="300" height="200"></iframe>'), {s, out});

await paste('<img alt="" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-rte-embed="&lt;img src=x onerror=alert(1)&gt;&lt;iframe src=&quot;https://forged.example.com&quot; onload=&quot;alert(2)&quot;&gt;&lt;/iframe&gt;">');
await pause();
out = await html();
check('a forged placeholder restores only a sanitized iframe',
  !out.includes('onerror') && !out.includes('onload') && !out.includes('src="x"')
  && out.includes('<iframe src="https://forged.example.com"></iframe>'), out);

// Copy puts the real iframe on the clipboard, not the placeholder
at = await centre('.rte-content img[data-rte-embed]', 2);
await tab.mouse.click(at.x, at.y);
const copied = await tab.evaluate(() => {
  const dt = new DataTransfer();
  document.querySelector('.rte-content').dispatchEvent(
    new ClipboardEvent('copy', {clipboardData: dt, bubbles: true, cancelable: true}));
  return dt.getData('text/html');
});
check('copying a placeholder copies the real iframe',
  copied.includes('<iframe src="https://legacy.example.com/other"') && !copied.includes('data-rte-embed'), copied);

// An iframe added straight to the DOM is caught by the observer
await tab.evaluate(() => {
  const f = document.createElement('iframe');
  f.src = 'https://direct.example.com/';
  document.querySelector('.rte-content').appendChild(f);
});
await pause();
s = await state();
check('an iframe added any other way is swapped for a placeholder', s.iframes === 0 && s.embeds.length === 6, s);

// The iframe dialog shows a live preview of what it edits; nothing else may load
const preview = ['https://legacy.example.com/page', 'https://video.example.com/embed/abc'];
check('outside the dialog preview, nothing was loaded from any embedded site',
  external.every(url => preview.includes(url)), external);
check('no page errors', errors.length === 0, errors);

if (process.env.SHOT) await tab.screenshot({path: process.env.SHOT, fullPage: true});

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
