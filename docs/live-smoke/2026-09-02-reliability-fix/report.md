# ClearDose reliability follow-up

Released, 2 September 2026. The corrected build is live at [ClearDose](https://cleardose-webmcp-demo.netlify.app), deploy `6a98920a72f612911a495dcb`. Production serves the same `index-COnjLuut.js` asset tested on preview `6a988a02da6ff84efd924415`.

The final automated checks passed. The corrected build completed 100 successful native WebMCP calls across 17 tools, with no recurrence of the configuration-limit failure. This was not one uninterrupted browser-client run. A screenshot-helper timeout reset the client once, and the persistence check later reloaded the app once. The two removal tools have current automated coverage but were not rerun natively because the browser requires fresh deletion confirmation.

Start with the [corrected medication cards](release/63-production-medication-cards-settled.png), [settled public-medication cart](release/52-live-mode-idempotent-cart-state.png), [tool screenshot gallery](release/index.html), and [release summary](release/summary.json). The first preview and its failures remain below as historical evidence.

## First-preview evidence

The browser exposed 19 tools. Saved results show public medication discovery, exact simulated shopping configurations, a two-item cart and a read-only savings comparison. These are specific recorded outcomes, not a claim that every tool or the whole release passed. Full inputs, outputs, timestamps and receipt captures remain in [receipts.json](receipts.json).

| Recorded steps | Observed result |
| --- | --- |
| 1 to 3 | The catalog reader reported 54 loaded identities. Search returned standalone Empagliflozin separately from combination medications. Details returned three demo configurations and `prescriptionRequired: null`. |
| 4 to 12 | Empagliflozin and Cetirizine HCl became separate cart lines. The cart reader returned both, with a fictional delivered total of $48.71. |
| 13 to 15 | Changing only the first line to express delivery raised the demo total to $52.71. Savings pages covered both exact configurations, with a hypothetical total of $39.53 and difference of $13.18. The comparison did not replace cart items. |
| 16, 18 and 20 | Explorer selected the same two medications. The state read confirmed zero cards after a failed call. The later successful call created exactly two cards, identity and pricing. |

[Public search](02-public-search-state.png), [public details](03-public-details-state.png) and the [settled two-line cart](14-two-line-savings-state.png) show the visible application. Screenshot 11 captured a drawer transition. Screenshot 17 shows the preceding receipt, not a successful fact-card call. Neither should stand in for a completed-state capture.

## Failures retained

- **Retained client tool set.** Steps 17 and 19 failed with a stale-registration error before creating cards. A helper retained an earlier discovered tool set. After checking that no new app receipt or card existed, direct execution through a newly discovered set succeeded at step 20. That recovery needed no page reload or browser reset. See [discovery-incident.json](discovery-incident.json) and [verification-guide.md](verification-guide.md).
- **Automatic approval timeout.** One read-only call encountered a permission-review timeout. The browser explicitly allowed one retry, which succeeded. This was a verification-client event, not evidence of an application or public-data-provider failure. The [verification guide](verification-guide.md) records it separately. An uncertain mutation must not be retried on that basis.
- **Configuration limit.** Fresh discovery after step 20 disabled WebMCP for the page. The incident records 32 successful app receipts before that failure. The last declaration measurement, taken before adding the cards, was 21,935 bytes across 19 tools. The browser did not identify its internal limit, so these numbers do not establish a byte, count or rate threshold. See [configuration-incident.json](configuration-incident.json), [schema-measurements.json](schema-measurements.json) and [visible state after the limit](visible-state-after-limit.txt).

The [12 earlier read-only stress calls](native-stress.json) returned results, but they preceded workspace edits and did not prevent the later configuration failure. The [captured console](preview-console.json) is empty; it does not override the native failure.

## Startup race found by the full test run

The next full run caught an Explorer startup race. A tool requested two drugs and two cards, but returned `status: "updated"` with zero drugs and zero cards. The trace showed that initial lazy route loading had not finished when native tools became available. The incoming empty Explorer URL then cleared the new workspace while its drug facts were loading.

Native registration now waits for the initial route and its requested drug facts to finish loading. Catalog startup still begins immediately. Separate completion guards reject an edit superseded by a later workspace or data-mode change. They preserve the newer state and do not retry or reveal the older edit. Deterministic tests cover delayed navigation, delayed facts, unmount, initial navigation failure, and edits superseded during loading. The browser test now checks the exact mutation result before looking up card IDs.

## Corrections implemented in source

The five Explorer declarations now stay stable across workspace edits. Each execution checks current revision and membership. After asynchronous facts finish loading, completion guards reject superseded edits before reporting success or revealing an outdated workspace. Dynamic medication declarations still respond to catalog and page membership changes. Unchanged declarations retain their registrations, and replacements wait for an executing call to return.

Native declarations omit non-validating display annotations and use paged catalog discovery instead of repeating large ID lists. ClearDose now enforces its own 18,000-byte declaration budget. This is an application guard, not a claimed Chrome limit. Added regression tests cover repeated workspace edits, registration retention, stale inputs, pagination and uncertain mutation retries. Final results appear below. See [registration code](../../../src/webmcp/dynamic.ts), [Explorer validation](../../../src/webmcp/explorer.ts) and [budget guard](../../../src/webmcp/schema-budget.ts).

Public catalog loading is progressive and does not block search or the mock cart. Startup makes 24 bounded public searches with three workers and at most four hits per search. It does not download the whole FDA catalog. Searches load more matches, while full label and benchmark details load on demand. Known category mappings fill browsing labels; unmatched records use Other medications, not an invented clinical classification.

Cards use consistent public-data badges, readable names, deduplicated display brands, category labels, wrapped attributes and labeled demo prices. Public identities receive seeded pseudo-random simulated prices, configurations and offers. Saved configuration identity survives enrichment and reload. Unknown public prescription status remains unavailable.

Two late copy fixes are not represented by the first-preview screenshots. Empty-search status now clears when public names finish loading. The public quote panel no longer shows an absent fictional cash-price row beside generated shop offers; it directs readers to the separate simulated fulfillment section.

## Public facts and fictional shopping

Public names, source-listed attributes, label sections and source dates remain reference data. Generated quantities, configuration pairings, prices, pharmacy availability and delivery options are for the mock shop. A source-listed form or strength does not verify their generated pairing or make it dosing advice. Synthetic fallback configurations are labeled as such.

NADAC is a benchmark, not a cash checkout offer. Savings compare fictional offers for the same exact demo configuration, not retail or insurance savings. Prescription request cards, printable content and copied text carry demo disclosures and estimates. They are not prescriptions and do not transmit requests to a provider.

## Corrected release verification

The full automated release check passed after the final startup and supersession fixes. It includes 263 unit tests across 27 files, 18 deterministic evaluation tests, 26 Chromium browser tests, application typecheck, production build, and the diff whitespace check. The previously failing Explorer test passed without retries. These tests do not establish a live-model accuracy score.

The corrected preview completed 97 successful native calls across 17 tools. Three more successful read/search calls on production bring the total to 100. All 19 tools registered, with observed declarations between 17,547 and 17,549 bytes. The published and preview builds used the same `dist/index.html` SHA256, `7B736EAB16041E483084FC9BB102F631957A9DAE1637A0C609A6CE16ECF0F6FE`.

| Corrected-release check | Observed result |
| --- | --- |
| Automatic public catalog | Fresh preview startup loaded 42 public records without a search. Production, which retained earlier cached records, reported 58 loaded identities and 49 public records ready. These are session observations, not fixed catalog sizes. |
| Two public medications in the mock shop | Empagliflozin and Cetirizine HCl received exact fictional configurations and separate cart IDs. Two standard-delivery lines totaled $48.71. Express delivery on the first line changed the total to $52.71. |
| Savings and duplicate handling | Two savings pages agreed on $39.53 as the lowest hypothetical total and $13.18 in simulated savings. A deliberate duplicate-add test in public-only mode returned the existing cart ID and kept two items. |
| Explorer connection regression | Forty initial catalog reads passed. Later, twenty consecutive native edit/read calls used the same tool set with no refresh, reload or reset. Each read confirmed the preceding revision, two selected drugs and two cards. Explorer declarations stayed unchanged after excluding browser URL metadata. |
| Dynamic medication context | Related search returned Dapagliflozin with an explicit shared-category reason. Four pages completed all eleven related-result fields. Page-scoped comparison returned public identity samples, FDA label text and provider URLs. Full comparison output remained paginated; the test did not read every field. |
| Planned reload | Both cart IDs, $52.71 total, public-only mode, selected drugs and ingredients/pricing cards survived. The first native Explorer read after reload saw the hydrated state. |
| Local checkout | A request card covering only one medication correctly failed validation. The explicit provider-will-send path then created one local order, `CD-2026-0001`, at $52.71. Both order pages retained the public medications and omitted recipient name and address. Nothing reached a pharmacy or payment service. |
| Published site | Browser inspection confirmed the verified JavaScript asset, 19 tools, broader loaded catalog and corrected Atorvastatin cards. Production cart and orders were not changed. Captured production console warnings and errors were empty. |

The [saved-result verifier](verify-release-evidence.mjs) checks the recorded state, exact amounts, pagination, retained IDs, source fields and coverage. It verified 60 returned journey records. The 40 initial stress reads remain in their own [ledger](release/native-stress.json). The [mixed edit/read record](release/native-mixed-stress.json), [persistence record](release/persistence.json), and [production check](release/production-verification.json) retain their inputs and limits.

## Remaining verification limits

The first-preview configuration-limit error did not recur after the declaration and registration changes. Chrome's internal limit remains unspecified; this test does not establish its exact cause or guarantee that every future browser build will accept the configuration.

The corrected run included one automatic client reset after 41 successful calls when a screenshot inspection timed out. It kept the same browser tab, catalog/session revisions and application state. Fifty subsequent calls succeeded before the planned persistence reload. A manual-navigation/read call also hit a browser approval-context rejection. Later, a local variable error occurred after successful checkout; the already-saved result was recovered and checkout was not repeated. See [client incidents](release/incidents.json). These events do not support a claim of a completely uninterrupted browser session.

`remove_cart_item` and `cleardose_remove_fact_card` remain outside this release's native execution coverage. Their current automated tests passed; [earlier native evidence](../2026-09-02/index.html) is historical, not a rerun on this build. The application does not place real medication orders, and no live-model accuracy evaluation was performed.

State screenshots 12 and 54 caught the cart drawer in motion; use screenshot 52 for the settled cart. The full-page production screenshot 61 repeated card content during image stitching. DOM inspection and single-frame screenshot 63 confirmed one attributes block and one footer per card. Repeated stress and continuation reads retain their complete JSON rather than duplicate screenshots. The gallery reports these image gaps rather than treating them as missing application results.
