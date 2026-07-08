import { HugeiconsIcon } from '@hugeicons/react'
import {
  CheckListIcon,
  File01Icon,
  LayoutTable01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type TemplateSection = {
  id: string
  title: string
  purpose: string
  required: boolean
}

type TemplateQualityRule = {
  id: string
  label: string
  severity: 'info' | 'warning' | 'blocking'
}

type DeliverableTemplate = {
  id: string
  name: string
  type: string
  productFamily: string
  channel: string
  status: string
  version: string
  description: string
  requiredSources: Array<string>
  sections: Array<TemplateSection>
  prompts: Record<string, string>
  qualityRules: Array<TemplateQualityRule>
  renderTarget: string
  createdAt: string
  updatedAt: string
}

type TemplatesResponse = {
  ok?: boolean
  templates?: Array<DeliverableTemplate>
  error?: string
}

async function readJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
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

function label(value: string): string {
  const labels: Record<string, string> = {
    fiche_produit_pdf: 'Fiche produit PDF',
    battle_card: 'Battle card',
    one_pager: 'One pager',
    support_interne: 'Support interne',
    tous: 'Tous canaux',
    direct: 'Direct',
    ambassadeur: 'Ambassadeur',
    operateur: 'Opérateur',
    interne: 'Interne',
    brouillon: 'Brouillon',
    a_valider: 'À valider',
    valide: 'Validé',
    obsolete: 'Obsolète',
    html_pdf: 'HTML vers PDF',
  }
  return labels[value] || value.replace(/_/g, ' ')
}

function toneFor(value: string): string {
  if (value === 'valide') return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
  if (value === 'blocking') return 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
  if (value === 'warning' || value === 'a_valider') return 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300'
  return 'border-accent-500/30 bg-accent-500/10 text-accent-700 dark:text-accent-300'
}

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium', tone)}>
      {children}
    </span>
  )
}

export function DstnyTemplatesScreen() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const templatesQuery = useQuery({
    queryKey: ['dstny-templates'],
    queryFn: () => readJson<TemplatesResponse>('/api/dstny-templates/list'),
  })

  const templates = templatesQuery.data?.templates || []
  const filteredTemplates = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((template) =>
      [
        template.name,
        template.description,
        template.type,
        template.channel,
        template.productFamily,
        ...template.requiredSources,
      ].join(' ').toLowerCase().includes(q),
    )
  }, [query, templates])
  const selected =
    filteredTemplates.find((template) => template.id === selectedId) ||
    filteredTemplates[0] ||
    null

  return (
    <div className="grid h-full min-h-0 grid-cols-1 bg-[var(--theme-bg)] text-primary-900 dark:text-neutral-100 xl:grid-cols-[380px_minmax(0,1fr)]">
      <aside className="min-h-0 border-r border-primary-200 dark:border-neutral-800">
        <div className="border-b border-primary-200 p-4 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={LayoutTable01Icon} size={18} strokeWidth={1.7} />
            <h2 className="text-base font-semibold">Templates Dstny</h2>
          </div>
          <p className="mt-2 text-xs leading-5 text-primary-600 dark:text-neutral-400">
            Bibliothèque de modèles métier, prompts et règles qualité pour produire des livrables cohérents.
          </p>
          <div className="relative mt-3">
            <HugeiconsIcon
              icon={Search01Icon}
              size={15}
              strokeWidth={1.7}
              className="absolute left-2.5 top-2.5 text-primary-500"
            />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un template"
              className="h-9 pl-8"
            />
          </div>
        </div>

        <div className="min-h-0 overflow-y-auto p-3">
          {templatesQuery.isLoading ? (
            <div className="p-4 text-sm text-primary-500">Chargement...</div>
          ) : filteredTemplates.length === 0 ? (
            <div className="p-4 text-sm text-primary-500">Aucun template.</div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setSelectedId(template.id)}
                  className={cn(
                    'w-full rounded-lg border p-3 text-left transition',
                    selected?.id === template.id
                      ? 'border-primary-500 bg-primary-100 dark:bg-neutral-900'
                      : 'border-primary-200 hover:bg-primary-50 dark:border-neutral-800 dark:hover:bg-neutral-900',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{template.name}</div>
                      <div className="mt-1 line-clamp-2 text-xs text-primary-600 dark:text-neutral-400">
                        {template.description}
                      </div>
                    </div>
                    <Badge tone={toneFor(template.status)}>{label(template.status)}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone="border-primary-200 bg-transparent text-primary-500 dark:border-neutral-800">
                      {label(template.channel)}
                    </Badge>
                    <Badge tone="border-primary-200 bg-transparent text-primary-500 dark:border-neutral-800">
                      {template.version}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="min-h-0 overflow-y-auto p-4">
        {selected ? (
          <div className="mx-auto max-w-6xl space-y-4">
            <section className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <HugeiconsIcon icon={File01Icon} size={18} strokeWidth={1.7} />
                    <h2 className="text-lg font-semibold">{selected.name}</h2>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-primary-700 dark:text-neutral-300">
                    {selected.description}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone={toneFor(selected.status)}>{label(selected.status)}</Badge>
                  <Badge tone="border-primary-200 bg-transparent text-primary-600 dark:border-neutral-800 dark:text-neutral-300">
                    {label(selected.type)}
                  </Badge>
                  <Badge tone="border-primary-200 bg-transparent text-primary-600 dark:border-neutral-800 dark:text-neutral-300">
                    {label(selected.renderTarget)}
                  </Badge>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <InfoBox label="Canal" value={label(selected.channel)} />
                <InfoBox label="Famille produit" value={label(selected.productFamily)} />
                <InfoBox label="Version" value={selected.version} />
              </div>
            </section>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
              <section className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                <div className="flex items-center gap-2">
                  <HugeiconsIcon icon={CheckListIcon} size={17} strokeWidth={1.7} />
                  <h3 className="text-sm font-semibold">Sections obligatoires</h3>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {selected.sections.map((section) => (
                    <article key={section.id} className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{section.title}</div>
                        {section.required ? <Badge tone={toneFor('warning')}>obligatoire</Badge> : null}
                      </div>
                      <p className="mt-2 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                        {section.purpose}
                      </p>
                    </article>
                  ))}
                </div>
              </section>

              <aside className="space-y-4">
                <section className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">Sources obligatoires</h3>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {selected.requiredSources.map((source) => (
                      <Badge key={source} tone={toneFor('warning')}>{label(source)}</Badge>
                    ))}
                  </div>
                </section>

                <section className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
                  <h3 className="text-sm font-semibold">Règles qualité</h3>
                  <div className="mt-3 space-y-2">
                    {selected.qualityRules.map((rule) => (
                      <div key={rule.id} className={cn('rounded-lg border p-3 text-xs leading-5', toneFor(rule.severity))}>
                        <span className="font-semibold">{label(rule.severity)} : </span>
                        {rule.label}
                      </div>
                    ))}
                  </div>
                </section>
              </aside>
            </div>

            <section className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
              <h3 className="text-sm font-semibold">Prompts associés</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {Object.entries(selected.prompts).map(([role, prompt]) => (
                  <article key={role} className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
                    <div className="text-sm font-semibold capitalize">{label(role)}</div>
                    <p className="mt-2 text-xs leading-5 text-primary-600 dark:text-neutral-400">
                      {prompt}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="p-6 text-sm text-primary-500">Sélectionne un template.</div>
        )}
      </main>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-primary-200 p-3 dark:border-neutral-800">
      <div className="text-xs text-primary-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  )
}
