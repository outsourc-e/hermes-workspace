/**
 * CLI runner for the offline spot-grid backtest (src/server/grid-backtest.ts).
 *
 * Reads deep candle history from ~/.hermes/finance/candles-cache/ (populate it
 * with scripts/backfill-candles.ts first), replays it through runGridBacktest,
 * prints a summary, and saves the full report JSON to
 * ~/.hermes/finance/backtest-reports/ with a grid- prefix.
 *
 * Usage:
 *   pnpm exec tsx scripts/backtest-grid.ts [--symbols BTCUSDT,ETHUSDT]
 *     [--interval 1h] [--days 365] [--min-days-ago 0] [--fee-bps 10] [--grid-count 20]
 *     [--spacing arithmetic|geometric] [--quote-per-grid 5]
 *     [--range-lookback 200] [--upper-stop-pct 0] [--lower-stop-pct 0]
 *     [--auto-recenter] [--chop-gate] [--chop-lookback 50]
 *     [--chop-max-range-pct 15] [--efficiency-gate] [--efficiency-lookback 50]
 *     [--max-efficiency-ratio 30] [--split-pct 70]
 *     [--folds 4] [--fold-train-pct 70] [--rearm-outside 0]
 *     [--absolute-stop-floor]
 */
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  runGridBacktest,
  DEFAULT_GRID_BACKTEST_CONFIG,
} from '../src/server/grid-backtest'
import type {
  GridBacktestConfig,
  GridBacktestReport,
} from '../src/server/grid-backtest'
import {
  buildWalkForwardWindows,
  splitCandlesByIndex,
} from '../src/server/trading-backtest'
import type { Candle } from '../src/server/trading-strategies'

function arg(name: string, fallback: string): string {
  const idx = process.argv.indexOf(`--${name}`)
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function loadCache(
  symbol: string,
  interval: string,
  days: number,
  minDaysAgo = 0,
): Array<Candle> {
  const file = path.join(
    os.homedir(),
    '.hermes',
    'finance',
    'candles-cache',
    `${symbol}-${interval}.json`,
  )
  if (!fs.existsSync(file)) {
    throw new Error(
      `no cached candles at ${file} — run: pnpm exec tsx scripts/backfill-candles.ts --symbols ${symbol} --intervals ${interval}`,
    )
  }
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
    candles: Array<Candle>
  }
  const cutoff = Date.now() - days * 86_400_000
  const upperBound =
    minDaysAgo > 0 ? Date.now() - minDaysAgo * 86_400_000 : Infinity
  return parsed.candles.filter(
    (c) => c.openTime >= cutoff && c.openTime < upperBound,
  )
}

const fmt = (n: number, d = 2) => n.toFixed(d)

function parseSpacing(raw: string): GridBacktestConfig['spacing'] {
  return raw.trim().toLowerCase() === 'arithmetic' ? 'arithmetic' : 'geometric'
}

function reportPath(
  reportDir: string,
  symbols: Array<string>,
  interval: string,
  days: number,
  suffix = '',
): string {
  const symbolSlug = symbols.join('-').toLowerCase()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const unique = `${process.pid}-${process.hrtime.bigint().toString(36)}`
  const suffixPart = suffix ? `-${suffix}` : ''
  return path.join(
    reportDir,
    `grid-${symbolSlug}-${interval}-${days}d${suffixPart}-${stamp}-${unique}.json`,
  )
}

interface GridFoldReport {
  fold: number
  trainEndPct: number
  testStartPct: number
  testEndPct: number
  train: GridBacktestReport
  test: GridBacktestReport
}

