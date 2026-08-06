function normalizedMimeType(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.trim().toLowerCase()
}

function isValidBase64Payload(value: string): boolean {
  if (
    !value ||
    value.length % 4 === 1 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  ) {
    return false
  }
  const paddingIndex = value.indexOf('=')
  return paddingIndex < 0 || value.length % 4 === 0
}

/** Parse exactly the base64 data-URL envelope accepted by `/api/send-stream`. */
export function parsePortableAttachmentDataUrl(
  value: unknown,
  expectedContentType?: unknown,
): { contentType: string; base64: string } | null {
  if (typeof value !== 'string') return null
  const dataUrl = value.trim()
  const match = /^data:([^,;\s]+);base64,([^\s]+)$/iu.exec(dataUrl)
  if (!match || !isValidBase64Payload(match[2]!)) return null

  const contentType = normalizedMimeType(match[1])
  const expected = normalizedMimeType(expectedContentType)
  if (!contentType || (expected && expected !== contentType)) return null
  return { contentType, base64: match[2]! }
}

/** Encode text bytes without changing the text file's declared MIME type. */
export function createTextAttachmentDataUrl(
  text: string,
  contentType: string,
): string | null {
  const normalizedContentType = normalizedMimeType(contentType).split(';', 1)[0]
  if (!normalizedContentType || /[,;\s]/u.test(normalizedContentType))
    return null

  const bytes = new TextEncoder().encode(text)
  if (bytes.length === 0) return null
  let binary = ''
  const chunkSize = 32_768
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return `data:${normalizedContentType};base64,${btoa(binary)}`
}
