# Public data migration

This report records the first public-data release. The subsequent [Drug Explorer implementation report](drug-explorer.md) covers the current 19-tool workspace, requested FAERS loading, category enrichment, and later verification results.

## Read-first dependency map

The inventory covered every app store, service, route, DTO, tool, replay path and test configuration, plus all plugin source files and examples.

| Current dependency | Target dependency |
| --- | --- |
| Catalog mock medication arrays and synchronous search | One plugin singleton, compatibility repository, async catalog search |
| Medication ID and slug getters | Stable app identities, additive public records, persisted identity mapping |
| Demo SKUs, offers and pharmacies | Explicit demo fulfillment fixture at the repository boundary, unchanged IDs |
| Detail action and page | Shared repository detail loading, normalized public sections |
| Pricing scenarios | Repository-owned demo fixture, public benchmarks shown separately |
| Category browsing | Existing human taxonomy, enriched public search metadata |
| WebMCP search and detail | Same catalog/repository methods used by the human UI |
| New contextual comparisons | Current store IDs in versioned dynamic schemas, shared read-only comparison |
| App localStorage | Existing workflow persistence plus lightweight identity mapping |
| Public provider responses | Plugin IndexedDB cache, memory fallback, request deduplication, stale-on-error |
| Journey replay | Existing logged shared actions, exact schema inputs, stale-context protection |

No public price becomes a checkout offer. The legacy adapter is used only for medication metadata. Its generated SKUs and benchmark offers are not imported. The plugin's independent WebMCP registrar is not called.

The connected browser agent supplies the LLM. The app does not call a model API or ship an API key. Public text remains untrusted tool output, not tool instructions. Similarity describes catalog fields, not therapeutic substitution.

## Migration report

### 1. Files inspected

The review covered `src/App.vue`, `src/main.ts`, `src/router/index.ts`, all files in `src/stores`, `src/services`, `src/domain`, `src/webmcp`, and `src/types`, plus the medication, comparison, checkout, prescription-card, order, and Agent Lab views. It also covered the search, medication, cart, pricing, replay, status, and log components, the data fixture and schema, persistence helpers, package and test configuration, Netlify configuration, existing documentation, and all supplied plugin sources and examples. The five Chrome guidance pages are linked in [WebMCP strategy](WEBMCP_STRATEGY.md).

### 2. Architecture discovered

ClearDose already had Vue 3, Pinia, route-based views, shared domain actions, exact-SKU demo pricing, persisted carts and orders, and a shared WebMCP action registry. The added data plugin had provider adapters, normalized drug types, a legacy adapter, and a standalone registry. The migration retained the application architecture and did not activate a second registry.

The production path is `public providers -> plugin singleton -> medication repository -> Pinia -> UI and WebMCP`. Components consume normalized types, not FDA URLs. Hybrid mode is the default. Demo mode is explicit and deterministic. Live mode excludes fictional fulfillment and demo-only discovery candidates.

### 3. Migration map

The dependency map above describes the code boundaries. This table describes the user-visible result.

| Feature | Before | After | Fallback |
| --- | --- | --- | --- |
| Search | Seed JSON and local taxonomy | Lightweight openFDA search, RxNorm fallback, stable public identities | Cached public matches; labeled demo matches in hybrid/demo |
| Drug details | Seed descriptions and SKU dimensions | Normalized identity, ingredients, variants, routes, manufacturers, classes, source stamps | Cached records; explicit unavailable sections; original demo configuration |
| Side effects | No sourced clinical detail panel | FDA adverse-reaction label text | Cached text or unavailable, never invented |
| Interactions | No sourced interaction panel | FDA drug-interaction label sections | Cached text or unavailable, not a pairwise checker |
| NADAC | Not connected to public benchmarks | Exact-package-NDC acquisition benchmarks with dates and partial-coverage notices | Cached benchmark or unavailable |
| Cash prices | Fictional offers | Original exact-SKU fictional offers remain separate | Clearly labeled demo only; unavailable in live mode |
| Medicare | No genuine index configured | Reusable local-index adapter retained but disabled | Unavailable until a genuine preprocessed index is supplied |
| Compare | Exact-SKU demo fulfillment comparison | Original pricing comparison plus public medication section comparison and match reasons | Cached public details and separately labeled demo commerce |
| WebMCP | Static workflow tools | Same shared repository plus two versioned, current-catalog tools | Labeled local action fallback where native WebMCP is absent |

