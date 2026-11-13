/**
 * Proof that MediaViewer checks every URL of an item and shows errors as text.
 *
 * Items come from an API (data-api), from data-src/href in the page, or from
 * code (show()). The viewer used to put item.url into iframe.src, img.src and
 * video.src as it was, so {type: 'iframe', url: 'javascript:...'} ran script in
 * the page's origin, and renderError() put its message (the error of an API
 * load) into innerHTML.
 *
 * Now every url, thumbnail and poster passes SecurityManager.sanitizeUrl
 * (images may be data:image/...); an iframe takes http(s) pages only, loads
 * another origin in a sandbox (SecurityManager.config.html.iframeSandbox) and,
 * with options.iframeHosts / data-iframe-hosts, only from those host + path
 * prefixes. A refused item shows an error; renderError writes text.
 *
 * Runs the real built core in a real browser against two real HTTP servers
 * (this origin and another). NOW_CORE=<path> runs it against another build.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<div id="dom" data-media-viewer>
  <a data-media-item data-type="iframe" href="javascript:parent.__x.push('dom-href')">a</a>
</div>
<div id="api" data-media-viewer data-api="/items"><span data-media-item>open</span></div>
<div id="hosts" data-iframe-hosts="player.vimeo.com/video/, www.example.com/embed/"></div>
<script src="/core.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
})();
</script>
</body></html>`;

const mk = (routes) => http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = routes[url.pathname];
  if (!route) {
    res.writeHead(204);
    return res.end();
  }
  const [type, body] = route();
  res.writeHead(200, {'Content-Type': type, 'Cache-Control': 'no-store'});
  res.end(body);
});

const main = mk({
  '/': () => ['text/html; charset=utf-8', page],
  '/core.js': () => ['application/javascript; charset=utf-8', readFileSync(CORE, 'utf8')],
  '/page.html': () => ['text/html', '<p>own page</p>'],
  '/items': () => ['application/json', JSON.stringify([
    {type: 'iframe', url: 'javascript:parent.__x.push("api-iframe")'},
    {type: 'image', url: 'javascript:parent.__x.push("api-image")'}
  ])]
});
const other = mk({
  '/embed/ok.html': () => ['text/html', '<p>embed</p>'],
  '/other/x.html': () => ['text/html', '<p>other</p>']
});
await new Promise(r => main.listen(0, '127.0.0.1', r));
await new Promise(r => other.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${main.address().port}`;
const otherHost = `127.0.0.1:${other.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const tab = await browser.newPage();
// Nothing leaves this machine (YouTube embeds and thumbnails get an empty answer)
await tab.setRequestInterception(true);
tab.on('request', request => {
  const url = request.url();
  if (url.startsWith('http://127.0.0.1') || url.startsWith('data:')) request.continue();
  else request.respond({status: 204, body: ''});
});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('dialog', d => {
  errors.push('dialog: ' + d.message());
  d.dismiss();
});

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

// Shows one item in a fresh viewer and reports what the stage holds
const view = (item, options = {}) => tab.evaluate(async (item, options) => {
  const viewer = new MediaViewer(options);
  viewer.show([item], 0);
  await new Promise(r => setTimeout(r, 300));
  const stage = viewer.stage;
  const frame = stage.querySelector('iframe');
  const media = stage.querySelector('img, video');
  const result = {
    error: stage.querySelector('.media-error-message')?.textContent ?? null,
    iframe: frame ? {src: frame.getAttribute('src'), sandbox: frame.getAttribute('sandbox')} : null,
    media: media ? {tag: media.tagName.toLowerCase(), src: media.getAttribute('src'), poster: media.getAttribute('poster')} : null,
    text: stage.querySelector('.media-text')?.textContent ?? null,
    thumbs: [...viewer.container.querySelectorAll('.thumbnail img')].map(img => img.getAttribute('src'))
  };
  viewer.hide();
  viewer.destroy();
  return result;
}, item, options);
const sandbox = await tab.evaluate(() => SecurityManager.config.html.iframeSandbox);

let r = await view({type: 'iframe', url: 'javascript:parent.__x.push("iframe-js")'});
check('iframe javascript: is refused and shows an error', r.iframe === null && r.error !== null, JSON.stringify(r));
r = await view({type: 'iframe', url: ' java\tscript:parent.__x.push("iframe-js2")'});
check('iframe "java<tab>script:" is refused', r.iframe === null && r.error !== null, JSON.stringify(r));
r = await view({type: 'iframe', url: 'data:text/html,<script>parent.__x.push("iframe-data")</script>'});
check('iframe data:text/html is refused', r.iframe === null && r.error !== null, JSON.stringify(r));

r = await view({type: 'iframe', url: '/page.html'});
check('iframe of a page of this origin loads, without a sandbox',
  r.iframe?.src === `${base}/page.html` && r.iframe.sandbox === null, JSON.stringify(r.iframe));
r = await view({type: 'iframe', url: `http://${otherHost}/embed/ok.html`});
check('iframe of another origin loads in the sandbox of SecurityManager',
  r.iframe?.src === `http://${otherHost}/embed/ok.html` && r.iframe.sandbox === sandbox, JSON.stringify(r.iframe));
r = await view({type: 'iframe', url: `//${otherHost}/embed/ok.html`});
check('a protocol-relative //host iframe counts as another origin', r.iframe?.sandbox === sandbox, JSON.stringify(r.iframe));

const hosts = {iframeHosts: [`${otherHost}/embed/`]};
r = await view({type: 'iframe', url: `http://${otherHost}/embed/ok.html`}, hosts);
check('iframeHosts: a listed host + path loads', r.iframe?.sandbox === sandbox, JSON.stringify(r));
r = await view({type: 'iframe', url: `http://${otherHost}/other/x.html`}, hosts);
check('iframeHosts: another path of that host is refused', r.iframe === null && r.error !== null, JSON.stringify(r));
r = await view({type: 'iframe', url: '/page.html'}, hosts);
check('iframeHosts: a page of this origin still loads', r.iframe?.src === `${base}/page.html`, JSON.stringify(r));
const parsed = await tab.evaluate(() => MediaViewer.parseOptionsFromElement(document.getElementById('hosts')).iframeHosts);
check('data-iframe-hosts gives the iframeHosts list',
  JSON.stringify(parsed) === JSON.stringify(['player.vimeo.com/video/', 'www.example.com/embed/']), JSON.stringify(parsed));

r = await view({type: 'youtube', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'});
check('a YouTube link still plays in the YouTube embed',
  r.iframe?.src?.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ'), JSON.stringify(r.iframe));
r = await view({url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'});
check('an item with a YouTube url and no type plays in the YouTube embed',
  r.iframe?.src?.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ') && r.iframe.sandbox === null, JSON.stringify(r.iframe));
r = await view({type: 'youtube', url: 'https://youtu.be/dQw4w9WgXcQ'});
check('a youtu.be short link plays in the YouTube embed (it used to get no video id)',
  r.iframe?.src?.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ'), JSON.stringify(r.iframe));
r = await view({url: 'https://youtu.be/dQw4w9WgXcQ?t=42'});
check('a youtu.be link without a type is a YouTube item', r.iframe?.src?.startsWith('https://www.youtube.com/embed/dQw4w9WgXcQ'), JSON.stringify(r));

r = await view({type: 'image', url: 'javascript:parent.__x.push("img-js")'});
check('image javascript: is refused and shows an error', r.media === null && r.error !== null, JSON.stringify(r));
r = await view({type: 'image', url: PNG});
check('image data:image/png still shows', r.media?.tag === 'img' && r.media.src === PNG, JSON.stringify(r.media).slice(0, 80));
r = await view({type: 'image', url: '/photo.jpg', caption: 'c'});
check('image path still shows', r.media?.src === '/photo.jpg', JSON.stringify(r.media));
r = await view({type: 'image', url: '/photo.jpg', thumbnail: 'javascript:parent.__x.push("thumb")'}, {showThumbnails: true});
check('a refused thumbnail is dropped (the thumbnail strip uses the url)', JSON.stringify(r.thumbs) === '["/photo.jpg"]', JSON.stringify(r.thumbs));
r = await view({type: 'image', url: 'javascript:void 0'}, {showThumbnails: true});
check('a refused image gets no thumbnail <img>', r.thumbs.length === 0, JSON.stringify(r.thumbs));

r = await view({type: 'video', url: 'javascript:parent.__x.push("video-js")'});
check('video javascript: is refused and shows an error', r.media === null && r.error !== null, JSON.stringify(r));
r = await view({type: 'video', url: '/clip.mp4', poster: 'javascript:parent.__x.push("poster")'});
check('video path still plays; a refused poster is dropped',
  r.media?.tag === 'video' && r.media.src === '/clip.mp4' && !r.media.poster, JSON.stringify(r.media));
r = await view({type: 'video', url: PNG.replace('image/png', 'video/mp4')});
check('video data: is refused', r.media === null && r.error !== null, JSON.stringify(r));

r = await view({type: 'text', content: 'hello', url: 'javascript:parent.__x.push("text-url")'});
check('a text item with a refused url still shows its text', r.text === 'hello' && r.error === null, JSON.stringify(r));

const message = '<img src=x onerror="window.__x.push(\'error-html\')">';
const shown = await tab.evaluate(async (message) => {
  const viewer = new MediaViewer({});
  viewer.renderError(message);
  await new Promise(r => setTimeout(r, 200));
  const box = viewer.stage.querySelector('.media-error');
  const out = {text: box.querySelector('.media-error-message').textContent, img: box.querySelectorAll('img').length};
  viewer.destroy();
  return out;
}, message);
check('renderError shows its message as text', shown.text === message && shown.img === 0, JSON.stringify(shown));
const plain = await tab.evaluate(() => {
  const viewer = new MediaViewer({});
  viewer.renderError();
  const text = viewer.stage.querySelector('.media-error-message').textContent;
  viewer.destroy();
  return text;
});
check('renderError without a message still says "Failed to load media"', plain === 'Failed to load media', plain);

const fromPage = async (id) => {
  await tab.evaluate(async (id) => {
    const container = document.getElementById(id);
    container.querySelector('[data-media-item]').click();
    await new Promise(r => setTimeout(r, 300));
  }, id);
  return tab.evaluate((id) => {
    const viewer = document.getElementById(id)._mediaViewer;
    const out = {error: viewer.stage.querySelector('.media-error') !== null, iframe: viewer.stage.querySelector('iframe') !== null};
    viewer.hide();
    return out;
  }, id);
};
r = await fromPage('dom');
check('an <a data-media-item data-type="iframe" href="javascript:..."> shows an error', r.error && !r.iframe, JSON.stringify(r));
await tab.waitForFunction(() => (document.getElementById('api')._mediaItems || []).length === 2, {timeout: 5000}).catch(() => null);
r = await fromPage('api');
check('an item from data-api with an iframe javascript: url shows an error', r.error && !r.iframe, JSON.stringify(r));
const second = await tab.evaluate(async () => {
  const viewer = document.getElementById('api')._mediaViewer;
  viewer.show(document.getElementById('api')._mediaItems, 1);
  await new Promise(r => setTimeout(r, 300));
  const out = {error: viewer.stage.querySelector('.media-error') !== null, img: viewer.stage.querySelector('img') !== null};
  viewer.hide();
  return out;
});
check('an item from data-api with an image javascript: url shows an error', second.error && !second.img, JSON.stringify(second));

await new Promise(r => setTimeout(r, 300));
const ran = await tab.evaluate(() => window.__x);
check('no item ran script', ran.length === 0, JSON.stringify(ran));
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
main.close();
other.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
