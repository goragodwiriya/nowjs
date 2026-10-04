/**
 * Proof of FileBrowser storages (filebrowser.php config 'storages'): images and
 * other files live in separate folders, each shown as its own tab.
 *
 * - the tabs follow what the server reports; every request names the storage
 * - switching tab lists that storage from its root; uploads go to it and are
 *   filtered by its extensions
 * - callers can offer only some storages (image pickers: images only)
 * - the link dialog browses and uploads to the "file" storage
 * - a server without storages keeps the single "File management" tab
 *
 * Runs the real built bundles in a real browser against a mock filebrowser.php.
 */

import http from 'node:http';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.CORE || '../Now/dist/now.core.min.js';
const JS = process.env.EDITOR || '../Now/dist/richtext-editor.min.js';
const CSS = process.env.EDITOR_CSS || '../Now/dist/richtext-editor.min.css';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css"></head><body style="width:1100px">
<form><textarea id="a" name="a" data-element="richtext" data-rte-profile="basic">&lt;p&gt;hello world&lt;/p&gt;</textarea></form>
<script src="/core.js"></script>
<script src="/editor.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  window.a = RichTextElementFactory.enhance(document.getElementById('a'));
  while (!window.a._rteInstance) await new Promise(r => setTimeout(r, 50));
})();
</script>
</body></html>`;

const STORAGES = [
  {id: 'image', name: 'Images', extensions: ['jpg', 'png', 'webp']},
  {id: 'file', name: 'Files', extensions: ['jpg', 'png', 'webp', 'pdf', 'zip']}
];
const LISTING = {
  image: [{name: 'photo.jpg', path: '/photo.jpg', type: 'file', extension: 'jpg', size: 10, url: 'http://x/image/photo.jpg'}],
  file: [{name: 'report.pdf', path: '/report.pdf', type: 'file', extension: 'pdf', size: 10, url: 'http://x/file/report.pdf'}]
};
let withStorages = true;
const requests = [];

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://h');
  const send = (type, body, code = 200) => {
    res.writeHead(code, {'Content-Type': type});
    res.end(body);
  };
  if (url.pathname === '/') return send('text/html; charset=utf-8', page);
  if (url.pathname === '/core.js') return send('application/javascript; charset=utf-8', readFileSync(CORE, 'utf8'));
  if (url.pathname === '/editor.js') return send('application/javascript; charset=utf-8', readFileSync(JS, 'utf8'));
  if (url.pathname === '/editor.css') return send('text/css; charset=utf-8', readFileSync(CSS, 'utf8'));
  if (url.pathname === '/js/components/editor/php/filebrowser.php') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      const action = url.searchParams.get('action');
      let storage = url.searchParams.get('storage');
      if (!storage && body.startsWith('{')) storage = JSON.parse(body).storage || null;
      if (!storage) storage = (body.match(/name="storage"\r\n\r\n([a-z]+)/) || [])[1] || null;
      requests.push({action, storage, file: (body.match(/filename="([^"]+)"/) || [])[1] || null});
      const current = withStorages ? (STORAGES.some(s => s.id === storage) ? storage : 'image') : '';
      const info = withStorages ? {storages: STORAGES, storage: current} : {storages: [], storage: ''};
      const reply = (data) => send('application/json', JSON.stringify(data));
      if (action === 'get_preset_categories') return reply({success: true, data: {categories: [], available: false, ...info}});
      if (action === 'get_folder_tree') return reply({success: true, data: {folders: [], ...info}});
      if (action === 'get_files') return reply({success: true, data: {files: LISTING[current || 'image'], path: '/'}});
      if (action === 'upload') {
        const name = (body.match(/filename="([^"]+)"/) || [])[1];
        return reply({success: true, uploaded: 1, total: 1, file: {name, path: '/' + name, url: `http://x/${current || 'image'}/${name}`}});
      }
      reply({success: false, error: 'Unknown action'});
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
const tab = await browser.newPage();
await tab.setViewport({width: 1200, height: 900});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      ${JSON.stringify(detail)}`}`);
};
const settle = (ms = 300) => new Promise(r => setTimeout(r, ms));
const state = () => tab.evaluate(() => {
  const modal = document.querySelector('.file-browser-overlay.active .file-browser-modal');
  if (!modal) return null;
  return {
    tabs: [...modal.querySelectorAll('.file-browser-tab')].filter(t => t.style.display !== 'none')
      .map(t => `${t.textContent}${t.dataset.storage ? '[' + t.dataset.storage + ']' : ''}${t.classList.contains('active') ? '*' : ''}`),
    files: [...modal.querySelectorAll('.file-browser-tab-content.active .file-name, .file-browser-tab-content.active [data-path]')]
      .map(el => el.dataset.path || el.textContent).filter(Boolean)
  };
});
const openBrowser = (options) => tab.evaluate((options) => {
  window.fb?.close?.();
  const factoryActions = RichTextElementFactory._getFileBrowserApiActions();
  window.picked = null;
  window.fb = new FileBrowser({apiActions: factoryActions, onSelect: f => { window.picked = f; }, ...options});
  window.fb.open();
}, options);
const closeBrowser = async () => {
  await tab.evaluate(() => window.fb?.close());
  await settle(400);
};

// Default FileBrowser: tabs from the server
requests.length = 0;
await openBrowser({});
await settle(600);
let s = await state();
check('tabs: one per storage, the first storage open',
  JSON.stringify(s?.tabs) === JSON.stringify(['Images[image]*', 'Files[file]']), s);
