import { expect, test, type Page } from '@playwright/test'

interface FixtureDrug { generic: string; brand: string; rxcui: string; ndc: string; strength: string }
const fixtureDrugs: FixtureDrug[] = [
  { generic: 'Cetirizine', brand: 'Zyrtec', rxcui: '10001', ndc: '12345-0001-01', strength: '10 mg' },
  { generic: 'Atorvastatin', brand: 'Lipitor', rxcui: '10002', ndc: '12345-0002-01', strength: '20 mg' },
  { generic: 'Rosuvastatin', brand: 'Crestor', rxcui: '10003', ndc: '12345-0003-01', strength: '10 mg' },
  { generic: 'Empagliflozin', brand: 'Jardiance', rxcui: '10004', ndc: '12345-0004-01', strength: '10 mg' },
]

const warning = (drug: FixtureDrug) => `Fixture FDA warning for ${drug.generic}. This text verifies rendering and is not clinical guidance.`

async function mockPublicProviders(page: Page) {
  const state = { fail: false, requests: [] as string[] }
  await page.addInitScript(() => {
    if (!localStorage.getItem('cleardose:data-mode')) localStorage.setItem('cleardose:data-mode', JSON.stringify('hybrid'))
  })
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, async (route) => {
    const url = new URL(route.request().url())
    state.requests.push(url.href)
    if (state.fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { code: 'SERVER_ERROR', message: 'Fixture provider unavailable' } }) })
      return
    }
    let body: unknown
    if (url.hostname === 'rxnav.nlm.nih.gov') {
      const name = (url.searchParams.get('name') ?? '').toLowerCase()
      const drug = fixtureDrugs.find((entry) => entry.generic.toLowerCase() === name || entry.brand.toLowerCase() === name)
      body = url.pathname.includes('approximateTerm') ? { approximateGroup: { candidate: [] } }
        : url.pathname.includes('properties.json')
          ? { properties: { name: fixtureDrugs.find((entry) => url.pathname.includes(entry.rxcui))?.generic } }
          : { idGroup: { rxnormId: drug ? [drug.rxcui] : [] } }
    } else if (url.hostname === 'api.fda.gov') {
      const search = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = fixtureDrugs.filter((entry) => search.includes(entry.generic.toLowerCase()) || search.includes(entry.brand.toLowerCase()) || search.includes(entry.rxcui))
      body = url.pathname.includes('/label.json')
        ? { results: matches.map((drug) => ({
          id: `fixture-label-${drug.rxcui}`, effective_time: '20260831',
          openfda: { generic_name: [drug.generic], brand_name: [drug.brand], rxcui: [drug.rxcui] },
          indications_and_usage: [`Fixture FDA indication for ${drug.generic}.`],
          warnings: [warning(drug)],
          boxed_warning: [`Fixture boxed warning for ${drug.generic}.`],
          adverse_reactions: [`Fixture adverse-reaction label for ${drug.generic}.`],
          drug_interactions: [`Fixture interaction label for ${drug.generic}.`],
          dosage_and_administration: ['Fixture dosage text. Not an instruction for use.'],
        })) }
        : { results: matches.map((drug) => ({
          product_ndc: drug.ndc.slice(0, -3), generic_name: drug.generic, brand_name: drug.brand,
          dosage_form: 'TABLET', route: ['ORAL'], labeler_name: 'Fixture Labeler',
          active_ingredients: [{ name: drug.generic.toUpperCase(), strength: drug.strength }],
          packaging: [{ package_ndc: drug.ndc }], marketing_category: 'ANDA', application_number: 'ANDA000000',
          openfda: { generic_name: [drug.generic], brand_name: [drug.brand], rxcui: [drug.rxcui], pharm_class_epc: ['Fixture pharmacologic class'], spl_set_id: [`fixture-spl-${drug.rxcui}`] },
        })) }
    } else if (url.pathname.includes('/metastore/')) {
      body = [{ identifier: 'fixture-nadac', title: `NADAC (National Average Drug Acquisition Cost) ${new Date().getFullYear()}` }]
    } else {
      body = { results: [{ ndc: url.searchParams.get('conditions[0][value]'), nadac_per_unit: '0.125', pricing_unit: 'EA', effective_date: '2026-08-26', as_of_date: '2026-08-31' }] }
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  return state
}

