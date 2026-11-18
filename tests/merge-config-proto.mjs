/**
 * Now.mergeConfig() ignores __proto__, constructor and prototype keys
 * (Now.js audit 2026-11-10: the one merge HANDOFF found unguarded).
 *
 * Now.init(), RouterManager, MenuManager, ScrollManager and TemplateManager
 * merge their options with it. A key "__proto__" in the options (JSON.parse
 * makes it an own key) was assigned to the merged object, which then inherited
 * whatever that object held: {"__proto__": {"debug": true}} gave a config whose
 * debug was true without having the key.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const server = http.createServer((req, res) => {
  if (req.url.split('?')[0] === '/now.core.min.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
  res.end('<!doctype html><meta charset="utf-8"><main id="main"></main><script src="/now.core.min.js"></script>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const results = [];
const check = (name, pass, detail) => {
  results.push(pass);
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${!pass && detail !== undefined ? '  — ' + JSON.stringify(detail) : ''}`);
};
const tab = await browser.newPage();
await tab.goto(`http://127.0.0.1:${server.address().port}/`, {waitUntil: 'load'});

const s = await tab.evaluate(() => {
  const options = JSON.parse('{"router": {"enabled": true, "__proto__": {"hijacked": 1}}, "__proto__": {"debug": true, "polluted": 1}, "constructor": {"prototype": {"polluted": 2}}}');
  const merged = Now.mergeConfig({debug: false, router: {enabled: false}}, options);
  return {
    protoIsObject: Object.getPrototypeOf(merged) === Object.prototype,
    routerProtoIsObject: Object.getPrototypeOf(merged.router) === Object.prototype,
    debug: merged.debug,
    polluted: merged.polluted,
    hijacked: merged.router.hijacked,
    routerEnabled: merged.router.enabled,
    constructorKept: merged.constructor === Object,
    global: ({}).polluted
  };
});
check('a __proto__ key does not change what the merged config inherits', s.protoIsObject && s.polluted === undefined && s.debug === false, s);
check('not in nested sections either', s.routerProtoIsObject && s.hijacked === undefined, s);
check('a constructor key is not merged', s.constructorKept, s);
check('the other keys still merge', s.routerEnabled === true, s);
check('Object.prototype is untouched', s.global === undefined, s);

await browser.close();
server.close();
const failed = results.filter(r => !r).length;
console.log(`\n${failed ? failed + ' of ' + results.length + ' checks failed' : 'all ' + results.length + ' checks passed'}`);
process.exit(failed ? 1 : 0);
