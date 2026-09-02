# Drug Explorer implementation report

This is an incremental extension of the public-data migration. The earlier release and its verification remain recorded in [data migration](data-migration.md).

## Architecture changes

Before this extension, the app exposed a full medication reference panel and a read-only multi-drug comparison. It now also has a focused workspace at `/drugs/explore`. Humans and WebMCP edit the same Pinia selection and fact cards.

The data path remains `public providers -> ClearDose plugin -> medication repository -> catalog store`. The new workspace stores only selected application IDs and `{ id, factType, drugIds }` cards. It does not copy drug records. `useDrugFacts` selects normalized fields from the catalog; `DrugInfoCard` renders those fields for one to four medications.

`src/domain/drug-facts.ts` owns all 14 fact keys, labels, quick choices, selectors, source rules, and loading flags. Facts cover identity, uses, ingredients, strengths/forms, side effects, warnings, boxed warnings, interactions, pricing, clinical pharmacology, pregnancy, pediatric use, geriatric use, and reported adverse events. There is no generated HTML, component compilation, generic canvas, or new model backend.

## Files changed

New application files:

- `src/views/DrugExplorerView.vue`
- `src/components/medications/DrugInfoCard.vue`
- `src/domain/drug-facts.ts`
- `src/composables/useDrugFacts.ts` and `useExplorerRoute.ts`
- `src/stores/drugExplorer.store.ts`
- `src/webmcp/explorer.ts` and `explorer-context.ts`

Modified application files:

- `src/App.vue` binds shared routing, registration, and reviewed replay.
- `src/router/index.ts` and `src/components/AppHeader.vue` add the Explorer route and navigation.
- `src/stores/catalog.store.ts` and `src/services/medication.repository.ts` add exact name resolution, selective detail loading, and lightweight public category enrichment.
- `src/types/demo-db.ts` adds public search metadata and bounded Explorer receipt context.
- `src/views/MedicationDetailView.vue` reuses the new fact card and links to a comparison workspace.
- `src/components/medications/PublicDrugPanel.vue` reuses shared source, date, pricing, and clinical selectors while retaining its complete record panels.
- `src/components/MedicationCard.vue` shows public search attributes without replacing exact demo SKU dimensions.
- `src/domain/catalog.ts` and `src/views/MedicationsView.vue` use the same public search attributes for discovery filters while demo mode keeps the original SKU metadata.
- `src/components/DemoPromptCard.vue` distinguishes prompts for the connected browser agent from the existing deterministic demo replay.
- `src/webmcp/dynamic.ts`, `medication-context.ts`, `replay.ts`, `src/services/webmcp.context.ts`, `src/utils/redact.ts`, `src/components/webmcpJourneys.ts`, and `src/views/WebMcpView.vue` integrate the workspace with existing tools and receipts.
- `cleardose-data-plugin/src/service.ts` expires an aggregate record when its earliest source expires, with a regression test. Provider implementations remain in the supplied plugin.
- `cleardose-data-plugin/src/providers/openfda.ts` excludes bulk ingredients before server pagination. This prevents raw-material records from hiding finished products in the first search page. The service versions its search cache key so an older incomplete search cannot hide the corrected result.

Tests accompany the registry, card, store, tool contracts, replay, repository, routing, and browser flows. `scripts/production-smoke.mjs` also checks the Explorer route and deep-link restoration.

Preserved: the original 12 medication IDs, seed JSON, SKU/offer IDs, cart and checkout behavior, pricing calculations, prescription and order stores, dependencies, lockfile, and existing routes. No file was deleted. The user-supplied data plugin remains the provider implementation.

## Store and mock replacement map

