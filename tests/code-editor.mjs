/**
 * Proof that CodeEditor edits code the way a programmer types it.
 *
 * Runs the real built bundle in a real browser and presses real keys.
 *
 * Regressions guarded (from the playground's old contenteditable editor):
 * typed characters landed out of order, invisible zero-width spaces leaked into
 * the code and broke it at run time, colours did not follow typing, Ctrl+Z did
 * nothing, pasted code was stored differently from what was shown, and line
 * numbers fell behind after Enter.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const CORE = here + '../Now/dist/now.core.min.js';
const CSS = here + '../Now/dist/now.core.min.css';

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
<button id="before">before</button>
<textarea id="ed"></textarea>
<button id="after">after</button>
<form id="f" data-form="codeform">
  <textarea id="field" name="config" data-element="code" data-language="json" required>{"a": 1}</textarea>
</form>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  // CodeEditor is a feature bundle: used directly, it is required first
  await Now.require('CodeEditor');
  window.editor = new CodeEditor(document.getElementById('ed'), {language: 'javascript', maxHeight: 200});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  // Feature bundles: the core loads them from its own folder (Now.require)
  const feature = req.url.split('?')[0].match(/^\/(now\.[a-z]+\.min\.(js|css))$/);
  if (feature) {
    res.writeHead(200, {'Content-Type': (feature[2] === 'css' ? 'text/css' : 'application/javascript') + '; charset=utf-8'});
    return res.end(readFileSync(new URL(feature[1], process.env.NOW_DIST ? 'file://' + process.env.NOW_DIST.replace(/\/?$/, '/') : new URL('../Now/dist/', import.meta.url)), 'utf8'));
  }
  const files = {'/': [page, 'text/html'], '/core.js': [readFileSync(CORE, 'utf8'), 'application/javascript'], '/core.css': [readFileSync(CSS, 'utf8'), 'text/css']};
  const file = files[req.url];
  if (!file) {
    res.writeHead(204);
    return res.end();
  }
  res.writeHead(200, {'Content-Type': `${file[1]}; charset=utf-8`});
  res.end(file[0]);
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const tab = await browser.newPage();
await tab.setViewport({width: 1200, height: 900});
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail !== undefined && !pass ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const value = () => tab.evaluate(() => editor.getValue());
const frame = () => tab.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const reset = async (text = '') => {
  await tab.evaluate(t => {
    editor.setValue(t);
    editor.focus();
    editor.textarea.setSelectionRange(t.length, t.length);
  }, text);
};
const key = async (combo) => {
  const parts = combo.split('+');
  const main = parts.pop();
  for (const p of parts) await tab.keyboard.down(p);
  await tab.keyboard.press(main);
  for (const p of parts.reverse()) await tab.keyboard.up(p);
};

// 1. Typing keeps every character in order, with nothing invisible added
await reset('');
await tab.click('#ed');
await tab.keyboard.type('const greeting = "hello";', {delay: 5});
await frame();
let v = await value();
check('typed text is stored exactly as typed', v === 'const greeting = "hello";', JSON.stringify(v));
check('no zero-width characters in the value', !/[\u200b\u200c\u200d\ufeff]/.test(v));

// 2. Colours follow typing
let tokens = await tab.evaluate(() => [...document.querySelectorAll('#ed ~ * , .code-editor')][0]
  .querySelector('.code-editor-highlight code').innerHTML);
check('keyword is coloured right after typing', tokens.includes('<span class="ce-keyword">const</span>'), tokens);
check('string is coloured right after typing', tokens.includes('<span class="ce-string">"hello"</span>'), tokens);
const shown = await tab.evaluate(() => document.querySelector('.code-editor .code-editor-highlight').textContent);
check('the coloured layer shows the same text as the value', shown === v, JSON.stringify(shown));

// 3. Enter keeps the indent and opens a block between braces
await reset('');
await tab.keyboard.type('if (ok) {', {delay: 5});
v = await value();
check('typing { adds the closing }', v === 'if (ok) {}', JSON.stringify(v));
await key('Enter');
await tab.keyboard.type('run();', {delay: 5});
v = await value();
check('Enter between braces indents the new line and moves } below', v === 'if (ok) {\n  run();\n}', JSON.stringify(v));
await key('Enter');
await tab.keyboard.type('next();', {delay: 5});
v = await value();
check('Enter keeps the current indent', v === 'if (ok) {\n  run();\n  next();\n}', JSON.stringify(v));

// 4. Closing characters step over the auto-inserted ones
await reset('');
await tab.keyboard.type('fn("a")', {delay: 5});
v = await value();
check('typing the closer over an auto-inserted one does not double it', v === 'fn("a")', JSON.stringify(v));
await reset('');
await tab.keyboard.type("it's", {delay: 5});
check('an apostrophe inside a word is not paired', (await value()) === "it's", JSON.stringify(await value()));
await reset('foo()');
await tab.evaluate(() => editor.textarea.setSelectionRange(4, 4));
await key('Backspace');
check('Backspace between an empty pair removes both', (await value()) === 'foo', JSON.stringify(await value()));

// 5. Tab / Shift+Tab on several lines
await reset('a\nb\nc');
await tab.evaluate(() => editor.textarea.setSelectionRange(0, 5));
await key('Tab');
check('Tab indents every selected line', (await value()) === '  a\n  b\n  c', JSON.stringify(await value()));
await key('Shift+Tab');
check('Shift+Tab outdents them again', (await value()) === 'a\nb\nc', JSON.stringify(await value()));

// 6. Undo / redo are the browser's own and include the editor's edits
await reset('');
await tab.keyboard.type('let x', {delay: 5});
await key('Enter');
await tab.keyboard.type('x = 1', {delay: 5});
const typed = await value();
// How many steps the typing takes depends on the browser grouping keystrokes in
// time (a busy machine splits "x = 1" into one step per key), so undo until the
// Enter is undone instead of a fixed number of times, then redo as many
const undoTrail = [];
for (let i = 0; i < 30 && !undoTrail.includes('let x'); i++) {
  await key('Control+z');
  undoTrail.push(await value());
}
check('Ctrl+Z undoes typing step by step', undoTrail[0] !== typed && typed.startsWith(undoTrail[0]), JSON.stringify([typed, ...undoTrail]));
check('Ctrl+Z also undoes the editor\'s own Enter', undoTrail.includes('let x'), JSON.stringify(undoTrail));
for (let i = 0; i < undoTrail.length; i++) await key('Control+Shift+z');
check('Ctrl+Shift+Z redoes back to what was typed', (await value()) === typed, JSON.stringify(await value()));

// setValue(..., {history: true}) can be undone
await tab.evaluate(() => editor.setValue('replaced();', {history: true}));
check('setValue with history replaces the code', (await value()) === 'replaced();', JSON.stringify(await value()));
await key('Control+z');
check('Ctrl+Z brings back the code from before setValue', (await value()) === typed, JSON.stringify(await value()));

// 7. Text arriving in one go (paste, input methods) and Thai text
await reset('');
await tab.keyboard.sendCharacter('function f() {\n  return 1;\n}');
await frame();
v = await value();
check('multi-line insert is stored exactly', v === 'function f() {\n  return 1;\n}', JSON.stringify(v));
check('line numbers match the line count', (await tab.evaluate(() => document.querySelector('.code-editor-gutter-numbers').textContent)) === '1\n2\n3');
await reset('');
await tab.keyboard.sendCharacter('// สวัสดี ภาษาไทย');
await frame();
check('Thai text is stored exactly', (await value()) === '// สวัสดี ภาษาไทย', JSON.stringify(await value()));

// 8. Assigning textarea.value from any script recolours
await tab.evaluate(() => {
  editor.textarea.value = 'return /ab+c/g.test(`v ${n + 1}`);\n';
});
tokens = await tab.evaluate(() => document.querySelector('.code-editor .code-editor-highlight code').innerHTML);
check('textarea.value = ... recolours immediately', tokens.includes('ce-keyword">return'), tokens);
check('a regex literal is coloured as a regex', tokens.includes('<span class="ce-regex">/ab+c/g</span>'), tokens);
check('${...} inside a template string is coloured as code', tokens.includes('ce-punctuation">${</span>n <span class="ce-operator">+</span> <span class="ce-number">1'), tokens);
check('a trailing empty line gets a line number',
  (await tab.evaluate(() => document.querySelector('.code-editor-gutter-numbers').textContent)) === '1\n2');

// 9. Ctrl+/ toggles line comments
await reset('a();\nb();');
await tab.evaluate(() => editor.textarea.setSelectionRange(0, 9));
await key('Control+/');
check('Ctrl+/ comments the selected lines', (await value()) === '// a();\n// b();', JSON.stringify(await value()));
await key('Control+/');
check('Ctrl+/ again uncomments them', (await value()) === 'a();\nb();', JSON.stringify(await value()));

// 10. The two layers stay aligned, even scrolled
await tab.evaluate(() => {
  editor.setValue(Array.from({length: 80}, (_, i) => `line_${i} = ${'x'.repeat(i % 7 === 0 ? 160 : 10)};`).join('\n'));
  editor.focus();
  editor.textarea.setSelectionRange(editor.getValue().length, editor.getValue().length);
});
await tab.keyboard.type(' // end', {delay: 5});
await frame();
const layout = await tab.evaluate(() => {
  const ta = editor.textarea;
  const pre = document.querySelector('.code-editor .code-editor-highlight');
  const a = getComputedStyle(ta);
  const b = getComputedStyle(pre);
  const same = ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'paddingLeft', 'tabSize', 'letterSpacing'].every(k => a[k] === b[k]);
  const scroller = document.querySelector('.code-editor .code-editor-scroller');
  return {
    same,
    taScroll: ta.scrollTop + ta.scrollLeft,
    heights: [Math.round(ta.getBoundingClientRect().height), Math.round(pre.getBoundingClientRect().height)],
    scrolledToCaret: scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 30,
    capped: scroller.clientHeight <= 200
  };
});
check('textarea and coloured layer share font, size, line height and padding', layout.same);
check('the textarea never scrolls on its own', layout.taScroll === 0, layout.taScroll);
check('the textarea covers the whole coloured layer', layout.heights[0] === layout.heights[1], JSON.stringify(layout.heights));
check('maxHeight caps the editor and typing scrolls the caret into view', layout.capped && layout.scrolledToCaret, JSON.stringify(layout));

// 10b. A project's own CSS must not pull the layers apart
const hostile = await tab.evaluate(async () => {
  const style = document.createElement('style');
  style.textContent = `
    * { font-family: Georgia, serif; }
    span, code { font-size: 20px; letter-spacing: 2px; font-weight: 700; line-height: 3; }
    .content pre { padding: 40px; background: red; white-space: pre-wrap; border: 5px solid; }
    .content pre code { padding: 10px; background: yellow; }
  `;
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'content';
  const ta = document.createElement('textarea');
  box.appendChild(ta);
  document.body.appendChild(box);
  const code = new CodeEditor(ta, {language: 'javascript'});
  code.setValue('const value = 1;\nlet other = "text";');
  code.focus();

  const keys = ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight'];
  const of = el => keys.map(k => getComputedStyle(el)[k]).join('|');
  const expected = of(ta);
  const span = code.pre.querySelector('.ce-keyword');
  const lines = code.code.textContent.split('\n');
  const range = document.createRange();
  range.selectNodeContents(span);
  const charWidth = range.getBoundingClientRect().width / span.textContent.length;
  const result = {
    token: of(span) === expected,
    gutter: of(code.gutterLines) === expected,
    pre: of(code.pre) === expected,
    padding: getComputedStyle(code.pre).paddingTop === getComputedStyle(ta).paddingTop,
    wrap: getComputedStyle(code.pre).whiteSpace,
    // Text in the coloured layer must be as wide per character as the textarea's font
    charWidth: Math.abs(charWidth - code._measure().charWidth) < 0.01,
    lineCount: lines.length,
    height: Math.abs(code.pre.getBoundingClientRect().height - ta.getBoundingClientRect().height) < 1
  };
  code.destroy();
  box.remove();
  style.remove();
  return result;
});
check('page CSS on * or span does not change the token font', hostile.token, JSON.stringify(hostile));
check('page CSS does not change the line numbers font', hostile.gutter, JSON.stringify(hostile));
check('page CSS on pre does not move or wrap the coloured layer', hostile.pre && hostile.padding && hostile.wrap === 'pre' && hostile.height, JSON.stringify(hostile));
check('coloured letters are exactly as wide as the textarea font', hostile.charWidth, JSON.stringify(hostile));

// 11. Escape then Tab leaves the editor (no keyboard trap)
await tab.evaluate(() => editor.focus());
await key('Escape');
await key('Tab');
check('Escape, Tab moves focus out of the editor', (await tab.evaluate(() => document.activeElement.id)) === 'after',
  await tab.evaluate(() => document.activeElement.id));

await tab.evaluate(() => editor.focus());
await key('Escape');
await key('Shift+Tab');
check('Escape, Shift+Tab moves focus out backwards', (await tab.evaluate(() => document.activeElement.id)) === 'before',
  await tab.evaluate(() => document.activeElement.id));

// 11b. Escape only lets the very next Tab out. Anything the user does in
// between brings them back to editing, and Tab indents again. It used to
// stay armed until another key was pressed, so Escape, a click back into the
// code and Tab threw focus out of the editor instead of indenting.
const tabAfter = async (between) => {
  await reset('x');
  await tab.evaluate(() => editor.textarea.setSelectionRange(0, 0));
  await key('Escape');
  await between();
  await key('Tab');
  return tab.evaluate(() => ({focused: document.activeElement === editor.textarea, value: editor.getValue()}));
};
let after = await tabAfter(() => tab.click('#ed'));
check('Escape, a click in the code, Tab indents',
  after.focused && after.value.length > 1 && after.value.trim() === 'x', JSON.stringify(after));
after = await tabAfter(async () => {
  await tab.focus('#after');
  await tab.evaluate(() => {
    editor.focus();
    editor.textarea.setSelectionRange(0, 0);
  });
});
check('Escape, leaving and coming back, Tab indents', after.focused && after.value === '  x', JSON.stringify(after));
after = await tabAfter(() => tab.evaluate(() => editor.textarea.setSelectionRange(1, 1)));
check('Escape, caret moved by script, Tab indents', after.focused && after.value === 'x ', JSON.stringify(after));
after = await tabAfter(() => tab.keyboard.sendCharacter('ก'));
check('Escape, text entered without a keydown (input method, paste), Tab indents',
  after.focused && after.value === 'ก x', JSON.stringify(after));
after = await tabAfter(() => key('Escape'));
check('Escape twice, Tab still leaves', !after.focused && after.value === 'x', JSON.stringify(after));

// 12. data-element="code" in a form
const field = await tab.evaluate(() => {
  const instance = ElementManager.getInstance('field');
  const root = document.getElementById('field').closest('.code-editor');
  const before = root?.querySelector('code').innerHTML;
  instance.value = '{"name": "x", "n": 2}';
  const after = root?.querySelector('code').innerHTML;
  const form = new FormData(document.getElementById('f'));
  return {
    hasEditor: !!instance?.editor,
    language: instance?.editor?.getLanguage(),
    before, after,
    submitted: form.get('config')
  };
});
check('data-element="code" attaches an editor', field.hasEditor && field.language === 'json', JSON.stringify(field));
check('initial content is coloured', /ce-property">"a"/.test(field.before), field.before);
check('instance.value = ... recolours', /ce-property">"name"/.test(field.after), field.after);
check('the form submits the code', field.submitted === '{"name": "x", "n": 2}', field.submitted);
await tab.evaluate(() => document.getElementById('f').reset());
await sleep(50);
check('form.reset() recolours the original content',
  /ce-property">"a"/.test(await tab.evaluate(() => document.getElementById('field').closest('.code-editor').querySelector('code').innerHTML)));

// 13. Every language gives back exactly its input
const roundTrip = await tab.evaluate(() => {
  const samples = {
    javascript: 'const a = `x${b ? `y${c}` : "z"}`; // c\n/* d */ let r = a / 2 / /re/i.source.length;',
    json: '{"a": [1, 2.5e3, true, null, "s\\"q"]}',
    css: '@media (max-width: 600px) { .a:hover > b::before { color: #fff !important; margin: -1px 0 } }',
    html: '<!doctype html><div class="a" data-x=1>Hi &amp; <b>there</b><script>if (a < b) x()</script><style>p{color:red}</style></div>',
    php: '<?php $a = \\Kotchasan\\Http::create(); echo "v{$a->b}"; // c',
    sql: "SELECT `id`, COUNT(*) FROM t WHERE name = 'o''k' AND id > :id -- c"
  };
  const out = {};
  for (const [lang, code] of Object.entries(samples)) {
    const joined = CodeEditor.tokenize(code, lang).map(t => t.text).join('');
    out[lang] = joined === code;
  }
  out.cssTokens = CodeEditor.tokenize('a { color: red; }', 'css').filter(t => t.type).map(t => t.type + ':' + t.text).join(' ');
  out.htmlScript = CodeEditor.tokenize('<script>let a = 1</script>', 'html').some(t => t.type === 'keyword' && t.text === 'let');
  out.phpVar = CodeEditor.tokenize('$name', 'php')[0].type;
  return out;
});
['javascript', 'json', 'css', 'html', 'php', 'sql'].forEach(lang => check(`${lang}: tokens join back to the input`, roundTrip[lang]));
check('css: property and value are told apart', roundTrip.cssTokens === 'tag:a punctuation:{ property:color punctuation:: constant:red punctuation:; punctuation:}', roundTrip.cssTokens);
check('html: <script> body is coloured as JavaScript', roundTrip.htmlScript);
check('php: $variables are coloured', roundTrip.phpVar === 'variable', roundTrip.phpVar);

