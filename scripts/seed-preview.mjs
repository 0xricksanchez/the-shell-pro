import {readFile} from 'node:fs/promises';

const baseUrl = process.env.GHOST_PREVIEW_URL || 'http://localhost:2369';
const apiUrl = `${baseUrl}/ghost/api/admin`;
const previewUser = {
    name: 'Preview Operator',
    email: 'preview@example.test',
    password: 'q7!Vx2#Lm9@Rk4$Nz8Wp'
};

function cookieHeader(response) {
    const cookies = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie')].filter(Boolean);

    return cookies.map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

async function request(path, options = {}) {
    const response = await fetch(`${apiUrl}${path}`, {
        ...options,
        headers: {
            'Accept-Version': 'v6.0',
            Origin: baseUrl,
            ...options.headers
        }
    });

    if (!response.ok) {
        throw new Error(`${options.method || 'GET'} ${path} failed (${response.status}): ${await response.text()}`);
    }

    return response;
}

async function waitForGhost() {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
        try {
            const response = await fetch(baseUrl);
            if (response.ok) {
                return;
            }
        } catch {
            // Ghost is still booting.
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error(`Ghost did not become ready at ${baseUrl} within 90 seconds`);
}

async function uploadPreviewImage(filename, cookie) {
    const file = await readFile(new URL(`../assets/imgs/${filename}`, import.meta.url));
    const form = new FormData();
    form.append('file', new Blob([file], {type: 'image/svg+xml'}), filename);
    form.append('purpose', 'image');

    const response = await request('/images/upload/', {
        method: 'POST',
        headers: {Cookie: cookie},
        body: form
    });
    const {images} = await response.json();
    if (!images || !images[0] || !images[0].url) {
        throw new Error(`Ghost did not return an image URL for ${filename}`);
    }
    return images[0].url;
}

async function createPreviewSession() {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        try {
            const session = await fetch(`${apiUrl}/session/`, {
                method: 'POST',
                headers: {
                    'Accept-Version': 'v6.0',
                    Origin: baseUrl,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    username: previewUser.email,
                    password: previewUser.password
                })
            });
            const cookie = cookieHeader(session);
            if (session.ok && cookie) {
                const identity = await fetch(`${apiUrl}/users/me/`, {
                    headers: {
                        'Accept-Version': 'v6.0',
                        Origin: baseUrl,
                        Cookie: cookie
                    }
                });
                if (identity.ok) {
                    return cookie;
                }
            }
        } catch {
            // Ghost is still completing its local startup.
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
    }
    throw new Error('Ghost did not establish an admin session within 30 seconds');
}

async function upsertEntry(resource, entry, cookie) {
    const existingResponse = await request(`/${resource}/?filter=slug:${entry.slug}&limit=1`, {
        headers: {Cookie: cookie}
    });
    const existingEntries = (await existingResponse.json())[resource];
    const existingEntry = existingEntries[0];
    const response = await request(existingEntry ? `/${resource}/${existingEntry.id}/?source=html` : `/${resource}/?source=html`, {
        method: existingEntry ? 'PUT' : 'POST',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            [resource]: [existingEntry ? {...entry, updated_at: existingEntry.updated_at} : entry]
        })
    });
    return (await response.json())[resource][0];
}

async function configurePreviewNavigation(cookie) {
    await request('/settings/', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            settings: [
                {
                    key: 'navigation',
                    value: JSON.stringify([
                        {label: 'Topics', url: `${baseUrl}/topics/`},
                        {label: 'About', url: `${baseUrl}/about-the-lab/`},
                        {label: 'AIScholar', url: 'https://aischolar.0x434b.dev/'}
                    ])
                },
                {
                    key: 'secondary_navigation',
                    value: JSON.stringify([
                        {label: 'Research notes', url: `${baseUrl}/tag/observability/`},
                        {label: 'Source', url: 'https://github.com/'}
                    ])
                }
            ]
        })
    });
}

async function configureCustomThemeSettings(cookie) {
    await request('/custom_theme_settings/', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Cookie: cookie
        },
        body: JSON.stringify({
            custom_theme_settings: [
                {key: 'pgp_fingerprint', value: '3F2A 91C4 D06B 5A7E 22C1 09AB 44E0 7F10 8C55 21DA'},
                {key: 'pgp_key_url', value: 'https://example.test/pgp.asc'},
                {key: 'social_github', value: 'https://github.com/example'},
                {key: 'social_twitter', value: 'https://x.com/example'},
                {key: 'social_bluesky', value: 'https://bsky.app/profile/example.test'},
                {key: 'social_mastodon', value: 'https://infosec.exchange/@example'},
                {key: 'social_linkedin', value: 'https://www.linkedin.com/in/example/'},
                {key: 'social_discord', value: 'https://discord.gg/example'},
                {key: 'social_hackthebox', value: 'https://app.hackthebox.com/profile/1337'},
                {key: 'social_custom_url', value: 'https://hackerone.com/example'},
                {key: 'social_custom_label', value: 'HackerOne'}
            ]
        })
    });
}

