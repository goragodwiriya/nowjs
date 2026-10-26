/**
 * Directive bindings inside data-for snapshot only the top level of the row
 * state. They used to deep-copy the whole state per directive, rows included,
 * so a list of N rows copied the list N × directives times (an eleave report
 * of 580 rows froze the page for 5 s).
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

    // Copying the state walks into nested objects and runs this getter
    let nestedReads = 0;
    const meta = {};
    Object.defineProperty(meta, 'probe', {
        enumerable: true,
        get() {
            nestedReads++;
            return 1;
        }
    });

    const rows = Array.from({length: 600}, (_, i) => ({
        name: `Member ${i}`,
        topic: `Type ${i % 4}`,
        quota: i % 3 ? String(i) : '',
        note: i % 5 === 0 ? `n${i}` : '',
        color: i % 7 === 0 ? 'red' : ''
    }));

    const host = document.createElement('div');
    host.innerHTML = `<table><tbody data-for="item in rows">
    <template>
      <tr>
        <td data-text="item.name"></td>
        <td data-text="item.topic"></td>
        <td><span data-text="item.quota || 'Unlimited'"></span><small data-if="item.note" data-text="' (' + item.note + ')'"></small></td>
        <td data-style="{ color: item.color || 'inherit' }" data-text="summary.year"></td>
      </tr>
    </template>
  </tbody></table>`;
    document.body.appendChild(host);

    const started = performance.now();
    TemplateManager.processDataDirectives(host, {state: {rows, summary: {year: '2569'}, meta}});
    const elapsed = performance.now() - started;

    const cells = tr => Array.from(tr.children).map(td => td.textContent);
    const trs = Array.from(host.querySelectorAll('tbody tr'));
    const firstRender = {
        rowCount: trs.length,
        first: trs[0] ? cells(trs[0]) : [],
        firstNoteShown: trs[0]?.querySelector('small') !== null,
        secondNoteShown: trs[1]?.querySelector('small') !== null,
        firstColor: trs[0]?.children[3].style.color || '',
        secondColor: trs[1]?.children[3].style.color || '',
        last: trs.length ? cells(trs[trs.length - 1]) : []
    };

    // A later render with a new list replaces the rows
    TemplateManager.processDataDirectives(host, {state: {rows: [{name: 'New A'}, {name: 'New B'}], summary: {year: '2570'}, meta}});
    const rerendered = Array.from(host.querySelectorAll('tbody tr')).map(tr => tr.children[0].textContent);

    // A key the newer context no longer carries still comes from the snapshot
    const label = document.createElement('p');
    label.setAttribute('data-text', "title + ':' + count");
    document.body.appendChild(label);
    TemplateManager.processDataDirectives(label, {state: {title: 'A', count: 1}});
    TemplateManager.processDataDirectives(label, {state: {count: 2}});

    return {
        errors,
        elapsed,
        nestedReads,
        ...firstRender,
        rerendered,
        label: label.textContent
    };
});

await browser.close();

console.log(`  render 600 rows: ${Math.round(result.elapsed)} ms`);
const checks = [
    ['all rows render', result.rowCount === 600],
    ['row bindings read the row', result.first[0] === 'Member 0' && result.first[1] === 'Type 0'
        && result.last[0] === 'Member 599' && result.last[2] === '599'],
    ['row bindings read the parent state', result.first[3] === '2569'],
    ['fallback text and data-if inside a row', result.first[2] === 'Unlimited (n0)' && result.firstNoteShown && !result.secondNoteShown],
    ['data-style inside a row', result.firstColor === 'red' && result.secondColor === 'inherit'],
    ['snapshots do not walk nested state', result.nestedReads === 0],
    ['a new list replaces the rows', result.rerendered.join() === 'New A,New B'],
    ['a key missing from a newer context comes from the snapshot', result.label === 'A:2'],
    ['no binding errors occur', result.errors.length === 0]
];

checks.forEach(([name, passed]) => console.log(`  ${passed ? '✔' : '✘'} ${name}`));
console.log(`\nผ่าน ${checks.filter(([, passed]) => passed).length}/${checks.length}`);
process.exit(checks.every(([, passed]) => passed) ? 0 : 1);