// 13b. Re-scanning only around an edit gives the same tokens as a full scan
const incremental = await tab.evaluate(() => {
  const samples = {
    javascript: 'function a(x) {\n  return x / 2; // half\n}\nconst s = `t ${a(1)}`;\n/* note */\nlet r = /re/g;\n',
    css: '.a { color: red; }\n@media (x) {\n  .b:hover { margin: 0 -1px; }\n}\n',
    php: '<?php\n$a = [1, 2];\nfunction f($x) {\n  return $x->y(); // c\n}\n',
    html: '<div class="a">\n  <script>let a = 1;</script>\n  <p>text &amp; more</p>\n</div>\n'
  };
  let seed = 7;
  const random = n => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % n;
  };
  const pieces = ['/*', '*/', '"', "'", '`', '{', '}', '\n', 'x', ' ', '//', '<', '>', '$b', ';', '(', ')', '${'];
  const same = (a, b) => a.length === b.length && a.every((t, i) => t.type === b[i].type && t.text === b[i].text);
  const merge = tokens => tokens.reduce((out, t) => {
    const last = out[out.length - 1];
    if (last && last.type === t.type) last.text += t.text;
    else out.push({type: t.type, text: t.text});
    return out;
  }, []);
  const failures = [];
  for (const [lang, start] of Object.entries(samples)) {
    let text = start.repeat(6);
    let lexed = CodeEditor._lex(text, lang, null);
    for (let step = 0; step < 300; step++) {
      const at = random(text.length + 1);
      if (random(3) === 0 && text.length) {
        text = text.slice(0, at) + text.slice(at + 1 + random(3));
      } else {
        text = text.slice(0, at) + pieces[random(pieces.length)] + text.slice(at);
      }
      lexed = CodeEditor._lex(text, lang, lexed);
      const full = CodeEditor.tokenize(text, lang);
      if (!same(merge(lexed.tokens), merge(full))) {
        failures.push(`${lang} step ${step}`);
        break;
      }
    }
  }
  return failures;
});
check('incremental re-scan always matches a full scan (1,200 random edits)', incremental.length === 0, incremental.join(', '));

