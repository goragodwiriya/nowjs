/**
 * RichTextEditor posts what the author wrote (owner's decision 2026-11-11: the
 * server decides what to keep — editor content is stored with ->detail() — so
 * the editor must never drop anything on its own).
 *
 * Saved content with <style>, <script> (inline and src), <link>, <noscript>,
 * forms and buttons, inline handlers (onclick, onerror), javascript: links,
 * comments, an iframe with sandbox and a <pre> with line breaks:
 *
 * - comes back from getContent() / the textarea / a form submit exactly as it
 *   was (compared as DOM, attribute order aside), after loading, after typing,
 *   after undo, after a round trip through source view, after the clean-up
 *   command, and after cutting and pasting the block inside the editor;
 * - nothing of it runs or loads while it is being edited: no script, no
 *   handler, no stylesheet, no frame, no live form control inside the editor,
 *   and clicking an element that had onclick does nothing;
 * - CSS from <style> still shows in the editor, scoped to it;
 * - source view saves the text exactly as typed;
 * - HTML pasted from elsewhere is still cleaned: a script on the clipboard, or a
 *   forged placeholder carrying one, does not get into the content.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const PARTS = {
  style: '<style>.box { color: rgb(255, 0, 0); } @media (min-width: 1px) { .box { text-decoration: underline; } body { letter-spacing: 3px; } } @media (max-width: 600px) { .box { padding: 0; } }</style>',
  box: '<div class="box" id="thebox" onclick="window.__clicked = 1">box</div>',
  ins: '<ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-1" data-ad-slot="2"></ins>',
  extScript: '<script async src="/ext.js?client=ca-pub-1" crossorigin="anonymous"></script>',
  inlineScript: '<script>window.__ran = 1; (window.adsbygoogle = window.adsbygoogle || []).push({}); if (1 < 2 && 3 > 2) { /* </p> */ }</script>',
  button: '<button type="button" class="btn" onclick="play()">Play</button>',
  form: '<form action="/search" method="get"><input type="text" name="id" value="from-content"><button>Go</button></form>',
  jsLink: '<p><a href="javascript:void(0)" onclick="tagshow(event)">show</a></p>',
  img: '<p><img src="/missing.png" alt="m" onerror="window.__onerror = 1"></p>',
  noscript: '<noscript><img height="1" width="1" src="/px.gif"></noscript>',
  comment: '<!-- ad slot 1 -->',
  link: '<link rel="stylesheet" href="/content.css">',
  iframe: '<p><iframe src="/frame.html" width="560" height="315" sandbox="allow-scripts"></iframe></p>',
  pre: '<div class="code"><pre>line 1\n  line 2\n\tline 3</pre></div>',
  text: '<p>ข้อความ <b>หนา</b> ปกติ</p>'
};
const CONTENT = Object.values(PARTS).join('\n');
const SOURCE_TEXT = '<style>\n  .x { color: blue }\n</style>\n<div class="x"   onclick="go()">typed in source</div>\n<script>\n  go = () => 1 < 2;\n</script>';

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const requests = [];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title>
<link rel="stylesheet" href="/editor.css"></head><body style="width:900px">
<div class="box" id="outside">outside</div>
<form id="f" action="/save" method="post">
  <input type="hidden" name="id" value="42">
  <textarea id="body" name="detail">${esc(CONTENT)}</textarea>