### 4. Existing files changed

- App and contracts: `src/App.vue`, `src/types/demo-db.ts`, `src/domain/catalog.ts`, `src/domain/catalog.test.ts`, `src/utils/redact.ts`.
- Shared behavior: `src/services/cleardose.actions.ts`, `src/services/webmcp.context.ts`, `src/stores/catalog.store.ts`, `src/stores/pricing.store.ts`, `src/stores/agentActivity.store.ts`.
- UI: `src/components/AppDisclaimer.vue`, `MedicationCard.vue`, `MedicationSearch.vue`, `WebMCPStatus.vue`, `ToolLogEntry.vue`, `WebMCPJourneyCard.vue`, `webmcpJourneys.ts`, and `src/views/MedicationDetailView.vue`, `MedicationsView.vue`, `WebMcpView.vue`.
- Registry: `src/webmcp/definitions.ts`, `register.ts`, `register.test.ts`, `types.ts`.
- Verification and release: `playwright.config.ts`, `tests/e2e/cleardose.spec.ts`, `tests/e2e/cleardose-extension.spec.ts`, `netlify.toml`, `README.md`, `docs/WEBMCP_STRATEGY.md`, and `src/styles/main.css` for mobile table overflow and action/badge separation.
- Supplied plugin hardening: `cleardose-data-plugin/src/service.ts`, `config.ts`, `types.ts`, `cache/cache.ts`, `cache/indexeddb.ts`, `providers/openfda.ts`, `providers/rxnorm.ts`, `providers/nadac.ts`, `providers/local-medicare.ts`, `providers/demo-cash.ts`, and `utils/http.ts`.
- The supplied `.env.example` now has an empty API-key placeholder. No credential is bundled or used by the app.

### 5. New files created

- `src/plugins/cleardose.ts` creates the single application instance.
- `src/services/medication.repository.ts` owns compatibility identities, modes, search, details, and matching.
- `src/components/medications/PublicDrugPanel.vue` and `RelatedMedications.vue` display normalized records and comparison.
- `src/webmcp/dynamic.ts`, `medication-context.ts`, and `replay.ts` implement dynamic registration, page context, and safe reviewed replay.
- Tests: `src/services/data-plugin.test.ts`, `medication.repository.test.ts`, `src/components/medications/PublicDrugPanel.test.ts`, `src/webmcp/dynamic.test.ts`, `medication-context.test.ts`, `replay.test.ts`, `src/utils/redact.test.ts`, `tests/e2e/cleardose-public-data.spec.ts`, and `tests/e2e/responsive-layout.spec.ts`.
- `scripts/production-smoke.mjs`, `docs/HANDOFF.md`, and this migration report. The plugin folder itself was supplied by the user, not created by this migration.

### 6. Existing files intentionally preserved

The seed database and its schema, original medication IDs and slugs, exact SKU/offer IDs, cart/order/prescription/selection stores, pricing calculations, route URLs, CSS system, package dependencies, lockfile, and existing checkout views remain. The plugin's generic exports and standalone WebMCP registrar remain reusable. The app does not call that standalone registrar or import its generated benchmark checkout offers.

### 7. Mock-data usages removed

Catalog, pricing, and activity context no longer import the fixture directly. Only `src/plugins/cleardose.ts` imports it as the explicit compatibility boundary. Async public search and detail loading replace fixture-only production discovery. Public-only medications never receive synthesized SKU combinations or pharmacy offers.

### 8. Mock-data usages retained

