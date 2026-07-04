export function isTruthyWarRoomFlag(value: unknown) {
  if (value === true || value === 1) return true
  if (value === false || value === 0 || value == null) return false
  const normalized = String(value).trim().toLowerCase().replace(/[.。]+$/u, '')
  return ['1', 'true', 'yes', 'on', 'v3', 'living-v3'].includes(normalized)
}
