export interface DocumentedWorkflow {
  name: string
  goal: string
  steps: Array<{ tool: string; uses: string[]; outcome: string }>
  approval: string
  failure: string
  prompt: string
}

export const documentedWorkflows: DocumentedWorkflow[] = [
  {
    name: 'A side-by-side drug report',
    goal: 'Compare Metformin and Jardiance, then focus the report on FDA-labeled interactions.',
    steps: [
      { tool: 'cleardose_get_explorer_state', uses: [], outcome: 'Read the current workspaceRevision and selected drugs.' },
      { tool: 'cleardose_select_drugs', uses: ['steps.0.result.workspaceRevision', 'user-selected medication names'], outcome: 'Replace the visible drug selection with the two requested medications.' },
      { tool: 'cleardose_show_drug_fact', uses: ['steps.1.result.workspaceRevision', 'facts: side-effects, pricing'], outcome: 'Show aligned report rows with source status.' },
      { tool: 'cleardose_get_explorer_state', uses: [], outcome: 'Read the revision again after the report changes.' },
      { tool: 'cleardose_show_drug_fact', uses: ['steps.3.result.workspaceRevision', 'facts: [interactions]; mode: replace'], outcome: 'Replace the rows with FDA-labeled interaction information.' },
    ],
    approval: 'The user requests the report changes. Show what will be replaced before editing an existing report. No medication or dose recommendation, and no cart change.',
    failure: 'If identity resolution fails, ask for a precise name. If a source is unavailable, leave its status visible. On a stale revision, read current state before retrying the intended edit.',
    prompt: 'Compare Metformin and Jardiance in Drug Explorer. Show side effects and public pricing. Then only show their FDA-labeled interactions. Use the latest workspace revision, keep source notices visible, and do not change my cart.',
  },
  {
    name: 'Review an exact mock-shop option',
    goal: 'Find a specific form, strength and quantity, then compare delivered totals.',
    steps: [
      { tool: 'search_medications', uses: ['user-provided medication name'], outcome: 'Show matches and return current medication IDs.' },
      { tool: 'get_medication_details', uses: ['steps.0.result.results[].medicationId'], outcome: 'Read exact available shopConfigurations.' },
      { tool: 'compare_fulfillment_options', uses: ['steps.1.result.shopConfigurations[]', 'medicationId', 'user delivery limit'], outcome: 'Display fictional offers for the exact configuration.' },
      { tool: 'select_medication_option', uses: ['steps.2.result.options[].offerId', 'steps.2.result.options[].deliveryOptionId', 'user confirmation'], outcome: 'Save the chosen option visibly without adding to the cart.' },
    ],
    approval: 'The person chooses the configuration and confirms the offer. Do not infer dose or treat price as a reason to switch treatment.',
    failure: 'An unavailable configuration requires a new user choice. Return to the current detail or comparison result. Do not substitute a different strength.',
    prompt: 'Find atorvastatin. Read its available shop configurations and ask me to choose form, strength and quantity. Compare that exact configuration arriving within five days. Show fictional delivered totals and ask before selecting an offer.',
  },
  {
    name: 'Prepare a prescription request draft',
    goal: 'Create a local summary of an offer the person has reviewed.',
    steps: [
      { tool: 'search_medications', uses: ['user-provided medication name'], outcome: 'Resolve current catalog IDs.' },
      { tool: 'get_medication_details', uses: ['steps.0.result.results[].medicationId'], outcome: 'Read exact shop configurations.' },
      { tool: 'compare_fulfillment_options', uses: ['user-chosen configuration from steps.1'], outcome: 'Show available fictional offers.' },
      { tool: 'create_prescription_request_card', uses: ['user-approved offerId and deliveryOptionId from steps.2'], outcome: 'Open the local prescription request card.' },
    ],
    approval: 'Ask the person to confirm the exact offer before creating the draft. This is a local request summary, not a prescription and not sent to a provider.',
    failure: 'If the offer disappears, compare again and request approval for the new offer. Preserve any existing draft until the replacement succeeds.',
    prompt: 'Help prepare a local prescription request card for the medication and exact shop configuration I choose. Show the offer first, wait for my confirmation, then create the request card. Do not transmit anything or place an order.',
  },
  {
    name: 'Compare savings for two cart items',
    goal: 'Review two exact medications and inspect potential savings without auto-switching offers.',
    steps: [
      { tool: 'search_medications', uses: ['first medication name; repeat for second'], outcome: 'Resolve each medication ID.' },
      { tool: 'get_medication_details', uses: ['steps.0.result.results[].medicationId; repeat per medication'], outcome: 'Read valid shopConfigurations for each item.' },
      { tool: 'compare_fulfillment_options', uses: ['user-chosen exact configuration; repeat per medication'], outcome: 'Show each set of fictional offers.' },
      { tool: 'add_to_cart', uses: ['approved offerId and deliveryOptionId from steps.2; repeat for second item'], outcome: 'Add each approved item to the visible mock cart.' },
      { tool: 'view_cart', uses: [], outcome: 'Return current cart line IDs and totals.' },
      { tool: 'compare_cart_savings', uses: ['current cart state from steps.4'], outcome: 'Report item-level potential savings. Leave offers unchanged.' },
    ],
    approval: 'Confirm each exact item before adding. Savings compare the same shop configuration, not clinical substitutes. Checkout requires a separate request and review.',
    failure: 'If the second add fails, keep the first item and report the partial result. Read the cart before retrying so the successful add is not duplicated.',
    prompt: 'Help add atorvastatin and metformin to my demo cart. For each, ask me to choose a listed shop configuration and confirm the offer before adding. Then compare current item-level savings without replacing anything or checking out. If a step fails, tell me which item succeeded.',
  },
  {
    name: 'Fill checkout for human review',
    goal: 'Prepare a visible checkout form without creating an order, then let the person review and place it.',
    steps: [
      { tool: 'view_cart', uses: [], outcome: 'Read current items, fictional totals and checkout requirements.' },
      { tool: 'prepare_demo_checkout', uses: ['cart readiness from steps.0', 'recipient details and prescription status supplied by the person'], outcome: 'Fill the visible form and open /checkout. Stop here for human review. No order has been created.' },
      { tool: 'get_order_status', uses: ['only after the person reviews the form, uses Place demo order and sees confirmation'], outcome: 'Read the existing local order status without returning recipient details. Skip this step if the person has not placed an order.' },
    ],
    approval: 'Form preparation is not order approval. The person reviews the exact items, total, address and prescription status, then uses Place demo order. The agent does not place the order in this workflow.',
    failure: 'If cart readiness or recipient validation fails, explain what needs correction. Do not invent missing details or replace cart items. If no order exists after review, keep the form and cart unchanged.',
    prompt: 'Read my demo cart and ask for any missing checkout details. Use prepare_demo_checkout to fill the visible form with the details I provide. Stop for my review without placing an order. I will use Place demo order myself. Only after I see confirmation, read the existing order status.',
  },
  {
    name: 'Change delivery without losing the cart',
    goal: 'Inspect a cart line, change only its delivery, and check the new total.',
    steps: [
      { tool: 'view_cart', uses: [], outcome: 'Read current cartItemId values and available delivery choices.' },
      { tool: 'set_delivery_option', uses: ['steps.0.result.items[].cartItemId', 'available deliveryOptionId', 'user confirmation'], outcome: 'Update delivery for just the approved line.' },
      { tool: 'view_cart', uses: [], outcome: 'Show the changed line and delivered cart total.' },
      { tool: 'compare_cart_savings', uses: ['current cart state from steps.2'], outcome: 'Check potential savings without another edit.' },
    ],
    approval: 'Preview the delivery choice and price difference. Change only the item the person approves.',
    failure: 'On a missing item or unavailable delivery, read the cart again. Do not remove the item, add a replacement, or retry checkout.',
    prompt: 'Inspect my current demo cart. Show the available delivery choices for the item I select and ask before changing it. After I confirm, change only that delivery, show the new total and compare savings. Keep all other items unchanged.',
  },
]