The original 12 medication identities, taxonomy, exact SKUs, fictional pharmacies, offers, delivery estimates, pricing scenarios, prescription cards, and simulated orders remain for backward compatibility and offline demonstrations. Hybrid mode labels their prices as fictional. Demo mode avoids public queries. Live mode blocks selection, fulfillment comparison, and checkout using those offers without erasing saved carts.

### 9. Active providers

- openFDA NDC directory and FDA label sections.
- RxNorm identity resolution and fallback search.
- CMS Medicaid NADAC, discovered by year and queried by exact package NDC. Each drug checks at most four packages in parallel and reports subset coverage.
- `LegacyDemoCashPriceProvider` for explicitly fictional, exact form/strength/quantity demo quotes in hybrid mode.

The Medicare local-index provider is disabled. No real cash-price, pharmacy inventory, insurance, prescribing, payment, or dispensing provider is configured. FAERS support remains available in the plugin but is not requested by the app's comparison path.

### 10. WebMCP changes

All 12 existing tool names remain. Public search and detail use the shared repository and mark external results untrusted. A populated catalog adds `find_related_medications` and `compare_medications`, for 14 total tools. Their schemas enumerate every mode-eligible loaded medication, with short public labels and an indication of whether it is on the current page.

The schemas change when route, page IDs, catalog identities, or mode changes. Old registrations abort before replacements register. A session-specific `contextRevision` rejects stale calls. No cross-origin tool exposure is enabled. Strict runtime validation repeats schema checks.

Comparison reads one to four IDs. It exposes identity, product, clinical, price, and source sections through lossless field-row pages capped at 1,500 characters. Ingredient and class fields come before long product variants. Related search explains shared fields, uses only the eligible loaded catalog, and reports the limits of already-loaded clinical coverage. It does not decide therapeutic equivalence or suitability.

The floating panel records inputs, bounded results, duration, status, source, revision, route, mode, catalog IDs, selection, cart totals, and sanitized before/after state. Dynamic receipts retain each complete bounded field-row page. The expanded viewer preserves all ten field rows and the bounded catalog ID list, with a 16,000-character formatting cap instead of the previous 1,200-character cutoff. Personal names and addresses stay redacted. Reviewed replay rechecks modes, current IDs, and page membership before rebinding a dynamic revision. Checkout is never replayed. Replayed cart operations bind newly returned cart IDs.

### 11. Pinia changes

The catalog store adds async search and detail state, data mode, source records, latest-request guards, stable-ID persistence, normalized comparison, and scoped related matching. Pricing retains its original calculations but exposes no fictional fulfillment comparisons in live mode. Activity hydration validates saved entries and keeps a bounded history. Other workflow stores retain their contracts.

### 12. Cache and persistence changes

Public records use IndexedDB with memory fallback. Search/product TTL is one day, RxNorm identity TTL is 30 days, and clinical/benchmark TTL is seven days. Expired records may serve after provider failure with explicit stale status and source dates. Request deduplication shares concurrent reads. The cache namespace is versioned to invalidate old query behavior.

The service caches successful provider records rather than assembled partial drug responses, so Retry can recover a failed optional provider immediately. Failed transient partial results do not become fresh cache hits. IndexedDB blocked/open failures settle within 2.5 seconds, and aborted transactions reject instead of hanging.

The app persists mode and lightweight public identities separately from public source records. It retains at most 100 public identities plus 12 original records, including across direct-link recovery. Existing cart, selection, prescription, order, and activity keys remain. Browser storage can be cleared or evicted by the browser; this is durable local persistence, not a remote backup.

### 13. Tests added or updated

New coverage includes exact FDA query encoding, identity and label matching, malformed provider responses, timeouts, 4xx retry policy, RxNorm fallback, cache denial and staleness, partial-source recovery, exact-NDC NADAC, Medicare quantity semantics, demo quote dimensions, repository ID stability, live commerce guards, normalized clinical UI, dynamic schema replacement, stale calls, cancellation, lossless paging, accurate route/page context, redaction, and reviewed replay rebinding.

