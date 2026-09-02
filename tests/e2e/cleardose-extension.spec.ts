import { expect, test, type Page } from '@playwright/test'

function captureRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function addSelectedOffer(
  page: Page,
  medicationSlug: string,
  offerTestId: string,
): Promise<void> {
  await page.goto(`/medications/${medicationSlug}`)
  const offer = page.getByTestId(offerTestId)
  await offer.getByRole('button', { name: 'Select option' }).click()
  await page.getByTestId('add-selected-to-cart').click()
  await expect(page.getByTestId('cart-drawer')).toBeVisible()
}

test('two medications keep independent lines, aggregate savings, and one order total', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await addSelectedOffer(
    page,
    'atorvastatin',
    'offer-offer-atorvastatin-10-30-partnerrx:express',
  )
  await page.getByRole('button', { name: 'Close cart' }).click()

  await addSelectedOffer(
    page,
    'metformin',
    'offer-offer-metformin-500-30-communityrx:pickup',
  )

  const drawer = page.getByTestId('cart-drawer')
  await expect(drawer.locator('.cart-line')).toHaveCount(2)
  await expect(drawer.getByRole('heading', { name: 'Atorvastatin' })).toBeVisible()
  await expect(drawer.getByRole('heading', { name: 'Metformin' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open cart, 2 items' })).toBeAttached()

  const savings = page.getByTestId('cart-savings')
  await expect(savings).toBeVisible()
  await expect(page.getByTestId('cart-current-total')).toHaveText('$31.75')
  await expect(page.getByTestId('cart-optimized-total')).toHaveText('$25.75')
  await expect(page.getByTestId('cart-potential-savings')).toHaveText('$6.00')
  await expect(savings).toContainText('not retail or insurance savings')

  await drawer.getByRole('link', { name: 'Go to checkout' }).click()
  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.locator('.checkout-line')).toHaveCount(2)
  await expect(page.getByTestId('checkout-total')).toHaveText('$31.75')

  await page.getByLabel('Full name').fill('Demo User')
  await page.getByLabel('Address', { exact: true }).fill('100 Demo Street')
  await page.getByLabel('City').fill('Baltimore')
  await page.getByLabel('State').fill('MD')
  await page.getByLabel('ZIP').fill('21201')
  await page.getByTestId('place-order').click()

  await expect(page).toHaveURL(/\/orders\/CD-\d{4}-\d{4}$/)
  await expect(page.getByText(/Atorvastatin · 10 mg tablet · 30 count/)).toBeVisible()
  await expect(page.getByText(/Metformin · 500 mg tablet · 30 count/)).toBeVisible()
  await expect(page.getByText('$31.75', { exact: true })).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('the floating WebMCP panel replays a reviewed journey and keeps its context after reload', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await page.goto('/webmcp')
  await page
    .getByTestId('prompt-find-compare')
    .getByRole('button', { name: 'Replay demo' })
    .click()
  await expect(page.getByTestId('demo-replay').getByText('complete', { exact: true })).toBeVisible({
    timeout: 10_000,
  })

  await page.getByTestId('webmcp-badge').click()
  const drawer = page.getByTestId('webmcp-drawer')
  await expect(drawer).toBeVisible()
  const originalJourney = drawer.getByTestId('webmcp-journey').filter({
    has: page.getByRole('heading', { name: 'Find + compare' }),
  })
  await expect(originalJourney).toBeVisible()
  await expect(originalJourney).toContainText('3 calls')

  await originalJourney.getByRole('button', { name: 'Inspect calls' }).click()
  await expect(originalJourney).toContainText('Recorded state before')
  await expect(originalJourney).toContainText('Recorded state after')
  await expect(originalJourney).toContainText('compare_fulfillment_options')

  await originalJourney.getByRole('button', { name: 'Review replay' }).click()
  const confirmation = drawer.getByTestId('replay-confirmation')
  await expect(confirmation).toContainText('Run these 3 calls again?')
  await confirmation.getByTestId('confirm-journey-replay').click()
  await expect(
    drawer.getByTestId('webmcp-journey').filter({
      has: page.getByRole('heading', { name: 'Replay: Find + compare' }),
    }),
  ).toBeVisible({ timeout: 10_000 })

  await drawer.getByTestId('webmcp-calls-tab').click()
  await expect(drawer.locator('.tool-log-entry')).toHaveCount(6)
  await expect(drawer).toContainText('Inspect redacted context')

  await drawer.getByRole('button', { name: 'Close WebMCP activity' }).click()
  await page.reload()
  await page.getByTestId('webmcp-badge').click()
  await expect(page.getByTestId('webmcp-drawer').getByTestId('webmcp-journey')).toHaveCount(2)
  expect(runtimeErrors).toEqual([])
})

test('checkout calls are redacted in the log and cannot be replayed', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await addSelectedOffer(
    page,
    'atorvastatin',
    'offer-offer-atorvastatin-10-30-cleardose:standard',
  )
  await page.getByRole('button', { name: 'Close cart' }).click()
  await page.goto('/webmcp')

  const checkoutTool = page.getByTestId('tool-card-checkout_demo_order')
  await checkoutTool.getByRole('button', { name: 'Run example' }).click()
  await expect(checkoutTool.getByRole('button', { name: 'Run example' })).toBeEnabled()

  await page.getByTestId('webmcp-badge').click()
  const drawer = page.getByTestId('webmcp-drawer')
  const checkoutJourney = drawer.getByTestId('webmcp-journey').filter({
    has: page.getByRole('heading', { name: 'Demo checkout' }),
  })
  await expect(checkoutJourney).toBeVisible()
  await expect(checkoutJourney).toContainText('Checkout stays human-controlled')
  await expect(checkoutJourney.getByRole('button', { name: 'Review replay' })).toBeDisabled()

  await drawer.getByTestId('webmcp-calls-tab').click()
  await expect(drawer).toContainText('[redacted]')
  await expect(drawer).not.toContainText('Demo User')
  await expect(drawer).not.toContainText('100 Demo Street')
  await expect(drawer).not.toContainText('21201')
  expect(runtimeErrors).toEqual([])
})