export const featurePrompts = [
  { goal: 'Discover or search', level: 'Beginner', prompt: 'Search for Lipitor and show the matching generic names, source status and catalog IDs. Do not select anything.', support: 'search_medications' },
  { goal: 'Create', level: 'Intermediate', prompt: 'Prepare a local prescription request summary after I choose and confirm an exact mock-shop offer. Do not send it or check out.', support: 'create_prescription_request_card after a reviewed comparison' },
  { goal: 'Inspect', level: 'Beginner', prompt: 'Read my current Drug Explorer selection and fact rows. Tell me the workspace revision without changing the page.', support: 'cleardose_get_explorer_state' },
  { goal: 'Update', level: 'Intermediate', prompt: 'Read the current Explorer state. Change the side-effects row to warnings using its card ID and current revision. Leave the selected medications unchanged.', support: 'cleardose_get_explorer_state → cleardose_update_fact_card' },
  { goal: 'Transform', level: 'Showcase', prompt: 'Turn my current two-medication Explorer comparison into an interactions-only report. Read current state first and replace the visible facts with FDA-labeled interactions.', support: 'cleardose_get_explorer_state → cleardose_show_drug_fact' },
  { goal: 'Compare', level: 'Showcase', prompt: 'Compare my selected medications using available catalog facts and public source details. Distinguish shared ingredients from clinical interchangeability. Make no medication recommendation.', support: 'compare_medications with the current dynamic catalog revision' },
  { goal: 'Refresh', level: 'Intermediate', prompt: 'Read my current workspace again after my manual edits. Use its new revision for the next requested change. Tell me which source data is cached or unavailable.', support: 'cleardose_get_explorer_state; source refresh is a human interface action, not a dedicated tool' },
  { goal: 'Export or share', level: 'Beginner', prompt: 'Read my comparison and help me check that the report contains the facts I requested. Then point me to the visible Download report or Copy link action. Do not export on my behalf.', support: 'Read with cleardose_get_explorer_state. The person uses the report download or link controls; no export tool exists.' },
  { goal: 'Approve or confirm', level: 'Beginner', prompt: 'Show my demo cart and fictional total. Fill the checkout form with the recipient details I provide, then stop. I will review the form and use Place demo order myself.', support: 'view_cart → prepare_demo_checkout → visible human review and Place demo order. No separate approval tool exists. checkout_demo_order requires a deliberate, separately authorized call.' },
  { goal: 'Recover from failure', level: 'Intermediate', prompt: 'The previous report edit had a stale workspace revision. Read the current state, describe what changed, then ask whether to retry my intended edit. Do not repeat a cart or checkout action.', support: 'cleardose_get_explorer_state, followed only by the reviewed edit' },
] as const
