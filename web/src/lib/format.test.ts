import { describe, expect, it } from 'vitest'
import { formatDate, formatINR, todayISO } from './format'

describe('format', () => {
  it('groups rupees the Indian way', () => {
    expect(formatINR(123456)).toBe('₹1,23,456')
    expect(formatINR(1234567.5)).toBe('₹12,34,567.50')
    expect(formatINR(-0.14)).toBe('-₹0.14')
    expect(formatINR(99.999, { whole: true })).toBe('₹100')
    expect(formatINR(null)).toBe('—')
  })

  it('shows dates as dd MMM yyyy', () => {
    expect(formatDate('2027-03-09')).toBe('09 Mar 2027')
    expect(formatDate(null)).toBe('—')
  })

  it('takes today from the local calendar', () => {
    expect(todayISO(new Date(2026, 9, 20, 23, 30))).toBe('2026-10-20')
  })
})
