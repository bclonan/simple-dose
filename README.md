# ClearDose

> Transparent prescriptions. Agent-ready.

## Overview

ClearDose is a fictional direct-to-consumer prescription purchasing demo built for the WebMCP Challenge. A person can search a local medication catalog, configure exact SKUs, compare fictional pharmacy offers, add several medications to one cart, review current savings, complete a simulated checkout, and track the resulting demo order.

Production: [cleardose-webmcp-demo.netlify.app](https://cleardose-webmcp-demo.netlify.app)

An agent can follow the same path through twelve structured browser tools. The interface and the tools share one set of Pinia stores and business actions. All catalog data and application state stay in the browser. There is no backend, account system, payment processor, medical API, or AI model dependency.

## Challenge concept

ClearDose tests whether a browser agent can help with a detailed shopping flow without scraping button labels or maintaining a hidden copy of application state. Medication configuration makes that constraint concrete. A comparison is only valid when the active ingredient, form, strength, and quantity match.

The demo keeps that exact selection visible while the human or agent searches, compares, chooses fulfillment, prepares a request card, and checks out. A seeded market update changes several prices so the same comparison can be run again against new state.

## Why WebMCP matters here

Screen-driving is a poor fit for exact prescription comparisons. WebMCP gives the browser agent named tools, JSON input schemas, and read or write annotations. The agent can ask for one exact SKU instead of inferring state from pixels.

The human can see every meaningful result. Agent search updates the medication results. Agent selection changes the selected offer. Cart and delivery tools update the visible totals. Checkout creates a local order and opens its route. The floating WebMCP control expands into recent journeys and individual calls. Each call records timing, bounded input and output, and redacted before and after state. A reviewed journey can be replayed in order, except checkout and unsafe or incomplete histories.

WebMCP is optional. ClearDose remains usable when `document.modelContext` is unavailable, and the Agent Lab says so plainly.

WebMCP fits this flow because each useful agent action already has a narrow product action and a visible result. It is useful for exact catalog search, comparison, cart correction, and checkout preparation. It is not a substitute for a backend job, a general page-navigation command, or medical advice. See [docs/WEBMCP_STRATEGY.md](docs/WEBMCP_STRATEGY.md) for the decisions traced to the five Chrome WebMCP guidance pages.

## Architecture

```text
                    CLEARDOSE

               ┌───────────────┐
               │  Vue interface│
               └───────┬───────┘
                       │
                       │
               ┌───────▼───────┐
               │ Pinia actions │
               │ + domain logic│
               └───────┬───────┘
                       │
        ┌──────────────┼───────────────┐
        │              │               │
     Catalog        Pricing        Commerce
        │              │               │
        └──────────────┼───────────────┘
                       │
                   Local JSON

 WebMCP adapter
        │
        └────────────→ SAME PINIA ACTIONS
```

Pure catalog and pricing functions handle exact SKU lookup, scenario overrides, subtotal math, delivery totals, and ranking. Focused Pinia stores hold the catalog query, selected SKU and offer, pricing scenario, prescription request, cart, orders, and activity log. Appropriate demo state persists under `cleardose:` keys in `localStorage`.

## Shared human and agent state

`src/services/cleardose.actions.ts` is the shared application action layer. Vue views and components call it for search, comparison, selection, prescription requests, cart changes, delivery changes, and checkout. `src/webmcp/definitions.ts` validates tool input and calls those same actions.

For example, the visible "Add selected option to cart" button and the `add_to_cart` tool both reach `actions.addToCart`, which calls `cart.addItem`. WebMCP is an adapter around the application. It is not a parallel API.

## Critical user journey

```text
Search medication
    ↓
Choose exact strength/form/quantity
    ↓
Compare exact prescription across pharmacies
    ↓
Compare medication + fulfillment + delivery total
    ↓
Select best option
    ↓
Generate prescription request card
    ↓
Add medication to cart
    ↓
Add another exact medication when needed
    ↓
Compare current cart savings
    ↓
Choose delivery
    ↓
Complete simulated checkout
    ↓
Track simulated order
```

The main routes are `/`, `/medications`, `/medications/:slug`, `/compare`, `/prescription-card`, `/checkout`, `/orders/:id`, and `/webmcp`.

## WebMCP tools

ClearDose registers exactly twelve tools through `document.modelContext.registerTool`.

| Tool | Effect profile | What it does |
| --- | --- | --- |
| `search_medications` | State change, idempotent | Searches the catalog, persists the search state, updates the visible results, and opens `/medications`. |
| `get_medication_details` | Read only, idempotent | Returns valid forms, strengths, quantities, prescription requirement, and SKU count. |
| `compare_fulfillment_options` | State change, idempotent | Compares one exact SKU or reuses the current exact selection, persists the comparison, and opens `/compare`. |
| `select_medication_option` | State change, idempotent | Saves one exact offer and delivery option in the shared selection state. |
| `create_prescription_request_card` | State change | Creates and displays a local request summary. It does not issue or transmit a prescription. |
| `add_to_cart` | State change | Adds one exact offer and delivery choice to the visible demo cart. |
| `view_cart` | Read only, idempotent | Returns paged cart lines, delivery alternatives, totals, checkout readiness, and required checkout fields. It opens the cart drawer but does not change stored commerce data. |
| `compare_cart_savings` | Read only, idempotent | Compares every cart line with the lowest current delivered total for the same exact SKU. It returns safe same-offer or replacement steps without changing the cart. |
| `remove_cart_item` | State change, destructive, idempotent | Removes one item by a current `cartItemId`, opens the cart, and returns the revised totals. |
| `set_delivery_option` | State change, idempotent | Changes one cart item's delivery option and recalculates totals. |
| `checkout_demo_order` | State change, destructive | Creates a simulated local order, consumes the cart, and uses demo address fields. |
| `get_order_status` | Read only, idempotent | Returns a sanitized, paged status for an explicit order or the current local order. |

Chrome's current Imperative API receives the two documented annotation hints. Four tools set `readOnlyHint: true`; eight set it to `false`. All twelve set `untrustedContentHint: false` because they return controlled fictional records. The Agent Lab also records local effect metadata for destructive and idempotent behavior. Chrome may ignore that extra metadata, so consequential effects stay explicit in tool names, descriptions, and the visible interface. `remove_cart_item` deletes one cart line. `checkout_demo_order` creates an order and consumes the cart.

ClearDose uses one static registry for the whole application. Every route works with the same Pinia state, so route-specific registration would add churn without narrowing access. One `AbortController` owns all registrations and removes them on application teardown. ClearDose does not pass `exposedTo`, so it does not opt any tool into cross-origin exposure. When `getTools` exists, the app verifies the registered names and refreshes the count after `toolchange`. A partial registry is `degraded`, lists the missing names, and never claims global readiness. An available tool can still run natively; a missing tool-card example uses the shared local definition. If registration succeeds but `getTools` is absent, the status is `ready-unverified`. The count then reflects the configured registry, not verified browser discovery.

Schemas reject undeclared fields with `additionalProperties: false` and use required fields, enums, patterns, and numeric limits. Runtime parsers repeat those checks, including exact IDs, real calendar dates, state codes, postal codes, and the rule that a comparison receives all four exact SKU fields or none. Errors name the next tool to call when recovery is possible.

Agent Lab manual execution follows the current native contract. It serializes the input object to JSON text before calling `document.modelContext.executeTool(tool, jsonInput)`, then parses JSON results when the browser returns them as text. A narrow compatibility retry supports older preview browsers that explicitly reject JSON text and request an object. Other failures are not retried.

The contracts follow Chrome's character budgets: 500 for a tool description, 150 for a parameter description, 30 for tool and parameter names, and 1,500 for serialized output. `create_prescription_request_card` keeps its longer original challenge name as a documented compatibility exception. Search, comparison, cart, savings, and order results use bounded pages with continuation offsets. If a result still exceeds the output budget, the adapter trims collection entries or returns a short retry instruction. Order results omit recipient names and addresses. The activity log redacts sensitive key names, bounds every stored view, and never replays checkout identity or address fields.

## Local demo database

The catalog lives in `src/data/cleardose-demo-db.json`. Its JSON Schema is `src/data/cleardose-demo-db.schema.json`, and its TypeScript types are in `src/types/demo-db.ts`.

The current seed has:

- 12 fictional medications
- 4 fictional pharmacies
- 78 exact medication SKUs
- 312 pharmacy offers
- 1 market update pricing scenario

The top-level records are `metadata`, `medications`, `pharmacies`, `skus`, `offers`, and `pricingScenarios`. Offers store medication cost, fulfillment fee, markup, and available delivery methods. The pricing code recomputes scenario subtotals from their components and calculates delivered total by adding the selected delivery price.

Search state, selection, scenario, the latest prescription request, multi-item cart, orders, and bounded tool journeys persist in `localStorage`. "Reset demo" clears the ClearDose keys and restores seeded defaults. If browser storage is blocked or full, the in-memory application still works for the current session.

## Run locally

Use Node.js 20.19 or newer and pnpm 11.8.

```bash
pnpm install
pnpm dev
```

Open the local URL printed by Vite.

To run the production build locally:

```bash
pnpm build
pnpm preview
```

## Test and build

```bash
pnpm typecheck
pnpm test
pnpm test:evals
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
```

`pnpm test` runs the Vitest unit and WebMCP registration tests. `pnpm test:evals` runs deterministic call-contract, multi-cart, savings-swap, replay-security, ordering, and recovery coverage. It validates the expected tool names, inputs, ordering rules, and executable paths. It does not score a live language model. `pnpm test:e2e` runs the Chromium smoke flows. `pnpm build` runs the TypeScript check before Vite creates `dist`.

Run the full local gate after Chromium is installed:

```bash
pnpm verify
```

To run only the WebMCP registration suite:

```bash
pnpm exec vitest run src/webmcp/register.test.ts
```

## Enable and test WebMCP

ClearDose does not hide WebMCP behind an application setting. Native registration becomes available when the browser exposes the current imperative `document.modelContext.registerTool` API.

1. Start ClearDose and open `/webmcp` in a WebMCP-compatible browser or agent environment.
2. Check the Agent Lab status. `ready` means the page read the real registry with `document.modelContext.getTools` and found twelve tools. `degraded` lists missing tools instead of claiming readiness. `ready-unverified` means registration calls completed but the browser cannot list the exposed tools.
3. Run an example from a tool card or send one of the prompts below through the connected agent.
4. Watch the same search, comparison, selection, prescription, cart, and order state update in the interface.
5. Expand the floating WebMCP control. Inspect a journey's calls, redacted context, timing, and before and after state.
6. Review and confirm a safe journey replay. Checkout histories stay blocked.
7. Switch to "Market update" and run the exact-SKU comparison again.

When WebMCP is unavailable, the rest of the pharmacy demo still works. Agent Lab examples and replay use the same action layer as a deterministic fallback, but they do not claim that native browser tools were registered. In `ready-unverified`, a tool-card example also uses that fallback because native discovery and execution cannot be confirmed.

## Add a useful tool

Start with a user goal that the visible application already supports. Define the required state, one product action, the visible UI reaction, and a recovery path. Check the registry for overlap before adding anything. A tool should call the shared action layer, accept narrow raw fields, reject unknown fields, repeat validation at runtime, return only the next useful data, and declare its effects honestly. Keep it in the static registry unless its availability truly depends on page context. Add direct, ambiguous, ordering, journey, and failure coverage where the new action applies. The full checklist is in [docs/WEBMCP_STRATEGY.md](docs/WEBMCP_STRATEGY.md).

## Demo prompts

Find and compare:

```text
Find atorvastatin 20 mg tablets, quantity 90.
Compare all fulfillment options and tell me the
cheapest total arriving within five days.
```

Prepare a prescription request:

```text
Find atorvastatin 20 mg, quantity 90, choose the
lowest-cost option arriving within five days,
and prepare a prescription request card.
```

Prepare checkout:

```text
Add the selected medication to my cart,
use standard delivery, and show me what
is needed to complete demo checkout.
```

Recheck after a price change:

```text
Prices changed. Recompare my selected medication
and tell me whether my current fulfillment option
is still the cheapest delivered within five days.
```

Build a multi-item cart and compare savings:

```text
Add atorvastatin 20 mg and metformin 500 mg to my
demo cart, then compare each exact SKU with its
lowest current delivered total.
```

For a short presentation, open the Agent Lab, confirm the twelve-tool count, run the two-item savings journey, then expand the floating WebMCP control. Inspect its recorded calls and replay the reviewed journey. Finish by showing that checkout histories cannot be replayed from stored identity or address context.

## Netlify deployment

`netlify.toml` runs `pnpm build`, publishes `dist`, and rewrites all routes to `/index.html` so direct visits to Vue Router paths work.

Install and authenticate the Netlify CLI if needed:

```bash
npm install -g netlify-cli
netlify login
```

Link the project once, then deploy the tested build:

```bash
netlify init
pnpm build
netlify deploy --prod
```

After deployment, open `/`, `/medications`, `/compare`, `/prescription-card`, `/checkout`, and `/webmcp`. Refresh a nested route directly to confirm the SPA rewrite. The verified production site is [cleardose-webmcp-demo.netlify.app](https://cleardose-webmcp-demo.netlify.app).

## Safety and disclaimer

ClearDose is a fictional WebMCP technology demonstration. It does not provide medical advice, dispense medication, process prescriptions, or provide real pharmacy pricing.

- No diagnosis or dosing recommendations
- No drug interaction recommendations
- No automated clinical substitution
- No insurance claims
- No real prescription issuance or transmission
- No real patient data
- No real payment
- No claim of HIPAA compliance
- No claim that the seeded pharmacies are real
- No comparison across different medication SKUs

Use demo information only. A prescription request card is a summary for a licensed prescriber, not a prescription. Checkout creates a local simulated record and sends nothing.

## Future possibilities

A production version would need licensed data sources, authenticated users, consent controls, security review, audit records, and regulated integrations for pharmacies, prescribers, payments, and order status. Those changes should keep the current shared action rule so the human interface and browser tools cannot disagree about state or price calculations.

Clinical recommendations should remain outside this product unless a separate, validated medical system owns that responsibility.
