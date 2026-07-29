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
        this.listeners = new Map();
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
            const listeners = this.listeners.get(message.method) || [];
            listeners.forEach((listener) => listener(message.params));
        });
    }

    send(method, params = {}) {
        const id = this.nextId++;
        return new Promise((resolve, reject) => {
            this.pending.set(id, {resolve, reject});
            this.socket.send(JSON.stringify({id, method, params}));
        });
    }

    waitFor(method, timeoutMs = 10_000) {
        return new Promise((resolve, reject) => {
            const listeners = this.listeners.get(method) || [];
            const timeout = setTimeout(() => {
                this.listeners.set(method, listeners.filter((item) => item !== listener));
                reject(new Error(`Timed out waiting for ${method}`));
            }, timeoutMs);
            const listener = (params) => {
                clearTimeout(timeout);
                this.listeners.set(method, listeners.filter((item) => item !== listener));
                resolve(params);
            };
            listeners.push(listener);
            this.listeners.set(method, listeners);
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
    const loaded = client.waitFor('Page.loadEventFired', 20_000);
    await client.send('Page.navigate', {url: new URL(path, baseUrl).href});
    await loaded;
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
            internalMarkedExternal
        };
    })()`);

    check(state.title === 'The Shell Pro — Preview', 'homepage document title is populated', state.title);
    check(!state.highlightLoaded, 'Highlight.js stays off listing pages');
    check(!state.fallbackBadge, 'unclassified cards omit the fallback Research note badge');
    check(state.readBelowExcerpt && state.readAlignedWithCopy, 'desktop Read entry link sits below the excerpt', state.bodyColumns);
    check(state.backToTopFixed && state.backToTopNearBottomRight, 'desktop back-to-top floats bottom-right');
    check(state.externalMarked && !state.internalMarkedExternal, 'only external navigation is visibly marked');
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
        toggle?.click();
        return {
            toggleDisplay: toggle ? getComputedStyle(toggle).display : 'none',
            menuOpen: menu?.classList.contains('is-open') || false,
            menuDisplay: menu ? getComputedStyle(menu).display : 'none',
            subscribeDisplay: subscribe ? getComputedStyle(subscribe).display : 'none'
        };
    })()`);
    check(state.toggleDisplay !== 'none' && state.menuOpen && state.menuDisplay !== 'none', 'navigation collapses and opens cleanly at 920 px', JSON.stringify(state));
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
            updatedVisible: Boolean(document.querySelector('.article-meta__updated'))
        };
    })()`);
    check(state.collapsed && state.centredOffset <= 3, 'short articles collapse the empty TOC rail and centre their content', JSON.stringify(state));
    check(state.longTitle, 'very long article titles receive the compact title treatment');
    check(!state.updatedVisible, 'posts do not claim an update without the #updated tag');
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
        const original = document.querySelector('.image-lightbox__original');
        const lightboxOpen = document.querySelector('.image-lightbox')?.open || false;
        document.querySelector('.image-lightbox')?.close();
        return {
            highlightLoaded: Array.from(document.scripts).some((script) => script.src.includes('highlight')),
            tocLinks: document.querySelectorAll('[data-toc] a').length,
            lightboxOpen,
            originalLink: original?.href || '',
            originalLabel: original?.textContent.trim() || '',
            relatedAlignment: related ? getComputedStyle(related).justifyContent : ''
        };
    })()`);
    check(state.highlightLoaded, 'Highlight.js remains available on articles');
    check(state.tocLinks >= 6, 'long-article TOC is generated', String(state.tocLinks));
    check(state.lightboxOpen && state.originalLink && state.originalLabel.includes('original'), 'image dialog exposes the original asset', JSON.stringify(state));
    check(state.relatedAlignment === 'flex-start', 'related-post content is top-aligned', state.relatedAlignment);

    const anchorState = await evaluate(`(async () => {
        const link = document.querySelector('[data-toc] a[href="#build-the-smallest-useful-probe"]');
        link?.click();
        await new Promise((resolve) => setTimeout(resolve, 900));
        const target = document.querySelector('#build-the-smallest-useful-probe');
        const current = document.querySelectorAll('[data-toc] a[aria-current="location"]');
        return {
            targetTop: target?.getBoundingClientRect().top ?? -1,
            activeCount: current.length,
            activeHref: current[0]?.getAttribute('href') || ''
        };
    })()`);
    check(
        anchorState.targetTop >= 78
            && anchorState.targetTop <= 110
            && anchorState.activeCount === 1
            && anchorState.activeHref === '#build-the-smallest-useful-probe',
        'TOC jumps land below the sticky header with one active waypoint',
        JSON.stringify(anchorState)
    );

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
        return {
            position: container ? getComputedStyle(container).position : '',
            top: container ? getComputedStyle(container).top : '',
            toggleHeight: toggle?.getBoundingClientRect().height || 0
        };
    })()`);
    check(mobileToc.position === 'sticky' && mobileToc.toggleHeight >= 40, 'mobile TOC remains reachable as a sticky, touch-sized control', JSON.stringify(mobileToc));
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
            railLinks: footer ? footer.querySelectorAll('.site-footer__rail .site-footer__links a').length : 0,
            transmissionColorMatchesText: (() => {
                const link = transmission?.querySelector('a');
                if (!link) return false;
                const resolve = (value) => { const probe = document.createElement('span'); probe.style.color = value; document.body.appendChild(probe); const c = getComputedStyle(probe).color; probe.remove(); return c; };
                return getComputedStyle(link).color === resolve('var(--shell-text)');
            })()
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
    await inspectHome();
    await inspectMobileHome();
    await inspectCollapsedNavigation();
    await inspectShortArticle();
    await inspectErrorPage();
    await inspectLongArticle();
    await inspectFooter();
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