function printWalkForwardSummary(
  folds: Array<GridFoldReport>,
  initialTrainPct: number,
) {
  const testReports = folds.map((f) => f.test)
  const totalPnlQuote = testReports.reduce((s, r) => s + r.totalPnlQuote, 0)
  const totalFeesQuote = testReports.reduce((s, r) => s + r.totalFeesQuote, 0)
  const trades = testReports.reduce((s, r) => s + r.trades.length, 0)
  const wins = testReports.reduce(
    (s, r) => s + r.symbolReports.reduce((sw, sr) => sw + sr.wins, 0),
    0,
  )
  const grossProfit = testReports
    .flatMap((r) => r.trades)
    .reduce((s, t) => s + Math.max(0, t.pnlQuote), 0)
  const grossLoss = testReports
    .flatMap((r) => r.trades)
    .reduce((s, t) => s + Math.max(0, -t.pnlQuote), 0)
  const pf =
    grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : null
  const maxDrawdownPct = testReports.reduce(
    (m, r) => Math.max(m, r.maxDrawdownPct),
    0,
  )
  const startingBalanceQuote =
    folds[0]?.test.finalEquityQuote - folds[0]?.test.totalPnlQuote || 0
  const returnPct =
    startingBalanceQuote > 0 ? (totalPnlQuote / startingBalanceQuote) * 100 : 0

  console.log(
    `\nWalk-forward OOS: ${folds.length} folds · initial train ${fmt(initialTrainPct, 1)}%`,
  )
  console.log('─'.repeat(78))
  console.log(
    `OOS realized ${totalPnlQuote >= 0 ? '+' : ''}${fmt(totalPnlQuote)} USDT (${returnPct >= 0 ? '+' : ''}${fmt(returnPct)}%, avg/fold) over ${trades} trades · win ${fmt(trades > 0 ? (wins / trades) * 100 : 0, 1)}% · PF ${pf == null ? '—' : fmt(pf)} · fees ${fmt(totalFeesQuote)} USDT · max fold DD ${fmt(maxDrawdownPct)}%`,
  )
  console.log('\nfolds:')
  console.log(
    '  fold  test window                 train%  train ret  test ret  trades     PF',
  )
  for (const fold of folds) {
    const test = fold.test
    const testGrossProfit = test.trades.reduce(
      (s, t) => s + Math.max(0, t.pnlQuote),
      0,
    )
    const testGrossLoss = test.trades.reduce(
      (s, t) => s + Math.max(0, -t.pnlQuote),
      0,
    )
    const testPf =
      testGrossLoss > 0
        ? testGrossProfit / testGrossLoss
        : testGrossProfit > 0
          ? Infinity
          : null
    console.log(
      `  ${String(fold.fold).padStart(4)}  ${test.from.slice(0, 10)} → ${test.to.slice(0, 10)}  ${fmt(fold.trainEndPct, 1).padStart(6)}  ${fmt(fold.train.returnPct).padStart(9)}  ${fmt(test.returnPct).padStart(8)}  ${String(test.trades.length).padStart(6)}  ${(testPf == null ? '  —' : fmt(testPf)).padStart(5)}`,
    )
  }
}

function printReport(report: GridBacktestReport, title?: string) {
  const config = report.config
  const heading = title ? `${title}: ` : ''
  console.log(
    `\n${heading}Grid backtest ${report.symbols.join('+')} ${report.interval}  ${report.from.slice(0, 10)} → ${report.to.slice(0, 10)}  (${report.candleCount} steps)`,
  )
  const gate = config.chopGate
    ? ` · chop-gate ${(config.chopMaxRangePct * 100).toFixed(0)}%/${config.chopLookbackCandles}c`
    : ''
  const effGate = config.efficiencyGate
    ? ` · efficiency-gate ${(config.maxEfficiencyRatio * 100).toFixed(0)}%/${config.efficiencyLookbackCandles}c`
    : ''
  const stops = [
    config.upperStopPct > 0
      ? `upper-stop ${fmt(config.upperStopPct * 100, 1)}%`
      : '',
    config.lowerStopPct > 0
      ? `lower-stop ${fmt(config.lowerStopPct * 100, 1)}%`
      : '',
  ]
    .filter(Boolean)
    .join(' · ')
  console.log(
    `fees ${fmt(config.feeRatePerSide * 10_000, 0)} bps/side · grid ${config.gridCount} (${config.spacing}) · quote/grid ${config.quotePerGrid} · range lookback ${config.rangeLookbackCandles}c${stops ? ' · ' + stops : ''}${config.autoRecenter ? ' · auto-recenter' : ''}${gate}${effGate}`,
  )
  console.log('─'.repeat(78))
  console.log(
    `equity      ${fmt(report.finalEquityQuote - report.totalPnlQuote)} → ${fmt(report.finalEquityQuote)} USDT  (${report.returnPct >= 0 ? '+' : ''}${fmt(report.returnPct)}%)`,
  )
  console.log(
    `realized    ${report.totalPnlQuote >= 0 ? '+' : ''}${fmt(report.totalPnlQuote)} USDT over ${report.trades.length} trades · fees ${fmt(report.totalFeesQuote)} USDT`,
  )
  console.log(`max drawdown ${fmt(report.maxDrawdownPct)}% (on equity)`)
  const ra = report.riskAdjusted
  console.log(
    `risk-adj    Sharpe ${ra.sharpeRatio == null ? '—' : fmt(ra.sharpeRatio)} · Calmar ${ra.calmarRatio == null ? '—' : fmt(ra.calmarRatio)} · annualized ${ra.annualizedReturnPct == null ? '—' : `${ra.annualizedReturnPct >= 0 ? '+' : ''}${fmt(ra.annualizedReturnPct)}%`}`,
  )
  const bh = Object.entries(report.buyAndHoldReturnPct)
    .map(([s, r]) => `${s} ${r >= 0 ? '+' : ''}${fmt(r)}%`)
    .join(' · ')
  console.log(`buy & hold  ${bh}`)

  console.log('\nper-symbol:')
  console.log(
    '  symbol      trades  win%    pnl(USDT)   PF     stop-outs  chop-pauses',
  )
  for (const s of report.symbolReports) {
    const winPct = s.trades > 0 ? (s.wins / s.trades) * 100 : 0
    console.log(
      `  ${s.symbol.padEnd(11)} ${String(s.trades).padStart(5)}  ${fmt(winPct, 1).padStart(5)}  ${fmt(s.totalPnlQuote).padStart(10)}  ${(Number.isFinite(s.profitFactor) ? fmt(s.profitFactor) : '  —').padStart(5)}  ${String(s.stopOuts).padStart(9)}  ${String(s.chopPauses).padStart(11)}`,
    )
  }
}

