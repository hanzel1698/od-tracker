import { describe, expect, it } from 'vitest'
import {
  availableLimit,
  currentOutstanding,
  parseIsoDate,
  portfolioTotals,
  remainingDays,
  todayIso,
  utilisationRatio,
} from './domain'
import type { OdAccountWithTransactions, OdTransaction, TransactionType } from './types'

function tx(type: TransactionType, amount: number, date = '2026-01-01'): OdTransaction {
  return {
    id: `${type}-${amount}-${date}`,
    od_id: 'od-1',
    user_id: 'user-1',
    type,
    amount,
    date,
    notes: '',
    created_at: `${date}T00:00:00Z`,
  }
}

function account(
  approvedLimit: number,
  transactions: OdTransaction[],
  status: 'ACTIVE' | 'CLOSED' = 'ACTIVE',
): OdAccountWithTransactions {
  return {
    account: {
      id: 'od-1',
      user_id: 'user-1',
      od_number: 'OD-001',
      approved_limit: approvedLimit,
      underlying_fd_no: 'FD-001',
      fd_maturity_date: '2027-01-01',
      interest_rate: 7.5,
      status,
      lien_removed: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
    transactions,
  }
}

describe('currentOutstanding', () => {
  it('is zero with no transactions', () => {
    expect(currentOutstanding([])).toBe(0)
  })

  it('adds withdrawals and interest, subtracts repayments', () => {
    const transactions = [
      tx('WITHDRAWAL', 50_000),
      tx('INTEREST', 1_200),
      tx('REPAYMENT', 20_000),
    ]
    expect(currentOutstanding(transactions)).toBe(31_200)
  })

  it('reports an overpayment as a negative balance rather than clamping', () => {
    expect(currentOutstanding([tx('WITHDRAWAL', 1_000), tx('REPAYMENT', 1_500)])).toBe(-500)
  })
})

describe('availableLimit', () => {
  it('is the limit less what is outstanding', () => {
    expect(availableLimit(100_000, 31_200)).toBe(68_800)
  })

  it('floors at zero when the limit is exhausted', () => {
    expect(availableLimit(100_000, 120_000)).toBe(0)
  })
})

describe('remainingDays', () => {
  const today = new Date(2026, 8, 12) // 12 Sep 2026, local time

  it('counts whole days to a future maturity', () => {
    expect(remainingDays('2026-09-22', today)).toBe(10)
  })

  it('is zero on the maturity date itself', () => {
    expect(remainingDays('2026-09-12', today)).toBe(0)
  })

  it('is zero once the date has passed', () => {
    expect(remainingDays('2026-01-01', today)).toBe(0)
  })

  it('does not drift with the time of day', () => {
    const morning = new Date(2026, 8, 12, 1, 0, 0)
    const night = new Date(2026, 8, 12, 23, 59, 0)
    expect(remainingDays('2026-09-22', morning)).toBe(remainingDays('2026-09-22', night))
  })

  it('is zero for an unparseable date', () => {
    expect(remainingDays('not-a-date', today)).toBe(0)
  })
})

describe('utilisationRatio', () => {
  it('is the drawn share of the limit', () => {
    expect(utilisationRatio(100_000, 25_000)).toBe(0.25)
  })

  it('clamps above the limit and below zero', () => {
    expect(utilisationRatio(100_000, 150_000)).toBe(1)
    expect(utilisationRatio(100_000, -500)).toBe(0)
  })

  it('is zero rather than NaN when there is no limit', () => {
    expect(utilisationRatio(0, 5_000)).toBe(0)
  })
})

describe('portfolioTotals', () => {
  it('sums limits and outstanding across accounts', () => {
    const totals = portfolioTotals([
      account(100_000, [tx('WITHDRAWAL', 40_000)]),
      account(50_000, [tx('WITHDRAWAL', 30_000), tx('REPAYMENT', 10_000)]),
    ])

    expect(totals.totalLimit).toBe(150_000)
    expect(totals.totalOutstanding).toBe(60_000)
    expect(totals.totalAvailable).toBe(90_000)
  })

  it('is all zeroes for an empty portfolio', () => {
    expect(portfolioTotals([])).toEqual({
      totalLimit: 0,
      totalOutstanding: 0,
      totalAvailable: 0,
    })
  })
})

describe('parseIsoDate', () => {
  it('parses a calendar date at UTC midnight', () => {
    const parsed = parseIsoDate('2026-09-12')
    expect(parsed?.toISOString()).toBe('2026-09-12T00:00:00.000Z')
  })

  it('rejects a day that does not exist in that month', () => {
    expect(parseIsoDate('2026-02-31')).toBeNull()
  })

  it('rejects malformed input', () => {
    expect(parseIsoDate('12/09/2026')).toBeNull()
    expect(parseIsoDate('')).toBeNull()
  })
})

describe('todayIso', () => {
  it('formats the local date, zero padded', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
