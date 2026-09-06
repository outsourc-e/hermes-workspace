import * as fs from 'node:fs'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const BASE = process.env.HUD_E2E_BASE || 'http://localhost:3000'
const HUD_PASSWORD =
  process.env.HUD_E2E_PASSWORD || 'NK2RR83gcLzlI+O1au36eCVr4WyaazDZ35iykPh90IM='
const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const STORAGE_FILE = path.join(__dirname, '.auth-state.json')

export default async function globalSetup() {
  const browser = await chromium.launch()
  const ctx = await browser.newContext()
  const resp = await ctx.request.post(`${BASE}/api/auth`, {
    data: { password: HUD_PASSWORD },
    headers: { 'Content-Type': 'application/json' },
  })
  if (!resp.ok()) {
    const body = await resp.text()
    throw new Error(`Auth failed: ${resp.status()} ${body}`)
  }
  await ctx.storageState({ path: STORAGE_FILE })
  await browser.close()
}
