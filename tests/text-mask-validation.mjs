/**
 * Text and mask inputs: what the user types, what the field keeps, and whether
 * it is accepted.
 *
 * - data-format="ip": octets of 1-3 digits, the typed dot closes one. The fixed
 *   999.999.999.999 mask dropped the dots (192.168.0.1 became 192.168.01) and
 *   accepted 999.999.999.999.
 * - time / date / datetime: a real time (00:00-23:59) and a real calendar date
 *   (31/02 is not; a year above 2400 is Buddhist Era). 99:99 used to pass.
 * - idcard: Thai ID check digit. creditcard: Luhn. zipcode: 5 digits.
 * - data-match="other": the field must equal the one it names, re-checked when
 *   that one changes. It was documented but never implemented.
 * - data-element="email" / "username": lowercase on blur (the factory formatter
 *   was hidden by an undefined `formatter` key).
 * - Autocomplete with data-callback: Enter puts the item's value in the field,
 *   like a click, not the whole rendered row.
 *
 * Runs the real built bundle in a real browser. NOW_DIST overrides the bundle
 * folder (default ../Now/dist).
 */

import http from 'node:http';
import {readFileSync} from 'node:fs';
import puppeteer from '../node_modules/puppeteer-core/lib/puppeteer/puppeteer-core.js';

const here = new URL('.', import.meta.url).pathname;
const DIST = (process.env.NOW_DIST || here + '../Now/dist').replace(/\/?$/, '/');

const page = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<form data-form="f">
  <input type="text" id="ip" name="ip" data-element="mask" data-format="ip">
  <input type="text" id="time" name="time" data-element="mask" data-format="time">
  <input type="text" id="date" name="date" data-element="mask" data-format="date">
  <input type="text" id="datetime" name="datetime" data-element="mask" data-format="datetime">
  <input type="text" id="idcard" name="idcard" data-element="mask" data-format="idcard">
  <input type="text" id="card" name="card" data-element="mask" data-format="creditcard">
  <input type="text" id="zip" name="zip" data-element="mask" data-format="zipcode">
  <input type="text" id="tel" name="tel" data-element="tel">
  <input type="text" id="email" name="email" data-element="email">
  <input type="text" id="user" name="user" data-element="username">
  <input type="text" id="confirm" name="confirm" data-element="email" data-match="email">
  <input type="text" id="cust" name="cust" data-element="text" data-autocomplete="true" data-source="CUSTOMERS" data-callback="renderCust" data-min-length="1">
</form>
<script>
window.CUSTOMERS = [{value: 'C1', text: 'Acme Ltd'}, {value: 'C2', text: 'Acme Trading'}];
window.renderCust = ({value}) => {
  const div = document.createElement('div');
  div.innerHTML = '<strong>' + value + '</strong>  <small>mail@example.com · 02-123-4567</small>';
  return div;
};
</script>
<script src="/core.js"></script>
<script>
window.__ready = (async () => {
  await Now.init({environment: 'production', auth: {enabled: false}});
})();
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
    return res.end(page);
  }
  if (req.url === '/core.js') {
    res.writeHead(200, {'Content-Type': 'application/javascript; charset=utf-8'});
    return res.end(readFileSync(DIST + 'now.core.min.js', 'utf8'));
  }
  res.writeHead(204);
  res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage']});
const tab = await browser.newPage();
const errors = [];
tab.on('pageerror', e => errors.push(e.message));
await tab.goto(origin + '/', {waitUntil: 'networkidle0'});
await tab.evaluate(() => window.__ready);
await new Promise(r => setTimeout(r, 300));

// Type into a field key by key, leave it, and read what it holds
const typeIn = async (id, text) => {
  await tab.evaluate(id => {
    const el = document.getElementById(id);
    el.value = '';
    el.dispatchEvent(new Event('input', {bubbles: true}));
  }, id);
  await tab.focus('#' + id);
  await tab.keyboard.type(text, {delay: 10});
  await tab.evaluate(id => document.getElementById(id).blur(), id);
  await new Promise(r => setTimeout(r, 120));
  return tab.evaluate(id => {
    const el = document.getElementById(id);
    const inst = ElementManager.getInstanceByElement(el);
    return {value: el.value, valid: inst.isValid()};
  }, id);
};

