/**
 * Proof that a calendar entry's clickApi fills the modal with the data of the
 * API response, not with the calendar entry itself.
 *
 *   event:    {id: 7, title: 'Arisa · Leave', clickApi: '/view?id=7'}
 *   response: {data: {data: {name: 'Arisa', leave_text: '...'}, actions: [{type: 'modal', template, dataKey: 'data'}]}}
 *
 * The calendar used to call ResponseHandler with `context.data = <the entry>`.
 * ResponseHandler merges the response into the context only where the context
 * has no value, so the response's `data` was dropped and the modal template got
 * the entry's own fields: its labels showed with every value empty (eleave
 * leave calendar, booking and car calendars).
 *
 * Runs the real built bundles in a real browser against a real HTTP server.
 * NOW_CORE=<path> / NOW_CALENDAR=<path> run it against other builds.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const CALENDAR = process.env.NOW_CALENDAR || '../Now/dist/eventcalendar.min.js';

const today = new Date();
const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
const requested = [];

const page = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>t</title></head><body>
<div id="cal" data-event-calendar="leave" data-api="/events" data-view="month"></div>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false}, paths: {templates: '/templates/'}});
})();
</script>
<script src="/calendar.js"></script>
</body></html>`;

const template = `<dl class="detail-list">
  <dt>Name</dt><dd data-role="name" data-text="name"></dd>
  <dt>Leave dates</dt><dd data-role="dates" data-text="leave_text"></dd>
  <dd data-role="type" data-if="!limited" data-text="leave_type"></dd>
  <dd data-role="limited" data-if="limited">On leave</dd>
</dl>`;

const views = {
  7: {name: 'Arisa', leave_text: '1 Jan 2031', leave_type: 'Sick leave', limited: false},
  8: {name: 'Mintra', leave_text: '2 Jan 2031', leave_type: '', limited: true}
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const json = (body) => {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    res.end(JSON.stringify(body));
  };
  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/calendar.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : CALENDAR, 'utf8'));
  }
  if (url.pathname.endsWith('/leave-view.html')) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(template);
  }
  if (url.pathname === '/events') {
    return json({success: true, message: '', data: {data: [
      {id: 7, title: 'Arisa · Leave', start: iso, end: iso, allDay: true, clickApi: '/view?id=7'},
      {id: 8, title: 'Mintra · Leave', start: iso, end: iso, allDay: true, clickApi: '/view?id=8'}
    ]}});
  }
  if (url.pathname === '/view') {
    const id = url.searchParams.get('id');
    requested.push(id);
    return json({success: true, message: '', data: {
      data: views[id],
      actions: [{type: 'modal', action: 'show', template: 'leave-view.html', dataKey: 'data', title: 'Details of Leave Request'}]
    }});
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
tab.on('console', m => m.type() === 'error' && errors.push(`${m.type()}: ${m.text()}`));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await tab.goto(base + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await tab.waitForSelector('[data-event-id="7"]', {timeout: 8000}).catch(() => null);

const modalView = () => tab.evaluate(() => {
  const read = (role) => {
    const el = [...document.querySelectorAll(`[data-role="${role}"]`)].find(node => node.offsetParent !== null);
    return el ? el.textContent.trim() : null;
  };
  return {name: read('name'), dates: read('dates'), type: read('type'), limited: read('limited')};
});
const openEntry = async (id) => {
  await tab.evaluate((id) => document.querySelector(`[data-event-id="${id}"]`)?.click(), id);
  await tab.waitForFunction(() => [...document.querySelectorAll('[data-role="name"]')].some(node => node.offsetParent !== null), {timeout: 5000}).catch(() => null);
  await sleep(400);
  return modalView();
};
const closeModal = async () => {
  await tab.keyboard.press('Escape');
  await sleep(500);
};

let view = await openEntry(7);
check('the click calls the entry\'s clickApi', requested.join() === '7', requested.join());
check('the modal shows the data of the response (name, dates, leave type)',
  view.name === 'Arisa' && view.dates === '1 Jan 2031' && view.type === 'Sick leave' && view.limited === null, JSON.stringify(view));

await closeModal();
view = await openEntry(8);
check('a limited entry: data-if of the template reads the response (only "On leave")',
  view.name === 'Mintra' && view.dates === '2 Jan 2031' && view.limited === 'On leave' && view.type === null, JSON.stringify(view));

check('no errors on the page', errors.length === 0, errors.join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