async function searchFor(page: Page, query: string) {
  await page.getByRole('searchbox', { name: 'Search medications', exact: true }).fill(query)
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('link', { name: 'View medication' })).toHaveCount(1)
}

function runtimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  return errors
}

interface TestTool {
  name: string
  inputSchema: { properties: Record<string, { const?: string; enum?: string[] }> }
  annotations: Record<string, boolean>
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>
}
interface TestBridge {
  tools(): Array<Omit<TestTool, 'execute'>>
  call(name: string, input: unknown): Promise<unknown>
  hold(name: string): void
  callHeld(input: unknown): Promise<string>
  duplicates: string[]
  registrations(): Record<string, number>
}
type TestWindow = Window & { clearDoseTestWebMcp: TestBridge }

async function installNativeRegistryShim(page: Page) {
  await page.addInitScript(() => {
    const definitions = new Map<string, TestTool>()
    const events = new EventTarget()
    const duplicates: string[] = []
    const registrations: Record<string, number> = {}
    let held: TestTool | undefined
    const list = () => [...definitions.values()].map(({ execute: _execute, ...tool }) => tool)
    Object.defineProperty(document, 'modelContext', { configurable: true, value: {
      async registerTool(tool: TestTool, options: { signal: AbortSignal }) {
        if (definitions.has(tool.name)) { duplicates.push(tool.name); throw new Error(`Duplicate tool ${tool.name}`) }
        if (options.signal.aborted) return
        definitions.set(tool.name, tool)
        registrations[tool.name] = (registrations[tool.name] ?? 0) + 1
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
        if (!definition) throw new Error('Tool is no longer registered.')
        return JSON.stringify(await definition.execute(JSON.parse(input), options))
      },
      addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    } })
    ;(window as unknown as TestWindow).clearDoseTestWebMcp = {
      tools: list,
      async call(name, input) {
        const tool = definitions.get(name)
        if (!tool) throw new Error('Tool unavailable')
        return tool.execute(input)
      },
      hold(name) { held = definitions.get(name) },
      async callHeld(input) {
        try { await held?.execute(input); return 'unexpected success' }
        catch (error) { return error instanceof Error ? error.message : String(error) }
      },
      duplicates,
      registrations: () => ({ ...registrations }),
    }
  })
}

test('public medication keeps FDA facts separate from generated demo offers and restores both from cache', async ({ page }) => {
  const errors = runtimeErrors(page)
  const providers = await mockPublicProviders(page)
  await page.goto('/medications')
  await expect(page.getByTestId('catalog-data-mode')).toHaveValue('hybrid')
  await searchFor(page, 'Zyrtec')
  await expect(page.getByTestId('catalog-search-message')).toContainText('Public source matches')
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page).toHaveURL(/\/medications\/public-cetirizine$/)
  await expect(page.getByTestId('public-drug-panel')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('public-data-status')).toContainText(/Public data loaded|Cached public data/)
  await expect(page.getByTestId('demo-fulfillment-notice')).toContainText(/demo|fictional/i)
  await expect(page.getByTestId('add-selected-to-cart')).toBeVisible()
  const clinical = page.getByTestId('public-clinical-sections')
  await clinical.locator('summary').filter({ hasText: /^Warnings / }).click()
  await expect(clinical.getByText(warning(fixtureDrugs[0]!))).toBeVisible()
  await clinical.locator('summary').filter({ hasText: /^Drug interaction label sections / }).click()
  await expect(clinical.getByText('Fixture interaction label for Cetirizine.')).toBeVisible()
  await expect(clinical.getByText(/not a complete pairwise interaction check/)).toBeVisible()
  const benchmark = page.locator('[data-price-kind="nadac-benchmark"]')
  await expect(benchmark).toContainText('quantity 90')
  await expect(benchmark).toContainText('$11.25')
  await expect(benchmark).toContainText('not a retail cash price')
  await page.getByTestId('public-sources').locator('summary').click()
  await expect(page.getByTestId('public-sources').getByRole('link', { name: 'FDA drug label', exact: true })).toBeVisible()
  await expect(page.getByTestId('public-sources').getByRole('link', { name: 'CMS Medicaid NADAC' })).toBeVisible()
  expect(providers.requests.some((url) => url.includes('api.fda.gov'))).toBe(true)
  expect(providers.requests.some((url) => url.includes('data.medicaid.gov'))).toBe(true)
  providers.fail = true
  await page.reload()
  await expect(page.getByTestId('public-data-status')).toContainText('Cached public data')
  await expect(page.getByTestId('public-drug-panel')).toContainText('Cetirizine')
  await expect(page.getByTestId('add-selected-to-cart')).toBeVisible()
  expect(errors).toEqual([])
})

