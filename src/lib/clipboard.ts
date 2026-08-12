export async function writeTextToClipboard(text: string): Promise<void> {
  const clipboard = (
    globalThis as {
      navigator?: {
        clipboard?: { writeText?: (value: string) => Promise<void> }
      }
    }
  ).navigator?.clipboard

  if (typeof clipboard?.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return
    } catch {
      // Fall through to execCommand for insecure origins / limited browsers.
    }
  }

  if (typeof document === 'undefined') {
    throw new Error('Clipboard unavailable')
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  textarea.style.pointerEvents = 'none'
  textarea.style.top = '0'
  textarea.style.left = '0'

  document.body.appendChild(textarea)
  textarea.focus()
  textarea.select()
  textarea.setSelectionRange(0, text.length)

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('Clipboard unavailable')
    }
  } finally {
    textarea.remove()
  }
}
