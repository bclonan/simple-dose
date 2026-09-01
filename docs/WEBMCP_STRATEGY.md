# ClearDose WebMCP strategy

This note records why each ClearDose tool exists, how the registry follows Chrome's WebMCP guidance, and what a future tool must prove before it is added. Runtime behavior in `src/webmcp/definitions.ts` is the source of truth.

## Official guidance map

| Chrome guidance | Point used here | ClearDose decision |
| --- | --- | --- |
| [Use cases](https://developer.chrome.com/docs/ai/webmcp/use-cases) | Tools should support a real user journey, including search, review, delivery, and purchase steps when the product has them. | Tools cover the existing fictional prescription shopping path. They do not add clinical advice, background work, or account features. |
| [Build tools](https://developer.chrome.com/docs/ai/webmcp/build-tools) | Define the goal, initial state, actions, UI reactions, boundaries, and recovery before writing a contract. | The journey table below defines those facts for each tool chain. Errors point to a specific recovery tool. |
| [Best practices](https://developer.chrome.com/docs/ai/webmcp/best-practices) | Give each tool one job, avoid overlap, prefer static registration, use typed inputs, update the UI, and validate again in code. | Eleven focused tools share one static registry and the same application actions as the Vue interface. Schemas and runtime parsers both validate input. |
| [Evals](https://developer.chrome.com/docs/ai/webmcp/evals) | Test direct and ambiguous requests, tool choice, arguments, ordering, multi-tool journeys, and failures. | Eleven fixtures cover all eleven tools, plus ordered execution and a mid-chain recovery. Deterministic tests execute the application actions. |
| [Secure tools](https://developer.chrome.com/docs/ai/webmcp/secure-tools) | Declare side effects honestly, keep exposure narrow, and bound names, descriptions, and outputs. | Annotation hints match stored effects. No tool opts into cross-origin exposure. Contract budgets and output sanitation have tests. |

## Journey strategy

| User goal | Initial state | Tool chain | Visible UI reaction | Boundary | Recovery |
| --- | --- | --- | --- | --- | --- |
| Find and compare one medication | Catalog loaded, no exact selection required | `search_medications` then `get_medication_details` when needed, then `compare_fulfillment_options` | Search results open, then the ranked comparison opens | All four SKU fields must match. The agent cannot substitute a strength, form, or quantity. | Read valid configurations with `get_medication_details`, then compare again. |
| Select an option, prepare a request, and add it to the cart | A current offer and delivery ID from comparison | `select_medication_option`, `create_prescription_request_card`, `add_to_cart`, `view_cart` | Selection updates, the request-card route opens, and the cart drawer shows totals | The request card stays local and is not a prescription. The cart uses the same exact offer and delivery IDs. | Recompare stale offer IDs. Use `remove_cart_item` for a mistaken addition. |
| Recheck after prices change | An exact selection is already stored | `compare_fulfillment_options` with the exact SKU fields omitted | The comparison route opens with current prices and whether the selected option is still lowest | Omission reuses the full stored selection. A partial exact-SKU input is rejected. | Supply all four exact fields for a new configuration. |
| Correct the cart | Cart contains at least one item | `view_cart`, `remove_cart_item`, then `view_cart` | The drawer opens and totals update | Item removal deletes one ID, not the whole cart. | Call `view_cart` again if an ID is stale. |
| Finish and track the demo order | Cart is not empty. A matching request exists when `request-prepared` is chosen | `view_cart`, optional `set_delivery_option`, `checkout_demo_order`, `get_order_status` | Checkout readiness appears, totals update, then the order route opens | No payment, prescription, pharmacy request, or network call occurs. | Read the cart requirements. Omit `orderId` to inspect the current order. |

## Tool inventory

| Tool | Effect profile | Main input source | Result and recovery |
| --- | --- | --- | --- |
| `search_medications` | State change, idempotent | User search text and optional filters | Paged matches, visible search state, and a medication route. Narrow the query or use the next offset. |
| `get_medication_details` | Read only, idempotent | `medicationId` from search | Valid forms, strengths, quantities, and SKU count. |
| `compare_fulfillment_options` | State change, idempotent | Four exact SKU fields, or the persisted exact selection | Paged delivered totals and selection comparison. Use details for an unavailable configuration. |
| `select_medication_option` | State change, idempotent | Offer and delivery IDs from comparison | Stored exact selection and comparison route. Recompare stale IDs. |
| `create_prescription_request_card` | State change | Offer and delivery IDs, plus optional demo names and birth date | Local request ID and non-clinical summary. Recompare stale IDs. |
| `add_to_cart` | State change | Offer and delivery IDs from comparison | Cart ID and revised totals. Remove the returned ID to correct a mistake. |
| `view_cart` | Read only, idempotent | Optional page offset and limit | Paged items, delivery alternatives, totals, readiness, and required checkout fields. |
| `remove_cart_item` | State change, destructive, idempotent | Current cart item ID | Revised totals. Read the cart again when the ID is stale. |
| `set_delivery_option` | State change, idempotent | Current cart item and delivery IDs | Revised line and grand total. Read the cart for current IDs. |
| `checkout_demo_order` | State change, destructive | Demo recipient fields and prescription status | Local order ID, route, total, and status. It consumes the cart. Add an item first or prepare a matching request. |
| `get_order_status` | Read only, idempotent | Optional order ID and item page | Sanitized local status. Omit the ID to use the current order. |

`search_medications` and `compare_fulfillment_options` are state changes because they persist shared state and navigate the visible interface. `view_cart` is read-only for stored commerce data even though it opens the cart drawer as feedback.

Chrome's current Imperative API receives `readOnlyHint` and `untrustedContentHint`. Three tools are read-only and eight change state. All eleven return controlled fictional records, so `untrustedContentHint` is false. ClearDose keeps destructive and idempotent labels as local Agent Lab metadata. Chrome may drop those extra fields. The registered descriptions and visible UI therefore say that removal deletes one line and checkout creates an order and consumes the cart.

## Registry and output policy

ClearDose registers all eleven tools once at application startup. The tools remain available across routes because each one works on shared Pinia state. One abort signal owns the registry and cleans it up on application teardown.

The registration call does not pass `exposedTo`, so ClearDose does not opt tools into cross-origin exposure. A `ready` status means `getTools` verified all expected names. A partial result is `degraded`, names the missing tools, and gates native example execution by the discovered name list. `ready-unverified` means all registration promises completed, but the browser cannot list the exposed registry. In that state, the Agent Lab count is the configured count and its examples use the local definition fallback.

All object schemas set `additionalProperties: false`. Runtime parsers repeat key, type, enum, range, pattern, ID, and calendar-date checks. Comparison accepts all four exact SKU fields or none. Errors explain the failed condition and name a useful next tool.

Manual Agent Lab calls pass `JSON.stringify(input)` to `document.modelContext.executeTool`, as required by Chrome's current Imperative API. Tests reject non-string input on the primary path so this contract cannot drift unnoticed. A narrow fallback retries with an object only when an older preview runtime explicitly reports that it requires object input. Other execution errors are not retried.

Contract limits are 500 characters per tool description, 150 per parameter description, 30 per tool or parameter name, and 1,500 per serialized output. The original `create_prescription_request_card` name is the one documented name exception. Pagination is explicit:

| Tool | Paging input | Default and maximum page |
| --- | --- | --- |
| `search_medications` | `offset`, `limit` | 5 by default, 10 maximum |
| `compare_fulfillment_options` | `offset`, `maxResults` | 5 by default, 8 maximum |
| `view_cart` | `offset`, `limit` | 3 by default, 5 maximum |
| `get_order_status` | `itemOffset`, `itemLimit` | 5 by default and maximum |

Paged outputs include a truncation flag and a continuation offset. The adapter trims collection entries if serialization still exceeds 1,500 characters. Its final fallback returns only a short retry instruction.

## Security choices

- The local JSON catalog is controlled fictional data. Tools make no network requests and do not contact pharmacies, prescribers, insurers, or payment systems.
- Checkout accepts demo recipient fields but returns only order ID, route, total, status, and a notice. Order status omits recipient names and addresses.
- The activity store redacts keys that contain name, birth, address, postal, ZIP, patient, or prescriber. It also caps samples and keeps compact output summaries.
- Local storage is persistence for the demo, not a security boundary. The product tells users to use demo information only.
- Registration stops on failure, aborts earlier registrations, and removes the registry on application teardown.
- Consequential actions stay narrow. Checkout creates a local record. Removal deletes one cart line. No tool diagnoses, recommends a dose, substitutes a SKU, or transmits a prescription.

## Eval matrix

The fixture file is `tests/evals/cleardose-evals.json`. The runner in `tests/evals/cleardose-evals.test.ts` validates the catalog, schemas, call order, runtime binding, and executable recovery paths. It does not call a language model.

| Category | Cases | What is checked |
| --- | ---: | --- |
| Direct | 5 | Search, medication details, cart read, order read, and single-item removal |
| Ambiguous | 3 | Brand-to-generic search, exact comparison from prose, and recompare of persisted selection |
| Wrong order | 1 | A seven-call commerce chain plus a rejected checkout-before-cart counterexample |
| Multi-step | 1 | Search through request-card creation, cart addition, and total review |
| Recovery | 1 | Unavailable strength error, catalog inspection, corrected comparison, and selection |

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
2. Confirm the UI already supports the action through `src/services/cleardose.actions.ts` or add the shared action first.
3. Check all existing tools for overlap. Prefer a new input or clearer output when an existing tool already owns the action.
4. Use a specific name and description. Accept raw typed fields, not an opaque prompt or precomputed answer.
5. Set `additionalProperties: false`, narrow enums and ranges, then repeat every important check in runtime code.
6. Set Chrome's read-only and untrusted-content hints from actual behavior. Record destructive and idempotent effects in local metadata and plain descriptions.
7. Keep same-origin exposure unless a reviewed cross-origin use case requires more.
8. Await the shared action and its route change so the human sees the completed result.
9. Return only what the next step needs. Add pagination before output can cross 1,500 characters.
10. Remove or summarize personal fields. Check the activity log as well as the direct tool response.
11. Add direct and ambiguous call fixtures. Add ordering, journey, or recovery coverage when the action depends on prior state.
12. Run `pnpm test:evals` and `pnpm verify`.

Do not add generic navigation, a second cheapest-option selector, a separate checkout-readiness tool, bulk cart clearing, or medical recommendation tools. Navigation belongs inside the action that changes the page. Comparison already identifies the lowest option, `view_cart` already reports readiness, item removal is enough to recover from a mistaken addition, and clinical advice is outside ClearDose's stated boundary.
