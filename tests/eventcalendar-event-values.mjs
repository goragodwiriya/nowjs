/**
 * Proof that EventCalendar keeps the values of an event inside the markup it
 * builds from them.
 *
 * Events come from an API. buildModalEventItem() writes event.color into
 * style="border-left-color: ..." and event.id into data-event-id="..." of the
 * event and day detail modals. normalizeEvents() kept event.color as the API
 * sent it, and escapeHtml() left quotes alone, so
 *   color: 'red"><img src=x onerror=...>'  ran when a modal opened, and
 *   id:    '1" onmouseover="..." x="'       ran when the pointer passed over it.
 *
 * Now normalizeEvents() takes a colour only (#hex, rgb()/hsl() of numbers, a
 * colour name, var(--name)) and falls back to the calendar's colours, and
 * escapeHtml() escapes quotes too. A real id with quotes still opens its event.
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_CALENDAR=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const CALENDAR = process.env.NOW_CALENDAR || '../Now/dist/eventcalendar.min.js';

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<div id="cal"></div>
<script src="/core.js"></script>
<script>
window.__x = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}});
})();
</script>
<script src="/calendar.js"></script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/calendar.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : CALENDAR, 'utf8'));
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const ID = '1" onmouseover="window.__x.push(\'id\')" x="';
const out = await tab.evaluate(async (ID) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const el = document.getElementById('cal');
  const now = new Date();
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  EventCalendar.create(el, {});
  await wait(300);
  const P = n => `<img src=x onerror="window.__x.push('${n}')">`;
  EventCalendar.setEvents(el, [
    {id: ID, title: P('title'), start: d + ' 09:00', end: d + ' 10:00', allDay: false,
      color: 'red" onmouseover="window.__x.push(\'color-attr\')"><img src=x onerror="window.__x.push(\'color\')">', description: P('desc')},
    {id: 'hex', title: 'hex', start: d, end: d, color: '#ff0000'},
    {id: 'short', title: 'short', start: d, end: d, color: ' #0f08 '},
    {id: 'name', title: 'name', start: d, end: d, color: 'blue'},
    {id: 'rgb', title: 'rgb', start: d, end: d, color: 'rgb(1, 2, 3)'},
    {id: 'hsl', title: 'hsl', start: d, end: d, color: 'hsl(120deg 50% 40% / 0.5)'},
    {id: 'var', title: 'var', start: d, end: d, color: 'var(--brand-1)'},
    {id: 'url', title: 'url', start: d, end: d, color: 'url(javascript:alert(1))'},
    {id: 'expr', title: 'expr', start: d, end: d, color: 'red;background:url(x)'},
    {id: 'num', title: 'num', start: d, end: d, color: 12}
  ]);
  await wait(400);
  const inst = EventCalendar.getInstance(el);
  const colors = Object.fromEntries(inst.events.map(e => [e.id, e.color]));
  const palette = inst.config.eventColors;

  EventCalendar.showEventDetailModal(inst, inst.events[0]);
  await wait(400);
  const detail = document.querySelector('.ec-modal-event');
  const detailStyle = detail ? detail.style.borderLeftColor : null;

  EventCalendar.showDayDetailModal(inst, now, inst.events);
  await wait(400);
  const items = [...document.querySelectorAll('.ec-modal-event[data-event-id]')];
  const first = items.find(item => item.dataset.eventId === ID);
  const hex = items.find(item => item.dataset.eventId === 'hex');
  const onAttrs = [...document.querySelectorAll('*')].flatMap(n => [...n.attributes].filter(a => /^on/i.test(a.name)).map(a => `${n.tagName} ${a.name}`));
  items.forEach(item => item.dispatchEvent(new MouseEvent('mouseover', {bubbles: true})));
  await wait(200);
  return {
    colors, palette, detailStyle, onAttrs,
    items: items.length,
    firstFound: Boolean(first),
    firstEvent: first ? inst.events.find(ev => ev.id === first.dataset.eventId)?.title : null,
    hexStyle: hex ? hex.style.borderLeftColor : null,
    ran: [...window.__x]
  };
}, ID);

const c = out.colors;
const fallback = id => out.palette.includes(c[id]);
check('a colour that breaks out of the attribute is replaced by a calendar colour', fallback(ID), c[ID]);
check('#rrggbb is kept', c.hex === '#ff0000', c.hex);
check('#rgba is kept (trimmed)', c.short === '#0f08', c.short);
check('a colour name is kept', c.name === 'blue', c.name);
check('rgb() of numbers is kept', c.rgb === 'rgb(1, 2, 3)', c.rgb);
check('hsl() with deg and alpha is kept', c.hsl === 'hsl(120deg 50% 40% / 0.5)', c.hsl);
check('var(--name) is kept', c.var === 'var(--brand-1)', c.var);
check('url(...) is replaced', fallback('url'), c.url);
check('a value with ; and more declarations is replaced', fallback('expr'), c.expr);
check('a number is replaced', fallback('num'), String(c.num));
check('the event detail modal gets the colour (fallback for the bad one)', Boolean(out.detailStyle), out.detailStyle);
check('the day modal lists every event', out.items === 10, String(out.items));
check('the day modal colours an event with its colour', out.hexStyle === 'rgb(255, 0, 0)', out.hexStyle);
check('no element of the modals got an on* attribute from the data', out.onAttrs.length === 0, out.onAttrs.join(', '));
check('an id with quotes reads back the same from data-event-id and finds its event',
  out.firstFound && out.firstEvent === '<img src=x onerror="window.__x.push(\'title\')">', String(out.firstEvent));
check('no value ran script (modals opened, pointer over every item)', out.ran.length === 0, JSON.stringify(out.ran));

await sleep(200);
check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
