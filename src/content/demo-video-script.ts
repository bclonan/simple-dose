export interface DemoVideoSegment {
  time: string
  durationSeconds: number
  screenAction: string
  narration: string
  tools: string[]
  expectedResult: string
}

export const demoVideoDurationSeconds = 170

export const demoVideoSegments: DemoVideoSegment[] = [
  {
    time: '0:00 to 0:15',
    durationSeconds: 15,
    screenAction: 'Show the ClearDose medication comparison table. Keep both medicine headings and source labels visible.',
    narration: 'Medication information is hard to compare when every source opens another page. I built ClearDose to put those details together, with sources visible and a browser agent that works in the same workspace as the person.',
    tools: [],
    expectedResult: 'The comparison has medicine columns and fact rows. No tool runs during the introduction.',
  },
  {
    time: '0:15 to 0:35',
    durationSeconds: 20,
    screenAction: 'Open the WebMCP page, show the current registry and copy the Metformin and Jardiance comparison prompt. Return to Drug Explorer with the connected agent visible.',
    narration: 'Here is the goal: compare Metformin and Jardiance, show side effects and public pricing, then show only their FDA label interactions. The person can do this through the interface. The agent can discover declared tools and send structured arguments to the same application.',
    tools: [],
    expectedResult: 'The current tool definitions and the copied goal are visible. Copying a prompt does not execute it.',
  },
  {
    time: '0:35 to 1:45',
    durationSeconds: 70,
    screenAction: 'Record this workflow without cuts. Ask the agent to read the workspace, select Metformin and Jardiance, show side-effects and pricing with replace mode, then show interactions with replace mode. Pass the latest workspaceRevision between edits. Scroll to the price row before the final edit, then expand one FDA excerpt.',
    narration: 'First, the agent reads the current workspace. That gives it a revision to use for its next edit. It selects the two medicines by name, then asks for side effects and pricing. Watch the page change. These are the same selected medicines and fact rows that I can edit myself. Each medicine has its own column. The source excerpts stay separate, and I can expand the complete loaded text. Public prices are labeled acquisition cost benchmarks, not pharmacy cash prices or a patient copay. The exact package, quantity, source, and available dates travel with the quote. Now the agent replaces those rows with FDA labeled interactions. The selected medicines remain. These are individual label sections, not a pairwise interaction check or a recommendation to switch treatments. If a provider fails or a section is absent, ClearDose shows that limitation. Missing information never becomes a claim that a medicine is safe.',
    tools: ['cleardose_get_explorer_state', 'cleardose_select_drugs', 'cleardose_show_drug_fact', 'cleardose_show_drug_fact'],
    expectedResult: 'Two medicines appear side by side. Side effects and pricing appear first; the last edit leaves only FDA-labeled interactions. Source status remains visible, including any unavailable data.',
  },
  {
    time: '1:45 to 2:15',
    durationSeconds: 30,
    screenAction: 'Change the visible fact selector manually. Ask the agent to read the changed workspace and change that current card to warnings using its returned ID and revision. Expand the floating WebMCP log. Use the visible Download report button yourself.',
    narration: 'I can take over at any point. I change the topic here, and the agent reads that new state before making another edit. It uses the returned card identifier and revision, so an old instruction cannot silently overwrite newer work. The floating log shows the calls and their results. I can inspect the history, then download this comparison myself. The report keeps the sources and the limits attached.',
    tools: ['cleardose_get_explorer_state', 'cleardose_update_fact_card'],
    expectedResult: 'The human edit appears in the next state result. The agent updates that same row. A reviewed log and a human-requested download are visible.',
  },
  {
    time: '2:15 to 2:35',
    durationSeconds: 20,
    screenAction: 'Show the old-way versus WebMCP comparison on the hackathon page. Point to names, schemas, returned IDs and visible state. Do not present illustrative counts as measurements.',
    narration: 'A screen driven agent has to interpret controls and inspect the page again after changing them. WebMCP gives this workflow named actions, input rules, and structured results. The interface can change its layout without changing those tool contracts. This comparison describes the workflow, not a measured speed claim.',
    tools: [],
    expectedResult: 'The workflow contrast is visible with no invented timing or observation metrics.',
  },
  {
    time: '2:35 to 2:50',
    durationSeconds: 15,
    screenAction: 'Show the architecture path and the verified live-site and public-repository actions. Keep the submission readiness note visible.',
    narration: 'ClearDose uses Vue, Pinia, shared actions, local browser storage, and public data adapters, hosted on Netlify. The demo and repository are linked here. The result is a working reference workspace, with the person still in control.',
    tools: [],
    expectedResult: 'The architecture and actual project links are visible. Pending video or source publication is not marked complete.',
  },
]

export const demoVideoScriptText = demoVideoSegments.map(segment =>
  `${segment.time}\nScreen: ${segment.screenAction}\nNarration: ${segment.narration}\nTools: ${segment.tools.join(' → ') || 'None. Presentation or human interface action.'}\nExpected result: ${segment.expectedResult}`,
).join('\n\n')
