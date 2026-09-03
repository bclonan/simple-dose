import { expect, test, type Page } from '@playwright/test'

interface DocumentationTool {
  name: string
  annotations: { readOnlyHint: boolean }
  execute(input: unknown, options?: { signal?: AbortSignal }): Promise<unknown>
}
interface DocumentationBridge {
  names(): string[]
  calls: string[]
  duplicates: string[]
  rememberHandles(): void
  changedHandles(): string[]
}
type DocumentationWindow = Window & { documentationTestWebMcp: DocumentationBridge }

async function documentationFixture(page: Page, native = true): Promise<string[]> {
  const providerRequests: string[] = []
  await page.addInitScript(() => localStorage.setItem('cleardose:data-mode', JSON.stringify('demo')))
  // Demo-mode documentation must not request providers. Observe instead of
  // intercepting every browser request, including Vite's lazy module loading.
  page.on('request', request => {
    if (/^https:\/\/(api\.fda\.gov|rxnav\.nlm\.nih\.gov|data\.medicaid\.gov)\//.test(request.url())) providerRequests.push(request.url())
  })
  if (!native) return providerRequests
  await page.addInitScript(() => {
    const definitions = new Map<string, DocumentationTool>()
    const remembered = new Map<string, DocumentationTool>()
    const events = new EventTarget()
    const calls: string[] = []
    const duplicates: string[] = []
    const context = {
      async registerTool(tool: DocumentationTool, options: { signal: AbortSignal }) {
        if (definitions.has(tool.name)) { duplicates.push(tool.name); throw new Error(`Duplicate tool ${tool.name}`) }
        if (options.signal.aborted) return
        definitions.set(tool.name, tool)
        options.signal.addEventListener('abort', () => {
          if (definitions.get(tool.name) === tool) definitions.delete(tool.name)
          events.dispatchEvent(new Event('toolchange'))
        }, { once: true })
        events.dispatchEvent(new Event('toolchange'))
      },
      async getTools() { return [...definitions.values()].map(({ execute: _execute, ...tool }) => tool) },
      async executeTool(tool: { name: string }, input: string, options?: { signal?: AbortSignal }) {
        if (typeof input !== 'string') throw new Error('Input must be JSON text.')
        const definition = definitions.get(tool.name)
        if (!definition) throw new Error('Tool unavailable')
        calls.push(tool.name)
        return JSON.stringify(await definition.execute(JSON.parse(input), options))
      },
      addEventListener: (type: string, listener: EventListener) => events.addEventListener(type, listener),
      removeEventListener: (type: string, listener: EventListener) => events.removeEventListener(type, listener),
    }
    Object.defineProperty(document, 'modelContext', { configurable: true, value: context })
    ;(window as unknown as DocumentationWindow).documentationTestWebMcp = {
      names: () => [...definitions.keys()].sort(), calls, duplicates,
      rememberHandles() { for (const [name, definition] of definitions) remembered.set(name, definition) },
      changedHandles: () => [...remembered].filter(([name, definition]) => definitions.get(name) !== definition).map(([name]) => name).sort(),
    }
  })
  return providerRequests
}

const documentedNames = (page: Page) => page.locator('[data-testid^="tool-card-"]').evaluateAll(elements => elements.map(element => element.getAttribute('data-testid')!.slice('tool-card-'.length)).sort())
const runtimeNames = (page: Page) => page.evaluate(() => (window as unknown as DocumentationWindow).documentationTestWebMcp.names())
const runtimeCalls = (page: Page) => page.evaluate(() => (window as unknown as DocumentationWindow).documentationTestWebMcp.calls)
const persistedChoices = (page: Page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.startsWith('cleardose:') && /cart|orders|selection|prescription|explorer/.test(key))))

function captureErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  return errors
}

