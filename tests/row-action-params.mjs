/**
 * Proof that a row action's `params` reach the server as the row actually holds them.
 *
 * **The bug this pins down.** `params` and `url` shared one interpolator, and it
 * applied `encodeURIComponent` — correct for a URL, where the value becomes part of
 * the string, and wrong for a param, which is escaped again on the way out (by
 * `URLSearchParams` for a navigating GET, and by the HTTP client's own query
 * serializer for GET/DELETE). A value with nothing reserved in it survived that
 * unharmed, which is why nobody noticed: every existing caller passed an id or a
 * domain name. Anything holding a `/`, a space or an `&` arrived doubly escaped —
 * `service/logs/a.log` became `service%2Flogs%2Fa.log`, naming no file that exists.
 *
 * Runs the real built bundle in a real browser against a real HTTP server, so what
 * is proven here is what ships.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const BUNDLE = '../Now/dist/now.table.min.js';
const CORE = '../Now/dist/now.core.min.js';

// What a file-integrity row carries: a path with slashes, a name with a space,
// and one with an ampersand — the three shapes double-escaping mangles
const ROWS = [
  {id: 1, account: 'service', file_path: 'service/logs/access.log', count: 7, watched: true,
   evidence_url: '/landing?source=site:3:access&x=a b'},
  {id: 2, account: 'demo', file_path: 'demo/public_html/my notes & drafts.php', count: 0, watched: true,
   evidence_url: '/landing?source=site:9:error'},
  // No action applies to this one — the row that used to come out a cell short
  {id: 3, account: 'quiet', file_path: 'quiet/public_html/index.php', count: 0, watched: false,
   evidence_url: '/landing?source=site:5:access'},
];

/** Every request the actions made, as the server actually saw it */
let seen = [];

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<table data-table="probe" data-source="/rows" data-page-size="0" data-row-actions='{
  "peek": {
    "title": "Peek",
    "className": "btn peek",
    "method": "get",
    "navigate": false,
    "url": "/peek",
    "params": {"path": "{file_path}", "who": "{account}"}
  },
  "drop": {
    "title": "Drop",
    "className": "btn drop",
    "method": "delete",
    "url": "/drop",
    "params": {"items": "{file_path}"}
  },
  "touch": {
    "title": "Touch",
    "className": "btn touch",
    "method": "post",
    "url": "/touch",
    "params": {"path": "{file_path}", "count": "{count}", "watched": "{watched}"}
  },
  "log": {
    "title": "Log",
    "className": "btn log",
    "method": "get",
    "url": "{evidence_url}"
  },
  "scoped": {
    "title": "Scoped",
    "className": "btn scoped",
    "method": "get",
    "navigate": false,
    "url": "/scoped/{file_path}"
  },
  "hidden": {
    "title": "Hidden",
    "className": "btn hidden-one",
    "method": "post",
    "url": "/never",
    "condition": "\${count > 0}"
  }
}'>
  <thead><tr><th data-field="account">account</th><th data-field="file_path">path</th></tr></thead>
  <tbody></tbody>
</table>
<table data-table="sparse" data-source="/rows" data-page-size="0" data-row-actions='{
  "only": {"title": "Only", "className": "btn only", "method": "post", "url": "/touch", "condition": "\${watched}"}
}'>
  <thead><tr><th data-field="account">account</th><th data-field="count">count</th></tr></thead>
  <tbody></tbody>
</table>
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}});
  await TableManager.init();
  TableManager.initTable(document.querySelector('[data-table="probe"]'));
  TableManager.initTable(document.querySelector('[data-table="sparse"]'));
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');

  if (url.pathname === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (url.pathname === '/core.js' || url.pathname === '/table.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(url.pathname === '/core.js' ? CORE : BUNDLE, 'utf8'));
  }
  if (url.pathname === '/rows') {
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({ok: true, data: ROWS}));
  }
  if (url.pathname === '/peek' || url.pathname === '/drop' || url.pathname === '/touch' || url.pathname === '/never') {
    let body = '';
    req.on('data', c => {body += c;});

    return req.on('end', () => {
      // The server reads what it was sent, decoded exactly once — the same thing
      // PHP does with $_GET and a JSON body
      seen.push({
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        body: body === '' ? null : JSON.parse(body),
      });
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({ok: true, message: 'done'}));
    });
  }
  if (url.pathname === '/landing') {
    seen.push({path: url.pathname, query: Object.fromEntries(url.searchParams), body: null});
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end('<!doctype html><title>landed</title>ok');
  }
  if (url.pathname.startsWith('/scoped/')) {
    seen.push({path: url.pathname, query: Object.fromEntries(url.searchParams), body: null});
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end(JSON.stringify({ok: true, message: 'done'}));
  }
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204);
    return res.end();
  }
  console.log('404:', req.url);
  res.writeHead(404);
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
tab.on('console', m => m.type() === 'error' && errors.push(m.text()));