test('provider failure leaves labeled fixture search and demo fulfillment usable', async ({ page }) => {
  const errors = runtimeErrors(page)
  const providers = await mockPublicProviders(page)
  providers.fail = true
  await page.goto('/medications')
  await searchFor(page, 'atorvastatin')
  await expect(page.getByTestId('catalog-search-message')).toContainText('Public search is unavailable')
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page.getByTestId('public-data-status')).toHaveText('Demo fallback')
  await expect(page.getByRole('heading', { name: 'Fulfillment options' })).toBeVisible()
  await expect(page.getByTestId('add-selected-to-cart')).toBeVisible()
  await expect(page.getByTestId('public-drug-panel')).toContainText('Public drug data is unavailable')
  expect(errors).toEqual([])
})

test('startup public records support a two-medication mock cart through WebMCP and survive reload', async ({ page }) => {
  const errors = runtimeErrors(page)
  const providers = await mockPublicProviders(page)
  await installNativeRegistryShim(page)
  await page.goto('/medications')
  await expect(page.locator('.medication-card').filter({ has: page.getByRole('heading', { name: 'Cetirizine', exact: true }) })).toBeVisible()
  await expect(page.locator('.medication-card').filter({ has: page.getByRole('heading', { name: 'Empagliflozin', exact: true }) })).toBeVisible()
  await expect(page.getByTestId('catalog-bootstrap-status')).toContainText('records ready')
  const result = await page.evaluate(async () => {
    const bridge = (window as unknown as TestWindow).clearDoseTestWebMcp
    const summaries = []
    for (const medicationId of ['med-public-cetirizine', 'med-public-empagliflozin']) {
      const detail = await bridge.call('get_medication_details', { medicationId, limit: 1 }) as {
        shopConfigurations: Array<{ form: string; strength: string; quantity: number; unit: string }>
        prescriptionRequired: boolean | null; pricingNotice: string
      }
      const configuration = detail.shopConfigurations[0]!
      const comparison = await bridge.call('compare_fulfillment_options', {
        medicationId, form: configuration.form, strength: configuration.strength, quantity: configuration.quantity,
        maxResults: 2,
      }) as { options: Array<{ offerId: string; deliveryOptionId: string; total: number }>; pricingNotice: string }
      const chosen = comparison.options.at(-1)!
      await bridge.call('select_medication_option', { offerId: chosen.offerId, deliveryOptionId: chosen.deliveryOptionId })
      const added = await bridge.call('add_to_cart', { offerId: chosen.offerId, deliveryOptionId: chosen.deliveryOptionId })
      summaries.push({ medicationId, detail, comparison, added })
    }
    const cart = await bridge.call('view_cart', { limit: 1 }) as { itemCount: number; grandTotal: number; nextOffset: number | null }
    const savings = await bridge.call('compare_cart_savings', { limit: 1 })
    return { summaries, cart, savings }
  })
  expect(result.cart.itemCount).toBe(2)
  expect(result.cart.grandTotal).toBeGreaterThan(0)
  expect(result.cart.nextOffset).toBe(1)
  expect(result.summaries.every(summary => summary.detail.prescriptionRequired === null)).toBe(true)
  expect(result.summaries.every(summary => /fictional/i.test(summary.comparison.pricingNotice))).toBe(true)
  await expect(page.getByTestId('cart-drawer').locator('.cart-line')).toHaveCount(2)
  await expect(page.getByTestId('cart-drawer')).toContainText('Demo prices and fulfillment only')
  const totalBefore = await page.getByTestId('cart-current-total').innerText()
  providers.fail = true
  await page.reload()
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().length)).toBe(20)
  const restored = await page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.call('view_cart', { limit: 1 })) as { itemCount: number; grandTotal: number }
  expect(restored).toMatchObject({ itemCount: 2, grandTotal: result.cart.grandTotal })
  await expect(page.getByTestId('cart-drawer').locator('.cart-line')).toHaveCount(2)
  await expect(page.getByTestId('cart-current-total')).toHaveText(totalBefore)
  expect(errors).toEqual([])
})

