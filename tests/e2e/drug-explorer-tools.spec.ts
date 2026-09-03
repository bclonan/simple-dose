import { expect, test, type Page } from '@playwright/test'

interface Schema {
  properties?: Record<string, Schema>
  items?: Schema
  oneOf?: Schema[]
  const?: string
  enum?: string[]
}
interface Tool {
  name: string
  inputSchema: Schema
  annotations: { readOnlyHint: boolean; untrustedContentHint?: boolean }
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>
}
interface Bridge {
  tools(): Array<Omit<Tool, 'execute'>>
  call(name: string, input: unknown): Promise<unknown>
  hold(name: string): void
  callHeld(input: unknown): Promise<string>
  duplicates: string[]
}
type TestWindow = Window & { explorerTestWebMcp: Bridge }
interface WorkspaceResult {
  workspaceRevision: string
  stateRevision: string
  rows: Array<{ kind: string; id: string; factType?: string; drugIds?: string[] }>
  nextOffset: number | null
  total: number
}

async function nativeRegistry(page: Page) {
  await page.addInitScript(() => {
    const definitions = new Map<string, Tool>()
    const events = new EventTarget()
    const duplicates: string[] = []
    let held: Tool | undefined
    const list = () => [...definitions.values()].map(({ execute: _execute, ...tool }) => tool)
    const context = {
      async registerTool(tool: Tool, options: { signal: AbortSignal }) {
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
        if (!definition) throw new Error('Tool unavailable')
        return JSON.stringify(await definition.execute(JSON.parse(input), options))
      },
      addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    }
    Object.defineProperty(document, 'modelContext', { configurable: true, value: context })
    ;(window as unknown as TestWindow).explorerTestWebMcp = {
      tools: list,
      async call(name, input) { return JSON.parse(await context.executeTool({ name }, JSON.stringify(input))) },
      hold(name) { held = definitions.get(name) },
      async callHeld(input) {
        try { await held?.execute(input); return 'unexpected success' }
        catch (error) { return error instanceof Error ? error.message : String(error) }
      },
      duplicates,
    }
  })
}

async function providers(page: Page) {
  const state = { fail: false, requests: [] as string[] }
  const drugs = [
    { name: 'Metformin', brand: 'Glucophage', rxcui: '33001', ndc: '54321-0301-01' },
    { name: 'Empagliflozin', brand: 'Jardiance', rxcui: '33002', ndc: '54321-0302-01' },
    { name: 'Linagliptin', brand: 'Tradjenta', rxcui: '33003', ndc: '54321-0303-01' },
  ]
  await page.addInitScript(() => {
    if (!localStorage.getItem('cleardose:data-mode')) localStorage.setItem('cleardose:data-mode', JSON.stringify('hybrid'))
  })
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, async route => {
    const url = new URL(route.request().url())
    state.requests.push(url.href)
    if (state.fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { message: 'Fixture provider unavailable' } }) })
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
      const matches = drugs.filter(item => [item.name.toLowerCase(), item.brand.toLowerCase(), item.rxcui, item.ndc.slice(0, -3)].some(value => search.includes(value)))
      body = { results: matches.map(drug => url.pathname.includes('/label.json') ? {
        id: `explorer-tool-label-${drug.rxcui}`, effective_time: '20260831',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], product_ndc: [drug.ndc.slice(0, -3)] },
        indications_and_usage: [`Fixture use for ${drug.name}. Not clinical guidance.`],
        warnings: [`Fixture warning for ${drug.name}. Not clinical guidance.`],
        adverse_reactions: [`Fixture side effects for ${drug.name}. Not clinical guidance.`],
        drug_interactions: [`Fixture interaction label for ${drug.name}. Not a pairwise check.`],
      } : {
        product_ndc: drug.ndc.slice(0, -3), generic_name: drug.name, brand_name: drug.brand,
        dosage_form: 'TABLET', route: ['ORAL'], labeler_name: 'Explorer tool fixture labeler',
        active_ingredients: [{ name: drug.name.toUpperCase(), strength: '10 mg' }],
        packaging: [{ package_ndc: drug.ndc }], marketing_category: 'ANDA', application_number: 'ANDA000001',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], spl_set_id: [`tool-spl-${drug.rxcui}`] },
      }) }
    } else if (url.pathname.includes('/metastore/')) {
      body = [{ identifier: 'explorer-tools-nadac-fixture', title: `NADAC (National Average Drug Acquisition Cost) ${new Date().getFullYear()}` }]
    } else {
      body = { results: [{ ndc: url.searchParams.get('conditions[0][value]'), nadac_per_unit: '0.125', pricing_unit: 'EA', effective_date: '2026-08-26' }] }
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  return state
}

