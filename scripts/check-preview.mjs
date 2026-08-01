import {access, mkdtemp, readdir, rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {homedir, tmpdir} from 'node:os';
import {join} from 'node:path';

const baseUrl = process.env.GHOST_PREVIEW_URL || 'http://localhost:2369';
const debuggingPort = 9338;
const failures = [];
let browser;
let profileDirectory;
let client;

async function existingPath(candidates) {
    for (const candidate of candidates.filter(Boolean)) {
        try {
            await access(candidate);
            return candidate;
        } catch {
            // Try the next conventional browser location.
        }
    }
    return '';
}

async function resolveBrowserPath() {
    const conventional = await existingPath([
        process.env.CHROME_PATH,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser'
    ]);
    if (conventional) {
        return conventional;
    }

    const cacheRoot = join(homedir(), 'Library', 'Caches', 'ms-playwright');
    try {
        const packages = (await readdir(cacheRoot, {withFileTypes: true}))
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('chromium_headless_shell-'))
            .sort((left, right) => right.name.localeCompare(left.name));
        for (const packageEntry of packages) {
            const packageRoot = join(cacheRoot, packageEntry.name);
            const platformDirectories = (await readdir(packageRoot, {withFileTypes: true}))
                .filter((entry) => entry.isDirectory());
            const cached = await existingPath(platformDirectories.map((entry) =>
                join(packageRoot, entry.name, 'chrome-headless-shell')
            ));
            if (cached) {
                return cached;
            }
        }
    } catch {
        // Playwright is optional; report the supported override below.
    }

    throw new Error('No Chromium browser found. Set CHROME_PATH to a Chrome or Chromium executable.');
}

function check(condition, message, details = '') {
    if (condition) {
        console.log(`PASS  ${message}`);
        return;
    }
    failures.push(message);
    console.error(`FAIL  ${message}${details ? ` — ${details}` : ''}`);
}

async function pollJson(url, timeoutMs = 10_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(url);
            if (response.ok) {
                return response.json();
            }
        } catch {
            // Chromium has not opened its debugging socket yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${url}`);
}

class CdpClient {
    constructor(socket) {
        this.socket = socket;
        this.nextId = 1;
        this.pending = new Map();
        socket.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id) {
                const pending = this.pending.get(message.id);
                if (!pending) return;
                this.pending.delete(message.id);
                if (message.error) {
                    pending.reject(new Error(message.error.message));
                } else {
                    pending.resolve(message.result);
                }
                return;
            }
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject});
            this.socket.send(JSON.stringify({id, method, params}));
        });
    }

}

async function launchBrowser() {
    profileDirectory = await mkdtemp(join(tmpdir(), 'the-shell-pro-preview-'));
    const browserPath = await resolveBrowserPath();
    browser = spawn(browserPath, [
        '--headless',
        '--no-sandbox',
        '--disable-gpu',
        `--remote-debugging-port=${debuggingPort}`,
        `--user-data-dir=${profileDirectory}`,
        'about:blank'
    ], {stdio: 'ignore'});

    await pollJson(`http://127.0.0.1:${debuggingPort}/json/version`);
    const pageResponse = await fetch(`http://127.0.0.1:${debuggingPort}/json/new?about:blank`, {method: 'PUT'});
    const page = pageResponse.ok
        ? await pageResponse.json()
        : (await pollJson(`http://127.0.0.1:${debuggingPort}/json/list`))[0];
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
        socket.addEventListener('open', resolve, {once: true});
        socket.addEventListener('error', reject, {once: true});
    });
    client = new CdpClient(socket);
    await Promise.all([
        client.send('Page.enable'),
        client.send('Runtime.enable')
    ]);
}

async function navigate(path, width = 1440, height = 1000) {
    await client.send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile: width <= 700
    });
    const target = new URL(path, baseUrl);
    const navigation = await client.send('Page.navigate', {url: target.href});
    if (navigation.errorText) {
        throw new Error(`Could not navigate to ${target.href}: ${navigation.errorText}`);
    }
    const deadline = Date.now() + 20_000;
    var ready = false;
    while (Date.now() < deadline) {
        try {
            const result = await client.send('Runtime.evaluate', {
                expression: `({href: window.location.href, readyState: document.readyState})`,
                returnByValue: true
            });
            const state = result.result?.value;
            ready = state
                && new URL(state.href).pathname === target.pathname
                && /^(?:interactive|complete)$/.test(state.readyState);
            if (ready) break;
        } catch {
            // The previous execution context disappears while navigation commits.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (!ready) {
        throw new Error(`Timed out waiting for ${target.href} to become interactive`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
}

async function evaluate(expression) {
    const result = await client.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true
    });
    if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
}

function normalizedPath(value) {
    const path = new URL(value, baseUrl).pathname;
    return path === '/' ? path : `${path.replace(/\/+$/, '')}/`;
}

async function inspectSeoRoute({
    path,
    expectedStatus = 200,
    expectedSchema = '',
    expectBreadcrumbs = true,
    expectCanonical = true,
    expectDescription = true,
    expectIndexable = true,
    initialContent = ''
}) {
    const response = await fetch(new URL(path, baseUrl), {redirect: 'manual'});
    const html = await response.text();
    check(response.status === expectedStatus, `${path} returns HTTP ${expectedStatus}`, String(response.status));

    await navigate(path);
    const state = await evaluate(`(() => {
        const schemaTypes = new Set();
        const schemaErrors = [];
        function collectTypes(value) {
            if (!value || typeof value !== 'object') return;
            const type = value['@type'];
            (Array.isArray(type) ? type : [type]).filter(Boolean).forEach((item) => schemaTypes.add(item));
            Object.values(value).forEach(collectTypes);
        }
        document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
            try {
                collectTypes(JSON.parse(script.textContent));
            } catch (error) {
                schemaErrors.push(error.message);
            }
        });
        const canonical = document.querySelector('link[rel="canonical"]')?.href || '';
        const ogUrl = document.querySelector('meta[property="og:url"]')?.content || '';
        const badLinks = Array.from(document.querySelectorAll('main a')).filter((link) => {
            const href = link.getAttribute('href');
            return !href || /^javascript:/i.test(href);
        }).length;
        const robots = Array.from(document.querySelectorAll('meta[name="robots"]')).map((meta) => meta.content);
        const breadcrumbPositions = Array.from(document.querySelectorAll('.breadcrumbs [itemprop="position"]'))
            .map((meta) => meta.content);
        const ids = Array.from(document.querySelectorAll('[id]')).map((element) => element.id);
        const duplicateIds = ids.filter((id, index) => ids.indexOf(id) !== index);
        const missingAriaTargets = Array.from(document.querySelectorAll('[aria-controls]'))
            .map((element) => element.getAttribute('aria-controls'))
            .filter((id) => !document.getElementById(id));
        const unsafeBlankTargets = Array.from(document.querySelectorAll('a[target="_blank"]'))
            .filter((link) => !(link.getAttribute('rel') || '').split(/\\s+/).includes('noopener'))
            .length;
        const headingLevels = Array.from(document.querySelectorAll('main h1, main h2, main h3, main h4, main h5, main h6'))
            .map((heading) => Number(heading.tagName.slice(1)));
        const skippedHeadingLevels = headingLevels.filter((level, index) =>
            index > 0 && level > headingLevels[index - 1] + 1
        );
        return {
            titles: document.querySelectorAll('head > title').length,
            title: document.title.trim(),
            descriptions: document.querySelectorAll('meta[name="description"]').length,
            description: document.querySelector('meta[name="description"]')?.content.trim() || '',
            canonicals: document.querySelectorAll('link[rel="canonical"]').length,
            canonical,
            ogUrl,
            h1s: document.querySelectorAll('main h1').length,
            schemaTypes: Array.from(schemaTypes),
            schemaErrors,
            robots,
            badLinks,
            breadcrumbs: document.querySelectorAll('.breadcrumbs').length,
            breadcrumbPositions,
            duplicateIds,
            missingAriaTargets,
            unsafeBlankTargets,
            skippedHeadingLevels,
            missingMainImageAlt: Array.from(document.querySelectorAll('main img')).filter((image) => !image.hasAttribute('alt')).length,
            lang: document.documentElement.lang
        };
    })()`);

    check(state.titles === 1 && Boolean(state.title), `${path} has one non-empty document title`, JSON.stringify(state));
    check(state.h1s === 1, `${path} has one page-level H1`, String(state.h1s));
    check(state.schemaErrors.length === 0, `${path} emits parseable JSON-LD`, state.schemaErrors.join('; '));
    check(state.badLinks === 0, `${path} main-content links are crawlable anchors`, String(state.badLinks));
    check(state.missingMainImageAlt === 0, `${path} main-content images declare alt semantics`, String(state.missingMainImageAlt));
    check(Boolean(state.lang), `${path} declares the document language`, state.lang);
    check(
        state.duplicateIds.length === 0
            && state.missingAriaTargets.length === 0
            && state.unsafeBlankTargets === 0,
        `${path} keeps IDs, ARIA references, and new-tab links structurally safe`,
        JSON.stringify(state)
    );
    check(state.skippedHeadingLevels.length === 0, `${path} keeps a sequential heading outline`, JSON.stringify(state.skippedHeadingLevels));

    if (expectDescription) {
        check(
            state.descriptions === 1 && Boolean(state.description),
            `${path} has one useful meta description`,
            JSON.stringify({count: state.descriptions, value: state.description})
        );
    } else {
        check(state.descriptions <= 1, `${path} does not duplicate meta descriptions`, String(state.descriptions));
    }

    if (expectCanonical) {
        const canonicalMatches = state.canonicals === 1
            && new URL(state.canonical).origin === new URL(baseUrl).origin
            && normalizedPath(state.canonical) === normalizedPath(new URL(path, baseUrl));
        check(canonicalMatches, `${path} has one matching self-canonical`, state.canonical);
        check(!state.ogUrl || state.ogUrl === state.canonical, `${path} Open Graph URL agrees with canonical`, state.ogUrl);
    } else {
        check(state.canonicals === 0, `${path} does not canonicalize an error document`, String(state.canonicals));
    }

    if (expectIndexable) {
        check(
            state.robots.length === 1
                && state.robots[0].includes('max-image-preview:large')
                && !state.robots.some((value) => /\bnoindex\b/i.test(value)),
            `${path} has no conflicting or accidental noindex directive`,
            JSON.stringify(state.robots)
        );
    } else {
        check(state.robots.length <= 2, `${path} has no conflicting robot-directive sprawl`, JSON.stringify(state.robots));
    }

    if (expectedSchema) {
        check(state.schemaTypes.includes(expectedSchema), `${path} includes Ghost's ${expectedSchema} schema`, state.schemaTypes.join(', '));
    }

    if (expectBreadcrumbs) {
        const sequential = state.breadcrumbPositions.every((position, index) => Number(position) === index + 1);
        check(
            state.breadcrumbs === 1 && state.breadcrumbPositions.length >= 2 && sequential,
            `${path} exposes one visible BreadcrumbList`,
            JSON.stringify(state.breadcrumbPositions)
        );
    } else {
        check(state.breadcrumbs === 0, `${path} omits redundant breadcrumbs`);
    }

    const initialMarkers = Array.isArray(initialContent) ? initialContent : [initialContent].filter(Boolean);
    for (const marker of initialMarkers) {
        check(html.includes(marker), `${path} keeps ${marker} in the initial HTML`);
    }
}

