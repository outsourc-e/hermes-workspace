/**
 * GET /api/whoop/history
 *
 * Returns the last 7 days of Whoop data from the personal-projects pipeline.
 * Each day's snapshot is stored as separate JSON files.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'

const WHOOP_DIR = join(homedir(), '.hermes/repos/nw-personal-projects/whoop')

type DayEntry = {
  date: string
  recoveryPct: number | null
  hrvMs: number | null
  dayStrain: number | null
  sleepHours: number | null
}

export const Route = createFileRoute('/api/whoop/history')({
  server: {
    handlers: {
      GET: async () => {
        if (!existsSync(WHOOP_DIR)) return json([])

        let files: Array<string> = []
        try {
          files = readdirSync(WHOOP_DIR).filter((f) => f.endsWith('.json'))
        } catch {
          return json([])
        }

        const days: Array<DayEntry> = []
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 7)

        for (const file of files) {
          try {
            const content = readFileSync(join(WHOOP_DIR, file), 'utf8')
            const d = JSON.parse(content) as Record<string, unknown>
            const dateStr = String(d.date ?? '')
            if (!dateStr) continue
            const date = new Date(dateStr)
            if (date >= cutoff) {
              days.push({
                date: dateStr,
                recoveryPct:
                  typeof d.recovery_pct === 'number' ? d.recovery_pct : null,
                hrvMs: typeof d.hrv_ms === 'number' ? d.hrv_ms : null,
                dayStrain:
                  typeof d.day_strain === 'number' ? d.day_strain : null,
                sleepHours:
                  typeof d.sleep_hours === 'number' ? d.sleep_hours : null,
              })
            }
          } catch {
            /* skip invalid files */
          }
        }

        days.sort((a, b) => a.date.localeCompare(b.date))
        return json(days)
      },
    },
  },
})
