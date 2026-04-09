import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Add01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  Delete02Icon,
  Edit02Icon,
  Folder01Icon,
  Key01Icon,
  SparklesIcon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { DialogContent, DialogRoot, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type ProfileSummary = {
  name: string
  path: string
  active: boolean
  exists: boolean
  model?: string
  provider?: string
  skillCount: number
  sessionCount: number
  hasEnv: boolean
  updatedAt?: string
}

type ProfileDetail = {
  name: string
  path: string
  active: boolean
  config: Record<string, unknown>
  envPath?: string
  hasEnv: boolean
  sessionsDir?: string
  skillsDir?: string
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Request failed (${response.status})`)
  }
  return (await response.json()) as T
}

function formatDate(value?: string): string {
  if (!value) return '—'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(parsed)
}

function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-primary-200 bg-primary-100/60 px-2.5 py-1 text-xs text-primary-700">
      <span className="font-semibold text-primary-900">{value}</span> {label}
    </div>
  )
}

export function ProfilesScreen() {
  const queryClient = useQueryClient()
  const [createOpen, setCreateOpen] = useState(false)
  const [detailsName, setDetailsName] = useState<string | null>(null)
  const [renameTarget, setRenameTarget] = useState<ProfileSummary | null>(null)
  const [newProfileName, setNewProfileName] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [busyName, setBusyName] = useState<string | null>(null)

  const profilesQuery = useQuery({
    queryKey: ['profiles', 'list'],
    queryFn: () => readJson<{ profiles: Array<ProfileSummary>; activeProfile: string }>('/api/profiles/list'),
  })

  const detailQuery = useQuery({
    queryKey: ['profiles', 'read', detailsName],
    queryFn: () => readJson<{ profile: ProfileDetail }>(`/api/profiles/read?name=${encodeURIComponent(detailsName || '')}`),
    enabled: Boolean(detailsName),
  })

  const profiles = profilesQuery.data?.profiles ?? []
  const activeProfile = profilesQuery.data?.activeProfile ?? 'default'

  const sorted = useMemo(() => profiles, [profiles])

  async function refreshProfiles() {
    await queryClient.invalidateQueries({ queryKey: ['profiles'] })
  }

  async function postJson(url: string, body: Record<string, unknown>) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || `Request failed (${response.status})`)
    }
    return payload
  }

  async function handleCreate() {
    if (!newProfileName.trim()) return
    setBusyName('__create__')
    try {
      await postJson('/api/profiles/create', { name: newProfileName.trim() })
      toast(`Created profile ${newProfileName.trim()}`, { type: 'success' })
      setCreateOpen(false)
      setNewProfileName('')
      await refreshProfiles()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to create profile', { type: 'error' })
    } finally {
      setBusyName(null)
    }
  }

  async function handleActivate(name: string) {
    setBusyName(name)
    try {
      await postJson('/api/profiles/activate', { name })
      toast(`Activated profile ${name}`, { type: 'success' })
      await refreshProfiles()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to activate profile', { type: 'error' })
    } finally {
      setBusyName(null)
    }
  }

  async function handleDelete(name: string) {
    if (typeof window !== 'undefined' && !window.confirm(`Delete profile ${name}?`)) return
    setBusyName(name)
    try {
      await postJson('/api/profiles/delete', { name })
      toast(`Deleted profile ${name}`, { type: 'success' })
      await refreshProfiles()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to delete profile', { type: 'error' })
    } finally {
      setBusyName(null)
    }
  }

  async function handleRename() {
    if (!renameTarget || !renameValue.trim()) return
    setBusyName(renameTarget.name)
    try {
      await postJson('/api/profiles/rename', { oldName: renameTarget.name, newName: renameValue.trim() })
      toast(`Renamed ${renameTarget.name} → ${renameValue.trim()}`, { type: 'success' })
      setRenameTarget(null)
      setRenameValue('')
      await refreshProfiles()
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Failed to rename profile', { type: 'error' })
    } finally {
      setBusyName(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={UserGroupIcon} size={22} strokeWidth={1.7} />
            <h1 className="text-lg font-semibold text-primary-900">Profiles</h1>
          </div>
          <p className="mt-1 text-sm text-primary-600">
            Browse and manage Hermes profiles stored under <span className="font-mono">~/.hermes/profiles</span>.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.8} />
          Create profile
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((profile) => {
          const busy = busyName === profile.name
          return (
            <article key={profile.name} className="rounded-2xl border border-primary-200 bg-primary-50/80 p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-primary-900">{profile.name}</h2>
                    {profile.active ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        <HugeiconsIcon icon={CheckmarkCircle02Icon} size={12} strokeWidth={2} /> Active
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-primary-500">{profile.path}</p>
                </div>
                <span className="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium text-primary-700">
                  {profile.provider || 'provider?'}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <StatChip label="skills" value={profile.skillCount} />
                <StatChip label="sessions" value={profile.sessionCount} />
                <StatChip label="model" value={profile.model || '—'} />
                <StatChip label="env" value={profile.hasEnv ? 'yes' : 'no'} />
              </div>

              <div className="mt-4 rounded-xl bg-primary-100/60 px-3 py-2 text-xs text-primary-700">
                <div className="flex items-center gap-1.5">
                  <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.7} />
                  Updated: {formatDate(profile.updatedAt)}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void handleActivate(profile.name)} disabled={profile.active || busy} className="gap-1.5">
                  <HugeiconsIcon icon={SparklesIcon} size={14} strokeWidth={1.8} /> Activate
                </Button>
                <Button size="sm" variant="outline" onClick={() => setDetailsName(profile.name)} className="gap-1.5">
                  <HugeiconsIcon icon={Folder01Icon} size={14} strokeWidth={1.8} /> Details
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setRenameTarget(profile); setRenameValue(profile.name) }} className="gap-1.5">
                  <HugeiconsIcon icon={Edit02Icon} size={14} strokeWidth={1.8} /> Rename
                </Button>
                <Button size="sm" variant="outline" onClick={() => void handleDelete(profile.name)} disabled={profile.active || busy} className={cn('gap-1.5', profile.active ? 'opacity-50' : 'text-red-600')}>
                  <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.8} /> Delete
                </Button>
              </div>
            </article>
          )
        })}
      </div>

      {sorted.length === 0 && !profilesQuery.isLoading ? (
        <div className="rounded-2xl border border-dashed border-primary-200 bg-primary-50/70 p-8 text-center text-sm text-primary-600">
          No named profiles found yet. The active profile is <span className="font-semibold">{activeProfile}</span>.
        </div>
      ) : null}

      <DialogRoot open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Create profile</DialogTitle>
          <div className="mt-4 space-y-3">
            <Input value={newProfileName} onChange={(e) => setNewProfileName(e.target.value)} placeholder="builder" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={() => void handleCreate()} disabled={busyName === '__create__'}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={Boolean(renameTarget)} onOpenChange={(open) => { if (!open) { setRenameTarget(null); setRenameValue('') } }}>
        <DialogContent className="sm:max-w-md">
          <DialogTitle>Rename profile</DialogTitle>
          <div className="mt-4 space-y-3">
            <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} placeholder="new-profile-name" />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRenameTarget(null)}>Cancel</Button>
              <Button onClick={() => void handleRename()} disabled={!renameTarget}>Rename</Button>
            </div>
          </div>
        </DialogContent>
      </DialogRoot>

      <DialogRoot open={Boolean(detailsName)} onOpenChange={(open) => !open && setDetailsName(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogTitle>Profile details</DialogTitle>
          {detailQuery.data?.profile ? (
            <div className="mt-4 space-y-4 text-sm">
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-primary-200 bg-primary-50/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary-500">Profile</div>
                  <div className="mt-2 space-y-1 text-primary-800">
                    <div><span className="font-medium">Name:</span> {detailQuery.data.profile.name}</div>
                    <div><span className="font-medium">Path:</span> <span className="font-mono text-xs">{detailQuery.data.profile.path}</span></div>
                    <div><span className="font-medium">Active:</span> {detailQuery.data.profile.active ? 'Yes' : 'No'}</div>
                  </div>
                </div>
                <div className="rounded-xl border border-primary-200 bg-primary-50/80 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary-500">Paths</div>
                  <div className="mt-2 space-y-1 text-primary-800">
                    <div><span className="font-medium">Env:</span> {detailQuery.data.profile.envPath ? <span className="font-mono text-xs">{detailQuery.data.profile.envPath}</span> : '—'}</div>
                    <div><span className="font-medium">Sessions:</span> {detailQuery.data.profile.sessionsDir ? <span className="font-mono text-xs">{detailQuery.data.profile.sessionsDir}</span> : '—'}</div>
                    <div><span className="font-medium">Skills:</span> {detailQuery.data.profile.skillsDir ? <span className="font-mono text-xs">{detailQuery.data.profile.skillsDir}</span> : '—'}</div>
                  </div>
                </div>
              </div>
              <div className="rounded-xl border border-primary-200 bg-primary-50/80 p-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary-500">
                  <HugeiconsIcon icon={Key01Icon} size={14} strokeWidth={1.8} /> Config summary
                </div>
                <pre className="max-h-80 overflow-auto rounded-lg bg-primary-100/70 p-3 text-xs text-primary-800">{JSON.stringify(detailQuery.data.profile.config, null, 2)}</pre>
              </div>
            </div>
          ) : detailQuery.isLoading ? (
            <div className="mt-4 text-sm text-primary-600">Loading profile…</div>
          ) : (
            <div className="mt-4 text-sm text-red-600">Failed to load profile.</div>
          )}
        </DialogContent>
      </DialogRoot>
    </div>
  )
}
