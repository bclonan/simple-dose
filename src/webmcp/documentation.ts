import { clearDoseToolNames } from './definitions'
import { dynamicMedicationToolNames } from './dynamic'
import { explorerOutputBudget, explorerToolNames } from './explorer'
import { nativeToolDefinition } from './schema-budget'
import type { ClearDoseToolDescriptor, JsonSchema, JsonValue } from './types'

export interface ToolDocumentation extends ClearDoseToolDescriptor {
  classification: 'read-only' | 'mutating' | 'destructive' | 'approval-required'
  safeToRun: boolean
  sourceModule: string
  stateAffected: string[]
  errors: Array<{ condition: string; recovery: string }>
  prompt: string
  exampleResult: JsonValue
  validationErrors: string[]
  nativeSchema: JsonSchema
  schemaNotes: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

const validDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

/** Documentation checks only. Runtime handlers still own validation and state guards. */
export const validateDocumentationExample = (input: unknown, schema: JsonSchema): string[] => {
  const validate = (value: unknown, rule: JsonSchema, path: string): string[] => {
    const errors: string[] = []
    if ('const' in rule && value !== rule.const) errors.push(`${path} must equal the declared const value.`)
    if (rule.enum && !rule.enum.some(candidate => candidate === value)) errors.push(`${path} must use a declared enum value.`)
    if (rule.oneOf) {
      const matches = rule.oneOf.filter(branch => validate(value, branch, path).length === 0).length
      if (matches !== 1) errors.push(`${path} must match exactly one oneOf branch.`)
    }

    switch (rule.type) {
      case 'object': {
        if (!isRecord(value)) return [...errors, `${path} must be an object.`]
        const properties = rule.properties ?? {}
        for (const key of rule.required ?? []) {
          if (!Object.prototype.hasOwnProperty.call(value, key)) errors.push(`${path}.${key} is required.`)
        }
        for (const [key, child] of Object.entries(value)) {
          if (Object.prototype.hasOwnProperty.call(properties, key)) {
            errors.push(...validate(child, properties[key]!, `${path}.${key}`))
          } else if (rule.additionalProperties === false) errors.push(`${path}.${key} is not an allowed property.`)
        }
        break
      }
      case 'array': {
        if (!Array.isArray(value)) return [...errors, `${path} must be an array.`]
        if (rule.minItems !== undefined && value.length < rule.minItems) errors.push(`${path} needs at least ${rule.minItems} items.`)
        if (rule.maxItems !== undefined && value.length > rule.maxItems) errors.push(`${path} allows at most ${rule.maxItems} items.`)
        if (rule.items) value.forEach((item, index) => errors.push(...validate(item, rule.items!, `${path}[${index}]`)))
        break
      }
      case 'string': {
        if (typeof value !== 'string') return [...errors, `${path} must be a string.`]
        const length = [...value].length
        if (rule.minLength !== undefined && length < rule.minLength) errors.push(`${path} needs at least ${rule.minLength} characters.`)
        if (rule.maxLength !== undefined && length > rule.maxLength) errors.push(`${path} allows at most ${rule.maxLength} characters.`)
        if (rule.pattern) {
          try {
            if (!new RegExp(rule.pattern, 'u').test(value)) errors.push(`${path} does not match its declared pattern.`)
          } catch { errors.push(`${path} has an invalid schema pattern.`) }
        }
        if (rule.format === 'date' && !validDate(value)) errors.push(`${path} must be a valid YYYY-MM-DD date.`)
        break
      }
      case 'number':
      case 'integer': {
        if (typeof value !== 'number' || !Number.isFinite(value)) return [...errors, `${path} must be a finite ${rule.type}.`]
        if (rule.type === 'integer' && !Number.isInteger(value)) errors.push(`${path} must be an integer.`)
        if (rule.minimum !== undefined && value < rule.minimum) errors.push(`${path} must be at least ${rule.minimum}.`)
        if (rule.maximum !== undefined && value > rule.maximum) errors.push(`${path} must be at most ${rule.maximum}.`)
        break
      }
      case 'boolean':
        if (typeof value !== 'boolean') errors.push(`${path} must be a boolean.`)
        break
      default:
        errors.push(`${path} has an unsupported schema type.`)
    }
    return errors
  }
  return validate(input, schema, 'arguments')
}

interface EditorialDetails {
  prompt?: string
  stateAffected?: string[]
  errors?: ToolDocumentation['errors']
  exampleResult?: JsonValue
  approvalRequired?: boolean
}

const unavailableId = { condition: 'The medication, offer or cart item is no longer available.', recovery: 'Read the current IDs with search_medications, compare_fulfillment_options or view_cart. Review the replacement before another write.' }
const providerFailure = { condition: 'A public provider fails or a requested field is absent.', recovery: 'Keep the returned source status and notices. Retry the read later or inspect the source link. Missing data is not a safety finding.' }
const staleWorkspace = { condition: 'The workspace revision or card ID changed.', recovery: 'Call cleardose_get_explorer_state again. Use its current revision and card IDs, and review the intended edit.' }
const examplePriceNotice = 'All pharmacy prices and fulfillment options are fictional demo offers, not public benchmarks.'

// Editorial examples supplement the supplied definitions. They do not decide which tools exist.
const editorial: Record<string, EditorialDetails> = {
  search_medications: {
    prompt: 'Find atorvastatin in the loaded catalog and public sources. Return current medication IDs and source status. Do not select or add anything to my cart.',
    stateAffected: ['Visible medication search results and filters', 'Loaded public catalog and cached identities', 'Navigates to /medications'],
    errors: [providerFailure],
    exampleResult: { query: 'atorvastatin', count: 0, offset: 0, returned: 0, results: [], route: '/medications', truncated: false, nextOffset: null, nextAction: 'Try search_medications again with a broader generic name, brand, category, form, or strength.' },
  },
  get_medication_details: {
    prompt: 'Read the selected medication details and exact shopConfigurations. Distinguish fictional shop configurations from public medical facts and prices.',
    stateAffected: ['Loads or refreshes public medication data and its cache', 'Does not choose a configuration or edit the cart'],
    errors: [unavailableId, providerFailure],
    exampleResult: { medicationId: 'med-atorvastatin', genericName: 'Atorvastatin', availableSkuCount: 1, dataStatus: 'unavailable', shopConfigurations: [{ form: 'tablet', strength: '20 mg', quantity: 90, unit: 'tablets' }], shopConfigurationCount: 1, offset: 0, returned: 1, nextOffset: null, truncated: false, pricingNotice: 'Shop prices and quantities are fictional demo offers, not API prices or dosing advice.' },
  },
  compare_fulfillment_options: {
    prompt: 'Using an exact shopConfigurations entry I chose, compare fictional fulfillment totals arriving within five days. Show the options before changing my cart.',
    stateAffected: ['Exact medication configuration and comparison options', 'Current selection and visible /compare page'],
    errors: [{ condition: 'Only some exact SKU fields were supplied.', recovery: 'Supply medicationId, form, strength and quantity together from get_medication_details, or omit all four to reuse the current selection.' }, unavailableId],
    exampleResult: { medication: { id: 'med-atorvastatin', genericName: 'Atorvastatin', activeIngredient: 'Atorvastatin', form: 'tablet', strength: '20 mg', quantity: 90 }, totalOptions: 1, offset: 0, returned: 1, truncated: false, nextOffset: null, options: [{ offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard', pharmacy: 'ClearDose', medicationSubtotal: 10, deliveryMethod: 'Standard', deliveryPrice: 2, estimatedDays: [3, 5], total: 12, labels: [] }], lowestTotalOptionId: 'offer-atorvastatin-20-90-cleardose:standard', fastestOptionId: 'offer-atorvastatin-20-90-cleardose:standard', selectedOptionId: null, selectedOptionIsLowest: false, pricingScenario: 'Illustrative demo fixture', pricingNotice: examplePriceNotice, route: '/compare', nextAction: 'Review the options before selecting one.' },
  },
  select_medication_option: {
    prompt: 'Preview the offer and delivery I chose from the comparison. Ask me to confirm before changing my selected fulfillment option.',
    approvalRequired: true,
    stateAffected: ['Current offer and delivery selection', 'Navigates to /compare', 'Does not edit cart items'],
    errors: [unavailableId],
    exampleResult: { selectedOption: { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard', total: 12 }, total: 12, route: '/compare' },
  },
  create_prescription_request_card: {
    prompt: 'Preview a local prescription request card for my chosen exact offer and delivery. Ask for confirmation before creating it. Do not transmit a prescription.',
    approvalRequired: true,
    stateAffected: ['Selected fulfillment option', 'Persisted local prescription request card', 'Navigates to /prescription-card'],
    errors: [unavailableId],
    exampleResult: { requestId: 'request-example', medicationSummary: 'Atorvastatin 20 mg tablet, quantity 90', preferredFulfillment: 'ClearDose', estimatedTotal: 12, route: '/prescription-card', notice: 'This is a prescription request summary, not a prescription.' },
  },
  add_to_cart: {
    prompt: 'Preview the exact offer and delivery I chose, then ask before adding it to my demo cart. Do not check out.',
    approvalRequired: true,
    stateAffected: ['Current selection', 'Persisted local cart items and totals', 'Opens the cart drawer'],
    errors: [unavailableId],
    exampleResult: { cartItem: { id: 'cart-example', offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }, cartItemId: 'cart-example', outcome: 'added', message: 'Added to your demo cart.', cartCount: 1, subtotal: 10, delivery: 2, total: 12, selectedOptionTotal: 12 },
  },
  view_cart: {
    prompt: 'Open my demo cart and read its current items, totals and checkout requirements. Do not add, remove or change anything.',
    stateAffected: ['Opens the cart drawer', 'Reads existing cart items and totals without editing them'],
    exampleResult: { itemCount: 0, resolvedItemCount: 0, offset: 0, returned: 0, truncated: false, nextOffset: null, items: [], subtotal: 0, deliveryTotal: 0, grandTotal: 0, totalsComplete: true, readyForCheckout: false, checkoutIssues: [], checkoutIssueCount: 0, hasMoreIssues: false, checkoutRoute: '/checkout', checkoutRequirements: { requiredFields: ['fullName', 'address.line1', 'address.city', 'address.state', 'address.postalCode', 'prescriptionStatus'], prescriptionStatusValues: ['provider-will-send', 'request-prepared'], hasPreparedRequest: false }, nextAction: 'Call add_to_cart with an offerId and deliveryOptionId from compare_fulfillment_options.' },
  },
  compare_cart_savings: {
    prompt: 'Compare every existing demo cart line with the lowest current delivered price for its exact SKU. Report fictional savings without editing the cart or substituting medications.',
    stateAffected: ['Reads existing cart, exact SKUs and current demo pricing', 'Does not replace offers or edit cart items'],
    errors: [{ condition: 'The cart is empty.', recovery: 'Let the user choose and add an item first. Do not add an item just to run this example.' }, unavailableId],
    exampleResult: { itemCount: 1, offset: 0, returned: 1, truncated: false, nextOffset: null, items: [{ cartItemId: 'cart-example', medication: 'Atorvastatin', sku: { form: 'tablet', strength: '20 mg', quantity: 90 }, currentTotal: 12, bestAvailableTotal: 12, potentialSavings: 0, comparisonAvailable: true, isLowestAvailable: true, recommendedAction: { type: 'none' }, current: { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard', pharmacy: 'ClearDose' }, replacement: { offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard', pharmacy: 'ClearDose', estimatedDays: [3, 5] } }], currentTotal: 12, optimizedTotal: 12, potentialSavings: 0, itemsWithSavings: 0, pricingScenario: 'Illustrative demo fixture', effectiveAt: '2026-09-02', basis: 'Current demo offers for exact medication SKUs, not retail or insurance savings.', nextAction: 'Each cart item already uses its lowest-total current demo option.' },
  },
  remove_cart_item: {
    prompt: 'Show the cart item identified by view_cart and ask me to confirm its removal. Leave the other cart items unchanged.',
    stateAffected: ['Removes one persisted local cart item', 'Recalculates cart totals and opens the drawer'],
    errors: [unavailableId],
    exampleResult: { removedCartItemId: 'cart-example', cartCount: 0, subtotal: 0, deliveryTotal: 0, grandTotal: 0, nextAction: 'The cart is empty. Call compare_fulfillment_options before adding another item.' },
  },
  set_delivery_option: {
    prompt: 'Preview an available delivery option for the cart item I chose. Show the new fictional total and ask before applying it.',
    approvalRequired: true,
    stateAffected: ['One persisted cart line delivery option', 'Cart totals and visible cart drawer'],
    errors: [unavailableId],
    exampleResult: { cartItemId: 'cart-example', deliveryOptionId: 'express', delivery: 'Express', itemTotal: 15, grandTotal: 15 },
  },
  prepare_demo_checkout: {
    prompt: 'Read my cart and its checkout requirements. Fill the visible checkout form with the demo recipient details I provide, then stop for my review. Do not invent missing details or place an order. I will use Place demo order after reviewing the form.',
    stateAffected: ['Fills the shared checkout form for this browser session', 'Navigates to /checkout for visible review', 'Does not create an order, clear the cart or persist recipient fields'],
    errors: [{ condition: 'The cart is empty or a prepared request does not cover its prescription items.', recovery: 'Read view_cart and resolve its checkout requirements with the user. Do not manufacture cart items or a prescription request.' }, { condition: 'Recipient details are missing or invalid.', recovery: 'Ask the person for the missing details. Do not invent a recipient, address or prescription status.' }],
    exampleResult: { route: '/checkout', itemCount: 1, total: 12, prepared: true, orderCreated: false, filledFields: ['fullName', 'address', 'prescriptionStatus'], nextAction: 'Review the visible form and fictional total. Use Place demo order only after checking the details. No order has been created.' },
  },
  checkout_demo_order: {
    prompt: 'Use prepare_demo_checkout to fill the visible form with my supplied details and stop for review. I can use Place demo order myself. Call checkout_demo_order only if I separately and explicitly authorize you to create the local simulated order. Never transmit payment or a prescription.',
    approvalRequired: true,
    stateAffected: ['Creates and persists a local simulated order', 'Clears the local demo cart after order creation', 'Navigates to the order confirmation'],
    errors: [{ condition: 'The cart is empty or a prepared request does not cover its prescription items.', recovery: 'Read the cart and checkout requirements. Resolve them with the user before checkout. Never manufacture cart items or a prescription request.' }, { condition: 'Checkout returned an uncertain result.', recovery: 'Read get_order_status and inspect the local cart before retrying. Never automatically retry a consequential call.' }],
    exampleResult: { orderId: 'CD-2026-0001', route: '/orders/CD-2026-0001', total: 12, status: 'demo-order-created', notice: 'Demo order only. No payment or prescription was transmitted.' },
  },
  get_order_status: {
    prompt: 'Read my existing local demo order status without exposing recipient details. If no order exists, tell me without creating one.',
    stateAffected: ['Reads an existing local order', 'Navigates to that order confirmation', 'Never creates an order'],
    errors: [{ condition: 'No current order exists or the supplied order ID is unknown.', recovery: 'Explain that there is no matching local order. Do not create one to make this example succeed.' }],
    exampleResult: { orderId: 'CD-2026-0001', createdAt: '2026-09-02T12:00:00Z', status: 'demo-order-created', prescriptionStatus: 'provider-will-send', total: 12, itemCount: 1, itemOffset: 0, returned: 1, truncated: false, nextItemOffset: null, items: [{ medication: 'Atorvastatin', form: 'tablet', strength: '20 mg', quantity: 90, offerId: 'offer-atorvastatin-20-90-cleardose', deliveryOptionId: 'standard' }], notice: 'Local demo status only. No pharmacy or prescriber system was contacted.' },
  },
  find_related_medications: {
    prompt: 'Find records related to a medication in the current catalog. Explain the shared catalog field and make no claim that these medications are interchangeable.',
    stateAffected: ['Reads current catalog or visible-page medication records', 'Does not change prescriptions, selection or cart'],
  },
  compare_medications: {
    prompt: 'Compare public facts for my selected medications using the current context revision. Follow every nextOffset and retain source warnings. Do not recommend treatment changes.',
    stateAffected: ['Loads or refreshes public medication facts and caches', 'Does not change prescriptions or cart items'],
  },
  cleardose_select_drugs: {
    prompt: 'Preview selecting Metformin and Jardiance in Drug Explorer. Read the current workspace first, then ask before replacing an existing selection.',
    stateAffected: ['Persisted Drug Explorer medication selection', 'Fact rows follow the shared selection', 'Reveals /drugs/explore'],
  },
  cleardose_show_drug_fact: {
    prompt: 'Show side effects and public pricing for Metformin and Jardiance in Drug Explorer. Read the current workspace revision and preview replacing existing topics. Keep unavailable facts visible.',
    stateAffected: ['Persisted Explorer fact rows', 'Optional replacement drug selection', 'Reveals the shared comparison report'],
  },
  cleardose_update_fact_card: {
    prompt: 'Read my current Drug Explorer cards, then preview changing one chosen card to FDA-labeled interactions. Keep the medication selection unchanged.',
    stateAffected: ['One persisted Explorer fact row type', 'Keeps current drug selection', 'Reveals /drugs/explore'],
  },
  cleardose_remove_fact_card: {
    prompt: 'Read the current Drug Explorer card IDs. Show which fact row would be removed and ask me before removing it. Keep all selected medications.',
    stateAffected: ['Removes one persisted Explorer fact row', 'Keeps selected medications and source records'],
  },
  cleardose_get_explorer_state: {
    prompt: 'Read the current Drug Explorer selection, fact cards and data availability without changing anything. Follow nextOffset with both returned revision tokens.',
    stateAffected: ['Reads workspace selection, cards, catalog IDs and source availability', 'Does not navigate or edit the workspace'],
    errors: [{ condition: 'A later page uses missing or stale revision tokens.', recovery: 'Restart at offset zero, then pass both workspaceRevision and stateRevision with every nextOffset.' }],
    exampleResult: { workspaceRevision: 'workspace-example-1', stateRevision: 'explorer-state-example-1', section: 'workspace', offset: 0, returned: 0, total: 0, nextOffset: null, rows: [], format: 'Drug Explorer state rows. Follow nextOffset with both revision values to read the rest.', selectedDrugCount: 0, cardCount: 0, data: { availability: 'not-requested', requested: 0, available: 0, partial: 0, providerFailed: 0, unavailable: 0, loading: 0, warningCount: 0 }, workspacePath: '/drugs/explore', notice: 'Public reference facts are not personal medical advice. Label interactions are not a pairwise interaction check. NADAC is not a pharmacy cash price.' },
  },
}

const isDynamic = (name: string): boolean => dynamicMedicationToolNames.some(candidate => candidate === name)
const isExplorer = (name: string): boolean => explorerToolNames.some(candidate => candidate === name)

const sourceModule = (name: string): string => clearDoseToolNames.includes(name)
  ? 'src/webmcp/definitions.ts' : isDynamic(name) ? 'src/webmcp/dynamic.ts'
    : isExplorer(name) ? 'src/webmcp/explorer.ts' : 'Application-provided canonical tool descriptor'

const explorerMutationExample = (tool: ClearDoseToolDescriptor): JsonValue => {
  const input = tool.exampleInput
  // These are fixture outcomes, not predictions about the current workspace.
  // Name resolution and pre-existing selection cannot be inferred from a schema.
  const selectedDrugIds = Array.isArray(input.drugs)
    ? input.drugs.map((drug, index) => typeof drug === 'string' && drug.startsWith('med-') ? drug : `med-example-resolved-${index + 1}`)
    : ['med-example-existing-selection']
  const factTypes = tool.name === 'cleardose_show_drug_fact' && Array.isArray(input.facts)
    ? input.facts.filter((fact): fact is string => typeof fact === 'string')
    : tool.name === 'cleardose_update_fact_card' && typeof input.factType === 'string' ? [input.factType] : []
  const rows = factTypes.flatMap((factType, index) => selectedDrugIds.map(drugId => ({
    kind: 'fact-data', id: typeof input.cardId === 'string' ? input.cardId : `fact-example-${index + 1}`,
    drugId, factType, availability: 'not-loaded', source: 'not-loaded', warningCount: 0, warnings: [],
  })))
  const output = {
    status: 'updated', workspaceRevision: 'workspace-example-next', selectedDrugIds,
    cardCount: factTypes.length, workspacePath: '/drugs/explore',
    data: { availability: rows.length ? 'unavailable' : 'not-requested', requested: rows.length, available: 0, partial: 0, providerFailed: 0, unavailable: rows.length, loading: 0, warningCount: 0 },
    factResults: rows.slice(0, 4), factResultsTotal: rows.length, factResultsTruncated: rows.length > 4,
    nextAction: 'Use this workspaceRevision for edits. Read cleardose_get_explorer_state section cards for all fact-data rows.',
    notice: 'Public reference facts are not personal medical advice. Label interactions are not a pairwise interaction check. NADAC is not a pharmacy cash price.',
  }
  while (output.factResults.length && JSON.stringify(output).length > explorerOutputBudget) {
    output.factResults.pop()
    output.factResultsTruncated = true
  }
  return output
}

const exampleResult = (tool: ClearDoseToolDescriptor): JsonValue => {
  if (editorial[tool.name]?.exampleResult !== undefined) return editorial[tool.name]!.exampleResult!
  if (isDynamic(tool.name)) {
    const related = tool.name === 'find_related_medications'
    const id = Array.isArray(tool.exampleInput.medicationIds) ? tool.exampleInput.medicationIds[0] ?? 'med-example' : 'med-example'
    const rows = related ? [{ path: '/matches', value: [] }] : [{ path: '/drugs/0/medicationId', value: id }, { path: '/drugs/0/dataAvailability', value: 'source-unavailable' }]
    return { contextRevision: tool.exampleInput.contextRevision ?? 'catalog-example', scope: tool.exampleInput.scope ?? 'catalog', dataMode: 'hybrid', section: related ? 'matches' : tool.exampleInput.section ?? 'identity', route: '/webmcp', offset: 0, returned: rows.length, totalRows: rows.length + 1, nextOffset: rows.length, format: 'JSON Pointer field rows. Join string parts in order. Follow nextOffset for all fields.', notice: 'Catalog similarity is not therapeutic interchangeability, dosing equivalence, or personal medical advice. A clinician must assess medication changes.', rows }
  }
  if (isExplorer(tool.name)) return explorerMutationExample(tool)
  return { documentationOnly: true, message: 'No verified result example has been documented for this tool. Review its implementation before running it.' }
}

export const createToolDocumentation = (tools: readonly ClearDoseToolDescriptor[]): ToolDocumentation[] => tools.map(tool => {
  const details = editorial[tool.name]
  const validationErrors = validateDocumentationExample(tool.exampleInput, tool.inputSchema)
  const classification: ToolDocumentation['classification'] = details?.approvalRequired ? 'approval-required'
    : tool.annotations.readOnlyHint ? 'read-only' : tool.annotations.destructiveHint ? 'destructive' : 'mutating'
  return {
    ...tool,
    classification,
    safeToRun: ['cleardose_get_explorer_state', 'view_cart'].includes(tool.name) && tool.annotations.readOnlyHint && !tool.annotations.destructiveHint && validationErrors.length === 0,
    sourceModule: sourceModule(tool.name),
    stateAffected: details?.stateAffected ?? ['State effects are not yet documented. Review the canonical implementation before running this tool.'],
    errors: [...(details?.errors ?? []), ...(isDynamic(tool.name) ? [{ condition: 'The medication context, catalog ID or page scope changed.', recovery: 'Refresh the registered tools and use their current contextRevision. Read current IDs with cleardose_get_explorer_state, section catalog.' }, providerFailure] : []), ...(isExplorer(tool.name) && tool.name !== 'cleardose_get_explorer_state' ? [staleWorkspace, providerFailure] : []), { condition: 'Arguments fail schema or runtime validation.', recovery: 'Review the required fields, types and current IDs. Schema-valid examples can still need current state. Do not run hidden prerequisites.' }],
    prompt: details?.prompt ?? `Use ${tool.name} to ${tool.title.toLocaleLowerCase()} with these example arguments: ${JSON.stringify(tool.exampleInput)}. Review the current schema and effects first. Ask for confirmation before changing state.`,
    exampleResult: exampleResult(tool),
    validationErrors,
    nativeSchema: nativeToolDefinition({ ...tool, execute: () => null }).inputSchema,
    schemaNotes: 'The browser receives the same validation constraints. ClearDose omits cosmetic schema titles, defaults and examples from native registration to stay within its declaration budget. Runtime handlers also check current IDs, revisions and action-specific rules.',
  }
})
