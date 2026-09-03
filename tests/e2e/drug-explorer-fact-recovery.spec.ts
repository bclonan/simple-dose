import { expect, test, type Locator, type Page } from '@playwright/test'

interface NativeTool {
  name: string
  inputSchema: { properties?: Record<string, { type?: string }> }
  annotations: { readOnlyHint: boolean; untrustedContentHint?: boolean }
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>
}
interface NativeBridge {
  tools(): Array<Omit<NativeTool, 'execute'>>
  call(name: string, input: unknown): Promise<unknown>
  failures: string[]
  duplicates: string[]
}
type FixtureWindow = Window & { factRecoveryWebMcp: NativeBridge }
interface MutationResult {
  status: string
  workspaceRevision: string
  selectedDrugIds: string[]
  cardCount: number
  [key: string]: unknown
}
interface StateRow {
  kind: string
  id?: string
  drugId?: string
  drugIds?: string[]
  factType?: string
  availability?: string
  [key: string]: unknown
}
interface StateResult {
  workspaceRevision: string
  stateRevision: string
  rows: StateRow[]
  nextOffset: number | null
}

const drugs = [
  { id: 'med-metformin', name: 'Metformin', brand: 'Glucophage', rxcui: '44001', ndc: '54321-0401-01', strength: '500 mg', spl: 'a1111111-1111-4111-8111-111111111111', unitCost: '0.125', total: '$3.75' },
  { id: 'med-public-empagliflozin', name: 'Empagliflozin', brand: 'Jardiance', rxcui: '44002', ndc: '54321-0402-01', strength: '10 mg', spl: 'b2222222-2222-4222-8222-222222222222', unitCost: '0.25', total: '$7.50' },
]

// This exercises app registration and execution through a browser shim. It is
// not evidence that a real browser-native WebMCP client executed these calls.
async function installRegistry(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('cleardose:data-mode', JSON.stringify('live'))
    const definitions = new Map<string, NativeTool>()
    const events = new EventTarget()
    const failures: string[] = []
    const duplicates: string[] = []
    const list = () => [...definitions.values()].map(({ execute: _execute, ...definition }) => definition)
    const context = {
      async registerTool(tool: NativeTool, options: { signal: AbortSignal }) {
        if (definitions.has(tool.name)) { duplicates.push(tool.name); throw new Error(`Duplicate tool ${tool.name}`) }
        if (options.signal.aborted) return
        definitions.set(tool.name, tool)
        options.signal.addEventListener('abort', () => {
          if (definitions.get(tool.name) === tool) definitions.delete(tool.name)
          events.dispatchEvent(new Event('toolchange'))
        }, { once: true })
        events.dispatchEvent(new Event('toolchange'))
      },
      async getTools() { return list() },
      async executeTool(tool: { name: string }, input: string, options?: { signal?: AbortSignal }) {
        if (typeof input !== 'string') throw new Error('Input must be JSON text.')
        const definition = definitions.get(tool.name)
        if (!definition) throw new Error(`Tool unavailable: ${tool.name}`)
        return JSON.stringify(await definition.execute(JSON.parse(input), options))
      },
      addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    }
    Object.defineProperty(document, 'modelContext', { configurable: true, value: context })
    ;(window as unknown as FixtureWindow).factRecoveryWebMcp = {
      tools: list, failures, duplicates,
      async call(name, input) {
        try { return JSON.parse(await context.executeTool({ name }, JSON.stringify(input))) }
        catch (error) { failures.push(error instanceof Error ? error.message : String(error)); throw error }
      },
    }
  })
}

