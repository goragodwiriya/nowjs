/**
 * Proof that RichTextEditor keeps an <img> whose src fails to load as a real,
 * clickable image — drawn as a placeholder box instead of the browser's alt text —
 * so the user can double-click it to replace it, or select and delete it,
 * and that the editor-only marker never reaches the saved HTML.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const JS = '../Now/dist/richtext-editor.min.js';
const CSS = '../Now/dist/richtext-editor.min.css';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const content = '<p>before</p>'
  + '<p><img src="/missing.png" alt="รูปที่หาย"></p>'
  + '<p><img src="/ok.png" alt="ok"></p>'
  + '<p><img src="/gone.png" alt="กว้าง 400" width="400"></p>'
  + '<p><a href="/x"><img src="/linked.png" alt="ลิงก์"></a></p>'
  + '<p>after</p>';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css"></head><body>
<textarea id="body">${content.replace(/</g, '&lt;')}</textarea>
<script src="/editor.js"></script>
<script>
window.editor = new RichTextEditor('#body', {plugins: ['image'], image: {fileBrowser: {enabled: false}}});
</script>
</body></html>`;

const hits = {};
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  hits[path] = (hits[path] || 0) + 1;
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
  if (path === '/ok.png' || path === '/new.png') {
    res.writeHead(200, {'Content-Type': 'image/png'});
    return res.end(PNG);
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
await tab.setViewport({width: 900, height: 900});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

await tab.goto(base, {waitUntil: 'networkidle0'});

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      ${JSON.stringify(detail)}`}`);
};

const state = () => tab.evaluate(() => {
  const area = document.querySelector('.rte-content');
  return [...area.querySelectorAll('img')].map(img => {
    const r = img.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      src: img.getAttribute('src'),
      alt: img.alt,
      broken: img.hasAttribute('data-rte-broken'),
      w: Math.round(r.width),
      h: Math.round(r.height),
      hitIsImg: hit === img
    };
  });
});

let imgs = await state();
const [missing, ok, gone] = imgs;

check('failed images are still <img> tags with their alt kept',
  imgs.length === 4 && missing.alt === 'รูปที่หาย' && gone.alt === 'กว้าง 400', imgs);
check('failed images are marked, the loaded one is not',
  missing.broken && gone.broken && !ok.broken, imgs);
check('a failed image is drawn as a placeholder box, not a line of alt text',
  missing.w >= 120 && missing.h >= 90, missing);
check('a failed image keeps its own width', gone.w === 400, gone);
check('the centre of a failed image hits the <img> itself (clickable)',
  missing.hitIsImg && gone.hitIsImg, imgs);

const before = hits['/missing.png'];
const saved = await tab.evaluate(() => {
  const out = [];
  for (let i = 0; i < 5; i++) out.push(window.editor.getContent());
  return out[0];
});
await new Promise(r => setTimeout(r, 300));
check('saved HTML has no editor marker', !saved.includes('data-rte-broken'), saved);
check('saved HTML keeps the failed <img> exactly as it was',
  saved.includes('<img src="/missing.png" alt="รูปที่หาย">')
  && saved.includes('<img src="/gone.png" alt="กว้าง 400" width="400">'), saved);
check('reading the content does not request the failed image again',
  hits['/missing.png'] === before, {before, after: hits['/missing.png']});

// Double-click the failed image → image dialog opens in edit mode with its src
const box = await tab.$$eval('.rte-content img', els => {
  const r = els[0].getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
});
await tab.mouse.click(box.x, box.y, {count: 2});
await new Promise(r => setTimeout(r, 200));
const dialog = await tab.evaluate(() => {
  const url = document.getElementById('rte-image-url');
  return {open: !!document.querySelector('.rte-dialog.open'), url: url?.value};
});
check('double-click on a failed image opens the image dialog with its src',
  dialog.open && /\/missing\.png$/.test(dialog.url || ''), dialog);

if (process.env.SHOT) await tab.screenshot({path: process.env.SHOT});

// Replace it with a working image
await tab.evaluate(() => {
  const url = document.getElementById('rte-image-url');
  url.value = '/new.png';
  url.dispatchEvent(new Event('input', {bubbles: true}));
  document.querySelector('.rte-dialog.open .rte-dialog-btn-primary').click();
});
await new Promise(r => setTimeout(r, 400));
imgs = await state();
check('the replaced image loads and loses the marker',
  imgs[0].src === '/new.png' && !imgs[0].broken, imgs[0]);
const afterReplace = await tab.evaluate(() => window.editor.getContent());
check('saved HTML carries the new src',
  afterReplace.includes('src="/new.png"') && !afterReplace.includes('/missing.png'), afterReplace);

// Click selects the whole image, so Delete / Backspace removes it (Chrome only moves the caret)
const clickImage = async (src) => {
  const at = await tab.$eval(`.rte-content img[src="${src}"]`, el => {
    const r = el.getBoundingClientRect();
    return {x: r.left + r.width / 2, y: r.top + r.height / 2};
  });
  await tab.mouse.click(at.x, at.y);
};
const removedBy = async (src, key) => {
  await clickImage(src);
  await tab.keyboard.press(key);
  await new Promise(r => setTimeout(r, 100));
  return tab.evaluate(() => window.editor.getContent());
};

let html = await removedBy('/gone.png', 'Delete');
check('click + Delete removes a failed image, and only it',
  !html.includes('/gone.png') && html.includes('<p>before</p>') && html.includes('/ok.png'), html);
html = await removedBy('/ok.png', 'Backspace');
check('click + Backspace removes a loaded image, and only it',
  !html.includes('/ok.png') && html.includes('<p>before</p>') && html.includes('/new.png'), html);
html = await removedBy('/linked.png', 'Delete');
check('deleting a linked failed image leaves no empty <a> behind',
  !html.includes('/linked.png') && !html.includes('href="/x"') && html.includes('<p>after</p>'), html);

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
