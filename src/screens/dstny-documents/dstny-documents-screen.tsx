import { HugeiconsIcon } from '@hugeicons/react'
import {
  BrainIcon,
  CheckListIcon,
  Clock01Icon,
  File01Icon,
  Link01Icon,
  Rocket01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

type DstnyDocumentRecord = {
  id: string
  title: string
  originalName: string
  storedName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  checksumSha256: string
  collection: string
  product: string | null
  channel: string
  docType: string
  businessStatus: string
  confidence: string
  documentDate: string | null
  supplier: string | null
  owner: string | null
  version: string | null
  summary: string | null
  keywords: Array<string>
  ingestionStatus: string
  ragDocId: string | null
  ragCollection: string | null
  lastError: string | null
  uploadedAt: string
  updatedAt: string
  ingestedAt: string | null
}

type DstnyDocumentsListResponse = {
  ok?: boolean
  documents?: Array<DstnyDocumentRecord>
  options?: {
    collections: ReadonlyArray<string>
    channels: ReadonlyArray<string>
    docTypes: ReadonlyArray<string>
    businessStatuses: ReadonlyArray<string>
    confidenceLevels: ReadonlyArray<string>
    ingestionStatuses: ReadonlyArray<string>
  }
  error?: string
}

type UploadFormState = {
  title: string
  collection: string
  product: string
  channel: string
  docType: string
  businessStatus: string
  confidence: string
  documentDate: string
  supplier: string
  owner: string
  version: string
  keywords: string
  summary: string
}

const DEFAULT_FORM: UploadFormState = {
  title: '',
  collection: 'dstny_produits',
  product: '',
  channel: 'tous',
  docType: 'fiche_produit',
  businessStatus: 'brouillon',
  confidence: 'moyen',
  documentDate: '',
  supplier: '',
  owner: '',
  version: '',
  keywords: '',
  summary: '',
}

const COLLECTION_LABELS: Record<string, string> = {
  dstny_catalogues: 'Catalogues',
  dstny_produits: 'Produits',
  metacentrex_alianza: 'MetaCentrex / Alianza',
  concurrence: 'Concurrence',
  sales_enablement: 'Sales enablement',
  pricing: 'Pricing',
  mydstny_si: 'MyDstny / SI',
  github_pdfengine: 'GitHub / PDF Engine',
  livrables_valides: 'Livrables validés',
  decisions: 'Décisions',
}

const CHANNEL_LABELS: Record<string, string> = {
  direct: 'Direct',
  ambassadeur: 'Ambassadeur',
  operateur: 'Opérateur',
  interne: 'Interne',
  tous: 'Tous',
}

async function readJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String((payload as { error?: unknown }).error)
        : `Request failed (${response.status})`
    throw new Error(message)
  }
  return payload as T
}

function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return value
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function optionLabel(value: string): string {
  return COLLECTION_LABELS[value] || CHANNEL_LABELS[value] || value.replace(/_/g, ' ')
}

function statusTone(status: string): string {
  if (status === 'indexed') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (status === 'ingesting') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  if (status === 'error') return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  if (status === 'archived') return 'border-primary-400/30 bg-primary-500/10 text-primary-600 dark:text-neutral-300'
  return 'border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-300'
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium text-primary-600 dark:text-neutral-400">
      {children}
    </label>
  )
}

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string
  options: ReadonlyArray<string>
  onChange: (value: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-8 w-full rounded-lg border border-primary-200 bg-surface px-2 text-sm text-primary-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-100"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {optionLabel(option)}
        </option>
      ))}
    </select>
  )
}

