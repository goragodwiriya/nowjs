/**
 * Proof that TaskMonitorComponent behaves as documented.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships — not a mock of it.
 *
 * Each case asserts one promise from docs/en/TaskMonitorComponent.md.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';

let hits = 0;
let payload = {ok: true, data: {active: []}};
let status = 200;

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<div id="strip" data-component="task-monitor"
     data-endpoint="/jobs"
     data-items="data.active"
     data-interval="300"
     data-idle-interval="300"></div>
<script src="/core.js"></script>
<script>
window.__finished = [];
document.addEventListener('task-monitor:finished', e => {
  window.__finished.push({label: e.detail.label, failed: e.detail.failed});
});
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer(async (req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(CORE, 'utf8'));
  }
  if (req.url.startsWith('/jobs')) {
    hits++;
    res.writeHead(status, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify(payload));
  }
  if (req.url === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url); res.writeHead(404);
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
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => {
  /*
   * Step 6 makes the endpoint answer 500 on purpose, and the browser logs every
   * one of those as a console error · counting them here would mean this check
   * fails whenever the test does its job
   */
  if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(m.text());
});

/*
 * `load`, not `networkidle0` — this component polls, so the network is never
 * idle by design and waiting for that is waiting forever
 */
await tab.goto(base, {waitUntil: 'load'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const html = () => tab.evaluate(() => document.querySelector('#strip').innerHTML);

// 1. Mounted from the markup alone, and polling on its own
await sleep(700);
check('mounts from data-component and polls', hits > 0, `${hits} requests`);

check(
  'hidden while nothing is running',
  await tab.evaluate(() => document.querySelector('#strip').hidden) === true,
);

// 2. A running task appears, and the element becomes visible
payload = {ok: true, data: {active: [{id: 7, label: 'Backup example.com', status: 'running', message: ''}]}};
await sleep(700);

check('renders a running task', (await html()).includes('Backup example.com'));
check('marks it running', (await html()).includes('is-running'));
check('shows the element again', await tab.evaluate(() => document.querySelector('#strip').hidden) === false);

// 3. The task ends — the event fires exactly once, with the label
payload = {ok: true, data: {active: []}};
await sleep(900);

let finished = await tab.evaluate(() => window.__finished);
check('fires task-monitor:finished once', finished.length === 1, JSON.stringify(finished));
check('carries the label', finished[0] && finished[0].label === 'Backup example.com');
check('not marked failed', finished[0] && finished[0].failed === false);

await sleep(900);
finished = await tab.evaluate(() => window.__finished);
check('does not fire again for the same task', finished.length === 1, `${finished.length} events`);

// 4. A failing task is reported as failed, not merely finished
payload = {ok: true, data: {active: [{id: 9, label: 'Restore shop', status: 'running'}]}};
await sleep(700);
payload = {ok: true, data: {active: [{id: 9, label: 'Restore shop', status: 'failed', message: 'disk full'}]}};
await sleep(900);

finished = await tab.evaluate(() => window.__finished);
check('reports a failure as failed', finished.length === 2 && finished[1].failed === true, JSON.stringify(finished[1]));
check('renders the failed state', (await html()).includes('is-failed'));

/*
 * A status the server invents and this build has never heard of must stop the
 * task, not keep it running forever · the running list is a closed set for
 * exactly this reason.
 */
payload = {ok: true, data: {active: [{id: 11, label: 'Odd one', status: 'running'}]}};
await sleep(700);
payload = {ok: true, data: {active: [{id: 11, label: 'Odd one', status: 'something-new'}]}};
await sleep(900);

finished = await tab.evaluate(() => window.__finished);
check('an unknown status counts as finished', finished.length === 3, JSON.stringify(finished.map(f => f.label)));

// 5. A label from the server is data, never markup
payload = {ok: true, data: {active: [{id: 21, label: '<img src=x onerror=window.__xss=1>', status: 'running'}]}};
await sleep(700);

check('escapes the label', (await html()).includes('&lt;img'), await html());
check('no script ran from it', await tab.evaluate(() => window.__xss === undefined));

// 6. Errors back off instead of hammering a server that is already struggling
payload = {ok: true, data: {active: []}};
await sleep(500);
status = 500;
hits = 0;
await sleep(3000);
check('backs off while the endpoint fails', hits > 0 && hits <= 5, `${hits} requests in 3s at a 300ms interval`);

status = 200;
await tab.evaluate(() => TaskMonitorComponent.refresh(document.querySelector('#strip')));
await sleep(500);
check('recovers once the endpoint answers again', (await tab.evaluate(() => {
  const i = TaskMonitorComponent.state.instances.get(document.querySelector('#strip'));
  return i ? i.errors : -1;
})) === 0);

// 7. Removing the element stops the timer — the leak that outlives a page
await tab.evaluate(() => document.querySelector('#strip').remove());
await sleep(400);
hits = 0;
await sleep(1500);
check('removing the element stops polling', hits === 0, `${hits} requests after removal`);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
