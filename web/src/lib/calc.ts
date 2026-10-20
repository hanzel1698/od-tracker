// Ledger arithmetic, mirrored from the SQL views and triggers so the UI can
// preview the effect of an entry before it is saved.
import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { OdTransaction, TxnType } from './types'

type TxnLike = Pick<OdTransaction, 'txn_type' | 'amount'>
type DatedTxn = Pick<OdTransaction, 'id' | 'txn_type' | 'amount' | 'txn_date'>

/** Effect of one entry on what is owed (+ increases the debt). */
export function signedAmount(type: TxnType, amount: number): number {
  switch (type) {
    case 'repayment':
    case 'closure_debit':
      return -Math.abs(amount)
    case 'adjustment':
      return amount
    default:
      return Math.abs(amount)
  }
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function outstanding(txns: TxnLike[]): number {
  return round2(txns.reduce((s, t) => s + signedAmount(t.txn_type, Number(t.amount)), 0))
}

export function sortLedger<T extends DatedTxn>(txns: T[]): T[] {
  return [...txns].sort((a, b) => a.txn_date.localeCompare(b.txn_date) || a.id - b.id)
}

/** Chronological ledger with the balance after each row. */
export function runningBalances<T extends DatedTxn>(txns: T[]): Array<T & { balance: number }> {
  let bal = 0
  return sortLedger(txns).map((t) => {
    bal = round2(bal + signedAmount(t.txn_type, Number(t.amount)))
    return { ...t, balance: bal }
  })
}

export function daysBetween(fromISO: string, toISO: string): number {
  return differenceInCalendarDays(parseISO(toISO), parseISO(fromISO))
}

/**
 * Simple-interest estimate since the last interest debit (or the first draw,
 * if no interest has been debited yet): outstanding × rate/100 × days / 365.
 */
export function accruedInterest(args: {
  outstanding: number
  ratePct: number | null | undefined
  sinceISO: string | null | undefined
  todayISO: string
}): number {
  const { outstanding: owed, ratePct, sinceISO, todayISO } = args
  if (owed <= 0 || !ratePct || !sinceISO) return 0
  const days = Math.max(daysBetween(sinceISO, todayISO), 0)
  return round2((owed * ratePct * days) / 100 / 365)
}

/** Date interest accrues from: last interest debit, else first draw/opening balance. */
export function accrualStart(txns: Pick<OdTransaction, 'txn_type' | 'txn_date'>[]): string | null {
  let lastInterest: string | null = null
  let firstDraw: string | null = null
  for (const t of txns) {
    if (t.txn_type === 'interest' && (!lastInterest || t.txn_date > lastInterest)) lastInterest = t.txn_date
    if ((t.txn_type === 'draw' || t.txn_type === 'opening_balance') && (!firstDraw || t.txn_date < firstDraw))
      firstDraw = t.txn_date
  }
  return lastInterest ?? firstDraw
}

export function payoffEstimate(owed: number, accrued: number): number {
  return round2(owed + accrued)
}

/** What the over-limit trigger decides, so the UI can warn before saving. */
export function checkDraw(args: {
  outstanding: number
  limit: number | null | undefined
  amount: number
  notes?: string | null
}): { after: number; overLimit: boolean; excess: number; overridden: boolean; blocked: boolean } {
  const after = round2(args.outstanding + args.amount)
  const limit = args.limit ?? Infinity
  const overLimit = after > limit
  const overridden = /override/i.test(args.notes ?? '')
  return {
    after,
    overLimit,
    excess: overLimit ? round2(after - limit) : 0,
    overridden,
    blocked: overLimit && !overridden,
  }
}

/** Balance after adding (or replacing) one ledger entry. */
export function previewBalance(
  txns: Pick<OdTransaction, 'id' | 'txn_type' | 'amount'>[],
  entry: { id?: number; txn_type: TxnType; amount: number },
): number {
  const others = txns.filter((t) => t.id !== entry.id)
  return round2(outstanding(others) + signedAmount(entry.txn_type, entry.amount))
}

/** Default new expiry for a renewal: old expiry + N months (Feb 29 clamps to Feb 28). */
export function renewalExpiry(oldExpiryISO: string, months = 12): string {
  return format(addMonths(parseISO(oldExpiryISO), months), 'yyyy-MM-dd')
}

/** Is an OD past expiry with no term covering today? (mirrors od_alerts) */
export function expiryUnhandled(args: {
  expiryISO: string | null
  todayISO: string
  terms: { start_date: string; expiry_date: string }[]
}): boolean {
  const { expiryISO, todayISO, terms } = args
  if (!expiryISO || expiryISO >= todayISO) return false
  return !terms.some((t) => t.start_date <= todayISO && todayISO <= t.expiry_date)
}

/** Closure check: what is left after the residual debit; non-zero needs an adjustment. */
export function closureDifference(owed: number, residual: number): number {
  return round2(owed - residual)
}