async function installProviders(page: Page, labelsFail = false) {
  const state = { labelsFail, requests: [] as string[], labelRequests: [] as string[] }
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, async route => {
    const url = new URL(route.request().url())
    state.requests.push(url.href)
    const labelRequest = url.hostname === 'api.fda.gov' && url.pathname.endsWith('/label.json')
    if (labelRequest) state.labelRequests.push(url.searchParams.get('search') ?? '')
    if (labelRequest && state.labelsFail) {
      await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Fixture FDA label service unavailable' } }) })
      return
    }
    let body: unknown
    if (url.hostname === 'rxnav.nlm.nih.gov') {
      const name = (url.searchParams.get('name') ?? '').toLowerCase()
      const drug = drugs.find(item => [item.name.toLowerCase(), item.brand.toLowerCase()].includes(name))
      body = url.pathname.includes('approximateTerm') ? { approximateGroup: { candidate: [] } }
        : url.pathname.includes('properties.json') ? { properties: { name: drugs.find(item => url.pathname.includes(item.rxcui))?.name } }
          : { idGroup: { rxnormId: drug ? [drug.rxcui] : [] } }
    } else if (url.hostname === 'api.fda.gov') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = drugs.filter(drug => [drug.name.toLowerCase(), drug.brand.toLowerCase(), drug.rxcui, drug.ndc.slice(0, -3), drug.spl].some(value => search.includes(value)))
      body = { results: matches.map(drug => labelRequest ? {
        id: `fact-recovery-label-${drug.rxcui}`, set_id: drug.spl, effective_time: '20260831',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], product_ndc: [drug.ndc.slice(0, -3)], spl_set_id: [drug.spl] },
        indications_and_usage: [`Fixture use for ${drug.name}. Not clinical guidance.`],
        warnings: [`Fixture warning for ${drug.name}. Not clinical guidance.`],
        adverse_reactions: [`Fixture side effects for ${drug.name}. Not clinical guidance.`],
        drug_interactions: [`Fixture interaction label for ${drug.name}. Not a pairwise check.`],
      } : {
        product_ndc: drug.ndc.slice(0, -3), generic_name: drug.name, brand_name: drug.brand,
        product_type: 'HUMAN PRESCRIPTION DRUG', dosage_form: 'TABLET', route: ['ORAL'], labeler_name: 'Fact recovery fixture labeler',
        active_ingredients: [{ name: drug.name.toUpperCase(), strength: drug.strength }],
        packaging: [{ package_ndc: drug.ndc }], marketing_category: 'ANDA', application_number: 'ANDA000001',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], spl_set_id: [drug.spl] },
      }) }
    } else if (url.pathname.includes('/metastore/')) {
      body = [{ identifier: 'fact-recovery-nadac-fixture', title: `NADAC (National Average Drug Acquisition Cost) ${new Date().getFullYear()}` }]
    } else {
      const ndc = url.searchParams.get('conditions[0][value]')
      const drug = drugs.find(item => item.ndc.replaceAll('-', '') === ndc)
      body = { results: drug ? [{ ndc, nadac_per_unit: drug.unitCost, pricing_unit: 'EA', effective_date: '2026-08-26' }] : [] }
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  return state
}

async function callTool<T>(page: Page, name: string, input: Record<string, unknown>): Promise<T> {
  const output = await page.evaluate(({ name, input }) => (window as unknown as FixtureWindow).factRecoveryWebMcp.call(name, input), { name, input })
  expect(JSON.stringify(output).length).toBeLessThanOrEqual(1_500)
  return output as T
}
const card = (page: Page, fact: string) => page.locator(`[data-testid="drug-info-card"][data-fact-type="${fact}"]`)
const drugSection = (factCard: Locator, drugId: string) => factCard.locator(`[data-drug-id="${drugId}"]`)

async function startWorkspace(page: Page): Promise<MutationResult> {
  await installRegistry(page)
  await page.goto('/drugs/explore')
  await expect.poll(() => page.evaluate(() => (window as unknown as FixtureWindow).factRecoveryWebMcp.tools().length)).toBe(19)
  const schema = await page.evaluate(() => (window as unknown as FixtureWindow).factRecoveryWebMcp.tools().find(tool => tool.name === 'cleardose_select_drugs')!.inputSchema)
  expect(schema.properties?.workspaceRevision).toMatchObject({ type: 'string' })
  const initial = await callTool<StateResult>(page, 'cleardose_get_explorer_state', { section: 'workspace' })
  const selected = await callTool<MutationResult>(page, 'cleardose_select_drugs', {
    workspaceRevision: initial.workspaceRevision, drugs: ['Metformin', 'Jardiance'], mode: 'replace',
  })
  expect(selected).toMatchObject({ status: 'updated', selectedDrugIds: drugs.map(drug => drug.id), cardCount: 0 })
  await expect(page.getByTestId('explorer-selected')).toContainText('Metformin')
  await expect(page.getByTestId('explorer-selected')).toContainText('Empagliflozin')
  return selected
}

