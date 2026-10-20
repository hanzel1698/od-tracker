import { format, parseISO, isValid } from 'date-fns'

const inrPaise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
})

/** ₹1,23,456, or ₹1,23,456.50 when there are paise. */
export function formatINR(n: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  const hasPaise = Math.round(Math.abs(n) * 100) % 100 !== 0
  return (opts.whole || !hasPaise ? inrWhole : inrPaise).format(n)
}

/** ISO date -> "09 Mar 2027". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'dd MMM yyyy') : iso
}

/** Local calendar date as YYYY-MM-DD (not UTC: an evening in IST is still today). */
export function todayISO(now: Date = new Date()): string {
  return format(now, 'yyyy-MM-dd')
}

export function formatPct(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return `${n.toFixed(2)}%`
}

export function humanize(s: string): string {
  return s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase())
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${Math.abs(n) === 1 ? '' : 's'}`
}
