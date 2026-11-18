#!/usr/bin/env node
/**
 * Build the KB catalog of nowjs/examples from the current files.
 *
 * Every catalog page is generated from the example's own files and checked
 * against the Now.js source in adminframework, so nothing in it is hand-written
 * and it can be rebuilt whenever an example changes:
 *
 *   node scripts/examples-catalog.mjs            # writes datas/examples-kb/*.md
 *   then in the kb MCP: import_directory path=<nowjs>/datas/examples-kb
 *        scope_type=framework scope_name=Now.js area=examples kind=reference
 *        confidence=source-validated tags=nowjs-example,examples-catalog
 *
 * Re-importing replaces the previous entries (the importer keys on the file path).
 * datas/ is ignored by git and by the sftp watcher, so the catalog never goes live.
 *
 * Options: --out <dir>  --src <Now dir>  --check (print problems only, exit 1 if any)
 */
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'examples');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};
const OUT = path.resolve(opt('--out', path.join(ROOT, 'datas/examples-kb')));
const NOW = path.resolve(opt('--src', path.join(ROOT, '../adminframework/Now')));
const CHECK_ONLY = args.includes('--check');
const MAX_PAGE = 9500; // kb importer splits content above 10,000 chars
const BASE_COMMIT = '0dd5236'; // "init Git v1.0.0": examples imported as-is, not reviewed

// ─── helpers ────────────────────────────────────────────────────────────────

const read = f => fs.readFileSync(f, 'utf8');
const rel = f => path.relative(ROOT, f);
const kebab = s => s.replace(/[A-Z]/g, c => '-' + c.toLowerCase());
const uniq = a => [...new Set(a)];
const lineOf = (text, index) => text.slice(0, index).split('\n').length;

function walk(dir, filter = () => true) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name.startsWith('.')) continue;
      out.push(...walk(p, filter));
    } else if (filter(p)) out.push(p);
  }
  return out.sort();
}

function git(...a) {
  try {
    return execFileSync('git', a, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return '';
  }
}

/** Remove <pre>/<code> blocks and comments so only live markup is analysed (keeps line numbers). */
function liveMarkup(html) {
  const blank = m => m.replace(/[^\n]/g, ' ');
  return html
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/<pre[\s\S]*?<\/pre>/gi, blank)
    .replace(/<code[\s\S]*?<\/code>/gi, blank)
    .replace(/<template[^>]*data-syntax[\s\S]*?<\/template>/gi, blank)
    .replace(/(<script(?![^>]*\bsrc=)[^>]*>)([\s\S]*?)(<\/script>)/gi, (m, a, b, c) => a + blank(b) + c);
}

/** data-* names written as attributes inside tags (not words in text such as "data-driven"). */
function tagAttrs(markup) {
  const out = [];
  for (const t of markup.matchAll(/<[a-zA-Z][^<>]*>/g)) {
    for (const m of t[0].matchAll(/\s(data-[a-z][a-z0-9-]*)(?=[\s=>\/])/g)) out.push(m[1]);
  }
  return out;
}

/** Inline <script> bodies (no src) — page code that lives in the html. */
const inlineScripts = html => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).join('\n');

const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

/** Code shown to the reader: <pre>/<code> blocks of the html and fenced blocks of README.md. */
function shownCode(html, readme) {
  const blocks = [...html.matchAll(/<pre[^>]*>([\s\S]*?)<\/pre>/gi)].map(m => decode(m[1].replace(/<\/?code[^>]*>/gi, '')));
  if (readme) blocks.push(...[...readme.matchAll(/```[\w-]*\n([\s\S]*?)```/g)].map(m => m[1]));
  return blocks.join('\n');
}

const stripTags = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ─── Now.js source index ────────────────────────────────────────────────────

const srcFiles = [
  ...walk(path.join(NOW, 'js'), f => f.endsWith('.js')),
  ...walk(path.join(NOW, 'features'), f => f.endsWith('.js')),
  ...walk(path.join(NOW, 'css'), f => f.endsWith('.css')),
  // components bundled from outside Now/ (entry-eventcalendar.js imports ../js/components/EventCalendar.js)
  ...walk(path.join(NOW, '../js/components'), f => f.endsWith('.js')),
  path.join(NOW, 'Now.js')
].filter(f => fs.existsSync(f));
if (!srcFiles.length) {
  console.error(`Now.js source not found under ${NOW}`);
  process.exit(2);
}
const srcText = new Map(srcFiles.map(f => [f, read(f)]));
const allSrc = [...srcText.values()].join('\n');

