import { describe, expect, it } from 'vitest'
import { daysToMaturity, depositValue, interestAtMaturity, summarizeDeposits, termLabel } from './deposits'
import type { DepositType } from './types'

const fd = (o: Partial<{
  deposit_type: DepositType
  principal: number | null
  current_value: number | null
  maturity_amount: number | null
  maturity_date: string | null
  lien_marked: boolean | null
  status: string | null
}>) => ({
  deposit_type: 'FD' as DepositType,
  principal: 10000,
  current_value: null,
  maturity_amount: null,
  maturity_date: null,
  lien_marked: false,
  status: 'active',
  ...o,
})

describe('deposit values', () => {
  it('prefers the bank value over the principal', () => {
    expect(depositValue(fd({ current_value: 10616.66 }))).toBe(10616.66)
    expect(depositValue(fd({}))).toBe(10000)
    expect(depositValue(fd({ principal: null }))).toBe(0)
  })

  it('counts days to maturity, negative once passed', () => {
    expect(daysToMaturity(fd({ maturity_date: '2026-11-03' }), '2026-10-22')).toBe(12)
    expect(daysToMaturity(fd({ maturity_date: '2026-10-20' }), '2026-10-22')).toBe(-2)
    expect(daysToMaturity(fd({}), '2026-10-22')).toBeNull()
  })

  it('gives interest at maturity only for lump-sum FDs', () => {
    expect(interestAtMaturity(fd({ principal: 11000, maturity_amount: 11704 }))).toBe(704)
    expect(interestAtMaturity(fd({ deposit_type: 'RD', principal: null, maturity_amount: 161327 }))).toBeNull()
    expect(interestAtMaturity(fd({ maturity_amount: null }))).toBeNull()
  })

  it('labels terms in years when whole', () => {
    expect(termLabel(12)).toBe('1 year')
    expect(termLabel(120)).toBe('10 years')
    expect(termLabel(18)).toBe('18 months')
    expect(termLabel(null)).toBe('—')
  })
})

describe('summarizeDeposits', () => {
  const today = '2026-10-22'
  const s = summarizeDeposits(
    [
      fd({ principal: 11000, current_value: 11678.33, maturity_amount: 11704, maturity_date: '2026-11-03' }),
      fd({ principal: 21000, current_value: 22268.85, maturity_amount: 22344, maturity_date: '2026-11-10', lien_marked: true }),
      fd({ principal: 12000, current_value: 12000, maturity_amount: 12768, maturity_date: '2027-05-02' }),
      fd({ deposit_type: 'PPF', principal: null, current_value: 26568 }),
      fd({ principal: 9000, maturity_date: '2026-10-01' }), // matured, not yet updated
      fd({ principal: 50000, status: 'closed', maturity_date: '2025-01-01' }), // ignored
    ],
    today,
  )

  it('totals open deposits and splits lien from free', () => {
    expect(s.count).toBe(5)
    expect(s.principal).toBe(53000)
    expect(s.value).toBe(81515.18)
    expect(s.lienCount).toBe(1)
    expect(s.lienValue).toBe(22268.85)
    expect(s.freeCount).toBe(4)
    expect(s.freeValue).toBe(59246.33)
  })

  it('flags what is due soon and what has already matured', () => {
    expect(s.dueSoonCount).toBe(2)
    expect(s.dueSoonValue).toBe(34048)
    expect(s.maturedCount).toBe(1)
  })
})