</form>
<script src="/editor.js"></script>
<script>
window.play = () => { window.__play = 1; };
window.tagshow = () => { window.__tagshow = 1; };
window.editor = new RichTextEditor('#body', {plugins: ['sourceView', 'contentCleanup', 'iframe', 'image'], image: {fileBrowser: {enabled: false}}});
// DOM comparison, attribute order and insignificant whitespace aside
window.canon = html => {
  const t = document.implementation.createHTMLDocument('').createElement('template');
  t.innerHTML = html;
  const raw = new Set(['pre', 'script', 'style', 'textarea']);
  const walk = (n, keep) => {
    if (n.nodeType === 3) return keep ? n.data : n.data.replace(/\\s+/g, ' ').trim();
    if (n.nodeType === 8) return '<!--' + n.data + '-->';
    if (n.nodeType !== 1) return '';
    const tag = n.localName;
    const attrs = [...n.attributes].map(a => a.name + '=' + JSON.stringify(a.name === 'style' ? a.value.replace(/\\s+/g, '').replace(/;$/, '') : a.value)).sort().join(' ');
    const kids = [...n.childNodes].map(c => walk(c, keep || raw.has(tag))).join('');
    return '<' + tag + (attrs ? ' ' + attrs : '') + '>' + kids + '</' + tag + '>';
  };
  return [...t.content.childNodes].map(c => walk(c, false)).join('');
};
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  requests.push(path);
  const send = (status, body, type) => {
    res.writeHead(status, {'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store'});
    res.end(body);
  };
  if (path === '/') return send(200, page, 'text/html');
  if (path === '/editor.js') return send(200, readFileSync(DIST + 'richtext-editor.min.js', 'utf8'), 'application/javascript');
  if (path === '/editor.css') return send(200, readFileSync(DIST + 'richtext-editor.min.css', 'utf8'), 'text/css');
  if (path === '/ext.js') return send(200, 'window.__ext = 1;', 'application/javascript');
  if (path === '/content.css') return send(200, 'body { outline: 9px solid red; }', 'text/css');
  if (path === '/frame.html') return send(200, '<p>frame</p>', 'text/html');
  return send(404, '', 'text/plain');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