test('documentation matches native discovery and registration survives both new routes', async ({ page }) => {
  const errors = captureErrors(page)
  await documentationFixture(page)
  await page.goto('/webmcp')
  await expect(page.getByRole('heading', { name: 'See exactly what an agent can do inside ClearDose.' })).toBeVisible()
  await expect(page.getByTestId('registered-tool-count')).toHaveText('19')
  const names = await runtimeNames(page)
  expect(await documentedNames(page)).toEqual(names)
  expect(names).toHaveLength(19)
  await page.evaluate(() => (window as unknown as DocumentationWindow).documentationTestWebMcp.rememberHandles())
  const inspector = page.locator('#tool-inspector')
  await inspector.getByText('Registered tool names', { exact: true }).click()
  for (const name of names) {
    await expect(inspector.locator(`a[href="#tool-${name}"]`)).toHaveText(name)
    await expect(page.locator(`#tool-${name}`)).toHaveCount(1)
  }
  await inspector.locator('a[href="#tool-cleardose_get_explorer_state"]').click()
  await expect(page).toHaveURL(/#tool-cleardose_get_explorer_state$/)
  await expect(page.getByTestId('tool-card-cleardose_get_explorer_state')).toBeInViewport()
  await page.getByTestId('tool-card-cleardose_get_explorer_state').getByRole('button', { name: 'Run example', exact: true }).click()
  await expect.poll(() => runtimeCalls(page)).toEqual(['cleardose_get_explorer_state'])
  const latest = inspector.locator('.inspector__latest')
  await expect(latest).toContainText('cleardose_get_explorer_state')
  await expect(latest).toContainText('success')
  await latest.getByText('Arguments and saved result summary', { exact: true }).click()
  expect(JSON.parse(await latest.locator('pre').innerText())).toMatchObject({ input: { section: 'workspace' }, result: { workspaceRevision: expect.any(String), rows: [], cardCount: 0 } })

  await page.locator('a[href="/hackathon"]').first().click()
  await expect(page).toHaveURL(/\/hackathon$/)
  await expect(page.getByRole('main')).toBeVisible()
  expect(await runtimeNames(page)).toEqual(names)
  await page.locator('a[href="/medications"]').first().click()
  await expect(page).toHaveURL(/\/medications$/)
  expect(await runtimeNames(page)).toEqual(names)
  await page.locator('a[href="/webmcp"]').first().click()
  await expect(page).toHaveURL(/\/webmcp$/)
  await expect(page.getByTestId('registered-tool-count')).toHaveText('19')
  expect(await documentedNames(page)).toEqual(await runtimeNames(page))
  const lifecycle = await page.evaluate(() => {
    const bridge = (window as unknown as DocumentationWindow).documentationTestWebMcp
    return { changed: bridge.changedHandles(), duplicates: bridge.duplicates }
  })
  expect(lifecycle.duplicates).toEqual([])
  expect(lifecycle.changed.every(name => ['find_related_medications', 'compare_medications'].includes(name))).toBe(true)
  expect(errors).toEqual([])
})

test('all consequential examples and replay previews leave cart, orders and workspace untouched', async ({ page }) => {
  const errors = captureErrors(page)
  const providers = await documentationFixture(page)
  await page.goto('/webmcp')
  await expect(page.getByTestId('registered-tool-count')).toHaveText('19')
  const before = await persistedChoices(page)
  const names = (await documentedNames(page)).filter(name => !['view_cart', 'cleardose_get_explorer_state'].includes(name))
  expect(names).toHaveLength(17)
  for (const name of names) {
    await page.getByTestId(`tool-card-${name}`).getByRole('button', { name: 'Preview example', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Review example', exact: true })
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText(name)
    await dialog.getByRole('button', { name: 'Close preview', exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(await persistedChoices(page), name).toEqual(before)
    expect(await runtimeCalls(page), name).toEqual([])
  }
  await page.getByTestId('prompt-find-compare').getByRole('button', { name: 'Replay demo', exact: true }).click()
  const replay = page.getByRole('dialog', { name: 'Review demo replay', exact: true })
  await expect(replay).toBeVisible()
  await expect(replay.getByRole('button', { name: 'Start demo replay', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(replay).not.toBeVisible()
  expect(await persistedChoices(page)).toEqual(before)
  expect(await runtimeCalls(page)).toEqual([])
  expect(providers).toEqual([])
  await expect(page.getByRole('button', { name: 'Open cart, 0 items', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('safe native reads log their result and the illustrated comparison never runs tools', async ({ page }) => {
  const errors = captureErrors(page)
  await documentationFixture(page)
  await page.goto('/webmcp')
  await expect(page.getByTestId('registered-tool-count')).toHaveText('19')
  const before = await persistedChoices(page)
  for (let step = 0; step < 8; step += 1) await page.getByRole('button', { name: 'Next illustrative step', exact: true }).click()
  await expect(page.getByText('Both examples found a configuration. Nothing was selected or purchased.', { exact: true })).toBeVisible()
  expect(await runtimeCalls(page)).toEqual([])
  expect(await persistedChoices(page)).toEqual(before)
  await page.getByRole('button', { name: 'Reset illustration', exact: true }).click()
  await expect(page.getByText('Illustration step 0 of 8', { exact: true })).toBeVisible()
  await page.getByTestId('tool-card-view_cart').getByRole('button', { name: 'Run example', exact: true }).click()
  await expect(page.getByTestId('cart-drawer')).toBeVisible()
  await expect(page.getByTestId('cart-drawer')).toContainText('empty')
  await page.getByTestId('cart-drawer').getByRole('dialog').getByRole('button', { name: 'Close cart', exact: true }).click()
  await expect.poll(() => runtimeCalls(page)).toEqual(['view_cart'])
  const latest = page.locator('#tool-inspector .inspector__latest')
  await expect(latest).toContainText('view_cart')
  await expect(latest).toContainText('success')
  await latest.getByText('Arguments and saved result summary', { exact: true }).click()
  expect(JSON.parse(await latest.locator('pre').innerText())).toMatchObject({ input: {}, result: { itemCount: 0, items: [] } })
  expect(await persistedChoices(page)).toEqual(before)
  expect(errors).toEqual([])
})

test('both documentation routes work without WebMCP and fit mobile through desktop', async ({ page }) => {
  const errors = captureErrors(page)
  await documentationFixture(page, false)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const route of ['/webmcp', '/hackathon']) {
    await page.goto(route)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    if (route === '/webmcp') {
      await expect(page.getByTestId('registered-tool-count')).toHaveText('0')
      await expect(page.locator('#tool-inspector')).toContainText('Native WebMCP is unavailable in this browser.')
      expect(await documentedNames(page)).toHaveLength(19)
      await page.getByTestId('tool-card-checkout_demo_order').getByText('Example arguments and result', { exact: true }).click()
    }
    for (const width of [1440, 900, 390, 320]) {
      await page.setViewportSize({ width, height: 900 })
      // Chromium can acknowledge viewport changes before its next layout pass.
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth), { message: `${route} at ${width}` }).toBeLessThanOrEqual(width + 1)
      const invalidAnchors = await page.locator('main a[href^="#"]').evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute('href')!).filter(href => href.length > 1 && !document.getElementById(decodeURIComponent(href.slice(1)))))
      expect(invalidAnchors, `${route} anchors`).toEqual([])
    }
    await page.reload()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1)
    await expect(page.getByRole('main')).not.toContainText('Page not found')
  }
  expect(errors).toEqual([])
})

test('preview dialog supports keyboard focus, Escape and returning to its trigger', async ({ page }) => {
  const errors = captureErrors(page)
  await documentationFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/webmcp')
  await expect(page.getByTestId('registered-tool-count')).toHaveText('19')
  const trigger = page.getByTestId('tool-card-checkout_demo_order').getByRole('button', { name: 'Preview example', exact: true })
  await trigger.focus()
  await trigger.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Review example', exact: true })
  await expect(dialog).toBeVisible()
  for (let index = 0; index < 4; index += 1) {
    expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true)
    await page.keyboard.press(index % 2 ? 'Shift+Tab' : 'Tab')
  }
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(trigger).toBeFocused()
  expect(await runtimeCalls(page)).toEqual([])
  expect(errors).toEqual([])
})