function main() {
  const symbols = arg('symbols', 'BTCUSDT,ETHUSDT,SOLUSDT,BNBUSDT,XRPUSDT')
    .split(',')
    .map((s) => s.trim().toUpperCase())
  const interval = arg('interval', '1h')
  const days = Number(arg('days', '365'))
  const minDaysAgo = Number(arg('min-days-ago', '0'))
  const splitPct = Number(arg('split-pct', '0'))
  const foldCount = Number(arg('folds', '0'))
  const foldTrainPct = Number(
    arg('fold-train-pct', splitPct > 0 ? String(splitPct) : '70'),
  )

  const config: GridBacktestConfig = {
    ...DEFAULT_GRID_BACKTEST_CONFIG,
    interval,
    gridCount: Number(
      arg('grid-count', String(DEFAULT_GRID_BACKTEST_CONFIG.gridCount)),
    ),
    spacing: parseSpacing(arg('spacing', DEFAULT_GRID_BACKTEST_CONFIG.spacing)),
    quotePerGrid: Number(
      arg('quote-per-grid', String(DEFAULT_GRID_BACKTEST_CONFIG.quotePerGrid)),
    ),
    feeRatePerSide: Number(arg('fee-bps', '10')) / 10_000,
    rangeLookbackCandles: Number(
      arg(
        'range-lookback',
        String(DEFAULT_GRID_BACKTEST_CONFIG.rangeLookbackCandles),
      ),
    ),
    upperStopPct: Number(arg('upper-stop-pct', '0')) / 100,
    lowerStopPct: Number(arg('lower-stop-pct', '0')) / 100,
    autoRecenter: hasFlag('auto-recenter'),
    chopGate: hasFlag('chop-gate'),
    chopLookbackCandles: Number(
      arg(
        'chop-lookback',
        String(DEFAULT_GRID_BACKTEST_CONFIG.chopLookbackCandles),
      ),
    ),
    chopMaxRangePct: Number(arg('chop-max-range-pct', '15')) / 100,
    efficiencyGate: hasFlag('efficiency-gate'),
    efficiencyLookbackCandles: Number(
      arg(
        'efficiency-lookback',
        String(DEFAULT_GRID_BACKTEST_CONFIG.efficiencyLookbackCandles),
      ),
    ),
    maxEfficiencyRatio: Number(arg('max-efficiency-ratio', '30')) / 100,
    rearmOutsideRangeCandles: Number(arg('rearm-outside', '0')),
    absoluteStopFloorEnabled: hasFlag('absolute-stop-floor'),
  }

  const candlesBySymbol: Record<string, Array<Candle>> = {}
  for (const symbol of symbols)
    candlesBySymbol[symbol] = loadCache(symbol, interval, days, minDaysAgo)

  const reportDir = path.join(
    os.homedir(),
    '.hermes',
    'finance',
    'backtest-reports',
  )
  fs.mkdirSync(reportDir, { recursive: true })

  if (foldCount > 0) {
    const windows = buildWalkForwardWindows(
      candlesBySymbol,
      foldTrainPct,
      foldCount,
    )
    const folds: Array<GridFoldReport> = windows.map((window) => ({
      fold: window.fold,
      trainEndPct: window.trainEndPct,
      testStartPct: window.testStartPct,
      testEndPct: window.testEndPct,
      train: runGridBacktest(window.train, config),
      test: runGridBacktest(window.test, config),
    }))
    printWalkForwardSummary(folds, foldTrainPct)
    const out = reportPath(
      reportDir,
      symbols,
      interval,
      days,
      `folds${foldCount}`,
    )
    fs.writeFileSync(out, JSON.stringify({ config, folds }, null, 2))
    console.log(`\nsaved: ${out}`)
    return
  }

  if (splitPct > 0) {
    const { train, test } = splitCandlesByIndex(candlesBySymbol, splitPct)
    const trainReport = runGridBacktest(train, config)
    const testReport = runGridBacktest(test, config)
    printReport(trainReport, 'TRAIN')
    printReport(testReport, 'TEST (out-of-sample)')
    const out = reportPath(
      reportDir,
      symbols,
      interval,
      days,
      `split${splitPct}`,
    )
    fs.writeFileSync(
      out,
      JSON.stringify({ config, train: trainReport, test: testReport }, null, 2),
    )
    console.log(`\nsaved: ${out}`)
    return
  }

  const report = runGridBacktest(candlesBySymbol, config)
  printReport(report)
  const out = reportPath(reportDir, symbols, interval, days)
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`\nsaved: ${out}`)
}

main()