async function inspectSeoContracts() {
    const routes = [
        {path: '/', expectedSchema: 'WebSite', expectBreadcrumbs: false},
        {
            path: '/tracing-the-edge-200ms-feedback-loop/',
            expectedSchema: 'Article',
            initialContent: [
                'Most systems become difficult to operate',
                'class="article-series"',
                'data-reader-settings'
            ]
        },
        {path: '/about-the-lab/', expectedSchema: 'Article'},
        {path: '/publications/', expectedSchema: 'Article'},
        {path: '/topics/', expectedSchema: 'Article'},
        {path: '/archives/', expectedSchema: 'Article'},
        {path: '/tag/observability/', expectedSchema: 'Series'},
        {path: '/author/preview/', expectedSchema: 'Person'},
        {path: '/page/2/', expectBreadcrumbs: false, expectDescription: false}
    ];
    for (const route of routes) {
        await inspectSeoRoute(route);
    }
    await inspectSeoRoute({
        path: '/definitely-not-a-preview-route/',
        expectedStatus: 404,
        expectBreadcrumbs: false,
        expectCanonical: false,
        expectDescription: false,
        expectIndexable: false
    });
}

async function inspectHome() {
    await navigate('/');
    const state = await evaluate(`(async () => {
        const card = Array.from(document.querySelectorAll('.home-feed .post-card')).find((item) =>
            item.querySelector('h2')?.textContent.includes('deliberately long technical title')
        ) || document.querySelector('.home-feed .post-card');
        const body = card?.querySelector('.post-card__body');
        const excerpt = body?.querySelector(':scope > p');
        const read = body?.querySelector('.post-card__read');
        const bodyBox = body?.getBoundingClientRect();
        const excerptBox = excerpt?.getBoundingClientRect();
        const readBox = read?.getBoundingClientRect();
        const external = Array.from(document.querySelectorAll('.site-nav__menu a')).find((link) =>
            link.textContent.trim() === 'AIScholar'
        );
        const internalMarkedExternal = Array.from(document.querySelectorAll('.site-nav__menu a')).some((link) =>
            ['Topics', 'About'].includes(link.textContent.trim())
                && link.closest('li')?.classList.contains('nav-external')
        );
        window.scrollTo(0, 1000);
        await new Promise((resolve) => setTimeout(resolve, 300));
        const backToTop = document.querySelector('[data-back-to-top]');
        const backToTopBox = backToTop?.getBoundingClientRect();
        const heroImage = document.querySelector('.home-hero__media img');
        const firstCardImage = document.querySelector('.home-feed .post-card__image img');
        return {
            title: document.title,
            highlightLoaded: Array.from(document.scripts).some((script) => script.src.includes('highlight')),
            fallbackBadge: Boolean(card?.querySelector('.post-type--research')),
            readBelowExcerpt: Boolean(readBox && excerptBox && readBox.top >= excerptBox.bottom - 1),
            readAlignedWithCopy: Boolean(readBox && excerptBox && Math.abs(readBox.left - excerptBox.left) <= 3),
            bodyColumns: body ? getComputedStyle(body).gridTemplateColumns : '',
            backToTopFixed: Boolean(backToTop && getComputedStyle(backToTop).position === 'fixed'),
            backToTopNearBottomRight: Boolean(
                backToTopBox
                    && backToTopBox.right > window.innerWidth - 120
                    && backToTopBox.bottom > window.innerHeight - 120
            ),
            externalMarked: Boolean(external?.closest('li')?.classList.contains('nav-external')),
            internalMarkedExternal,
            heroImage: Boolean(heroImage),
            heroPriority: heroImage?.fetchPriority || '',
            heroAlt: heroImage?.getAttribute('alt'),
            firstCardLoading: firstCardImage?.loading || ''
        };
    })()`);

    check(state.title === 'The Shell Pro — Preview', 'homepage document title is populated', state.title);
    check(!state.highlightLoaded, 'Highlight.js stays off listing pages');
    check(!state.fallbackBadge, 'unclassified cards omit the fallback Research note badge');
    check(state.readBelowExcerpt && state.readAlignedWithCopy, 'desktop Read entry link sits below the excerpt', state.bodyColumns);
    check(state.backToTopFixed && state.backToTopNearBottomRight, 'desktop back-to-top floats bottom-right');
    check(state.externalMarked && !state.internalMarkedExternal, 'only external navigation is visibly marked');
    check(state.heroImage && state.heroPriority === 'high' && state.heroAlt === '', 'homepage cover is an HTML-discoverable decorative LCP candidate', JSON.stringify(state));
    check(state.firstCardLoading === 'lazy', 'homepage listing images stay lazy behind the prioritized hero', state.firstCardLoading);

    await client.send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{name: 'prefers-reduced-motion', value: 'reduce'}]
    });
    const reducedMotion = await evaluate(`(() => {
        const button = document.querySelector('[data-back-to-top]');
        let behavior = '';
        window.scrollTo = (options) => { behavior = options?.behavior || ''; };
        button.hidden = false;
        button.click();
        return {behavior};
    })()`);
    check(reducedMotion.behavior !== 'smooth', 'back-to-top respects reduced-motion preference', JSON.stringify(reducedMotion));
    await client.send('Emulation.setEmulatedMedia', {media: 'screen', features: []});
}

async function inspectMobileHome() {
    await navigate('/', 390, 844);
    const state = await evaluate(`(() => {
        const card = document.querySelector('.home-feed .post-card--with-image');
        const image = card?.querySelector('.post-card__image');
        const body = card?.querySelector('.post-card__body');
        const read = body?.querySelector('.post-card__read');
        const excerpt = body?.querySelector(':scope > p');
        const imageBox = image?.getBoundingClientRect();
        const bodyBox = body?.getBoundingClientRect();
        const readBox = read?.getBoundingClientRect();
        const excerptBox = excerpt?.getBoundingClientRect();
        const backToTop = document.querySelector('[data-back-to-top]');
        return {
            cardDisplay: card ? getComputedStyle(card).display : '',
            imageWidth: imageBox?.width || 0,
            bodyWidth: bodyBox?.width || 0,
            readBelowExcerpt: Boolean(readBox && excerptBox && readBox.top >= excerptBox.bottom - 1),
            backToTopPosition: backToTop ? getComputedStyle(backToTop).position : '',
            backToTopInActions: Boolean(backToTop?.closest('.site-actions'))
        };
    })()`);
    check(Math.abs(state.imageWidth - state.bodyWidth) <= 2, 'mobile post-card image and body use the full card width', JSON.stringify(state));
    check(state.readBelowExcerpt, 'mobile Read entry link stays below the excerpt');
    check(state.backToTopPosition !== 'fixed' && state.backToTopInActions, 'mobile back-to-top stays in the header', JSON.stringify(state));
}

async function inspectCollapsedNavigation() {
    await navigate('/', 920, 900);
    const state = await evaluate(`(() => {
        const toggle = document.querySelector('[data-menu-toggle]');
        const menu = document.querySelector('[data-menu]');
        const subscribe = document.querySelector('.site-actions .button');
        const firstLink = menu?.querySelector('a');
        toggle?.click();
        const opened = menu?.classList.contains('is-open') || false;
        const openDisplay = menu ? getComputedStyle(menu).display : 'none';
        firstLink?.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        const escapeClosed = !menu?.classList.contains('is-open')
            && toggle?.getAttribute('aria-expanded') === 'false';
        const escapeReturnedFocus = document.activeElement === toggle;
        toggle?.click();
        document.querySelector('main')?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        return {
            toggleDisplay: toggle ? getComputedStyle(toggle).display : 'none',
            opened,
            openDisplay,
            escapeClosed,
            escapeReturnedFocus,
            outsideClickClosed: !menu?.classList.contains('is-open')
                && toggle?.getAttribute('aria-expanded') === 'false',
            subscribeDisplay: subscribe ? getComputedStyle(subscribe).display : 'none'
        };
    })()`);
    check(state.toggleDisplay !== 'none' && state.opened && state.openDisplay !== 'none', 'navigation collapses and opens cleanly at 920 px', JSON.stringify(state));
    check(state.escapeClosed && state.escapeReturnedFocus, 'Escape closes mobile navigation and returns focus to its toggle', JSON.stringify(state));
    check(state.outsideClickClosed, 'clicking outside closes mobile navigation', JSON.stringify(state));
    check(state.subscribeDisplay !== 'none', 'Subscribe remains available above the 700 px breakpoint');
}

async function inspectShortArticle() {
    await navigate('/long-technical-title-preview/');
    const state = await evaluate(`(() => {
        const layout = document.querySelector('.article-layout');
        const content = document.querySelector('.article-content');
        const contentBox = content?.getBoundingClientRect();
        return {
            collapsed: layout?.classList.contains('article-layout--without-toc') || false,
            centredOffset: contentBox ? Math.abs((contentBox.left + contentBox.width / 2) - document.documentElement.clientWidth / 2) : 999,
            longTitle: document.querySelector('.article-header')?.classList.contains('article-header--long-title') || false,
            updatedVisible: Boolean(document.querySelector('.article-meta__updated')),
            seriesVisible: Boolean(document.querySelector('.article-series')),
            navigationTabs: document.querySelectorAll('.toc__tab').length,
            artifactLinks: document.querySelectorAll('.toc__artifact-list a').length,
            highlightLoaded: Array.from(document.scripts).some((script) => script.src.includes('highlight'))
        };
    })()`);
    check(state.collapsed && state.centredOffset <= 3, 'short articles collapse the empty TOC rail and centre their content', JSON.stringify(state));
    check(
        state.navigationTabs === 0 && state.artifactLinks === 0,
        'artifact navigation disappears completely when it has no useful choices',
        JSON.stringify(state)
    );
    check(state.longTitle, 'very long article titles receive the compact title treatment');
    check(!state.updatedVisible, 'posts do not claim an update without the #updated tag');
    check(!state.seriesVisible, 'standalone posts do not render an empty series box');
    check(!state.highlightLoaded, 'code-free articles do not request Highlight.js');
}

