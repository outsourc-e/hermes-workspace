export const RUN_ID_MAX_LENGTH = 128

const SAFE_RUN_ID_PATTERN = /^[A-Za-z0-9_-]+$/

/**
 * Run ids cross an upstream trust boundary and are also used as filesystem
 * names. Keep them opaque and portable: no separators, dots, percent-encoded
 * forms, whitespace, control characters, or unbounded values.
 */
export function isSafeRunId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= RUN_ID_MAX_LENGTH &&
    SAFE_RUN_ID_PATTERN.test(value)
  )
}

export function assertSafeRunId(value: unknown): asserts value is string {
  if (!isSafeRunId(value)) {
    throw new Error('Invalid run id: expected a bounded opaque identifier')
  }
}
