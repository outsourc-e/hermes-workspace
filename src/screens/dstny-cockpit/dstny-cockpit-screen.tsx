import { HugeiconsIcon } from '@hugeicons/react'
import { File01Icon, Folder01Icon, LayoutTable01Icon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { DstnyDocumentsScreen } from '@/screens/dstny-documents/dstny-documents-screen'
import { DstnyTemplatesScreen } from '@/screens/dstny-templates/dstny-templates-screen'
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
        {activeTab === 'templates' ? <DstnyTemplatesScreen /> : null}
      </main>
    </div>
  )
}
