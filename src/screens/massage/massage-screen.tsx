'use client'

import { useEffect, useState } from 'react'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Calendar03Icon,
  Note01Icon,
  SparklesIcon,
} from '@hugeicons/core-free-icons'
import { toast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'

const NOTES_STORAGE_KEY = 'hermes-massage-notes'

function readEnv(name: string): string {
  const value = (import.meta as any).env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function CalendarPanel({
  title,
  url,
  envName,
}: {
  title: string
  url: string
  envName: string
}) {
  return (
    <div className="flex flex-col rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text)]">
          <HugeiconsIcon icon={Calendar03Icon} size={16} strokeWidth={1.5} />
          {title}
        </div>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-[var(--theme-muted)] hover:text-[var(--theme-text)] underline-offset-2 hover:underline"
          >
            Open in Google Calendar ↗
          </a>
        ) : null}
      </div>
      {url ? (
        <iframe
          title={`${title} calendar`}
          src={url}
          className="h-[520px] w-full bg-white"
          style={{ border: 0 }}
        />
      ) : (
        <div className="flex h-[260px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[var(--theme-muted)]">
          <span>
            No calendar configured for <strong>{title}</strong>.
          </span>
          <span className="text-xs">
            Set <code>{envName}</code> in <code>.env</code> to a Google Calendar
            embed URL (Settings → Integrate calendar → Public URL).
          </span>
        </div>
      )}
    </div>
  )
}

export function MassageScreen() {
  const hiltonUrl = readEnv('VITE_MASSAGE_CALENDAR_HILTON_URL')
  const tadcUrl = readEnv('VITE_MASSAGE_CALENDAR_TADC_URL')

  const [notes, setNotes] = useState('')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(NOTES_STORAGE_KEY)
      if (stored) setNotes(stored)
    } catch {
      // ignore
    }
  }, [])

  function handleNotesChange(value: string) {
    setNotes(value)
    try {
      localStorage.setItem(NOTES_STORAGE_KEY, value)
    } catch {
      // ignore
    }
  }

  function handleDraftClinicCode() {
    toast(
      'Clinic-code drafting not wired up yet — this will hand notes to Hermes/Claude for transcription and clinic-code drafting once the backend integration lands.',
      { type: 'info' },
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto p-4 md:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--theme-text)]">
            Massage — Week
          </h1>
          <p className="text-xs text-[var(--theme-muted)]">
            Patient schedule for Hilton and TADC. Notes are kept locally in your
            browser.
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <CalendarPanel
          title="Hilton"
          url={hiltonUrl}
          envName="VITE_MASSAGE_CALENDAR_HILTON_URL"
        />
        <CalendarPanel
          title="TADC"
          url={tadcUrl}
          envName="VITE_MASSAGE_CALENDAR_TADC_URL"
        />
      </div>

      <div className="mt-6 rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)]">
        <div className="flex items-center justify-between gap-2 border-b border-[var(--theme-border)] px-3 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--theme-text)]">
            <HugeiconsIcon icon={Note01Icon} size={16} strokeWidth={1.5} />
            Massage notes
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDraftClinicCode}
            className="gap-2"
          >
            <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.5} />
            Draft clinic code with Hermes
          </Button>
        </div>
        <textarea
          value={notes}
          onChange={(event) => handleNotesChange(event.target.value)}
          placeholder="Write session notes here. (Persisted to localStorage only.)"
          className="block min-h-[240px] w-full resize-y bg-transparent p-3 text-sm text-[var(--theme-text)] placeholder:text-[var(--theme-muted)] focus:outline-none"
        />
        <div className="border-t border-[var(--theme-border)] px-3 py-2 text-[11px] text-[var(--theme-muted)]">
          Transcription / dictation and structured clinic-code drafting will run
          through Hermes once the backend route is implemented.
        </div>
      </div>
    </div>
  )
}
