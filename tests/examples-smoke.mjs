/**
 * Smoke test of every page in examples/: opens it in a real Chrome through the
 * local Apache (http://localhost/now.js/nowjs/examples/...) and reports
 *   - uncaught exceptions and console.error output,
 *   - requests that fail or answer >= 400 (same origin and external apart).
 * The page is scrolled to the bottom and back so scroll/reveal code runs too.
 *
 *   cd tests && node examples-smoke.mjs [name ...]     # default: every example
 *   BASE=http://localhost/now.js/nowjs/examples node examples-smoke.mjs
 *
 * Exit code 1 when any same-origin page has a problem. External services
 * (reqres.in, jsonplaceholder, dicebear, ...) are listed but do not fail the run.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXAMPLES = path.join(ROOT, 'examples');
const BASE = (process.env.BASE || 'http://localhost/now.js/nowjs/examples').replace(/\/$/, '');
const only = process.argv.slice(2);

const pages = [];
for (const name of fs.readdirSync(EXAMPLES).sort()) {
  const dir = path.join(EXAMPLES, name);
  if (!fs.statSync(dir).isDirectory() || (only.length && !only.includes(name))) continue;
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.html')).sort()) pages.push({name, file: f});
}

const origin = new URL(BASE).origin;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox']
});

let failed = 0;
for (const p of pages) {
  const page = await browser.newPage();
  await page.setViewport({width: 1280, height: 900});
  const errors = [];
  const external = [];
  page.on('pageerror', e => errors.push(`exception: ${String(e.message || e).split('\n')[0]}`));
  page.on('console', m => {
    if (m.type() === 'error') {
      const text = m.text();
      // the failed request is reported below with its URL
      if (!/^Failed to load resource/.test(text)) errors.push(`console.error: ${text.slice(0, 200)}`);
    }
  });
  const note = (url, why) => (url.startsWith(origin) ? errors : external).push(`${why} ${url.replace(origin, '')}`);
  page.on('requestfailed', r => {
    const why = r.failure()?.errorText || 'failed';
    if (why !== 'net::ERR_ABORTED') note(r.url(), why);
  });
  page.on('response', r => {
    if (r.status() >= 400) note(r.url(), String(r.status()));
  });

  const url = `${BASE}/${p.name}/${p.file === 'index.html' ? '' : p.file}`;
  try {
    await page.goto(url, {waitUntil: 'networkidle0', timeout: 20000});
    await page.evaluate(async () => {
      const step = Math.max(300, window.innerHeight / 2);
      for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
        window.scrollTo(0, y);
        await new Promise(r => setTimeout(r, 40));
      }
      window.scrollTo(0, 0);
    });
    await new Promise(r => setTimeout(r, 600));
  } catch (e) {
    errors.push(`load: ${e.message.split('\n')[0]}`);
  }
  await page.close();

  const uniqErrors = [...new Set(errors)];
  const uniqExternal = [...new Set(external)];
  if (uniqErrors.length) failed++;
  const label = `${p.name}/${p.file}`;
  if (!uniqErrors.length && !uniqExternal.length) {
    console.log(`ok   ${label}`);
  } else {
    console.log(`${uniqErrors.length ? 'FAIL' : 'ok* '} ${label}`);
    uniqErrors.forEach(e => console.log(`       ${e}`));
    uniqExternal.forEach(e => console.log(`       (external) ${e}`));
  }
}
await browser.close();
console.log(`\n${pages.length - failed}/${pages.length} pages without same-origin errors`);
process.exit(failed ? 1 : 0);
