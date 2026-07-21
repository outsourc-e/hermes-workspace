export type EslintWarningBaseline = {
  totalWarnings: number
  byRule: Record<string, number>
  byFile: Record<string, number>
}

export type EslintWarningSnapshot = {
  totalErrors: number
  totalWarnings: number
  byRule: Record<string, number>
  byFile: Record<string, number>
}

export type WarningBudgetRegression = {
  scope: 'errors' | 'total' | 'rule' | 'file'
  key: string
  current: number
  baseline: number
}

export type WarningBudgetEvaluation = {
  state: 'pass' | 'warn' | 'fail'
  regressions: Array<WarningBudgetRegression>
  reductionCandidate: number
}

export function evaluateEslintWarningBudget(
  current: EslintWarningSnapshot,
  baseline: EslintWarningBaseline,
): WarningBudgetEvaluation {
  const regressions: Array<WarningBudgetRegression> = []

  if (current.totalErrors > 0) {
    regressions.push({
      scope: 'errors',
      key: 'eslint-errors',
      current: current.totalErrors,
      baseline: 0,
    })
  }

  if (current.totalWarnings > baseline.totalWarnings) {
    regressions.push({
      scope: 'total',
      key: 'all-warnings',
      current: current.totalWarnings,
      baseline: baseline.totalWarnings,
    })
  }

  for (const [rule, count] of Object.entries(current.byRule)) {
    const allowed = baseline.byRule[rule] ?? 0
    if (count > allowed) {
      regressions.push({ scope: 'rule', key: rule, current: count, baseline: allowed })
    }
  }

  for (const [file, count] of Object.entries(current.byFile)) {
    const allowed = baseline.byFile[file] ?? 0
    if (count > allowed) {
      regressions.push({ scope: 'file', key: file, current: count, baseline: allowed })
    }
  }

  return {
    state:
      regressions.length > 0
        ? 'fail'
        : current.totalWarnings > 0
          ? 'warn'
          : 'pass',
    regressions,
    reductionCandidate: Math.max(0, baseline.totalWarnings - current.totalWarnings),
  }
}
