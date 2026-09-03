# ClearDose documentation release verification

## Scope

Updated the existing `/webmcp` Agent Lab and added `/hackathon`. Kept the app shell, Vue router, Pinia stores, shared actions, public data adapters, tool names, native registration and existing Netlify project.

The documentation covers 19 canonical tools when the catalog is populated and 17 when it is empty. Native availability is a separate live status. The page has ten goal groups, five chained workflows, schema-backed examples, copy controls, result fixtures, recovery guidance and a live inspector.

Only `view_cart` and `cleardose_get_explorer_state` can run as documentation examples. The other 17 examples open a preview without creating prerequisites or making provider requests. Demo replays now show a review dialog before running shared local actions. They never submit checkout.

## Verification

- Type checks passed.
- 344 unit tests passed across 39 files.
- 18 deterministic workflow evaluations passed across three files.
- Production build passed.
- All 36 browser tests passed in the final stable-tree run, including the five new documentation tests. The complete `pnpm verify` command exited successfully.
- Documentation tests compare all 19 cards with a browser-registry fixture and validate every current example against its canonical schema.
- Tests cover all 17 restricted previews without state changes, two native read shortcuts, registration across routes, keyboard dialogs, clipboard errors and responsive widths 320, 390, 900 and 1440.
- YouTube placeholder and configured privacy-enhanced embed states passed component tests. No video is configured, so public playback was not tested.
- Asset tests verify real ICO structure, image dimensions, manifest and license parity. The social image is 1200 by 630 pixels; the Apple icon is 180 by 180.
- No lint command exists in this repository. `git diff --check` and the hosted-verification script syntax check passed.

## Hosted preview

Initial preview: https://6a98ed590d543b8a6dc35364--cleardose-webmcp-demo.netlify.app

Native browser tools, not a simulated registry, completed this chain on the preview:

| Step | Arguments | Observed result |
| --- | --- | --- |
| `cleardose_get_explorer_state` | `section: workspace` | Empty workspace; current revision returned; inspector recorded success |
| `cleardose_select_drugs` | Current revision, `drugs: [Metformin, Jardiance]`, `mode: replace` | Two selected medications; route changed to Drug Explorer |
| `cleardose_show_drug_fact` | Returned revision, `facts: [side-effects, pricing]`, `mode: replace` | Two fact rows, four available results, zero provider failures |
| `cleardose_show_drug_fact` | Returned revision, `facts: [interactions]`, `mode: replace` | One fact row, two available FDA label sections, zero provider failures |
| `cleardose_get_explorer_state` | `section: selected`, after navigating to `/hackathon` | Same selected medications and workspace revision, with `/hackathon` as the current route |

The report displayed source notices. Metformin had partial-source notices and NADAC had coverage notices; these were not hidden or converted into claims of completeness. These are individual FDA-label interaction sections, not a pairwise clinical interaction check.

The preview console had no errors or warnings during the native chain and route checks. No browser connection failed during this verification. Production cart and order state were not changed.

Nine static assets and both documentation routes returned HTTP 200 and matched the local build. The initial preview served the manifest as `application/octet-stream`; a narrow Netlify header now specifies `application/manifest+json`. The corrected type passed on the final preview and production.

Final preview: https://6a98f00077cc3e4875db40c4--cleardose-webmcp-demo.netlify.app. Both routes and all nine assets matched the final build. The final preview also passed the browser heading, metadata, placeholder and overflow checks without console errors.

Mobile inspection verified no document overflow at 390 pixels and a 16:9 video frame. It caught a headline word-joining issue; the final build uses a separate block for the second headline line.

## Failures found during development

The previous checkout-log browser test depended on an Agent Lab shortcut creating an order. That shortcut is intentionally gone. The test now explicitly invokes the registered checkout handler with fictional test inputs, preserving checkout redaction and replay-blocking coverage.

A width assertion read Chromium's previous layout immediately after resize. It now polls for the new layout, preserving the same width limit. Repeated responsive checks passed after this readiness change.

An intermittent development-browser failure left 11 lazy child-module requests unsent for five seconds, while the app shell remained visible. No Vue exception, network error response or HMR event appeared in the trace. Sixteen isolated diagnostic loads all passed, with and without request interception, so the exact trigger remains unconfirmed. The demo-only documentation fixture now observes requests instead of unnecessarily intercepting them; its zero-provider assertion remains. No timeout was increased. This was not observed in the deployed native-tool journey. Final stable-tree results are recorded above.

## Production

Published to the existing `cleardose-webmcp-demo` site on September 3, 2026 UTC. No new hosting project was created.

- Production: https://cleardose-webmcp-demo.netlify.app
- Updated documentation: https://cleardose-webmcp-demo.netlify.app/webmcp
- New overview: https://cleardose-webmcp-demo.netlify.app/hackathon
- Immutable deployment: https://6a98f10c72f61212af495d6a--cleardose-webmcp-demo.netlify.app
- Deploy ID: `6a98f10c72f61212af495d6a`
- Published app module: `/assets/index-B77lZSS4.js`

