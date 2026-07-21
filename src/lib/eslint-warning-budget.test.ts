import { describe, expect, it } from 'vitest'
import { evaluateEslintWarningBudget } from './eslint-warning-budget'

const baseline = {
  totalWarnings: 3,
  byRule: { alpha: 2, beta: 1 },
  byFile: { 'a.ts': 2, 'b.ts': 1 },
}

describe('ESLint warning budget', () => {
  it('stays yellow while grandfathered warnings remain', () => {
    expect(
      evaluateEslintWarningBudget(
        {
          totalErrors: 0,
          totalWarnings: 3,
          byRule: { alpha: 2, beta: 1 },
          byFile: { 'a.ts': 2, 'b.ts': 1 },
        },
        baseline,
      ).state,
    ).toBe('warn')
  })

  it('fails when the total grows', () => {
    const result = evaluateEslintWarningBudget(
      {
        totalErrors: 0,
        totalWarnings: 4,
        byRule: { alpha: 3, beta: 1 },
        byFile: { 'a.ts': 3, 'b.ts': 1 },
      },
      baseline,
    )
    expect(result.state).toBe('fail')
    expect(result.regressions.some((item) => item.scope === 'total')).toBe(true)
  })

  it('fails when a new warning replaces a removed warning', () => {
    const result = evaluateEslintWarningBudget(
      {
        totalErrors: 0,
        totalWarnings: 3,
        byRule: { alpha: 1, beta: 1, gamma: 1 },
        byFile: { 'a.ts': 1, 'b.ts': 1, 'new.ts': 1 },
      },
      baseline,
    )
    expect(result.state).toBe('fail')
    expect(result.regressions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ scope: 'rule', key: 'gamma' }),
        expect.objectContaining({ scope: 'file', key: 'new.ts' }),
      ]),
    )
  })

  it('reports debt reduction without mutating the baseline', () => {
    const result = evaluateEslintWarningBudget(
      {
        totalErrors: 0,
        totalWarnings: 1,
        byRule: { alpha: 1 },
        byFile: { 'a.ts': 1 },
      },
      baseline,
    )
    expect(result.state).toBe('warn')
    expect(result.reductionCandidate).toBe(2)
  })
})
