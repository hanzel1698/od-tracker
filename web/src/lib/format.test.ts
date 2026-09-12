import { describe, expect, it } from 'vitest'
import { formatCurrency, formatCurrencyCompact, formatDate, formatDaysLeft } from './format'

describe('formatDate', () => {
  it('formats as d MMM yyyy', () => {
    expect(formatDate('2027-03-15')).toBe('15 Mar 2027')
    expect(formatDate('2026-01-05')).toBe('5 Jan 2026')
  })

  it('abbreviates September as Sep, not Sept', () => {
    expect(formatDate('2026-09-30')).toBe('30 Sep 2026')
  })

  it('does not shift the date across time zones', () => {
    // UTC midnight read back in UTC: the 1st stays the 1st.
    expect(formatDate('2026-03-01')).toBe('1 Mar 2026')
  })

  it('passes unparseable input through unchanged', () => {
    expect(formatDate('whenever')).toBe('whenever')
  })
})

describe('formatCurrency', () => {
  it('uses Indian lakh grouping', () => {
    expect(formatCurrency(254531.25)).toBe('₹2,54,531.25')
    expect(formatCurrency(500000)).toBe('₹5,00,000.00')
  })

  it('drops the paise in the compact form', () => {
    expect(formatCurrencyCompact(484531.25)).toBe('₹4,84,531')
  })
})

describe('formatDaysLeft', () => {
  it('reads as matured at zero', () => {
    expect(formatDaysLeft(0)).toBe('Matured')
  })

  it('singularises one day', () => {
    expect(formatDaysLeft(1)).toBe('1 day left')
    expect(formatDaysLeft(184)).toBe('184 days left')
  })
})
