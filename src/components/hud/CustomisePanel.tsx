import { useHUDConfig, useHUDConfigPatch } from './hooks/useHUDConfig'

interface Props {
  open: boolean
  onClose: () => void
}

export function CustomisePanel({ open, onClose }: Props) {
  const { data: cfg } = useHUDConfig()
  const patch = useHUDConfigPatch()

  if (!open) return null

  if (!cfg) {
    return (
      <div
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <div className="bg-[#0d1117] border border-[#21262d] rounded-lg p-6 text-[#8b949e]">
          loading…
        </div>
      </div>
    )
  }

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-[#0d1117] border border-[#21262d] rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex justify-between items-center mb-4">
          <h2 className="text-[#c4b5fd] font-bold tracking-wider text-sm">
            CUSTOMISE HUD
          </h2>
          <button
            onClick={onClose}
            className="text-[#8b949e] hover:text-white text-lg leading-none"
            aria-label="close"
          >
            ✕
          </button>
        </header>
        <div className="max-h-96 overflow-y-auto space-y-1">
          {Object.entries(cfg.widgets).map(([id, enabled]) => (
            <label
              key={id}
              className="flex items-center gap-2 py-1 px-2 rounded hover:bg-[#161b22] cursor-pointer"
            >
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) =>
                  patch.mutate({ widgets: { [id]: e.target.checked } })
                }
              />
              <span className="text-sm text-[#e6edf3]">{id}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