let failed = 0;
const check = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(got)}${ok ? '' : ' want ' + JSON.stringify(want)}`);
};
const expect = async (id, text, value, valid) => check(`${id} "${text}"`, await typeIn(id, text), {value, valid});

// ip
await expect('ip', '192.168.0.1', '192.168.0.1', true);
await expect('ip', '10.0.0.255', '10.0.0.255', true);
await expect('ip', '192168001001', '192.168.001.001', true);
await expect('ip', '999.999.999.999', '999.999.999.999', false);
await expect('ip', '192.168.1', '192.168.1', false);
await expect('ip', '1.2.3.4.5', '1.2.3.45', true);
await expect('ip', '1a.2', '1.2', false);

// time / date / datetime
await expect('time', '2359', '23:59', true);
await expect('time', '0000', '00:00', true);
await expect('time', '9999', '99:99', false);
await expect('time', '2400', '24:00', false);
await expect('date', '29022024', '29/02/2024', true);
await expect('date', '29022023', '29/02/2023', false);
await expect('date', '31022024', '31/02/2024', false);
await expect('date', '00132024', '00/13/2024', false);
await expect('date', '29022567', '29/02/2567', true);
await expect('datetime', '150820262359', '15/08/2026 23:59', true);
await expect('datetime', '150820262460', '15/08/2026 24:60', false);

// check digits and lengths
await expect('idcard', '1101700230708', '1-1017-00230-70-8', true);
await expect('idcard', '1234567890123', '1-2345-67890-12-3', false);
await expect('card', '4111111111111111', '4111-1111-1111-1111', true);
await expect('card', '1234567812345678', '1234-5678-1234-5678', false);
await expect('zip', '10110', '10110', true);
await expect('zip', '101', '101', false);
// unchanged
await expect('tel', '0812345678', '08-1234-5678', true);

// editing in the middle: caret placed, Backspace, then a key
const editAt = async (id, text, caret, ...keys) => {
  await typeIn(id, text);
  await tab.focus('#' + id);
  await tab.evaluate((id, c) => document.getElementById(id).setSelectionRange(c, c), id, caret);
  for (const k of keys) {
    if (k.length > 1) await tab.keyboard.press(k);
    else await tab.keyboard.type(k);
    await new Promise(r => setTimeout(r, 40));
  }
  return tab.evaluate(id => document.getElementById(id).value, id);
};
check('ip: Backspace a digit mid-octet, type another', await editAt('ip', '192.168.0.1', 6, 'Backspace', '7'), '192.178.0.1');
check('tel: Backspace across a separator, type', await editAt('tel', '0812345678', 4, 'Backspace', '9'), '08-9234-5678');
check('date: Backspace and retype the day', await editAt('date', '15082026', 2, 'Backspace', '2'), '12/08/2026');

// lowercase formatter
await expect('email', 'Foo@Example.COM', 'foo@example.com', true);
await expect('user', 'User_123', 'user_123', true);

// data-match
await expect('confirm', 'other@example.com', 'other@example.com', false);
await expect('confirm', 'foo@example.com', 'foo@example.com', true);
// changing the field it copies re-checks it
await typeIn('email', 'bar@example.com');
check('confirm re-checked after email changed', await tab.evaluate(() => ElementManager.getInstanceByElement(document.getElementById('confirm')).isValid()), false);

// autocomplete with data-callback: Enter selects the value
await tab.evaluate(() => { document.getElementById('cust').value = ''; });
await tab.focus('#cust');
await tab.keyboard.type('Acme', {delay: 20});
await new Promise(r => setTimeout(r, 600));
await tab.keyboard.press('Enter');
await new Promise(r => setTimeout(r, 200));
check('Enter on a data-callback row puts its value', await tab.evaluate(() => document.getElementById('cust').value), 'Acme Ltd');

if (errors.length) {
  failed++;
  console.log('page errors:', errors);
}

await browser.close();
server.close();
console.log(failed ? `${failed} failed` : 'all passed');
process.exit(failed ? 1 : 0);
