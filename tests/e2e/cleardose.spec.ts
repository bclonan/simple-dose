import { expect, test, type Page } from '@playwright/test'

const flagship = {
  directStandard: 'comparison-offer-atorvastatin-20-90-cleardose:standard',
  healthHubStandard: 'comparison-offer-atorvastatin-20-90-healthhub:standard',
}

function captureRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

async function chooseFlagshipMedication(page: Page): Promise<void> {
  await page.getByTestId('strength-20-mg').click()
  await page.getByTestId('quantity-90').click()
  await expect(page.getByTestId('strength-20-mg')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('quantity-90')).toHaveAttribute('aria-pressed', 'true')
}

test('human purchase journey reaches a local order confirmation', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await page.goto('/')
  await expect(
    page.getByRole('heading', { name: 'Transparent prescriptions. Agent-ready.' }),
  ).toBeVisible()

  await page
    .getByRole('searchbox', { name: 'Search the ClearDose medication catalog' })
    .fill('atorvastatin')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/\/medications$/)
  await expect(page.getByText('1 match for "atorvastatin"')).toBeVisible()

  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page).toHaveURL(/\/medications\/atorvastatin$/)
  await expect(page.getByRole('heading', { name: 'Atorvastatin', exact: true, level: 1 })).toBeVisible()
  await chooseFlagshipMedication(page)

  await page.getByRole('button', { name: 'Compare all options' }).click()
  await expect(page).toHaveURL(/\/compare$/)
  await expect(page.getByText('20 mg', { exact: true })).toBeVisible()
  await expect(page.getByText('90 count', { exact: true })).toBeVisible()

  const selectedRow = page.getByTestId(flagship.directStandard)
  await expect(selectedRow.getByText('Lowest total')).toBeVisible()
  await selectedRow.getByRole('button', { name: 'Select', exact: true }).click()
  await expect(selectedRow.getByRole('button', { name: 'Selected' })).toBeVisible()

  await page.getByRole('link', { name: 'Prepare prescription request' }).click()
  await page.getByTestId('generate-request').click()
  const requestCard = page.getByTestId('prescription-request-card')
  await expect(requestCard).toBeVisible()
  await expect(requestCard).toContainText('Atorvastatin')
  await expect(requestCard).toContainText('20 mg')
  await expect(requestCard).toContainText('90')

  await page.getByTestId('prescription-add-cart').click()
  const cartDrawer = page.getByTestId('cart-drawer')
  await expect(cartDrawer).toBeVisible()
  await expect(cartDrawer).toContainText('Medication added to your cart.')
  await cartDrawer.getByRole('link', { name: 'Go to checkout' }).click()

  await expect(page).toHaveURL(/\/checkout$/)
  await expect(page.getByTestId('checkout-total')).toHaveText('$17.80')
  await page.getByRole('radio', { name: /Express delivery/ }).check()
  await expect(page.getByTestId('checkout-total')).toHaveText('$21.80')

  await page.getByLabel('Full name').fill('Demo User')
  await page.getByLabel('Address', { exact: true }).fill('100 Demo Street')
  await page.getByLabel('City').fill('Baltimore')
  await page.getByLabel('State').fill('MD')
  await page.getByLabel('ZIP').fill('21201')
  await page.getByTestId('place-order').click()

  await expect(page).toHaveURL(/\/orders\/CD-\d{4}-\d{4}$/)
  await expect(page.getByRole('heading', { name: /Order CD-\d{4}-\d{4}/ })).toBeVisible()
  await expect(page.getByText('Demo order created', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('Express delivery', { exact: true })).toBeVisible()
  await expect(page.getByText('$21.80', { exact: true })).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('Agent Lab copies a prompt, replays real actions, and clears its log', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await page.goto('/webmcp')
  await expect(
    page.getByRole('heading', { name: 'See exactly what an agent can do inside ClearDose.' }),
  ).toBeVisible()
  await expect(page.locator('[data-testid^="tool-card-"]')).toHaveCount(20)
  await expect(page.getByRole('heading', { name: 'When WebMCP earns a place' })).toBeVisible()

  const promptCard = page.getByTestId('prompt-find-compare')
  await promptCard.getByRole('button', { name: 'Copy prompt' }).click()
  await expect(page.getByText('Prompt copied.')).toBeVisible()
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain('Find atorvastatin 20 mg tablets, quantity 90.')

  await promptCard.getByRole('button', { name: 'Replay demo' }).click()
  await page.getByRole('dialog', { name: 'Review demo replay' }).getByRole('button', { name: 'Start demo replay' }).click()
  const replay = page.getByTestId('demo-replay')
  await expect(replay).toBeVisible()
  await expect(replay.getByText('complete', { exact: true })).toBeVisible({ timeout: 10_000 })
  await expect(replay.getByText('search_medications', { exact: true })).toBeVisible()
  await expect(replay.getByText('compare_fulfillment_options', { exact: true })).toBeVisible()

  const activityLog = page.locator('.tool-log')
  await expect(activityLog.locator('.tool-log-entry')).toHaveCount(3)
  await activityLog.getByRole('button', { name: 'Clear log' }).click()
  await expect(activityLog.locator('.tool-log-entry')).toHaveCount(0)
  await expect(activityLog.getByText('No matching tool activity yet.')).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('market update changes prices and recomputes the lowest-total option', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)

  await page.goto('/medications/atorvastatin')
  await chooseFlagshipMedication(page)
  await page.getByRole('button', { name: 'Compare all options' }).click()

  const direct = page.getByTestId(flagship.directStandard)
  const healthHub = page.getByTestId(flagship.healthHubStandard)
  await expect(direct.getByText('Lowest total')).toBeVisible()
  await expect(direct.locator('.comparison-table__total')).toHaveText('$17.80')
  const priorHealthHubTotal = await healthHub.locator('.comparison-table__total').innerText()

  await page.getByTestId('scenario-market-update').click()
  await expect(page.getByText('Prices updated · Aug 31, 2026 · Demo scenario')).toBeVisible()
  await expect(healthHub.locator('.comparison-table__total')).not.toHaveText(priorHealthHubTotal)
  await expect(healthHub.locator('.comparison-table__total')).toHaveText('$16.15')
  await expect(healthHub.getByText('Lowest total')).toBeVisible()
  await expect(direct.getByText('Lowest total')).toHaveCount(0)
  expect(runtimeErrors).toEqual([])
})

test('the app remains usable when WebMCP is unavailable', async ({ page }) => {
  const runtimeErrors = captureRuntimeErrors(page)
  await page.addInitScript(() => {
    Object.defineProperty(document, 'modelContext', {
      configurable: true,
      value: undefined,
    })
  })

  await page.goto('/webmcp')
  await expect(page.getByText('WebMCP unavailable in this browser', { exact: true })).toBeVisible()
  await expect(page.getByText('The ClearDose site remains fully functional.')).toBeVisible()
  await expect(page.locator('[data-testid^="tool-card-"]')).toHaveCount(20)

  await page.getByRole('link', { name: 'ClearDose home' }).click()
  await page
    .getByRole('searchbox', { name: 'Search the ClearDose medication catalog' })
    .fill('metformin')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page).toHaveURL(/\/medications$/)
  await expect(page.getByText('1 match for "metformin"')).toBeVisible()
  await page.getByRole('link', { name: 'View medication' }).click()
  await expect(page.getByRole('heading', { name: 'Metformin', exact: true, level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fulfillment options' })).toBeVisible()
  expect(runtimeErrors).toEqual([])
})