| Area | Before | Now | Demo boundary |
| --- | --- | --- | --- |
| Discovery | Local catalog or public search | Public search metadata and exact category enrichment | Original identities and taxonomy remain stable |
| Medication facts | Full normalized detail panel | Same records through selectable reusable cards | Missing facts remain unavailable, never seeded clinical claims |
| Selected comparison | Component-local read-only comparison | Shared Explorer selection and cards | At most four selected medications |
| Detail requests | Clinical and pricing together | Only requested sections, with previous loaded sections retained | Demo mode makes no public requests |
| Prices | Separate normalized price groups | Same type distinctions in every pricing card | Public benchmarks never enter the cart |
| Adverse events | Plugin support only | Requested when the adverse-events card is selected | Report counts are not incidence or causation |
| Workspace durability | No shareable fact workspace | Deterministic URL state plus cached public records | Browser cache is not a remote backup |

The catalog keeps normalized records and per-medication request state. It retries failed optional sections instead of treating partial responses as permanently complete. A data-mode generation guard rejects requests that return after the mode changes, including a change away and back. The Explorer store owns selection, card identity, duplicate reuse, and atomic changes. Activity context now records selected IDs and all bounded fact cards before and after a tool call. Other commerce stores keep their existing contracts.

## Page behavior and URL state

Search is lightweight. Selecting a medication loads its requested facts. Existing cards automatically show each newly selected drug. The same card handles single-drug and multi-drug views. Changing a fact keeps the card ID. Adding a duplicate focuses the existing card; changing into a duplicate reuses the matching card. Removal updates the visible page and URL.

`/drugs/explore?drugs=atorvastatin,rosuvastatin&facts=uses,side-effects,warnings,pricing`

The URL uses stable slugs and ordered, deduplicated fact names. `prices` is accepted as an alias for `pricing`. A missing `facts` parameter defaults to Uses and Warnings when drugs are selected. `facts=` preserves an intentionally empty card list. Brand or generic names can resolve through public search; the URL then uses the stable application slug. A new Empagliflozin record uses `public-empagliflozin`, without creating a demo SKU.

Public records stay in the existing provider cache. The workspace itself is reconstructed from the link, so no second drug-record cache or workspace JSON blob is needed. Unsupported facts show a notice. Unknown or ambiguous medications leave a visible error instead of an inferred identity.

## WebMCP

All 14 existing tools remain. Five tools control or read the visible workspace:

| Tool | Shared action |
| --- | --- |
| `cleardose_select_drugs` | Replace, add, or remove selected medications |
| `cleardose_show_drug_fact` | Add facts or replace the workspace with only the requested facts |
| `cleardose_update_fact_card` | Change one existing card's fact |
| `cleardose_remove_fact_card` | Remove one card |
| `cleardose_get_explorer_state` | Read selected drugs, cards, or loaded catalog IDs in bounded pages |

The populated app exposes 19 tools. Workspace schemas use the same fact registry and current card/medication IDs. Name resolution accepts bounded generic or brand terms. Runtime validation repeats schema limits. A workspace revision guards every mutation, including after asynchronous identity resolution. Catalog additions made by that resolution do not invalidate its own commit. Human selection, card, or data-mode edits do.

Mutations update Pinia and reveal the Explorer route. Read-state returns the human's latest changes. `compare_medications` still owns complete paged public sections, so no duplicate side-effect, warning, or pricing read tools were added. Explorer-selected IDs now define page scope for contextual comparisons.

Logs retain inputs, response pages, before/after workspace state, timing, mode, and status. Reviewed replay validates the recorded mode and selected medications. Card IDs rebind only when the current fact and drug IDs match the recorded card. Checkout remains excluded. Receipts are browser-local and bounded, not a medical record system.