async function mutation(page: Page, name: string, input: Record<string, unknown>) {
  return page.evaluate(async ({ name, input }) => {
    const bridge = (window as unknown as TestWindow).explorerTestWebMcp
    const state = await bridge.call('cleardose_get_explorer_state', {}) as WorkspaceResult
    return bridge.call(name, { ...input, workspaceRevision: state.workspaceRevision })
  }, { name, input })
}

const readState = (page: Page, input: Record<string, unknown> = {}) => page.evaluate(async input =>
  (window as unknown as TestWindow).explorerTestWebMcp.call('cleardose_get_explorer_state', input) as Promise<WorkspaceResult>, input)
async function readCatalogIds(page: Page) {
  let result = await readState(page, { section: 'catalog', limit: 3 })
  const ids: string[] = []
  const revision = { workspaceRevision: result.workspaceRevision, stateRevision: result.stateRevision }
  const total = result.total
  while (true) {
    expect(JSON.stringify(result).length).toBeLessThanOrEqual(1_500)
    expect(result.rows.every(row => row.kind === 'catalog-drug')).toBe(true)
    ids.push(...result.rows.map(row => row.id))
    if (result.nextOffset === null) break
    expect(result.nextOffset).toBe(ids.length)
    result = await readState(page, { section: 'catalog', limit: 3, offset: result.nextOffset, ...revision })
  }
  expect(ids).toHaveLength(total)
  expect(new Set(ids).size).toBe(total)
  return ids
}
const factCard = (page: Page, fact: string) => page.locator(`[data-testid="drug-info-card"][data-fact-type="${fact}"]`)

