# Drug Explorer comparison recovery

Request: "Compare Metformin and Jardiance in Drug Explorer. Show side effects and public pricing. Then only show their FDA-labeled interactions."

## Confirmed findings

The pre-fix production build returned FDA side effects for both drugs during this investigation. The screenshot's historical label failure could not be reproduced or attributed to a specific network cause. Its old warning combined timeout, connection, and invalid-response failures into the same sentence.

The comparison's missing public prices were reproducible. The provider checked only four package NDCs. For Jardiance these were repackager codes with no NADAC rows, while later package codes had current benchmarks. The native fact tool still returned `status: updated` without any fact-availability result. See `before.json` for that exact native response and the page content.

The existing Chrome tab also retained an older loaded application bundle, `index-CF253o5J.js`. A page refresh is required to use a newly deployed build. No cart or order was cleared during this investigation.

## Changes

- FDA label requests use up to 12 exact SPL set IDs and sort by effective date. One exact-name fallback follows a successful no-match, not a failed request. Combination-product labels do not match a standalone ingredient just because they share an RxCUI.
- Label and NADAC cache keys changed so earlier broad-label responses and empty four-package price results do not hide the corrected lookups. Failed optional sources remain retryable.
- NADAC requests cover up to 100 exact package codes in four batches, with two concurrent requests. Each batch returns at most 100 dated rows. Returned codes must match the requested package list. Latest as-of date, then effective date, selects a row per package. Source notices disclose partial coverage.
- Each fact reports whether content is available, partially available, absent from a loaded label, or unavailable because its provider failed. A workspace update no longer implies its data loaded.
- Retry updates the same cards and clears old failure messages. Older requests cannot overwrite messages after a newer workspace or data-mode change.
- WebMCP outputs and visible receipts preserve bounded availability summaries and provider notices. All input schemas remain unchanged.

Public NADAC amounts remain acquisition benchmarks, not patient cash prices or cart offers. FDA interaction sections remain label text, not a pairwise interaction check.

## Verification