async function inspectAdaptiveArticleNavigation() {
    async function inspectInjectedArtifacts(count) {
        const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
            source: `
                document.addEventListener('DOMContentLoaded', () => {
                    const content = document.querySelector('[data-post-content]');
                    if (!content) return;
                    for (let index = 0; index < ${count}; index += 1) {
                        const table = document.createElement('table');
                        table.dataset.qualitySweep = 'adaptive-artifact';
                        table.innerHTML = '<caption>Probe matrix ' + (index + 1)
                            + '</caption><tbody><tr><th>Probe</th><td>Ready</td></tr></tbody>';
                        content.appendChild(table);
                    }
                }, {once: true});
            `
        });
        try {
            await navigate('/long-technical-title-preview/');
            return await evaluate(`(() => {
                const container = document.querySelector('[data-toc-container]');
                const layout = document.querySelector('.article-layout');
                const links = Array.from(document.querySelectorAll('.toc__artifact-list a'));
                return {
                    hidden: container?.hidden || false,
                    centred: layout?.classList.contains('article-layout--without-toc') || false,
                    tabs: document.querySelectorAll('.toc__tab').length,
                    outlineLinks: document.querySelectorAll('.toc__list a').length,
                    artifactLinks: links.length,
                    labels: links.map((link) => link.textContent.replace(/\\s+/g, ' ').trim())
                };
            })()`);
        } finally {
            await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
        }
    }

    const one = await inspectInjectedArtifacts(1);
    check(
        one.hidden && one.centred && one.tabs === 0 && one.artifactLinks === 0,
        'one artifact does not create a redundant navigation rail',
        JSON.stringify(one)
    );

    const two = await inspectInjectedArtifacts(2);
    check(
        !two.hidden
            && !two.centred
            && two.tabs === 0
            && two.outlineLinks === 0
            && two.artifactLinks === 2
            && two.labels.every((label) => /Table \d+.*Probe matrix/.test(label)),
        'two artifacts create a focused artifact-only navigator without empty outline chrome',
        JSON.stringify(two)
    );
}

async function inspectListingImagePriority() {
    await navigate('/tag/observability/');
    const state = await evaluate(`(() => {
        const image = document.querySelector('.home-feed .post-card__image img');
        return {
            loading: image?.loading || '',
            priority: image?.fetchPriority || ''
        };
    })()`);
    check(
        state.loading === 'eager' && state.priority === 'high',
        'image-led tag archives prioritize the first card as their likely LCP',
        JSON.stringify(state)
    );
}

async function inspectPublicationEmbed() {
    await navigate('/publications/');
    const state = await evaluate(`(() => {
        const iframe = document.querySelector('[data-post-content] iframe');
        return {
            loading: iframe?.loading || '',
            title: iframe?.title || '',
            wrapped: Boolean(iframe?.closest('.raw-embed-frame'))
        };
    })()`);
    check(
        state.loading === 'lazy' && Boolean(state.title) && state.wrapped,
        'technical embeds reserve space and ship lazy, titled markup',
        JSON.stringify(state)
    );
}

async function inspectUnknownCodeFallback() {
    const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            document.addEventListener('DOMContentLoaded', () => {
                const content = document.querySelector('[data-post-content]');
                if (!content) return;
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.className = 'language-unsupported-preview';
                code.textContent = 'unknown_syntax = still_readable\\nsecond_line = true';
                pre.dataset.qualitySweep = 'unsupported-language';
                pre.appendChild(code);
                content.prepend(pre);
            }, {once: true});
        `
    });
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/');
        const state = await evaluate(`(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const injected = document.querySelector('[data-quality-sweep="unsupported-language"]');
            const following = document.querySelector('code.language-typescript');
            return {
                injectedWrapped: Boolean(injected?.closest('.shell-code-block')),
                injectedReadable: injected?.textContent.includes('unknown_syntax = still_readable') || false,
                followingWrapped: Boolean(following?.closest('.shell-code-block'))
            };
        })()`);
        check(
            state.injectedWrapped && state.injectedReadable && state.followingWrapped,
            'unsupported syntax remains readable without aborting later code enhancements',
            JSON.stringify(state)
        );
    } finally {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
    }
}

async function inspectUntypedCodeLabel() {
    const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            document.addEventListener('DOMContentLoaded', () => {
                const content = document.querySelector('[data-post-content]');
                if (!content) return;
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.textContent = '.audit { color: red; }\\n.mobile { display: block; }';
                pre.dataset.qualitySweep = 'untyped-code-label';
                pre.appendChild(code);
                content.prepend(pre);
            }, {once: true});
        `
    });
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/');
        const state = await evaluate(`(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const injected = document.querySelector('[data-quality-sweep="untyped-code-label"]');
            const code = injected?.querySelector('code');
            const wrapper = injected?.closest('.shell-code-block');
            return {
                wrapped: Boolean(wrapper),
                tokenSpans: code?.querySelectorAll('[class*="hljs-"]').length ?? -1,
                inferredLanguage: Array.from(code?.classList || [])
                    .find((name) => name.startsWith('language-')) || '',
                anonymous: wrapper?.classList.contains('shell-code-block--anonymous') || false,
                identityPresent: Boolean(wrapper?.querySelector('.shell-code-toolbar__identity')),
                label: wrapper?.querySelector('.shell-code-toolbar__language')?.textContent.trim() || '',
                readable: code?.textContent.includes('.audit { color: red; }') || false
            };
        })()`);
        /*
         * This snippet reads as CSS to a detector, but the author never said so.
         * Guessing is what produced C++ diagrams and CSS-coloured key/value
         * listings in the wild, so an undeclared block stays untokenised and is
         * labelled honestly instead.
         */
        check(
            state.wrapped
                && state.tokenSpans === 0
                && state.inferredLanguage === ''
                && state.anonymous
                && state.identityPresent
                && state.label === 'Plain text'
                && state.readable,
            'untyped code is labelled plainly and never guessed at by the highlighter',
            JSON.stringify(state)
        );
    } finally {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
    }
}

async function inspectHighlighterFailureFallback() {
    await client.send('Network.enable');
    await client.send('Network.setCacheDisabled', {cacheDisabled: true});
    await client.send('Network.setBlockedURLs', {urls: ['*cdnjs.cloudflare.com*']});
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/');
        const state = await evaluate(`(async () => {
            await new Promise((resolve) => setTimeout(resolve, 100));
            const nasm = document.querySelector('code.language-nasm');
            return {
                highlighterUnavailable: !window.hljs,
                wrappedBlocks: document.querySelectorAll('.shell-code-block').length,
                nasmFilename: nasm?.closest('.shell-code-block')?.querySelector('.shell-code-toolbar__file')?.textContent.trim() || '',
                nasmReadable: nasm?.textContent.includes('BITS 64') || false
            };
        })()`);
        check(
            state.highlighterUnavailable
                && state.wrappedBlocks >= 6
                && state.nasmFilename === 'probes/remaining_budget.asm'
                && state.nasmReadable,
            'code blocks remain readable and functional when the highlighting CDN is unavailable',
            JSON.stringify(state)
        );
    } finally {
        await client.send('Network.setBlockedURLs', {urls: []});
        await client.send('Network.setCacheDisabled', {cacheDisabled: false});
    }
}

async function inspectTypeRoles() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const roles = await evaluate(`(async () => {
        await document.fonts.ready;
        const family = (el) => el ? getComputedStyle(el).fontFamily : '';
        const prose = document.querySelector('.article-content p');
        const code = document.querySelector('.shell-code-block pre');
        const heading = document.querySelector('.article-content h2');
        return {
            prose: family(prose),
            code: family(code),
            heading: family(heading),
            displayLoaded: document.fonts.check('700 1rem "Space Grotesk"'),
            textLoaded: document.fonts.check('400 1rem "IBM Plex Sans"')
        };
    })()`);
    check(
        /Space Grotesk/.test(roles.heading)
            && /IBM Plex Sans/.test(roles.prose)
            && !/IBM Plex Sans|Space Grotesk/.test(roles.code)
            && roles.displayLoaded
            && roles.textLoaded,
        'prose, headings and code resolve to three distinct typefaces',
        JSON.stringify(roles)
    );

    const hierarchy = await evaluate(`(async () => {
        await document.fonts.ready;
        const article = document.querySelector('.article');
        const content = document.querySelector('.article-content');
        const px = (el) => Number.parseFloat(getComputedStyle(el).fontSize);
        const sample = {};
        for (const size of ['compact', 'default', 'large']) {
            article.dataset.readerText = size;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            sample[size] = {
                body: px(content.querySelector('p')),
                h4: px(content.querySelector('h4')),
                h3: px(content.querySelector('h3')),
                h2: px(content.querySelector('h2'))
            };
        }
        article.dataset.readerText = 'default';
        return sample;
    })()`);
    check(
        ['compact', 'default', 'large'].every((size) => {
            const s = hierarchy[size];
            return s.h4 > s.body && s.h3 > s.h4 && s.h2 > s.h3;
        }),
        'heading hierarchy holds at every reader text size',
        JSON.stringify(hierarchy)
    );

    const icons = await evaluate(`(async () => {
        await document.fonts.ready;
        const probe = (ch) => {
            const span = document.createElement('span');
            span.textContent = ch;
            span.style.cssText = 'position:absolute;visibility:hidden;font-size:64px;'
                + 'font-family:var(--shell-font-icon)';
            document.body.appendChild(span);
            const width = span.getBoundingClientRect().width;
            span.remove();
            return width;
        };
        const notdef = probe('\\uFFFF');
        return {
            notdef,
            glyphs: ['▣', '☰', '⌕', '←', '→'].map((c) => [c, probe(c)])
        };
    })()`);
    check(
        icons.glyphs.every(([, w]) => w > 0 && Math.abs(w - icons.notdef) > 0.5),
        'iconographic glyphs render as symbols rather than tofu',
        JSON.stringify(icons)
    );
}

async function inspectAccessibilityTree() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const tree = await client.send('Accessibility.getFullAXTree');
    const exposed = (tree.nodes || []).filter((node) => !node.ignored);
    const interactiveRoles = new Set(['button', 'link']);
    const unnamedControls = exposed.filter((node) =>
        interactiveRoles.has(node.role?.value)
            && !(node.name?.value || '').trim()
    ).map((node) => node.role?.value);
    const roles = exposed.map((node) => node.role?.value);
    check(
        unnamedControls.length === 0,
        'the article accessibility tree has no unnamed links or buttons',
        JSON.stringify(unnamedControls)
    );
    check(
        roles.filter((role) => role === 'main').length === 1
            && roles.includes('banner')
            && roles.includes('contentinfo')
            && roles.includes('navigation'),
        'the article exposes one main region with banner, navigation, and footer landmarks',
        JSON.stringify(roles.filter((role) => ['main', 'banner', 'contentinfo', 'navigation'].includes(role)))
    );
}