const drawing = await tab.evaluate(async () => {
  const ta = document.createElement('textarea');
  document.body.appendChild(ta);
  const long = new CodeEditor(ta, {language: 'javascript', height: 300});
  long.setValue(Array.from({length: 3000}, (_, i) => `const line${i} = ${i};`).join('\n'));
  const drawn = long.code.textContent.split('\n').length;
  long.scroller.scrollTop = long.scroller.scrollHeight;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const tail = long.code.textContent;
  const gutter = long.gutterLines.textContent.split('\n').pop();
  long.destroy();
  ta.remove();
  return {drawn, tail: tail.includes('const line2999 = 2999;'), gutter};
});
check('a 3,000-line file draws only the lines around the view', drawing.drawn < 200, drawing.drawn);
check('scrolling to the end draws the last lines and their numbers', drawing.tail && drawing.gutter === '3000', JSON.stringify(drawing));

// 14. Large file stays responsive
await tab.evaluate(() => {
  const line = 'export function compute(value, options = {}) { return value * 2 + "x".repeat(3); } // note';
  editor.setValue(Array.from({length: 1500}, () => line).join('\n'));
  editor.focus();
  editor.textarea.setSelectionRange(10, 10);
});
const t0 = Date.now();
await tab.keyboard.type('abcdefghijklmnopqrst');
await frame();
const perKey = (Date.now() - t0) / 20;
// The old way took over 800 ms per key; the margin keeps a busy machine from failing this
check(`typing in a 1,500-line file stays fast (< 100 ms per key, measured ${perKey.toFixed(1)} ms)`, perKey < 100);

// 15. Dark theme follows the page
const colours = await tab.evaluate(() => {
  const span = document.querySelector('.code-editor .ce-keyword');
  const light = getComputedStyle(span).color;
  document.documentElement.dataset.theme = 'dark';
  const dark = getComputedStyle(span).color;
  delete document.documentElement.dataset.theme;
  return [light, dark];
});
check('keyword colour changes with the dark theme', colours[0] !== colours[1], JSON.stringify(colours));

// 16. destroy() puts the textarea back
const destroyed = await tab.evaluate(() => {
  const ta = editor.textarea;
  editor.destroy();
  const back = ta.parentNode === document.body && !document.querySelector('#ed ~ .code-editor, body > .code-editor');
  ta.value = 'plain';
  return {back, again: CodeEditor.get(ta) === null, value: ta.value, cls: ta.className};
});
check('destroy() restores the plain textarea', destroyed.back && destroyed.again && destroyed.value === 'plain' && destroyed.cls === '', JSON.stringify(destroyed));

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
