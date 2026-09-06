import { expect, test } from '@playwright/test'

const BASE = process.env.HUD_E2E_BASE || 'http://localhost:3000'

test.describe('Hermes HUD', () => {
  test('loads /dashboard within 5 seconds', async ({ page }) => {
    const start = Date.now()
    await page.goto(BASE + '/dashboard')
    await page.getByText('HERMES · HUD').waitFor({ timeout: 5000 })
    expect(Date.now() - start).toBeLessThan(5000)
  })

  test('renders all 5 named regions', async ({ page }) => {
    await page.goto(BASE + '/dashboard')
    await page.getByText('HERMES · HUD').waitFor({ timeout: 5000 })
    for (const label of [
      'brief',
      'bento',
      'timeline',
      'mission-control',
      'inbox',
    ]) {
      await expect(page.getByRole('region', { name: label })).toBeVisible()
    }
  })

  test('mission control tile renders within 5s', async ({ page }) => {
    await page.goto(BASE + '/dashboard')
    const mc = page.getByRole('region', { name: 'mission-control' })
    await expect(mc.getByText('Agents', { exact: false })).toBeVisible({
      timeout: 5000,
    })
  })

  test('customise panel opens via gear button', async ({ page }) => {
    await page.goto(BASE + '/dashboard')
    await page.getByText('HERMES · HUD').waitFor({ timeout: 5000 })
    await page.getByRole('button', { name: 'customise' }).click()
    await expect(page.getByText('CUSTOMISE HUD')).toBeVisible()
  })

  test('mobile viewport renders all regions stacked', async ({ browser }) => {
    // storageState is set globally; the mobile context inherits it via the file.
    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      storageState: './tests/e2e/.auth-state.json',
    })
    const page = await mobileCtx.newPage()
    await page.goto(BASE + '/dashboard')
    await page.getByText('HERMES · HUD').waitFor({ timeout: 5000 })
    await expect(page.getByRole('region', { name: 'inbox' })).toBeVisible()
    await expect(
      page.getByRole('region', { name: 'mission-control' }),
    ).toBeVisible()
    await mobileCtx.close()
  })
})
