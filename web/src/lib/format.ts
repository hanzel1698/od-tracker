/** Display formatting: rupees and `d MMM yyyy` dates, matching the Android app. */
import { parseIsoDate } from './domain'

const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 2,
})

/** Whole-rupee variant for headline figures, where the paise are just noise. */
const compactCurrencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/**
 * `d MMM yyyy`, spelled out rather than delegated to Intl.
 *
 * Intl would do this in one line, but recent CLDR releases abbreviate September
 * as "Sept" in en-GB and en-IN, and the abbreviation has moved between ICU
 * versions before. These dates go into a letter addressed to a bank, and the
 * same date has to read identically in the browser and in the test suite under
 * Node, so the month names are pinned here.
 */
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount)
}

export function formatCurrencyCompact(amount: number): string {
  return compactCurrencyFormatter.format(amount)
}

/** Formats a `YYYY-MM-DD` date for display, passing anything unparseable through. */
export function formatDate(isoDate: string): string {
  // Calendar dates are held at UTC midnight, so they are read back in UTC -
  // otherwise a viewer west of Greenwich sees every date a day early.
  const date = parseIsoDate(isoDate)
  if (!date) return isoDate
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

export function formatPercent(rate: number): string {
  return `${rate}%`
}

export function formatDaysLeft(days: number): string {
  if (days === 0) return 'Matured'
  return `${days} ${days === 1 ? 'day' : 'days'} left`
}