test('one native registration survives repeated reads while only changed dynamic tools are replaced', async ({ page }) => {
  test.setTimeout(90_000)
  const errors = runtimeErrors(page)
  await mockPublicProviders(page)
  await installNativeRegistryShim(page)
  await page.goto('/medications')
  await expect(page.getByTestId('catalog-bootstrap-status')).toContainText('records ready')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().length)).toBe(20)
  const run = await page.evaluate(async () => {
    const bridge = (window as unknown as TestWindow).clearDoseTestWebMcp
    const registrationBefore = bridge.registrations()
    for (let index = 0; index < 120; index++) {
      const result = await bridge.call('cleardose_get_explorer_state', { section: 'catalog', limit: 1 })
      if (JSON.stringify(result).length > 1500) throw new Error('Output budget exceeded')
      if (index % 10 === 0) {
        await bridge.call('search_medications', { query: index % 20 === 0 ? 'Zyrtec' : 'Jardiance' })
        // Let the same watcher used by native registration process each route/catalog change.
        await new Promise<void>(resolve => setTimeout(resolve, 0))
      }
      if (bridge.tools().length !== 20) throw new Error('A registered tool was lost')
    }
    return { registrationBefore, registrationAfter: bridge.registrations(), duplicates: bridge.duplicates }
  })
  for (const name of ['search_medications', 'get_medication_details', 'view_cart', 'cleardose_get_explorer_state']) {
    expect(run.registrationAfter[name]).toBe(run.registrationBefore[name])
  }
  expect(run.duplicates).toEqual([])
  expect(errors).toEqual([])
})

test('related medication comparison shows public facts while live data mode keeps labeled mock commerce', async ({ page }) => {
  const errors = runtimeErrors(page)
  await mockPublicProviders(page)
  await page.goto('/medications')
  await searchFor(page, 'atorvastatin')
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page.getByTestId('public-drug-panel')).toHaveAttribute('aria-busy', 'false')
  await page.getByTestId('find-related').click()
  const rosuvastatin = page.getByTestId('related-medications').locator('.related-list > li').filter({ has: page.getByRole('link', { name: 'Rosuvastatin', exact: true }) })
  await expect(rosuvastatin).toContainText('Same catalog category: cholesterol')
  await rosuvastatin.getByRole('button', { name: 'Compare details' }).click()
  const comparison = page.getByTestId('related-comparison')
  await expect(comparison).toBeVisible()
  await expect(comparison.getByRole('columnheader', { name: 'Atorvastatin' })).toBeVisible()
  await expect(comparison.getByRole('columnheader', { name: 'Rosuvastatin' })).toBeVisible()
  await expect(comparison.getByRole('row', { name: /Active ingredients/ })).toContainText('ATORVASTATIN')
  await expect(comparison.getByRole('row', { name: /Active ingredients/ })).toContainText('ROSUVASTATIN')
  await expect(comparison).toContainText('not a recommendation to substitute')
  await page.locator('.breadcrumb').getByRole('link', { name: 'Medications' }).click()
  await page.getByTestId('catalog-data-mode').selectOption('live')
  await expect(page.getByTestId('catalog-data-mode')).toBeEnabled()
  await expect(page.getByTestId('catalog-data-mode')).toHaveValue('live')
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page.getByTestId('demo-fulfillment-notice')).toContainText(/fictional|demo/i)
  await expect(page.getByTestId('add-selected-to-cart')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fulfillment options' })).toBeVisible()
  expect(errors).toEqual([])
})

