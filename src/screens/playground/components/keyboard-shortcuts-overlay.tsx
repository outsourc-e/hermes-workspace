import { useEffect, useState } from 'react'

export const SHORTCUTS = [
  ['WASD/arrows', 'move'],
  ['Shift', 'run'],
  ['Space', 'jump'],
  ['Ctrl', 'crouch'],
  ['E', 'interact / talk'],
  ['Tab', 'party'],
  ['I', 'inventory'],
  ['M', 'map'],
  ['K', 'skills'],
  ['N', 'noticeboard / quests'],
  ['C', 'character'],
  ['Esc', 'settings'],
  ['Enter', 'chat'],
  ['/', 'commands'],
  ['?', 'help'],
] as const

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

export function shouldToggleKeyboardHelp(event: Pick<KeyboardEvent, 'key' | 'shiftKey' | 'target'>) {
  return !isTypingTarget(event.target) && (event.key === '?' || (event.shiftKey && event.key === '/'))
}

export function KeyboardShortcutsOverlay() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (shouldToggleKeyboardHelp(event)) {
        event.preventDefault()
        setOpen((value) => !value)
        return
      }
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  if (!open) return null

  return (
    <div className="pointer-events-auto fixed inset-0 z-[130] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        className="w-[min(92vw,520px)] rounded-3xl border-2 p-5 text-white shadow-2xl"
        style={{
          borderColor: 'rgba(241,197,109,.7)',
          background: 'linear-gradient(180deg, rgba(15,22,34,.96), rgba(4,7,12,.96))',
          boxShadow: '0 0 40px rgba(241,197,109,.18), 0 24px 80px rgba(0,0,0,.72)',
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.28em] text-amber-200/70">HermesWorld</div>
            <h2 className="text-xl font-black text-[#F1C56D]">Keyboard Shortcuts</h2>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl border border-amber-200/25 bg-white/5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/70 hover:bg-white/10"
          >
            Esc
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {SHORTCUTS.map(([key, action]) => (
            <div key={key} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2">
              <span className="text-sm text-white/78">{action}</span>
              <kbd className="rounded-md border border-amber-200/30 bg-black/45 px-2 py-1 text-[11px] font-black text-amber-100">{key}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