async function inspectResponsiveBoundaries() {
    const cases = [
        ...[320, 440, 700, 701, 900, 901, 960, 961, 1440].map((width) => ['/', width]),
        ...[320, 440, 700, 701, 900, 901, 960, 961, 1440].map((width) => ['/tracing-the-edge-200ms-feedback-loop/', width]),
        ...[320, 701, 901, 961, 1440].map((width) => ['/topics/', width]),
        ...[320, 701, 961].map((width) => ['/archives/', width])
    ];
    const failures = [];
    for (const [path, width] of cases) {
        await navigate(path, width, 800);
        const state = await evaluate(`(async () => {
            window.scrollTo({top: 800, behavior: 'instant'});
            await new Promise((resolve) => setTimeout(resolve, 50));
            const parts = ['.site-brand', '.site-actions', '.site-nav']
                .map((selector) => document.querySelector(selector))
                .filter((element) => element && getComputedStyle(element).display !== 'none')
                .map((element) => {
                    const box = element.getBoundingClientRect();
                    return {left: box.left, right: box.right, top: box.top, bottom: box.bottom};
                });
            const overlaps = parts.some((left, index) => parts.slice(index + 1).some((right) =>
                Math.min(left.right, right.right) - Math.max(left.left, right.left) > 1
                    && Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top) > 1
            ));
            return {
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                overlaps,
                headerHeight: document.querySelector('.site-header')?.getBoundingClientRect().height || 0
            };
        })()`);
        if (state.overflow > 0 || state.overlaps || state.headerHeight > 80) {
            failures.push({path, width, ...state});
        }
    }
    check(
        failures.length === 0,
        'responsive breakpoint matrix has no horizontal overflow or header collisions',
        JSON.stringify(failures)
    );
}

async function inspectResponsiveCodeTypography() {
    const samples = [];
    for (const width of [390, 600, 1440]) {
        await navigate('/tracing-the-edge-200ms-feedback-loop/', width, 844);
        samples.push(await evaluate(`(() => {
            const article = document.querySelector('.article-content');
            const code = document.querySelector('.shell-code-block pre');
            const lineNumbers = document.querySelector('.code-line-numbers');
            const pixels = (element) => element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0;
            return {
                width: window.innerWidth,
                article: pixels(article),
                code: pixels(code),
                lineNumbers: pixels(lineNumbers)
            };
        })()`));
    }
    const [phone, mobile, desktop] = samples;
    check(
        phone.code === phone.lineNumbers
            && mobile.code === mobile.lineNumbers
            && phone.code <= mobile.code
            && mobile.code < desktop.code
            && mobile.code / mobile.article <= .8,
        'code typography scales with mobile prose and keeps line numbers aligned',
        JSON.stringify(samples)
    );
}

async function inspectRuntimeStability() {
    const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            window.__previewRuntimeErrors = [];
            window.addEventListener('error', (event) => {
                if (event.target !== window && !event.error) return;
                window.__previewRuntimeErrors.push(event.error?.stack || event.message || 'Unknown runtime error');
            });
            window.addEventListener('unhandledrejection', (event) => {
                window.__previewRuntimeErrors.push(String(event.reason?.stack || event.reason || 'Unhandled rejection'));
            });
        `
    });
    const runtimeFailures = [];
    try {
        for (const path of ['/', '/tracing-the-edge-200ms-feedback-loop/', '/topics/', '/archives/', '/definitely-not-a-preview-route/']) {
            await navigate(path, 390, 844);
            const errors = await evaluate(`(async () => {
                await new Promise((resolve) => setTimeout(resolve, 350));
                return window.__previewRuntimeErrors || [];
            })()`);
            if (errors.length) {
                runtimeFailures.push({path, errors});
            }
        }
    } finally {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
    }
    check(
        runtimeFailures.length === 0,
        'primary routes produce no runtime errors or unhandled rejections on mobile',
        JSON.stringify(runtimeFailures)
    );
    await navigate('/');
}

async function inspectNoScriptFallback() {
    let state = {};
    await client.send('Emulation.setScriptExecutionDisabled', {value: true});
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 844);
    } finally {
        await client.send('Emulation.setScriptExecutionDisabled', {value: false});
    }
    state = await evaluate(`(() => {
        const menu = document.querySelector('[data-menu]');
        const toggle = document.querySelector('[data-menu-toggle]');
        const code = document.querySelector('[data-post-content] pre code');
        const readerSettings = document.querySelector('[data-reader-settings]');
        return {
            menuDisplay: menu ? getComputedStyle(menu).display : 'none',
            toggleDisplay: toggle ? getComputedStyle(toggle).display : 'none',
            readerSettingsHidden: readerSettings?.hidden || false,
            articleReadable: Boolean(document.querySelector('[data-post-content]')?.textContent.trim()),
            codeReadable: Boolean(code?.textContent.trim())
        };
    })()`);
    check(
        state.menuDisplay !== 'none'
            && state.toggleDisplay === 'none'
            && state.readerSettingsHidden
            && state.articleReadable
            && state.codeReadable,
        'mobile navigation and technical content remain available without JavaScript',
        JSON.stringify(state)
    );
    await navigate('/');
}

async function inspectMobileInteractionStress() {
    await navigate('/', 390, 320);
    const navigation = await evaluate(`(() => {
        const menu = document.querySelector('[data-menu]');
        const list = menu?.querySelector('ul');
        const template = list?.querySelector('li');
        for (let index = 0; index < 12 && template; index += 1) {
            const clone = template.cloneNode(true);
            clone.querySelector('a').textContent = 'Additional navigation item ' + (index + 1);
            list.appendChild(clone);
        }
        document.querySelector('[data-menu-toggle]')?.click();
        const box = menu?.getBoundingClientRect();
        const style = menu && getComputedStyle(menu);
        return {
            open: menu?.classList.contains('is-open') || false,
            top: box?.top ?? -1,
            bottom: box?.bottom ?? -1,
            viewportHeight: window.innerHeight,
            scrollable: Boolean(menu && menu.scrollHeight > menu.clientHeight),
            overflowY: style?.overflowY || '',
            horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    })()`);
    check(
        navigation.open
            && navigation.top >= 0
            && navigation.bottom <= navigation.viewportHeight + 1
            && navigation.scrollable
            && /^(?:auto|scroll)$/.test(navigation.overflowY)
            && navigation.horizontalOverflow === 0,
        'an overfilled mobile menu stays inside a short landscape viewport and scrolls internally',
        JSON.stringify(navigation)
    );

    await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 500);
    const toc = await evaluate(`(() => {
        const toggle = document.querySelector('.toc__toggle');
        const toc = document.querySelector('[data-toc]');
        toggle?.click();
        toc?.querySelector('a')?.focus();
        document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
        const escapeClosed = toggle?.getAttribute('aria-expanded') === 'false';
        const escapeReturnedFocus = document.activeElement === toggle;
        if (toggle?.getAttribute('aria-expanded') === 'true') {
            toggle.click();
        }
        toggle?.click();
        document.querySelector('main')?.dispatchEvent(new MouseEvent('click', {bubbles: true}));
        return {
            escapeClosed,
            escapeReturnedFocus,
            outsideClickClosed: toggle?.getAttribute('aria-expanded') === 'false'
        };
    })()`);
    check(
        toc.escapeClosed && toc.escapeReturnedFocus && toc.outsideClickClosed,
        'mobile TOC closes predictably on Escape and outside interaction',
        JSON.stringify(toc)
    );

    await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 320);
    const openedLightbox = await evaluate(`(() => {
        const thumbnail = document.querySelector('[data-post-content] img.is-zoomable');
        thumbnail?.focus();
        thumbnail?.click();
        const dialog = document.querySelector('.image-lightbox');
        const box = dialog?.getBoundingClientRect();
        const controls = Array.from(dialog?.querySelectorAll('a, button') || [])
            .map((control) => control.getBoundingClientRect())
            .filter((box) => box.width > 0 && box.height > 0);
        return {
            open: dialog?.open || false,
            inViewport: Boolean(box
                && box.top >= -1
                && box.left >= -1
                && box.right <= window.innerWidth + 1
                && box.bottom <= window.innerHeight + 1),
            minimumControlSize: controls.length
                ? Math.min(...controls.map((box) => Math.min(box.width, box.height)))
                : 0
        };
    })()`);
    const closedLightbox = await evaluate(`(async () => {
        document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            cancelable: true
        }));
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
            open: document.querySelector('.image-lightbox')?.open || false,
            focusReturned: document.activeElement === document.querySelector('[data-post-content] img.is-zoomable')
        };
    })()`);
    check(
        openedLightbox.open
            && openedLightbox.inViewport
            && openedLightbox.minimumControlSize >= 32
            && !closedLightbox.open
            && closedLightbox.focusReturned,
        'image lightbox fits a landscape phone, closes on Escape, and restores focus',
        JSON.stringify({openedLightbox, closedLightbox})
    );
    await navigate('/');
}

async function inspectTechnicalContentStress() {
    const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            document.addEventListener('DOMContentLoaded', () => {
                const content = document.querySelector('[data-post-content]');
                if (!content) return;
                const heading = document.createElement('h5');
                heading.dataset.qualitySweep = 'long-heading';
                heading.textContent = 'packet_budget_' + 'x'.repeat(120);
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.className = 'language-shell';
                code.textContent = '// file: probes/' + 'nested/'.repeat(18) + 'capture-budget.sh\\n'
                    + 'printf "%s\\\\n" "' + '0123456789abcdef'.repeat(16) + '"';
                pre.dataset.qualitySweep = 'long-code';
                pre.appendChild(code);
                content.prepend(heading, pre);
            }, {once: true});
        `
    });
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/', 320, 600);
        const state = await evaluate(`(async () => {
            await new Promise((resolve) => setTimeout(resolve, 150));
            document.querySelector('.toc__toggle')?.click();
            const block = document.querySelector('[data-quality-sweep="long-code"]')?.closest('.shell-code-block');
            const pre = block?.querySelector('pre');
            const toolbar = block?.querySelector('.shell-code-toolbar');
            const filename = block?.querySelector('.shell-code-toolbar__file');
            const copy = block?.querySelector('.copy-code');
            const headingLink = Array.from(document.querySelectorAll('[data-toc] a'))
                .find((link) => link.textContent.startsWith('packet_budget_'));
            const blockBox = block?.getBoundingClientRect();
            const toolbarBox = toolbar?.getBoundingClientRect();
            const copyBox = copy?.getBoundingClientRect();
            return {
                pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
                blockInsideViewport: Boolean(blockBox && blockBox.left >= 0 && blockBox.right <= window.innerWidth),
                codeScrolls: Boolean(pre && pre.scrollWidth > pre.clientWidth),
                filenameClips: Boolean(filename
                    && filename.scrollWidth > filename.clientWidth
                    && getComputedStyle(filename).textOverflow === 'ellipsis'),
                copyInsideToolbar: Boolean(toolbarBox && copyBox
                    && copyBox.left >= toolbarBox.left
                    && copyBox.right <= toolbarBox.right),
                tocHeadingWraps: Boolean(headingLink && headingLink.scrollWidth <= headingLink.clientWidth + 1),
                minimumControlSize: Math.min(
                    copyBox ? Math.min(copyBox.width, copyBox.height) : 0,
                    document.querySelector('.toc__toggle')?.getBoundingClientRect().height || 0
                )
            };
        })()`);
        check(
            state.pageOverflow === 0
                && state.blockInsideViewport
                && state.codeScrolls
                && state.filenameClips
                && state.copyInsideToolbar
                && state.tocHeadingWraps
                && state.minimumControlSize >= 32,
            'long filenames, code lines, and technical headings stay contained and operable at 320 px',
            JSON.stringify(state)
        );
    } finally {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
    }
    await navigate('/');
}

