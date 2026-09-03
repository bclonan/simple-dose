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
  configuration: { strength: string; quantity: number },
): Promise<void> {
  await page.goto(`/medications/${medicationSlug}`)
  const strength = page.getByTestId(`strength-${configuration.strength.replaceAll(' ', '-')}`)
  const quantity = page.getByTestId(`quantity-${configuration.quantity}`)
  await strength.click()
  await quantity.click()
  await expect(strength).toHaveAttribute('aria-pressed', 'true')
  await expect(quantity).toHaveAttribute('aria-pressed', 'true')
  const offer = page.getByTestId(offerTestId)
  await offer.getByRole('button', { name: 'Select option' }).click()
  await expect(offer.getByRole('button', { name: 'Selected', exact: true })).toBeVisible()
  await expect(page).toHaveURL(new RegExp(`/medications/${medicationSlug}$`))
  await page.getByTestId('add-selected-to-cart').click()
  await expect(page.getByTestId('cart-drawer')).toBeVisible()
}

test('two medications keep independent lines, aggregate savings, and one order total', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await addSelectedOffer(
    page,
    'atorvastatin',
    'offer-offer-atorvastatin-10-30-partnerrx:express',
    { strength: '10 mg', quantity: 30 },
  )
  await page.getByTestId('cart-drawer').getByRole('dialog').getByRole('button', { name: 'Close cart' }).click()

  await addSelectedOffer(
    page,
    'metformin',
    'offer-offer-metformin-500-30-communityrx:pickup',
    { strength: '500 mg', quantity: 30 },
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
  await page.getByRole('dialog', { name: 'Review demo replay' }).getByRole('button', { name: 'Start demo replay' }).click()
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

  await drawer.getByRole('dialog').getByRole('button', { name: 'Close WebMCP activity' }).click()
  await expect(page).toHaveURL(/\/compare$/)
  await expect(page.locator('.comparison-identity')).toContainText('Atorvastatin')
  await expect(page.locator('.comparison-identity')).toContainText('20 mg')
  await expect(page.locator('.comparison-identity')).toContainText('90 count')
  await page.reload()
  await page.getByTestId('webmcp-badge').click()
  await expect(page.getByTestId('webmcp-drawer').getByTestId('webmcp-journey')).toHaveCount(2)
  expect(runtimeErrors).toEqual([])
})

test('checkout calls are redacted in the log and cannot be replayed', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await page.addInitScript(() => {
    type TestTool = { name: string; execute: (input: unknown) => Promise<unknown> }
    const tools = new Map<string, TestTool>()
    Object.defineProperty(document, 'modelContext', { configurable: true, value: {
      registerTool(tool: TestTool, options: { signal: AbortSignal }) {
        tools.set(tool.name, tool)
        options.signal.addEventListener('abort', () => { if (tools.get(tool.name) === tool) tools.delete(tool.name) }, { once: true })
      },
      getTools: async () => [...tools.values()].map(({ execute: _execute, ...tool }) => tool),
      executeTool: async (tool: { name: string }, input: string) => {
        const current = tools.get(tool.name)
        if (!current) throw new Error('Tool unavailable')
        return JSON.stringify(await current.execute(JSON.parse(input)))
      },
    } })
  })

  await addSelectedOffer(
    page,
    'atorvastatin',
    'offer-offer-atorvastatin-10-30-cleardose:standard',
    { strength: '10 mg', quantity: 30 },
  )
  await page.getByTestId('cart-drawer').getByRole('dialog').getByRole('button', { name: 'Close cart' }).click()
  // Invoke the registered checkout handler with explicit fictional test input.
  // Documentation shortcuts intentionally no longer execute this consequential action.
  await page.evaluate(async () => {
    const context = (document as unknown as { modelContext: { executeTool(tool: { name: string }, input: string): Promise<unknown> } }).modelContext
    await context.executeTool({ name: 'checkout_demo_order' }, JSON.stringify({
      fullName: 'Demo User',
      address: { line1: '100 Demo Street', city: 'Baltimore', state: 'MD', postalCode: '21201' },
      prescriptionStatus: 'provider-will-send',
    }))
  })
  await expect(page).toHaveURL(/\/orders\/CD-\d{4}-\d{4}$/)

  await page.getByTestId('webmcp-badge').click()
  const drawer = page.getByTestId('webmcp-drawer')
  const checkoutJourney = drawer.getByTestId('webmcp-journey').filter({
    has: page.getByText('checkout_demo_order', { exact: true }),
  })
  await expect(checkoutJourney).toHaveCount(1)
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
