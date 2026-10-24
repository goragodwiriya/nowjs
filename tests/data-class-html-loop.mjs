/**
 * data-html inside data-for must not reprocess its own binding, and ternary
 * data-class values may contain multiple classes.
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

    let htmlBindingCalls = 0;
    const processDataHtml = TemplateManager.processDataHtml;
    TemplateManager.processDataHtml = function(el, ...args) {
        if (el.matches('.reply-comment')) htmlBindingCalls++;
        return processDataHtml.call(this, el, ...args);
    };

    const host = document.createElement('div');
    host.innerHTML = `<section data-for="reply in replies">
    <template>
      <article class="helpdesk-card helpdesk-reply"
        data-class="reply.is_agent == 1 ? 'helpdesk-card helpdesk-reply is-agent' : 'helpdesk-card helpdesk-reply'">
        <div class="reply-comment" data-html="reply.comment"></div>
        <span data-text="reply.name"></span>
      </article>
    </template>
  </section>`;
    document.body.appendChild(host);

    TemplateManager.processDataDirectives(host, {
        state: {
            replies: [
                {is_agent: 1, comment: '<p><strong>Agent reply</strong></p>', name: 'Agent'},
                {is_agent: 0, comment: '<p>Customer reply</p>', name: 'Customer'}
            ]
        }
    });

    return {
        errors,
        htmlBindingCalls,
        replies: Array.from(host.querySelectorAll('article')).map(article => ({
            classes: Array.from(article.classList),
            html: article.querySelector('.reply-comment').innerHTML,
            name: article.querySelector('span').textContent
        }))
    };
});

await browser.close();

const checks = [
    ['both replies render', result.replies.length === 2],
    ['agent classes toggle without classList errors', result.replies[0]?.classes.includes('is-agent')
        && result.replies[0]?.classes.includes('helpdesk-card')],
    ['customer keeps shared classes without agent class', result.replies[1]?.classes.includes('helpdesk-card')
        && !result.replies[1]?.classes.includes('is-agent')],
    ['reply HTML is rendered', result.replies[0]?.html === '<p><strong>Agent reply</strong></p>'
        && result.replies[1]?.html === '<p>Customer reply</p>'],
    ['reply text is bound', result.replies[0]?.name === 'Agent' && result.replies[1]?.name === 'Customer'],
    ['each html binding runs once', result.htmlBindingCalls === 2],
    ['no binding errors occur', result.errors.length === 0]
];

checks.forEach(([name, passed]) => console.log(`  ${passed ? '✔' : '✘'} ${name}`));
console.log(`\nผ่าน ${checks.filter(([, passed]) => passed).length}/${checks.length}`);
process.exit(checks.every(([, passed]) => passed) ? 0 : 1);