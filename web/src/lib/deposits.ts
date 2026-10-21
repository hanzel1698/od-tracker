// Pure helpers for the deposits portfolio (FDs, the RD, the PPF).
import { daysBetween, round2 } from './calc'
import type { FixedDeposit } from './types'

type Fd = Pick<
  FixedDeposit,
  'deposit_type' | 'principal' | 'current_value' | 'maturity_amount' | 'maturity_date' | 'lien_marked' | 'status'
>

export const isOpenDeposit = (f: Pick<FixedDeposit, 'status'>) => f.status !== 'closed'

/** What the deposit is worth now: the bank's current value, else the principal. */
export const depositValue = (f: Pick<FixedDeposit, 'current_value' | 'principal'>) => Number(f.current_value ?? f.principal ?? 0)

/** Days until maturity (negative once it has passed); null when there is no maturity date. */
export function daysToMaturity(f: Pick<FixedDeposit, 'maturity_date'>, todayISO: string): number | null {
  return f.maturity_date ? daysBetween(todayISO, f.maturity_date) : null
}

/** Interest the FD pays over its term. Only meaningful for a lump-sum deposit. */
export function interestAtMaturity(f: Pick<FixedDeposit, 'deposit_type' | 'principal' | 'maturity_amount'>): number | null {
  if (f.deposit_type !== 'FD' || f.principal == null || f.maturity_amount == null) return null
  return round2(f.maturity_amount - f.principal)
}

/** "1 year", "10 years", "18 months". */
export function termLabel(months: number | null | undefined): string {
  if (!months) return '—'
  if (months % 12 === 0) return `${months / 12} year${months === 12 ? '' : 's'}`
  return `${months} month${months === 1 ? '' : 's'}`
}

export interface DepositSummary {
  count: number
  principal: number
  value: number
  maturityValue: number
  lienCount: number
  lienValue: number
  freeCount: number
  freeValue: number
  dueSoonCount: number
  dueSoonValue: number
  maturedCount: number
}

/** Totals over open deposits. "Due soon" is maturity within `soonDays` (default 30). */
export function summarizeDeposits(fds: Fd[], todayISO: string, soonDays = 30): DepositSummary {
  const s: DepositSummary = {
    count: 0, principal: 0, value: 0, maturityValue: 0, lienCount: 0, lienValue: 0,
    freeCount: 0, freeValue: 0, dueSoonCount: 0, dueSoonValue: 0, maturedCount: 0,
  }
  for (const f of fds) {
    if (!isOpenDeposit(f)) continue
    const v = depositValue(f)
    s.count++
    s.principal += Number(f.principal ?? 0)
    s.value += v
    s.maturityValue += Number(f.maturity_amount ?? 0)
    if (f.lien_marked) {
      s.lienCount++
      s.lienValue += v
    } else {
      s.freeCount++
      s.freeValue += v
    }
    const d = daysToMaturity(f, todayISO)
    if (d != null && d < 0) s.maturedCount++
    else if (d != null && d <= soonDays) {
      s.dueSoonCount++
      s.dueSoonValue += Number(f.maturity_amount ?? v)
    }
  }
  for (const k of ['principal', 'value', 'maturityValue', 'lienValue', 'freeValue', 'dueSoonValue'] as const) s[k] = round2(s[k])
  return s
}
