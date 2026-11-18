/**
 * Proof that the RichTextEditor plugins escape quotes in what they put inside
 * attribute values.
 *
 * LinkPlugin builds `<a href="${escapeHtml(url)}" title="${escapeHtml(title)}">`
 * and MentionPlugin `<span data-mention-id="${escapeHtml(item.id)}">` (the
 * mention list comes from an API). escapeHtml() was textContent -> innerHTML,
 * which leaves quotes alone, so an id such as `1" onmouseover="..."` added
 * attributes to the inserted element. It now escapes & < > " ' as entities.
 *
 * Loads the plugin modules (nowjs copy of js/components/editor) with jsdom
 * standing in for the page. EDITOR_DIR=<folder> runs it against another copy.
 */

import {JSDOM} from 'jsdom';

const here = new URL('.', import.meta.url).pathname;
const EDITOR = (process.env.EDITOR_DIR || here + '../js/components/editor').replace(/\/?$/, '/');

const dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'http://localhost/'});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const {default: LinkPlugin} = await import(EDITOR + 'plugins/media/LinkPlugin.js');
const {default: MentionPlugin} = await import(EDITOR + 'plugins/utility/MentionPlugin.js');

const value = '1" onmouseover="alert(1)" x=\'y\'';
for (const [name, Plugin] of [['LinkPlugin', LinkPlugin], ['MentionPlugin', MentionPlugin]]) {
  const escaped = Plugin.prototype.escapeHtml.call(null, value);
  const host = document.createElement('div');
  host.innerHTML = `<span data-v="${escaped}">${Plugin.prototype.escapeHtml.call(null, '<b>x</b> & y')}</span>`;
  const span = host.querySelector('span');
  check(`${name}: a value with quotes stays inside the attribute`,
    span && span.getAttribute('data-v') === value && !span.hasAttribute('onmouseover') && !span.hasAttribute('x'),
    host.innerHTML);
  check(`${name}: text with markup and & reads back as written`, span && span.textContent === '<b>x</b> & y', span && span.innerHTML);
}
check('MentionPlugin: a numeric id is kept', MentionPlugin.prototype.escapeHtml.call(null, 42) === '42',
  JSON.stringify(MentionPlugin.prototype.escapeHtml.call(null, 42)));

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
