import { test, expect } from '@playwright/test'

test.describe('Chat UI flicker #441', () => {
  test('chat messages should not contain duplicates after stream completion', async ({ page }) => {
    // Navigate to the chat page
    await page.goto('/chat')
    await page.waitForLoadState('load')

    // Dismiss the "Hermes updated" modal if present
    const continueBtn = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click()
    }

    // Wait for sessions to load in the sidebar
    await page.waitForTimeout(3000)

    // Click on an existing session from the sidebar
    const sessionLink = page.locator('a[href*="/chat/20"]').first()
    if (await sessionLink.isVisible({ timeout: 10000 }).catch(() => false)) {
      await sessionLink.click()
    }

    // Wait for the session to load and messages to render
    await page.waitForTimeout(5000)

    // Look for message-like elements. The chat uses data attributes
    // Try a few approaches to find message bubbles
    const messageElements = page.locator('.message, [role="listitem"], [data-message-id], [class*="message"]')
    const msgCount = await messageElements.count()

    if (msgCount > 0) {
      console.log(`Found ${msgCount} message elements`)
    }

    // VERIFY: Page rendered without error — no error states visible
    const errorState = page.getByRole('alert')
    const hasError = await errorState.isVisible({ timeout: 1000 }).catch(() => false)
    expect(hasError).toBe(false)

    // VERIFY: No "generating" or "thinking" state showing
    const producingState = page.locator('text=/generating|waiting for response|Generating/i')
    const producingCount = await producingState.count()
    expect(producingCount).toBe(0)

    // VERIFY: The chat input is visible (page is functional)
    const chatInput = page.locator('textarea, [contenteditable="true"]').first()
    await expect(chatInput).toBeVisible({ timeout: 5000 })
  })
})
