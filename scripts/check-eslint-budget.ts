import path from 'node:path'
import { readFile } from 'node:fs/promises'
import { ESLint } from 'eslint'
import { evaluateEslintWarningBudget } from '../src/lib/eslint-warning-budget'
import type {
  EslintWarningBaseline,
  EslintWarningSnapshot,
} from '../src/lib/eslint-warning-budget'

const root = process.cwd()
const baselinePath = path.resolve(root, 'config/eslint-warning-baseline.json')
const baseline = JSON.parse(
  await readFile(baselinePath, 'utf8'),
) as EslintWarningBaseline
const eslint = new ESLint({ cache: false, fix: false })
const results = await eslint.lintFiles(['.'])

const snapshot: EslintWarningSnapshot = {
  totalErrors: 0,
  totalWarnings: 0,
  byRule: {},
  byFile: {},
}

for (const result of results) {
  snapshot.totalErrors += result.errorCount
  snapshot.totalWarnings += result.warningCount
  let fileWarnings = 0

  for (const message of result.messages) {
    if (message.severity !== 1) continue
    fileWarnings += 1
    const rule = message.ruleId ?? '<none>'
    snapshot.byRule[rule] = (snapshot.byRule[rule] ?? 0) + 1
  }

  if (fileWarnings > 0) {
    const relativePath = path
      .relative(root, result.filePath)
      .split(path.sep)
      .join('/')
    snapshot.byFile[relativePath] = fileWarnings
  }
}

const evaluation = evaluateEslintWarningBudget(snapshot, baseline)
const payload = {
  generatedAt: new Date().toISOString(),
  baselinePath,
  baselineWarnings: baseline.totalWarnings,
  snapshot,
  evaluation,
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(payload))
} else {
  console.log(
    `[eslint-budget] ${evaluation.state.toUpperCase()} · ${snapshot.totalErrors} errors · ${snapshot.totalWarnings}/${baseline.totalWarnings} warnings`,
  )
  if (evaluation.reductionCandidate > 0) {
    console.log(
      `[eslint-budget] ${evaluation.reductionCandidate} warning(s) can be proposed for baseline removal.`,
    )
  }
  for (const regression of evaluation.regressions.slice(0, 20)) {
    console.error(
      `[eslint-budget] ${regression.scope}:${regression.key} ${regression.current} > ${regression.baseline}`,
    )
  }
}

if (evaluation.state === 'fail') process.exitCode = 1
