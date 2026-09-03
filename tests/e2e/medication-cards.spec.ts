import { expect, test } from '@playwright/test'

test('public medication cards keep badges, long names, prices, and links readable at narrow widths', async ({ page }) => {
  await page.addInitScript(() => {
    const records = [
      { id: 'med-public-atorvastatin-calcium', slug: 'public-atorvastatin-calcium', genericName: 'ATORVASTATIN CALCIUM', brandNames: ['Atorvastatin Calcium', 'ATORVASTATIN CALCIUM', 'Lipitor', 'LIPITOR'], forms: ['TABLET, FILM COATED', 'TABLET', 'tablet'], strengths: ['10 mg/1', '20 mg/1', '40 mg/1', '80 mg/1'] },
      { id: 'med-public-long-combination', slug: 'public-long-combination', genericName: 'acetaminophen / dextromethorphan hydrobromide / doxylamine succinate', brandNames: [], forms: ['SOLUTION FOR ORAL ADMINISTRATION'], strengths: ['650 mg/30 mL', '20 mg/30 mL', '12.5 mg/30 mL'] },
      { id: 'med-public-missing-attributes', slug: 'public-missing-attributes', genericName: 'Example with missing source attributes', brandNames: [], forms: [], strengths: [] },
    ].map(record => ({ ...record, category: 'other-medications', rxRequired: false, displaySummary: '', publicOnly: true, publicSource: 'openfda-ndc', quantityOptions: [], searchTerms: [] }))
    localStorage.setItem('cleardose:data-mode', JSON.stringify('live'))
    localStorage.setItem('cleardose:public-identities-v1', JSON.stringify(records))
  })
  await page.route(/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//, route => route.fulfill({
    status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Fixture providers unavailable' }),
  }))
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/medications')
  const cards = page.locator('.medication-card')
  await expect(cards).toHaveCount(3)
  await expect(cards.first().getByRole('heading', { name: 'Atorvastatin Calcium', exact: true })).toBeVisible()
  await expect(cards.first().locator('.medication-card__brand')).toHaveText('Listed brands: Lipitor')
  await expect(cards.first().locator('.medication-card__category')).toHaveText('Other medications')
  await expect(cards.first().locator('.medication-card__price')).toContainText('Demo price from')
  await expect(cards.first().locator('.medication-card__price')).toContainText('Simulated fulfillment')
  await expect(cards.nth(2).locator('dd').first()).toHaveText('Not listed in source')

  const desktopHeights = await cards.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height))
  expect(Math.max(...desktopHeights) - Math.min(...desktopHeights)).toBeLessThan(2)

  for (const width of [1440, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width + 1)
    for (const card of await cards.all()) {
      const badge = card.locator('.medication-card__reference')
      const layout = await badge.evaluate(element => {
        const style = getComputedStyle(element)
        const box = element.getBoundingClientRect()
        return { font: style.fontFamily, whiteSpace: style.whiteSpace, height: box.height, left: box.left, right: box.right, scroll: element.scrollWidth, width: element.clientWidth }
      })
      expect(layout.font.toLowerCase()).not.toContain('georgia')
      expect(layout.whiteSpace).toBe('nowrap')
      expect(layout.height).toBeLessThan(36)
      expect(layout.scroll).toBeLessThanOrEqual(layout.width + 1)
      expect(layout.left).toBeGreaterThanOrEqual(0)
      expect(layout.right).toBeLessThanOrEqual(width)
      const link = card.getByRole('link', { name: 'View medication' })
      const linkBox = await link.boundingBox()
      const cardBox = await card.boundingBox()
      expect(linkBox).not.toBeNull()
      expect(cardBox).not.toBeNull()
      expect(linkBox!.x).toBeGreaterThanOrEqual(cardBox!.x)
      expect(linkBox!.x + linkBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width)
    }
  }
})
