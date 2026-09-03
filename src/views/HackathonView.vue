<script setup lang="ts">
import { computed } from 'vue'
import CopyButton from '../components/docs/CopyButton.vue'
import YouTubeDemo from '../components/docs/YouTubeDemo.vue'
import { demoVideoDurationSeconds, demoVideoScriptText, demoVideoSegments } from '../content/demo-video-script'
import { projectLinks, projectReadiness, youtubeEmbedUrl } from '../content/project'

const videoConfigured = computed(() => Boolean(youtubeEmbedUrl(projectLinks.youtubeUrl)))
const wordCount = demoVideoSegments.reduce((total, segment) => total + segment.narration.split(/\s+/).length, 0)
const highlights = [
  {
    title: 'Compare public medication facts',
    goal: 'Read the same topics for up to four medicines without switching between pages.',
    human: 'Choose medicines and fact rows, expand the source text, then download or print a report.',
    tools: ['cleardose_get_explorer_state', 'cleardose_select_drugs', 'cleardose_show_drug_fact'],
    outcome: 'The agent edits the same side-by-side table. The URL preserves the selected medicines and topics.',
    prompt: 'Compare Metformin and Jardiance in Drug Explorer. Show side effects and public pricing. Then only show their FDA-labeled interactions. Keep unavailable information explicit and do not recommend a treatment.',
  },
  {
    title: 'Inspect related catalog records',
    goal: 'Find shared catalog attributes, then inspect the actual source details.',
    human: 'Search generic or brand names and inspect related records on the medication page.',
    tools: ['search_medications', 'find_related_medications', 'compare_medications'],
    outcome: 'Results explain the matched field. Public sections and source records stay separate from fictional offers.',
    prompt: 'Search for atorvastatin and rosuvastatin. Refresh the available tools and compare their loaded public identity, clinical and source sections. Follow all continuation pages. Explain shared catalog attributes without suggesting they are interchangeable.',
  },
  {
    title: 'Compare one exact mock prescription',
    goal: 'Compare delivered totals for the same ingredient, form, strength and quantity.',
    human: 'Set the exact configuration, inspect pharmacy offers and choose an option.',
    tools: ['search_medications', 'compare_fulfillment_options', 'select_medication_option'],
    outcome: 'The selected offer, delivery option and fictional total remain visible in the interface.',
    prompt: 'In the fictional shop, find atorvastatin 20 mg tablets, quantity 90. Compare exact fulfillment options arriving within five days. Show the delivered totals and ask before selecting an offer.',
  },
  {
    title: 'Review a multi-item demo cart',
    goal: 'Check possible savings without comparing different medicines or changing the cart.',
    human: 'Add exact configurations, inspect delivery choices and review item-level totals.',
    tools: ['view_cart', 'compare_cart_savings'],
    outcome: 'Read-only savings results show the current cart against matching exact configurations. Changes remain separate actions.',
    prompt: 'Show my demo cart and compare each item with its lowest current delivered total for the same exact configuration. Explain possible savings without changing any cart items or checking out.',
  },
  {
    title: 'Prepare, review and confirm',
    goal: 'Keep consequential steps separate from discovery and comparison.',
    human: 'Review a local request card and the filled checkout form, then use Place demo order to confirm simulated checkout.',
    tools: ['create_prescription_request_card', 'view_cart', 'prepare_demo_checkout', 'get_order_status'],
    outcome: 'The agent fills the visible checkout form without creating an order. Human confirmation creates a local demo order and consumes the cart; no real order is sent.',
    prompt: 'Show the selected fictional offer and prepare a local prescription request summary. Read the demo cart, then use prepare_demo_checkout with the fictional details I provide. Stop for my review. I will use Place demo order myself. Read the existing order status only after confirmation.',
  },
]

