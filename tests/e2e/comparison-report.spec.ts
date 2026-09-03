import { readFile } from 'node:fs/promises'
import { expect, test, type Page } from '@playwright/test'

const drugs = [
  { name: 'Metformin', brand: 'Glucophage', id: 'med-metformin', rxcui: '55001', ndc: '54321-0501-01', spl: 'c1111111-1111-4111-8111-111111111111', strength: '500 mg' },
  { name: 'Empagliflozin', brand: 'Jardiance', id: 'med-public-empagliflozin', rxcui: '55002', ndc: '54321-0502-01', spl: 'd2222222-2222-4222-8222-222222222222', strength: '10 mg' },
]
const unsafeSourceText = '<script>window.reportSourceExecuted = true</script>'
const fullUseText = (name: string) => `Fixture use for ${name}. This is test text, not clinical guidance. `.repeat(20)
  + `Complete final source sentence for ${name}. ${unsafeSourceText}`
const report = (page: Page) => page.getByRole('table', { name: 'Medication comparison report', exact: true })
const factRow = (page: Page, fact: string) => page.locator(`[data-testid="drug-info-card"][data-fact-type="${fact}"]`)

async function publicReportFixtures(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('live')))
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, async route => {
    const url = new URL(route.request().url())
    let body: unknown
    if (url.hostname === 'rxnav.nlm.nih.gov') {
      const query = (url.searchParams.get('name') ?? '').toLowerCase()
      const match = drugs.find(drug => [drug.name, drug.brand].some(name => name.toLowerCase() === query))
      body = url.pathname.includes('approximateTerm') ? { approximateGroup: { candidate: [] } }
        : url.pathname.includes('properties.json') ? { properties: { name: drugs.find(drug => url.pathname.includes(drug.rxcui))?.name } }
          : { idGroup: { rxnormId: match ? [match.rxcui] : [] } }
    } else if (url.hostname === 'api.fda.gov') {
      const query = (url.searchParams.get('search') ?? '').toLowerCase()
      const matches = drugs.filter(drug => [drug.name, drug.brand, drug.rxcui, drug.ndc.slice(0, -3), drug.spl].some(value => query.includes(value.toLowerCase())))
      body = { results: matches.map(drug => url.pathname.includes('/label.json') ? {
        id: `report-label-${drug.rxcui}`, set_id: drug.spl, effective_time: '20260901',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], product_ndc: [drug.ndc.slice(0, -3)] },
        indications_and_usage: [fullUseText(drug.name)],
        adverse_reactions: [`Fixture side effects for ${drug.name}. Not clinical guidance.`],
        warnings: [`Fixture warning for ${drug.name}. Not clinical guidance.`],
        drug_interactions: [`Fixture interaction label for ${drug.name}. Not a pairwise check.`],
      } : {
        product_ndc: drug.ndc.slice(0, -3), generic_name: drug.name, brand_name: drug.brand,
        dosage_form: 'TABLET', route: ['ORAL'], labeler_name: 'Comparison report fixture labeler',
        active_ingredients: [{ name: drug.name.toUpperCase(), strength: drug.strength }],
        packaging: [{ package_ndc: drug.ndc }], marketing_category: 'NDA', application_number: 'NDA000001',
        openfda: { generic_name: [drug.name], brand_name: [drug.brand], rxcui: [drug.rxcui], spl_set_id: [drug.spl] },
      }) }
    } else if (url.pathname.includes('/metastore/')) {
      body = [{ identifier: 'comparison-report-nadac-fixture', title: `NADAC (National Average Drug Acquisition Cost) ${new Date().getFullYear()}` }]
    } else {
      const requested = [...url.searchParams.entries()].filter(([key]) => key.startsWith('conditions[0][value]')).map(([, value]) => value)
      body = { results: drugs.filter(drug => requested.includes(drug.ndc.replaceAll('-', ''))).map((drug, index) => ({
        ndc: drug.ndc.replaceAll('-', ''), nadac_per_unit: index ? '0.25' : '0.125', pricing_unit: 'EA', effective_date: '2026-09-01', as_of_date: '2026-09-02',
      })) }
    }
    await route.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  })
}