async function inspectPremiumReadingTools() {
    const injection = await client.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `
            document.addEventListener('DOMContentLoaded', () => {
                const content = document.querySelector('[data-post-content]');
                if (!content) return;
                const pre = document.createElement('pre');
                const code = document.createElement('code');
                code.className = 'language-shell';
                code.textContent = '# file: diagnostics/long-running-probe.sh\\n'
                    + Array.from({length: 36}, (_, index) =>
                        'printf "probe-%02d\\\\n" ' + String(index + 1)
                    ).join('\\n');
                pre.dataset.qualitySweep = 'premium-code-tools';
                pre.appendChild(code);

                const anonymousPre = document.createElement('pre');
                const anonymousCode = document.createElement('code');
                anonymousCode.textContent = Array.from(
                    {length: 36},
                    (_, index) => 'probe_' + String(index + 1).padStart(2, '0') + '=remaining_budget'
                ).join('\\n');
                anonymousPre.dataset.qualitySweep = 'anonymous-code-tools';
                anonymousPre.appendChild(anonymousCode);

                // A collapsed listing whose lines are far wider than the column,
                // so the <pre> carries a horizontal scrollbar. The scrollbar used
                // to sit on top of the last previewed line.
                const widePre = document.createElement('pre');
                const wideCode = document.createElement('code');
                wideCode.className = 'language-shell';
                wideCode.textContent = Array.from(
                    {length: 40},
                    (_, index) => 'run --stage ' + (index + 1) + ' ' + '--flag=value'.repeat(24)
                ).join('\\n');
                widePre.dataset.qualitySweep = 'wide-code-tools';
                widePre.appendChild(wideCode);

                // One line, no language: the toolbar must not land on the code.
                const singlePre = document.createElement('pre');
                const singleCode = document.createElement('code');
                singleCode.textContent = 'binwalk -Me --dd=".*" firmware.img --directory=/tmp/out';
                singlePre.dataset.qualitySweep = 'single-line-code-tools';
                singlePre.appendChild(singleCode);

                // Box-drawing art with no language must never be auto-detected.
                const diagramPre = document.createElement('pre');
                const diagramCode = document.createElement('code');
                diagramCode.textContent = [
                    '    NO KPTI              KPTI ENABLED',
                    '┌───────────────┐      ┌──────────────┐',
                    '│  Kernel land  │ ───► │  User land   │',
                    '└───────────────┘      └──────────────┘'
                ].join('\\n');
                diagramPre.dataset.qualitySweep = 'diagram-code-tools';
                diagramPre.appendChild(diagramCode);

                content.prepend(diagramPre, singlePre, widePre, anonymousPre, pre);
            }, {once: true});
        `
    });
    try {
        await navigate('/tracing-the-edge-200ms-feedback-loop/');
        const codeTools = await evaluate(`(() => {
            const block = document.querySelector('[data-quality-sweep="premium-code-tools"]')
                ?.closest('.shell-code-block');
            const wrap = block?.querySelector('[data-code-wrap]');
            const expand = block?.querySelector('[data-code-expand]');
            const download = block?.querySelector('[data-code-download]');
            const numbers = block?.querySelector('.code-line-numbers');
            const anonymousBlock = document.querySelector('[data-quality-sweep="anonymous-code-tools"]')
                ?.closest('.shell-code-block');
            const anonymousToolbar = anonymousBlock?.querySelector('.shell-code-toolbar');
            const anonymousPre = anonymousBlock?.querySelector('pre');
            const anonymousCode = anonymousBlock?.querySelector('code');
            const anonymousNumbers = anonymousBlock?.querySelector('.code-line-numbers');
            const anonymousToolbarBox = anonymousToolbar?.getBoundingClientRect();
            const anonymousPreBox = anonymousPre?.getBoundingClientRect();
            const anonymousCodeBox = anonymousCode?.getBoundingClientRect();
            const anonymousNumbersBox = anonymousNumbers?.getBoundingClientRect();
            const expandBox = expand?.getBoundingClientRect();
            const before = {
                collapsed: block?.classList.contains('shell-code-block--collapsed') || false,
                expandLabel: expand?.textContent.replace(/\\s+/g, ' ').trim() || '',
                expandTarget: expand?.getAttribute('aria-controls') || '',
                targetExists: Boolean(document.getElementById(expand?.getAttribute('aria-controls') || '')),
                downloadName: download?.getAttribute('aria-label') || '',
                wrapPressed: wrap?.getAttribute('aria-pressed') || '',
                toolbarControls: block?.querySelectorAll('.shell-code-toolbar__actions button').length || 0,
                controls: block?.querySelectorAll('button').length || 0
            };
            const previewLines = Number.parseInt(
                getComputedStyle(document.documentElement).getPropertyValue('--code-preview-lines'),
                10
            );
            const anonymous = {
                marked: anonymousBlock?.classList.contains('shell-code-block--anonymous') || false,
                collapsed: anonymousBlock?.classList.contains('shell-code-block--collapsed') || false,
                filename: anonymousBlock?.dataset.filename || '',
                // Without a filename the language label is the block's identity,
                // so the header is present and names the listing.
                identityPresent: Boolean(anonymousBlock?.querySelector('.shell-code-toolbar__identity')),
                languageLabel: anonymousBlock
                    ?.querySelector('.shell-code-toolbar__language')?.textContent.trim() || '',
                toolbarLabels: Array.from(anonymousToolbar?.querySelectorAll('button') || [])
                    .map((button) => button.textContent.trim()),
                toolbarControls: anonymousBlock
                    ?.querySelectorAll('.shell-code-toolbar__actions button').length || 0,
                // The header sits in flow above the code. It is never absolutely
                // positioned, which is what used to let it overlap the source.
                toolbarPosition: anonymousToolbar ? getComputedStyle(anonymousToolbar).position : '',
                toolbarClearsCode: Boolean(anonymousToolbarBox && anonymousCodeBox
                    && anonymousToolbarBox.bottom <= anonymousCodeBox.top),
                // No reserved-but-empty band: the gap between the header and the
                // first line is just the <pre> padding.
                deadBandAboveCode: anonymousToolbarBox && anonymousCodeBox
                    ? Math.round(anonymousCodeBox.top - anonymousToolbarBox.bottom)
                    : -1,
                lineNumbersAlignToCode: Boolean(anonymousNumbersBox && anonymousPreBox
                    && Math.abs(anonymousPreBox.top - anonymousNumbersBox.top) <= 1),
                visibleLineNumbers: anonymousNumbersBox
                    ? Array.from(anonymousNumbers.children).filter((line) => {
                        const box = line.getBoundingClientRect();
                        return box.top >= anonymousNumbersBox.top
                            && box.bottom <= anonymousNumbersBox.bottom + 1;
                    }).length
                    : 0,
                paintedLineNumbers: anonymousNumbersBox
                    ? Array.from(anonymousNumbers.children).filter((line) =>
                        line.getBoundingClientRect().top < anonymousNumbersBox.bottom - 1
                    ).length
                    : 0
            };

            /*
             * A collapsed listing that scrolls horizontally: every line the
             * gutter counts has to be readable. Clamping the scrolling <pre>
             * put its scrollbar over the last line, so the gutter promised
             * sixteen lines while only fifteen could be read.
             */
            const wideBlock = document.querySelector('[data-quality-sweep="wide-code-tools"]')
                ?.closest('.shell-code-block');
            const widePre = wideBlock?.querySelector('pre');
            const wideCode = wideBlock?.querySelector('code');
            const wideNumbers = wideBlock?.querySelector('.code-line-numbers');
            const widePreBox = widePre?.getBoundingClientRect();
            const wideCodeBox = wideCode?.getBoundingClientRect();
            const wideLineHeight = wideNumbers?.firstElementChild?.getBoundingClientRect().height || 0;
            const wide = {
                collapsed: wideBlock?.classList.contains('shell-code-block--collapsed') || false,
                scrolls: Boolean(widePre && widePre.scrollWidth > widePre.clientWidth + 1),
                // The clipped code ends above the scrollbar, not behind it.
                lastLineClearsScrollbar: Boolean(widePreBox && wideCodeBox && widePre
                    && wideCodeBox.bottom <= widePreBox.top + widePre.clientHeight + 1),
                previewedRows: wideLineHeight
                    ? Math.round((wideCodeBox?.height || 0) / wideLineHeight)
                    : 0,
                // A scrolling region has to be reachable from the keyboard.
                keyboardReachable: widePre?.getAttribute('tabindex') === '0'
                    && Boolean(widePre?.getAttribute('aria-label'))
            };

            // One line and no language: the actions must not sit on the code.
            const singleBlock = document.querySelector('[data-quality-sweep="single-line-code-tools"]')
                ?.closest('.shell-code-block');
            const singleToolbarBox = singleBlock
                ?.querySelector('.shell-code-toolbar')?.getBoundingClientRect();
            const singleCodeBox = singleBlock?.querySelector('code')?.getBoundingClientRect();
            const single = {
                enhanced: Boolean(singleBlock),
                label: singleBlock?.querySelector('.shell-code-toolbar__language')?.textContent.trim() || '',
                actionsClearCode: Boolean(singleToolbarBox && singleCodeBox
                    && singleToolbarBox.bottom <= singleCodeBox.top)
            };

            // Box-drawing art carries no language, so nothing may tokenise it.
            const diagramBlock = document.querySelector('[data-quality-sweep="diagram-code-tools"]')
                ?.closest('.shell-code-block');
            const diagramCode = diagramBlock?.querySelector('code');
            const diagram = {
                enhanced: Boolean(diagramBlock),
                language: diagramBlock?.dataset.language ?? 'missing',
                label: diagramBlock?.querySelector('.shell-code-toolbar__language')?.textContent.trim() || '',
                tokenSpans: diagramCode?.querySelectorAll('[class*="hljs-"]').length ?? -1,
                autoDetectedClass: /language-/.test(diagramCode?.className || '')
            };
            const disclosure = {
                height: expandBox?.height || 0,
                sharesCodeSurface: Boolean(expand
                    && getComputedStyle(expand).backgroundColor === getComputedStyle(block?.querySelector('pre')).backgroundColor),
                direction: expand ? getComputedStyle(expand, '::after').content : ''
            };
            expand?.click();
            wrap?.click();
            return {
                before,
                anonymous,
                wide,
                single,
                diagram,
                disclosure,
                previewLines,
                expanded: expand?.getAttribute('aria-expanded') === 'true'
                    && !block?.classList.contains('shell-code-block--collapsed'),
                collapseLabel: expand?.textContent.replace(/\\s+/g, ' ').trim() || '',
                wrapped: block?.classList.contains('shell-code-block--wrapped') || false,
                wrapPressed: wrap?.getAttribute('aria-pressed') || '',
                // The label is fixed; aria-pressed alone carries the state.
                wrapLabel: wrap?.textContent.trim() || '',
                lineNumbersHidden: numbers ? getComputedStyle(numbers).display === 'none' : false,
                storedWrap: localStorage.getItem('the-shell-pro:code-wrap') || ''
            };
        })()`);
        check(
            codeTools.before.collapsed
                && /Show all 36 lines/.test(codeTools.before.expandLabel)
                && Boolean(codeTools.before.expandTarget)
                && codeTools.before.targetExists
                && codeTools.before.downloadName.includes('long-running-probe.sh')
                && codeTools.before.toolbarControls === 3
                && codeTools.before.controls === 4
                && codeTools.before.wrapPressed === 'false'
                && codeTools.anonymous.marked
                && codeTools.anonymous.collapsed
                && codeTools.anonymous.filename === ''
                && codeTools.anonymous.identityPresent
                && codeTools.anonymous.languageLabel === 'Plain text'
                && codeTools.anonymous.toolbarLabels.join(',') === 'Wrap,Copy'
                && codeTools.anonymous.toolbarControls === 2
                && codeTools.anonymous.toolbarPosition === 'static'
                && codeTools.anonymous.toolbarClearsCode
                && codeTools.anonymous.deadBandAboveCode >= 0
                && codeTools.anonymous.deadBandAboveCode <= 24
                && codeTools.anonymous.lineNumbersAlignToCode
                && codeTools.anonymous.visibleLineNumbers === codeTools.previewLines
                && codeTools.anonymous.paintedLineNumbers === codeTools.previewLines
                && codeTools.disclosure.height <= 36
                && codeTools.disclosure.sharesCodeSurface
                && /[↓⇣]/.test(codeTools.disclosure.direction)
                && codeTools.expanded
                && codeTools.collapseLabel === 'Collapse to ' + codeTools.previewLines + '-line preview'
                && codeTools.wrapped
                && codeTools.wrapPressed === 'true'
                && codeTools.wrapLabel === 'Wrap'
                && codeTools.lineNumbersHidden
                && codeTools.storedWrap === 'wrap',
            'every code block is titled, the header stays clear of the source, and long listings disclose cleanly',
            JSON.stringify(codeTools)
        );

        check(
            codeTools.wide.collapsed
                && codeTools.wide.scrolls
                && codeTools.wide.lastLineClearsScrollbar
                && codeTools.wide.previewedRows === codeTools.previewLines
                && codeTools.wide.keyboardReachable,
            'a collapsed listing that scrolls shows every previewed line above the scrollbar',
            JSON.stringify(codeTools.wide)
        );

        check(
            codeTools.single.enhanced
                && codeTools.single.label === 'Plain text'
                && codeTools.single.actionsClearCode,
            'a single-line listing keeps its controls clear of the code',
            JSON.stringify(codeTools.single)
        );

        check(
            codeTools.diagram.enhanced
                && codeTools.diagram.language === ''
                && codeTools.diagram.label === 'Plain text'
                && codeTools.diagram.tokenSpans === 0
                && !codeTools.diagram.autoDetectedClass,
            'listings without a declared language are never auto-detected or tokenised',
            JSON.stringify(codeTools.diagram)
        );

        /*
         * Collapsing a long listing removes height above the button that was
         * just pressed, so without a correction the reader is thrown down the
         * article by the collapsed distance. The block has to stay on screen.
         */
        const collapseAnchoring = await evaluate(`(async () => {
            const settle = () => new Promise((resolve) =>
                requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const block = document.querySelector('[data-quality-sweep="anonymous-code-tools"]')
                ?.closest('.shell-code-block');
            const expand = block?.querySelector('[data-code-expand]');
            const wrap = block?.querySelector('[data-code-wrap]');
            if (!block || !expand) {
                return {ran: false};
            }
            // Measure with wrapping off, then hand the page back in the state it
            // arrived in so the persistence check that follows still sees it.
            const wrapWasOn = wrap?.getAttribute('aria-pressed') === 'true';
            if (wrapWasOn) {
                wrap.click();
                await settle();
            }

            expand.click();
            await settle();
            const expandedHeight = Math.round(block.getBoundingClientRect().height);

            // Put the collapse control where a reader would have scrolled to it.
            expand.scrollIntoView({block: 'center', behavior: 'instant'});
            await settle();
            const buttonBefore = Math.round(expand.getBoundingClientRect().top);

            expand.click();
            await settle();
            const box = block.getBoundingClientRect();
            if (wrapWasOn) {
                wrap.click();
                await settle();
            }
            return {
                ran: true,
                wrapRestored: (wrap?.getAttribute('aria-pressed') === 'true') === wrapWasOn,
                expandedHeight,
                collapsedHeight: Math.round(box.height),
                collapsed: block.classList.contains('shell-code-block--collapsed'),
                buttonBefore,
                blockTop: Math.round(box.top),
                blockBottom: Math.round(box.bottom),
                viewport: Math.round(window.innerHeight),
                blockOnScreen: box.bottom > 0 && box.top < window.innerHeight,
                blockFullyVisible: box.top >= 0 && box.bottom <= window.innerHeight
            };
        })()`);
        check(
            collapseAnchoring.ran
                && collapseAnchoring.wrapRestored
                && collapseAnchoring.collapsed
                && collapseAnchoring.collapsedHeight < collapseAnchoring.expandedHeight
                && collapseAnchoring.blockOnScreen
                && collapseAnchoring.blockFullyVisible,
            'collapsing a long listing keeps the reader on the block instead of jumping down the article',
            JSON.stringify(collapseAnchoring)
        );

        const readerTools = await evaluate(`(async () => {
            const article = document.querySelector('.article');
            const content = document.querySelector('.article-content');
            const trigger = document.querySelector('[data-reader-settings]');
            const dialog = document.querySelector('[data-reader-dialog]');
            const footer = document.querySelector('.article-footer');
            const initialFontSize = Number.parseFloat(getComputedStyle(content).fontSize);
            trigger?.click();
            const touchTargets = Array.from(dialog?.querySelectorAll('button') || [])
                .map((button) => button.getBoundingClientRect())
                .filter((box) => box.width > 0 && box.height > 0);
            dialog?.querySelector('[data-reader-text="large"]')?.click();
            dialog?.querySelector('[data-reader-measure="wide"]')?.click();
            dialog?.querySelector('[data-reader-contrast="high"]')?.click();
            dialog?.querySelector('[data-reader-focus]')?.click();
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const applied = {
                text: article?.dataset.readerText || '',
                measure: article?.dataset.readerMeasure || '',
                contrast: article?.dataset.readerContrast || '',
                focus: document.body.classList.contains('reader-focus'),
                fontSize: Number.parseFloat(getComputedStyle(content).fontSize),
                endmatterHidden: footer ? getComputedStyle(footer).display === 'none' : false,
                triggerFixed: trigger ? getComputedStyle(trigger).position === 'fixed' : false,
                stored: localStorage.getItem('the-shell-pro:reader') || ''
            };
            dialog?.close();
            return {
                triggerVisible: Boolean(trigger && !trigger.hidden),
                triggerLabel: trigger?.textContent.replace(/\\s+/g, ' ').trim() || '',
                triggerAriaLabel: trigger?.getAttribute('aria-label') || '',
                triggerWidth: trigger?.getBoundingClientRect().width || 0,
                opened: dialog?.open || false,
                minimumTarget: touchTargets.length
                    ? Math.min(...touchTargets.map((box) => Math.min(box.width, box.height)))
                    : 0,
                initialFontSize,
                applied
            };
        })()`);
        check(
            readerTools.triggerVisible
                && /Reader/i.test(readerTools.triggerLabel)
                && /^Open reading controls$/i.test(readerTools.triggerAriaLabel)
                && readerTools.triggerWidth >= 80
                && readerTools.minimumTarget >= 32
                && readerTools.applied.text === 'large'
                && readerTools.applied.measure === 'wide'
                && readerTools.applied.contrast === 'high'
                && readerTools.applied.focus
                && readerTools.applied.fontSize > readerTools.initialFontSize
                && readerTools.applied.endmatterHidden
                && readerTools.applied.triggerFixed
                && /"text":"large"/.test(readerTools.applied.stored),
            'reader controls apply useful preferences and provide a distraction-free focus mode',
            JSON.stringify(readerTools)
        );

        await navigate('/tracing-the-edge-200ms-feedback-loop/');
        const persistence = await evaluate(`(() => {
            const article = document.querySelector('.article');
            const trigger = document.querySelector('[data-reader-settings]');
            const dialog = document.querySelector('[data-reader-dialog]');
            const restored = {
                text: article?.dataset.readerText || '',
                measure: article?.dataset.readerMeasure || '',
                contrast: article?.dataset.readerContrast || '',
                focus: document.body.classList.contains('reader-focus'),
                codeWrapped: Array.from(document.querySelectorAll('.shell-code-block'))
                    .every((block) => block.classList.contains('shell-code-block--wrapped'))
            };
            trigger?.click();
            dialog?.querySelector('[data-reader-reset]')?.click();
            dialog?.close();
            return {
                restored,
                reset: {
                    text: article?.dataset.readerText || '',
                    measure: article?.dataset.readerMeasure || '',
                    contrast: article?.dataset.readerContrast || '',
                    focus: document.body.classList.contains('reader-focus'),
                    stored: localStorage.getItem('the-shell-pro:reader')
                }
            };
        })()`);
        check(
            persistence.restored.text === 'large'
                && persistence.restored.measure === 'wide'
                && persistence.restored.contrast === 'high'
                && persistence.restored.focus
                && persistence.restored.codeWrapped
                && persistence.reset.text === 'default'
                && persistence.reset.measure === 'standard'
                && persistence.reset.contrast === 'normal'
                && !persistence.reset.focus
                && persistence.reset.stored === null,
            'reader and code preferences survive navigation and reset cleanly',
            JSON.stringify(persistence)
        );

        await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 844);
        const mobileReader = await evaluate(`(() => {
            const trigger = document.querySelector('[data-reader-settings]');
            const dialog = document.querySelector('[data-reader-dialog]');
            trigger?.click();
            const box = dialog?.getBoundingClientRect();
            const controls = Array.from(dialog?.querySelectorAll('button') || [])
                .map((button) => button.getBoundingClientRect())
                .filter((control) => control.width > 0 && control.height > 0);
            const state = {
                open: dialog?.open || false,
                inViewport: Boolean(box
                    && box.top >= -1
                    && box.left >= -1
                    && box.right <= window.innerWidth + 1
                    && box.bottom <= window.innerHeight + 1),
                minimumTarget: controls.length
                    ? Math.min(...controls.map((control) => Math.min(control.width, control.height)))
                    : 0,
                overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
            };
            dialog?.close();
            return state;
        })()`);
        check(
            mobileReader.open
                && mobileReader.inViewport
                && mobileReader.minimumTarget >= 32
                && mobileReader.overflow === 0,
            'reading controls remain touch-sized and contained on mobile',
            JSON.stringify(mobileReader)
        );
        await evaluate(`(() => {
            localStorage.removeItem('the-shell-pro:code-wrap');
            localStorage.removeItem('the-shell-pro:reader');
        })()`);
    } finally {
        await client.send('Page.removeScriptToEvaluateOnNewDocument', {identifier: injection.identifier});
    }
    await navigate('/');
}

