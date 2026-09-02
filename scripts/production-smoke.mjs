import { chromium, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const origin = new URL(process.argv[2] ?? 'https://cleardose-webmcp-demo.netlify.app').origin
const routes = ['/', '/medications', '/medications/atorvastatin', '/drugs/explore?drugs=atorvastatin,rosuvastatin&facts=uses,side-effects,warnings,pricing', '/compare', '/prescription-card', '/checkout', '/webmcp']
const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
// Route/render smoke is deterministic. Real-provider WebMCP checks run separately.
await context.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
const page = await context.newPage()
const errors = []
page.on('pageerror', error => errors.push(error.message))
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
page.on('response', response => {
  if (response.url().startsWith(origin) && response.status() >= 400) errors.push(`${response.status()} ${response.url()}`)
})
await mkdir('test-results/production', { recursive: true })
try {
  for (const route of routes) {
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
    if (response?.status() !== 200) throw new Error(`Route failed: ${route}`)
    await page.locator('#main-content').waitFor({ state: 'visible' })
    const title = await page.locator('h1').first().innerText()
    if (!title.trim()) throw new Error(`Missing route heading: ${route}`)
    console.log(JSON.stringify({ route, status: response.status(), title }))
  }
  await page.goto(`${origin}/medications/atorvastatin`, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  await page.screenshot({ path: 'test-results/production/medication-desktop.png', fullPage: true })
  await page.goto(`${origin}/drugs/explore?drugs=atorvastatin,rosuvastatin&facts=uses,side-effects,warnings,pricing`, { waitUntil: 'networkidle' })
  await page.reload({ waitUntil: 'networkidle' })
  if (await page.getByTestId('drug-info-card').count() !== 4) throw new Error('Explorer deep link did not restore four fact cards.')
  await page.screenshot({ path: 'test-results/production/explorer-desktop.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  for (const route of routes) {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)
    if (overflow) throw new Error(`Mobile horizontal overflow: ${route}`)
  }
  await page.screenshot({ path: 'test-results/production/agent-lab-mobile.png', fullPage: true })
  await page.goto(`${origin}/drugs/explore?drugs=atorvastatin,rosuvastatin&facts=uses,warnings`, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'test-results/production/explorer-mobile.png', fullPage: true })
  if (errors.length) throw new Error(JSON.stringify(errors))
  console.log(JSON.stringify({ result: 'passed', desktopRoutes: routes.length, mobileRoutes: routes.length, nestedRefresh: true, consoleErrors: errors }))
  if (process.argv.includes('--live-explorer')) {
    // Opt-in integration check. No fixtures, saved identities, or cached searches.
    const liveContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const livePage = await liveContext.newPage()
    const liveErrors = []
    livePage.on('pageerror', error => liveErrors.push(error.message))
    const sharedUrl = `${origin}/drugs/explore?drugs=metformin,public-empagliflozin&facts=side-effects,pricing`
    await livePage.goto(sharedUrl)
    await expect(livePage.getByTestId('drug-info-card')).toHaveCount(2, { timeout: 45000 })
    await expect(livePage.getByTestId('explorer-selected')).toContainText('Empagliflozin')
    await expect(livePage.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false', { timeout: 45000 })
    await livePage.reload()
    await expect(livePage.getByTestId('drug-info-card')).toHaveCount(2, { timeout: 45000 })
    await expect(livePage.getByTestId('explorer-selected')).toContainText('Empagliflozin')
    console.log(JSON.stringify({ liveExplorer: 'restored', freshPublicSlug: true, reload: true }))
    await livePage.getByTestId('explorer-data-mode').selectOption('demo')
    await livePage.reload()
    await expect(livePage.getByTestId('explorer-message')).toContainText(/No exact match|public-only record/, { timeout: 15000 })
    await livePage.getByTestId('explorer-data-mode').selectOption('hybrid')
    await expect(livePage.getByTestId('drug-info-card')).toHaveCount(2, { timeout: 45000 })
    await expect(livePage.getByTestId('explorer-cards')).toHaveAttribute('aria-busy', 'false', { timeout: 45000 })
    if (liveErrors.length) throw new Error(JSON.stringify(liveErrors))
    await livePage.screenshot({ path: 'test-results/production/explorer-live.png', fullPage: true })
    console.log(JSON.stringify({ liveExplorer: 'passed', freshPublicSlug: true, reload: true, modeRecovery: true, pageErrors: liveErrors }))
    await liveContext.close()
  }
} finally {
  await browser.close()
}
