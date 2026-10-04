/**
 * Proof that FileElementFactory previews every browser-renderable image type,
 * favicon.ico included, both for files already on the server (`data-files`) and
 * for a file the user has just picked.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const ICO = '../favicon.ico';
const SVG = '../images/favicon.svg';

const files = [
  {id: 1, url: '/files/favicon.ico', name: 'favicon.ico'},
  {id: 2, url: '/files/logo.svg?v=2', name: 'logo.svg'},
  {id: 3, url: '/files/photo.png', name: 'photo.png'},
  {id: 4, url: '/files/report.pdf', name: 'report.pdf'}
];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<form>
  <div><div><input type="file" id="existing" data-preview="true" data-files='${JSON.stringify(files)}'></div></div>
  <div><div><input type="file" id="picked" data-preview="true" accept="image/*"></div></div>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  FileElementFactory.enhance(document.getElementById('existing'));
  FileElementFactory.enhance(document.getElementById('picked'));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (path === '/files/favicon.ico' || path === '/favicon.ico') {
    res.writeHead(200, {'Content-Type': 'image/x-icon'});
    return res.end(readFileSync(ICO));
  }
  if (path === '/files/logo.svg') {
    res.writeHead(200, {'Content-Type': 'image/svg+xml'});
    return res.end(readFileSync(SVG));
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
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const eq = (name, actual, expected) => check(name, actual === expected, `got ${JSON.stringify(actual)}`);

// 1. Existing files: an image extension gets a thumbnail, anything else a download icon
const items = await tab.evaluate(() => Array.from(
  document.getElementById('existing').closest('div').parentElement.querySelectorAll('.preview-item')
).map(p => {
  const c = p.querySelector('.image-preview');
  return {tag: c.tagName, bg: c.style.backgroundImage, cls: c.className};
}));
eq('four existing files are rendered', items.length, 4);
eq('favicon.ico gets a thumbnail, not a download link', items[0]?.tag, 'DIV');
check('favicon.ico thumbnail points at the file', items[0]?.bg.includes('/files/favicon.ico'), items[0]?.bg);
eq('svg with a query string gets a thumbnail', items[1]?.tag, 'DIV');
eq('png still gets a thumbnail', items[2]?.tag, 'DIV');
eq('pdf stays a download link', items[3]?.tag, 'A');
check('pdf keeps its pdf icon', items[3]?.cls.includes('icon-pdf'), items[3]?.cls);

// 2. The ico actually decodes, and the gallery holds only the images
const viewer = await tab.evaluate(async () => {
  document.querySelector('.preview-item .image-preview').click();
  const modal = FileElementFactory.getImageModal();
  const img = await new Promise(resolve => {
    const t0 = Date.now();
    (function poll() {
      const el = document.querySelector('img.media-item');
      if (el && el.complete) return resolve(el);
      if (Date.now() - t0 > 3000) return resolve(el);
      setTimeout(poll, 50);
    })();
  });
  return {
    count: modal.state.items.length,
    src: img?.getAttribute('src'),
    width: img?.naturalWidth || 0
  };
});
eq('gallery contains the three images, not the pdf', viewer.count, 3);
eq('clicking the ico opens it in the viewer', viewer.src, '/files/favicon.ico');
check('the viewer decodes the ico', viewer.width > 0, `naturalWidth ${viewer.width}`);
await tab.evaluate(() => FileElementFactory.getImageModal().hide?.());

// 3. A freshly picked favicon.ico is previewed from its data URL
const input = await tab.$('#picked');
await input.uploadFile(ICO);
await tab.waitForFunction(() => {
  const s = document.querySelector('#picked').closest('div').parentElement.querySelector('.preview-item .image-preview');
  return s && s.style.backgroundImage.startsWith('url("data:image/');
}, {timeout: 3000}).catch(() => {});
const picked = await tab.evaluate(() => {
  const s = document.querySelector('#picked').closest('div').parentElement.querySelector('.preview-item .image-preview');
  return s ? {bg: s.style.backgroundImage.slice(0, 40), cls: s.className} : null;
});
check('a picked favicon.ico previews as an image', !!picked?.bg.startsWith('url("data:image/'), JSON.stringify(picked));

eq('no page errors', errors.join(' | '), '');

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
