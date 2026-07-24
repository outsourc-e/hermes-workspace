export function hapticTap() {
  try {
    const runtimeNavigator = globalThis as {
      navigator?: { vibrate?: (pattern: number) => boolean }
    }
    runtimeNavigator.navigator?.vibrate?.(8)
  } catch {}
}
