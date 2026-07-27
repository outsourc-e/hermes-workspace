import { describe, expect, it } from 'vitest'
import {
  appendFinanceAuditPostgres,
  financePostgresStatus,
  readFinancePostgresStore,
  writeFinancePostgresStore,
} from './finance-postgres-store'
import { createEmptyFinanceDatabase } from './finance-store'

// Regression test for the 2026-07-27 incident: settings.demoTradingGrid held
// test-fixture values in the real production Postgres finance database for
// 2+ days because writeFinanceStore() unconditionally mirrors to Postgres,
// and only the JSON store was isolated by tests (via a $HOME override) —
// this module reads HERMES_PG_*/DATABASE_URL directly, which a $HOME
// override does nothing for. financePostgresEnabled() must short-circuit
// under vitest so no test can ever reach a real `psql` call.
describe('finance-postgres-store test isolation', () => {
  it('never touches Postgres under vitest, regardless of HERMES_FINANCE_STORE', () => {
    const db = createEmptyFinanceDatabase()
    expect(writeFinancePostgresStore(db)).toBe(false)
    expect(readFinancePostgresStore()).toBeNull()
    expect(
      appendFinanceAuditPostgres({
        id: 'test-id',
        action: 'test-action',
        details: {},
        source: 'test',
        createdAt: new Date(0).toISOString(),
      }),
    ).toBe(false)
    expect(financePostgresStatus().enabled).toBe(false)
  })
})
