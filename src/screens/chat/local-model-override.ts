// Module-level local model override — set by composer when user picks a local model.
// Avoids prop threading. Reset when switching back to cloud models.
//
// Lives in its own file so chat-screen.tsx remains a components-only module —
// React Fast Refresh requires modules to export only components, otherwise
// HMR falls back to full-page reload.
export let _localModelOverride = ''
export function setLocalModelOverride(model: string) {
  _localModelOverride = model
}