export function DstnyDocumentsScreen() {
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [collection, setCollection] = useState('')
  const [status, setStatus] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [form, setForm] = useState<UploadFormState>(DEFAULT_FORM)
  const [uploading, setUploading] = useState(false)
  const [ingestingId, setIngestingId] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')

  const listUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    if (collection) params.set('collection', collection)
    if (status) params.set('businessStatus', status)
    return `/api/dstny-documents/list?${params.toString()}`
  }, [collection, query, status])

  const documentsQuery = useQuery({
    queryKey: ['dstny-documents', listUrl],
    queryFn: () => readJson<DstnyDocumentsListResponse>(listUrl),
  })

  const documents = documentsQuery.data?.documents || []
  const options = documentsQuery.data?.options
  const selected =
    documents.find((document) => document.id === selectedId) || documents[0] || null

  async function refreshDocuments() {
    await queryClient.invalidateQueries({ queryKey: ['dstny-documents'] })
  }

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) {
      toast('Sélectionne un fichier à charger.', { type: 'warning' })
      return
    }
    if (!form.title.trim()) {
      toast('Le titre est obligatoire.', { type: 'warning' })
      return
    }

    setUploading(true)
    try {
      const data = new FormData()
      data.set('file', file)
      Object.entries(form).forEach(([key, value]) => {
        data.set(key, value)
      })
      const result = await readJson<{ ok: boolean; document: DstnyDocumentRecord }>(
        '/api/dstny-documents/upload',
        { method: 'POST', body: data },
      )
      setSelectedId(result.document.id)
      setFile(null)
      setForm(DEFAULT_FORM)
      setPrompt('')
      await refreshDocuments()
      toast('Document ajouté au registre Dstny.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Upload impossible.', {
        type: 'error',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleIngest(document: DstnyDocumentRecord) {
    setIngestingId(document.id)
    try {
      await readJson('/api/dstny-documents/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: document.id }),
      })
      await refreshDocuments()
      toast('Document indexé dans le RAG.', { type: 'success' })
    } catch (error) {
      await refreshDocuments()
      toast(error instanceof Error ? error.message : 'Indexation impossible.', {
        type: 'error',
      })
    } finally {
      setIngestingId(null)
    }
  }

  async function handlePrompt(document: DstnyDocumentRecord) {
    try {
      const result = await readJson<{ prompt: string }>(
        `/api/dstny-documents/analyze-prompt?id=${encodeURIComponent(document.id)}`,
      )
      setPrompt(result.prompt)
      await navigator.clipboard?.writeText(result.prompt).catch(() => undefined)
      toast('Prompt d’analyse prêt.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Prompt indisponible.', {
        type: 'error',
      })
    }
  }

  async function updateSelectedStatus(nextStatus: string) {
    if (!selected) return
    try {
      await readJson('/api/dstny-documents/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selected.id,
          patch: { businessStatus: nextStatus },
        }),
      })
      await refreshDocuments()
      toast('Statut mis à jour.', { type: 'success' })
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Mise à jour impossible.', {
        type: 'error',
      })
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--theme-bg)] text-primary-900 dark:text-neutral-100">
      <header className="border-b border-primary-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold tracking-tight">
              Documents Dstny
            </h1>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-primary-600 dark:text-neutral-400">
              <span>{documents.length} documents</span>
              <span>{documents.filter((doc) => doc.ingestionStatus === 'indexed').length} indexés</span>
              <span>{documents.filter((doc) => doc.ingestionStatus === 'error').length} erreurs</span>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(180px,280px)_160px_140px]">
            <div className="relative">
              <HugeiconsIcon
                icon={Search01Icon}
                size={16}
                strokeWidth={1.6}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-primary-500"
              />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Rechercher"
                className="rounded-lg pl-7"
                nativeInput
              />
            </div>
            <SelectField
              value={collection}
              options={['', ...(options?.collections || [])]}
              onChange={setCollection}
            />
            <SelectField
              value={status}
              options={['', ...(options?.businessStatuses || [])]}
              onChange={setStatus}
            />
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[360px_minmax(0,1fr)]">
        <form
          onSubmit={handleUpload}
          className="min-h-0 overflow-y-auto border-b border-primary-200 p-4 dark:border-neutral-800 lg:border-b-0 lg:border-r"
        >
          <div className="mb-4 flex items-center gap-2">
            <HugeiconsIcon icon={File01Icon} size={18} strokeWidth={1.6} />
            <h2 className="text-sm font-semibold">Nouveau document</h2>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <FieldLabel>Fichier</FieldLabel>
              <Input
                type="file"
                nativeInput
                onChange={(event) => setFile(event.target.files?.[0] || null)}
                className="rounded-lg"
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Titre</FieldLabel>
              <Input
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ex. Catalogue MetaCentrex 2026"
                nativeInput
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Collection</FieldLabel>
                <SelectField
                  value={form.collection}
                  options={options?.collections || [DEFAULT_FORM.collection]}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, collection: value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Canal</FieldLabel>
                <SelectField
                  value={form.channel}
                  options={options?.channels || [DEFAULT_FORM.channel]}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, channel: value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Type</FieldLabel>
                <SelectField
                  value={form.docType}
                  options={options?.docTypes || [DEFAULT_FORM.docType]}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, docType: value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Statut</FieldLabel>
                <SelectField
                  value={form.businessStatus}
                  options={options?.businessStatuses || [DEFAULT_FORM.businessStatus]}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, businessStatus: value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Confiance</FieldLabel>
                <SelectField
                  value={form.confidence}
                  options={options?.confidenceLevels || [DEFAULT_FORM.confidence]}
                  onChange={(value) =>
                    setForm((current) => ({ ...current, confidence: value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Date document</FieldLabel>
                <Input
                  type="date"
                  value={form.documentDate}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, documentDate: event.target.value }))
                  }
                  nativeInput
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Produit</FieldLabel>
                <Input
                  value={form.product}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, product: event.target.value }))
                  }
                  placeholder="metacentrex"
                  nativeInput
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Version</FieldLabel>
                <Input
                  value={form.version}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, version: event.target.value }))
                  }
                  placeholder="v1"
                  nativeInput
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <FieldLabel>Fournisseur</FieldLabel>
                <Input
                  value={form.supplier}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, supplier: event.target.value }))
                  }
                  placeholder="Dstny"
                  nativeInput
                />
              </div>
              <div className="space-y-1.5">
                <FieldLabel>Owner</FieldLabel>
                <Input
                  value={form.owner}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, owner: event.target.value }))
                  }
                  placeholder="Xavier"
                  nativeInput
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Mots-clés</FieldLabel>
              <Input
                value={form.keywords}
                onChange={(event) =>
                  setForm((current) => ({ ...current, keywords: event.target.value }))
                }
                placeholder="metacentrex, pricing, wholesale"
                nativeInput
              />
            </div>
            <div className="space-y-1.5">
              <FieldLabel>Résumé court</FieldLabel>
              <textarea
                value={form.summary}
                onChange={(event) =>
                  setForm((current) => ({ ...current, summary: event.target.value }))
                }
                rows={4}
                className="w-full resize-none rounded-lg border border-primary-200 bg-surface p-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 dark:border-neutral-800 dark:bg-neutral-950"
              />
            </div>
            <Button type="submit" className="w-full" disabled={uploading}>
              <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.7} />
              {uploading ? 'Chargement...' : 'Ajouter au registre'}
            </Button>
          </div>
        </form>

        <section className="grid min-h-0 grid-rows-[minmax(220px,1fr)_minmax(260px,0.95fr)]">
          <div className="min-h-0 overflow-auto border-b border-primary-200 dark:border-neutral-800">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-primary-200 bg-[var(--theme-bg)] text-xs uppercase text-primary-500 dark:border-neutral-800 dark:text-neutral-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Document</th>
                  <th className="px-3 py-2 font-semibold">Collection</th>
                  <th className="px-3 py-2 font-semibold">Canal</th>
                  <th className="px-3 py-2 font-semibold">Statut</th>
                  <th className="px-3 py-2 font-semibold">RAG</th>
                  <th className="px-3 py-2 text-right font-semibold">Taille</th>
                </tr>
              </thead>
              <tbody>
                {documentsQuery.isLoading ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-primary-500" colSpan={6}>
                      Chargement...
                    </td>
                  </tr>
                ) : documents.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-primary-500" colSpan={6}>
                      Aucun document
                    </td>
                  </tr>
                ) : (
                  documents.map((document) => (
                    <tr
                      key={document.id}
                      onClick={() => {
                        setSelectedId(document.id)
                        setPrompt('')
                      }}
                      className={cn(
                        'cursor-pointer border-b border-primary-100 transition-colors hover:bg-primary-100/70 dark:border-neutral-900 dark:hover:bg-neutral-900',
                        selected?.id === document.id &&
                          'bg-accent-500/10 hover:bg-accent-500/10',
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{document.title}</div>
                        <div className="mt-0.5 truncate text-xs text-primary-500">
                          {document.originalName}
                        </div>
                      </td>
                      <td className="px-3 py-3">{optionLabel(document.collection)}</td>
                      <td className="px-3 py-3">{optionLabel(document.channel)}</td>
                      <td className="px-3 py-3">{optionLabel(document.businessStatus)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            'inline-flex rounded-full border px-2 py-0.5 text-xs font-medium',
                            statusTone(document.ingestionStatus),
                          )}
                        >
                          {document.ingestionStatus}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {formatBytes(document.sizeBytes)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="min-h-0 overflow-y-auto p-4">
            {selected ? (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                <div className="min-w-0 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">
                        {selected.title}
                      </h2>
                      <div className="mt-1 text-xs text-primary-500">
                        Ajouté le {formatDate(selected.uploadedAt)} · Mis à jour le {formatDate(selected.updatedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={ingestingId === selected.id}
                        onClick={() => void handleIngest(selected)}
                      >
                        <HugeiconsIcon icon={BrainIcon} size={15} strokeWidth={1.7} />
                        {ingestingId === selected.id ? 'Indexation...' : 'Indexer'}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handlePrompt(selected)}
                      >
                        <HugeiconsIcon icon={Link01Icon} size={15} strokeWidth={1.7} />
                        Prompt analyse
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    <MetaItem label="Collection" value={optionLabel(selected.collection)} />
                    <MetaItem label="Produit" value={selected.product || '-'} />
                    <MetaItem label="Canal" value={optionLabel(selected.channel)} />
                    <MetaItem label="Type" value={optionLabel(selected.docType)} />
                    <MetaItem label="Confiance" value={optionLabel(selected.confidence)} />
                    <MetaItem label="Date doc." value={formatDate(selected.documentDate)} />
                    <MetaItem label="Fournisseur" value={selected.supplier || '-'} />
                    <MetaItem label="Owner" value={selected.owner || '-'} />
                    <MetaItem label="Version" value={selected.version || '-'} />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]">
                    <div className="space-y-1.5">
                      <FieldLabel>Statut métier</FieldLabel>
                      <SelectField
                        value={selected.businessStatus}
                        options={options?.businessStatuses || [selected.businessStatus]}
                        onChange={(value) => void updateSelectedStatus(value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabel>Mots-clés</FieldLabel>
                      <div className="flex min-h-8 flex-wrap gap-1.5 rounded-lg border border-primary-200 px-2 py-1.5 dark:border-neutral-800">
                        {selected.keywords.length ? (
                          selected.keywords.map((keyword) => (
                            <span
                              key={keyword}
                              className="rounded-full bg-primary-100 px-2 py-0.5 text-xs dark:bg-neutral-900"
                            >
                              {keyword}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-primary-500">-</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <HugeiconsIcon icon={CheckListIcon} size={16} strokeWidth={1.7} />
                      Résumé
                    </div>
                    <p className="text-sm leading-6 text-primary-700 dark:text-neutral-300">
                      {selected.summary || 'Résumé non renseigné.'}
                    </p>
                    {selected.lastError ? (
                      <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-700 dark:text-red-300">
                        {selected.lastError}
                      </p>
                    ) : null}
                  </div>
                </div>

                <aside className="min-w-0 rounded-lg border border-primary-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between border-b border-primary-200 px-3 py-2 dark:border-neutral-800">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <HugeiconsIcon icon={Clock01Icon} size={16} strokeWidth={1.7} />
                      Prompt
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!prompt}
                      onClick={() => {
                        void navigator.clipboard?.writeText(prompt)
                        toast('Prompt copié.', { type: 'success' })
                      }}
                    >
                      Copier
                    </Button>
                  </div>
                  <textarea
                    value={prompt}
                    readOnly
                    placeholder="Génère un prompt d’analyse depuis le document sélectionné."
                    className="h-[260px] w-full resize-none bg-transparent p-3 text-sm leading-6 outline-none"
                  />
                </aside>
              </div>
            ) : (
              <div className="flex h-full min-h-[220px] items-center justify-center text-sm text-primary-500">
                Sélectionne un document
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
      <div className="text-xs text-primary-500">{label}</div>
      <div className="mt-1 truncate text-sm font-medium">{value}</div>
    </div>
  )
}