async function factRows(page: Page): Promise<StateRow[]> {
  const rows: StateRow[] = []
  let offset = 0
  let revisions: Record<string, string> = {}
  for (let index = 0; index < 12; index++) {
    const result = await callTool<StateResult>(page, 'cleardose_get_explorer_state', { section: 'cards', offset, limit: 10, ...revisions })
    rows.push(...result.rows)
    if (result.nextOffset === null) return rows
    expect(result.nextOffset).toBeGreaterThan(offset)
    offset = result.nextOffset
    revisions = { workspaceRevision: result.workspaceRevision, stateRevision: result.stateRevision }
  }
  throw new Error('Fact state pagination did not finish within twelve bounded pages.')
}

async function expectPublicBenchmarks(page: Page): Promise<void> {
  const pricing = card(page, 'pricing')
  for (const drug of drugs) {
    const benchmark = drugSection(pricing, drug.id).locator('[data-price-kind="nadac-benchmark"]')
    await expect(benchmark).toContainText(drug.total)
    await expect(benchmark).toContainText('CMS Medicaid NADAC')
    await expect(benchmark).toContainText('not a retail cash price')
    await expect(benchmark).toContainText(drug.ndc.replaceAll('-', ''))
  }
  await expect(pricing.locator('[data-price-kind="demo"]')).toHaveCount(0)
  await expect(pricing).not.toContainText('Fictional demo cash price')
}

async function expectNoToolErrors(page: Page, errors: string[]): Promise<void> {
  const bridge = await page.evaluate(() => {
    const { failures, duplicates } = (window as unknown as FixtureWindow).factRecoveryWebMcp
    return { failures, duplicates }
  })
  expect(bridge).toEqual({ failures: [], duplicates: [] })
  expect(errors).toEqual([])
  await expect(page.getByTestId('drug-explorer')).not.toContainText(/workspace changed|registration is stale|context changed/i)
}

test('native-schema-style Metformin and Jardiance fact chain keeps public benchmarks separate from demo offers', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const providers = await installProviders(page)
  const selected = await startWorkspace(page)
  const facts = await callTool<MutationResult>(page, 'cleardose_show_drug_fact', {
    workspaceRevision: selected.workspaceRevision, facts: ['side-effects', 'pricing'], mode: 'add',
  })
  expect(facts).toMatchObject({ status: 'updated', selectedDrugIds: drugs.map(drug => drug.id), cardCount: 2,
    data: { availability: 'available', requested: 4, available: 4, providerFailed: 0 } })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  const report = page.getByRole('table', { name: 'Medication comparison report', exact: true })
  await expect(report).toBeVisible()
  await expect(report.getByRole('columnheader')).toHaveCount(3)
  for (const drug of drugs) await expect(report.getByRole('columnheader', { name: new RegExp(drug.name) })).toBeVisible()
  for (const fact of ['side-effects', 'pricing']) {
    await expect(card(page, fact).getByRole('cell')).toHaveCount(2)
    expect(await card(page, fact).locator('[data-drug-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-drug-id')))).toEqual(drugs.map(drug => drug.id))
  }
  for (const drug of drugs) await expect(drugSection(card(page, 'side-effects'), drug.id)).toContainText(`Fixture side effects for ${drug.name}.`)
  await expectPublicBenchmarks(page)
  for (const drug of drugs) expect(providers.labelRequests.some(query => /set_id/.test(query) && query.includes(drug.spl))).toBe(true)
  const available = (await factRows(page)).filter(row => row.kind === 'fact-data')
  expect(available).toHaveLength(4)
  expect(available.every(row => row.availability === 'available')).toBe(true)

  const interactions = await callTool<MutationResult>(page, 'cleardose_show_drug_fact', {
    workspaceRevision: facts.workspaceRevision, facts: ['interactions'], mode: 'replace',
  })
  expect(interactions).toMatchObject({ status: 'updated', selectedDrugIds: drugs.map(drug => drug.id), cardCount: 1,
    data: { availability: 'available', requested: 2, available: 2, providerFailed: 0 } })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(1)
  await expect(card(page, 'side-effects')).toHaveCount(0)
  await expect(card(page, 'pricing')).toHaveCount(0)
  await expect(card(page, 'interactions').getByRole('rowheader')).toHaveCount(1)
  await expect(card(page, 'interactions').getByRole('cell')).toHaveCount(2)
  for (const drug of drugs) await expect(drugSection(card(page, 'interactions'), drug.id)).toContainText(`Fixture interaction label for ${drug.name}.`)
  await expect(card(page, 'interactions')).toContainText('not a complete pairwise interaction check')
  const rows = await factRows(page)
  expect(rows.filter(row => row.kind === 'fact-card').map(row => row.factType)).toEqual(['interactions'])
  expect(rows.filter(row => row.kind === 'fact-data')).toEqual(expect.arrayContaining(drugs.map(drug => expect.objectContaining({ drugId: drug.id, factType: 'interactions', availability: 'available' }))))
  expect(new URL(page.url()).searchParams.get('facts')).toBe('interactions')
  await expectNoToolErrors(page, errors)
})

