/**
 * The overdraft arithmetic, ported from `OdAccountWithTransactions` in the
 * Android app. Kept as pure functions of plain data so it can be unit tested
 * without a database or a browser.
 */
import type { OdAccountWithTransactions, OdTransaction } from './types'

/**
 * What is still owed on the overdraft.
 *
 * Withdrawals and interest debits push the balance up, repayments pull it back
 * down. The result is deliberately not clamped: a customer who overpays should
 * see the negative balance rather than a tidy zero.
 */
export function currentOutstanding(transactions: readonly OdTransaction[]): number {
  let outstanding = 0
  for (const tx of transactions) {
    switch (tx.type) {
      case 'WITHDRAWAL':
      case 'INTEREST':
        outstanding += tx.amount
        break
      case 'REPAYMENT':
        outstanding -= tx.amount
        break
    }
  }
  return outstanding
}

/** Headroom left on the sanctioned limit, floored at zero. */
export function availableLimit(approvedLimit: number, outstanding: number): number {
  return Math.max(0, approvedLimit - outstanding)
}

/**
 * Whole days from today until the FD matures, floored at zero once the date has
 * passed. Both ends are reduced to local midnight first, so the answer does not
 * drift with the time of day the page happens to be open.
 */
export function remainingDays(maturityDate: string, today: Date = new Date()): number {
  const maturity = parseIsoDate(maturityDate)
  if (maturity === null) return 0

  const startOfToday = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  const diffMs = maturity.getTime() - startOfToday
  if (diffMs < 0) return 0
  return Math.floor(diffMs / 86_400_000)
}

/**
 * Share of the sanctioned limit currently drawn, as 0..1. An account with no
 * limit reads as 0 rather than dividing by zero.
 */
export function utilisationRatio(approvedLimit: number, outstanding: number): number {
  if (approvedLimit <= 0) return 0
  return Math.min(1, Math.max(0, outstanding / approvedLimit))
}

/** Portfolio totals across the accounts handed in (the dashboard passes the active ones). */
export function portfolioTotals(accounts: readonly OdAccountWithTransactions[]): {
  totalLimit: number
  totalOutstanding: number
  totalAvailable: number
} {
  let totalLimit = 0
  let totalOutstanding = 0
  for (const entry of accounts) {
    totalLimit += entry.account.approved_limit
    totalOutstanding += currentOutstanding(entry.transactions)
  }
  return {
    totalLimit,
    totalOutstanding,
    totalAvailable: availableLimit(totalLimit, totalOutstanding),
  }
}

/**
 * Parse a `YYYY-MM-DD` calendar date into a UTC-midnight Date.
 *
 * These dates carry no time zone — an FD matures on a day, not at an instant —
 * so they are pinned to UTC midnight and only ever compared against other
 * dates normalised the same way. Returns null for anything malformed.
 */
export function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  // Rejects real-looking but invalid dates such as 2026-02-31, which JS would
  // otherwise roll forward into March.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

/** Today as `YYYY-MM-DD` in the viewer's own time zone, for date input defaults. */
export function todayIso(today: Date = new Date()): string {
  const year = String(today.getFullYear()).padStart(4, '0')
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
