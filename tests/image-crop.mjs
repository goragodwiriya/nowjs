/**
 * Proof of ImageCropper and of FileElementFactory's data-crop="true".
 *
 * An image picked into a cropping field opens in ImageCropper; what the user
 * confirms is the file the field holds and the form sends, never the original.
 * The test image is four flat colour blocks (red | blue over green | yellow,
 * 400x200), so where each colour lands in the result shows exactly which part
 * of the image was cropped, zoomed and turned:
 *
 * - the frame starts covering the centre of the image at the requested aspect;
 * - zoom (slider, wheel), a mouse drag and the rotate button move the crop, and
 *   the image never leaves the frame;
 * - cropping a cropped file again starts from the original at the previous crop;
 * - Escape cancels and keeps the selection as it was; the input is cleared so
 *   the original cannot be submitted;
 * - several files are cropped one after another;
 * - the size limit applies to the cropped file, not the original;
 * - a file that is not an image is taken as it is;
 * - data-crop-* attributes set after the field was enhanced are obeyed;
 * - the bundle loads on its own for markup with data-crop="true";
 * - the form submits the cropped files (checked in the multipart body).
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_DIST overrides the bundle folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync, existsSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/Now/dist/now.core.min.css?v=t1"></head><body>
<form id="f" data-form="f" action="/save" method="post" data-ajax-submit="true" data-validate="false">
  <div><div><input type="file" id="single" name="single" data-preview="true" data-crop="true" data-crop-width="100" accept="image/*"></div></div>
  <div><div><input type="file" id="multi" name="multi" multiple data-preview="true" data-crop="true" data-crop-aspect="3/4" data-crop-width="90" data-crop-format="jpeg"></div></div>
  <div><div><input type="file" id="limit" name="limit" data-crop="true" data-crop-width="50" data-max-file-size="100000"></div></div>
  <div><div><input type="file" id="plain" name="plain" data-crop="true"></div></div>
  <button type="submit" id="save">Save</button>
</form>
<form id="g" data-form="g" action="/save" method="post" data-ajax-submit="true" data-validate="false" data-load-api="/person">
  <div><div><input type="file" id="photo" name="image" data-files="image" data-preview="true" accept="image/*"
    data-attr="placeholder:'Browse image, type ' + img_typies, data-crop:crop, data-crop-aspect:crop_aspect, data-crop-width:crop_width, data-crop-min-width:crop_width"></div></div>
  <div class="comment" id="result_photo"><span>Recommended width</span> <span data-text="image_width"></span> px</div>
</form>
<script src="/Now/dist/now.core.min.js?v=t1"></script>
<script>
window.__ready = Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, router: {enabled: false}});
window.$ = id => document.getElementById(id);
window.pick = (id, files) => {
  const dt = new DataTransfer();
  files.forEach(f => dt.items.add(f));
  $(id).files = dt.files;
  $(id).dispatchEvent(new Event('change', {bubbles: true}));
};
window.quad = (name = 'quad.png') => new Promise(resolve => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 200;
  const x = c.getContext('2d');
  [['#ff0000', 0, 0], ['#0000ff', 200, 0], ['#00ff00', 0, 100], ['#ffff00', 200, 100]].forEach(([color, left, top]) => {
    x.fillStyle = color; x.fillRect(left, top, 200, 100);
  });
  c.toBlob(b => resolve(new File([b], name, {type: 'image/png'})), 'image/png');
});
window.noise = () => new Promise(resolve => {
  const c = document.createElement('canvas');
  c.width = 300; c.height = 300;
  const x = c.getContext('2d');
  const data = x.createImageData(300, 300);
  for (let i = 0; i < data.data.length; i++) data.data[i] = i % 4 === 3 ? 255 : Math.random() * 256;
  x.putImageData(data, 0, 0);
  c.toBlob(b => resolve(new File([b], 'noise.png', {type: 'image/png'})), 'image/png');
});
window.filesOf = id => [...ElementFactory._privateState.get($(id)).files.values()];
window.describe = async (file, points) => {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d');
  x.drawImage(bmp, 0, 0);
  const name = ([r, g, b]) => r > 180 && g > 180 && b < 90 ? 'yellow' : r > 180 && g < 90 && b < 90 ? 'red'
    : r < 90 && g > 180 && b < 90 ? 'green' : r < 90 && g < 90 && b > 180 ? 'blue' : 'other';
  return {
    name: file.name, type: file.type, w: bmp.width, h: bmp.height,
    colors: points.map(([px, py]) => name(x.getImageData(px, py, 1, 1).data))
  };
};
</script>
</body></html>`;

const received = [];
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (path === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  if (path.startsWith('/Now/dist/')) {
    const file = DIST + path.slice('/Now/dist/'.length);
    if (!existsSync(file)) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, {'Content-Type': file.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(file));
  }
  if (path === '/person') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, code: 200, data: {
      id: 1, image: [], img_typies: 'jpg, png', crop: 'true', crop_aspect: '3/4', crop_width: 120, image_width: 120
    }}));
  }
  if (path === '/save') {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const boundary = /boundary=([^;]+)/.exec(req.headers['content-type'] || '')?.[1];
      if (boundary) {
        const marker = Buffer.from('--' + boundary);
        let at = body.indexOf(marker);
        while (at !== -1) {
          const next = body.indexOf(marker, at + marker.length);
          if (next === -1) break;
          const part = body.subarray(at + marker.length + 2, next - 2);
          const split = part.indexOf('\r\n\r\n');
          const head = part.subarray(0, split).toString();
          const content = part.subarray(split + 4);
          const filename = /filename="([^"]*)"/.exec(head)?.[1];
          if (filename) {
            const png = content.subarray(1, 4).toString() === 'PNG';
            received.push({
              field: /name="([^"]*)"/.exec(head)?.[1],
              filename,
              type: /Content-Type: ([^\r\n]+)/i.exec(head)?.[1],
              size: content.length,
              w: png ? content.readUInt32BE(16) : null,
              h: png ? content.readUInt32BE(20) : null
            });
          }
          at = next;
        }
      }
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({success: true, data: {actions: []}}));
    });
    return;
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

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : '  ' + JSON.stringify(detail)}`);
};

const tab = await browser.newPage();
await tab.setViewport({width: 1000, height: 800});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

// The cropper is on screen and laid out
const opened = () => tab.waitForFunction(() => {
  const frame = document.querySelector('.image-cropper-modal.show .image-cropper-frame');
  return frame && frame.offsetWidth > 0 && document.activeElement?.classList.contains('image-cropper-stage');
}, {timeout: 5000});
// The dialog has closed and its content is gone
// (the backdrop fades out 50 ms after the dialog content is gone, and takes clicks until then)
const closed = () => tab.waitForFunction(() => !document.querySelector('.image-cropper') && !document.querySelector('.image-cropper-modal.show') &&
  !document.querySelector('.backdrop'), {timeout: 5000});
const ok = async () => {
  await tab.click('.image-cropper-modal .modal-footer .btn-primary');
  await closed();
};
const zoom = value => tab.evaluate(v => {
  const z = document.querySelector('.image-cropper-zoom');
  z.value = String(v);
  z.dispatchEvent(new Event('input'));
}, value);
const quarters = [[25, 25], [75, 25], [25, 75], [75, 75]];

// ---- the bundle loads for markup that crops ----
await tab.waitForFunction(() => typeof window.ImageCropper === 'object', {timeout: 5000}).catch(() => {});
let s = await tab.evaluate(() => ({
  loaded: typeof window.ImageCropper,
  script: document.querySelectorAll('script[src*="now.imagecrop.min.js?v=t1"]').length,
  css: document.querySelectorAll('link[href*="now.imagecrop.min.css?v=t1"]').length
}));
check('data-crop="true" on the page loads now.imagecrop.min.js and .css', s.loaded === 'object' && s.script === 1 && s.css === 1, s);

// ---- 1. the frame starts on the centre of the image ----
await tab.evaluate(async () => pick('single', [await quad()]));
await opened();
s = await tab.evaluate(() => ({
  zoom: document.querySelector('.image-cropper-zoom').value,
  title: document.querySelector('.image-cropper-modal .modal-title').textContent,
  shape: document.querySelector('.image-cropper-frame').className
}));
check('the dialog opens at zoom 1 with a square frame', s.zoom === '1' && s.shape === 'image-cropper-frame', s);
await ok();
s = await tab.evaluate(async () => ({
  file: await describe(filesOf('single')[0], [[25, 25], [75, 25], [25, 75], [75, 75]]),
  count: filesOf('single').length,
  value: $('single').value,
  preview: document.querySelectorAll('#single ~ .file-preview .preview-item, .file-preview .preview-item[data-file-name="quad.png"]').length,
  cropButton: !!document.querySelector('.preview-item[data-file-name="quad.png"] .icon-crop')
}));
check('the centre crop: 100x100 PNG, same name, red | blue over green | yellow',
  s.count === 1 && s.file.name === 'quad.png' && s.file.type === 'image/png' && s.file.w === 100 && s.file.h === 100 &&
  s.file.colors.join() === 'red,blue,green,yellow', s);
check('the input is cleared so the original cannot be submitted', s.value === '', s);
check('the preview has a crop-again button', s.cropButton, s);

// ---- 2. crop again: from the original, at the previous crop ----
await tab.click('.preview-item[data-file-name="quad.png"] .icon-crop');
await opened();
s = await tab.evaluate(() => document.querySelector('.image-cropper-zoom').value);
check('crop again starts at the previous zoom (1)', s === '1', s);
await zoom(2);
await ok();
s = await tab.evaluate(async () => describe(filesOf('single')[0], [[25, 25], [75, 25], [25, 75], [75, 75]]));
check('zoom 2 on the centre: still the four colours meeting in the middle', s.w === 100 && s.colors.join() === 'red,blue,green,yellow', s);

await tab.click('.preview-item[data-file-name="quad.png"] .icon-crop');
await opened();
s = await tab.evaluate(() => document.querySelector('.image-cropper-zoom').value);
check('crop again restores zoom 2', s === '2', s);
// Drag the image far to the right: the crop stops at the image's left edge
const box = await tab.evaluate(() => {
  const r = document.querySelector('.image-cropper-stage').getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
});
await tab.mouse.move(box.x, box.y);
await tab.mouse.down();
await tab.mouse.move(box.x + 300, box.y, {steps: 8});
await tab.mouse.move(box.x + 900, box.y, {steps: 8});
await tab.mouse.up();
await ok();
s = await tab.evaluate(async () => describe(filesOf('single')[0], [[50, 25], [50, 75], [95, 25], [95, 75]]));
check('a mouse drag moves the crop, and stops at the edge of the image (left half: red over green)',
  s.colors.join() === 'red,green,red,green', s);

// ---- 3. rotate ----
await tab.click('.preview-item[data-file-name="quad.png"] .icon-crop');
await opened();
await tab.click('.image-cropper-toolbar .icon-reset');
await tab.click('.image-cropper-toolbar .icon-refresh');
await ok();
s = await tab.evaluate(async () => describe(filesOf('single')[0], [[25, 25], [75, 25], [25, 75], [75, 75]]));
check('a quarter turn clockwise: green | red over yellow | blue', s.w === 100 && s.h === 100 && s.colors.join() === 'green,red,yellow,blue', s);

// ---- 4. wheel zoom ----
await tab.click('.preview-item[data-file-name="quad.png"] .icon-crop');
await opened();
await tab.mouse.move(box.x, box.y);
await tab.mouse.wheel({deltaY: -300});
s = await tab.evaluate(() => parseFloat(document.querySelector('.image-cropper-zoom').value));
check('the mouse wheel zooms in', s > 1.5, s);
await tab.keyboard.press('Enter');
await closed();
s = await tab.evaluate(() => filesOf('single').length);
check('Enter on the crop area confirms', s === 1, s);

// ---- 5. Escape cancels: the selection stays as it was ----
const before = await tab.evaluate(() => { window.__kept = filesOf('single')[0]; return window.__kept.name; });
await tab.evaluate(async () => pick('single', [await quad('other.png')]));
await opened();
await tab.keyboard.press('Escape');
await closed();
s = await tab.evaluate(() => ({same: filesOf('single')[0] === window.__kept, count: filesOf('single').length, value: $('single').value}));
check('Escape cancels: the field keeps the file it had, the input is cleared', s.same && s.count === 1 && s.value === '', {before, ...s});

// ---- 6. several files, one after another ----
await tab.evaluate(async () => pick('multi', [await quad('a.png'), await quad('b.png')]));
await opened();
await tab.evaluate(() => { document.querySelector('.image-cropper').dataset.first = '1'; });
await tab.click('.image-cropper-modal .modal-footer .btn-primary');
// The second crop opens once the first has closed: a new crop area, not the first one
await tab.waitForFunction(() => {
  const area = document.querySelector('.image-cropper');
  return area && !area.dataset.first && document.querySelector('.image-cropper-modal.show .image-cropper-frame')?.offsetWidth > 0;
}, {timeout: 5000});
s = await tab.evaluate(() => filesOf('multi').length);
check('the second file opens after the first crop, and nothing is taken until both are done', s === 0, s);
await ok();
s = await tab.evaluate(async () => Promise.all(filesOf('multi').map(f => describe(f, [[20, 30], [70, 30], [20, 90], [70, 90]]))));
check('both files cropped in order: 90x120 JPEG named .jpg, centre third of the image',
  s.length === 2 && s.map(f => f.name).join() === 'a.jpg,b.jpg' &&
  s.every(f => f.type === 'image/jpeg' && f.w === 90 && f.h === 120 && f.colors.join() === 'red,blue,green,yellow'), s);

// ---- 7. the size limit is checked on the cropped file ----
const noiseSize = await tab.evaluate(async () => { const f = await noise(); window.__noise = f; return f.size; });
await tab.evaluate(() => pick('limit', [window.__noise]));
await opened();
await ok();
s = await tab.evaluate(() => ({count: filesOf('limit').length, size: filesOf('limit')[0]?.size, error: document.querySelector('#result_limit, .form-error')?.textContent || ''}));
check('a source over data-max-file-size is accepted once cropped below it', noiseSize > 100000 && s.count === 1 && s.size < 100000, {noiseSize, ...s});

// ---- 8. not an image: taken as it is ----
await tab.evaluate(() => pick('plain', [new File(['hello'], 'note.txt', {type: 'text/plain'})]));
await new Promise(r => setTimeout(r, 400));
s = await tab.evaluate(() => ({open: !!document.querySelector('.image-cropper-modal.show'), files: filesOf('plain').map(f => f.name + ':' + f.type)}));
check('a text file on a cropping field is not cropped', !s.open && s.files.join() === 'note.txt:text/plain', s);

// ---- 9. attributes set after the field was enhanced ----
await tab.evaluate(() => $('single').setAttribute('data-crop-aspect', '2:1'));
await tab.evaluate(async () => pick('single', [await quad('wide.png')]));
await opened();
await ok();
s = await tab.evaluate(async () => describe(filesOf('single')[0], [[25, 12], [75, 12], [25, 37], [75, 37]]));
check('data-crop-aspect set later is used: 100x50, the whole image', s.name === 'wide.png' && s.w === 100 && s.h === 50 && s.colors.join() === 'red,blue,green,yellow', s);

// ---- 10. the form sends the cropped files ----
await tab.evaluate(() => $('f').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})));
await tab.waitForFunction(() => !document.getElementById('f').classList.contains('submitting'), {timeout: 5000}).catch(() => {});
await new Promise(r => setTimeout(r, 500));
const single = received.find(r => r.field === 'single');
const multi = received.filter(r => /^multi/.test(r.field));
check('the form submits the cropped PNG (100x50), not the 400x200 original',
  single?.filename === 'wide.png' && single?.type === 'image/png' && single?.w === 100 && single?.h === 50, received);
check('the form submits both cropped JPEGs', multi.length === 2 && multi.every(r => r.type === 'image/jpeg' && /\.jpg$/.test(r.filename)), received);
check('the form submits the cropped noise image', received.some(r => r.field === 'limit' && r.size < 100000 && r.w === 50), received);

// ---- 11. ImageCropper.open() from code: a URL, the circle mask, the resolution warning, a pinch ----
await tab.evaluate(async () => {
  const c = document.createElement('canvas');
  c.width = 400; c.height = 200;
  const x = c.getContext('2d');
  x.fillStyle = '#ff0000'; x.fillRect(0, 0, 400, 200);
  window.__direct = ImageCropper.open(c.toDataURL('image/png'), {shape: 'circle', minWidth: 500, width: 64});
});
await opened();
s = await tab.evaluate(() => ({
  circle: document.querySelector('.image-cropper-frame').classList.contains('circle'),
  warning: document.querySelector('.image-cropper-warning').hidden ? null : document.querySelector('.image-cropper-warning').textContent
}));
check('shape circle masks the frame as a circle', s.circle, s);
check('minWidth warns when the cropped area is narrower (200 px of a 400x200 image)', /\b200\b/.test(s.warning || '') && /\b500\b/.test(s.warning || ''), s);

// Two fingers spreading apart zoom in (touch pointer events through CDP)
const cdp = await tab.createCDPSession();
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([x, y], id) => ({x, y, id}))});
await touch('touchStart', [[box.x - 20, box.y], [box.x + 20, box.y]]);
for (let i = 1; i <= 6; i++) {
  await touch('touchMove', [[box.x - 20 - i * 15, box.y], [box.x + 20 + i * 15, box.y]]);
}
await touch('touchEnd', []);
s = await tab.evaluate(() => parseFloat(document.querySelector('.image-cropper-zoom').value));
check('a two-finger pinch zooms in', s > 2, s);
await ok();
s = await tab.evaluate(async () => describe(await window.__direct, [[32, 32]]));
check('open(data: URL) gives image.png, 64x64, from the image', s.name === 'image.png' && s.type === 'image/png' && s.w === 64 && s.h === 64 && s.colors[0] === 'red', s);

// Cancel button: null, and a cropped file opened again goes back to its original
await tab.evaluate(async () => { window.__cancel = ImageCropper.open(filesOf('single')[0]); });
await opened();
s = await tab.evaluate(() => document.querySelector('.image-cropper-image').naturalWidth);
check('a cropped file opens its original (400 px wide), not the 100 px crop', s === 400, s);
await tab.click('.image-cropper-modal .modal-footer .btn:not(.btn-primary)');
await closed();
s = await tab.evaluate(async () => await window.__cancel);
check('Cancel resolves null', s === null, s);

// ---- 12. crop settings a form loads from its API (the personnel form) ----
await tab.waitForFunction(() => $('photo').dataset.cropAspect === '3/4', {timeout: 5000}).catch(() => {});
s = await tab.evaluate(() => ({
  crop: $('photo').dataset.crop, aspect: $('photo').dataset.cropAspect, width: $('photo').dataset.cropWidth,
  min: $('photo').dataset.cropMinWidth, placeholder: $('photo').placeholder, hint: $('result_photo').textContent.replace(/\s+/g, ' ').trim()
}));
check('data-attr binds data-crop-* from the loaded data, the placeholder string with its comma intact',
  s.crop === 'true' && s.aspect === '3/4' && s.width === '120' && s.min === '120' && s.placeholder === 'Browse image, type jpg, png' &&
  s.hint === 'Recommended width 120 px', s);
await tab.evaluate(async () => pick('photo', [await quad('person.png')]));
await opened();
s = await tab.evaluate(() => {
  const f = document.querySelector('.image-cropper-frame');
  const w = document.querySelector('.image-cropper-warning');
  return {ratio: Math.round(f.offsetWidth / f.offsetHeight * 100) / 100, warning: w.hidden};
});
check('the loaded shape is used: a 3:4 frame, no warning (150 px across >= 120)', s.ratio === 0.75 && s.warning === true, s);
await ok();
s = await tab.evaluate(async () => describe(filesOf('photo')[0], [[30, 40], [90, 40], [30, 120], [90, 120]]));
check('the photo is cropped to 120x160', s.name === 'person.png' && s.w === 120 && s.h === 160 && s.colors.join() === 'red,blue,green,yellow', s);

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