test('registered tools resolve a new public drug and configure exactly the requested visible facts', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const source = await providers(page)
  await nativeRegistry(page)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.tools().length)).toBe(19)
  // Startup may already load Jardiance. Read a complete current catalog instead
  // of relying on a fixed seed count or repeating all IDs in each tool schema.
  await expect(async () => {
    const initialIds = await readCatalogIds(page)
    expect(initialIds).toEqual(expect.arrayContaining(['med-metformin', 'med-public-empagliflozin']))
    expect(initialIds).not.toContain('med-public-linagliptin')
  }).toPass()

  // Linagliptin is not a startup query, so this proves brand resolution still
  // adds a new public record after the initial catalog has loaded.
  const discovered = await mutation(page, 'cleardose_select_drugs', { drugs: ['Metformin', 'Tradjenta'], mode: 'replace' })
  expect(discovered).toMatchObject({ selectedDrugIds: ['med-metformin', 'med-public-linagliptin'], route: '/drugs/explore' })
  expect(await readCatalogIds(page)).toContain('med-public-linagliptin')
  await expect(page.getByTestId('explorer-selected')).toContainText('Linagliptin')
  expect(source.requests.some(url => url.toLowerCase().includes('tradjenta'))).toBe(true)

  const selected = await mutation(page, 'cleardose_select_drugs', { drugs: ['Metformin', 'Jardiance'], mode: 'replace' })
  expect(selected).toMatchObject({ selectedDrugIds: ['med-metformin', 'med-public-empagliflozin'], route: '/drugs/explore' })
  await expect(page.getByRole('heading', { name: 'Drug Explorer', exact: true })).toBeVisible()
  await expect(page.getByTestId('explorer-selected')).toContainText('Metformin')
  await expect(page.getByTestId('explorer-selected')).toContainText('Empagliflozin')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(0)
  await expect.poll(async () => (await readState(page)).rows.filter(row => row.kind === 'selected-drug').map(row => row.id)).toContain('med-public-empagliflozin')

  const oldRevision = (await readState(page)).workspaceRevision
  await page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.hold('cleardose_show_drug_fact'))
  await mutation(page, 'cleardose_show_drug_fact', { facts: ['side-effects', 'pricing'], mode: 'replace' })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await expect(factCard(page, 'side-effects')).toContainText('Fixture side effects for Metformin')
  await expect(factCard(page, 'side-effects')).toContainText('Fixture side effects for Empagliflozin')
  await expect(factCard(page, 'pricing').locator('[data-price-kind="nadac-benchmark"]').first()).toContainText('$3.75')
  const stale = await page.evaluate(revision => (window as unknown as TestWindow).explorerTestWebMcp.callHeld({ workspaceRevision: revision, facts: ['warnings'] }), oldRevision)
  expect(stale).toContain('Drug Explorer changed')
  await expect(factCard(page, 'warnings')).toHaveCount(0)

  await mutation(page, 'cleardose_show_drug_fact', { facts: ['interactions'], mode: 'replace' })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(1)
  await expect(factCard(page, 'interactions')).toContainText('Fixture interaction label for Metformin')
  await expect(factCard(page, 'interactions')).toContainText('Fixture interaction label for Empagliflozin')
  await expect(factCard(page, 'interactions')).toContainText('not a complete pairwise interaction check')
  await expect.poll(() => factCard(page, 'interactions').evaluate(element => {
    const box = element.getBoundingClientRect()
    return box.top < window.innerHeight && box.bottom > 0 && box.left >= 0 && box.right <= window.innerWidth
  })).toBe(true)
  const state = await readState(page)
  expect(state.rows.filter(row => row.kind === 'selected-drug').map(row => row.id)).toEqual(['med-metformin', 'med-public-empagliflozin'])
  expect(state.rows.filter(row => row.kind === 'fact-card').map(row => row.factType)).toEqual(['interactions'])
  const cardId = state.rows.find(row => row.kind === 'fact-card')!.id
  await expect(factCard(page, 'interactions')).toHaveAttribute('id', cardId)
  expect(new URL(page.url()).searchParams.get('facts')).toBe('interactions')
  expect(new URL(page.url()).searchParams.get('drugs')).toBe('metformin,public-empagliflozin')

  await page.reload()
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(1)
  await expect(factCard(page, 'interactions')).toContainText('Empagliflozin')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.tools().length)).toBe(19)
  const reloaded = await readState(page)
  expect(reloaded.rows.filter(row => row.kind === 'fact-card').map(row => row.factType)).toEqual(['interactions'])
  expect(source.requests.some(url => url.toLowerCase().includes('empagliflozin'))).toBe(true)
  expect(await page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.duplicates)).toEqual([])
  expect(errors).toEqual([])
})

