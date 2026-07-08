import { HugeiconsIcon } from '@hugeicons/react'
import {
  File01Icon,
  Folder01Icon,
  LayoutTable01Icon,
  Rocket01Icon,
} from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DstnyDocumentsScreen } from '@/screens/dstny-documents/dstny-documents-screen'
import { ProjectsScreen } from '@/screens/projects/projects-screen'
import { cn } from '@/lib/utils'

type CockpitTab = 'projects' | 'documents' | 'templates'

const tabs: Array<{
  id: CockpitTab
  label: string
  icon: unknown
  description: string
}> = [
  {
    id: 'projects',
    label: 'Projets',
    icon: Folder01Icon,
    description: 'Piloter les demandes, sources, artefacts, décisions et plans IA.',
  },
  {
    id: 'documents',
    label: 'Documents',
    icon: File01Icon,
    description: 'Mettre à disposition les sources Dstny et préparer le RAG métier.',
  },
  {
    id: 'templates',
    label: 'Templates',
    icon: LayoutTable01Icon,
    description: 'Structurer les livrables récurrents avant production PDF.',
  },
]

export function DstnyCockpitScreen() {
  const [activeTab, setActiveTab] = useState<CockpitTab>('projects')
  const active = tabs.find((tab) => tab.id === activeTab) || tabs[0]

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--theme-bg)] text-primary-900 dark:text-neutral-100">
      <header className="shrink-0 border-b border-primary-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Rocket01Icon} size={18} strokeWidth={1.7} />
              <h1 className="text-lg font-semibold tracking-tight">Cockpit Dstny</h1>
            </div>
            <p className="mt-1 text-xs leading-5 text-primary-600 dark:text-neutral-400">
              Point d’entrée unique pour projets, sources, templates, livrables et missions IA.
            </p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                type="button"
                size="sm"
                variant={activeTab === tab.id ? 'default' : 'outline'}
                onClick={() => setActiveTab(tab.id)}
              >
                <HugeiconsIcon icon={tab.icon as any} size={15} strokeWidth={1.7} />
                {tab.label}
              </Button>
            ))}
          </nav>
        </div>
        <div className="mt-3 rounded-lg border border-primary-200 bg-primary-50/60 px-3 py-2 text-xs leading-5 text-primary-600 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-400">
          <span className="font-semibold text-primary-800 dark:text-neutral-200">
            {active.label}
          </span>
          {' : '}
          {active.description}
        </div>
      </header>

      <main className={cn('min-h-0 flex-1', activeTab === 'templates' && 'overflow-y-auto')}>
        {activeTab === 'projects' ? <ProjectsScreen /> : null}
        {activeTab === 'documents' ? <DstnyDocumentsScreen /> : null}
        {activeTab === 'templates' ? <TemplatesPlaceholder /> : null}
      </main>
    </div>
  )
}

function TemplatesPlaceholder() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-6">
      <section className="rounded-lg border border-primary-200 p-5 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <HugeiconsIcon icon={LayoutTable01Icon} size={18} strokeWidth={1.7} />
          <h2 className="text-base font-semibold">Template Library Dstny</h2>
        </div>
        <p className="mt-3 text-sm leading-6 text-primary-700 dark:text-neutral-300">
          Cette brique devient la prochaine étape du cockpit. Elle doit définir les
          modèles de livrables avant toute génération PDF récurrente, pour éviter
          les rendus incohérents, les hallucinations et les règles pricing floues.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['Fiche produit PDF - Tous canaux', 'Template générique avant déclinaison Direct, Ambassadeur ou Opérateur.'],
          ['Fiche produit PDF - Direct', 'Version orientée client final et bénéfices commerciaux.'],
          ['Fiche produit PDF - Ambassadeur', 'Version revendeur commissionné, simple à vendre et à reprendre.'],
          ['Fiche produit PDF - Opérateur', 'Version achat/revente, intégration catalogue et marge partenaire.'],
        ].map(([title, detail]) => (
          <article key={title} className="rounded-lg border border-primary-200 p-4 dark:border-neutral-800">
            <h3 className="text-sm font-semibold">{title}</h3>
            <p className="mt-2 text-xs leading-5 text-primary-600 dark:text-neutral-400">
              {detail}
            </p>
          </article>
        ))}
      </div>

      <section className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm leading-6 text-amber-700 dark:text-amber-300">
        Prochain lot recommandé : créer le registre de templates versionnés,
        puis rattacher chaque projet à un template validé.
      </section>
    </div>
  )
}