test('failed FDA labels recover through visible Retry without replacing cards or inventing clinical facts', async ({ page }) => {
  test.setTimeout(60_000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const providers = await installProviders(page, true)
  const selected = await startWorkspace(page)
  const result = await callTool<MutationResult>(page, 'cleardose_show_drug_fact', {
    workspaceRevision: selected.workspaceRevision, facts: ['side-effects', 'pricing'], mode: 'add',
  })
  expect(result).toMatchObject({ status: 'updated', selectedDrugIds: drugs.map(drug => drug.id), cardCount: 2,
    data: { availability: 'partial', requested: 4, available: 2, providerFailed: 2 } })
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  const beforeIds = await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))
  const sideEffects = card(page, 'side-effects')
  await expect(sideEffects).toHaveAttribute('data-comparison', 'incomplete')
  for (const drug of drugs) {
    const section = drugSection(sideEffects, drug.id)
    await expect(section.getByRole('status')).toHaveText('FDA label failed to load')
    await expect(section.getByText(/FDA label could not load\. Retry public data/)).toBeVisible()
    await expect(section.locator('.drug-info-card__text')).toHaveCount(0)
    await expect(section).not.toContainText(`Fixture side effects for ${drug.name}.`)
  }
  await expectPublicBenchmarks(page)
  const missing = (await factRows(page)).filter(row => row.kind === 'fact-data')
  expect(missing).toHaveLength(4)
  for (const drug of drugs) {
    expect(missing).toEqual(expect.arrayContaining([
      expect.objectContaining({ drugId: drug.id, factType: 'side-effects', availability: 'provider-failed',
        warnings: expect.arrayContaining([expect.objectContaining({ source: 'openfda-label', code: expect.any(String) })]) }),
      expect.objectContaining({ drugId: drug.id, factType: 'pricing', availability: 'available' }),
    ]))
  }
  const requestCount = providers.labelRequests.length
  expect(requestCount).toBe(2)
  for (const drug of drugs) expect(providers.labelRequests.some(query => /set_id/.test(query) && query.includes(drug.spl))).toBe(true)
  expect(providers.labelRequests.some(query => /generic_name|brand_name/.test(query))).toBe(false)
  providers.labelsFail = false
  await page.getByRole('button', { name: 'Retry requested facts', exact: true }).click()
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  for (const drug of drugs) {
    const section = drugSection(sideEffects, drug.id)
    await expect(section).toContainText(`Fixture side effects for ${drug.name}.`)
    await expect(section.getByRole('status')).not.toContainText('failed')
    await expect(section).not.toContainText('FDA label could not load')
  }
  expect(providers.labelRequests.length).toBeGreaterThan(requestCount)
  await expect(sideEffects).toHaveAttribute('data-comparison', 'different')
  expect(await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))).toEqual(beforeIds)
  await expectPublicBenchmarks(page)
  const recovered = (await factRows(page)).filter(row => row.kind === 'fact-data')
  expect(recovered).toHaveLength(4)
  expect(recovered.every(row => row.availability === 'available')).toBe(true)
  await expectNoToolErrors(page, errors)
})
