const MESSAGE_LIST_KEYS = ['messages', 'items', 'data'] as const

export function normalizeSessionMessageList<T>(value: unknown): Array<T> {
  if (Array.isArray(value)) return value as Array<T>
  if (!value || typeof value !== 'object') return []

  const record = value as Record<string, unknown>
  for (const key of MESSAGE_LIST_KEYS) {
    const candidate = record[key]
    if (Array.isArray(candidate)) return candidate as Array<T>
  }
  return []
}
