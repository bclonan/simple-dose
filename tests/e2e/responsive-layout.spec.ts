import { expect, test, type Locator, type Page } from '@playwright/test'

const expectNoPageOverflow = async (page: Page): Promise<void> => {
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual((page.viewportSize()?.width ?? 0) + 1)
}

const expectClearOfBadge = async (page: Page, action: Locator): Promise<void> => {
  await expect(action).toBeVisible()
  const actionBox = await action.boundingBox()
  const badgeBox = await page.getByTestId('webmcp-badge').boundingBox()
  expect(actionBox).not.toBeNull()
  expect(badgeBox).not.toBeNull()
  if (!actionBox || !badgeBox) throw new Error('Missing action or WebMCP badge geometry.')
  const clearance = Math.max(
    badgeBox.y - actionBox.y - actionBox.height,
    actionBox.y - badgeBox.y - badgeBox.height,
    badgeBox.x - actionBox.x - actionBox.width,
    actionBox.x - badgeBox.x - badgeBox.width,
  )
  expect(clearance).toBeGreaterThanOrEqual(8)
  expect(actionBox.x).toBeGreaterThanOrEqual(0)
  expect(actionBox.y).toBeGreaterThanOrEqual(0)
  expect(actionBox.x + actionBox.width).toBeLessThanOrEqual(page.viewportSize()!.width)
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(page.viewportSize()!.height)
  expect(await action.evaluate(element => {
    const box = element.getBoundingClientRect()
    const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
    return target === element || Boolean(target && element.contains(target))
  })).toBe(true)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
})

test('the exact comparison table scrolls inside a narrow page and keeps selection accessible', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/medications/atorvastatin')
  await expect(page.getByTestId('add-selected-to-cart')).toBeAttached()
  await page.goto('/compare')
  const table = page.locator('.comparison-table-wrap')
  await expect(table).toBeVisible()
  await expect(page.getByRole('table', { name: 'Exact medication fulfillment comparison' })).toBeVisible()

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expectNoPageOverflow(page)
    const widths = await table.evaluate(element => ({ content: element.scrollWidth, viewport: element.clientWidth }))
    expect(widths.content).toBeGreaterThan(widths.viewport)
    await table.evaluate(element => { element.scrollLeft = element.scrollWidth })
    await expectNoPageOverflow(page)
  }

  const option = table.locator('tbody tr').first()
  const select = option.getByRole('button', { name: 'Select', exact: true })
  await select.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }))
  await select.click()
  await expect(option.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expectNoPageOverflow(page)
})

for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }, { width: 320, height: 720 }]) {
  test(`detail actions stay clear of the WebMCP badge at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/medications/atorvastatin')
    const actions = page.locator('.sticky-actions')
    const add = page.getByTestId('add-selected-to-cart')
    await expect(add).toBeAttached()
    if (viewport.width > 660) {
      await expectClearOfBadge(page, add)
      await page.evaluate(() => window.scrollBy({ top: 350, behavior: 'instant' }))
      await expectClearOfBadge(page, add)
    }
    await actions.evaluate(element => element.scrollIntoView({ block: 'end', behavior: 'instant' }))
    for (const action of await actions.getByRole('button').all()) await expectClearOfBadge(page, action)
    await expectNoPageOverflow(page)
    await add.click()
    const cart = page.getByTestId('cart-drawer')
    await expect(cart.getByRole('dialog')).toBeVisible()
    await cart.getByRole('dialog').getByRole('button', { name: 'Close cart', exact: true }).click()
    await page.getByTestId('webmcp-badge').click()
    await expect(page.getByTestId('webmcp-drawer').getByRole('dialog')).toBeVisible()
  })
}
