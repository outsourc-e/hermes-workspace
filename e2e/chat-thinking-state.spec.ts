import { test, expect } from '@playwright/test'

test.describe('Chat thinking state #449', () => {
  test('should not show stale thinking state after page refresh for completed session', async ({ page }) => {
    // This test simulates the exact bug scenario described in Issue #449:
    // User had a conversation, the stream completed (clearing waiting state),
    // page refreshes, and the assistant briefly shows "thinking" state.

    // Use an existing session that has completed messages
    const SESSION_PATH = '/chat/20260515_150106_4be3a000'

    // Inject a stale waiting entry for THIS session before the page loads
    await page.addInitScript((sessionKey) => {
      window.sessionStorage.setItem(
        `claude_waiting_${sessionKey}`,
        JSON.stringify({
          since: Date.now() - 30000, // 30s ago — within the 120s TTL
          runId: 'stale-run-id',
        }),
      )
    }, SESSION_PATH.replace('/chat/', ''))

    // Navigate directly to the session
    await page.goto(SESSION_PATH)
    await page.waitForLoadState('load')

    // Dismiss the "Hermes updated" modal if present
    const continueBtn = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await continueBtn.click()
    }

    // Wait for app rehydration, Zustand store init, sessionStorage restore,
    // and the active-run API check to complete
    await page.waitForTimeout(5000)

    // VERIFY: No thinking indicator is visible after page refresh.
    // The stale sessionStorage entry should have been cleared by the
    // active-run API check, and the fix gates thinking on that check.
    const thinkingIndicator = page.locator(
      '[data-testid="thinking-indicator"], [aria-label="Assistant thinking"], .thinking-indicator, [data-thinking="true"]',
    )
    const thinkingCount = await thinkingIndicator.count()
    expect(thinkingCount).toBe(0)

    // VERIFY: The stale sessionStorage entry was cleaned up
    const staleKey = SESSION_PATH.replace('/chat/', '')
    const hasStaleEntry = await page.evaluate((key) => {
      return window.sessionStorage.getItem(`claude_waiting_${key}`) !== null
    }, staleKey)
    expect(hasStaleEntry).toBe(false)
  })
})
