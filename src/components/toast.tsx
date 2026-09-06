/**
 * Toast Notifications
 * Lightweight notification overlay for user feedback.
 * Usage: import { toast } from '@/components/toast'
 *        toast.success('Saved!') / toast.error('Failed')
 */
import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

type Toast = {
  id: number
  message: string
  type: ToastType
}

type ToastContextType = {
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
  warning: (msg: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

let toastId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Array<Toast>>([])

  const add = useCallback((message: string, type: ToastType) => {
    const id = ++toastId
    setToasts((prev) => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 4000)
  }, [])

  const ctx: ToastContextType = {
    success: (msg) => add(msg, 'success'),
    error: (msg) => add(msg, 'error'),
    info: (msg) => add(msg, 'info'),
    warning: (msg) => add(msg, 'warning'),
  }

  return (
    <ToastContext.Provider value={ctx}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg backdrop-blur ${
              t.type === 'success'
                ? 'border-emerald-500/50 bg-emerald-950/80 text-emerald-400'
                : t.type === 'error'
                  ? 'border-red-500/50 bg-red-950/80 text-red-400'
                  : t.type === 'warning'
                    ? 'border-amber-500/50 bg-amber-950/80 text-amber-400'
                    : 'border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-text)]'
            }`}
          >
            <span>
              {t.type === 'success'
                ? '✓'
                : t.type === 'error'
                  ? '✗'
                  : t.type === 'warning'
                    ? '⚠'
                    : 'ℹ'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