Published September 2, 2026 to [ClearDose](https://cleardose-webmcp-demo.netlify.app). Production deploy is `6a989bb1c4b3b705c687f376`. Both the in-app browser and the user's Chrome tab loaded `assets/index-C7U1i2FG.js`.

The Netlify deployment workflow used a preview first. Final preview `6a989a0d6dd84d5e5b94fb38` and production received the same tested `dist` without another build. The two early native preview calls belong to `6a9899387862cf3fd3a19067`, which predates the final response-budget and navigation-race checks.

All release checks passed after the final source changes:

| Check | Result |
| --- | --- |
| Frozen dependency install | Passed |
| Unit tests | 286 passed across 29 files |
| Evaluation tests | 18 passed |
| Typecheck and production build | Passed |
| Chromium end-to-end tests | 28 passed |
| Whitespace/diff check | Passed |

The two new browser regression tests cover the requested sequence and a label-only HTTP 503. During the simulated outage, real-shaped NDC and NADAC fixtures still load, clinical facts report provider failure, and the failed label request does not fan out to another query. The visible Retry control recovers the same cards when the fixture source becomes available. Clinical content is never invented. A separate test checks that a newer workspace change during navigation supersedes an older tool result without rollback.

### Live native WebMCP

`native-calls.json` contains 22 saved inputs and outputs: two preliminary-preview calls, six final-preview calls, and 14 production calls. Every call returned successfully. Each native result was saved before screenshots or other observations. The pre-fix reproduction is separate in `before.json` and is not counted in that ledger.

On the final preview, native tools selected `Metformin` and `Jardiance`, showed side effects plus pricing, read every fact-availability row using both pagination tokens, then replaced the cards with interactions only.

On production, the existing browser cache was retained. A reload immediately showed four available facts, including prices that had been missing before the fix. The next native selection used `Metformin Hydrochloride` and `Jardiance`, which resolved to the exact public IDs in the user's screenshot:

- `med-public-metformin-hydrochloride`
- `med-public-empagliflozin`

`cleardose_show_drug_fact` with `facts: ["side-effects", "pricing"]` and `mode: "replace"` returned four available results and no provider failures. Both paginated pricing rows were read. The visible browser showed FDA adverse-reaction text for both medications and NADAC benchmarks for both.

The final call used `facts: ["interactions"]` and `mode: "replace"`. It returned one card, two available FDA-label results, and zero failed or unavailable results. The visible page contained only the interactions card. The source panel linked Jardiance to FDA SPL set `59ed43d9-b4e0-72a2-e063-6394a90a327d`, effective August 26, 2026.

Eight additional production read calls sampled the `compare_medications` clinical and price sections. Following `nextOffset` returned source notices, freshness, actual FDA text, and a numeric exact-NDC benchmark. This was a pagination sample, not a claim that all 207 clinical rows or 485 pricing rows were manually read.

The visible activity panel retained the final input, bounded outcome, and before/after workspace state. It reported two available interaction results. The 14-call production inspection journey exceeds the existing 12-call replay limit, so its replay button was correctly disabled with an explanation. No replay was executed in this verification.

### Chrome and cache recovery

The user's existing Chrome tab had a one-item cart and an older loaded bundle. Opening the fixed comparison loaded the new bundle without clearing browser storage. All four side-effect/pricing results showed public data. Chrome's visible controls then changed the workspace to interactions only, with both FDA sections present. The cart still had one item. No checkout, cart mutation, order change, or data reset was performed.

Native WebMCP ran in the Codex in-app browser. Chrome was checked through its visible page controls. The MCP-B Agent extension itself was not driven by this test. No browser-connection failure occurred during this verification. Earlier API-method and locator mistakes in the browser test controls were corrected after reading the supported API or fresh page state; they were not application failures. Both browsers' inspected error/warning logs were empty at the final checks.

### Screenshots and data notes

| Evidence | What it shows |
| --- | --- |
| [Production side effects and pricing](06-production-side-effects-pricing.png) | Original public medication IDs, real FDA section, and a public benchmark |
| [Production interactions, first medication](07-production-interactions-metformin.png) | Interactions-only card with Metformin label text |
| [Production interactions, second medication](08-production-interactions-empagliflozin.png) | Jardiance label text in the same card |
| [Native tool receipt](09-production-webmcp-receipt.png) | Actual interactions-only input in the floating activity panel |
| [Chrome public facts](12-chrome-visible-public-facts.png) | Loaded side effects, benchmark, and preserved one-item cart |
| [Chrome interactions](13-chrome-interactions-loaded.png) | Both medications' FDA interaction text |
| [Jardiance pricing](14-chrome-jardiance-public-pricing.png) | Exact-NDC public benchmark and source details |
| [FDA provenance](15-chrome-fda-source.png) | FDA source link and effective date |

The initial full-page image `01-preview-side-effects-pricing.png` has screenshot-stitching duplication and is not acceptance evidence. The viewport captures above supersede it. Images `02`, `10`, and `11` are intermediate position checks. Image `05` shows the second medication's interaction section despite its broader filename.

The first visible 30-EA benchmarks were $0.72 for a Metformin package and $335.57 or $335.65 for two Jardiance packages. These figures retain NDC, unit amount, effective date, and CMS provenance. They are not comparable retail offers, patient prices, or savings recommendations. Bounded label/package coverage notices remain visible. A future API outage can still make facts unavailable; the fix makes that state explicit and recoverable instead of reporting an empty comparison as fully loaded.

## References

The lookup uses the FDA's documented search, sorting, and limits. [FDA query parameters](https://open.fda.gov/apis/query-parameters/)

The pricing requests use Medicaid's datastore API with bounded queries. [Medicaid API](https://data.medicaid.gov/about/api), [DKAN query examples](https://dkan.readthedocs.io/en/2.x/user-guide/guide_api.html)

The tools return data availability separately from workspace mutation success, following Chrome's reliability guidance. [WebMCP best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices)
