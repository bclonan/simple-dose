# Live deployment smoke test

Tested September 2, 2026. All 19 WebMCP tools executed successfully on the deployed release. Two browser-connection failures required recovery, so this is not an error-free reliability certification.

[Live site](https://cleardose-webmcp-demo.netlify.app) · [Exact tested release](https://6a986ef9448c0756fe7bacdc--cleardose-webmcp-demo.netlify.app) · [Screenshot gallery](index.html) · [Per-call report](report.md)

## What passed

- Locked install, typecheck and production build.
- 188 unit tests, 18 deterministic evaluations and 23 browser tests.
- Production checks across 8 desktop and 8 mobile routes, nested refresh, fresh public-drug links, and data-mode recovery.
- Native execution of every registered tool. The 31 captured examples include page state and a tool receipt, exact inputs, results and review notes.
- A two-medication cart, delivery recalculation, two-page savings comparison, item removal, simulated checkout and sanitized order status.
- Explicit review and replay of the one-call order-status journey. The UI explains why sequences longer than 12 calls cannot replay.

## Real data versus fictional fulfillment

Public search and Explorer checks used FDA, RxNorm, NADAC and FAERS. No provider responses were mocked during this live pass.

Lisinopril returned three NADAC quotes in public-only mode. The example NDC 68001048600 had a $0.04594 per-EA benchmark, displayed as $1.38 for 30. Its effective date was August 19, 2026. September 2 was the retrieval date. NADAC is not a pharmacy cash price, copay or patient savings.

RxNorm concept 617320 returned the public Lipitor 40 MG record. The FAERS card displayed 20 reactions, including FATIGUE at 14,252 reports. These are report counts, not incidence rates, proof of causation or comparative safety. The feed metadata reported July 30, 2026 as its last update.

All pharmacy offers, delivery charges, prescription cards, carts and orders are fictional. The two-item cart changed from $31.25 to $35.25 after express delivery. Savings were $4.45 against a $30.80 lowest exact-SKU total. Removing atorvastatin left metformin at $13.45. Demo order CD-2026-0001 sent no payment or prescription.

Related-medication candidates can include seeded metadata. Hybrid mode can include explicitly fictional prices. The report labels both cases.

## Reliability findings

1. Native calls reported stale registration after several public-data comparisons, even after refreshing discovery. Reloading the same workspace and reconnecting the tab restored execution.
2. Later, the browser reported a WebMCP configuration-limit error before a savings call. Resetting the browser connection, reloading the unchanged release and fetching tools restored execution. The persisted cart remained correct. The app had 19 tools and only 14 catalog IDs. A source review found no schema growth caused by that delivery change. The internal cause remains unresolved.
3. Screenshot automation hit a drawer timing issue after the second cart addition succeeded. I recovered its existing visible receipt instead of repeating the addition.

See [incident details](incidents.json). Fetch current tool handles after registration changes. After an uncertain mutation response, inspect its receipt and visible state before retrying.

## Coverage limits

Pricing and source pagination completed for the tested Lisinopril record. Identity, product and clinical pages were sampled, not exhaustively traversed. This pass does not certify every medication or every public record.

Medicare remains disabled. No real cash-price, inventory, insurance or dispensing service is connected. NADAC checks at most four package NDCs. FAERS results depend on identifier coverage; an empty result does not mean no reports exist. Missing clinical fields do not establish safety. FDA interaction text is not a personalized interaction checker.

The dynamic tool schemas grow with the loaded catalog. Large-catalog compatibility remains a separate test requirement.

## Evidence files

[Gallery](index.html) contains the screenshots, example inputs, outputs and redacted page context for each tool. [Receipts](receipts.json) preserve the source records. [Pagination](pagination.json) preserves the complete price/source continuation proof. [Replay](replay.json) records the extra UI journey check.

Early full-page screenshots have capture-stitching artifacts around fixed page elements. Use the clean viewport receipt images as primary evidence. Later page-state screenshots use viewport capture. None of the screenshots were cosmetically edited.

Tests used the immutable production-release hostname with separate browser-local storage. The main site's saved cart was untouched. No application source changed during this deployment and smoke-test pass.