const srcAttrs = new Set();
const srcAttrPrefixes = new Set();
for (const t of srcText.values()) {
  for (const m of t.matchAll(/data-[a-z][a-z0-9-]*/g)) srcAttrs.add(m[0]);
  for (const m of t.matchAll(/dataset\.([a-zA-Z][a-zA-Z0-9]*)/g)) srcAttrs.add('data-' + kebab(m[1]));
  for (const m of t.matchAll(/dataset\[['"]([a-zA-Z][a-zA-Z0-9]*)['"]\]/g)) srcAttrs.add('data-' + kebab(m[1]));
  // dataset[`error${Rule}`] → data-error-<rule>
  for (const m of t.matchAll(/dataset\[`([a-z][a-zA-Z0-9]*)\$\{/g)) srcAttrPrefixes.add('data-' + kebab(m[1]) + '-');
  // data-on-${event}, 'data-x-' + name, startsWith('data-x-')
  for (const m of t.matchAll(/(data-[a-z0-9-]*-)(?=\$\{|['"`]\s*\+|['"`]\s*\))/g)) srcAttrPrefixes.add(m[1]);
}
const isFrameworkAttr = a => srcAttrs.has(a) || [...srcAttrPrefixes].some(p => a.startsWith(p));
/**
 * Managers that copy every data-* into config read the attribute only by its camelCase key
 * (data-show-checkbox → showCheckbox, data-crop-width → cropWidth): softer evidence, reported apart.
 */
const keyRe = k => new RegExp(`(?:[{,]\\s*|\\.|\\b)${k}\\s*[:=?]|\\.${k}\\b|['"]${k}['"]`);
const configKeyHit = a => {
  const camel = a.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  return camel.length > 2 && keyRe(camel).test(allSrc);
};
const eventPrefixes = new Set([...allSrc.matchAll(/['"`]([a-z][\w-]*:)(?=\$\{|['"`]\s*\+)/g)].map(m => m[1]));
const isFrameworkEvent = e => allSrc.includes(e) || [...eventPrefixes].some(p => e.startsWith(p));

/** Public classes: file name = exported name (*Manager / *Component object literals, *Factory classes). */
const classFiles = new Map();
for (const f of srcFiles) {
  if (!f.endsWith('.js') || !f.includes(`${path.sep}js${path.sep}`) || f.includes(`${path.sep}editor${path.sep}`)) continue;
  classFiles.set(path.basename(f, '.js'), f);
}
const classNames = [...classFiles.keys()].filter(n => n.length > 3 && /^[A-Z]/.test(n));

function hasMember(className, member) {
  const files = className === 'Now' ? [path.join(NOW, 'Now.js')] : [classFiles.get(className)];
  const re = new RegExp(`(^|[^\\w$.])${member}\\s*(\\(|:|=\\s*(async\\s*)?(function|\\())|\\.${member}\\s*=|get\\s+${member}\\s*\\(|static\\s+(async\\s+)?${member}\\s*\\(`, 'm');
  return files.some(f => f && srcText.has(f) && re.test(srcText.get(f)));
}

// ─── per example ────────────────────────────────────────────────────────────

const TEXT_EXT = new Set(['.html', '.js', '.css', '.php', '.json', '.md']);
const dirty = new Set(git('status', '--porcelain', '--', 'examples').split('\n').filter(Boolean).map(l => l.slice(3)));

function sections(file, html) {
  const live = liveMarkup(html);
  const heads = [];
  let re = /<h2[^>]*>([\s\S]*?)<\/h2>/gi;
  for (const m of html.matchAll(re)) heads.push({line: lineOf(html, m.index), title: stripTags(m[1]), index: m.index});
  if (heads.length < 2) {
    heads.length = 0;
    re = /<section[^>]*\bid="([^"]+)"[^>]*>/gi;
    for (const m of html.matchAll(re)) heads.push({line: lineOf(html, m.index), title: '#' + m[1], index: m.index});
  }
  return heads.map((h, i) => {
    const end = i + 1 < heads.length ? heads[i + 1].index : html.length;
    const chunk = live.slice(h.index, end);
    const attrs = uniq(tagAttrs(chunk))
      .filter(a => a !== 'data-i18n');
    return {...h, file, attrs};
  });
}

function phpSummary(file) {
  const t = read(file);
  const doc = (t.match(/\/\*\*([\s\S]*?)\*\//) || [])[1] || '';
  const docLines = doc.split('\n').map(l => l.replace(/^\s*\*\s?/, '').trim()).filter(l => l && !l.startsWith('@')).slice(0, 6);
  const params = uniq([
    ...[...t.matchAll(/\$_(?:GET|POST|REQUEST|FILES)\[['"]([\w-]+)['"]\]/g)].map(m => m[1]),
    ...[...t.matchAll(/->(?:post|get|request|filter|input)\(\s*['"]([\w-]+)['"]/g)].map(m => m[1]),
    ...[...t.matchAll(/\$(?:data|input|body|params|req)\[['"]([\w-]+)['"]\]/g)].map(m => m[1])
  ]);
  const methods = uniq([...t.matchAll(/requireMethod\(\s*['"](\w+)['"]|REQUEST_METHOD'\]\s*[!=]==?\s*['"](\w+)['"]/g)].map(m => m[1] || m[2]));
  const codes = uniq([...t.matchAll(/http_response_code\(\s*(\d{3})|Response\(\s*[^)]*?,\s*(\d{3})\s*\)|\b(4\d\d|5\d\d)\b(?=\s*[,)])/g)].map(m => m[1] || m[2] || m[3])).filter(Boolean);
  const types = uniq([...t.matchAll(/['"]type['"]\s*=>\s*['"](\w+)['"]/g)].map(m => m[1]));
  return {docLines, params, methods, codes, types, lines: t.split('\n').length};
}

function analyse(name) {
  const dir = path.join(EXAMPLES, name);
  const files = walk(dir);
  const text = files.filter(f => TEXT_EXT.has(path.extname(f)));
  const media = files.length - text.length;
  const htmls = text.filter(f => f.endsWith('.html') && !f.includes(`${path.sep}templates${path.sep}`));
  const templates = text.filter(f => f.endsWith('.html') && f.includes(`${path.sep}templates${path.sep}`));
  const jsFiles = text.filter(f => f.endsWith('.js'));
  const phpFiles = text.filter(f => f.endsWith('.php'));
  const cssFiles = text.filter(f => f.endsWith('.css'));
  const content = new Map(text.map(f => [f, read(f)]));

  const main = htmls.find(f => path.basename(f) === 'index.html') || htmls[0];
  const mainHtml = main ? content.get(main) : '';
  const title = stripTags((mainHtml.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || name);

  let summary = '';
  const readme = files.find(f => path.basename(f) === 'README.md' && path.dirname(f) === dir);
  if (readme) {
    const body = content.get(readme).split('\n');
    const start = body.findIndex(l => /^#\s/.test(l));
    const para = [];
    for (const l of body.slice(start + 1)) {
      if (/^#/.test(l) && para.length) break;
      if (/^#/.test(l) || /^```/.test(l)) continue;
      if (l.trim()) para.push(l.trim());
      if (para.join(' ').length > 350) break;
    }
    summary = para.join(' ').slice(0, 400);
  }

  const bundles = uniq(htmls.flatMap(f => [...content.get(f).matchAll(/Now\/dist\/(now\.[\w.]+?)\.min\.(js|css)/g)].map(m => `${m[1]}.${m[2]}`)));
  const features = uniq([...[...content.values()].join('\n').matchAll(/Now\.require\(\s*\[?\s*['"]([\w,'" ]+)['"]/g)].map(m => m[1]));

  const sec = htmls.flatMap(f => sections(f, content.get(f)));

  // attributes in live markup (html + templates) and in js strings
  const liveAll = [...htmls, ...templates].map(f => liveMarkup(content.get(f))).join('\n');
  const jsAll = [...jsFiles.map(f => content.get(f)), ...[...htmls, ...templates].map(f => inlineScripts(content.get(f)))].join('\n');
  const cssAll = cssFiles.map(f => content.get(f)).join('\n');
  const used = uniq([
    ...tagAttrs(liveAll),
    ...[...jsAll.matchAll(/['"`\s\[](data-[a-z][a-z0-9-]*)(?=[\s='"`\]>])/g)].map(m => m[1])
  ]).sort();
  // data-modal-bind="name:name, bio:bio" reads data-name / data-bio of the trigger or an ancestor
  const modalBound = new Set([...liveAll.matchAll(/data-modal-bind="([^"]*)"/g)]
    .flatMap(m => m[1].split(',').map(p => (p.split(':')[1] || '').trim()))
    .filter(Boolean).map(f => 'data-' + kebab(f)));
  const ownAttr = a => {
    if (modalBound.has(a)) return true;
    const camel = a.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    return new RegExp(`dataset\\.${camel}\\b|(?:get|set|has|remove)Attribute\\(['"]${a}['"]|\\[${a}(?![\\w-])`).test(jsAll) || cssAll.includes(`[${a}`);
  };
  const fw = used.filter(isFrameworkAttr);
  const own = used.filter(a => !isFrameworkAttr(a) && ownAttr(a));
  const byKey = used.filter(a => !isFrameworkAttr(a) && !ownAttr(a) && configKeyHit(a));
  const unknown = used.filter(a => !isFrameworkAttr(a) && !ownAttr(a) && !configKeyHit(a));

  // classes and calls
  const codeAll = [...content.entries()].filter(([f]) => !f.endsWith('.md') && !f.endsWith('.php')).map(([, t]) => t).join('\n');
  const classes = classNames
    .map(n => ({n, c: (codeAll.match(new RegExp(`\\b${n}\\b`, 'g')) || []).length}))
    .filter(x => x.c)
    .sort((a, b) => b.c - a.c);
  const managers = uniq([...codeAll.matchAll(/Now\.getManager\(\s*['"](\w+)['"]/g)].map(m => m[1]));

  const ownEvents = new Set([...jsAll.matchAll(/(?:emit|trigger|dispatch)\(\s*['"]([\w:.-]+)['"]|new CustomEvent\(\s*['"]([\w:.-]+)['"]/g)].map(m => m[1] || m[2]));
  // also the example's own: the name is written elsewhere in its code (emit/type/off …), not only where it is heard
  const ownEvent = e => ownEvents.has(e) || (jsAll.split(`'${e}'`).length + jsAll.split(`"${e}"`).length - 2) > 1;
  const calls = new Map();
  for (const m of jsAll.matchAll(/\b([A-Z]\w+|Now)\.([a-zA-Z_$][\w$]*)\s*\(/g)) {
    const [, cls, member] = m;
    if (cls !== 'Now' && !classFiles.has(cls)) continue;
    const k = `${cls}.${member}`;
    if (!calls.has(k)) calls.set(k, {cls, member, ok: hasMember(cls, member)});
  }
  const badCalls = [...calls.values()].filter(c => !c.ok).map(c => `${c.cls}.${c.member}()`);

  // code shown to the reader (<pre> samples, README): people copy it, so it is checked too
  const readmeText = readme ? content.get(readme) : '';
  const shown = htmls.map(f => shownCode(content.get(f), '')).join('\n') + '\n' + shownCode('', readmeText);
  const shownBadCalls = uniq([...shown.matchAll(/\b([A-Z]\w+|Now)\.([a-zA-Z_$][\w$]*)\s*\(/g)]
    .filter(([, cls]) => cls === 'Now' || classFiles.has(cls))
    .filter(([, cls, member]) => !hasMember(cls, member))
    .map(([, cls, member]) => `${cls}.${member}()`));
  const shownBadAttrs = uniq(tagAttrs(shown)).filter(a => !isFrameworkAttr(a) && !ownAttr(a) && !configKeyHit(a) && a !== 'data-i18n');
  const shownBadEvents = uniq([...shown.matchAll(/\.(?:on|once|addEventListener)\(\s*['"]([a-z][\w-]*:[\w:.-]+)['"]/g)].map(m => m[1]))
    .filter(e => !isFrameworkEvent(e) && !ownEvent(e));

  const events = uniq([...jsAll.matchAll(/\.(?:on|once|off|addEventListener)\(\s*['"]([a-z][\w-]*[:.][\w:.-]+)['"]/g)].map(m => m[1]));
  const unknownEvents = events.filter(e => !isFrameworkEvent(e) && !ownEvent(e));

  // endpoints referenced by markup and scripts
  const endpoints = uniq([
    ...[...liveAll.matchAll(/\s(action|data-[a-z-]*(?:url|api|source|src))="([^"{}]+)"/g)].map(m => `${m[1]}=${m[2]}`),
    ...[...jsAll.matchAll(/['"`]((?:\.\.?\/)?(?:api\/|[\w-]+\/)*[\w-]+\.(?:php|json))(?:\?[^'"`]*)?['"`]/g)].map(m => m[1])
  ]).filter(e => !/\.(png|jpe?g|svg|gif|webp|css)$/.test(e) && !/^data-src=/.test(e));
  const external = uniq([...jsAll.matchAll(/['"`](https?:\/\/[^/'"`\s]+)/g)].map(m => m[1])).filter(u => !/nowjs\.net|cdnjs|jsdelivr|googleapis|gstatic/.test(u));

  const php = phpFiles.map(f => ({f, ...phpSummary(f)}));

  // status
  const log = git('log', '--format=%h|%ad|%s', '--date=short', '--', rel(dir)).split('\n').filter(Boolean).map(l => {
    const [h, d, ...s] = l.split('|');
    return {h, d, s: s.join('|')};
  });
  const reviewed = log.filter(c => c.h !== BASE_COMMIT);
  const ignored = git('check-ignore', rel(path.join(dir, 'index.html'))) !== '';
  const dirtyFiles = [...dirty].filter(p => p.startsWith(`examples/${name}/`)).map(p => p.slice(`examples/${name}/`.length));

  const tests = walk(path.join(ROOT, 'tests'), f => f.endsWith('.mjs'))
    .filter(f => read(f).includes(`examples/${name}`))
    .map(f => path.basename(f));

  return {
    name, dir, title, summary, files, text, media, htmls, templates, phpFiles, bundles, features, sec,
    fw, own, byKey, unknown, classes, managers, badCalls, shownBadCalls, shownBadAttrs, shownBadEvents, events, unknownEvents, endpoints, external, php,
    log, reviewed, ignored, dirtyFiles, tests
  };
}

// ─── render ─────────────────────────────────────────────────────────────────

function statusLine(x) {
  if (x.ignored) return 'ไม่อยู่ใน git (gitignore) — ไม่มีประวัติการตรวจ ถือว่ายังไม่ได้ตรวจ';
  if (x.reviewed.length) {
    const c = x.reviewed[0];
    return `ตรวจ/แก้แล้ว ${x.reviewed.length} รอบ ล่าสุด ${c.h} ${c.d}`;
  }
  return `ยังไม่ได้ตรวจ — มีแค่ commit นำเข้า ${BASE_COMMIT} (โค้ดเดิมก่อนตั้ง git อาจใช้ API ที่เลิกแล้ว)`;
}

function renderExample(x) {
  const L = [];
  const p = f => path.relative(x.dir, f);
  L.push(`# ตัวอย่าง Now.js: ${x.name} — ${x.title}`);
  L.push('');
  L.push(`คำค้น: nowjsexample ${x.name} · ${x.classes.slice(0, 8).map(c => c.n).join(' · ')}`);
  L.push(`โฟลเดอร์: ${x.dir}/ · เปิดในเบราว์เซอร์: http://localhost/now.js/nowjs/examples/${x.name}/`);
  L.push(`สถานะ: ${statusLine(x)}${x.dirtyFiles.length ? ` · มีไฟล์แก้ค้างยังไม่ commit: ${x.dirtyFiles.join(', ')}` : ''}`);
  L.push('');
  L.push('> แคตตาล็อกนี้สร้างจากไฟล์จริงด้วย nowjs/scripts/examples-catalog.mjs — ใช้หาว่า "ตัวอย่างไหน บรรทัดไหน สาธิตอะไร" แล้ว **เปิดไฟล์จริงก่อนลอก** · ชื่อ API ต้องตรงกับซอร์ส adminframework/Now/js เสมอ (ส่วน "ตรวจกับซอร์ส" ด้านล่างคือผลเทียบตอนสร้าง)');
  if (x.summary) L.push('', x.summary);

  if (x.reviewed.length) {
    L.push('', '## ประวัติการตรวจ');
    for (const c of x.reviewed.slice(0, 3)) L.push(`- ${c.h} ${c.d}: ${c.s.length > 300 ? c.s.slice(0, 300) + '…' : c.s}`);
  }

  L.push('', '## ใช้อะไรของ Now.js');
  if (x.bundles.length) L.push(`- bundle: ${x.bundles.join(', ')}`);
  if (x.features.length) L.push(`- Now.require: ${x.features.join(', ')}`);
  if (x.classes.length) L.push(`- คลาส (จำนวนครั้งที่อ้าง): ${x.classes.map(c => `${c.n}(${c.c})`).join(', ')}`);
  if (x.managers.length) L.push(`- Now.getManager: ${x.managers.join(', ')}`);
  if (x.events.length) L.push(`- event ที่ฟัง: ${x.events.join(', ')}`);

  if (x.sec.length) {
    L.push('', '## หัวข้อในหน้า (ไฟล์:บรรทัด — data-* ที่ใช้ใน markup จริงของหัวข้อนั้น)');
    for (const s of x.sec) {
      const attrs = s.attrs.length ? ` — ${s.attrs.join(' ')}` : '';
      L.push(`- ${p(s.file)}:${s.line} ${s.title}${attrs}`);
    }
  }

  L.push('', '## data-* ทั้งหมด');
  if (x.fw.length) L.push(`- ของเฟรมเวิร์ก (${x.fw.length}): ${x.fw.join(' ')}`);
  if (x.byKey.length) L.push(`- อ่านผ่าน dataset แบบรวม (ซอร์สมีแค่ key camelCase เช่น data-show-checkbox → showCheckbox ยืนยันในคลาสก่อนใช้): ${x.byKey.join(' ')}`);
  if (x.own.length) L.push(`- ของตัวอย่างเอง (อ่านใน main.js/css ของตัวอย่าง ไม่ใช่ API): ${x.own.join(' ')}`);

  if (x.php.length || x.endpoints.length || x.external.length) {
    L.push('', '## ฝั่ง server / ข้อมูล');
    if (x.endpoints.length) L.push(`- ปลายทางที่หน้าเรียก: ${x.endpoints.slice(0, 30).join(' · ')}`);
    for (const ph of x.php) {
      const bits = [];
      if (ph.methods.length) bits.push(`method ${ph.methods.join('/')}`);
      if (ph.params.length) bits.push(`รับ ${ph.params.join(', ')}`);
      if (ph.codes.length) bits.push(`status ${ph.codes.join(', ')}`);
      if (ph.types.length) bits.push(`action type ${ph.types.join(', ')}`);
      L.push(`- ${p(ph.f)} (${ph.lines} บรรทัด)${bits.length ? ' — ' + bits.join(' · ') : ''}${ph.docLines.length ? `\n  ${ph.docLines.join(' / ')}` : ''}`);
    }
    if (x.external.length) L.push(`- API ภายนอก: ${x.external.join(', ')} (ออฟไลน์แล้วตัวอย่างส่วนนี้ใช้ไม่ได้)`);
  }

  L.push('', '## ตรวจกับซอร์ส Now.js (adminframework)');
  const problems = [];
  if (x.unknown.length) problems.push(`- ⚠️ data-* ที่ไม่พบในซอร์สและตัวอย่างไม่ได้อ่านเอง (อาจตายหรือสะกดผิด): ${x.unknown.join(' ')}`);
  if (x.badCalls.length) problems.push(`- ⚠️ เรียกเมธอดที่ไม่พบในคลาส: ${x.badCalls.join(', ')}`);
  if (x.unknownEvents.length) problems.push(`- ⚠️ event ที่ไม่พบชื่อในซอร์ส: ${x.unknownEvents.join(', ')}`);
  if (x.shownBadCalls.length) problems.push(`- ⚠️ โค้ดที่แสดงในหน้า/README เรียกเมธอดที่ไม่มี: ${x.shownBadCalls.join(', ')}`);
  if (x.shownBadAttrs.length) problems.push(`- ⚠️ โค้ดที่แสดงในหน้า/README ใช้ data-* ที่ไม่พบในซอร์ส: ${x.shownBadAttrs.join(' ')}`);
  if (x.shownBadEvents.length) problems.push(`- ⚠️ โค้ดที่แสดงในหน้า/README ฟัง event ที่ไม่มี: ${x.shownBadEvents.join(', ')}`);
  L.push(problems.length ? problems.join('\n') : '- ✅ data-*, เมธอด และชื่อ event ทั้งในโค้ดที่ทำงานและโค้ดที่แสดงในหน้า/README พบในซอร์สทั้งหมด');

  if (x.tests.length) L.push('', `## เทสต์ที่เปิดตัวอย่างนี้: ${x.tests.map(t => 'nowjs/tests/' + t).join(', ')}`);

  L.push('', '## ไฟล์');
  const list = x.text.map(f => `${p(f)} (${(fs.statSync(f).size / 1024).toFixed(1)}K)`);
  L.push(list.join(' · ') + (x.media ? ` · ไฟล์สื่อ ${x.media} ไฟล์` : ''));

  let out = L.join('\n') + '\n';
  if ([...out].length > MAX_PAGE) out = [...out].slice(0, MAX_PAGE - 80).join('') + '\n\n…(ตัดเพื่อไม่ให้ kb แบ่งหน้า — ดูไฟล์จริง)\n';
  return out;
}

function renderIndex(all) {
  const L = [];
  L.push('# ดัชนีตัวอย่าง Now.js (nowjs/examples) — เริ่มที่นี่เมื่อจะออกแบบหน้าใหม่');
  L.push('');
  L.push('คำค้น: nowjsexample index catalog ตัวอย่าง examples');
  L.push('');
  L.push('สร้างใหม่หลังแก้ตัวอย่าง: `cd /mnt/Server/htdocs/now.js/nowjs && node scripts/examples-catalog.mjs` แล้ว `import_directory path=/mnt/Server/htdocs/now.js/nowjs/datas/examples-kb pattern=*.md scope_type=framework scope_name=Now.js area=examples kind=reference confidence=source-validated source_type=generated tags=nowjs-example,examples-catalog,nowjs,examples` (นำเข้าซ้ำ = แทนที่ของเดิม) · `node scripts/examples-catalog.mjs --check` แสดงเฉพาะ data-*/เมธอด/event ที่ไม่พบในซอร์ส');
  L.push(`${all.length} ตัวอย่างใน /mnt/Server/htdocs/now.js/nowjs/examples · สร้างจากไฟล์จริงด้วย \`node scripts/examples-catalog.mjs\` (ใน nowjs) แล้ว import_directory datas/examples-kb`);
  L.push('');
  L.push('วิธีใช้: หาตัวอย่างจากตารางนี้ หรือ `knowledge_search` ด้วย**คำเดียว** เช่น `LineItemsManager` หรือ `data-cascade-api` (อย่าผสมคำที่มี `-` กับคำอื่น: FULLTEXT boolean mode อ่าน `-` เป็นการตัดคำทิ้ง · ทั้งแคตตาล็อกดึงได้ด้วย `knowledge_list tags=examples-catalog`) → อ่านหน้าแคตตาล็อกของตัวอย่าง (มีหัวข้อพร้อมเลขบรรทัด) → เปิดไฟล์จริงตรงบรรทัดนั้น · ถือว่าตัวอย่าง **"ตรวจแล้ว"** เป็นแบบได้ ตัวที่ **"ยังไม่ได้ตรวจ"** ใช้เป็นไอเดียเท่านั้น ต้องเทียบซอร์สก่อน · เมื่อ KB entry แบบ canonical/runtime-verified ขัดกับตัวอย่าง ให้เชื่อ KB และแก้ตัวอย่าง');
  L.push('');
  L.push('| ตัวอย่าง | สาธิต | คลาสหลัก | สถานะ | ⚠️ |');
  L.push('|---|---|---|---|---|');
  for (const x of all) {
    const st = x.ignored ? 'นอก git' : x.reviewed.length ? `ตรวจแล้ว ${x.reviewed[0].d}` : 'ยังไม่ได้ตรวจ';
    const warn = x.unknown.length + x.badCalls.length + x.unknownEvents.length + x.shownBadCalls.length + x.shownBadAttrs.length + x.shownBadEvents.length;
    L.push(`| ${x.name} | ${x.title.replace(/\s*[-–|]\s*Now\.js.*$/i, '').replace(/\|/g, '/')} | ${x.classes.slice(0, 4).map(c => c.n).join(', ')} | ${st} | ${warn || ''} |`);
  }
  L.push('');
  L.push('## คลาส → ตัวอย่าง (เรียงตามจำนวนการใช้)');
  const byClass = new Map();
  for (const x of all) for (const c of x.classes) {
    if (!byClass.has(c.n)) byClass.set(c.n, []);
    byClass.get(c.n).push({name: x.name, c: c.c, ok: x.reviewed.length > 0 && !x.ignored});
  }
  for (const [n, list] of [...byClass.entries()].sort()) {
    list.sort((a, b) => b.ok - a.ok || b.c - a.c);
    L.push(`- ${n}: ${list.map(e => e.name + (e.ok ? '✓' : '')).join(', ')}`);
  }
  L.push('', '✓ = ตัวอย่างที่ตรวจแล้ว');
  return L.join('\n') + '\n';
}

function renderAttrMap(all, from, to) {
  const map = new Map();
  for (const x of all) {
    for (const s of x.sec) for (const a of s.attrs) {
      if (!isFrameworkAttr(a)) continue;
      if (!map.has(a)) map.set(a, []);
      map.get(a).push(`${x.name}:${s.line}${x.reviewed.length && !x.ignored ? '✓' : ''}`);
    }
    for (const a of x.fw) {
      if (!map.has(a)) map.set(a, []);
      if (!map.get(a).some(e => e.startsWith(x.name + ':') || e === x.name || e === x.name + '✓')) map.get(a).push(x.name + (x.reviewed.length && !x.ignored ? '✓' : ''));
    }
  }
  const L = [`# data-* ของ Now.js → ตัวอย่างที่ใช้ (data-${from}… ถึง data-${to}…)`, '',
    'คำค้น: nowjsexample attribute map data-attribute ตัวอย่าง', '',
    'ใช้หาว่าจะดูการใช้ attribute ตัวไหนได้ที่ไหน · ✓ = ตัวอย่างที่ตรวจแล้ว · เลขบรรทัดชี้หัวข้อ (h2/section) ที่ใช้ attribute นั้นใน markup จริง · รายละเอียดอยู่ในหน้าแคตตาล็อก nowjs-example-<ชื่อ>.md', ''];
  for (const [a, list] of [...map.entries()].sort().filter(([a]) => a[5] >= from && a[5] <= to)) L.push(`- ${a}: ${uniq(list).slice(0, 12).join(', ')}${list.length > 12 ? ` …+${list.length - 12}` : ''}`);
  return L.join('\n') + '\n';
}

// ─── main ───────────────────────────────────────────────────────────────────

const names = fs.readdirSync(EXAMPLES, {withFileTypes: true})
  .filter(e => e.isDirectory() && fs.existsSync(path.join(EXAMPLES, e.name, 'index.html')) || (e.isDirectory() && walk(path.join(EXAMPLES, e.name), f => f.endsWith('.html')).length))
  .map(e => e.name)
  .sort();
const all = names.map(analyse);

if (CHECK_ONLY) {
  let n = 0;
  for (const x of all) {
    const issues = [...x.unknown.map(a => `attr ${a}`), ...x.badCalls.map(c => `call ${c}`), ...x.unknownEvents.map(e => `event ${e}`),
      ...x.shownBadCalls.map(c => `shown call ${c}`), ...x.shownBadAttrs.map(a => `shown attr ${a}`), ...x.shownBadEvents.map(e => `shown event ${e}`)];
    if (issues.length) {
      n += issues.length;
      console.log(`${x.name}: ${issues.join(', ')}`);
    }
  }
  process.exit(n ? 1 : 0);
}

fs.mkdirSync(OUT, {recursive: true});
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.md')) fs.unlinkSync(path.join(OUT, f));
fs.writeFileSync(path.join(OUT, 'nowjs-examples-index.md'), renderIndex(all));
fs.writeFileSync(path.join(OUT, 'nowjs-examples-attribute-map-a-l.md'), renderAttrMap(all, 'a', 'l'));
fs.writeFileSync(path.join(OUT, 'nowjs-examples-attribute-map-m-z.md'), renderAttrMap(all, 'm', 'z'));
for (const x of all) fs.writeFileSync(path.join(OUT, `nowjs-example-${x.name}.md`), renderExample(x));
const sizes = fs.readdirSync(OUT).map(f => [f, [...read(path.join(OUT, f))].length]);
console.log(`wrote ${sizes.length} files to ${OUT}`);
for (const [f, n] of sizes) if (n > 10000) console.log(`  over 10,000 chars (kb will split it): ${f} ${n}`);