test('the report builder uses aligned medication columns and highlights differences without ranking drugs', async ({ page }) => {
  await publicReportFixtures(page)
  await page.goto('/drugs/explore?drugs=metformin,public-empagliflozin')
  await expect(page.getByTestId('explorer-selected').locator('li')).toHaveCount(2)
  await page.getByRole('button', { name: 'Build comparison report', exact: true }).click()
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(report(page)).toBeVisible()
  await expect(report(page).getByRole('columnheader')).toHaveCount(3)
  await expect(report(page).getByRole('columnheader', { name: /Metformin/ })).toContainText('Glucophage')
  await expect(report(page).getByRole('columnheader', { name: /Empagliflozin/ })).toContainText('Jardiance')
  const selectedFacts = ['uses', 'side-effects', 'warnings', 'interactions', 'pricing']
  await expect(page.getByTestId('drug-info-card')).toHaveCount(selectedFacts.length)
  for (const fact of selectedFacts) {
    const row = factRow(page, fact)
    expect(await row.evaluate(element => element.tagName)).toBe('TR')
    await expect(row.getByRole('rowheader')).toHaveCount(1)
    await expect(row.getByRole('cell')).toHaveCount(2)
    expect(await row.getByRole('cell').evaluateAll(elements => elements.map(element =>
      (element.getAttribute('headers') ?? '').split(/\s+/).filter(Boolean).map(id => document.getElementById(id)?.tagName),
    ))).toEqual([['TH', 'TH'], ['TH', 'TH']])
    expect(await row.locator('[data-drug-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-drug-id')))).toEqual(drugs.map(drug => drug.id))
  }
  await expect(factRow(page, 'side-effects')).toHaveAttribute('data-comparison', 'different')
  await expect(factRow(page, 'side-effects')).toContainText('Different source details')
  const highlight = page.getByRole('checkbox', { name: 'Highlight differences', exact: true })
  await expect(highlight).toBeChecked()
  await expect(factRow(page, 'side-effects')).toHaveClass(/is-highlighted/)
  const rowIds = await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))
  await highlight.uncheck()
  await expect(factRow(page, 'side-effects')).not.toHaveClass(/is-highlighted/)
  expect(await page.getByTestId('drug-info-card').evaluateAll(elements => elements.map(element => element.id))).toEqual(rowIds)
  await expect(factRow(page, 'interactions')).toContainText('not a complete pairwise interaction check')
  await expect(factRow(page, 'pricing')).toContainText('not a retail cash price')
  await expect(report(page)).not.toContainText(/safest medication|best medication|recommended winner/i)
  expect(new URL(page.url()).searchParams.get('facts')).toBe(selectedFacts.join(','))
  await page.reload()
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(page.getByTestId('drug-info-card')).toHaveCount(5)
  await expect(report(page).getByRole('columnheader', { name: /Empagliflozin/ })).toBeVisible()
})

test('four-drug reports remain side by side with keyboard-accessible scrolling on small screens', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
  await page.goto('/drugs/explore?drugs=atorvastatin,rosuvastatin,metformin,lisinopril&facts=uses,warnings')
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  const scroll = page.getByRole('region', { name: 'Scrollable medication comparison', exact: true })
  await expect(scroll).toHaveAttribute('tabindex', '0')
  for (const width of [1440, 900, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    await expect(report(page).getByRole('columnheader')).toHaveCount(5)
    const positions = await factRow(page, 'uses').getByRole('cell').evaluateAll(elements => elements.map(element => {
      const bounds = element.getBoundingClientRect()
      return { top: bounds.top, left: bounds.left }
    }))
    expect(positions).toHaveLength(4)
    expect(positions.every(position => Math.abs(position.top - positions[0]!.top) < 1)).toBe(true)
    expect(positions.every((position, index) => index === 0 || position.left > positions[index - 1]!.left)).toBe(true)
    if (width <= 390) expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true)
  }
  await scroll.focus()
  await expect(scroll).toBeFocused()
  const start = await scroll.evaluate(element => element.scrollLeft)
  await scroll.press('ArrowRight')
  await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(start)
})

test('download and print require a visible action and retain source context without executing provider text', async ({ page }) => {
  await publicReportFixtures(page)
  await page.addInitScript(() => {
    const state = window as unknown as Window & { comparisonPrintCalls: number }
    state.comparisonPrintCalls = 0
    Object.defineProperty(window, 'print', { configurable: true, value: () => { state.comparisonPrintCalls += 1 } })
  })
  let downloads = 0
  page.on('download', () => { downloads += 1 })
  await page.goto('/drugs/explore?drugs=metformin,public-empagliflozin&facts=uses,side-effects,pricing')
  await expect(page.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false')
  await expect(factRow(page, 'uses')).toContainText('Fixture use for Metformin')
  expect(downloads).toBe(0)
  expect(await page.evaluate(() => (window as unknown as Window & { comparisonPrintCalls: number }).comparisonPrintCalls)).toBe(0)
  const pendingDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download report', exact: true }).click()
  const download = await pendingDownload
  expect(download.suggestedFilename()).toMatch(/^cleardose-comparison-\d{4}-\d{2}-\d{2}\.html$/)
  const path = await download.path()
  expect(path).not.toBeNull()
  const html = await readFile(path!, 'utf8')
  expect(downloads).toBe(1)
  expect(html).toContain('<table')
  expect(html).toContain('Metformin')
  expect(html).toContain('Empagliflozin')
  expect(html).toContain('CMS Medicaid NADAC')
  expect(html).toContain('FDA drug label')
  expect(html).toContain('Sep 1, 2026')
  expect(html).toContain('not a retail cash price')
  expect(html).toContain('Complete final source sentence for Metformin.')
  expect(html).toContain('Complete final source sentence for Empagliflozin.')
  expect(html).toContain('&lt;script&gt;window.reportSourceExecuted = true&lt;/script&gt;')
  expect(html).not.toContain(unsafeSourceText)
  expect(await page.evaluate(() => Object.hasOwn(window, 'reportSourceExecuted'))).toBe(false)
  await page.getByRole('button', { name: 'Print or save PDF', exact: true }).click()
  expect(await page.evaluate(() => (window as unknown as Window & { comparisonPrintCalls: number }).comparisonPrintCalls)).toBe(1)
  await page.emulateMedia({ media: 'print' })
  await expect(report(page)).toBeVisible()
  for (const name of ['Download report', 'Print or save PDF', 'Build comparison report']) await expect(page.getByRole('button', { name, exact: true })).toBeHidden()
  await expect(factRow(page, 'uses').getByRole('combobox')).toBeHidden()
  await expect(factRow(page, 'uses').getByRole('button', { name: 'Remove Uses card', exact: true })).toBeHidden()
  await expect(report(page)).toContainText('not a retail cash price')
})
