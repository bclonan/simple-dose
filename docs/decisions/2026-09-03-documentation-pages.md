# WebMCP documentation and hackathon pages

## Decision and boundaries

Accept the request as an in-place extension. `/webmcp` already contains the Agent Lab and canonical tool descriptors; consolidate there. Add only `/hackathon`. Keep Vue, Pinia, shared actions, existing routes, browser storage formats, native tool names/schemas, and the linked Netlify site.

The documentation projection consumes the existing static, dynamic, and Explorer factories. Editorial examples supplement definitions but never determine catalog membership. Schema-valid example IDs may still require current state. Never create that state merely to preview documentation.

## Occurrence map

| Area | Current implementation | Change |
| --- | --- | --- |
| Canonical tools | `src/webmcp/definitions.ts`, `dynamic.ts`, `explorer.ts` | Read-only documentation projection, no second registry |
| Registration | `src/App.vue` owns shell lifetime | Preserve lifecycle; test route transitions |
| Agent Lab | `src/views/WebMcpView.vue`, `ToolCard.vue` | Add documentation, workflows, inspector, safe previews |
| Example preparation | Hidden cart/order prerequisites in Agent Lab | Remove hidden side effects; consequential examples preview only |
| Branding | AppHeader mark and existing CSS tokens | Reuse for original static icons and social image |
| Metadata | Minimal `index.html` head | Add asset metadata and route-aware descriptions |
| Submission | Extensive README, no license/video/page | Extend README, add MIT license, honest pending video/source-release status |
| Hosting | Existing Netlify SPA and security headers | Same site/config; narrow YouTube frame permission and manifest MIME correction |

## Bounded tickets

1. DOC-1. Pure registry-to-documentation model and schema-example canary tests. Owner: registry agent.
2. DOC-2. Integrate catalog cards, inspector, goal-oriented prompts, interactive contrast, and five workflows into the existing Agent Lab. Owner: coordinator. Depends on DOC-1.
3. DOC-3. Hackathon page and a shared 2:50 recording script. Owner: submission agent. Uses the fixed project-link and copy-button contracts.
4. DOC-4. Existing-brand assets, metadata helper, license, README additions. Owner: asset agent. No router or package-lock changes.
5. DOC-5. Integration, full regressions, mobile/desktop browser tests, preview and production smoke checks. Owner: coordinator, independent test review after integration.

## Acceptance gates

Every canonical tool receives a card and a schema-valid example. Unknown tools receive a generated fallback rather than disappearing. Native availability remains separate from configured documentation count. Previewing an example cannot create a cart, order, prescription card, or provider request. Existing product workflows and registration tests must still pass.

Both routes must load directly, preserve native registrations across navigation, fit 320px screens, support keyboard navigation, and expose working copy feedback. YouTube placeholder and configured URL states must be tested. Icons must be actual valid files and resolve in the deployed build.

The public repository exists, but deploying a local build does not publish the new source to GitHub. Keep that checklist item pending until the release source is pushed. No Git push is included in this request.

## Verification and outcome

Implementation and deployment complete. The final `pnpm verify` passed type checks, 344 unit tests, 18 workflow evaluations, the production build and all 36 browser tests. Production deployment `6a98f10c72f61212af495d6a` serves the tested build on the existing site. Both routes and nine assets passed hosted checks; native browser reads, tool registration, safe previews, copy feedback, route navigation and mobile layout passed live checks.

Full evidence and changed-file inventory are in `docs/live-smoke/2026-09-03-documentation/report.md`. The report records an intermittent development-test loading stall and a mobile screenshot-service failure without claiming their exact causes are resolved. Neither appeared as a production app error; the final browser suite and production native calls passed.

The public YouTube video and publication of this source release to GitHub remain pending. The page keeps those submission items incomplete. The recording script is ready; no video upload or Git push was performed.