async function inspectErrorPage() {
    await navigate('/definitely-not-a-preview-route/');
    const state = await evaluate(`(() => ({
        status: document.querySelector('.error-page h1')?.textContent.trim() || '',
        searchAction: Boolean(document.querySelector('.error-page [data-ghost-search]')),
        homeAction: Array.from(document.querySelectorAll('.error-page a')).some((link) => link.pathname === '/')
    }))()`);
    check(state.status === '404' && state.searchAction && state.homeAction, '404 page offers both search and recovery to home', JSON.stringify(state));
}

async function inspectLongArticle() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const state = await evaluate(`(async () => {
        const thumbnail = document.querySelector('[data-post-content] img');
        thumbnail?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        const related = document.querySelector('.related-post');
        const seriesLinks = document.querySelectorAll('.article-series a');
        const currentSeries = document.querySelectorAll('.article-series a[aria-current="page"]');
        const seriesStatus = document.querySelector('.article-series__status')?.textContent.trim() || '';
        const original = document.querySelector('.image-lightbox__original');
        const featureImage = document.querySelector('.article-feature-image img');
        const nasmCode = document.querySelector('[data-post-content] code.language-nasm');
        const nasmBlock = nasmCode?.closest('.shell-code-block');
        const lightboxOpen = document.querySelector('.image-lightbox')?.open || false;
        document.querySelector('.image-lightbox')?.close();
        const tocLinks = Array.from(document.querySelectorAll('[data-toc] a'));
        const deepHeadingLinks = [
            tocLinks.find((link) => link.hash === '#required-identity-fields'),
            tocLinks.find((link) => link.hash === '#cardinality-guardrail')
        ];
        const outlineTab = document.querySelector('[data-toc-view="outline"]');
        const artifactTab = document.querySelector('[data-toc-view="artifacts"]');
        artifactTab?.click();
        const artifactLinks = Array.from(document.querySelectorAll('.toc__artifact-list a'));
        const artifactPanel = document.querySelector('[data-toc-panel="artifacts"]');
        const artifactState = {
            tabs: document.querySelectorAll('.toc__tab').length,
            selected: artifactTab?.getAttribute('aria-selected') || '',
            visible: Boolean(artifactPanel && !artifactPanel.hidden),
            links: artifactLinks.length,
            uniqueTargets: new Set(artifactLinks.map((link) => link.hash)).size,
            typedLabels: artifactLinks.filter((link) =>
                /^(?:Code|Figure|Table|File|Evidence) \\d+/i.test(
                    link.textContent.replace(/\\s+/g, ' ').trim()
                )
            ).length
        };
        outlineTab?.click();
        const parentHeading = (link) =>
            link?.closest('li')?.parentElement?.closest('li')?.querySelector(':scope > a')?.hash || '';
        return {
            highlightLoaded: Array.from(document.scripts).some((script) => script.src.includes('highlight')),
            tocLinks: tocLinks.length,
            deepHeadingsPresent: deepHeadingLinks.every(Boolean),
            deepHeadingParents: deepHeadingLinks.map(parentHeading),
            artifactState,
            nasmFilename: nasmBlock?.querySelector('.shell-code-toolbar__file')?.textContent.trim() || '',
            nasmSource: nasmCode?.textContent || '',
            highlightedBlocks: document.querySelectorAll('[data-post-content] code[data-highlighted]').length,
            nasmHighlighted: nasmCode?.classList.contains('hljs') || false,
            lightboxOpen,
            originalLink: original?.href || '',
            originalLabel: original?.textContent.trim() || '',
            relatedAlignment: related ? getComputedStyle(related).justifyContent : '',
            seriesLinks: seriesLinks.length,
            currentSeries: currentSeries.length,
            seriesStatus,
            featurePriority: featureImage?.fetchPriority || ''
        };
    })()`);
    check(
        state.highlightLoaded && state.highlightedBlocks >= 6 && state.nasmHighlighted,
        'Highlight.js loads and highlights technical code, including NASM',
        JSON.stringify(state)
    );
    check(state.featurePriority === 'high', 'article feature image receives LCP fetch priority', state.featurePriority);
    check(state.tocLinks >= 6, 'long-article TOC is generated', String(state.tocLinks));
    check(
        state.deepHeadingsPresent
            && state.deepHeadingParents[0] === '#define-a-stable-span-contract'
            && state.deepHeadingParents[1] === '#required-identity-fields',
        'long-article TOC includes and nests H4/H5 waypoints',
        JSON.stringify(state)
    );
    check(
        state.artifactState.tabs === 2
            && state.artifactState.selected === 'true'
            && state.artifactState.visible
            && state.artifactState.links >= 8
            && state.artifactState.uniqueTargets === state.artifactState.links
            && state.artifactState.typedLabels === state.artifactState.links,
        'artifact-heavy articles gain a typed, uniquely linked companion to the outline',
        JSON.stringify(state.artifactState)
    );
    check(
        state.nasmFilename === 'probes/remaining_budget.asm'
            && !state.nasmSource.startsWith('; file:'),
        'NASM file metadata moves from the source comment into the code toolbar',
        JSON.stringify({filename: state.nasmFilename, sourceStart: state.nasmSource.slice(0, 48)})
    );
    check(state.lightboxOpen && state.originalLink && state.originalLabel.includes('original'), 'image dialog exposes the original asset', JSON.stringify(state));
    check(state.relatedAlignment === 'flex-start', 'related-post content is top-aligned', state.relatedAlignment);
    check(state.seriesLinks === 3, 'internal #series tags render a complete server-side research sequence', String(state.seriesLinks));
    check(state.currentSeries === 1 && /^Part \d+ of 3$/.test(state.seriesStatus), 'series navigation identifies the current part', JSON.stringify(state));

    const anchorState = await evaluate(`(async () => {
        const link = document.querySelector('[data-toc] a[href="#build-the-smallest-useful-probe"]');
        const target = document.querySelector('#build-the-smallest-useful-probe');
        link?.click();
        const deadline = performance.now() + 2000;
        while (target && performance.now() < deadline) {
            const top = target.getBoundingClientRect().top;
            if (top >= 78 && top <= 110) break;
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        const current = document.querySelectorAll('[data-toc] a[aria-current="location"]');
        return {
            linkFound: Boolean(link),
            targetTop: target?.getBoundingClientRect().top ?? -1,
            activeCount: current.length,
            activeHref: current[0]?.getAttribute('href') || ''
        };
    })()`);
    check(
        anchorState.linkFound
            && anchorState.targetTop >= 78
            && anchorState.targetTop <= 110
            && anchorState.activeCount === 1
            && anchorState.activeHref === '#build-the-smallest-useful-probe',
        'TOC jumps land below the sticky header with one active waypoint',
        JSON.stringify(anchorState)
    );

    await navigate('/tracing-the-edge-200ms-feedback-loop/', 1280, 600);
    const tocFollowState = await evaluate(`(async () => {
        const headings = Array.from(document.querySelectorAll('[data-post-content] h1, [data-post-content] h2, [data-post-content] h3, [data-post-content] h4, [data-post-content] h5'));
        const target = headings[headings.length - 1];
        const targetTop = window.scrollY + target.getBoundingClientRect().top - window.innerHeight * .25;
        window.dispatchEvent(new WheelEvent('wheel'));
        window.scrollTo({top: targetTop, behavior: 'instant'});
        await new Promise((resolve) => setTimeout(resolve, 150));
        const toc = document.querySelector('[data-toc]');
        const active = toc?.querySelector('a[aria-current="location"]');
        const tocBox = toc?.getBoundingClientRect();
        const activeBox = active?.getBoundingClientRect();
        return {
            expected: '#' + target.id,
            active: active?.getAttribute('href') || '',
            activeVisible: Boolean(
                tocBox && activeBox
                    && activeBox.top >= tocBox.top
                    && activeBox.bottom <= tocBox.bottom
            ),
            tocScroll: toc?.scrollTop || 0,
            pageScroll: window.scrollY
        };
    })()`);
    check(
        tocFollowState.active === tocFollowState.expected
            && tocFollowState.activeVisible
            && tocFollowState.tocScroll > 0,
        'desktop TOC keeps the active waypoint visible while reading',
        JSON.stringify(tocFollowState)
    );

    await navigate('/');
    await navigate('/tracing-the-edge-200ms-feedback-loop/#cardinality-guardrail');
    const directHashState = await evaluate(`(async () => {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const target = document.querySelector('#cardinality-guardrail');
        const active = document.querySelector('[data-toc] a[aria-current="location"]');
        return {
            targetTop: target?.getBoundingClientRect().top ?? -1,
            active: active?.getAttribute('href') || ''
        };
    })()`);
    check(
        directHashState.targetTop >= 78
            && directHashState.targetTop <= 110
            && directHashState.active === '#cardinality-guardrail',
        'direct deep links settle below the sticky header with the matching waypoint active',
        JSON.stringify(directHashState)
    );

    await navigate('/');
    await navigate('/tracing-the-edge-200ms-feedback-loop/#code-1');
    const artifactHashState = await evaluate(`(async () => {
        await new Promise((resolve) => setTimeout(resolve, 900));
        const target = document.querySelector('#code-1');
        const artifactTab = document.querySelector('[data-toc-view="artifacts"]');
        const active = document.querySelector('.toc__artifact-list a[aria-current="location"]');
        return {
            targetTop: target?.getBoundingClientRect().top ?? -1,
            tabSelected: artifactTab?.getAttribute('aria-selected') || '',
            active: active?.getAttribute('href') || '',
            scrollY: window.scrollY,
            documentHeight: document.documentElement.scrollHeight
        };
    })()`);
    check(
        artifactHashState.targetTop >= 78
            && artifactHashState.targetTop <= 110
            && artifactHashState.tabSelected === 'true'
            && artifactHashState.active === '#code-1',
        'direct artifact links open the artifact map and settle on the indexed target',
        JSON.stringify(artifactHashState)
    );

    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const copyFailureState = await evaluate(`(async () => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {writeText: () => Promise.reject(new Error('quality sweep rejection'))}
        });
        const button = document.querySelector('.copy-code');
        button?.click();
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {feedback: button?.textContent.trim() || ''};
    })()`);
    check(copyFailureState.feedback === 'Copy failed', 'copy controls report clipboard failure honestly', JSON.stringify(copyFailureState));

    await client.send('Emulation.setEmulatedMedia', {media: 'print'});
    const printState = await evaluate(`(() => ({
        headerDisplay: getComputedStyle(document.querySelector('.site-header')).display,
        tocDisplay: getComputedStyle(document.querySelector('.article-toc')).display,
        layoutDisplay: getComputedStyle(document.querySelector('.article-layout')).display,
        contentColor: getComputedStyle(document.querySelector('.article-content')).color
    }))()`);
    check(
        printState.headerDisplay === 'none'
            && printState.tocDisplay === 'none'
            && printState.layoutDisplay === 'block'
            && printState.contentColor === 'rgb(17, 17, 17)',
        'print view removes navigation chrome and uses readable light content',
        JSON.stringify(printState)
    );
    await client.send('Emulation.setEmulatedMedia', {media: 'screen'});

    await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 844);
    const mobileToc = await evaluate(`(() => {
        const container = document.querySelector('[data-toc-container]');
        const toggle = document.querySelector('.toc__toggle');
        toggle?.click();
        const deepLink = document.querySelector('[data-toc] a[href="#cardinality-guardrail"]');
        return {
            position: container ? getComputedStyle(container).position : '',
            top: container ? getComputedStyle(container).top : '',
            toggleHeight: toggle?.getBoundingClientRect().height || 0,
            expanded: toggle?.getAttribute('aria-expanded') === 'true',
            deepLinkHeight: deepLink?.getBoundingClientRect().height || 0,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
        };
    })()`);
    check(
        mobileToc.position === 'sticky'
            && mobileToc.toggleHeight >= 40
            && mobileToc.expanded
            && mobileToc.deepLinkHeight >= 40
            && mobileToc.overflow === 0,
        'mobile TOC exposes deep headings as touch-sized links without overflow',
        JSON.stringify(mobileToc)
    );
}