Browser tests cover public search/detail, source links, benchmark semantics, cached reload during outage, explicit fallback, related comparison, native-registry schema updates, navigation, invalid page scope, multi-item savings, orders, floating logs, reviewed replay, and reload persistence. Public-provider browser tests intercept the official HTTP endpoints with deterministic fixtures. Separate native browser checks use real providers.

### 14. Verification results

Final local gate on September 2, 2026:

| Check | Result |
| --- | --- |
| Locked dependency install | Passed, lockfile unchanged |
| Application typecheck | Passed |
| Standalone plugin typecheck | Passed |
| Unit tests | 127 passed, including 32 focused plugin tests |
| Deterministic evaluations | 18 passed |
| Production build | Passed; JavaScript 491.03 kB, 116.98 kB gzip |
| Chromium browser tests | 16 passed, including responsive checks at 320, 390, 768, and 1440 pixels |
| Diff whitespace check | Passed |

The full `pnpm verify` gate ran again after the final identity, form-filter, layout, and expanded-receipt fixes. Deterministic evals are contract and journey tests, not a statistical LLM tool-choice score. There is no configured lint command.

Live provider checks loaded matching FDA labels for Atorvastatin, atorvastatin calcium, Rosuvastatin, Lisinopril, Metformin, Oxytocin, and Lipitor. Verified NADAC returned four exact-package Lipitor benchmark quotes dated September 2, 2026. Bulk ingredient selection and missing top-level FDA class mappings found during production smoke testing were fixed before the final gate.

Final production release: [ClearDose](https://cleardose-webmcp-demo.netlify.app), Netlify deployment `6a9861293b8aa56222d6db27`. The [immutable release](https://6a9861293b8aa56222d6db27--cleardose-webmcp-demo.netlify.app) is the same tested build.

The production route script passed all seven desktop and seven mobile route checks, nested-route refresh, asset loading, and console-error checks. Browser-native WebMCP verified all 14 tools. Real-provider comparison loaded Atorvastatin and Rosuvastatin, and class matching returned Rosuvastatin with its shared public class as the reason. On the final immutable build, a two-call comparison/class-match journey survived reload and completed after visible review and confirmation. Its expanded receipt showed all ten returned comparison rows, pagination, the original revision, and before/after state. That browser session reported no console errors.

### 15. Remaining demo-only behavior

Pharmacy prices, fees, inventory, arrival estimates, prescription-request transmission, cart checkout, payment, and order status are fictional. The app makes no real purchase and transmits no prescription. Existing multi-item totals and savings compare only the same exact demo SKU, never a proposed medication substitute.

### 16. External-data gaps

Public records can be missing, delayed, inconsistent, or rate limited. RxNorm and FDA identity names may differ. The plugin excludes explicitly marked bulk ingredients and further-processing records. It chooses a matching finished-product identity group and label rather than merging different salt or ingredient groups. A representative-group result carries a partial-coverage notice, and unresolved ties remain ambiguous. Pharmacologic classes preserve the published NDC EPC/MoA labels. FDA drug-interaction text is not a complete pairwise interaction engine. Missing warnings are not evidence of safety. FAERS reports do not establish causation. NADAC is acquisition cost, not retail cash price. CMS gross spending is not patient out-of-pocket cost.

There is no true pharmacy cash-price provider, inventory feed, genuine Medicare index, patient-specific clinical decision support, or app-hosted LLM. The connected WebMCP browser agent supplies the LLM and decides how to use the current tool schemas.

### 17. Concrete next steps

1. Rotate the removed openFDA credential if the populated sample value was real. Keep privileged credentials server-side; this app uses public endpoints without one.
2. Add a licensed cash-price/inventory provider only with exact product mapping, source dates, and a separate reviewed checkout integration.
3. Supply a genuine, provenance-labeled preprocessed CMS index before enabling Medicare.
4. Run a scored live-model evaluation set for tool choice, multi-step completion, stale-context recovery, and refusal to infer therapeutic substitution. Keep it separate from the deterministic suite.
5. Add deployment monitoring or remote account sync only as a separate requested change. Current persistence is browser-local.
