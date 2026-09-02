# ClearDose handoff

Production: [ClearDose](https://cleardose-webmcp-demo.netlify.app).

## Run and verify

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm verify
```

Individual checks are `pnpm typecheck`, `pnpm test`, `pnpm test:evals`, `pnpm build`, and `pnpm test:e2e`. The plugin also supports `pnpm exec tsc --noEmit -p cleardose-data-plugin/tsconfig.json`. After deploying, `node scripts/production-smoke.mjs` checks production routes, mobile width, assets, console errors, and nested-route refresh. No lint script is configured.

The [migration report](data-migration.md) records the final results, changed files, data boundaries, source gaps, and follow-up work. [WebMCP strategy](WEBMCP_STRATEGY.md) maps the implementation to all five supplied Chrome guides.

## Tools and routes

A populated catalog exposes 19 tools. Twelve retain static contracts:

`search_medications`, `get_medication_details`, `compare_fulfillment_options`, `select_medication_option`, `create_prescription_request_card`, `add_to_cart`, `view_cart`, `compare_cart_savings`, `remove_cart_item`, `set_delivery_option`, `checkout_demo_order`, `get_order_status`.

Two use current-catalog schemas:

`find_related_medications`, `compare_medications`.

Five additional tools share the visible Drug Explorer selection and cards: `cleardose_select_drugs`, `cleardose_show_drug_fact`, `cleardose_update_fact_card`, `cleardose_remove_fact_card`, and `cleardose_get_explorer_state`. See the [Explorer report](drug-explorer.md) for the fact registry, loading rules, URL state, safety boundaries, and current verification.

These two pass the connected browser agent the current medication IDs, names, page membership, mode, and revision. The app does not contain a separate LLM chat or model API. Comparison is informational, not a medication-substitution recommendation.

Main routes are `/`, `/medications`, `/medications/:slug`, `/drugs/explore`, `/compare`, `/prescription-card`, `/checkout`, `/orders/:id`, and `/webmcp`.

The preserved demo database is `src/data/cleardose-demo-db.json`. Static registration is in `src/webmcp/register.ts`; contracts are in `src/webmcp/definitions.ts`. Dynamic registration is in `src/webmcp/dynamic.ts`, with page context in `src/webmcp/medication-context.ts`. Public data enters through `src/plugins/cleardose.ts` and `src/services/medication.repository.ts`.

## Suggested 90-second demo

Before presenting, load the public details you intend to compare so provider latency does not dominate the demo. Use fictional recipient fields only.

1. **0 to 15 seconds.** Search Lipitor in hybrid mode. Show the public record, source labels, and the separate original demo medication.
2. **15 to 30 seconds.** Ask a connected WebMCP agent to inspect the current medication schema and compare loaded public records. Show ingredient/class fields and the no-substitution notice.
3. **30 to 50 seconds.** Open original Atorvastatin, choose an exact configuration, compare delivery totals, and add an option. Add original Metformin as a second independent cart line.
4. **50 to 65 seconds.** Review cart savings. Explain that these are fictional prices for the same exact SKUs, not savings from switching medicines.
5. **65 to 80 seconds.** Expand the floating WebMCP panel. Inspect inputs, bounded outputs, context, and a successful short journey. Review and confirm replay.
6. **80 to 90 seconds.** Show the prescription request or simulated checkout. Point out that checkout is excluded from replay and no prescription, payment, or pharmacy order is transmitted.

## Remaining boundaries

Public sources can be incomplete or unavailable. IndexedDB and labeled fallback keep previously loaded records usable, but browser storage is not a remote backup. Real retail prices, inventory, prescribing, and payments are not connected. Medicare remains disabled until a genuine index is provided. Scored live-model evaluations remain separate from the deterministic test suite.

The populated API-key sample was removed from `.env.example`. Rotate that credential if it was real. The deployed client does not need an API key.
