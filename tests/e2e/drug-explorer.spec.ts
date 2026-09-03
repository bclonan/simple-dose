import { expect, test, type Page } from '@playwright/test'

const drugs = [
  { name: 'Atorvastatin', brand: 'Lipitor', rxcui: '21001', ndc: '54321-0001-01' },
  { name: 'Rosuvastatin', brand: 'Crestor', rxcui: '21002', ndc: '54321-0002-01' },
]
const useText = (name: string) => `Fixture use for ${name}. This is test text, not clinical guidance. `.repeat(20)

async function publicFixtures(page: Page) {
  const state = { fail: false, requests: [] as string[] }
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('hybrid')))
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, async route => {
    const url = new URL(route.request().url())
    state.requests.push(url.href)
    if (state.fail) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Fixture provider unavailable' } }) })
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
        id: `explorer-fixture-${drug.rxcui}`, effective_time: '20260831',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], product_ndc: [drug.ndc.slice(0, -3)] },
        indications_and_usage: [useText(drug.name)],
        ...(drug.name === 'Atorvastatin' ? { warnings: ['Fixture warning for Atorvastatin. Not clinical guidance.'] } : {}),
        adverse_reactions: [`Fixture side effects for ${drug.name}.`], drug_interactions: [`Fixture interaction label for ${drug.name}.`],
      } : {
        product_ndc: drug.ndc.slice(0, -3), generic_name: drug.name, brand_name: drug.brand,
        dosage_form: 'TABLET', route: ['ORAL'], labeler_name: 'Explorer fixture labeler',
        active_ingredients: [{ name: drug.name.toUpperCase(), strength: '20 mg' }],
        packaging: [{ package_ndc: drug.ndc }], marketing_category: 'ANDA', application_number: 'ANDA000001',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], spl_set_id: [`explorer-spl-${drug.rxcui}`] },
      }) }
    } else if (url.pathname.includes('/metastore/')) {
      body = [{ identifier: 'explorer-nadac-fixture', title: `NADAC (National Average Drug Acquisition Cost) ${new Date().getFullYear()}` }]
    } else {
      body = { results: [{ ndc: url.searchParams.get('conditions[0][value]'), nadac_per_unit: '0.125', pricing_unit: 'EA', effective_date: '2026-08-26' }] }
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
  return state
}

async function addMedication(page: Page, name: string) {
  await page.getByRole('searchbox', { name: 'Search explorer medications' }).fill(name)
  await page.getByRole('button', { name: 'Search medications', exact: true }).click()
  await page.getByRole('button', { name: `Add ${name}`, exact: true }).click()
  await expect(page.getByTestId('explorer-selected')).toContainText(name)
}

const factCard = (page: Page, fact: string) => page.locator(`[data-testid="drug-info-card"][data-fact-type="${fact}"]`)
const routeState = (page: Page) => {
  const url = new URL(page.url())
  return { drugs: url.searchParams.get('drugs') || null, facts: url.searchParams.get('facts') || null }
}

test('human selections evolve the same cards and keep the workspace URL in sync', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
  await page.goto('/drugs/explore')
  await expect(page.getByRole('heading', { name: 'Drug Explorer', exact: true })).toBeVisible()
  await expect(page.getByTestId('explorer-empty')).toBeVisible()
  await addMedication(page, 'Atorvastatin')
  await page.getByTestId('explorer-add-uses').click()
  await page.getByTestId('explorer-add-warnings').click()
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  const ids = await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))
  await addMedication(page, 'Rosuvastatin')
  const report = page.getByRole('table', { name: 'Medication comparison report', exact: true })
  await expect(report.getByRole('columnheader', { name: /Atorvastatin/ })).toBeVisible()
  await expect(report.getByRole('columnheader', { name: /Rosuvastatin/ })).toBeVisible()
  for (const fact of ['uses', 'warnings']) {
    await expect(factCard(page, fact).locator('[data-drug-id="med-atorvastatin"]')).toBeVisible()
    await expect(factCard(page, fact).locator('[data-drug-id="med-rosuvastatin"]')).toBeVisible()
    await expect(factCard(page, fact).getByRole('cell')).toHaveCount(2)
  }
  expect(await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))).toEqual(ids)
  await expect.poll(() => routeState(page)).toEqual({ drugs: 'atorvastatin,rosuvastatin', facts: 'uses,warnings' })
  await factCard(page, 'warnings').evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await factCard(page, 'warnings').getByRole('combobox').selectOption('side-effects')
  await expect(factCard(page, 'side-effects')).toHaveAttribute('id', ids[1]!)
  await expect.poll(() => routeState(page).facts).toBe('uses,side-effects')
  await expect.poll(() => factCard(page, 'side-effects').evaluate(element => {
    const box = element.getBoundingClientRect()
    return window.scrollY > 0 && box.top < window.innerHeight && box.bottom > 0
  })).toBe(true)
  await page.getByTestId('explorer-add-uses').click()
  await expect(page.getByTestId('drug-info-card')).toHaveCount(2)
  await expect(factCard(page, 'uses')).toBeFocused()
  await factCard(page, 'uses').getByRole('button', { name: 'Remove Uses card' }).click()
  await page.getByRole('button', { name: 'Remove Atorvastatin', exact: true }).click()
  await expect(factCard(page, 'side-effects').locator('[data-drug-id="med-atorvastatin"]')).toHaveCount(0)
  await expect(report.getByRole('columnheader', { name: /Atorvastatin/ })).toHaveCount(0)
  await expect.poll(() => routeState(page)).toEqual({ drugs: 'rosuvastatin', facts: 'side-effects' })
  await page.reload()
  await expect(page.getByTestId('explorer-selected')).toContainText('Rosuvastatin')
  await expect(factCard(page, 'side-effects')).toHaveCount(1)
  await page.getByTestId('explorer-clear').click()
  await expect(page.getByTestId('drug-info-card')).toHaveCount(0)
  await expect(page.getByTestId('explorer-empty')).toBeVisible()
  await expect.poll(() => routeState(page)).toEqual({ drugs: null, facts: null })
})