test('registered card edits, removal, human changes, and resolution failures share one workspace', async ({ page }) => {
  const source = await providers(page)
  await nativeRegistry(page)
  await page.goto('/drugs/explore')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.tools().length)).toBe(19)
  const configured = await mutation(page, 'cleardose_show_drug_fact', { drugs: ['Metformin', 'Jardiance'], facts: ['warnings', 'uses'], mode: 'replace' })
  expect(configured).toMatchObject({ status: 'updated', selectedDrugIds: ['med-metformin', 'med-public-empagliflozin'], cardCount: 2 })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await expect(factCard(page, 'warnings')).toBeVisible()
  let state = await readState(page)
  const warningId = state.rows.find(row => row.factType === 'warnings')!.id
  await mutation(page, 'cleardose_update_fact_card', { cardId: warningId, factType: 'ingredients' })
  await expect(factCard(page, 'ingredients')).toHaveAttribute('id', warningId)
  await expect(factCard(page, 'ingredients')).toContainText('METFORMIN')
  await expect(factCard(page, 'warnings')).toHaveCount(0)
  await mutation(page, 'cleardose_remove_fact_card', { cardId: warningId })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(1)
  await mutation(page, 'cleardose_select_drugs', { drugs: ['med-metformin'], mode: 'remove' })
  await expect(page.getByTestId('explorer-selected').getByText('Metformin', { exact: true })).toHaveCount(0)
  state = await readState(page)
  expect(state.rows.find(row => row.kind === 'fact-card')!.drugIds).toEqual(['med-public-empagliflozin'])

  const beforeHuman = state.workspaceRevision
  await page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.hold('cleardose_show_drug_fact'))
  await page.getByTestId('explorer-add-warnings').click()
  const error = await page.evaluate(revision => (window as unknown as TestWindow).explorerTestWebMcp.callHeld({ workspaceRevision: revision, facts: ['pricing'], mode: 'replace' }), beforeHuman)
  expect(error).toContain('Drug Explorer changed')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)

  source.fail = true
  const beforeFailure = await readState(page)
  await expect(mutation(page, 'cleardose_show_drug_fact', { drugs: ['UnknownDrugFixture'], facts: ['pricing'], mode: 'replace' })).rejects.toThrow()
  const afterFailure = await readState(page)
  expect(afterFailure.rows).toEqual(beforeFailure.rows)
  expect(afterFailure.workspaceRevision).toBe(beforeFailure.workspaceRevision)
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await page.getByTestId('webmcp-badge').click()
  await page.getByTestId('webmcp-calls-tab').click()
  await expect(page.getByTestId('webmcp-drawer')).toContainText('cleardose_show_drug_fact')
  expect(await page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.duplicates)).toEqual([])
})

test('a successful explorer journey survives reload and replays only after visible review and confirmation', async ({ page }) => {
  await providers(page)
  await nativeRegistry(page)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).explorerTestWebMcp.tools().length)).toBe(19)
  await mutation(page, 'cleardose_select_drugs', { drugs: ['Metformin', 'Jardiance'], mode: 'replace' })
  await mutation(page, 'cleardose_show_drug_fact', { facts: ['side-effects', 'pricing'], mode: 'replace' })
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await page.reload()
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await page.getByTestId('explorer-clear').click()
  await expect(page.getByTestId('drug-info-card')).toHaveCount(0)

  await page.getByTestId('webmcp-badge').click()
  const drawer = page.getByTestId('webmcp-drawer')
  const original = drawer.getByTestId('webmcp-journey')
  await expect(original).toHaveCount(1)
  await expect(original).toContainText('cleardose_select_drugs')
  await expect(original).toContainText('cleardose_show_drug_fact')
  await expect(original).toContainText('2 state-changing')
  await original.getByRole('button', { name: 'Inspect calls' }).click()
  await expect(original).toContainText('Recorded state before')
  await expect(original).toContainText('Recorded state after')
  await original.getByRole('button', { name: 'Review replay' }).click()
  const confirmation = drawer.getByTestId('replay-confirmation')
  await expect(confirmation).toContainText('The visible page and shared local state will change after each step')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(0)
  await confirmation.getByTestId('confirm-journey-replay').click()
  const replay = drawer.getByTestId('webmcp-journey').filter({ has: page.getByRole('heading', { name: /^Replay:/ }) })
  await expect(replay).toBeVisible()
  await expect(replay.locator('.webmcp-journey__status')).toHaveText('Completed', { timeout: 10_000 })
  await drawer.getByRole('dialog').getByRole('button', { name: 'Close WebMCP activity' }).click()
  await expect(page.getByTestId('explorer-selected')).toContainText('Metformin')
  await expect(page.getByTestId('explorer-selected')).toContainText('Empagliflozin')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await expect(factCard(page, 'side-effects')).toBeVisible()
  await expect(factCard(page, 'pricing')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('facts')).toBe('side-effects,pricing')
})
