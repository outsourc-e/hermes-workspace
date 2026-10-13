import { BotIcon, Rocket01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { WorkflowHelpModal } from '@/components/workflow-help-modal'

export function AgentsScreen() {
  const navigate = useNavigate()

  return (
    <main className="min-h-full bg-surface px-4 pb-24 pt-5 text-primary-900 md:px-6 md:pt-8">
      <section className="mx-auto w-full max-w-[1480px] space-y-5">
        <header className="flex flex-col gap-4 rounded-xl border border-primary-200 bg-primary-50/80 px-5 py-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl border border-accent-500/30 bg-accent-500/10 text-accent-500">
              <HugeiconsIcon icon={BotIcon} size={24} strokeWidth={1.6} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-primary-900">Агенты</h1>
              <p className="mt-1 text-sm text-primary-600">
                Управление агентами рабочего пространства удалено при очистке.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <WorkflowHelpModal
              compact
              eyebrow="Operations"
              title="Как работают операции"
              sections={[
                {
                  title: 'Что делает этот экран',
                  bullets: [
                    '«Операции» — слой настройки и готовности ваших агентов.',
                    'Здесь видно, какие профили настроены, а каким ещё нужна настройка.',
                  ],
                },
                {
                  title: 'Типовой сценарий',
                  bullets: [
                    'Repair or configure agents here first.',
                    'Затем используйте Conductor для запуска миссий и Swarm для совместной работы нескольких исполнителей.',
                  ],
                },
                {
                  title: 'Вопросы и ответы',
                  bullets: [
                    'Needs setup usually means missing model or related runtime configuration.',
                    'Если агент не работает в «Операциях», остальные способы запуска, скорее всего, тоже будут нестабильны.',
                  ],
                },
              ]}
            />
            <Button
              className="bg-accent-500 text-primary-950 hover:bg-accent-400"
              onClick={() => void navigate({ to: '/conductor' })}
            >
              <HugeiconsIcon icon={Rocket01Icon} size={16} strokeWidth={1.8} />
              Открыть Conductor
            </Button>
          </div>
        </header>

        <section className="rounded-xl border border-primary-200 bg-[var(--theme-card)] p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-primary-900">Экран упрощён</h2>
          <p className="mt-2 max-w-2xl text-sm text-primary-600">
            Удалённый демон рабочего пространства и стек проектов обслуживали прежний каталог агентов. Для запуска миссий используйте Conductor, а для просмотра живых сессий — Gateway Conductor.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button
              variant="secondary"
              className="border border-primary-200 bg-[var(--theme-card)] text-primary-700 hover:bg-primary-50"
              onClick={() => void navigate({ to: '/conductor' })}
            >
              Открыть Conductor
            </Button>
            <Button
              className="bg-accent-500 text-primary-950 hover:bg-accent-400"
              onClick={() => void navigate({ to: '/conductor' })}
            >
              Начать миссию
            </Button>
          </div>
        </section>
      </section>
    </main>
  )
}