async function main() {
    await waitForGhost();

    const setup = await fetch(`${apiUrl}/authentication/setup/`, {
        method: 'POST',
        headers: {
            'Accept-Version': 'v6.0',
            Origin: baseUrl,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            setup: [{...previewUser, blogTitle: 'The Shell Pro — Preview'}]
        })
    });
    if (!setup.ok && ![400, 403, 422].includes(setup.status)) {
        throw new Error(`Preview setup failed (${setup.status}): ${await setup.text()}`);
    }

    const cookie = await createPreviewSession();
    console.log(`Admin session established with ${cookie.split('; ').map((part) => part.split('=', 1)[0]).join(', ')}`);
    await request('/themes/the-shell-pro/activate/', {
        method: 'PUT',
        headers: {Cookie: cookie}
    });
    await configurePreviewNavigation(cookie);
    await configureCustomThemeSettings(cookie);

    const telemetryImageUrl = await uploadPreviewImage('telemetry-loop.svg', cookie);
    const budgetImageUrl = await uploadPreviewImage('failure-budget.svg', cookie);
    const postHtml = `
        <p>Most systems become difficult to operate long before they become difficult to build. The first release has a few machines, a few endpoints, and one or two people who remember where every timeout came from. Then traffic rises, dependencies multiply, and the useful shape of the system is no longer visible from any single log line.</p>

        <p>This field note builds a small but realistic observability loop for a distributed service. It is intentionally opinionated: we will prefer a small number of durable signals over a large amount of decorative telemetry, and we will make every measurement answer an operational question.</p>

        <blockquote><p><strong>Lab environment:</strong> A disposable x86_64 Linux workload, a local collector, and synthetic request pressure. No production identifiers or traffic captures are required to reproduce the examples.</p></blockquote>

        <figure class="kg-card kg-image-card kg-width-wide">
            <img src="${telemetryImageUrl}" alt="Telemetry feedback loop from edge probe through ingest, event store and decision engine">
            <figcaption>A feedback loop is only useful when the decision reaches the component that can change behaviour.</figcaption>
        </figure>

        <h2>The operating question</h2>

        <p>Start with one sentence: <strong>can an operator explain why a request missed its latency target, while the request still matters?</strong> That sentence gives us a boundary. We need a trace for causality, a few metrics for scale, and a policy channel capable of reducing harm while an incident is in progress.</p>

        <p>The goal is not total visibility. Total visibility is expensive, noisy, and usually delayed. The goal is a compact control loop:</p>

        <ol>
            <li>observe one request at the edge;</li>
            <li>preserve enough context across asynchronous boundaries;</li>
            <li>derive a decision before the next wave of requests; and</li>
            <li>make the resulting policy visible to the people on call.</li>
        </ol>

        <h3>A trace is not a log</h3>

        <p>A trace answers <em>what happened to this operation?</em> A log captures a fact that may or may not belong to that operation. A metric answers <em>how often is this class of thing happening?</em> Collapsing the three into one stream gives you a storage problem disguised as an observability system.</p>

        <blockquote>
            <p>Instrumentation is a product surface for the future incident commander. Design it with the same care as the request path.</p>
        </blockquote>

        <h2>Model the path before instrumenting it</h2>

        <p>Draw the latency budget before adding SDK calls. We have a p95 target of <code>200 ms</code>, but a target without allocations is only an aspiration. The budget below makes the first useful trade-off explicit: the database is allowed to consume more time than name resolution, but neither is allowed to quietly borrow from rendering.</p>

        <figure class="kg-card kg-image-card kg-width-wide">
            <img src="${budgetImageUrl}" alt="Latency budget waterfall across DNS, TLS, request, database and rendering">
            <figcaption>Budgets make degraded behaviour discussable before a pager makes it urgent.</figcaption>
        </figure>

        <h3>Define a stable span contract</h3>

        <p>Keep attributes boring and bounded. An unbounded identifier belongs in a sampled event or a log record; it does not belong on every metric time series. The contract below is enough to connect a request to its route, tenant class, and retry behaviour without turning cardinality into the next outage.</p>

        <pre><code class="language-typescript">// file: src/telemetry/request-sample.ts
type RequestSample = {
  traceId: string;
  route: 'search' | 'document' | 'ingest';
  tenantClass: 'trial' | 'standard' | 'critical';
  attempt: number;
  deadlineMs: number;
};

export function beginRequest(sample: RequestSample) {
  return tracer.startActiveSpan('http.request', (span) =&gt; {
    span.setAttribute('http.route', sample.route);
    span.setAttribute('tenant.class', sample.tenantClass);
    span.setAttribute('retry.attempt', sample.attempt);
    span.setAttribute('request.deadline_ms', sample.deadlineMs);
    return span;
  });
}</code></pre>

        <h3>Make timeouts part of the protocol</h3>

        <p>A timeout should travel with the request rather than being rediscovered in each dependency. Subtract a little scheduling slack at every boundary, then fail locally when the remaining budget is no longer useful. This avoids a familiar failure mode: the client gives up at 200 ms while five downstream services continue working for another thirty seconds.</p>

        <blockquote><p><strong>Method:</strong> Treat the deadline as a decreasing capability. Each dependency receives only the remaining useful budget, with a small scheduling allowance removed at the boundary.</p></blockquote>

        <pre><code class="language-rust">// file: crates/gateway/src/budget.rs
fn remaining_budget(deadline: Instant, slack: Duration) -&gt; Result&lt;Duration, Error&gt; {
    let remaining = deadline.saturating_duration_since(Instant::now());
    remaining.checked_sub(slack).ok_or(Error::DeadlineExceeded)
}

let database_timeout = remaining_budget(request.deadline, Duration::from_millis(12))?;
let row = pool.query_with_timeout(query, database_timeout).await?;</code></pre>

        <h3>Recognise familiar machine code</h3>

        <p>Low-level posts often need a small instruction-level check beside the higher-level policy. The same code tools should handle NASM without forcing a different publishing path.</p>

        <pre><code class="language-nasm">; file: probes/remaining_budget.asm
BITS 64
global remaining_budget

remaining_budget:
    xor rax, rax
    sub rdi, rsi        ; deadline - slack
    cmovb rdi, rax      ; clamp negative budgets to zero
    mov rax, rdi
    ret</code></pre>

        <figure class="kg-card kg-code-card">
            <pre><code class="language-bash"># Ghost code cards are code artifacts, not numbered figures.
curl --silent --show-error https://collector.example.test/health</code></pre>
        </figure>

        <h2>Build the smallest useful probe</h2>

        <p>The probe runs at the edge because that is where all requests share a common clock and a common admission decision. It emits one root span, records the response class, and samples aggressively only when the system is unhealthy. Normal traffic stays cheap; anomalous traffic becomes easier to reconstruct.</p>

        <ul>
            <li>sample errors at <code>100%</code>;</li>
            <li>sample slow requests at <code>25%</code>;</li>
            <li>sample healthy requests at <code>1%</code>; and</li>
            <li>never sample based on a raw user identifier.</li>
        </ul>

        <h3>The decision has to be explainable</h3>

        <p>When the probe changes sampling or sheds optional work, record the decision alongside the request. The following policy is deliberately legible: a critical tenant keeps a higher sampling floor, while a lower-priority request can be sampled less often during an ingest backlog.</p>

        <pre><code class="language-javascript">// file: policies/sampling.js
function samplingRate({ status, durationMs, tenantClass, backlog }) {
  if (status &gt;= 500) return 1;
  if (durationMs &gt; 170) return 0.25;
  if (tenantClass === 'critical') return 0.05;
  if (backlog &gt; 10_000) return 0.002;
  return 0.01;
}</code></pre>

        <p>That function is not clever. That is an advantage. During an incident, a rule an operator can read beats a model that requires a separate incident to interpret.</p>

        <blockquote><p><strong>Finding:</strong> Error and tail-latency sampling give an operator a high-signal reconstruction path without making healthy traffic the most expensive data set in the system.</p></blockquote>

        <h2>Operate from a budget, not a dashboard</h2>

        <p>Dashboards are useful maps, but a runbook needs a decision table. The key is to pair a symptom with a discriminating next query, not merely another chart. A small table also gives the team a shared language for deciding when to rollback, throttle, or wait.</p>

        <table>
            <thead><tr><th>Observed symptom</th><th>First discriminating query</th><th>Immediate action</th></tr></thead>
            <tbody>
                <tr><td>p95 rises, error rate flat</td><td>Compare time in queue with time in database</td><td>Lower concurrency on the slow route</td></tr>
                <tr><td>Error rate rises after deploy</td><td>Group traces by release and exception class</td><td>Pause rollout, keep the trace sample at 100%</td></tr>
                <tr><td>Ingest backlog climbs</td><td>Inspect consumer lag and event age</td><td>Reduce healthy-request sampling</td></tr>
                <tr><td>Only one tenant is slow</td><td>Filter by tenant class, never raw tenant ID</td><td>Apply the documented fairness policy</td></tr>
            </tbody>
        </table>

        <h3>Verify the wire, not just the code</h3>

        <p>A local probe can look correct while headers are dropped by a proxy, a queue strips context, or the collector rejects an attribute. Verify each boundary with a small repeatable command. Keep it in the repository so the next person does not need to reconstruct it from a chat log.</p>

        <pre><code class="language-bash"># file: scripts/verify-trace-wire.sh
curl --silent --show-error http://localhost:4318/v1/traces \\
  --header 'content-type: application/json' \\
  --data @fixtures/slow-request.json \\
  | jq '.resourceSpans[0].scopeSpans[0].spans[0].name'

# Expected output: "http.request"</code></pre>

        <p>When the check fails, start with the smallest boundary: DNS, then TLS, then the request header, then the collector response. Use <kbd>Ctrl</kbd> + <kbd>C</kbd> only after capturing the trace identifier and the current policy revision.</p>

        <h2>Keep the event schema evolvable</h2>

        <p>Events outlive their first consumer. Include a schema version, preserve the original event time, and make additions optional. The consumer should reject malformed data loudly, but it should be able to tolerate a producer that has not rolled out yet.</p>

        <pre><code class="language-json">// file: schemas/telemetry-event.v3.json
{
  "schema_version": 3,
  "observed_at": "2026-07-28T08:42:19.441Z",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "route": "search",
  "duration_ms": 184,
  "policy_revision": "sampling-2026-07-28.2"
}</code></pre>

        <p>Do not encode a dashboard URL or a human explanation into the event. Store the durable facts and let the presentation layer evolve independently. This is especially important when an incident tool, a data warehouse, and a local developer script all consume the same event.</p>

        <blockquote><p><strong>Limitation:</strong> Sampling can explain an observed failure, but it cannot prove that an unsampled healthy request was identical. Treat every policy decision as an explicit trade-off.</p></blockquote>

        <h2>Evidence &amp; references</h2>

        <p>The following sources and artifacts are sufficient to review the assumptions in this note without relying on an opaque dashboard:</p>

        <ol>
            <li><a href="https://www.w3.org/TR/trace-context/">W3C Trace Context</a> — the interoperable request-context propagation model.</li>
            <li><a href="https://opentelemetry.io/docs/specs/otel/">OpenTelemetry Specification</a> — trace data model and instrumentation conventions.</li>
            <li><a href="#verify-the-wire-not-just-the-code">Wire-level verification procedure</a> — the minimal collector probe used in this article.</li>
            <li><a href="#keep-the-event-schema-evolvable">Event schema v3</a> — the durable event shape consumed by the policy loop.</li>
        </ol>

        <hr>

        <h2>What to carry forward</h2>

        <p>The interesting part of observability is not collecting more data. It is creating a short path from an unexpected condition to a reversible decision. A budget provides a constraint, traces provide causality, metrics show whether the condition is widespread, and a simple policy gives the system a way to protect itself.</p>

        <p>For the next iteration, add one real workload, one intentional dependency failure, and one operator who did not write the instrumentation. If they can explain the failure path from this page alone, the system is getting easier to run.</p>
    `.trim();

    const previewPost = {
        title: 'Tracing the edge: a 200 ms feedback loop for distributed systems',
        slug: 'tracing-the-edge-200ms-feedback-loop',
        custom_excerpt: 'A long-form field note on traces, latency budgets, adaptive sampling, and the small control loops that make systems easier to operate.',
        feature_image: telemetryImageUrl,
        feature_image_alt: 'Telemetry feedback loop diagram',
        feature_image_caption: 'The preview article uses a technical diagram as its feature image.',
        html: postHtml,
        status: 'published',
        tags: ['Observability', 'Systems', 'Architecture', 'Field Note', 'Preview']
    };
    const post = await upsertEntry('posts', previewPost, cookie);

    const previewEntries = [
        {resource: 'posts', entry: {
            title: 'Fault injection needs a smaller blast radius than production',
            slug: 'fault-injection-with-a-smaller-blast-radius',
            custom_excerpt: 'A short operating note on testing failure paths without borrowing production risk.',
            html: '<p>Run fault injection against a representative boundary, not the whole fleet. The smallest useful experiment gives you a known failure mode, a clear rollback, and an observation that can survive a handover.</p><blockquote><strong>Method:</strong> Start with one dependency and one reversible pressure signal before attempting a system-wide exercise.</blockquote><h2>Evidence &amp; references</h2><ol><li><a href="https://sre.google/sre-book/handling-overload/">Google SRE: Handling overload</a></li></ol>',
            status: 'published',
            tags: ['Observability', 'Systems', 'Lab Log', 'Preview']
        }},
        {resource: 'posts', entry: {
            title: 'The contract at a tracing boundary is a compatibility surface',
            slug: 'tracing-boundaries-are-compatibility-surfaces',
            custom_excerpt: 'Why trace context, timeout budgets, and event schemas deserve versioned contracts.',
            html: '<p>Instrumentation crosses proxies, queues, runtimes, and teams. Once another component relies on that context, the boundary becomes a compatibility surface rather than an implementation detail.</p><blockquote><strong>Finding:</strong> A short explicit contract prevents silent context loss more effectively than another dashboard.</blockquote><h2>Evidence &amp; references</h2><ol><li><a href="https://www.w3.org/TR/trace-context/">W3C Trace Context</a></li></ol>',
            status: 'published',
            tags: ['Observability', 'Architecture', 'Field Note', 'Preview']
        }},
        {resource: 'posts', entry: {
            title: 'Breaking a deliberately long technical title before it consumes the entire first viewport on a research note',
            slug: 'long-technical-title-preview',
            custom_excerpt: 'A preview fixture for long titles, unclassified post cards, and short articles without a table of contents.',
            html: '<p>A technical title should remain legible without pushing all useful article context below the fold.</p><h2>One compact result</h2><p>The title treatment should adapt while the body remains centred when there is no useful table of contents.</p>',
            status: 'published',
            tags: ['Interface Testing', 'Preview']
        }},
        {resource: 'pages', entry: {
            title: 'Topics',
            slug: 'topics',
            custom_excerpt: 'Browse the active research threads in this publication.',
            html: '<p>This directory is driven by ordinary Ghost tags. Add a public subject tag to a post and it becomes a browsable research thread; semantic post-type tags stay out of the directory.</p>',
            status: 'published'
        }},
        {resource: 'pages', entry: {
            title: 'Publications',
            slug: 'publications',
            custom_excerpt: 'A raw HTML-card fixture for responsive technical embeds.',
            html: '<ol><li>File system fuzzing applied to the BSD operating systems:</li></ol><iframe src="https://docs.google.com/presentation/d/e/2PACX-1vTj9Th51zNyOxsywQamc5S0wQ_mLM3KFVoMeFWuPYPFNaIS0qp53luTP40dE0lGPQ/embed?start=false&amp;loop=false&amp;delayms=3000" frameborder="0" width="1280" height="749" allowfullscreen="true"></iframe><p><a href="https://docs.google.com/presentation/d/e/2PACX-1vTj9Th51zNyOxsywQamc5S0wQ_mLM3KFVoMeFWuPYPFNaIS0qp53luTP40dE0lGPQ/pub?start=false&amp;loop=false&amp;delayms=3000">Open the presentation</a></p><h3>Misc. Disclosures</h3><ol><li>Example research disclosure</li></ol><h3>Villages</h3><ol><li>Example conference appearance</li></ol>',
            status: 'published'
        }},
        {resource: 'pages', entry: {
            title: 'About the lab',
            slug: 'about-the-lab',
            custom_excerpt: 'A compact static-page example with the same reading tools as a technical article.',
            feature_image: budgetImageUrl,
            feature_image_alt: 'Latency budget waterfall',
            feature_image_caption: 'Static pages may now carry a responsive feature image.',
            html: '<p>This page demonstrates how a normal Ghost Page can carry a cover image without becoming a bespoke theme route.</p><h2>Working principles</h2><p>Keep an experiment legible, preserve its evidence, and publish the smallest useful artifact.</p>',
            status: 'published'
        }}
    ];

    // Ghost updates shared post/tag relations in one transaction. Keeping the
    // preview writes sequential avoids MySQL deadlocks when fixtures share tags.
    for (const {resource, entry} of previewEntries) {
        await upsertEntry(resource, entry, cookie);
    }

    console.log(`Preview updated: ${new URL(post.url, baseUrl).href}`);
    console.log(`Topic directory: ${baseUrl}/topics/`);
}

main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
