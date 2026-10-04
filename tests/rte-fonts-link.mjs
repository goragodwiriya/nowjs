/**
 * Proof of the RichTextEditor font family dropdown and of links to uploaded files,
 * on editors created the way admin forms get them (RichTextElementFactory).
 *
 * Fonts: the dropdown lists the configured fonts (default: Thai Google Fonts + system
 * fonts, or data-rte-fonts), loads Google Fonts only when it first opens (plus the
 * fonts the content already uses), writes <span style="font-family">, marks the
 * current font and removes it again with "Default".
 * Links: the link dialog uploads a file to the FileBrowser upload endpoint and links
 * to it, shows the server's error, and refuses script URLs while keeping
 * site-relative ones.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync, writeFileSync, mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.CORE || '../Now/dist/now.core.min.js';
const JS = process.env.EDITOR || '../Now/dist/richtext-editor.min.js';
const CSS = process.env.EDITOR_CSS || '../Now/dist/richtext-editor.min.css';

const initial = '<p>hello world</p><p>used <span style="font-family: Prompt, sans-serif;">prompt</span></p>';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css">
<style>#b + .rte-container .rte-content { font-family: Kanit, sans-serif; }</style></head><body style="width:900px">
<form>
  <textarea id="a" name="a" data-element="richtext" data-rte-profile="basic">${initial.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
  <textarea id="b" name="b" data-element="richtext" data-rte-profile="basic" data-rte-fonts="Kanit|Tahoma, sans-serif">&lt;p&gt;already kanit&lt;/p&gt;</textarea>
</form>
<script src="/core.js"></script>
<script src="/editor.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
  window.a = RichTextElementFactory.enhance(document.getElementById('a'));
  window.b = RichTextElementFactory.enhance(document.getElementById('b'));
  while (!window.a._rteInstance || !window.b._rteInstance) await new Promise(r => setTimeout(r, 50));
})();
</script>
</body></html>`;

let uploadMode = 'ok';
const uploads = [];
const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  const send = (type, body, code = 200) => {
    res.writeHead(code, {'Content-Type': type});
    res.end(body);
  };
  if (path === '/') return send('text/html; charset=utf-8', page);
  if (path === '/core.js') return send('application/javascript; charset=utf-8', readFileSync(CORE, 'utf8'));
  if (path === '/editor.js') return send('application/javascript; charset=utf-8', readFileSync(JS, 'utf8'));
  if (path === '/editor.css') return send('text/css; charset=utf-8', readFileSync(CSS, 'utf8'));
  if (path === '/js/components/editor/php/filebrowser.php' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      uploads.push({query: req.url.split('?')[1], xrw: req.headers['x-requested-with'], hasFile: /filename="report\.pdf"/.test(body)});
      if (uploadMode === 'fail') {
        return send('application/json', JSON.stringify({success: false, error: 'File type not allowed'}), 400);
      }
      send('application/json', JSON.stringify({success: true, file: {name: 'report.pdf', url: 'http://files.example/image/report.pdf'}}));
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
await tab.setViewport({width: 1000, height: 1400});
const errors = [];
const fontRequests = [];
const external = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.setRequestInterception(true);
tab.on('request', req => {
  const url = req.url();
  if (url.startsWith(base) || url.startsWith('data:')) return req.continue();
  if (url.startsWith('https://fonts.googleapis.com/')) {
    fontRequests.push(decodeURIComponent(url));
    return req.respond({status: 200, contentType: 'text/css', body: '/* fonts */'});
  }
  external.push(url);
  req.abort();
});

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass});
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${pass ? '' : `\n      ${JSON.stringify(detail)}`}`);
};
const settle = () => new Promise(r => setTimeout(r, 150));

// Editors are [0] = #a, [1] = #b
const selectText = (index, text) => tab.evaluate((index, text) => {
  const area = document.querySelectorAll('.rte-content')[index];
  area.focus();
  const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const at = node.data.indexOf(text);
    if (at !== -1) {
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + text.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      return true;
    }
  }
  return false;
}, index, text);
const fontButton = (index) => `.rte-container:nth-of-type(${index + 1}) [data-command="fontFamily"]`;
const openFonts = async (index) => {
  const handles = await tab.$$('[data-command="fontFamily"]');
  await handles[index].click();
  await settle();
};
const menuItems = (index) => tab.evaluate((index) => {
  const menu = document.querySelectorAll('[data-command="fontFamily"]')[index].parentElement.querySelector('.rte-dropdown-menu');
  return [...menu.querySelectorAll('.rte-dropdown-item')].map(el => ({
    label: el.textContent,
    value: el.dataset.value,
    font: el.querySelector('.rte-dropdown-item-label')?.style.fontFamily || '',
    active: el.classList.contains('active')
  }));
}, index);
const pickFont = async (index, label) => {
  const handles = await tab.$$('[data-command="fontFamily"]');
  const item = await handles[index].evaluateHandle((btn, label) =>
    [...btn.parentElement.querySelectorAll('.rte-dropdown-item')].find(el => el.textContent === label), label);
  await item.click();
  await settle();
};

// ── Fonts ─────────────────────────────────────────────────────────────
check('basic profile toolbar has the font family dropdown',
  (await tab.$$('[data-command="fontFamily"]')).length === 2, null);

check('before the dropdown opens only the fonts the content uses are requested',
  fontRequests.length === 1 && fontRequests[0].includes('family=Prompt:') && !fontRequests[0].includes('Sarabun'), fontRequests);

check('closed menu has no font previews applied yet (nothing downloaded up front)',
  (await menuItems(0)).every(i => i.font === ''), await menuItems(0));

await selectText(0, 'hello');
await openFonts(0);
const itemsA = await menuItems(0);
check('default list: "Default" then the Thai Google Fonts, then system fonts',
  itemsA[0].label === 'Default' && itemsA[0].value === ''
  && itemsA[1].label === 'Sarabun' && itemsA.some(i => i.label === 'Kanit') && itemsA.some(i => i.label === 'Noto Sans Thai')
  && itemsA.some(i => i.label === 'Tahoma'), itemsA.map(i => i.label));
check('opening the dropdown loads the listed Google fonts in one stylesheet, minus those already loaded',
  fontRequests.length === 2 && ['Sarabun', 'Kanit', 'Noto+Sans+Thai', 'IBM+Plex+Sans+Thai'].every(f => fontRequests[1].includes(`family=${f}:ital,wght@`))
  && !fontRequests[1].includes('Prompt') && !fontRequests[1].includes('Tahoma'), fontRequests[1]);
check('each item is previewed in its own font once opened',
  itemsA.find(i => i.label === 'Noto Sans Thai').font.includes('Noto Sans Thai'), itemsA.find(i => i.label === 'Noto Sans Thai'));
check('"Default" is marked while the selection has no font', itemsA[0].active && itemsA.filter(i => i.active).length === 1, itemsA.filter(i => i.active));

await pickFont(0, 'Sarabun');
let html = await tab.evaluate(() => window.a.getValue());
check('choosing a font wraps the selection in <span style="font-family">',
  /<span style="font-family: Sarabun, sans-serif;">hello<\/span> world/.test(html) && !/<font/i.test(html), html);

await tab.evaluate(() => {
  const span = document.querySelector('.rte-content span[style*="Sarabun"]');
  const range = document.createRange();
  range.setStart(span.firstChild, 2);
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});
const trigger = await tab.evaluate(() => document.querySelector('[data-command="fontFamily"]').classList.contains('active'));
await openFonts(0);
const itemsAgain = await menuItems(0);
check('with the caret in Sarabun text the Sarabun item is marked',
  itemsAgain.find(i => i.label === 'Sarabun').active && itemsAgain.filter(i => i.active).length === 1, itemsAgain.filter(i => i.active));
await tab.keyboard.press('Escape');
await tab.evaluate(() => document.body.click());

await selectText(0, 'hello');
await openFonts(0);
await pickFont(0, 'Noto Serif Thai');
html = await tab.evaluate(() => window.a.getValue());
check('a multi-word family is written quoted, replacing the previous font',
  /font-family: &quot;Noto Serif Thai&quot;, serif;">hello</.test(html) && !html.includes('Sarabun'), html);

await selectText(0, 'hello');
await openFonts(0);
await pickFont(0, 'Default');
html = await tab.evaluate(() => window.a.getValue());
check('"Default" removes the font and the empty span',
  html.startsWith('<p>hello world</p>') && html.includes('font-family: Prompt'), html);
const selAfter = await tab.evaluate(() => window.getSelection().toString());
check('the selection survives removing the font', selAfter === 'hello', selAfter);

await openFonts(1);
const itemsB = await menuItems(1);
check('data-rte-fonts sets the list of that editor only',
  JSON.stringify(itemsB.map(i => i.label)) === '["Default","Kanit","Tahoma"]', itemsB);
check('Google fonts already requested are not requested again',
  fontRequests.length === 2, fontRequests.slice(2));
await tab.evaluate(() => document.body.click());

await selectText(1, 'already');
await openFonts(1);
await pickFont(1, 'Kanit');
html = await tab.evaluate(() => window.b.getValue());
check('the font is written even where the text already shows in it (page font)',
  html === '<p><span style="font-family: Kanit, sans-serif;">already</span> kanit</p>', html);

// Selection across two paragraphs
await tab.evaluate(() => {
  const area = document.querySelectorAll('.rte-content')[0];
  area.focus();
  const find = (word) => {
    const walker = document.createTreeWalker(area, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const at = node.data.indexOf(word);
      if (at !== -1) return [node, at];
    }
  };
  const [startNode, startAt] = find('world');
  const [endNode, endAt] = find('used');
  const range = document.createRange();
  range.setStart(startNode, startAt);
  range.setEnd(endNode, endAt + 4);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
});
await openFonts(0);
await pickFont(0, 'Mitr');
html = await tab.evaluate(() => window.a.getValue());
check('a selection over two paragraphs gets the font in each, nothing outside',
  html.startsWith('<p>hello <span style="font-family: Mitr, sans-serif;">world</span></p><p><span style="font-family: Mitr, sans-serif;">used</span> <span style="font-family: Prompt'), html);
const sel2 = await tab.evaluate(() => window.getSelection().toString());
check('the same text stays selected after applying the font', sel2.replace(/\s+/g, ' ') === 'world used', sel2);
await tab.evaluate(() => document.querySelector('#a').value);
const synced = await tab.evaluate(() => document.getElementById('a').value);
check('the textarea is updated right away', synced.includes('Mitr'), synced);
await selectText(0, 'world');
await openFonts(0);
await pickFont(0, 'Default');
await selectText(0, 'used');
await openFonts(0);
await pickFont(0, 'Default');

// ── Links to files ────────────────────────────────────────────────────
await selectText(0, 'world');
await (await tab.$$('[data-command="link"]'))[0].click();
await settle();
const dialog = await tab.evaluate(() => {
  const d = document.querySelector('.rte-dialog.open');
  return d && {
    upload: [...d.querySelectorAll('.rte-link-file button')].map(b => b.textContent),
    text: d.querySelector('#rte-link-text')?.value
  };
});
check('link dialog offers Upload file and Browse files', dialog?.upload?.join('|') === 'Upload file|Browse files', dialog);

const tmp = mkdtempSync(join(tmpdir(), 'rte-'));
const pdf = join(tmp, 'report.pdf');
writeFileSync(pdf, '%PDF-1.4 test');

uploadMode = 'fail';
await (await tab.$('.rte-dialog.open .rte-link-file input[type="file"]')).uploadFile(pdf);
await tab.waitForFunction(() => document.querySelector('.rte-dialog.open .rte-dialog-error'), {timeout: 3000}).catch(() => null);
const failState = await tab.evaluate(() => ({
  error: document.querySelector('.rte-dialog.open .rte-dialog-error')?.textContent,
  url: document.querySelector('#rte-link-url').value
}));
check('a refused upload shows the server error and leaves the URL empty',
  failState.error === 'Failed to upload file: File type not allowed' && failState.url === '', failState);

uploadMode = 'ok';
await tab.evaluate(() => { document.querySelector('#rte-link-text').value = ''; });
await (await tab.$('.rte-dialog.open .rte-link-file input[type="file"]')).uploadFile(pdf);
await tab.waitForFunction(() => document.querySelector('#rte-link-url').value !== '', {timeout: 3000}).catch(() => null);
const okState = await tab.evaluate(() => ({
  url: document.querySelector('#rte-link-url').value,
  text: document.querySelector('#rte-link-text').value,
  status: document.querySelector('.rte-link-file-status').textContent,
  error: document.querySelector('.rte-dialog.open .rte-dialog-error')?.textContent || null
}));
check('an uploaded file fills the URL, and its name the empty link text',
  okState.url === 'http://files.example/image/report.pdf' && okState.text === 'report.pdf' && okState.status === 'report.pdf' && !okState.error, okState);
check('the upload goes to the FileBrowser upload action with the file and the XHR header',
  uploads.length === 2 && uploads[1].query === 'action=upload' && uploads[1].xrw === 'XMLHttpRequest' && uploads[1].hasFile, uploads);

await tab.click('.rte-dialog.open .rte-dialog-btn-primary');
await settle();
html = await tab.evaluate(() => window.a.getValue());
check('confirming links the selected text to the file',
  html.includes('<a href="http://files.example/image/report.pdf">world</a>'), html);

// URL rules
const tryUrl = async (url) => {
  await selectText(0, 'used');
  await (await tab.$$('[data-command="link"]'))[0].click();
  await settle();
  await tab.evaluate((url) => { document.querySelector('#rte-link-url').value = url; }, url);
  await tab.click('.rte-dialog.open .rte-dialog-btn-primary');
  await settle();
  const state = await tab.evaluate(() => ({
    open: !!document.querySelector('.rte-dialog.open'),
    error: document.querySelector('.rte-dialog.open .rte-dialog-error')?.textContent || null,
    html: window.a.getValue()
  }));
  if (state.open) {
    await tab.keyboard.press('Escape');
    await settle();
  }
  return state;
};
const js = await tryUrl('javascript:alert(1)');
check('a javascript: URL is refused', js.open && js.error === 'Invalid link URL' && !js.html.includes('javascript:'), js);
const rel = await tryUrl('/about-us');
check('a site-relative URL is kept as written', rel.html.includes('<a href="/about-us">used</a>'), rel.html);

check('nothing else is loaded from outside', external.length === 0, external);
check('no page errors', errors.length === 0, errors);

if (process.env.SHOT) await tab.screenshot({path: process.env.SHOT, fullPage: true});

await browser.close();
server.close();

const failed = results.filter(r => !r.pass).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