await browser.defaultBrowserContext().overridePermissions(origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await sleep(300);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + (typeof detail === 'string' ? detail.slice(0, 400) : JSON.stringify(detail).slice(0, 400)) : ''}`);
};

// What is missing from an output, by named part
const missing = html => tab.evaluate((html, parts) => {
  const out = window.canon(html);
  return Object.entries(parts).filter(([, part]) => !out.includes(window.canon(part))).map(([name]) => name);
}, html, PARTS);
const same = (html, expected = CONTENT) => tab.evaluate((a, b) => window.canon(a) === window.canon(b), html, expected);
const content = () => tab.evaluate(() => window.editor.getContent());

// --- loaded content comes back whole ---------------------------------------------
console.log('loaded content is posted as it was saved');
let out = await content();
check('getContent() after load has every part', (await missing(out)).length === 0, await missing(out));
check('getContent() after load equals what was saved', await same(out), out);
check('the textarea the form posts has every part', (await missing(await tab.evaluate(() => document.getElementById('body').value))).length === 0, await missing(await tab.evaluate(() => document.getElementById('body').value)));

// --- nothing runs or loads while editing --------------------------------------------
console.log('nothing runs or loads while editing');
const live = await tab.evaluate(() => {
  const root = document.querySelector('.rte-content');
  return {
    ran: window.__ran, ext: window.__ext, onerror: window.__onerror,
    liveTags: [...root.querySelectorAll('script, style, link, noscript, iframe, form, button, input, select, textarea')].map(e => e.localName),
    handlers: [...root.querySelectorAll('*')].flatMap(e => [...e.attributes].filter(a => /^on/i.test(a.name)).map(a => a.name)),
    jsHref: [...root.querySelectorAll('a[href]')].filter(a => /^\s*javascript:/i.test(a.getAttribute('href'))).length,
    bodyOutline: getComputedStyle(document.body).outlineStyle
  };
});
check('no script from the content ran', live.ran === undefined && live.ext === undefined, live);
check('no inline handler ran (img onerror)', live.onerror === undefined, live);
check('no live script/style/link/iframe/form control inside the editor', live.liveTags.length === 0, live.liveTags);
check('no on* attribute or javascript: link is live inside the editor', live.handlers.length === 0 && live.jsHref === 0, live);
check('the content stylesheet and script files were not requested', !requests.includes('/ext.js') && !requests.includes('/content.css') && !requests.includes('/frame.html') && !requests.includes('/px.gif'), requests);
check('a <link> in the content does not restyle the admin page', live.bodyOutline === 'none', live.bodyOutline);

await tab.click('.rte-content #thebox');
await sleep(100);
check('clicking an element that had onclick does nothing', await tab.evaluate(() => window.__clicked === undefined));

// --- style preview is scoped to the editor ----------------------------------------
const colors = await tab.evaluate(() => {
  const inside = getComputedStyle(document.querySelector('.rte-content #thebox'));
  const outside = getComputedStyle(document.getElementById('outside'));
  return {
    inside: inside.color, insideMedia: inside.textDecorationLine,
    outside: outside.color, outsideMedia: outside.textDecorationLine,
    body: getComputedStyle(document.body).letterSpacing,
    content: getComputedStyle(document.querySelector('.rte-content')).letterSpacing
  };
});
check('<style> from the content shows inside the editor only', colors.inside === 'rgb(255, 0, 0)' && colors.outside !== 'rgb(255, 0, 0)', colors);
check('a rule inside @media is scoped to the editor too', colors.insideMedia === 'underline' && colors.outsideMedia !== 'underline', colors);
check('a body rule of the content styles the editing area, not the admin page', colors.body === 'normal' && colors.content === '3px', colors);

const shown = await tab.evaluate(() => ({
  chips: [...document.querySelectorAll('.rte-content img[data-rte-embed]')].map(img => img.getAttribute('data-rte-kind')),
  small: [...document.querySelectorAll('.rte-content img[data-rte-embed]:not([data-rte-kind="iframe"])')].every(img => img.getBoundingClientRect().height <= 24 && img.getBoundingClientRect().width > 20),
  footer: document.querySelector('.rte-embedded-assets')?.textContent || '',
  footerHidden: document.querySelector('.rte-embedded-assets')?.hidden
}));
check('each held element is a placeholder where it stood', JSON.stringify(shown.chips) === JSON.stringify(['style', 'script', 'script', 'button', 'form', 'noscript', 'link', 'iframe']), shown.chips);
check('placeholders other than iframes are small chips', shown.small === true, shown);
check('the footer says what is held', shown.footerHidden === false && /2 scripts/.test(shown.footer) && /1 style/.test(shown.footer) && /1 form/.test(shown.footer), shown.footer);

// --- editing keeps it -----------------------------------------------------------------
console.log('editing keeps it');
await tab.click('.rte-content #thebox');
await tab.keyboard.type('X');
await sleep(300);
out = await tab.evaluate(() => document.getElementById('body').value);
check('after typing, the textarea still has every part', (await missing(out)).filter(n => n !== 'box').length === 0 && /X/.test(out), await missing(out));
await tab.evaluate(() => window.editor.history.undo());
await sleep(200);
out = await content();
check('after undo, the content equals what was saved', await same(out), await missing(out));

// --- source view round trip -------------------------------------------------------------
console.log('source view');
await tab.evaluate(() => window.editor.getPlugin('sourceView').toggle(true));
const source = await tab.evaluate(() => window.editor.getPlugin('sourceView').getSource());
check('source view shows every part', (await missing(source)).length === 0, await missing(source));
check('source view keeps the line breaks of <pre>', source.includes('line 1\n  line 2\n\tline 3'), source.slice(source.indexOf('<pre'), source.indexOf('</pre>') + 6));
check('opening source view ran nothing', await tab.evaluate(() => window.__onerror === undefined && window.__ran === undefined));
await tab.evaluate(() => window.editor.getPlugin('sourceView').toggle(false));
await sleep(200);
out = await content();
check('back from source view, the content equals what was saved', await same(out), await missing(out));

// white space: nothing added where there was none, nothing lost between words
const TIGHT = '<div>foo<b>bar</b>baz <i>q</i> <!-- c --><script>x()</scr' + 'ipt>tail<p>a<span>b</span> c</p>end<style>.t{}</style></div><p>one</p>two<b>three</b> four';
await tab.evaluate(html => window.editor.setContent(html), TIGHT);
await sleep(150);
const spaced = await tab.evaluate(original => {
  // the text as it flows on a page: a line break at every block, spaces as written within a line
  const BLOCK = new Set(['div', 'p', 'ul', 'ol', 'li', 'table', 'tr', 'td', 'section', 'h1', 'h2', 'pre']);
  const flow = n => n.nodeType === 3 ? n.data.replace(/\s+/g, ' ')
    : n.nodeType !== 1 ? ''
    : (BLOCK.has(n.localName) ? '\n' : '') + [...n.childNodes].map(flow).join('') + (BLOCK.has(n.localName) ? '\n' : '');
  const text = html => { const t = document.implementation.createHTMLDocument('').createElement('template'); t.innerHTML = html; return [...t.content.childNodes].map(flow).join('').replace(/ *\n[ \n]*/g, '\n').trim(); };
  const plugin = window.editor.getPlugin('sourceView');
  plugin.toggle(true);
  const source = plugin.getSource();
  plugin.toggle(false);
  return {source, want: text(original), viaSource: text(source), after: text(window.editor.getContent()), same: window.canon(window.editor.getContent()) === window.canon(original)};
}, TIGHT);
check('source view adds or drops no white space between words', spaced.viaSource === spaced.want && spaced.after === spaced.want, spaced);
check('source view lays blocks out on their own lines', /\n\s+<p>a<span>b<\/span> c<\/p>\n/.test(spaced.source), spaced.source);
await tab.evaluate(html => window.editor.setContent(html), CONTENT);
await sleep(150);

// text typed in source view is saved exactly as typed
await tab.evaluate(text => {
  const plugin = window.editor.getPlugin('sourceView');
  plugin.toggle(true);
  plugin.sourceEditor.value = text;
}, SOURCE_TEXT);
check('saving from source view posts the text exactly as typed', await content() === SOURCE_TEXT, await content());
await tab.evaluate(() => document.getElementById('f').dispatchEvent(new Event('submit', {cancelable: true, bubbles: true})));
check('form submit from source view puts that text in the textarea', await tab.evaluate(() => document.getElementById('body').value) === SOURCE_TEXT);
await tab.evaluate(() => window.editor.getPlugin('sourceView').toggle(false));
await sleep(200);
out = await content();
check('source text survives the switch to the editor', await same(out, SOURCE_TEXT), out);

// --- the form posts the real id, not the content's input ------------------------------------
await tab.evaluate(html => window.editor.setContent(html), CONTENT);
await sleep(200);
const posted = await tab.evaluate(() => [...new FormData(document.getElementById('f')).entries()].filter(([k]) => k === 'id').map(([, v]) => v));
check('an <input name="id"> in the content is not submitted with the admin form', posted.length === 1 && posted[0] === '42', posted);

// --- clean-up command -----------------------------------------------------------------------
console.log('clean-up, cut and paste');
await tab.evaluate(() => window.editor.getPlugin('contentCleanup').cleanContent({scope: 'document', removeStyles: false, removeIds: false, cleanClasses: false, cleanTables: false, removeHorizontalRules: false}));
await sleep(200);
out = await content();
const protectedParts = ['style', 'extScript', 'inlineScript', 'button', 'form', 'noscript', 'link', 'iframe'];
check('the clean-up command keeps scripts, styles and forms', (await missing(out)).filter(n => protectedParts.includes(n)).length === 0, await missing(out));

// --- cut and paste inside the editor ----------------------------------------------------------
await tab.evaluate(html => window.editor.setContent(html), CONTENT);
await sleep(200);
const moved = await tab.evaluate(() => {
  const el = document.querySelector('.rte-content');
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  const dt = new DataTransfer();
  el.dispatchEvent(new ClipboardEvent('cut', {clipboardData: dt, bubbles: true, cancelable: true}));
  const afterCut = window.editor.getContent();
  const html = dt.getData('text/html');
  const paste = new DataTransfer();
  // What the browser hands back on paste: the same HTML behind a charset tag
  paste.setData('text/html', "<meta charset='utf-8'>" + html);
  paste.setData('text/plain', dt.getData('text/plain'));
  el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: paste, bubbles: true, cancelable: true}));
  return {afterCut, clipboard: html};
});
await sleep(200);
out = await content();
check('cut puts the real markup on the clipboard', (await missing(moved.clipboard)).length === 0, await missing(moved.clipboard));
check('cut then paste inside the editor keeps every part', (await missing(out)).length === 0, await missing(out));
check('cut and paste ran nothing', await tab.evaluate(() => window.__onerror === undefined && window.__ran === undefined && window.__ext === undefined));

// the same with the real clipboard: Ctrl+A, Ctrl+X, Ctrl+V
await tab.evaluate(html => window.editor.setContent(html), CONTENT);
await sleep(200);
await tab.focus('.rte-content');
await tab.keyboard.down('Control');
await tab.keyboard.press('KeyA');
await tab.keyboard.press('KeyX');
await tab.keyboard.up('Control');
await sleep(200);
const emptied = await content();
await tab.keyboard.down('Control');
await tab.keyboard.press('KeyV');
await tab.keyboard.up('Control');
await sleep(400);
out = await content();
check('Ctrl+X empties the editor and Ctrl+V brings every part back (real clipboard)', (await missing(emptied)).length === Object.keys(PARTS).length && (await missing(out)).length === 0, {emptied: emptied.slice(0, 80), missing: await missing(out)});
check('the real cut and paste ran nothing', await tab.evaluate(() => window.__onerror === undefined && window.__ran === undefined && window.__ext === undefined));

// --- HTML pasted from elsewhere is still cleaned ------------------------------------------------
console.log('HTML pasted from elsewhere is cleaned');
await tab.evaluate(() => window.editor.setContent('<p>start</p><div id="own" onclick="own()">own</div><script>own()</scr' + 'ipt>'));
await sleep(100);
await tab.evaluate(() => {
  const el = document.querySelector('.rte-content');
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  // ids of things really held on this page, as someone who saw the editing DOM could copy them
  const heldId = el.querySelector('[data-rte-h]').getAttribute('data-rte-h');
  const embedId = el.querySelector('img[data-rte-embed]').getAttribute('data-rte-embed');
  const dt = new DataTransfer();
  dt.setData('text/html', '<p>pasted <b onclick="window.__p1 = 1">text</b></p>'
    + '<script>window.__p2 = 1</scr' + 'ipt>'
    + '<img src="/missing.png" onerror="window.__p3 = 1">'
    + '<img data-rte-embed="&lt;script&gt;window.__p4 = 1&lt;/script&gt;" data-rte-kind="script" src="/missing.png">'
    + `<img data-rte-embed="${embedId}" data-rte-kind="script" src="/missing.png">`
    + `<i data-rte-h="${heldId}">held</i><u data-rte-h="guess">u</u>`);
  dt.setData('text/plain', 'pasted text');
  el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: dt, bubbles: true, cancelable: true}));
});
await sleep(400);
out = await content();
check('pasted text and formatting arrive', /pasted <b>text<\/b>/.test(out), out);
check('a script on the clipboard does not get into the content', !/__p2/.test(out) && (out.match(/<script/gi) || []).length === 1, out);
check('pasted inline handlers do not get into the content', !/__p1|__p3/.test(out), out);
check('a forged placeholder does not smuggle a script in', !/__p4/.test(out), out);
check('ids copied from this page do not bring the held script or handler in again', (out.match(/own\(\)/g) || []).length === 2 && (out.match(/onclick/g) || []).length === 1, out);
check('no editor marker is left in the content', !/data-rte-/.test(out), out);
check('pasting ran nothing', await tab.evaluate(() => [1, 2, 3, 4].every(n => window['__p' + n] === undefined)));

// --- content that is only a script is not "empty" ------------------------------------------------
await tab.evaluate(() => window.editor.setContent('<script>window.__only = 1</scr' + 'ipt>'));
await sleep(100);
out = await content();
check('content that is only a <script> is kept', /<script>window\.__only = 1<\/script>/.test(out), out);

check('no page errors', errors.length === 0, errors);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