const workflowComparisons = [
  {
    title: 'A medication comparison',
    manual: 'Choose medicines, add the same topics and read each source section.',
    screenAgent: 'Infer the selectors, locate each topic and inspect the table after edits.',
    webmcp: 'Read the current workspace revision, then submit the requested drugs and fact types.',
    benefit: 'One shared table shows the result. A stale revision rejects the edit instead of silently overwriting newer work.',
  },
  {
    title: 'An exact delivered price',
    manual: 'Keep form, strength and quantity identical while checking every delivery total.',
    screenAgent: 'Read several controls and prices, then infer which offer matches the selection.',
    webmcp: 'Call compare_fulfillment_options for an exact configuration and use the returned offer and delivery IDs.',
    benefit: 'The shared pricing code calculates the same total for the person and agent. Different configurations do not become a savings comparison.',
  },
  {
    title: 'A correction after a change',
    manual: 'Review the current cart line, choose another delivery option and check the new total.',
    screenAgent: 'Find the right row again and confirm which control belongs to it.',
    webmcp: 'Read view_cart, then use its current cartItemId and delivery alternatives in set_delivery_option.',
    benefit: 'The intended line is explicit. A failed step stops the chain, and a fresh read supplies the recovery context.',
  },
]

const architecture = [
  ['User request', 'The person states a goal to their connected browser agent.'],
  ['WebMCP discovery', 'App.vue registers the canonical static, dynamic and Explorer declarations.'],
  ['Schema-validated call', 'JSON Schemas describe inputs. Runtime checks validate IDs, bounds and current revisions.'],
  ['Shared application services', 'cleardose.actions.ts and medication.repository.ts serve both interface and tools.'],
  ['Pinia state', 'Selections, cart, comparisons and source status belong to the application.'],
  ['Visible interface update', 'Vue and Vue Router render the same state and preserve addressable comparison routes.'],
  ['Structured result', 'The tool returns bounded data, IDs, source status or a recoverable error.'],
]

const extensionSteps = [
  ['Add one supported action', 'Implement the shared action in src/services/cleardose.actions.ts, or a public-data read in src/services/medication.repository.ts. Give the person an equivalent interface action.'],
  ['Declare the tool and schema', 'Extend src/webmcp/definitions.ts for workflow tools, dynamic.ts for current-catalog reads, or explorer.ts for workspace edits. Add narrow inputs, effect annotations and representative arguments to the canonical definition.'],
  ['Connect an API through the adapter', 'Add provider work inside cleardose-data-plugin/src and configure it through src/plugins/cleardose.ts. Keep source stamps, cancellation, cache behavior and missing fields explicit. Do not fetch provider URLs from a view.'],
  ['Document the goal and chain', 'Add feature prompts and chained workflows in src/content/webmcp-workflows.ts. Add tool-specific guidance in src/webmcp/documentation.ts. The tool catalog is derived from canonical definitions, so a new declaration appears without a second registry. Reference real tool names and pass returned IDs between steps.'],
  ['Test the contract and the page', 'Add focused tests beside src/webmcp tools, ordered scenarios in tests/evals, and a shared-state browser journey in tests/e2e. Validate example arguments and documentation coverage before running the full release gate.'],
]

const setupCommands = 'pnpm install --frozen-lockfile\npnpm dev\npnpm typecheck\npnpm test\npnpm test:evals\npnpm exec playwright install chromium\npnpm test:e2e\npnpm build\nnpx netlify deploy --dir=dist --no-build\n# Review the preview before publishing the tested build.\nnpx netlify deploy --prod --dir=dist --no-build'
</script>

