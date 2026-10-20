import { describe, expect, it } from 'vitest'
import {
  accrualStart,
  accruedInterest,
  checkDraw,
  closureDifference,
  expiryUnhandled,
  outstanding,
  payoffEstimate,
  previewBalance,
  renewalExpiry,
  runningBalances,
  signedAmount,
} from './calc'
import type { TxnType } from './types'

const t = (id: number, txn_date: string, txn_type: TxnType, amount: number) => ({ id, txn_date, txn_type, amount })

describe('balance', () => {
  it('signs each type as the SQL view does', () => {
    expect(signedAmount('opening_balance', 100)).toBe(100)
    expect(signedAmount('draw', 100)).toBe(100)
    expect(signedAmount('interest', 100)).toBe(100)
    expect(signedAmount('charge', 100)).toBe(100)
    expect(signedAmount('repayment', 100)).toBe(-100)
    expect(signedAmount('closure_debit', 100)).toBe(-100)
    expect(signedAmount('adjustment', -25)).toBe(-25)
    expect(signedAmount('adjustment', 25)).toBe(25)
  })

  it('nets draws, repayments, interest and adjustments', () => {
    const txns = [
      t(1, '2026-01-01', 'draw', 10000),
      t(2, '2026-01-31', 'interest', 61.64),
      t(3, '2026-02-10', 'repayment', 4000),
      t(4, '2026-02-15', 'draw', 1500.5),
      t(5, '2026-02-20', 'adjustment', -0.14),
    ]
    expect(outstanding(txns)).toBe(7562)
  })

  it('gives a chronological running balance, ties broken by id', () => {
    const rows = runningBalances([
      t(3, '2026-02-01', 'repayment', 500),
      t(1, '2026-01-01', 'draw', 1000),
      t(2, '2026-01-31', 'interest', 6.2),
      t(4, '2026-02-01', 'draw', 200),
    ])
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3, 4])
    expect(rows.map((r) => r.balance)).toEqual([1000, 1006.2, 506.2, 706.2])
  })

  it('previews the balance when editing an existing row', () => {
    const txns = [t(1, '2026-01-01', 'draw', 1000), t(2, '2026-01-05', 'repayment', 300)]
    expect(previewBalance(txns, { txn_type: 'interest', amount: 10 })).toBe(710)
    expect(previewBalance(txns, { id: 2, txn_type: 'repayment', amount: 1000 })).toBe(0)
  })
})

describe('accrued interest and payoff', () => {
  it('is outstanding × rate × days / 365', () => {
    // 6000 at 7.25% for 19 days = 22.64 (matches the od_balances view)
    expect(accruedInterest({ outstanding: 6000, ratePct: 7.25, sinceISO: '2026-10-01', todayISO: '2026-10-20' })).toBe(
      22.64,
    )
  })

  it('is zero with nothing owed, no rate, no start date or a future start', () => {
    expect(accruedInterest({ outstanding: 0, ratePct: 7, sinceISO: '2026-01-01', todayISO: '2026-02-01' })).toBe(0)
    expect(accruedInterest({ outstanding: -5, ratePct: 7, sinceISO: '2026-01-01', todayISO: '2026-02-01' })).toBe(0)
    expect(accruedInterest({ outstanding: 100, ratePct: null, sinceISO: '2026-01-01', todayISO: '2026-02-01' })).toBe(0)
    expect(accruedInterest({ outstanding: 100, ratePct: 7, sinceISO: null, todayISO: '2026-02-01' })).toBe(0)
    expect(accruedInterest({ outstanding: 100, ratePct: 7, sinceISO: '2026-03-01', todayISO: '2026-02-01' })).toBe(0)
  })

  it('accrues from the last interest debit, else the first draw', () => {
    expect(accrualStart([t(1, '2026-01-05', 'draw', 1), t(2, '2026-02-10', 'draw', 1)])).toBe('2026-01-05')
    expect(
      accrualStart([t(1, '2026-01-05', 'opening_balance', 1), t(2, '2026-01-31', 'interest', 1), t(3, '2026-02-28', 'interest', 1)]),
    ).toBe('2026-02-28')
    expect(accrualStart([t(1, '2026-01-05', 'repayment', 1)])).toBeNull()
  })

  it('payoff = outstanding + accrued', () => {
    expect(payoffEstimate(6000, 22.64)).toBe(6022.64)
  })

  it('closure difference is what remains after the residual debit', () => {
    expect(closureDifference(6000, 5900)).toBe(100)
    expect(closureDifference(36.4, 36.4)).toBe(0)
    expect(closureDifference(10, 12)).toBe(-2)
  })
})

describe('over-limit check', () => {
  it('allows a draw up to exactly the limit', () => {
    const r = checkDraw({ outstanding: 8000, limit: 10000, amount: 2000 })
    expect(r).toMatchObject({ after: 10000, overLimit: false, blocked: false, excess: 0 })
  })

  it('blocks a draw beyond the limit', () => {
    const r = checkDraw({ outstanding: 8000, limit: 10000, amount: 3000 })
    expect(r).toMatchObject({ after: 11000, overLimit: true, blocked: true, excess: 1000 })
  })

  it('lets "override" in notes through, case-insensitively', () => {
    const r = checkDraw({ outstanding: 8000, limit: 10000, amount: 3000, notes: 'OVERRIDE: bank allowed' })
    expect(r).toMatchObject({ overLimit: true, overridden: true, blocked: false })
  })

  it('treats a missing limit as unlimited', () => {
    expect(checkDraw({ outstanding: 0, limit: null, amount: 1e9 }).blocked).toBe(false)
  })
})

describe('renewal date logic', () => {
  it('adds the renewal period to the old expiry', () => {
    expect(renewalExpiry('2026-10-09')).toBe('2027-10-09')
    expect(renewalExpiry('2026-12-13', 12)).toBe('2027-12-13')
    expect(renewalExpiry('2026-03-31', 6)).toBe('2026-09-30')
  })

  it('clamps a leap day', () => {
    expect(renewalExpiry('2028-02-29')).toBe('2029-02-28')
  })

  it('flags a passed expiry only when no term covers today', () => {
    const today = '2026-10-20'
    expect(expiryUnhandled({ expiryISO: '2026-10-09', todayISO: today, terms: [] })).toBe(true)
    expect(
      expiryUnhandled({
        expiryISO: '2026-10-09',
        todayISO: today,
        terms: [{ start_date: '2026-10-09', expiry_date: '2027-10-09' }],
      }),
    ).toBe(false)
    expect(expiryUnhandled({ expiryISO: '2026-10-20', todayISO: today, terms: [] })).toBe(false)
    expect(expiryUnhandled({ expiryISO: null, todayISO: today, terms: [] })).toBe(false)
  })
})
