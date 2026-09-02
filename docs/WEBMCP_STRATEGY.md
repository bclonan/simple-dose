# ClearDose WebMCP strategy

This note records why each ClearDose tool exists, how the registry follows Chrome's WebMCP guidance, and what a future tool must prove before it is added. Runtime contracts live in `src/webmcp/definitions.ts` and `src/webmcp/dynamic.ts`. The [public-data migration map](data-migration.md) explains the plugin and repository boundaries.

## Official guidance map

| Chrome guidance | Point used here | ClearDose decision |
| --- | --- | --- |
| [Use cases](https://developer.chrome.com/docs/ai/webmcp/use-cases) | Tools should support a user journey, including search, review, delivery, and purchase steps when the product has them. | Public discovery and reference comparison share the UI's data service. The original fictional shopping path remains separate from clinical information. |
| [Build tools](https://developer.chrome.com/docs/ai/webmcp/build-tools) | Define the goal, initial state, actions, UI reactions, boundaries, and recovery before writing a contract. | The journey table below defines those facts for each tool chain. Errors point to a specific recovery tool. |
| [Best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices) | Give each tool one job, avoid overlap, prefer static registration, use typed inputs, update the UI, and validate again in code. | Twelve tools remain static. Two medication tools refresh current-ID schemas because their valid choices depend on the loaded catalog and page. All use shared application behavior. |
| [Evals](https://developer.chrome.com/docs/ai/webmcp/evals) | Test direct and ambiguous requests, tool choice, arguments, ordering, multi-tool journeys, and failures in the complete available tool context. | Deterministic fixtures cover call contracts and journeys. Dynamic tests cover changing schemas, stale IDs, cancellation, section paging, and provider-backed browser paths. These are not live-model scores. |
| [Secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools) | Declare side effects honestly, mark external content, keep exposure narrow, and bound descriptions and outputs. | Public-data tools mark results untrusted. No tool opts into cross-origin exposure. Source text stays out of schema instructions. Contract budgets and output sanitation have tests. |

## Journey strategy

| User goal | Initial state | Tool chain | Visible UI reaction | Boundary | Recovery |
| --- | --- | --- | --- | --- | --- |
| Find and compare one medication | Catalog loaded, no exact selection required | `search_medications` then `get_medication_details` when needed, then `compare_fulfillment_options` | Search results open, then the ranked comparison opens | All four SKU fields must match. The agent cannot substitute a strength, form, or quantity. | Read valid configurations with `get_medication_details`, then compare again. |
| Read public medication information | A search result or loaded medication ID exists | `get_medication_details`, then `compare_medications` with one ID and a section | Shared normalized records load; the tool returns field rows and the activity drawer records the call | Public-only records do not receive invented pharmacy offers. Missing label data is unavailable, not proof of safety. | Follow `nextOffset`; choose another section or retry after a provider failure. |
| Inspect related records | Current catalog choices are registered | `find_related_medications`, then `compare_medications` for chosen IDs | Match reasons and normalized comparison results use the same service as the related-record UI | Catalog similarity does not establish therapeutic interchangeability or personal suitability. No selection or cart changes occur. | Refresh tools after context changes. Load public details before requesting ingredient or class matching. |
| Select an option, prepare a request, and add it to the cart | A current offer and delivery ID from comparison | `select_medication_option`, `create_prescription_request_card`, `add_to_cart`, `view_cart` | Selection updates, the request-card route opens, and the cart drawer shows totals | The request card stays local and is not a prescription. The cart uses the same exact offer and delivery IDs. | Recompare stale offer IDs. Use `remove_cart_item` for a mistaken addition. |
| Recheck after prices change | An exact selection is already stored | `compare_fulfillment_options` with the exact SKU fields omitted | The comparison route opens with current prices and whether the selected option is still lowest | Omission reuses the full stored selection. A partial exact-SKU input is rejected. | Supply all four exact fields for a new configuration. |
| Correct the cart | Cart contains at least one item | `view_cart`, `remove_cart_item`, then `view_cart` | The drawer opens and totals update | Item removal deletes one ID, not the whole cart. | Call `view_cart` again if an ID is stale. |
| Compare a multi-item cart | One or more exact medication lines are in the cart | `view_cart`, then `compare_cart_savings` | The cart shows current total, lowest available total, and item-level savings | Savings compare only current fictional delivered totals for the same exact SKU. The tool does not change the cart. | A same-offer saving uses `set_delivery_option`. A different offer is added first and the original is removed only after success. |
| Finish and track the demo order | Cart is not empty. A matching request exists when `request-prepared` is chosen | `view_cart`, optional `set_delivery_option`, `checkout_demo_order`, `get_order_status` | Checkout readiness appears, totals update, then the order route opens | No payment, prescription, pharmacy request, or network call occurs. | Read the cart requirements. Omit `orderId` to inspect the current order. |
| Inspect and replay recent work | At least one completed tool journey exists in the local activity log | Expand the floating WebMCP control, inspect calls, review replay, then confirm | The drawer shows ordered calls, timing, redacted inputs, bounded results, and before and after state | Checkout, failed, unfinished, oversized, and identity-bearing histories are not replayed blindly. | Run a smaller safe journey or start again from the Agent Lab. |

## Tool inventory

| Tool | Effect profile | Main input source | Result and recovery |
| --- | --- | --- | --- |
| `search_medications` | State change, idempotent | User search text and optional filters | Paged matches, visible search state, and a medication route. Narrow the query or use the next offset. |
| `get_medication_details` | Read only, idempotent | `medicationId` from search | Configuration metadata, public data status, source names, and clinical-section availability. Full sections are read through `compare_medications`. |
| `compare_fulfillment_options` | State change, idempotent | Four exact SKU fields, or the persisted exact selection | Paged delivered totals and selection comparison. Use details for an unavailable configuration. |
| `select_medication_option` | State change, idempotent | Offer and delivery IDs from comparison | Stored exact selection and comparison route. Recompare stale IDs. |
| `create_prescription_request_card` | State change | Offer and delivery IDs, plus optional demo names and birth date | Local request ID and non-clinical summary. Recompare stale IDs. |
| `add_to_cart` | State change | Offer and delivery IDs from comparison | Cart ID and revised totals. Remove the returned ID to correct a mistake. |
| `view_cart` | Read only, idempotent | Optional page offset and limit | Paged items, delivery alternatives, totals, readiness, and required checkout fields. |
| `compare_cart_savings` | Read only, idempotent | Optional cart-line offset and limit | Current and optimized totals, item savings, and exact safe next actions. Add an item first if the cart is empty. |
| `remove_cart_item` | State change, destructive, idempotent | Current cart item ID | Revised totals. Read the cart again when the ID is stale. |
| `set_delivery_option` | State change, idempotent | Current cart item and delivery IDs | Revised line and grand total. Read the cart for current IDs. |
| `checkout_demo_order` | State change, destructive | Demo recipient fields and prescription status | Local order ID, route, total, and status. It consumes the cart. Add an item first or prepare a matching request. |
| `get_order_status` | Read only, idempotent | Optional order ID and item page | Sanitized local status. Omit the ID to use the current order. |
| `find_related_medications` | Read only, dynamic | Current revision, reference ID, matching basis, and page/catalog scope | Paged match reasons from current catalog metadata and already-loaded public facts. Refresh tools after stale context. |
| `compare_medications` | Read only, dynamic | Current revision, one to four IDs, scope, section, and field-row page | Normalized identity, product, clinical, pricing, or source fields. Follow `nextOffset` for the complete selected section. |

`search_medications` and `compare_fulfillment_options` are state changes because they persist shared state and navigate the visible interface. `view_cart` is read-only for stored commerce data even though it opens the cart drawer as feedback.

Chrome's current Imperative API receives `readOnlyHint` and `untrustedContentHint`. `search_medications`, `get_medication_details`, and both dynamic tools mark external data as untrusted. The original fulfillment and commerce tools retain controlled demo outputs. ClearDose keeps destructive and idempotent labels as local Agent Lab metadata. Chrome may drop those extra fields. Registered descriptions and visible UI therefore explain that removal deletes one line and checkout creates a local order and consumes the cart.

## Connected-agent context and similarity

WebMCP gives the connected browser agent a current medication list through ID enums and short name labels in the two dynamic schemas. The agent supplies the LLM. ClearDose does not create a model session, send an autonomous model request, store an API key, or run embeddings. The tool schema constrains identifiers; the agent can combine public search, loaded catalog context, and returned details to interpret the user's request.

`find_related_medications` matches a selected field. Ingredient and pharmacologic-class matches require normalized public facts already loaded for both records. Category and form matches use explicit catalog metadata, including the original human-friendly taxonomy. It does not fetch clinical data for every search hit, infer similarity from diagnosis, or identify therapeutic substitutes. A missing match can mean the necessary public facts have not been loaded.

`compare_medications` reads one record or compares up to four. It does not replace `compare_fulfillment_options`, which ranks fictional delivered prices for one exact SKU. Clinical comparison never chooses a medicine, adjusts a dose, or adds a substitute to the cart.

## Data boundary and provenance

Human and agent paths share `src/plugins/cleardose.ts`, `MedicationRepository`, and the catalog store. The singleton plugin owns RxNorm, openFDA, and NADAC requests, normalization, source-specific caching, and concurrent-request deduplication. The app uses its legacy adapter for medication metadata only. It does not import generated benchmark offers or run the plugin's separate WebMCP registrar.

Production defaults to hybrid mode. Public search and details are preferred, with cached data and labeled demo fallback. Live mode excludes fictional fulfillment and checkout; demo mode keeps deterministic fixtures without public detail requests. The loaded catalog retains 100 public identities plus 12 original seed records. New public IDs are not assertions of pharmacy availability, prescription status, or purchasable package configurations.

Provider stamps and status distinguish live, cache, stale cache, demo fallback, and unavailable data. Search and product caches default to one day, RxNorm identity to 30 days, and label/NADAC caches to seven days. IndexedDB failure falls back to memory; an expired source record can remain usable with a stale-cache warning after a provider failure. Optional-source errors preserve successful data and report notices. No match, rate limit, malformed response, network error, and unavailable price data are not treated as equivalent clinical findings.

NADAC quotes retain `nadac-benchmark`, exact NDC, quantity, dates, and source. Queries check up to four package NDCs in parallel under one timeout and report partial coverage. Their totals are acquisition-cost benchmarks, not consumer cash prices or copays, and do not enter the cart. Genuine cash pricing and inventory are unavailable. The local Medicare provider remains disabled because no genuine preprocessed index is configured. Its bundled example is not evidence of Medicare costs for a user.

## Registry and output policy

ClearDose registers the twelve static tools at startup. Two additional medication tools register when the active catalog is nonempty, yielding fourteen tools in a populated hybrid catalog. Live mode can have no active medication choices until a public record is loaded.

The static registry owns one abort signal. The dynamic registry owns another and serializes schema replacement. Its signature uses the current route, active catalog identities, page IDs, and data mode rather than unrelated activity-store changes. It aborts the old registrations before reusing their names, coalesces updates, and ignores late work after disposal. Initial registration receives a final refresh so context changes during startup are not lost.

Dynamic schemas include current medication IDs, short sanitized public names, `scope`, and a `contextRevision` constant. Page scope limits candidates to current page context; catalog scope uses the active loaded store, not the full public drug universe. Runtime checks repeat membership, distinct-ID, range, and revision validation. A session nonce prevents revision collisions after reload. Held stale handlers instruct the agent to refresh the available tools before retrying.

The registration call does not pass `exposedTo`, so ClearDose does not opt tools into cross-origin exposure. A `ready` status means `getTools` verified all expected names. A partial result is `degraded`, names the missing tools, and gates native example execution by the discovered name list. `ready-unverified` means all registration promises completed, but the browser cannot list the exposed registry. In that state, the Agent Lab count is the configured count and its examples use the local definition fallback.

All object schemas set `additionalProperties: false`. Runtime parsers repeat key, type, enum, range, pattern, ID, and calendar-date checks. Comparison accepts all four exact SKU fields or none. Errors explain the failed condition and name a useful next tool.

Manual Agent Lab calls pass `JSON.stringify(input)` to `document.modelContext.executeTool`, as required by Chrome's current Imperative API. Tests reject non-string input on the primary path so this contract cannot drift unnoticed. A narrow fallback retries with an object only when an older preview runtime explicitly reports that it requires object input. Other execution errors are not retried.

Contract limits are 500 characters per tool description, 150 per parameter description, 30 per tool or parameter name, and 1,500 per serialized output. The original `create_prescription_request_card` name is the one documented name exception. Pagination is explicit:

| Tool | Paging input | Default and maximum page |
| --- | --- | --- |
| `search_medications` | `offset`, `limit` | 5 by default, 10 maximum |
| `compare_fulfillment_options` | `offset`, `maxResults` | 5 by default, 8 maximum |
| `view_cart` | `offset`, `limit` | 3 by default, 5 maximum |
| `compare_cart_savings` | `offset`, `limit` | 5 by default and maximum |
| `get_order_status` | `itemOffset`, `itemLimit` | 5 by default and maximum |
| `find_related_medications` | `offset`, `limit` | 5 field rows by default, 10 maximum |
| `compare_medications` | `section`, `offset`, `limit` | 5 field rows by default, 10 maximum |

Static paged outputs include a truncation flag and a continuation offset. The adapter trims collection entries if serialization exceeds 1,500 characters and adjusts the continuation position to avoid skipped items.

Dynamic outputs return `rows` with JSON Pointer `path` and `value`, plus `offset`, `returned`, `totalRows`, and `nextOffset`. Long strings split into ordered `part` and `parts` values. Following continuation offsets recovers the complete normalized section without silently dropping long FDA warnings. Read `identity`, `product`, `clinical`, `prices`, and `sources` separately. Clinical contains all normalized label sections, including side effects, interactions, warnings, and dosage text when available. Offset zero refreshes a result; subsequent pages reuse that result snapshot. Large malformed normalized inputs fail with a narrowing instruction instead of exposing raw provider JSON.

## Security choices

- Public search and detail tools can contact official medication-data providers through the plugin. They do not contact pharmacies, prescribers, insurers, or payment systems. Demo commerce remains local.
- Provider text is untrusted result content. Only stable application IDs and short public name labels enter the dynamic schemas; FDA clinical paragraphs never become agent instructions.
- Checkout accepts demo recipient fields but returns only order ID, route, total, status, and a notice. Order status omits recipient names and addresses.
- The activity store redacts personal name, birth, address, postal, ZIP, patient, prescriber, and practice fields. Explicit public drug and pharmacy labels are allowed. It keeps at most 100 calls and exposes at most 10 recent journeys. Workflow outputs use bounded summaries. Dynamic read receipts preserve the complete bounded field-row page, continuation metadata, and notice, not the entire multi-page provider record.
- Calls record route, data mode, loaded medication IDs, pricing scenario, exact selection IDs, cart IDs and totals, and sanitized order state before and after execution. Catalog and cart ID lists support up to 112 IDs. Dynamic call arguments preserve the schema revision and requested scope. Snapshots omit recipient names and addresses.
- Replay requires visible review and confirmation. Checkout, failed, unfinished, and journeys longer than 12 calls are blocked. Before any call, replay validates every recorded before/after data mode, then checks mode again at each step. The two dynamic read tools require a saved mode and revision. Saved IDs must still be in the active catalog and, for page scope, on the current page before replay binds the current revision. Other saved arguments remain unchanged. Runtime stale-context checks still apply; optional redacted fields are removed.
- Local storage is persistence, not a security boundary. The product tells users to use fictional identity and address fields. Source caches contain public records, not a patient medical record.
- Registration stops on failure, aborts earlier registrations, and removes the registry on application teardown.
- Consequential actions stay narrow. Checkout creates a local record. Removal deletes one cart line. No tool diagnoses, recommends a dose, substitutes a SKU, or transmits a prescription.

## Eval matrix

The [Drug Explorer extension](drug-explorer.md) adds five workspace tools to the same registration lifecycle. Its mutation schemas derive facts and current card IDs from visible Pinia state. `cleardose_show_drug_fact` supports additive cards and an explicit replace mode for "only show these facts." Read-only `compare_medications` remains the full public-data reader, avoiding overlapping fact-specific read tools. Before/after workspace context and guarded reviewed replay remain visible in the floating log.

The fixture file is `tests/evals/cleardose-evals.json`. Its runner validates the static catalog, schemas, call order, runtime binding, and executable recovery paths. It does not call a language model. Live-model tool-choice accuracy remains a separate evaluation step; deterministic tests must not be presented as a model score.

| Category | What is checked |
| --- | --- |
| Direct | Search, medication details, cart read, savings, order read, and removal |
| Ambiguous | Brand-to-generic search, exact comparison from prose, and recompare of persisted selection |
| Wrong order | A commerce chain plus a rejected checkout-before-cart counterexample |
| Multi-step | Search through request-card creation, cart addition, and total review |
| Recovery | Unavailable strength error, catalog inspection, corrected comparison, and selection |
| Dynamic context | Current-ID enums, page scope, stale revisions, duplicate prevention, rapid refresh, and disposal |
| Public data | Partial sources, benchmark semantics, cache fallback, bounded clinical pagination, and no public-only cart offer |

`tests/evals/cleardose-extension-acceptance.test.ts` adds executable checks for multi-item order preservation, same-offer and different-offer savings plans, explicit journey correlation, sensitive replay-argument removal, checkout replay blocking, and the 12-call replay cap.

`src/webmcp/dynamic.test.ts` covers context-sensitive schemas and lossless field paging. `tests/e2e/cleardose-public-data.spec.ts` mocks the official provider HTTP endpoints while testing public search, normalized detail UI, offline cached records, related comparison, live-mode commerce restrictions, and a browser-native registry shim. These tests exercise actual application paths without depending on provider availability.

Run the focused suite with:

```bash
pnpm test:evals
```

Run all local checks after Chromium is installed with:

```bash
pnpm verify
```

## Extension checklist

Before adding a tool:

1. Write the user goal, required initial state, one product action, visible UI reaction, boundary, and recovery.
2. Confirm the UI already supports the operation through shared actions or the medication repository; add that shared behavior first if needed.
3. Check all existing tools for overlap. Prefer a new input or clearer output when an existing tool already owns the action.
4. Use a specific name and description. Accept raw typed fields, not an opaque prompt or precomputed answer.
5. Set `additionalProperties: false`, narrow enums and ranges, then repeat every important check in runtime code.
6. Set Chrome's read-only and untrusted-content hints from actual behavior. Record destructive and idempotent effects in local metadata and plain descriptions.
7. Keep same-origin exposure unless a reviewed cross-origin use case requires more.
8. Keep registration static unless the operation's valid choices or availability depend on current context. Dynamic tools need revision checks and serialized replacement, not only a reactive schema object.
9. Await shared work and any route change. Read-only reference tools need no navigation. Return the next useful data within 1,500 characters and provide lossless continuation for complete public sections.
10. Remove or summarize personal fields. Check the activity log as well as the direct tool response.
11. Add direct and ambiguous call fixtures with the full relevant tool list. Test provider failure, stale schema, cancellation, paging, and refresh races where applicable.
12. Run `pnpm test:evals` and `pnpm verify`.

Do not add generic navigation, a second cheapest-option selector, a separate checkout-readiness tool, bulk cart clearing, or medical recommendation tools. Navigation belongs inside the action that changes the page. Comparison already identifies the lowest option, `view_cart` already reports readiness, item removal is enough to recover from a mistaken addition, and clinical advice is outside ClearDose's stated boundary.