test('deep links load requested facts, distinguish NADAC, and leave missing sections explicit', async ({ page }) => {
  const providers = await publicFixtures(page)
  await page.goto('/drugs/explore?drugs=atorvastatin,rosuvastatin&facts=uses,warnings,prices,pregnancy')
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(4)
  await expect(factCard(page, 'warnings')).toContainText('Fixture warning for Atorvastatin')
  const missing = factCard(page, 'warnings').locator('[data-drug-id="med-rosuvastatin"]')
  await expect(missing).toContainText(/unavailable|not available/i)
  await expect(factCard(page, 'pregnancy')).toContainText('Absence is not a safety finding')
  const nadac = factCard(page, 'pricing').locator('[data-price-kind="nadac-benchmark"]').first()
  await expect(nadac).toContainText('$3.75')
  await expect(nadac).toContainText(/acquisition.*benchmark/i)
  await expect(nadac).toContainText(/not.*retail|not.*cash price/i)
  const uses = factCard(page, 'uses').locator('[data-drug-id="med-atorvastatin"]')
  await uses.getByRole('button', { name: 'Show more for Atorvastatin' }).click()
  await expect(uses.getByRole('button', { name: 'Show less for Atorvastatin' })).toHaveAttribute('aria-expanded', 'true')
  await expect(uses.locator('.drug-info-card__text').first()).toHaveText(useText('Atorvastatin'))
  await expect.poll(() => routeState(page).facts).toBe('uses,warnings,pricing,pregnancy')
  expect(providers.requests.some(url => url.includes('/event.json'))).toBe(false)
  await page.reload()
  await expect(factCard(page, 'warnings')).toContainText('Fixture warning for Atorvastatin')
  await expect(factCard(page, 'warnings')).toContainText('Cached public data')
})

test('provider failures preserve the workspace and retry fills the same fact card', async ({ page }) => {
  const providers = await publicFixtures(page)
  providers.fail = true
  await page.goto('/drugs/explore?drugs=atorvastatin&facts=warnings')
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  const warnings = factCard(page, 'warnings')
  const id = await warnings.getAttribute('id')
  await expect(warnings).toContainText(/public.*unavailable|unavailable.*public/i)
  await expect(page.getByTestId('explorer-selected')).toContainText('Atorvastatin')
  providers.fail = false
  await page.getByTestId('explorer-retry').click()
  await expect(warnings).toContainText('Fixture warning for Atorvastatin')
  await expect(warnings).toHaveAttribute('id', id!)
})

test('mobile selection works by keyboard and the four-drug limit stays visible', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/drugs/explore')
  const search = page.getByRole('searchbox', { name: 'Search explorer medications' })
  await search.fill('Atorvastatin')
  await search.press('Enter')
  const add = page.getByRole('button', { name: 'Add Atorvastatin', exact: true })
  await add.focus()
  await add.press('Enter')
  await expect(page.getByTestId('explorer-selected')).toContainText('Atorvastatin')
  await page.getByTestId('explorer-add-uses').focus()
  await page.getByTestId('explorer-add-uses').press('Enter')
  await expect(factCard(page, 'uses')).toBeFocused()
  await page.goto('/drugs/explore?drugs=atorvastatin,rosuvastatin,metformin,lisinopril&facts=uses,warnings')
  await expect(page.getByTestId('explorer-selected').locator('li')).toHaveCount(4)
  await expect(page.getByText('The workspace holds 4 medications. Remove one to add another.')).toBeVisible()
  for (const width of [320, 390, 900, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    await expect(page.getByRole('table', { name: 'Medication comparison report', exact: true }).getByRole('columnheader')).toHaveCount(5)
    if (width <= 390) {
      const scroll = page.getByRole('region', { name: 'Scrollable medication comparison', exact: true })
      await expect(scroll).toHaveAttribute('tabindex', '0')
      expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
    }
  }
  await search.fill('Sertraline')
  await search.press('Enter')
  await expect(page.getByRole('button', { name: 'Add Sertraline', exact: true })).toBeDisabled()
})
