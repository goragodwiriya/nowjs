/**
 * A data-class ternary may leave one branch empty ("cond ? 'x' : ''"). Before
 * this it fell through to the "class:expression" form and threw
 * InvalidCharacterError on classList with the whole expression as a token.
 */

import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const corePath = process.env.NOW_CORE
    ? resolve(process.env.NOW_CORE)
    : fileURLToPath(new URL('../Now/dist/now.core.min.js', import.meta.url));

const browser = await puppeteer.launch({
    executablePath: '/usr/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setContent('<!doctype html><html><body></body></html>');
await page.addScriptTag({path: corePath});

const result = await page.evaluate(() => {
    const errors = [];
    ErrorManager.handle = error => errors.push(String(error?.message || error));
    TemplateManager.setupReactiveUpdate = () => {};

    const host = document.createElement('div');
    host.innerHTML = `<i id="t" data-class="on == 1 ? 'yes' : ''"></i>
      <i id="f" data-class="off == 1 ? 'yes' : ''"></i>
      <i id="e" class="keep" data-class="on == 1 ? '' : 'no'"></i>`;
    document.body.appendChild(host);
    const state = {on: 1, off: 0};
    TemplateManager.processDataDirectives(host, {state, data: state, computed: {}});

    return {
        trueBranch: host.querySelector('#t').className,
        falseBranch: host.querySelector('#f').className,
        emptyTrueBranch: host.querySelector('#e').className,
        errors
    };
});

await browser.close();

const failures = [];
if (result.trueBranch !== 'yes') failures.push(`true branch: "${result.trueBranch}"`);
if (result.falseBranch !== '') failures.push(`empty false branch: "${result.falseBranch}"`);
if (result.emptyTrueBranch !== 'keep') failures.push(`empty true branch: "${result.emptyTrueBranch}"`);
if (result.errors.length) failures.push(`errors: ${result.errors.join(' | ')}`);

if (failures.length) {
    console.error('data-class-empty-branch FAILED\n  ' + failures.join('\n  '));
    process.exit(1);
}
console.log('data-class-empty-branch: all checks passed');
