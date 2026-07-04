import { createFileRoute } from '@tanstack/react-router'
import { json } from '@tanstack/react-start'
import { z } from 'zod'
import { isAuthenticated } from '../../../server/auth-middleware'
import { runEtsySheetIntake } from '../../../server/etsy-sheet-intake'

const SheetIntakePayloadSchema = z.discriminatedUnion('sourceType', [
  z.object({
    sourceType: z.literal('pasted_text'),
    pastedText: z.string().max(1_100_000),
  }).strict(),
  z.object({
    sourceType: z.literal('local_file'),
    localPath: z.string().trim().min(1).max(1200),
  }).strict(),
  z.object({
    sourceType: z.literal('public_csv_url'),
    publicCsvUrl: z.string().trim().min(1).max(1600),
  }).strict(),
])

export const Route = createFileRoute('/api/war-room/etsy-sheet-intake')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
        }
        const parsed = SheetIntakePayloadSchema.safeParse(body)
        if (!parsed.success) {
          return json({ ok: false, error: 'Invalid Sheet Intake payload.' }, { status: 400, headers: { 'cache-control': 'no-store' } })
        }

        const result = await runEtsySheetIntake(parsed.data)
        return json(result, {
          status: result.ok ? 200 : 400,
          headers: { 'cache-control': 'no-store' },
        })
      },
    },
  },
})
