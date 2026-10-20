import { describe, expect, it } from 'vitest'
import { parseOdCsv, toCsv } from './csv'

describe('OD CSV import', () => {
  it('keeps only known columns and parses types', () => {
    const r = parseOdCsv(
      'od_account_no,current_limit,expiry_date,status,channel,id,foo\n' + '10000000004,"10,807",01-06-2027,active,YONO,99,x\n',
    )
    expect(r.columns).toEqual(['od_account_no', 'current_limit', 'expiry_date', 'status', 'channel'])
    expect(r.ignored).toEqual(['id', 'foo'])
    expect(r.rows[0]).toEqual({
      line: 2,
      errors: [],
      data: { od_account_no: '10000000004', current_limit: 10807, expiry_date: '2027-06-01', status: 'active', channel: 'YONO' },
    })
  })

  it('reports bad values, missing and duplicate account numbers', () => {
    const r = parseOdCsv('od_account_no,current_limit,status\nA,abc,open\n,1,active\nA,2,closed\n')
    expect(r.rows[0].errors).toEqual(['current_limit: "abc" is not a number', expect.stringContaining('status "open"')])
    expect(r.rows[1].errors).toEqual(['od_account_no is required'])
    expect(r.rows[2].errors).toEqual(['duplicate of line 2'])
  })

  it('refuses a file without od_account_no', () => {
    expect(parseOdCsv('limit\n5').fatal).toBeDefined()
  })

  it('round-trips through export', () => {
    const csv = toCsv([{ od_account_no: 'X1', notes: 'a, "quoted" note', current_limit: 5000, closed_on: null }])
    const r = parseOdCsv(csv)
    expect(r.rows[0].data).toEqual({ od_account_no: 'X1', notes: 'a, "quoted" note', current_limit: 5000, closed_on: null })
  })
})
