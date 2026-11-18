/**
 * `//host/x` and `/\host/x` start with a slash but name another site. The router
 * leaves such a link to the browser (it used to turn it into a route of this
 * app, `/host/x`, and show a not-found page), and a table row action whose URL
 * comes from the row goes there with the browser instead of RouterManager.
 * Links on this site still route.
 *
 * Runs the real built bundles in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

let origin;
let otherHost;
const shell = () => `<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body>
<nav>
  <a id="ext" href="//${otherHost}/x">ext</a>
  <a id="bs" href="/\\${otherHost}/y">bs</a>
  <a id="abs" href="http://${otherHost}/z">abs</a>
  <a id="in" href="/app/user">in</a>
</nav>
<main id="main"></main>
<table data-table="t1" data-source="/rows" data-page-size="0" data-row-actions='{"open": {"title": "Open", "className": "btn open", "method": "get", "url": "{link}"}}'>
<thead><tr><th data-field="id">id</th></tr></thead><tbody></tbody></table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__routed = [];
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: false},
    router: {enabled: true, base: '/app', mode: 'history', auth: {enabled: false},
      routes: {'/': {template: '${origin}/tpl/home.html'}, '/user': {template: '${origin}/tpl/user.html'}}}});
  const navigate = RouterManager.navigate.bind(RouterManager);
  RouterManager.navigate = (path, ...rest) => {
    window.__routed.push(String(path));
    return navigate(path, ...rest);
  };
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="t1"]'));
})();
</script></body></html>`;

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (path === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({success: true, data: [
      {id: 1, link: `//${otherHost}/row`},
      {id: 2, link: `/\\${otherHost}/row2`},
      {id: 3, link: '/app/user'}
    ]}));
  }
  if (path === '/core.js' || path === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript'});
    return res.end(readFileSync(DIST + (path === '/core.js' ? 'now.core.min.js' : 'now.table.min.js')));
  }
  if (path.startsWith('/tpl/')) {
    res.writeHead(200, {'Content-Type': 'text/html'});
    return res.end(`<p class="tpl">${path}</p>`);
  }
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end(shell());
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
origin = `http://127.0.0.1:${server.address().port}`;
// another origin: same host, another port nothing listens on (requests are aborted anyway)
otherHost = `127.0.0.1:${server.address().port + 1}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});

const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + detail : ''}`);
};

const open = async () => {
  const tab = await browser.newPage();
  const external = [];
  await tab.setRequestInterception(true);
  tab.on('request', r => {
    if (new URL(r.url()).origin !== origin) {
      external.push(r.url());
      r.abort();
    } else {
      r.continue();
    }
  });
  await tab.goto(origin + '/app/', {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await new Promise(r => setTimeout(r, 400));
  return {tab, external};
};

const run = async (label, click) => {
  const {tab, external} = await open();
  await tab.evaluate(() => { window.__routed = []; });
  await tab.evaluate(click);
  await new Promise(r => setTimeout(r, 600));
  // The page is gone when the browser left it (an aborted navigation shows an
  // error page): then nothing was routed
  let routed = [];
  try {
    routed = (await tab.evaluate(() => window.__routed)) || [];
  } catch (e) {
    routed = [];
  }
  await tab.close();
  return {label, external, routed};
};

console.log('links the router sees');
for (const [id, path] of [['ext', '/x'], ['bs', '/y'], ['abs', '/z']]) {
  const r = await run(id, new Function(`document.getElementById('${id}').click()`));
  check(`${id}: the browser goes to the other site`, r.external.some(u => u.endsWith(path)), JSON.stringify(r));
  check(`${id}: the router does not take it as a route`, r.routed.length === 0, JSON.stringify(r.routed));
}
{
  const r = await run('in', () => document.getElementById('in').click());
  check('a link on this site still routes', r.routed.length > 0 && r.external.length === 0, JSON.stringify(r));
}

console.log('row actions');
for (const [i, path] of [[0, '/row'], [1, '/row2']]) {
  const r = await run('row' + i, new Function(`document.querySelectorAll('[data-table="t1"] tbody tr')[${i}].querySelector('.btn.open, [data-action="open"]').click()`));
  check(`row ${i + 1}: the browser goes to the other site`, r.external.some(u => u.endsWith(path)), JSON.stringify(r));
  check(`row ${i + 1}: RouterManager is not asked to route it`, !r.routed.some(p => p.includes(otherHost)), JSON.stringify(r.routed));
}
{
  const r = await run('row3', () => document.querySelectorAll('[data-table="t1"] tbody tr')[2].querySelector('.btn.open, [data-action="open"]').click());
  check('a row path on this site still goes through RouterManager', r.routed.some(p => p.startsWith('/app/user')), JSON.stringify(r));
}

await browser.close();
server.close();
const failed = results.filter(x => !x).length;
console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