async function inspectEndmatter() {
    await navigate('/tracing-the-edge-200ms-feedback-loop/');
    const desktop = await evaluate(`(() => {
        const actions = document.querySelector('.article-actions');
        const strip = document.querySelector('.article-neighbours__strip');
        const stripBox = strip?.getBoundingClientRect();
        return {
            tagInsideTransmit: Boolean(actions?.querySelector('.article-actions__tags a')),
            standaloneTagsGone: !document.querySelector('section.article-tags'),
            stripHeight: stripBox ? Math.round(stripBox.height) : 0
        };
    })()`);
    check(desktop.tagInsideTransmit, 'transmit panel carries the post tags');
    check(desktop.standaloneTagsGone, 'standalone tags section is gone');
    check(desktop.stripHeight > 0 && desktop.stripHeight <= 88, 'continue-reading strip is a slim single row', String(desktop.stripHeight));

    await navigate('/tracing-the-edge-200ms-feedback-loop/', 390, 844);
    const mobile = await evaluate(`(() => {
        const links = Array.from(document.querySelectorAll('.article-neighbours__strip a'));
        const overflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
        if (links.length < 2) { return {stacked: links.length === 1, overflow}; }
        const [a, b] = links.map((link) => link.getBoundingClientRect());
        return {stacked: b.top >= a.bottom, overflow};
    })()`);
    check(mobile.stacked, 'continue-reading strip stacks on mobile');
    check(mobile.overflow <= 0, 'article page has no horizontal overflow on mobile', String(mobile.overflow));
}