The implementation follows the supplied Chrome guidance on [goal-based tools](https://developer.chrome.com/docs/ai/webmcp/build-tools), [shared state and registration](https://developer.chrome.com/docs/ai/webmcp/best-practices), [evaluation](https://developer.chrome.com/docs/ai/webmcp/evals), [untrusted data and output limits](https://developer.chrome.com/docs/ai/webmcp/secure-tools), and [user journeys](https://developer.chrome.com/docs/ai/webmcp/use-cases). Tools keep same-origin exposure, read/write hints, and 1,500-character paged responses. Public text is data, never executable instructions.

## Active sources and boundaries

openFDA supplies product records and label sections. RxNorm supplies identity resolution. CMS Medicaid NADAC supplies exact-package acquisition benchmarks. FAERS/openFDA event summaries load only when requested. Hybrid mode can show the existing fictional demo cash quotes, with exact dimensions and a separate label.

Medicare remains disabled pending a genuine preprocessed index. No real retail cash-price feed, stock feed, insurance integration, prescribing system, payment provider, or pairwise clinical interaction engine is configured. FDA interaction sections do not establish a relationship between two selected drugs. FAERS counts do not measure comparative safety. No missing section becomes a safety finding.

Long text starts with a short preview; Show more reveals the complete loaded text. Source names, retrieval dates, available effective dates, provider notices, and stale-cache status remain available. The page has named controls, medication-chip removal labels, semantic headings, keyboard focus, and a one-column mobile card layout.

## Verification

Verified on September 2, 2026, after the final focus and routing changes:

- Frozen-lockfile install passed without dependency or lockfile changes.
- Application and data-plugin typechecks passed.
- All 188 unit tests passed, including 35 plugin tests.
- All 18 deterministic evaluations passed.
- All 23 browser tests passed. These cover human and agent workspace changes, responsive layout, shareable links, partial sources, stale revisions, and reviewed replay after reload.
- The production build passed without a chunk-size warning. Explorer, medication detail, and Agent Lab load as separate route chunks.
- The local production build, deployed preview, and production each passed eight desktop and eight mobile route checks, including nested refresh and four-card shared-link restoration. No browser console errors occurred in these checks.
- Native browser WebMCP on the deployed preview exposed all 19 tools. The live-source journey resolved Metformin and Jardiance, displayed side-effects and pricing cards, then replaced them with only the interactions card. The visible cards, URL, shared-state readback, and activity counter agreed.
- The live pricing check correctly reported no NADAC quote for the checked package NDCs. It did not substitute a demo or retail price.
- A fresh-cache live-source check caught FDA bulk rows crowding the first search page. After moving that filter into the query, the local build, final deployed preview, and final production release passed fresh Empagliflozin slug resolution, reload, and automatic Demo-to-Hybrid recovery. Exact matching still rejects combination-only results. Reproduce with `node scripts/production-smoke.mjs <origin> --live-explorer`.
- Native WebMCP also passed on the final production release. Reading state returned Metformin and Empagliflozin with side-effects/pricing cards. The next tool call replaced those with one interactions card. Both selected medications, the FDA sources, the interaction disclaimer, the URL, and the 19-tool activity badge matched the tool response.
- `git diff --check` passed. There is no configured lint script.

The Netlify workflow published a preview first, checked it, and then promoted the same built files without rebuilding. Final preview deploy: `6a986ce488f285fb2dbcd571`. Final production deploy: `6a986d76bd9497f9b92a7e93`. The production HTML references the verified `index-CF253o5J.js` and `drugExplorer.store-DIi9Ch2U.js` build files.

Production: [Drug Explorer](https://cleardose-webmcp-demo.netlify.app/drugs/explore). Screenshots from production checks are in `test-results/production/`.

## Remaining limitations

Deterministic journey tests and manual native-tool execution are not a statistical live-model tool-choice score. That evaluation has not been run. The connected WebMCP browser agent supplies the LLM; the application has no separate model API integration.

Public providers can be unavailable, omit label sections, or have no matching package benchmark. The UI exposes those gaps and retry controls. Medicare and real retail cash prices remain unconfigured. Interactions are individual FDA label sections, not a pairwise clinical assessment.

The browser's saved data mode remains authoritative. A link containing a public-only medication cannot resolve in Deterministic demo mode. Selecting Hybrid public + demo or Public data only automatically retries that unresolved link. Demo mode makes no public requests.

Workspace links reproduce selected drugs and fact types, not a frozen copy of upstream medical data. Receipts and public caches remain browser-local. Cart, checkout, prescription requests, and orders remain fictional.