// Every action here confirms before it fires; the dialog is not what is under test
await tab.evaluateOnNewDocument(() => {
  window.confirm = () => true;
});

await tab.goto(base, {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Presses one action on one row and hands back what the server saw */
async function press(rowIndex, className) {
  seen = [];
  await tab.evaluate((i, cls) => {
    document.querySelectorAll('[data-table="probe"] tbody tr')[i].querySelector('.' + cls).click();
  }, rowIndex, className);
  await sleep(500);

  return seen[0] || null;
}

// 1. A GET action's params — the path must arrive with its slashes intact
const peek = await press(0, 'peek');
check(
  'GET params arrive decoded exactly once',
  peek?.query.path === 'service/logs/access.log' && peek?.query.who === 'service',
  JSON.stringify(peek?.query),
);

// 2. A DELETE action's params travel in the query string too, and must not be
//    escaped twice on the way there either
const drop = await press(0, 'drop');
check(
  'DELETE params arrive decoded exactly once',
  drop?.query.items === 'service/logs/access.log',
  JSON.stringify(drop?.query),
);

// 3. A POST body was never double-escaped, and must stay that way
const touch = await press(0, 'touch');
check(
  'POST params still arrive untouched',
  touch?.body?.path === 'service/logs/access.log',
  JSON.stringify(touch?.body),
);

// 4. A lone {field} hands back the value itself, so a number stays a number
check(
  'a whole-value {field} keeps its type',
  touch?.body?.count === 7 && touch?.body?.watched === true,
  `count=${JSON.stringify(touch?.body?.count)} watched=${JSON.stringify(touch?.body?.watched)}`,
);

// 5. Spaces and ampersands are the other two shapes double-escaping mangles
const awkward = await press(1, 'peek');
check(
  'a space and an ampersand survive as themselves',
  awkward?.query.path === 'demo/public_html/my notes & drafts.php',
  JSON.stringify(awkward?.query),
);

// 6. `condition` still decides whether the button is drawn at all
const hiddenButtons = await tab.evaluate(() => Array.from(document.querySelectorAll('[data-table="probe"] tbody tr'))
  .map(tr => !!tr.querySelector('.hidden-one')));
check(
  'condition still hides the button on the rows it is false for',
  hiddenButtons[0] === true && hiddenButtons.slice(1).every(v => v === false),
  JSON.stringify(hiddenButtons),
);

// 7. A placeholder that is *part* of a URL is one component of it, and must still
//    be escaped — otherwise a value with a slash in it invents a path segment
const scoped = await press(0, 'scoped');
check(
  'a placeholder inside a URL is still escaped',
  scoped?.path === '/scoped/service%2Flogs%2Faccess.log',
  scoped?.path,
);

// 8. A placeholder that IS the whole URL is not a component — escaping it turns the
//    address into one opaque word that no longer even starts with "/"
//
//    Asserted on the address handed to the router, because that is the address:
//    a same-origin `/` link goes to `RouterManager.navigate`, and where it ends up
//    after that depends on which routes the page happens to have registered.
//
//    Wrapped, because the failure mode is a navigation: an escaped URL no longer
//    starts with `/`, the router declines it, and the browser resolves the wreckage
//    against the current page — which tears down the context this is running in.
const dest = await tab.evaluate(async () => {
  const real = RouterManager.navigate;
  let asked = null;

  RouterManager.navigate = (to) => {asked = to;};
  document.querySelectorAll('[data-table="probe"] tbody tr')[0].querySelector('.log').click();
  await new Promise(r => setTimeout(r, 400));
  RouterManager.navigate = real;

  return asked;
}).catch(() => null);
check(
  'a whole-value URL is followed as it stands',
  dest === '/landing?source=site:3:access&x=a b',
  JSON.stringify(dest),
);

// 9. A row no action applies to must still be as wide as the header · the cell was
//    skipped entirely, so the row stopped one column short of the table's edge
const shape = await tab.evaluate(() => {
  const t = document.querySelector('[data-table="sparse"]');

  return {
    headers: t.querySelectorAll('thead tr:last-child th').length,
    rows: Array.from(t.querySelectorAll('tbody tr')).map(tr => ({
      cells: tr.querySelectorAll('td').length,
      buttons: tr.querySelectorAll('.only').length,
    })),
  };
});
check(
  'a row with no applicable action is still a full row',
  shape.rows.length > 0 && shape.rows.every(r => r.cells === shape.headers),
  `${shape.headers} headers vs cells ` + JSON.stringify(shape.rows.map(r => r.cells)),
);
check(
  'and the condition still decided which rows get the button',
  JSON.stringify(shape.rows.map(r => r.buttons)) === '[1,1,0]',
  JSON.stringify(shape.rows.map(r => r.buttons)),
);

check('no JS errors during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
