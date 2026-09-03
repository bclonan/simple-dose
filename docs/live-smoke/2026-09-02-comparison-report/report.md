# Side-by-side comparison report release

Date: September 2, 2026, America/New_York. Some source retrieval timestamps fall on September 3 in UTC.

## What changed

Drug Explorer now shows one semantic comparison table. Medications stay in columns and selected facts stay in rows. The builder can prepare uses, side effects, warnings, FDA-labeled interactions, and public pricing together. Individual topics remain editable through the existing UI and WebMCP tools.

Rows highlight different loaded source details. This comparison includes source metadata, not a clinical judgment about safety, effectiveness, or interchangeability. Missing and failed data remain explicit. The table scrolls horizontally on small screens without widening the document.

Each cell starts with a bounded source excerpt and offers the full loaded text. Prices retain their type, quantity, package NDC, effective date, and source. The compact price view shows the first source record, not an inferred lowest price. NADAC remains an acquisition benchmark, not a patient price or purchasable offer.

Download report creates a dated standalone HTML snapshot with complete loaded text and all quotes inside expandable details. Text is escaped, source links allow only credential-free HTTPS, and the file has no scripts or remote assets. Printing requires the visible button and uses a landscape table with repeated medication headings. Printed excerpts state that additional source text or records may be omitted.

## Verification

- Typecheck and production build passed.
- 301 unit tests passed across 31 files.
- 18 evaluation tests passed across 3 files.
- All 31 browser tests passed against the final frozen source. The runner exited normally without manual cleanup.
- Browser tests cover the five-topic builder, stable row identities, data recovery, four medication columns, keyboard scrolling, widths of 1440, 900, 390, and 320 pixels, safe HTML downloads, and the explicit print action.
- Native WebMCP selected report topics and replaced them with interactions only. `native-calls.json` preserves inputs, outputs, URLs, timestamps, availability, and revision tokens.
- Live public-data PDF checks loaded four of four facts for two topics and ten of ten facts for the five-topic report. Every rendered PDF page was visually inspected. The two-topic report prints on two pages and the full report on five. Printing the downloaded two-topic HTML also takes two pages.
- Whitespace checks passed. Existing unrelated data/provider implementation was not changed for this UI release.

## Failures observed and recovery

The initial browser-test setup completed assertions but hung while shutting down its Windows shell-owned Vite process. The test setup now owns Vite in-process and closes that exact instance. Repeated full-suite runs exited normally and released port 4179.

The final preview initially returned three of four requested facts. Metformin's FDA label carried an `openfda-label` network failure. The table marked that row as incomplete and preserved the available Jardiance label and both public pricing cells. One visible Retry action restored four of four facts, with the same selected IDs, row IDs, and workspace revision. The underlying upstream network failure was not identified more specifically, and this release does not claim to eliminate public-provider outages.

The local development server stopped during an environment interruption. Restarting the same local server restored access. A transient early screenshot captured an incomplete paint; `02-local-side-by-side.png` is not acceptance evidence.

## Deployment

The Netlify workflow used a preview before production. Final preview: `6a98ddde48c3f319b33c54e9`. Production deploy: `6a98de6442554209c858a8fb`.

[Live comparison](https://cleardose-webmcp-demo.netlify.app/drugs/explore?drugs=public-metformin-hydrochloride,public-empagliflozin&facts=side-effects,pricing)

[Immutable production build](https://6a98de6442554209c858a8fb--cleardose-webmcp-demo.netlify.app/drugs/explore?drugs=public-metformin-hydrochloride,public-empagliflozin&facts=side-effects,pricing)

Production assets: `index-DH0e8Qye.js`, `DrugExplorerView-D9w7NfDn.js`, and `DrugExplorerView-BHuk7IYI.css`.

Production smoke test confirmed the released `index-DH0e8Qye.js` script in the browser. WebMCP reported four of four available facts for side effects and pricing, two of two after replacing the report with interactions only, and ten of ten after generating all five report topics. Both medication headers and populated FDA text appeared in the same table. The complete five-topic report was left open for the user.

## Evidence files

- `03-local-webmcp-interactions.png`: desktop side-by-side interactions.
- `04-local-report-builder.png`: five-topic report controls and column headers.
- `05-preview-interactions.png`: narrow browser view with contained horizontal scrolling.
- `06-print-side-effects.png` and `07-print-public-pricing.png`: both pages of the printed table.
- `08-download-print-page-1.png` and `09-download-print-page-2.png`: printed standalone download.
- `10-production-webmcp-interactions.png`: production browser screenshot showing both populated medication columns after the native WebMCP edit.
- `print-two-topics.pdf`, `print-five-topics.pdf`, `print-downloaded-report.pdf`, and `downloaded-report.html`: local public-source print/download samples.
- `native-calls.json`: local and hosted WebMCP calls. Any source values here are dated test observations, not current price promises or medical advice.

The test browser used only the public Metformin and Jardiance examples. This report work did not place an order or change the user's Chrome cart.
