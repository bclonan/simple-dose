# ClearDose demo video script

Planned runtime: 2:50, or 170 seconds. The narration is 381 words, approximately 134 words per minute. This script is not a published video. Configure the public recording URL in `src/content/project.ts` when it is ready.

`src/content/demo-video-script.ts` is the canonical script used by `/hackathon`. The script test checks that each narration paragraph below matches that content.

## Recording setup

- Open the verified ClearDose live site in a browser with native WebMCP support and a connected agent. Confirm the registry reports the available tools before recording.
- Use a separate demo session with no personal patient information. Public reference sources may be incomplete or unavailable; show their actual status rather than replacing missing facts.
- Keep the person-visible interface, agent calls and structured results readable. Do not hide provider delays or cut the primary workflow between 0:35 and 1:45.
- Read the current workspace revision before editing. Pass the latest returned revision to each subsequent edit. Refresh tool discovery if the dynamic catalog context changes.
- Record audible narration. After upload, verify anonymous YouTube access and a runtime below three minutes. A configured URL alone does not establish those requirements.

## 0:00 to 0:15

Screen action: Show the ClearDose medication comparison table. Keep both medicine headings and source labels visible.

Exact narration:

> Medication information is hard to compare when every source opens another page. I built ClearDose to put those details together, with sources visible and a browser agent that works in the same workspace as the person.

WebMCP tools: None. Presentation or human interface action.

Expected visible result: The comparison has medicine columns and fact rows. No tool runs during the introduction.

## 0:15 to 0:35

Screen action: Open the WebMCP page, show the current registry and copy the Metformin and Jardiance comparison prompt. Return to Drug Explorer with the connected agent visible.

Exact narration:

> Here is the goal: compare Metformin and Jardiance, show side effects and public pricing, then show only their FDA label interactions. The person can do this through the interface. The agent can discover declared tools and send structured arguments to the same application.

WebMCP tools: None. Presentation or human interface action.

Expected visible result: The current tool definitions and the copied goal are visible. Copying a prompt does not execute it.

## 0:35 to 1:45

Screen action: Record this workflow without cuts. Ask the agent to read the workspace, select Metformin and Jardiance, show side-effects and pricing with replace mode, then show interactions with replace mode. Pass the latest workspaceRevision between edits. Scroll to the price row before the final edit, then expand one FDA excerpt.

Exact narration:

> First, the agent reads the current workspace. That gives it a revision to use for its next edit. It selects the two medicines by name, then asks for side effects and pricing. Watch the page change. These are the same selected medicines and fact rows that I can edit myself. Each medicine has its own column. The source excerpts stay separate, and I can expand the complete loaded text. Public prices are labeled acquisition cost benchmarks, not pharmacy cash prices or a patient copay. The exact package, quantity, source, and available dates travel with the quote. Now the agent replaces those rows with FDA labeled interactions. The selected medicines remain. These are individual label sections, not a pairwise interaction check or a recommendation to switch treatments. If a provider fails or a section is absent, ClearDose shows that limitation. Missing information never becomes a claim that a medicine is safe.

WebMCP tools, in order:

1. `cleardose_get_explorer_state`
2. `cleardose_select_drugs`
3. `cleardose_show_drug_fact`
4. `cleardose_show_drug_fact`

Expected visible result: Two medicines appear side by side. Side effects and pricing appear first; the last edit leaves only FDA-labeled interactions. Source status remains visible, including any unavailable data.

## 1:45 to 2:15

Screen action: Change the visible fact selector manually. Ask the agent to read the changed workspace and change that current card to warnings using its returned ID and revision. Expand the floating WebMCP log. Use the visible Download report button yourself.

Exact narration:

> I can take over at any point. I change the topic here, and the agent reads that new state before making another edit. It uses the returned card identifier and revision, so an old instruction cannot silently overwrite newer work. The floating log shows the calls and their results. I can inspect the history, then download this comparison myself. The report keeps the sources and the limits attached.

WebMCP tools, in order:

1. `cleardose_get_explorer_state`
2. `cleardose_update_fact_card`

Expected visible result: The human edit appears in the next state result. The agent updates that same row. A reviewed log and a human-requested download are visible.

## 2:15 to 2:35

Screen action: Show the old-way versus WebMCP comparison on the hackathon page. Point to names, schemas, returned IDs and visible state. Do not present illustrative counts as measurements.

Exact narration:

> A screen driven agent has to interpret controls and inspect the page again after changing them. WebMCP gives this workflow named actions, input rules, and structured results. The interface can change its layout without changing those tool contracts. This comparison describes the workflow, not a measured speed claim.

WebMCP tools: None. Presentation or human interface action.

Expected visible result: The workflow contrast is visible with no invented timing or observation metrics.

## 2:35 to 2:50

Screen action: Show the architecture path and the verified live-site and public-repository actions. Keep the submission readiness note visible.

Exact narration:

> ClearDose uses Vue, Pinia, shared actions, local browser storage, and public data adapters, hosted on Netlify. The demo and repository are linked here. The result is a working reference workspace, with the person still in control.

WebMCP tools: None. Presentation or human interface action.

Expected visible result: The architecture and actual project links are visible. Pending video or source publication is not marked complete.
