/**
 * ReactiveManager keeps two shapes in one dependency table:
 *   - a reactive object's id → Map(prop → Set of effects)          (track / watch)
 *   - a component's "id:prop" → Set of computations                 (addDependency)
 * sweepDeadWatchers() and cleanupEffect() walked every entry as a Map, so the
 * first component entry threw "… is not iterable" from the cleanup timer, from
 * pagehide and from visibilitychange — every page with a reactive component
 * (examples/counter, todo, social-media) raised an uncaught TypeError.
 *
 *   cd tests && node reactive-sweep-shapes.mjs
 */
import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = process.env.NOW_CORE || '../Now/dist/now.core.min.js';
const server = http.createServer((req, res) => {
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'text/javascript'});
    return res.end(readFileSync(CORE));
  }
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.end('<!doctype html><html><body><script src="/core.js"></script></body></html>');
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
const page = await browser.newPage();
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url, {waitUntil: 'load'});

const result = await page.evaluate(() => {
  const RM = window.ReactiveManager;
  const deps = RM.state.dependencies;
  const live = {fn() {}, dependencies: new Set()};
  const dead = {fn: null};
  const effect = () => {};
  deps.set('cmp1:count', new Set([live, dead]));
  deps.set('cmp1:empty', new Set([dead]));
  deps.set('obj1', new Map([['name', new Set([effect])]]));
  deps.set('cmp2:total', new Set([effect]));
  const out = {};
  try {
    RM.sweepDeadWatchers();
    out.sweep = 'ok';
  } catch (e) {
    out.sweep = e.message;
  }
  out.liveKept = deps.get('cmp1:count')?.has(live) === true;
  out.deadDropped = deps.get('cmp1:count')?.has(dead) === false;
  out.emptyKeyDropped = !deps.has('cmp1:empty');
  out.mapKept = deps.get('obj1')?.get('name')?.has(effect) === true;
  try {
    RM.cleanupEffect(effect);
    out.cleanup = 'ok';
  } catch (e) {
    out.cleanup = e.message;
  }
  out.effectGoneFromMap = !deps.has('obj1');
  out.effectGoneFromSet = !deps.has('cmp2:total');
  // the page-lifecycle path that fired on every example page
  try {
    window.dispatchEvent(new Event('pagehide'));
    out.pagehide = 'ok';
  } catch (e) {
    out.pagehide = e.message;
  }
  return out;
});

await browser.close();
server.close();

const checks = [
  ['sweepDeadWatchers() walks a Set entry without throwing', result.sweep === 'ok', result.sweep],
  ['a valid computation stays', result.liveKept],
  ['an invalid computation is dropped', result.deadDropped],
  ['a key left empty is dropped', result.emptyKeyDropped],
  ['the Map shape is untouched', result.mapKept],
  ['cleanupEffect() walks a Set entry without throwing', result.cleanup === 'ok', result.cleanup],
  ['cleanupEffect() removes the effect from the Map shape', result.effectGoneFromMap],
  ['cleanupEffect() removes the effect from the Set shape', result.effectGoneFromSet],
  ['pagehide sweep raises nothing', result.pagehide === 'ok' && pageErrors.length === 0, pageErrors.join('; ')]
];
let failed = 0;
for (const [name, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && info ? ` — ${info}` : ''}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
