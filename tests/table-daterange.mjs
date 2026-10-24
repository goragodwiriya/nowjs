/**
 * Proof that a date range filter declared on a table column works without a
 * filter form, and that the date picker underneath it behaves as documented.
 *
 *   <th data-field="created_at" data-filter="true" data-type="daterange"
 *       data-range-names="from,to" data-range-presets="today,7d" data-range-max-days="31">
 *
 * Runs the real built bundle in a real browser (TZ Asia/Bangkok, east of UTC,
 * where the old min-date comparison went wrong) against a real HTTP server.
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const CORE = '../Now/dist/now.core.min.js';
const BUNDLE = '../Now/dist/now.table.min.js';
const CSS = '../Now/dist/now.core.min.css';

const requests = [];

const boot = (body, extra = '') => `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title><link rel="stylesheet" href="/core.css"></head><body>
${body}
<script src="/core.js"></script>
<script src="/table.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', allowEval: false, auth: {enabled: false}, i18n: {enabled: true, availableLocales: ['en', 'th']}});
  await TableManager.init();
  document.querySelectorAll('[data-table]').forEach(t => TableManager.initTable(t));
  ${extra}
})();
</script>
</body></html>`;

const logsTable = `<div class="tablebody">
<table data-table="logs" data-source="/rows" data-page-size="10">
  <thead><tr>
    <th data-field="id">id</th>
    <th data-field="created_at" data-filter="true" data-type="daterange" data-range-names="from,to"
        data-range-presets="today,7d,thismonth" data-range-max-days="31" data-label="Date">Created</th>
    <th data-field="due" data-filter="true" data-type="date" data-label="Due">Due</th>
    <th data-field="status" data-filter="true" data-type="select" data-options='{"0":"Off","1":"On"}' data-show-all="true" data-all-value="">Status</th>
  </tr></thead>
  <tbody></tbody>
</table></div>`;

const pages = {
  '/list': boot(logsTable),
  '/two': boot(logsTable + `<table data-table="other" data-source="/rows2" data-page-size="10">
    <thead><tr><th data-field="id">id</th></tr></thead><tbody></tbody></table>`),
  '/local': boot(`<table data-table="local" data-page-size="0">
    <thead><tr>
      <th data-field="id">id</th>
      <th data-field="created_at" data-filter="true" data-type="daterange">Created</th>
      <th data-field="due" data-filter="true" data-type="date">Due</th>
    </tr></thead><tbody></tbody></table>`, `
    TableManager.setData('local', [
      {id: 1, created_at: '2026-10-14 23:59:00', due: '2026-10-20'},
      {id: 2, created_at: '2026-10-15 00:00:00', due: '2026-10-20 08:00:00'},
      {id: 3, created_at: '2026-10-15 18:30:00', due: '2026-10-21'},
      {id: 4, created_at: '2026-10-16', due: null}
    ]);`),
  '/form': boot(`<form id="f">
      <span class="form-control"><input type="date" id="period" name="period_from" data-range-end="period_to"></span>
      <span class="form-control"><input type="date" id="opens" name="opens" min="2026-10-16" max="2026-10-20"></span>
    </form>`, `
    window.__changes = {from: 0, to: 0, range: 0};
    const f = document.getElementById('f');
    ElementManager.scan(f); // what FormManager does for its form
    f.addEventListener('change', e => {
      if (e.target.name === 'period_from') window.__changes.from++;
      if (e.target.name === 'period_to') window.__changes.to++;
    });
    f.addEventListener('gdatetime:rangechange', e => { window.__changes.range++; window.__lastRange = e.detail; });`)
};

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  if (pages[path]) {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(pages[path]);
  }
  if (path === '/core.js' || path === '/table.js' || path === '/core.css') {
    const file = {'/core.js': CORE, '/table.js': BUNDLE, '/core.css': CSS}[path];
    res.writeHead(200, {'Content-Type': path.endsWith('.css') ? 'text/css' : 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(file, 'utf8'));
  }
  if (path.startsWith('/language/')) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    return res.end('{}');
  }
  if (path === '/rows' || path === '/rows2') {
    if (path === '/rows') requests.push(new URL(req.url, 'http://x').searchParams);
    res.writeHead(200, {'Content-Type': 'application/json', 'Cache-Control': 'no-store'});
    return res.end(JSON.stringify({success: true, data: [{id: 1, created_at: '2026-10-15 10:00:00', due: '2026-10-20', status: 1}], meta: {total: 1}}));
  }
  res.writeHead(204);
  res.end();
});

await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
  env: {...process.env, TZ: 'Asia/Bangkok'}
});

const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(String(e)));
tab.on('console', m => ['error', 'warn'].includes(m.type()) && errors.push(`${m.type()}: ${m.text()}`));

const results = [];
const check = (name, pass, detail) => {
  results.push({name, pass, detail});
  console.log(`${pass ? '  ✔' : '  ✘'} ${name}${detail ? '  — ' + detail : ''}`);
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const open = async url => {
  await tab.goto(base + url, {waitUntil: 'networkidle0'});
  await tab.evaluate(() => window.__ready);
  await sleep(200);
};
const last = () => requests[requests.length - 1] || new URLSearchParams();
const show = p => `from=${p.get('from')} to=${p.get('to')}`;

// Helpers that act on the range picker of the logs table
const ui = {
  picker: (tableId = 'logs', key = 'from') => tab.evaluate((tableId, key) => {
    const p = TableManager.state.tables.get(tableId).filterElements.get(key).gdatetime;
    return {
      open: p.isOpen,
      side: p.range.side,
      display: p.displayButton.firstChild.textContent,
      start: p.hiddenInput.value,
      end: p.range.endInput.value,
      month: p.currentMonth,
      year: p.currentYear
    };
  }, tableId, key),
  toggle: () => tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.displayButton.click()),
  day: n => tab.evaluate(n => {
    const p = TableManager.state.tables.get('logs').filterElements.get('from').gdatetime;
    const cell = [...p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)')].find(b => b.textContent === String(n));
    cell.click();
  }, n),
  hover: n => tab.evaluate(n => {
    const p = TableManager.state.tables.get('logs').filterElements.get('from').gdatetime;
    const cell = [...p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)')].find(b => b.textContent === String(n));
    cell.dispatchEvent(new MouseEvent('mouseenter'));
  }, n),
  classes: () => tab.evaluate(() => {
    const p = TableManager.state.tables.get('logs').filterElements.get('from').gdatetime;
    const out = {};
    p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)').forEach(b => {
      const marks = ['range-start', 'range-end', 'in-range', 'in-range-preview', 'disabled'].filter(c => b.classList.contains(c));
      if (marks.length) out[b.textContent] = marks.join(' ');
    });
    return out;
  }),
  tab: (side, part = 'pick') => tab.evaluate((side, part) => {
    const t = TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.range.tabs[side];
    (part === 'clear' ? t.clear : t.tab.querySelector('.daterange-pick')).click();
  }, side, part),
  escape: async () => {
    await tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.displayButton.focus());
    await tab.keyboard.press('Escape');
  }
};

await open('/list');
const ym = await ui.picker();
const iso = d => `${ym.year}-${String(ym.month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

// ------------------------------------------------------------ built from <th>
const built = await tab.evaluate(() => {
  const nav = document.querySelector('.table_nav');
  const control = [...nav.querySelectorAll('.filter-control')].find(c => c.querySelector('[name="from"]'));
  return {
    label: control?.querySelector('label')?.textContent,
    from: !!control?.querySelector('input[type="hidden"][name="from"]'),
    to: !!control?.querySelector('input[type="hidden"][name="to"]'),
    display: control?.querySelector('.dropdown-display')?.textContent,
    controls: [...nav.querySelectorAll('.filter-control label')].map(l => l.textContent)
  };
});
check('daterange <th> builds one picker in a labelled .filter-control', built.label === 'Date' && built.from && built.to, JSON.stringify(built));
check('empty range shows the placeholder', built.display === 'Choose a date range', built.display);
check('date and select filters still get their own labelled controls', built.controls.join('|') === 'Date|Due|Status', built.controls.join('|'));

// ------------------------------------------------------------ picking a range
requests.length = 0;
await ui.toggle();
await ui.day(10);
let p = await ui.picker();
check('first day: picker stays open on the To side, nothing sent yet', p.open && p.side === 'end' && p.start === iso(10) && requests.length === 0, JSON.stringify(p) + ` requests=${requests.length}`);

await ui.hover(14);
let marks = await ui.classes();
check('hovering a day previews the range', marks['10'] === 'range-start' && marks['11'] === 'in-range-preview' && marks['14'] === 'in-range-preview', JSON.stringify(marks));

await ui.day(14);
await sleep(300);
p = await ui.picker();
check('second day closes the picker and reloads ONCE with from + to', !p.open && requests.length === 1 && last().get('from') === iso(10) && last().get('to') === iso(14),
  `${requests.length} request(s) ${show(last())}`);
check('button shows the range', /10 .* – 14 /.test(p.display), p.display);
const address = await tab.evaluate(() => location.search);
const q = new URLSearchParams(address);
check('both parameters go to the address bar', q.get('from') === iso(10) && q.get('to') === iso(14), address);

await ui.toggle();
marks = await ui.classes();
check('reopening marks start, end and the days between', marks['10'] === 'range-start' && marks['12'] === 'in-range' && marks['14'] === 'range-end', JSON.stringify(marks));
p = await ui.picker();
check('a complete range reopens on the From side (new range)', p.side === 'start', p.side);

// clicking a day before the start on the To side swaps
requests.length = 0;
await ui.day(20);
await ui.day(5);
await sleep(300);
check('a To day before the start becomes the start (swap)', last().get('from') === iso(5) && last().get('to') === iso(20) && requests.length === 1, `${requests.length} ${show(last())}`);

// ------------------------------------------------------------ one side only
requests.length = 0;
await ui.toggle();
await ui.tab('end', 'clear');
await ui.escape();
await sleep(300);
p = await ui.picker();
check('× on To + Esc: only "from" is sent', requests.length === 1 && last().get('from') === iso(5) && last().get('to') === '', `${requests.length} ${show(last())}`);
check('button reads "From <date>"', /^From 5 /.test(p.display), p.display);

requests.length = 0;
await ui.toggle();
await ui.tab('start', 'clear');
await ui.tab('end', 'pick');
await ui.day(25);
await sleep(300);
p = await ui.picker();
check('× on From, then a day on To: only "to" is sent', !p.open && requests.length === 1 && last().get('from') === '' && last().get('to') === iso(25), `${requests.length} ${show(last())}`);
check('button reads "To <date>"', /^To 25 /.test(p.display), p.display);

requests.length = 0;
await ui.toggle();
await ui.escape();
await sleep(300);
check('opening and closing without a change sends nothing', requests.length === 0, `${requests.length} request(s)`);

// ------------------------------------------------------------ max days
await ui.toggle();
await ui.day(1);
await tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.nextButton.click());
const nextMonth = await ui.classes();
await ui.escape();
await sleep(300);
check('max-days 31 from day 1: day 1 of next month is disabled', (nextMonth['1'] || '').includes('disabled'), JSON.stringify(nextMonth).slice(0, 120));

// ------------------------------------------------------------ presets, clear
requests.length = 0;
await ui.toggle();
const presets = await tab.evaluate(() => [...TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.dropdown.querySelectorAll('.daterange-preset')].map(b => b.textContent));
check('data-range-presets builds the preset buttons', presets.join('|') === 'Today|Last 7 days|This month', presets.join('|'));
await tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.dropdown.querySelector('[data-preset="7d"]').click());
await sleep(300);
const expected7 = await tab.evaluate(() => {
  const t = new Date();
  const f = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {from: f(new Date(t.getFullYear(), t.getMonth(), t.getDate() - 6)), to: f(t)};
});
p = await ui.picker();
check('preset "Last 7 days" sets both, closes, reloads once', !p.open && requests.length === 1 && last().get('from') === expected7.from && last().get('to') === expected7.to, `${requests.length} ${show(last())}`);

requests.length = 0;
await tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('from').gdatetime.displayButton.focus());
await tab.keyboard.press('Backspace');
await sleep(300);
p = await ui.picker();
check('Backspace empties both sides and reloads once', requests.length === 1 && last().get('from') === '' && last().get('to') === '' && p.display === 'Choose a date range', `${requests.length} ${show(last())} "${p.display}"`);

// ------------------------------------------------------------ links and remembered state
requests.length = 0;
await open('/list?from=2026-10-02&to=2026-10-09');
p = await ui.picker();
check('a link with from/to restores the picker', p.start === '2026-10-02' && p.end === '2026-10-09' && /2 Oct 2026 – 9 Oct 2026/.test(p.display), p.display);
check('…and the first request carries both', requests.some(q => q.get('from') === '2026-10-02' && q.get('to') === '2026-10-09'), requests.map(show).join(' | '));

await ui.toggle();
await ui.day(11);
await ui.day(12);
await sleep(300);
requests.length = 0;
await open('/list');
p = await ui.picker();
check('coming back without parameters restores the remembered range', p.start === iso(11) && p.end === iso(12) && requests.some(q => q.get('from') === iso(11) && q.get('to') === iso(12)), `${p.display} ${requests.map(show).join(' | ')}`);

requests.length = 0;
await open('/two?logs.from=2026-10-03&logs.to=2026-10-04');
p = await ui.picker();
check('two tables on a page: logs.from / logs.to are this table\'s range', p.start === '2026-10-03' && p.end === '2026-10-04' && requests.some(q => q.get('from') === '2026-10-03' && q.get('to') === '2026-10-04'), `${p.display} ${requests.map(show).join(' | ')}`);

// ------------------------------------------------------------ the single date filter
await open('/list');
requests.length = 0;
await tab.evaluate(() => {
  const p = TableManager.state.tables.get('logs').filterElements.get('due').gdatetime;
  p.displayButton.click();
  [...p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)')].find(b => b.textContent === '15').click();
});
await sleep(1400); // single filters are debounced
const dueType = await tab.evaluate(() => TableManager.state.tables.get('logs').filterElements.get('due').gdatetime.type);
check('data-type="date" filter: picker is a date picker and reloads with due=', dueType === 'date' && last().get('due') === iso(15), `type=${dueType} due=${last().get('due')}`);

// ------------------------------------------------------------ client-side table
await open('/local');
const rows = async (params) => tab.evaluate(async (params) => {
  const t = TableManager.state.tables.get('local');
  Object.assign(t.config.params, params);
  TableManager.renderTable('local');
  await new Promise(r => setTimeout(r, 50));
  return [...document.querySelectorAll('[data-table="local"] tbody tr')].map(tr => tr.querySelector('td')?.textContent.trim()).join(',');
}, params);
check('client-side range 15–15 keeps both rows of that day', await rows({created_at_from: '2026-10-15', created_at_to: '2026-10-15', due: ''}) === '2,3');
check('client-side range "from" only', await rows({created_at_from: '2026-10-15', created_at_to: '', due: ''}) === '2,3,4');
check('client-side range "to" only', await rows({created_at_from: '', created_at_to: '2026-10-14', due: ''}) === '1');
check('client-side date filter matches a date-time on that day', await rows({created_at_from: '', created_at_to: '', due: '2026-10-20'}) === '1,2');

// ------------------------------------------------------------ a range in a plain form + min/max
await open('/form');
const formRun = await tab.evaluate(async () => {
  const p = ElementManager.getInstanceByElement(document.getElementById('period')).gdatetime;
  const pick = n => [...p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)')].find(b => b.textContent === String(n)).click();
  p.displayButton.click();
  pick(3);
  pick(8);
  await new Promise(r => setTimeout(r, 50));
  return {data: Object.fromEntries(new FormData(document.getElementById('f'))), changes: {...window.__changes}, detail: window.__lastRange};
});
check('form: data-range-end adds the end field to the form', formRun.data.period_from?.endsWith('-03') && formRun.data.period_to?.endsWith('-08'), JSON.stringify(formRun.data));
check('form: one range = one change on each input + one gdatetime:rangechange', formRun.changes.from === 1 && formRun.changes.to === 1 && formRun.changes.range === 1, JSON.stringify(formRun.changes));
check('rangechange detail names both fields', formRun.detail?.names?.start === 'period_from' && formRun.detail?.names?.end === 'period_to', JSON.stringify(formRun.detail));

const minMax = await tab.evaluate(() => {
  const p = ElementManager.getInstanceByElement(document.getElementById('opens')).gdatetime;
  p.currentYear = 2026;
  p.currentMonth = 9;
  p.displayButton.click();
  const cell = n => [...p.calendarGrid.querySelectorAll('.calendar-day:not(.other-month)')].find(b => b.textContent === String(n));
  return {15: cell(15).disabled, 16: cell(16).disabled, 20: cell(20).disabled, 21: cell(21).disabled};
});
check('min/max compare calendar days (min day itself selectable, UTC+7)', minMax[15] && !minMax[16] && !minMax[20] && minMax[21], JSON.stringify(minMax));

check('no JS errors or warnings during the run', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter(r => !r.pass);
console.log(`\n passed ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
