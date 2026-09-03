# ClearDose flow repair

Requested scope: repair visible WebMCP updates, Drug Explorer continuity, and cart-to-checkout. Deploy to the existing Netlify site after verification.

## Confirmed failures

- Live production on September 3: `cleardose_show_drug_fact` built a Metformin and Jardiance report with side-effect and public pricing data. Clicking Medications, then Drug Explorer, reset the report to zero selections. The bare navigation URL incorrectly replaced the shared workspace with empty state.
- A regression test proved that the departing medication detail page reinitialized its own medication after a tool selected another medication, before navigation completed. A successful Metformin tool response could leave Atorvastatin visible on Compare.
- A second prescription request tool call updated the request card but not the already-mounted patient and prescriber fields.
- There was no tool to fill checkout without creating an order. Compare also lacked an Add to cart action.
- Saved cart rows with unresolved references disappeared from displayed lines and totals. Raw item count still allowed checkout readiness. This could produce a partial order.
- An open cart drawer covered reports and comparisons opened by native tools. Shared navigation now closes the drawer while preserving its items. The existing closing animation briefly retains the dialog DOM node, then removes it.
- The original open production tab still used `/assets/index-DH0e8Qye.js`. A request for that removed module returned the SPA HTML fallback instead of JavaScript. This is evidence of a stale loaded build, not proof that every prior browser connection failure had that cause.

## Repairs

- Preserve an existing Explorer report when returning through bare in-app navigation. Explicit URL queries remain authoritative.
- Separate detail-page initialization from quantity/data refresh. Synchronize prescription fields when the authoritative request changes.
- Add a visible comparison-to-cart button and bind the delivery-window filter to the same state used by tools.
- Add `prepare_demo_checkout` to populate a shared, memory-only checkout form. It opens the form for review, creates no order, and never includes recipient values in its response. Human edits feed the same action used by explicit order submission.
- Reject incomplete cart checkout without deleting saved rows. Show repair/removal controls. Do not report partial totals as a complete cart.
- Redact checkout inputs, block preparation replay, and clear the draft with Reset demo.
- Clarify that `compare_medications` reads data without changing the page. The visible report tool is `cleardose_show_drug_fact`.
- Add a visible Reload page recovery link for recognized lazy-module failures. It preserves the intended same-origin URL, does not reload or reset automatically, and warns that unsaved checkout fields clear on reload.
- Style the checkout preparation notice separately from compact form notes so it no longer overlaps the form.

## Verification record

Final checks passed on September 3, 2026:

- `pnpm install --frozen-lockfile`: up to date.
- `pnpm test`: 47 files, 392 tests passed.
- `pnpm test:evals`: 19 passed.
- `pnpm build`: Vue typecheck and Vite production build passed.
- `pnpm test:e2e`: 36 passed. Final stable rerun followed the last UI edit.
- `git diff --check`: passed. Git reported normal CRLF conversion warnings.
- `node scripts/check-hosted-docs.mjs`: final preview and production matched the tested assets and application module.

The first aggregate registration check rejected the new tool because declarations exceeded the existing 18,000-byte application budget. Shortening repeated canonical descriptions reduced the worst tested declaration payload to 17,794 bytes. The budget and input constraints remain unchanged. The final browser run verified registration and documentation coverage for 20 tools. This does not mean all 20 were called manually on production.

## Hosted flow evidence

All browser interactions used the browser UI or fetched native WebMCP tools. No hidden store mutation or injected tool execution was used. Checkout data was fictional. UI review and submission below means the test agent edited the visible form and clicked its button, not that the user personally approved an order.

| Check | Hosted result |
| --- | --- |
| Native search | `search_medications` populated the visible search input with `atorvastatin`. |
| Public report | Metformin and Jardiance produced a side-by-side report with four available side-effect/pricing cells. FDA and NADAC partial-data notices remained visible. |
| Return navigation | Medications followed by Drug Explorer preserved both selected medications, both topics, and the canonical report URL. |
| FDA-only interactions | `cleardose_show_drug_fact` with `facts: ["interactions"]` and `mode: "replace"` left one topic with two available FDA label sections. This is not a pairwise clinical safety check. |
| Exact fulfillment | Native comparison used returned shop configurations. The visible medication and delivery filter matched. Preview also tested leaving an Atorvastatin detail page to compare Metformin. |
| Cart entry paths | Selected Metformin through WebMCP and added it using the visible Compare button. Added public-record Empagliflozin through `add_to_cart`. |
| Cart integrity | `view_cart` returned two resolved items, zero issues, complete totals, and checkout readiness. No saved rows were silently discarded. |
| Savings | Production `compare_cart_savings` returned $0.45 potential fictional fulfillment savings across both paged item results. No replacement was applied. |
| Checkout link | The visible Go to checkout link opened the two-item checkout. |
| Visible preparation | `prepare_demo_checkout` filled name, street, city, state, ZIP and prescription status. It returned `orderCreated: false`. |
| UI completion | Edited the fictional recipient name in the visible form and clicked Place demo order. Both items appeared in local order `CD-2026-0001`, total $28.55. |
| Native receipt | `get_order_status` returned both items and $28.55 without recipient name/address. The cart was empty after completion. |
| Console | No warnings or errors appeared in the production browser console during this smoke journey. Provider data notices are separate and remain visible. |

Public facts came from loaded provider records, including cached records labeled as such. Shop prices, configurations, delivery options and orders are simulated. No payment or prescription was transmitted.

Production screenshots:

- [Side-by-side public facts](production-comparison.png)
- [FDA interactions only](production-interactions.png)
- [Two-item cart](production-two-item-cart.png)
- [Visible checkout fields populated by WebMCP](production-checkout-filled.png)
- [Local order confirmation](production-order.png)

Machine-readable evidence:

- [Production tool inputs, outputs and UI observations](production-native-journey.json)
- [Earlier full preview journey](preview-native-journey.json), deploy `6a999e428ab8602ae6724e4f`.
- [Final preview report reveal](final-preview-reveal.json), deploy `6a99a160014b1ae0145ca4fd`. This narrower check confirms report visibility and cart preservation, not a second full checkout run.
- [Original tab refreshed](original-tab-refreshed.json).

## Browser connection notes

One browser automation call reported that its trusted Node process exited and reset the kernel. Inventory and tab selection recovered. No application mutation was attempted in that failed call. The process exit's underlying cause is not established by app evidence.

A separate call batched a UI route change and a native tool request. The browser rejected the request because its approval context had changed. Reading the new page and fetching tools before a separate native call succeeded. Browser safety checks were not weakened and no uncertain mutation was retried.

These automation failures are distinct from the reproduced app state bugs. A shell-hosted asset check also encountered sandbox network denial, then passed with approved network access.

## Release

Published and smoke-tested on [ClearDose production](https://cleardose-webmcp-demo.netlify.app).

- Production deploy: `6a99a1daccbb3911363f9036`.
- [Immutable production build](https://6a99a1daccbb3911363f9036--cleardose-webmcp-demo.netlify.app).
- Tested application module: `/assets/index--FnKjYYq.js`.
- Final preview used the same built artifact. No rebuild or source edit occurred between preview and production publication.
- Production asset identity check passed at `2026-09-03T16:36:18Z`. Production demo order completed at `2026-09-03T16:40:13Z`.
- Refreshed the original open Medications tab. Its module changed from `/assets/index-DH0e8Qye.js` to the tested production module. No demo reset or storage clear occurred.

Scope limits: all automated tests passed, but hosted native smoke coverage is the listed flows, not every tool/input combination or every possible provider outage. Unknown browser-process failures are not claimed fixed. No source commit or push was performed.
