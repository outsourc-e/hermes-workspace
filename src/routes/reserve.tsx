import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { usePageTitle } from '@/hooks/use-page-title'

type CounterState = {
  loading: boolean
  count: number
  error: string | null
}

type SubmitState =
  | { status: 'idle'; message: string | null }
  | { status: 'submitting'; message: string | null }
  | { status: 'success'; message: string }
  | { status: 'error'; message: string }

export const Route = createFileRoute('/reserve')({
  ssr: false,
  component: ReserveRoute,
})

function ReserveRoute() {
  usePageTitle('Reserve your HermesWorld name')

  const [desiredName, setDesiredName] = useState('')
  const [email, setEmail] = useState('')
  const [wallet, setWallet] = useState('')
  const [counter, setCounter] = useState<CounterState>({
    loading: true,
    count: 0,
    error: null,
  })
  const [submitState, setSubmitState] = useState<SubmitState>({
    status: 'idle',
    message: null,
  })

  useEffect(() => {
    let cancelled = false
    fetch('/api/hermesworld/reservations', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Failed to load counter')
        if (!cancelled) {
          setCounter({ loading: false, count: payload.count || 0, error: null })
        }
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setCounter({ loading: false, count: 0, error: error.message })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const isDisabled = submitState.status === 'submitting'
  const trimmedName = useMemo(() => desiredName.trim(), [desiredName])

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitState({ status: 'submitting', message: null })
    try {
      const response = await fetch('/api/hermesworld/reservations', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          desiredName,
          email,
          wallet,
        }),
      })
      const payload = await response.json()
      if (!response.ok) {
        throw new Error(payload.error || 'Reservation failed')
      }
      setSubmitState({
        status: 'success',
        message: `Reserved ${payload.reservation.desiredName}. Check ${payload.reservation.email} for the confirmation link.`,
      })
      setDesiredName('')
      setEmail('')
      setWallet('')
      setCounter((current) => ({
        ...current,
        count: current.count + 1,
      }))
    } catch (error: any) {
      setSubmitState({
        status: 'error',
        message: error?.message || 'Reservation failed',
      })
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03060a] px-4 py-8 text-[#f8f3e7] selection:bg-[#d9b35f] selection:text-[#07080d] sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,#071018_0%,#03060a_52%,#020305_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_22%,rgba(217,179,95,.18),transparent_32%),radial-gradient(circle_at_78%_18%,rgba(34,211,238,.16),transparent_30%),radial-gradient(circle_at_82%_78%,rgba(167,139,250,.14),transparent_32%)]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:grid lg:grid-cols-[0.9fr_1.1fr] lg:gap-10">
        <section className="rounded-[2rem] border border-[#d9b35f]/24 bg-[#05080e]/82 p-7 shadow-[0_40px_140px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-9">
          <a href="/hermes-world" className="text-[11px] font-black uppercase tracking-[0.22em] text-[#d9b35f]/72 hover:text-[#f8e4ac]">
            ← Back to HermesWorld
          </a>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-[#d9b35f]/30 bg-[#d9b35f]/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.22em] text-[#f8e4ac]">
            Name reservation live
          </div>
          <h1 className="mt-5 font-serif text-4xl font-bold leading-[0.92] tracking-[-0.05em] text-[#fff6df] sm:text-6xl">
            Reserve your HermesWorld name before accounts launch.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-[#d7d0bd]/68 sm:text-lg">
            Lock your desired handle now. We validate duplicates, profanity, and admin/system names server-side, then email you a confirmation link so the reservation can auto-bind when the account system goes live.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <StatCard
              label="Reservations"
              value={counter.loading ? '...' : String(counter.count)}
              tone="gold"
              subcopy={counter.error ? 'Counter temporarily unavailable' : 'Public live counter'}
            />
            <StatCard label="Name rules" value="3–20" tone="cyan" subcopy="Letters, numbers, underscores" />
            <StatCard label="Confirmation" value="Email" tone="violet" subcopy="One-click verification" />
          </div>

          <div className="mt-8 rounded-2xl border border-white/10 bg-black/24 p-5">
            <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d9b35f]/72">
              Reservation notes
            </div>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-[#d7d0bd]/64">
              <li>• Desired names must use letters, numbers, or underscores only.</li>
              <li>• Duplicate names are rejected immediately.</li>
              <li>• Wallet is optional today, but helps with future account linking.</li>
              <li>• Confirmation email required before the reservation is considered locked.</li>
            </ul>
          </div>
        </section>

        <section className="rounded-[2rem] border border-[#d9b35f]/24 bg-[#05080e]/88 p-7 shadow-[0_40px_140px_rgba(0,0,0,.52)] backdrop-blur-2xl sm:p-9">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d9b35f]/72">
                Reserve handle
              </div>
              <div className="mt-2 text-2xl font-bold text-[#fff6df]">
                {trimmedName ? `Claim ${trimmedName}` : 'Enter your launch-day name'}
              </div>
            </div>
            <div className="rounded-full border border-cyan-200/22 bg-cyan-200/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-100/82">
              hermes-world.ai/reserve
            </div>
          </div>

          <form className="mt-8 space-y-5" onSubmit={onSubmit}>
            <Field
              label="Desired name"
              hint="3-20 chars • alnum + underscore"
              value={desiredName}
              onChange={setDesiredName}
              placeholder="Atlas_Builder"
              disabled={isDisabled}
              required
            />
            <Field
              label="Email"
              hint="We send the confirmation link here"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              disabled={isDisabled}
              required
              type="email"
            />
            <Field
              label="Wallet"
              hint="Optional today — useful for launch binding"
              value={wallet}
              onChange={setWallet}
              placeholder="0x... or wallet alias"
              disabled={isDisabled}
            />

            <button
              type="submit"
              disabled={isDisabled}
              className="inline-flex w-full items-center justify-center rounded-xl border border-[#ffe7a3]/55 bg-[linear-gradient(180deg,#ffe7a3,#d9a63f)] px-6 py-4 text-sm font-black uppercase tracking-[0.16em] text-[#11100b] shadow-[0_30px_90px_rgba(217,179,95,.32),inset_0_1px_0_rgba(255,255,255,.32)] transition enabled:hover:-translate-y-0.5 enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isDisabled ? 'Submitting…' : 'Reserve name'}
            </button>
          </form>

          {submitState.message ? (
            <div
              className={[
                'mt-5 rounded-2xl border px-4 py-3 text-sm leading-6',
                submitState.status === 'success'
                  ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-100'
                  : submitState.status === 'error'
                    ? 'border-rose-400/25 bg-rose-400/10 text-rose-100'
                    : 'border-white/10 bg-white/5 text-[#d7d0bd]',
              ].join(' ')}
            >
              {submitState.message}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  )
}

function Field({
  label,
  hint,
  value,
  onChange,
  placeholder,
  disabled,
  required,
  type = 'text',
}: {
  label: string
  hint: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  disabled: boolean
  required?: boolean
  type?: string
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-[#fff6df]">{label}</span>
        <span className="text-[11px] text-[#d7d0bd]/48">{hint}</span>
      </div>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        required={required}
        className="mt-2 h-12 w-full rounded-xl border border-white/10 bg-[#0b1118]/90 px-4 text-sm text-[#fff6df] outline-none ring-0 transition placeholder:text-[#d7d0bd]/30 focus:border-[#d9b35f]/55"
      />
    </label>
  )
}

function StatCard({
  label,
  value,
  subcopy,
  tone,
}: {
  label: string
  value: string
  subcopy: string
  tone: 'gold' | 'cyan' | 'violet'
}) {
  const accent =
    tone === 'gold'
      ? 'text-[#f8e4ac] border-[#d9b35f]/24 bg-[#d9b35f]/10'
      : tone === 'cyan'
        ? 'text-cyan-100 border-cyan-200/24 bg-cyan-200/10'
        : 'text-violet-100 border-violet-200/24 bg-violet-200/10'

  return (
    <div className="rounded-2xl border border-white/10 bg-black/24 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,.05)]">
      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d9b35f]/72">{label}</div>
      <div className={`mt-3 inline-flex rounded-full border px-3 py-1 text-lg font-black ${accent}`}>
        {value}
      </div>
      <div className="mt-3 text-xs leading-5 text-[#d7d0bd]/55">{subcopy}</div>
    </div>
  )
}