The production HTTP check verified both routes and nine assets against the local build by content and SHA-256. All returned HTTP 200. The manifest has the correct MIME type, and the existing security policy permits only the configured privacy-enhanced YouTube embed origin.

The production browser discovered all 19 tools. A native `cleardose_get_explorer_state` call with `{ "section": "workspace" }` returned success on `/webmcp`; the inspector showed ready, 19 registered, 19 documented and 19 of 19 schema examples passing. The search example opened a non-executing preview, and its copy button displayed `Copied.`. Navigating through the Hackathon link preserved registration, and native `view_cart` returned the existing empty cart. That read opened the cart drawer; the smoke check closed it again. No cart items, orders or selected medications were changed.

Both production routes had correct route titles and no horizontal document overflow at desktop or 390 pixels. The mobile video placeholder measured approximately 341.21 by 191.92 pixels, a 16:9 frame. Direct route loads, in-page links and the pending video state worked. The browser console reported no errors or warnings during these checks.

The screenshot service failed four captures while mobile viewport emulation was active, although accessibility and DOM reads continued to work. Three failures used 390 by 844 and one used 390 by 700. Capturing recovered at the default viewport. The exact capture-service cause remains unresolved; this is not evidence of a broken application connection. No final production mobile screenshot is claimed. The viewport override was reset. The automated mobile browser tests passed independently.

### Screenshot evidence

- `01-preview-native-report.png`: preview native Metformin/Jardiance report with both FDA interaction sections.
- `02-preview-hackathon-mobile.png`: initial preview mobile inspection, before the headline spacing correction. Kept as development evidence, not the final design.
- `03-production-webmcp.png`: final production documentation hero and registered-tool status.
- `04-production-safe-preview.png`: production example preview and copy feedback.
- `05-production-native-inspector.png`: production native receipt, registration count and validation status.
- `06-production-hackathon.png`: final production overview hero and pending video link.

## Changed files

Existing files updated:

- `README.md`, `index.html`, `netlify.toml`
- `src/router/index.ts`, `src/views/WebMcpView.vue`
- `src/components/AppHeader.vue`, `DemoReplay.vue`, `ToolCard.vue`, `ToolLog.vue`, `WebMCPStatus.vue`
- `tests/e2e/cleardose.spec.ts`, `tests/e2e/cleardose-extension.spec.ts`

New implementation and tests:

- `src/webmcp/documentation.ts` and `documentation.test.ts`
- `src/components/ToolCard.test.ts`
- `src/components/docs/AgentComparison.vue`, `CopyButton.vue`, `CopyButton.test.ts`, `ToolInspector.vue`, `WorkflowGuide.vue`, `YouTubeDemo.vue`, `YouTubeDemo.test.ts`
- `src/content/project.ts`, `webmcp-workflows.ts`, `webmcp-workflows.test.ts`, `demo-video-script.ts`, `demo-video-script.test.ts`
- `src/views/HackathonView.vue`, `HackathonView.test.ts`
- `src/utils/page-metadata.ts`, `page-metadata.test.ts`
- `tests/e2e/documentation.spec.ts`
- `scripts/generate-brand-assets.mjs`, `scripts/check-hosted-docs.mjs`
- `LICENSE`, `docs/demo-video-script.md`, `docs/decisions/2026-09-03-documentation-pages.md`
- `public/favicon.ico`, `favicon.svg`, `apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png`, `og-image.svg`, `site.webmanifest`, `LICENSE.txt`
- This verification report and its screenshot evidence.

The pre-existing untracked `AGENTS.md` and `CODEX_ENGINEERING_OPERATING_SYSTEM.md` were read and preserved.

## Remaining submission work and limits

- `[YOUTUBE_URL]` remains pending. The complete recording script has six segments, 170 seconds and 381 spoken words. It appears on the hackathon page and in `docs/demo-video-script.md`.
- The repository at https://github.com/bclonan/simple-dose was verified public. These local source, asset, README and license changes have not been pushed. The page correctly marks the current source release as pending publication.
- JavaScript updates route metadata. Non-JavaScript social crawlers receive the shared static ClearDose metadata and image.
- The interactive old-way comparison is an illustrative script, not a speed benchmark or live-model evaluation.
- Public API availability and source coverage remain external dependencies. No medical decision, real pharmacy order, payment or prescription transmission is part of this app.

## Guidance reviewed

The implementation preserves the existing goal-oriented tool design and adds explicit initial state, data flow, approval and failure notes to each documented chain. The catalog uses actual schemas and effect metadata. Documentation previews do not perform hidden actions. The relevant Chrome guidance is linked on `/webmcp`:

- https://developer.chrome.com/docs/ai/webmcp/build-tools
- https://developer.chrome.com/docs/ai/webmcp/best-practices
- https://developer.chrome.com/docs/ai/webmcp/evals
- https://developer.chrome.com/docs/ai/webmcp/secure-tools
- https://developer.chrome.com/docs/ai/webmcp/use-cases
