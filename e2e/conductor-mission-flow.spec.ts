import { expect, test } from '@playwright/test'

const BASE = process.env.HERMES_WORKSPACE_URL || 'http://localhost:3000'

test.describe('Conductor mission flow', () => {
  test('creates a template mission and lists it', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(1500)

    const input = page.locator('[id="conductor-goal"], input[placeholder*="outcome"]').first()
    await input.fill('Add a conductor end-to-end test')

    const submit = page.locator('button:has-text("Create mission")').first()
    await submit.click()

    await expect(page.locator('text=Add a conductor end-to-end test').first()).toBeVisible({ timeout: 10_000 })
  })

  test('creates a native Conductor mission and lists it', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(1500)

    // Select conductor mode (native spawn)
    const modeToggle = page.locator('button:has-text("Conductor")').first()
    await modeToggle.click()

    const input = page.locator('[id="conductor-goal"], input[placeholder*="outcome"]').first()
    await input.fill('Conductor: Run builder task verification')

    const submit = page.locator('button:has-text("Create mission")').first()
    await submit.click()

    // Mission appears in the queue
    await expect(page.locator('text=Conductor: Run builder task verification').first()).toBeVisible({
      timeout: 10_000,
    })
  })

  test('graph renders nodes and edges', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(1500)

    const goal = 'Verify graph rendering'
    await page.fill('[id="conductor-goal"], input[placeholder*="outcome"]', goal)

    // Switch to Template mode so the generated mission has dependencies/edges.
    await page.click('button:has-text("Template")')
    await page.click('button:has-text("Create mission")')

    // The new mission appears in the queue; click its title to open the graph.
    const missionCard = page.locator('article', { hasText: goal }).first()
    await expect(missionCard).toBeVisible({ timeout: 10_000 })
    await missionCard.locator('button').first().click()

    // Wait for the execution graph to render in the main panel.
    const graph = page.locator('svg').filter({ has: page.locator('g[transform]') }).first()
    await expect(graph).toBeVisible({ timeout: 10_000 })

    const edges = graph.locator('path[marker-end]')
    expect(await edges.count()).toBeGreaterThan(0)

    const nodes = graph.locator('g[transform]')
    expect(await nodes.count()).toBeGreaterThan(0)
  })

  test('mode toggle updates available mission controls', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(1500)

    await page.fill('[id="conductor-goal"], input[placeholder*="outcome"]', 'Conductor: mode toggle test')

    // Default Conductor mode shows the Supervised checkbox and no template dropdown.
    const supervised = page.locator('label', { hasText: 'Supervised' }).first()
    await expect(supervised).toBeVisible()
    await expect(page.locator('select')).toHaveCount(0)

    // Switch to Template mode: a template dropdown appears.
    await page.click('button:has-text("Template")')
    const templateSelect = page.locator('select').first()
    await expect(templateSelect).toBeVisible()
    await expect(templateSelect.locator('option[value="coding"]')).toBeAttached()

    // Switch back to Conductor mode: dropdown is removed and Supervised reappears.
    await page.click('button:has-text("Conductor")')
    await expect(page.locator('select')).toHaveCount(0)
    await expect(supervised).toBeVisible()
  })
})