test('native registry updates dynamic catalog schemas and rejects stale calls while public details stay logged', async ({ page }) => {
  const errors = runtimeErrors(page)
  await mockPublicProviders(page)
  await installNativeRegistryShim(page)
  await page.goto('/')
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().length)).toBe(20)
  const oldRevision = await page.evaluate(() => {
    const bridge = (window as unknown as TestWindow).clearDoseTestWebMcp
    bridge.hold('find_related_medications')
    return bridge.tools().find((tool) => tool.name === 'find_related_medications')!.inputSchema.properties.contextRevision!.const!
  })
  await page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.call('search_medications', { query: 'cetirizine' }))
  await expect(page).toHaveURL(/\/medications$/)
  await expect(page.getByRole('link', { name: 'View medication' })).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().find((tool) => tool.name === 'find_related_medications')?.inputSchema.properties.contextRevision?.const)).not.toBe(oldRevision)
  const newRevision = await page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().find((tool) => tool.name === 'find_related_medications')!.inputSchema.properties.contextRevision!.const!)
  expect(newRevision).not.toBe(oldRevision)
  const staleError = await page.evaluate((revision) => (window as unknown as TestWindow).clearDoseTestWebMcp.callHeld({ contextRevision: revision, referenceMedicationId: 'med-atorvastatin' }), oldRevision)
  expect(staleError).toContain('Refresh the available WebMCP tools')
  const receipt = await page.evaluate(async () => {
    const bridge = (window as unknown as TestWindow).clearDoseTestWebMcp
    const revision = bridge.tools().find((tool) => tool.name === 'compare_medications')!.inputSchema.properties.contextRevision!.const!
    const allRows: Array<{ path: string; value: unknown }> = []
    const routes: string[] = []
    let offset: number | null = 0
    let pages = 0
    while (offset !== null && pages < 100) {
      const result = await bridge.call('compare_medications', { contextRevision: revision, medicationIds: ['med-public-cetirizine'], section: 'clinical', offset, limit: 10 }) as { route: string; rows: Array<{ path: string; value: unknown }>; nextOffset: number | null }
      if (JSON.stringify(result).length > 1500) throw new Error('Output exceeds budget')
      allRows.push(...result.rows)
      routes.push(result.route)
      offset = result.nextOffset
      pages++
    }
    return { rows: allRows, routes, browserPath: location.pathname }
  })
  expect(receipt.rows).toContainEqual({ path: '/drugs/0/clinical/warnings/0', value: warning(fixtureDrugs[0]!) })
  expect(receipt.browserPath).toBe('/medications')
  expect(receipt.routes.every((route) => route === receipt.browserPath)).toBe(true)
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page).toHaveURL(/\/medications\/public-cetirizine$/)
  // The search result and detail page expose the same single medication. Moving
  // between those routes should retain the tool handle and still report the new route.
  await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.tools().find((tool) => tool.name === 'compare_medications')?.inputSchema.properties.contextRevision?.const)).toBe(newRevision)
  const detailScope = await page.evaluate(async () => {
    const bridge = (window as unknown as TestWindow).clearDoseTestWebMcp
    const revision = bridge.tools().find((tool) => tool.name === 'compare_medications')!.inputSchema.properties.contextRevision!.const!
    let rejection = ''
    try {
      await bridge.call('compare_medications', { contextRevision: revision, medicationIds: ['med-atorvastatin'], scope: 'page', section: 'identity' })
    } catch (error) { rejection = error instanceof Error ? error.message : String(error) }
    const result = await bridge.call('compare_medications', { contextRevision: revision, medicationIds: ['med-public-cetirizine'], scope: 'page', section: 'identity' }) as { route: string; scope: string }
    return { rejection, route: result.route, scope: result.scope, browserPath: location.pathname }
  })
  expect(detailScope.rejection).toContain('medicationIds must be one of the currently available values')
  expect(detailScope.scope).toBe('page')
  expect(detailScope.route).toBe(detailScope.browserPath)
  expect(detailScope.route).toBe('/medications/public-cetirizine')
  expect(await page.evaluate(() => (window as unknown as TestWindow).clearDoseTestWebMcp.duplicates)).toEqual([])
  await page.getByTestId('webmcp-badge').click()
  const drawer = page.getByTestId('webmcp-drawer')
  await drawer.getByTestId('webmcp-calls-tab').click()
  await expect(drawer).toContainText('compare_medications')
  await expect(drawer).toContainText('contextRevision')
  expect(errors).toEqual([])
})