async function inspectFooter() {
    await navigate('/');
    const desktop = await evaluate(`(() => {
        const footer = document.querySelector('.site-footer');
        const identity = footer?.querySelector('.site-footer__identity')?.getBoundingClientRect();
        const navigateColumn = footer?.querySelector('.site-footer__navigate');
        const navigateBox = navigateColumn?.getBoundingClientRect();
        const navLinks = navigateColumn ? Array.from(navigateColumn.querySelectorAll('.footer-nav__links a')) : [];
        const transmission = footer?.querySelector('.site-footer__transmission');
        const transmissionTime = transmission?.querySelector('a[href] time[datetime]');
        const transmissionHref = transmission?.querySelector('a[href]')?.getAttribute('href') || '';
        const pgp = footer?.querySelector('.site-footer__pgp');
        return {
            navLabels: navLinks.map((link) => link.textContent.trim()),
            minTarget: navLinks.length ? Math.min(...navLinks.map((link) => link.getBoundingClientRect().height)) : 0,
            sideBySide: Boolean(identity && navigateBox && navigateBox.left >= identity.right),
            transmissionDate: transmissionTime?.getAttribute('datetime') || '',
            transmissionHref,
            pgpText: pgp?.textContent.replace(/\\s+/g, ' ').trim() || '',
            railLinks: footer ? footer.querySelectorAll('.site-footer__rail a').length : 0,
            transmissionColorMatchesText: (() => {
                const link = transmission?.querySelector('a');
                if (!link) return false;
                const resolve = (value) => { const probe = document.createElement('span'); probe.style.color = value; document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
                return getComputedStyle(link).color === resolve('var(--shell-text)');
            })(),
            socialAnchors: Array.from(footer?.querySelectorAll('.site-footer__rail .social-links a') || []).map((link) => ({
                label: link.getAttribute('aria-label') || '',
                me: (link.getAttribute('rel') || '').split(' ').includes('me')
            })),
            socialTextLinkGone: !Array.from(footer?.querySelectorAll('.site-footer__rail a') || []).some((link) => link.textContent.trim() === 'Social'),
            memberLink: Array.from(footer?.querySelectorAll('.site-footer__rail a') || []).some((link) => link.textContent.trim() === 'Member account')
        };
    })()`);
    check(desktop.navLabels.length >= 2, 'footer navigate column renders the secondary navigation', JSON.stringify(desktop.navLabels));
    check(desktop.sideBySide, 'desktop footer places the navigate column beside the identity block');
    check(/^\d{4}-\d{2}-\d{2}$/.test(desktop.transmissionDate), 'footer last-transmission links the latest post with a dated time element', desktop.transmissionDate);
    check(/^\/[a-z0-9-]+\/$/.test(desktop.transmissionHref), 'footer last-transmission href targets a post permalink', desktop.transmissionHref);
    check(desktop.pgpText.includes('3F2A 91C4'), 'footer renders the PGP fingerprint from custom settings', desktop.pgpText);
    check(desktop.minTarget >= 32, 'footer navigate links are touch-sized', String(desktop.minTarget));
    check(desktop.transmissionColorMatchesText, 'footer transmission link uses the text color, not the muted color');
    check(desktop.railLinks >= 3, 'footer utility rail keeps the publication links', String(desktop.railLinks));
    check(desktop.socialAnchors.length >= 9, 'footer rail renders the social icon row', String(desktop.socialAnchors.length));
    check(desktop.socialAnchors.every((anchor) => anchor.label.length > 0), 'every social icon has an accessible label');
    check(desktop.socialAnchors.filter((anchor) => anchor.me).length >= 8, 'profile icons carry rel=me for identity verification', JSON.stringify(desktop.socialAnchors));
    check(desktop.socialTextLinkGone, 'the vague Social text link is gone');
    check(desktop.memberLink, 'member account link survives in the rail');

    await navigate('/', 390, 844);
    const mobile = await evaluate(`(() => {
        const footer = document.querySelector('.site-footer');
        const identity = footer?.querySelector('.site-footer__identity')?.getBoundingClientRect();
        const navigateBox = footer?.querySelector('.site-footer__navigate')?.getBoundingClientRect();
        return {stacked: Boolean(identity && navigateBox && navigateBox.top >= identity.bottom)};
    })()`);
    check(mobile.stacked, 'mobile footer stacks the navigate column below the identity block');
}

async function main() {
    await launchBrowser();
    await inspectSeoContracts();
    await inspectHome();
    await inspectMobileHome();
    await inspectCollapsedNavigation();
    await inspectShortArticle();
    await inspectAdaptiveArticleNavigation();
    await inspectListingImagePriority();
    await inspectPublicationEmbed();
    await inspectUnknownCodeFallback();
    await inspectUntypedCodeLabel();
    await inspectHighlighterFailureFallback();
    await inspectTypeRoles();
    await inspectAccessibilityTree();
    await inspectResponsiveBoundaries();
    await inspectResponsiveCodeTypography();
    await inspectRuntimeStability();
    await inspectNoScriptFallback();
    await inspectMobileInteractionStress();
    await inspectTechnicalContentStress();
    await inspectPremiumReadingTools();
    await inspectErrorPage();
    await inspectLongArticle();
    await inspectFooter();
    await inspectEndmatter();
    if (failures.length) {
        throw new Error(`${failures.length} preview check${failures.length === 1 ? '' : 's'} failed`);
    }
    console.log('All preview checks passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
}).finally(async () => {
    if (client?.socket) client.socket.close();
    if (browser && browser.exitCode === null) {
        const exited = once(browser, 'exit');
        browser.kill('SIGTERM');
        await exited;
    }
    if (profileDirectory) {
        await rm(profileDirectory, {recursive: true, force: true, maxRetries: 5, retryDelay: 100});
    }
});