<template>
  <main id="main-content" class="hackathon-page" data-testid="hackathon-page">
    <header class="hackathon-hero">
      <div class="container hackathon-hero__grid">
        <div>
          <p class="eyebrow">ClearDose · WebMCP project</p>
          <h1>Medication comparisons.<span>A shared view.</span></h1>
          <p class="hackathon-lead">ClearDose helps people compare source-labeled medication information and fictional prescription offers in one visible workspace.</p>
          <p class="hackathon-tagline">Structured browser tools. The same state for the person and the agent.</p>
          <div class="hackathon-actions">
            <RouterLink to="/drugs/explore" class="button button--primary">Launch demo</RouterLink>
            <RouterLink to="/webmcp" class="button button--secondary">Explore WebMCP tools</RouterLink>
          </div>
          <div class="hackathon-links">
            <a v-if="projectLinks.repositoryUrl" :href="projectLinks.repositoryUrl" target="_blank" rel="noopener noreferrer">Public repository <span aria-hidden="true">↗</span></a>
            <span v-else>{{ projectReadiness.placeholders.repository }}</span>
            <a v-if="videoConfigured" :href="projectLinks.youtubeUrl" target="_blank" rel="noopener noreferrer">Watch demo video <span aria-hidden="true">↗</span></a>
            <a v-else href="#demo-video">Demo video pending</a>
          </div>
        </div>
        <aside class="hackathon-overview" aria-label="Project at a glance">
          <p class="eyebrow">The working idea</p>
          <h2>Ask. Compare.<br> Review together.</h2>
          <p>Read real public reference data. Inspect exact mock-shop totals. Keep every agent action connected to the interface.</p>
          <div class="hackathon-boundary"><strong>Public facts, fictional commerce.</strong><p>No diagnosis, treatment recommendation, real pharmacy order or payment.</p></div>
          <a href="#submission">Check submission readiness <span aria-hidden="true">↓</span></a>
        </aside>
      </div>
    </header>

    <nav class="container hackathon-jump" aria-label="Hackathon sections">
      <a href="#project">The project</a><a href="#showcase">What works</a><a href="#architecture">How it works</a><a href="#submission">Readiness</a><a href="#demo-video">Video and script</a><a href="#extend">Contribute</a>
    </nav>

    <div class="container hackathon-content">
      <section id="project" class="hackathon-section" aria-labelledby="project-title">
        <div class="hackathon-section-heading"><p class="eyebrow">The problem</p><h2 id="project-title">A comparison you can both see</h2></div>
        <div class="hackathon-two-column">
          <div class="hackathon-prose"><p>A patient or caregiver looking up medicines has to keep names, formulations, source dates and price meanings straight. An agent adds another risk if it acts on a hidden or outdated interpretation of the page.</p><p>ClearDose puts selected medicines in columns and requested facts in rows. The person and agent can change that same comparison, inspect original source text and prepare a report for discussion with a clinician.</p><p>The mock shop demonstrates a separate task: compare one exact configuration across fictional offers, build a multi-item cart and review delivered totals.</p></div>
          <aside class="hackathon-card"><h3>Why structured tools fit</h3><p>Medicine IDs, exact configurations and current workspace revisions matter more than where a button happens to sit. WebMCP exposes those inputs and returns IDs that the next action can use.</p><p>Before this connection, a screen-driving agent had to infer those relationships from controls and rendered text. Here, a declared tool contract carries them between steps.</p></aside>
        </div>
        <div class="hackathon-control-grid">
          <article><h3>The person controls</h3><p>Selections, visible fact rows, source expansion, report downloads, cart review and confirmation of simulated checkout.</p></article>
          <article><h3>The agent can</h3><p>Search, inspect public records, build a comparison, prepare a local request and propose or carry out requested demo-cart edits.</p></article>
          <article><h3>They share</h3><p>The same Pinia stores and service actions. Human edits become current tool context, and agent edits update the visible interface.</p></article>
        </div>
        <p class="hackathon-notice">Review and approval remain necessary for consequential actions. Documentation examples do not automatically place an order, remove a cart item or make a medical decision. Journey replay requires visible review and excludes checkout histories.</p>
      </section>

      <section id="showcase" class="hackathon-section" aria-labelledby="showcase-title">
        <div class="hackathon-section-heading"><p class="eyebrow">What works</p><h2 id="showcase-title">Five goals you can try</h2><p>Copy a goal to your connected agent. These cards do not run tools.</p></div>
        <div class="hackathon-showcase">
          <article v-for="(feature, index) in highlights" :key="feature.title" class="hackathon-card">
            <span class="hackathon-number" aria-hidden="true">{{ String(index + 1).padStart(2, '0') }}</span>
            <h3>{{ feature.title }}</h3><p>{{ feature.goal }}</p>
            <details><summary>Human action, tool chain and result</summary><dl><dt>Human interaction</dt><dd>{{ feature.human }}</dd><dt>WebMCP chain</dt><dd><ol class="hackathon-tool-list"><li v-for="(tool, toolIndex) in feature.tools" :key="`${tool}-${toolIndex}`"><code>{{ tool }}</code></li></ol></dd><dt>Visible outcome</dt><dd>{{ feature.outcome }}</dd></dl></details>
            <blockquote>{{ feature.prompt }}</blockquote>
            <CopyButton :text="feature.prompt" :label="`Copy ${feature.title.toLowerCase()} prompt`" />
          </article>
        </div>
      </section>

      <section id="workflow-comparison" class="hackathon-section" aria-labelledby="workflow-title">
        <div class="hackathon-section-heading"><p class="eyebrow">Old way vs. WebMCP</p><h2 id="workflow-title">Less guesswork between steps</h2><p>These are workflow comparisons, not measured speed or observation-count claims. The WebMCP page has an interactive example.</p></div>
        <div class="hackathon-comparisons">
          <article v-for="comparison in workflowComparisons" :key="comparison.title" class="hackathon-card">
            <h3>{{ comparison.title }}</h3><dl><dt>Manual workflow</dt><dd>{{ comparison.manual }}</dd><dt>Screenshot or DOM agent</dt><dd>{{ comparison.screenAgent }}</dd><dt>WebMCP workflow</dt><dd>{{ comparison.webmcp }}</dd></dl><p class="hackathon-benefit">{{ comparison.benefit }}</p>
          </article>
        </div>
      </section>

      <section id="architecture" class="hackathon-section" aria-labelledby="architecture-title">
        <div class="hackathon-section-heading"><p class="eyebrow">How it works</p><h2 id="architecture-title">One application, two ways to use it</h2></div>
        <ol class="hackathon-architecture" aria-label="Request to visible result architecture">
          <li v-for="(step, index) in architecture" :key="step[0]"><span aria-hidden="true">{{ index + 1 }}</span><div><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></div></li>
        </ol>
        <div class="hackathon-two-column hackathon-architecture-notes">
          <article class="hackathon-card"><h3>Actual stack and persistence</h3><p>Vue 3, Vue Router 5, Pinia 4, TypeScript and Vite. Netlify hosts the static application and rewrites deep links to the app shell.</p><p>Workflow state and bounded, redacted tool receipts stay in localStorage. Public records use the data plugin's IndexedDB cache, with an in-memory fallback.</p></article>
          <article class="hackathon-card"><h3>Data without a hidden model</h3><p><code>cleardose-data-plugin</code> adapts RxNorm identity, openFDA product and label data, and Medicaid NADAC benchmarks. The connected browser agent supplies the LLM. ClearDose has no app-side model API or application backend.</p><p>Public benchmark quotes never become cart offers. Mock prices and fulfillment remain labeled as fictional.</p></article>
        </div>
        <details class="hackathon-implementation"><summary>WebMCP implementation details</summary><dl>
          <dt>Registration and naming</dt><dd>Imperative registration through <code>document.modelContext.registerTool</code>. Workflow tools use descriptive snake_case names; Explorer tools use the <code>cleardose_</code> prefix. <code>App.vue</code> owns registration so route changes do not dispose the registry. The app does not create a separate declarative form registry.</dd>
          <dt>Schemas and validation</dt><dd>Canonical definitions include JSON Schemas, required properties, enums, bounds and representative arguments. Runtime parsers reject undeclared fields and invalid IDs. Context and workspace revisions prevent stale edits.</dd>
          <dt>Outputs and annotations</dt><dd>Tools return bounded structured results, current IDs and continuation offsets. Native annotations mark read-only behavior and untrusted source content. Local effect metadata also records destructive and idempotent behavior.</dd>
          <dt>State and consent</dt><dd>UI and tools call shared actions. No tool receives cross-origin exposure opt-in. Clinical data is reference material, not a medical decision. Simulated checkout is a separate consequential action requiring explicit intent and review.</dd>
          <dt>Errors and recovery</dt><dd>Errors identify invalid state and a next read or refresh step. Public provider failures retain available fields and source notices. An uncertain mutation is not automatically retried with a different execution format.</dd>
          <dt>Tests</dt><dd>Unit tests cover domain rules and registration. Deterministic evals cover chains, stale state, redaction and recovery. Browser tests check visible state, reload, mobile layout and UI/WebMCP parity. These tests do not constitute a clinical validation or a live-model benchmark.</dd>
        </dl></details>
      </section>

      <section class="hackathon-section hackathon-owner" aria-labelledby="possible-title">
        <p class="eyebrow">What this makes possible</p><h2 id="possible-title">I can keep the work visible</h2>
        <p>I built this foundation so a person can ask for a comparison, watch it take shape, change their mind and keep working with the agent. The agent does not need a private copy of the cart or a guess about which medicine is selected.</p><p>I can add a useful action once, put a human control beside it and expose the same action through a typed tool. The next step is broader, tested source coverage and better explanations of what each source can and cannot answer. Real pharmacy transactions or clinical recommendations would need separate integrations, consent controls and validation.</p>
      </section>

      <section id="submission" class="hackathon-section hackathon-submission" aria-labelledby="submission-title">
        <div class="hackathon-section-heading"><p class="eyebrow">Submission readiness</p><h2 id="submission-title">Ready to inspect. Not yet a complete submission.</h2><p>Publishing a page is not the same as finishing the submission. Missing items stay visible.</p></div>
        <ul class="hackathon-checklist">
          <li><span class="hackathon-state">Verified link</span><div><strong>Public live application</strong><p><a v-if="projectLinks.liveUrl" :href="projectLinks.liveUrl" target="_blank" rel="noopener noreferrer">{{ projectLinks.liveUrl }}</a><span v-else>{{ projectReadiness.placeholders.live }}</span>. Test the current release before submitting.</p></div></li>
          <li><span class="hackathon-state">On this page</span><div><strong>Project description and WebMCP case</strong><p>The problem, target user, principal workflow, experience improvements, human-and-agent controls and implementation explanation are documented above.</p></div></li>
          <li><span class="hackathon-state">Verified public</span><div><strong>Source repository</strong><p><a v-if="projectLinks.repositoryUrl" :href="projectLinks.repositoryUrl" target="_blank" rel="noopener noreferrer">{{ projectLinks.repositoryUrl }}</a><span v-else>{{ projectReadiness.placeholders.repository }}</span>. Public access checked {{ projectReadiness.repositoryPublicVerifiedOn }}.</p></div></li>
          <li><span class="hackathon-state" :class="{ 'hackathon-state--pending': !projectReadiness.sourceReleasePublished }">{{ projectReadiness.sourceReleasePublished ? 'Published' : 'Pending push' }}</span><div><strong>Complete source, assets and setup</strong><p v-if="!projectReadiness.sourceReleasePublished">This build's source, branded assets, README and setup updates must be published to the public repository before submission. A working deployment alone does not complete this item.</p><p v-else>The source-release configuration records publication. Check that the repository contains the same release as the live demo.</p></div></li>
          <li><span class="hackathon-state">Included in build</span><div><strong>Open-source license and README</strong><p>Read the <a href="/LICENSE.txt" target="_blank" rel="noopener noreferrer">{{ projectReadiness.license }} license</a>, an OSI-approved license. <code>README.md</code> documents installation, development, tests, build, deployment, browser requirements and contribution notes. Publish these files with the source release.</p></div></li>
          <li><span class="hackathon-state hackathon-state--pending">{{ videoConfigured ? 'Verify recording' : 'Not published' }}</span><div><strong>Public YouTube demo with audio, under three minutes</strong><p>{{ videoConfigured ? 'A video URL is configured. Verify public access, audible narration and duration before marking the submission complete.' : 'The 2:50 script is ready, but no public video URL is configured.' }} <code v-if="!videoConfigured">{{ projectReadiness.placeholders.youtube }}</code></p></div></li>
        </ul>
        <p class="hackathon-small">Submission links and readiness flags live in <code>src/content/project.ts</code>. Unknown URLs remain labeled placeholders; this page does not invent submission approval or judging results.</p>
      </section>

      <section id="demo-video" class="hackathon-section" aria-labelledby="video-title">
        <div class="hackathon-section-heading"><p class="eyebrow">The recording</p><h2 id="video-title">A 2:50 walkthrough</h2><p>{{ demoVideoDurationSeconds }} seconds planned, {{ wordCount }} spoken words. Record the primary WebMCP workflow without cuts, keep real source status visible and use no personal patient information.</p></div>
        <YouTubeDemo :url="projectLinks.youtubeUrl" />
        <details class="hackathon-script"><summary>Open the complete narrated recording script</summary><div class="hackathon-script-toolbar"><p>Canonical content: <code>src/content/demo-video-script.ts</code>. A matching copy is in <code>docs/demo-video-script.md</code>.</p><CopyButton :text="demoVideoScriptText" label="Copy complete recording script" /></div>
          <article v-for="segment in demoVideoSegments" :key="segment.time" class="hackathon-script-segment"><h3>{{ segment.time }}</h3><dl><dt>Screen action</dt><dd>{{ segment.screenAction }}</dd><dt>Exact narration</dt><dd class="hackathon-narration">{{ segment.narration }}</dd><dt>WebMCP tools</dt><dd><ol v-if="segment.tools.length" class="hackathon-tool-list"><li v-for="(tool, index) in segment.tools" :key="`${tool}-${index}`"><code>{{ tool }}</code></li></ol><span v-else>None. Presentation or human interface action.</span></dd><dt>Expected visible result</dt><dd>{{ segment.expectedResult }}</dd></dl></article>
        </details>
      </section>

      <section id="extend" class="hackathon-section" aria-labelledby="extend-title">
        <div class="hackathon-section-heading"><p class="eyebrow">Contribute</p><h2 id="extend-title">Extend the action, then the documentation</h2><p>Use the existing services, stores and registry. Do not add a parallel agent-only implementation.</p></div>
        <ol class="hackathon-extension"><li v-for="step in extensionSteps" :key="step[0]"><h3>{{ step[0] }}</h3><p>{{ step[1] }}</p></li></ol>
        <details class="hackathon-implementation"><summary>Installation, verification and deployment commands</summary><p>Use Node.js 20.19 or newer and pnpm 11.8. Public reference APIs need no app API key. Native tools require a compatible browser exposing <code>document.modelContext.registerTool</code>; the application still works without it.</p><p>The repository is already linked to its existing Netlify project. Authenticate the CLI if needed. Do not create another site for this workflow.</p><pre><code>{{ setupCommands }}</code></pre><CopyButton :text="setupCommands" label="Copy setup and release commands" /><p>No separate lint command is configured. Type checks, unit tests, deterministic evals, browser tests and the production build form the release gate.</p></details>
      </section>
    </div>
  </main>
