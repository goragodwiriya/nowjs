/**
 * ResponseHandler `render` action: which data the template is bound to.
 *
 * Priority: action.data > context.data > the response payload > {}.
 *
 * A form submit runs the actions on FormManager.normalizeSubmitBindingPayload().
 * When the server sent no `data`, that adds `data: []` of its own and keeps the
 * server's object in `raw`; the template used to get that empty list, so every
 * binding (`data-text="name"`) came out empty. It now binds to `raw`.
 *
 * Every other case must stay as it was: action.data, a real `data` from the
 * server (object or empty list), and a `data` the caller put in the context.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div id="out"></div>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', auth: {enabled: false}});
})();
</script>
</body></html>`;

const template = `<p class="name" data-text="name"></p><p class="inner" data-text="data.name"></p>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  if (req.url.split('?')[0].endsWith('tpl.html')) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(template);
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

// Run one response through ResponseHandler.process and read what the template shows
const render = (payload, {submit = false, context = {}} = {}) => tab.evaluate(async (payload, submit, context) => {
  const out = document.getElementById('out');
  out.innerHTML = '';
  const action = {type: 'render', target: '#out', template: '/tpl.html'};
  const body = {...payload, actions: [action]};
  const data = submit ? FormManager.normalizeSubmitBindingPayload(body) : body;
  await ResponseHandler.process(data, {...context});
  return {
    name: out.querySelector('.name')?.textContent ?? null,
    inner: out.querySelector('.inner')?.textContent ?? null
  };
}, payload, submit, context);

let failed = 0;
const check = (label, got, want) => {
  const ok = got.name === want.name && got.inner === want.inner;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};

// The fix: a submit response without `data` binds its own fields
check('submit, server sent no data', await render({name: 'Top'}, {submit: true}), {name: 'Top', inner: ''});

// Unchanged
check('action.data wins', await tab.evaluate(async () => {
  const out = document.getElementById('out');
  out.innerHTML = '';
  await ResponseHandler.process({name: 'Top', actions: [{type: 'render', target: '#out', template: '/tpl.html', data: {name: 'Action'}}]}, {});
  return {name: out.querySelector('.name').textContent, inner: out.querySelector('.inner').textContent};
}), {name: 'Action', inner: ''});
check('submit, server sent data object', await render({name: 'Top', data: {name: 'Real'}}, {submit: true}), {name: 'Real', inner: ''});
check('submit, server sent empty data list', await render({name: 'Top', data: []}, {submit: true}), {name: '', inner: ''});
check('no submit, response has data object', await render({name: 'Top', data: {name: 'Inner'}}), {name: 'Inner', inner: ''});
check('caller context.data wins over added data', await render({name: 'Top'}, {submit: true, context: {data: {name: 'Caller'}}}), {name: 'Caller', inner: ''});

// Was {} (nothing bound); now the payload's own fields
check('no submit, response without data', await render({name: 'Plain'}), {name: 'Plain', inner: ''});

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
