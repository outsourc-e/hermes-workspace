'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Global drag-and-drop → knowledge vault ingest.
 *
 * Invisible until a file is dragged over the window, then shows a full-screen
 * overlay. Dropped files are base64-posted to /api/vault-ingest, which saves
 * them under vault/inbox/ and refreshes the semantic memory index.
 */
export function VaultDropZone() {
  const [dragging, setDragging] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const depth = useRef(0)

  useEffect(() => {
    function hasFiles(event: DragEvent) {
      return Array.from(event.dataTransfer?.types ?? []).includes('Files')
    }
    function onDragEnter(event: DragEvent) {
      if (!hasFiles(event)) return
      depth.current += 1
      setDragging(true)
    }
    function onDragLeave(event: DragEvent) {
      if (!hasFiles(event)) return
      depth.current = Math.max(0, depth.current - 1)
      if (depth.current === 0) setDragging(false)
    }
    function onDragOver(event: DragEvent) {
      if (hasFiles(event)) event.preventDefault()
    }
    async function onDrop(event: DragEvent) {
      if (!hasFiles(event)) return
      event.preventDefault()
      depth.current = 0
      setDragging(false)
      const files = Array.from(event.dataTransfer?.files ?? []).slice(0, 5)
      if (!files.length) return
      setStatus(`Ingesting ${files.length} file${files.length > 1 ? 's' : ''}…`)
      let saved = 0
      for (const file of files) {
        try {
          const buf = await file.arrayBuffer()
          let binary = ''
          const bytes = new Uint8Array(buf)
          const chunk = 0x8000
          for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
          }
          const res = await fetch('/api/vault-ingest', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: file.name,
              contentBase64: btoa(binary),
            }),
          })
          if (res.ok) saved += 1
        } catch {
          /* per-file best-effort */
        }
      }
      setStatus(
        saved
          ? `Saved ${saved}/${files.length} to vault inbox ✓ (indexed for memory)`
          : 'Ingest failed — check server logs.',
      )
      setTimeout(() => setStatus(null), 4000)
    }
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-white/70 px-10 py-8 text-center text-white">
            <div className="text-lg font-semibold">Drop into the vault</div>
            <div className="mt-1 text-sm opacity-80">
              Files land in vault/inbox and become searchable memory
            </div>
          </div>
        </div>
      ) : null}
      {status ? (
        <div className="fixed bottom-4 left-1/2 z-[90] -translate-x-1/2 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-2 text-xs text-[var(--theme-text)] shadow-lg">
          {status}
        </div>
      ) : null}
    </>
  )
}