</template>

<style scoped>
.hackathon-page { min-width: 0; background: var(--cd-background); }
.hackathon-page a:not(.button) { color: var(--cd-teal-deep); text-decoration: underline; text-underline-offset: 4px; }
.hackathon-hero { padding: clamp(36px, 6vw, 72px) 0; border-bottom: 1px solid var(--cd-border); background: linear-gradient(125deg, var(--cd-blue-pale), var(--cd-mint)); }
.hackathon-hero__grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(290px, .8fr); align-items: center; gap: clamp(30px, 5vw, 68px); }
.hackathon-hero h1 { margin-bottom: 24px; font-size: clamp(2.5rem, 5.5vw, 4.5rem); line-height: 1.03; }
.hackathon-hero h1 span { display: block; color: var(--cd-teal-dark); }
.hackathon-lead { max-width: 660px; margin-bottom: 18px; font-size: 1.1rem; }
.hackathon-tagline { color: var(--cd-muted-dark); font-size: .94rem; }
.hackathon-actions, .hackathon-links { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.hackathon-actions { margin: 26px 0 20px; }
.hackathon-links { gap: 14px 24px; font-size: .88rem; font-weight: 700; }
.hackathon-overview { padding: clamp(24px, 3vw, 36px); border: 1px solid var(--cd-border); border-radius: var(--cd-radius-xl); background: white; box-shadow: var(--cd-shadow-sm); }
.hackathon-overview h2 { margin-bottom: 20px; font-size: clamp(1.7rem, 3vw, 2.6rem); }
.hackathon-overview > a { font-size: .85rem; font-weight: 700; }
.hackathon-boundary { margin: 24px 0; padding: 16px; border-left: 3px solid var(--cd-teal); background: var(--cd-mint); font-size: .85rem; }
.hackathon-boundary p { margin: 4px 0 0; }
.hackathon-jump { display: flex; flex-wrap: wrap; gap: 12px 26px; padding-block: 22px; border-bottom: 1px solid var(--cd-border); font-size: .87rem; font-weight: 650; }
.hackathon-content { padding-bottom: 90px; }
.hackathon-section { padding-block: clamp(36px, 5vw, 60px); border-bottom: 1px solid var(--cd-border); scroll-margin-top: calc(var(--cd-header-height) + 24px); }
.hackathon-section:last-child { border-bottom: 0; }
.hackathon-section-heading { max-width: 790px; margin-bottom: 26px; }
.hackathon-section-heading h2 { margin-bottom: 16px; font-size: clamp(1.85rem, 3.8vw, 2.9rem); }
.hackathon-section-heading > p:last-child { margin-bottom: 0; color: var(--cd-muted-dark); }
.hackathon-two-column { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 24px; }
.hackathon-prose p:last-child { margin-bottom: 0; }
.hackathon-card { min-width: 0; padding: 24px; background: white; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-lg); }
.hackathon-card h3 { margin-bottom: 14px; line-height: 1.2; }
.hackathon-card p:last-child { margin-bottom: 0; }
.hackathon-control-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin-top: 28px; }
.hackathon-control-grid article { padding: 22px 0 6px; border-top: 2px solid var(--cd-teal); }
.hackathon-control-grid h3 { font-size: 1.12rem; }
.hackathon-control-grid p { font-size: .92rem; }
.hackathon-notice { margin: 22px 0 0; padding: 18px 22px; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-md); background: var(--cd-blue-soft); font-size: .88rem; }
.hackathon-showcase { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
.hackathon-showcase .hackathon-card { display: flex; flex-direction: column; }
.hackathon-number { margin-bottom: 18px; color: var(--cd-teal-dark); font-size: .82rem; font-weight: 750; letter-spacing: .1em; }
.hackathon-showcase details { margin-bottom: 20px; }
.hackathon-page summary { padding: 9px 0; color: var(--cd-teal-deep); font-weight: 700; }
.hackathon-page summary:focus-visible { outline: 3px solid var(--cd-focus); outline-offset: 3px; }
.hackathon-page details[open] > summary { margin-bottom: 12px; }
.hackathon-page dl { margin: 0; }
.hackathon-page dt { margin: 16px 0 5px; color: var(--cd-ink); font-size: .84rem; font-weight: 750; }
.hackathon-page dd { margin: 0; font-size: .9rem; }
.hackathon-page code { font-size: .85em; overflow-wrap: anywhere; }
.hackathon-tool-list { padding-left: 20px; margin-bottom: 0; }
.hackathon-tool-list li { margin-bottom: 6px; }
.hackathon-showcase blockquote { margin: auto 0 16px; padding: 16px; border-left: 3px solid var(--cd-teal); background: var(--cd-mint); font-size: .9rem; }
.hackathon-comparisons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 20px; }
.hackathon-benefit { margin: 22px 0 0; padding-top: 18px; border-top: 1px solid var(--cd-border); color: var(--cd-teal-deep); font-size: .9rem; }
.hackathon-architecture { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; padding: 0; list-style: none; counter-reset: none; }
.hackathon-architecture li { min-width: 0; padding: 19px; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-md); background: white; }
.hackathon-architecture li > span { display: inline-grid; place-items: center; width: 28px; height: 28px; margin-bottom: 15px; border-radius: 50%; background: var(--cd-mint); color: var(--cd-teal-deep); font-size: .85rem; font-weight: 750; }
.hackathon-architecture h3 { margin-bottom: 10px; font-size: 1rem; line-height: 1.3; letter-spacing: -.02em; }
.hackathon-architecture p { margin: 0; font-size: .84rem; overflow-wrap: anywhere; }
.hackathon-architecture-notes { margin-top: 26px; }
.hackathon-implementation, .hackathon-script { margin-top: 24px; padding: 18px 24px; border: 1px solid var(--cd-border); border-radius: var(--cd-radius-md); background: white; }
.hackathon-implementation > p { font-size: .9rem; }
.hackathon-owner { max-width: 860px; }
.hackathon-owner h2 { margin-bottom: 22px; font-size: clamp(1.85rem, 3.8vw, 2.9rem); }
.hackathon-owner p:last-child { margin-bottom: 0; }
.hackathon-submission { margin-top: 28px; padding-inline: clamp(20px, 4vw, 36px); border: 1px solid var(--cd-border); border-radius: var(--cd-radius-lg); background: var(--cd-blue-soft); }
.hackathon-checklist { margin: 0; padding: 0; list-style: none; }
.hackathon-checklist > li { display: grid; grid-template-columns: 135px minmax(0, 1fr); gap: 20px; padding: 22px 0; border-top: 1px solid var(--cd-border); }
.hackathon-checklist strong { color: var(--cd-ink); }
.hackathon-checklist p { margin: 6px 0 0; font-size: .9rem; overflow-wrap: anywhere; }
.hackathon-state { align-self: start; width: fit-content; padding: 4px 9px; border: 1px solid #a6d2c7; border-radius: 6px; background: var(--cd-mint); color: var(--cd-teal-deep); font-size: .74rem; font-weight: 750; }
.hackathon-state--pending { border-color: #d9bf76; background: var(--cd-warning-soft); color: #785000; }
.hackathon-small { margin: 18px 0 0; color: var(--cd-muted-dark); font-size: .8rem; overflow-wrap: anywhere; }
.hackathon-script-toolbar { display: flex; align-items: start; justify-content: space-between; flex-wrap: wrap; gap: 12px; }
.hackathon-script-toolbar p { max-width: 580px; margin: 0; font-size: .82rem; }
.hackathon-script-segment { margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--cd-border); }
.hackathon-script-segment h3 { margin-bottom: 16px; color: var(--cd-teal-deep); }
.hackathon-page .hackathon-narration { padding: 18px; border-left: 3px solid var(--cd-teal); background: var(--cd-mint); font-size: .98rem; }
.hackathon-extension { padding-left: 24px; }
.hackathon-extension li { margin-bottom: 22px; padding-left: 8px; }
.hackathon-extension h3 { margin-bottom: 10px; font-size: 1.1rem; }
.hackathon-extension p { max-width: 880px; margin-bottom: 0; font-size: .92rem; overflow-wrap: anywhere; }
.hackathon-page pre { max-width: 100%; padding: 18px; overflow: auto; border-radius: var(--cd-radius-sm); background: var(--cd-navy); color: white; white-space: pre; }
@media (max-width: 1000px) { .hackathon-hero__grid { grid-template-columns: minmax(0, 1.2fr) minmax(250px, .8fr); gap: 28px; } .hackathon-comparisons { grid-template-columns: 1fr; } .hackathon-comparisons dl { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 10px 16px; } .hackathon-comparisons dt, .hackathon-comparisons dd { margin: 0; } .hackathon-architecture { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 760px) { .hackathon-hero__grid, .hackathon-two-column, .hackathon-control-grid, .hackathon-showcase { grid-template-columns: 1fr; } .hackathon-hero h1 br { display: none; } .hackathon-overview h2 br { display: none; } .hackathon-control-grid { gap: 6px; } .hackathon-architecture { grid-template-columns: repeat(2, minmax(0, 1fr)); } .hackathon-actions .button { min-width: 0; } .hackathon-card { padding: 20px; } .hackathon-checklist > li { grid-template-columns: 1fr; gap: 10px; } }
@media (max-width: 430px) { .hackathon-page .container { width: calc(100% - 32px); } .hackathon-hero h1 { font-size: 2.35rem; } .hackathon-actions { align-items: stretch; flex-direction: column; } .hackathon-architecture { grid-template-columns: 1fr; } .hackathon-architecture li { display: flex; align-items: start; gap: 14px; } .hackathon-architecture li > span { flex: 0 0 28px; margin: 0; } .hackathon-comparisons dl { display: block; } .hackathon-comparisons dt { margin: 16px 0 5px; } .hackathon-implementation, .hackathon-script { padding: 16px; } }
@media (prefers-reduced-motion: reduce) { .hackathon-page * { scroll-behavior: auto !important; } }
@media print { .hackathon-page, .hackathon-hero, .hackathon-card, .hackathon-submission, .hackathon-overview { color: #222; background: white; box-shadow: none; } .hackathon-page .container { width: 100%; max-width: none; } .hackathon-hero { padding: 14px 0; } .hackathon-hero h1 { font-size: 30pt; } .hackathon-actions, .hackathon-jump, .hackathon-script-toolbar { display: none; } .hackathon-section { padding-block: 22px; } .hackathon-section h2 { font-size: 20pt; } .hackathon-hero__grid, .hackathon-two-column, .hackathon-control-grid, .hackathon-showcase, .hackathon-comparisons { display: block; } .hackathon-card, .hackathon-overview { margin-bottom: 14px; break-inside: avoid; } .hackathon-architecture { grid-template-columns: repeat(3, minmax(0, 1fr)); } .hackathon-page details::details-content { content-visibility: visible; } .hackathon-page details > summary { list-style: none; } .hackathon-page h2, .hackathon-page h3, .hackathon-page dt { break-after: avoid; } .hackathon-checklist > li, .hackathon-script-segment { break-inside: avoid; } .hackathon-page pre { white-space: pre-wrap; overflow-wrap: anywhere; color: #222; background: #f6f6f6; } }
</style>
