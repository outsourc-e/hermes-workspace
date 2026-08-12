export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-surface/80 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-w-sm rounded-2xl border border-primary-200 bg-surface p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-primary-600">Refresh data</dt>
            <dd className="font-mono text-ink">r</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-primary-600">Toggle shortcuts</dt>
            <dd className="font-mono text-ink">?</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-primary-600">Close dialog</dt>
            <dd className="font-mono text-ink">Esc</dd>
          </div>
        </dl>
        <button
          onClick={onClose}
          className="mt-6 w-full rounded-lg bg-accent-600 py-2 text-sm font-semibold text-white"
        >
          Close
        </button>
      </div>
    </div>
  )
}
