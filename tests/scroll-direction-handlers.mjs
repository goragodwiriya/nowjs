/**
 * ScrollManager events, as examples/scrollmanager and examples/parallax use them.
 *
 * 1. scroll:direction never said "down": the scroll handler stored the new
 *    position in lastPosition first and then compared the page offset with it,
 *    so the two were always equal and the direction stayed "up".
 * 2. ScrollManager.on(event, handler) also added the handler to EventManager,
 *    and emit() broadcasts there too — the handler ran twice, the second time
 *    with the EventManager context ({event, data, ...}) instead of the payload,
 *    so `({direction}) => …` and `({position}) => …` got undefined.
 *
 *   cd tests && node scroll-direction-handlers.mjs
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
  res.end(`<!doctype html><html><body style="margin:0">
    <div style="height:5000px">tall</div>
    <script src="/core.js"></script>
    <script>
      window.ready = Now.init({environment: 'production', scroll: {enabled: true}}).then(() => true);
    </script></body></html>`);
});
await new Promise(r => server.listen(0, r));
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox']});
const page = await browser.newPage();
await page.setViewport({width: 1000, height: 800});
const pageErrors = [];
page.on('pageerror', e => pageErrors.push(e.message));
await page.goto(url, {waitUntil: 'load'});
await page.evaluate(() => window.ready);

const result = await page.evaluate(async () => {
  const step = ms => new Promise(r => setTimeout(r, ms));
  const directions = [];
  const directionArgs = [];
  const progressArgs = [];
  ScrollManager.on('scroll:direction', payload => {
    directionArgs.push(payload);
    directions.push(payload?.direction);
  });
  const onProgress = payload => progressArgs.push(payload);
  ScrollManager.on('scroll:progress', onProgress);
  let viaEventManager = 0;
  EventManager.on('scroll:direction', ({data}) => {
    if (data?.direction) viaEventManager++;
  });

  for (let y = 100; y <= 2000; y += 100) {
    window.scrollTo(0, y);
    await step(40);
  }
  for (let y = 1900; y >= 500; y -= 100) {
    window.scrollTo(0, y);
    await step(40);
  }
  await step(200);

  ScrollManager.off('scroll:progress', onProgress);
  const progressBeforeOff = progressArgs.length;
  window.scrollTo(0, 100);
  await step(200);

  return {
    directions,
    everyDirectionPayload: directionArgs.every(p => p && typeof p.direction === 'string' && !('event' in p)),
    everyProgressPayload: progressArgs.every(p => p && typeof p.progress === 'number' && typeof p.position?.y === 'number'),
    progressCount: progressBeforeOff,
    progressAfterOff: progressArgs.length - progressBeforeOff,
    viaEventManager
  };
});

await browser.close();
server.close();

const checks = [
  ['scroll:direction reports down, then up', JSON.stringify(result.directions) === '["down","up"]', JSON.stringify(result.directions)],
  ['ScrollManager.on handlers get the payload, once per emit', result.everyDirectionPayload],
  ['scroll:progress payload is {position, progress, total}', result.progressCount > 0 && result.everyProgressPayload, `${result.progressCount} calls`],
  ['off() stops the handler', result.progressAfterOff === 0, `${result.progressAfterOff} calls after off`],
  ['EventManager listeners still hear ScrollManager events ({data})', result.viaEventManager === 2, String(result.viaEventManager)],
  ['no page errors', pageErrors.length === 0, pageErrors.join('; ')]
];
let failed = 0;
for (const [name, ok, info] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && info ? ` — ${info}` : ''}`);
  if (!ok) failed++;
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
process.exit(failed ? 1 : 0);
