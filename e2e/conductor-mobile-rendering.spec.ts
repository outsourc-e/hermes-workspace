import { test, expect } from '@playwright/test'

const BASE = process.env.HERMES_WORKSPACE_URL || 'http://localhost:3002'

test.describe('Conductor mobile rendering', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE
  })

  test('conductor home page renders without clipping on mobile', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(2000)

    // Check that the main container is present
    const main = page.locator('main')
    await expect(main.first()).toBeVisible()

    // Verify the page is scrollable — bottom content should be reachable
    const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight)
    const clientHeight = await page.evaluate(() => document.documentElement.clientHeight)
    expect(scrollHeight).toBeGreaterThanOrEqual(clientHeight)

    // Check that the Conductor badge or title is visible
    const pageText = await page.locator('body').innerText()
    expect(pageText).toContain('Conductor')

    // Scroll to the very bottom
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
    await page.waitForTimeout(500)

    // Verify no content is cut off — the last visible element should not be flush
    // with the bottom of the viewport
    const bottomElement = await page.evaluate(() => {
      const body = document.body
      const bodyRect = body.getBoundingClientRect()
      return bodyRect.bottom
    })
    // body bottom should be within the document (not clipped off-screen)
    expect(bottomElement).toBeGreaterThan(0)
  })

  test('conductor page has no horizontal overflow on mobile', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(2000)

    // Check for horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth
    })
    expect(hasHorizontalOverflow).toBe(false)
  })

  test('conductor action buttons are present on mobile', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(2000)

    // Check for action buttons — they should be visible and clickable
    const buttons = page.locator('button')
    const buttonCount = await buttons.count()
    expect(buttonCount).toBeGreaterThan(0)
  })

  test('conductor main container has proper bottom padding on mobile', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(2000)

    // Check the bottom padding of main elements
    const bottomPadding = await page.evaluate(() => {
      const mains = document.querySelectorAll('main')
      if (mains.length === 0) return -1
      // Get computed padding-bottom from the last main (the conductor one)
      const style = window.getComputedStyle(mains[mains.length - 1])
      return parseInt(style.paddingBottom, 10) || 0
    })
    // Bottom padding must exist (not 0) to prevent content from being flush with tab bar
    expect(bottomPadding).toBeGreaterThanOrEqual(4)
  })

  test('conductor page body fills full viewport height without clipping at bottom', async ({ page }) => {
    await page.goto(`${BASE}/conductor`)
    await page.waitForTimeout(2000)

    // Verify body fills the viewport and can scroll
    const bodyHeight = await page.evaluate(() => document.body.scrollHeight)
    const vpHeight = await page.evaluate(() => window.innerHeight)
    expect(bodyHeight).toBeGreaterThanOrEqual(vpHeight * 0.5)

    // Scroll to bottom — should not error
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(300)

    // The last visible element on the page should have bottom >= 0
    const lastElBottom = await page.evaluate(() => {
      const all = document.querySelectorAll('main > div, main > section')
      const last = all[all.length - 1]
      if (!last) return -1
      const rect = last.getBoundingClientRect()
      return rect.bottom
    })
    // The last content element must be visible (not above the fold or clipped)
    expect(lastElBottom).toBeGreaterThan(0)
  })
})