check('the image storage is listed', s.files.includes('/photo.jpg') && !s.files.includes('/report.pdf'), s.files);

requests.length = 0;
await tab.click('.file-browser-tab[data-storage="file"]');
await settle(600);
s = await state();
check('the Files tab lists the file storage', JSON.stringify(s.tabs) === JSON.stringify(['Images[image]', 'Files[file]*']) && s.files.includes('/report.pdf') && !s.files.includes('/photo.jpg'), s);
check('every request of the Files tab names storage=file',
  requests.length >= 2 && requests.every(r => r.storage === 'file'), requests);

const accept = await tab.evaluate(() => window.fb.getAcceptTypes());
check('upload picker accepts the storage extensions', accept === '.jpg,.png,.webp,.pdf,.zip', accept);

const tmp = mkdtempSync(join(tmpdir(), 'fb-'));
const pdf = join(tmp, 'doc.pdf');
writeFileSync(pdf, '%PDF-1.4');
requests.length = 0;
await tab.evaluate(async () => {
  const file = new File(['%PDF-1.4'], 'doc.pdf', {type: 'application/pdf'});
  await window.fb.uploadFiles([file]);
});
await settle(1500);
check('an upload in the Files tab goes to storage=file',
  requests.some(r => r.action === 'upload' && r.storage === 'file' && r.file === 'doc.pdf'), requests);

await tab.click('.file-browser-tab[data-storage="image"]');
await settle(600);
requests.length = 0;
const blocked = await tab.evaluate(async () => {
  const file = new File(['%PDF-1.4'], 'doc.pdf', {type: 'application/pdf'});
  return window.fb.uploadFilesWithApi([file], '/');
});
check('the Images tab refuses a PDF before sending it', blocked.success === false && !requests.some(r => r.action === 'upload'), {blocked, requests});
await closeBrowser();

// Image pickers: images only
await openBrowser({allowedFileTypes: 'image/*', storage: 'image', storages: ['image']});
await settle(600);
s = await state();
check('storages: ["image"] shows only the image storage', JSON.stringify(s.tabs) === JSON.stringify(['File management*']) && s.files.includes('/photo.jpg'), s);
await closeBrowser();

// Opening on the file storage
requests.length = 0;
await openBrowser({storage: 'file', activeTab: 2});
await settle(600);
s = await state();
// activeTab 2 skips the Prepared tab, so its availability is not probed yet
const storageTabs = (tabs) => JSON.stringify((tabs || []).filter(t => !t.startsWith('Prepared file')));
check('storage: "file" opens on the Files tab', storageTabs(s.tabs) === JSON.stringify(['Images[image]', 'Files[file]*']) && s.files.includes('/report.pdf'), s);
check('its first requests already name storage=file', requests.length && requests.every(r => r.storage === 'file'), requests);
await closeBrowser();

// Link dialog: browse + upload use the file storage
const selectWorld = () => tab.evaluate(() => {
  const area = document.querySelector('.rte-content');
  area.focus();
  const node = area.querySelector('p').firstChild;
  const range = document.createRange();
  range.setStart(node, 6);
  range.setEnd(node, 11);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});
await selectWorld();
await tab.click('[data-command="link"]');
await settle();
requests.length = 0;
await tab.evaluate(() => [...document.querySelectorAll('.rte-dialog.open .rte-link-file button')].find(b => b.textContent === 'Browse files').click());
await settle(800);
s = await state();
check('link dialog browses the file storage', storageTabs(s?.tabs) === JSON.stringify(['Images[image]', 'Files[file]*']) && requests.every(r => r.storage === 'file'), {s, requests});
await tab.evaluate(() => {
  const item = document.querySelector('.file-browser-overlay.active .file-browser-tab-content.active [data-path="/report.pdf"]');
  item.click();
  document.querySelector('.file-browser-overlay.active .file-browser-footer .btn.select').click();
});
await settle(500);
const linkUrl = await tab.evaluate(() => document.querySelector('#rte-link-url').value);
check('choosing a file puts its URL in the link dialog', linkUrl === 'http://x/file/report.pdf', linkUrl);

requests.length = 0;
await (await tab.$('.rte-dialog.open .rte-link-file input[type="file"]')).uploadFile(pdf);
await tab.waitForFunction(() => document.querySelector('.rte-link-file-status').textContent === 'doc.pdf', {timeout: 3000}).catch(() => null);
check('link dialog uploads to storage=file', requests.some(r => r.action === 'upload' && r.storage === 'file' && r.file === 'doc.pdf'), requests);
await tab.keyboard.press('Escape');
await settle();

// Image dialog upload stays in the image storage
requests.length = 0;
await tab.evaluate(async () => {
  const plugin = window.a._rteInstance.getPlugin('image');
  await plugin.uploadImageToFileBrowser(new File(['x'], 'pic.png', {type: 'image/png'}));
});
check('image uploads name storage=image', requests.some(r => r.action === 'upload' && r.storage === 'image' && r.file === 'pic.png'), requests);

// Server without storages
withStorages = false;
await openBrowser({});
await settle(600);
s = await state();
check('a server without storages keeps the single File management tab', JSON.stringify(s.tabs) === JSON.stringify(['File management*']) && s.files.includes('/photo.jpg'), s);
await closeBrowser();

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
