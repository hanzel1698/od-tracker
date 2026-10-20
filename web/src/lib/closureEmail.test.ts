import { describe, expect, it } from 'vitest'
import { buildClosureEmail, CLOSURE_SUBJECT, followUpEmail } from './closureEmail'

const base = {
  to: 'sbi.00861@sbi.co.in',
  savingsAccountNo: 'XXXXX000111',
  name: 'A Person',
  cif: '12345678901',
}

describe('closure email', () => {
  it('numbers several ODs from one branch, with single and multiple FDs', () => {
    const e = buildClosureEmail({
      ...base,
      items: [
        { odNo: '10000000001', fdNos: ['20000000001'] },
        { odNo: '10000000002', fdNos: ['20000000002', '20000000003'] },
        { odNo: 'XXXXX000003', fdNos: [] },
      ],
    })
    expect(e.subject).toBe(CLOSURE_SUBJECT)
    expect(e.body).toBe(
      [
        'Sir,',
        '',
        'Please close my OD account(s) mentioned below and remove the lien against their linked FD accounts. ' +
          'Kindly debit any remaining amount due on these OD accounts from my savings account no. XXXXX000111.',
        '',
        '1. OD No. 10000000001 with linked FD No. 20000000001',
        '2. OD No. 10000000002 with linked FD Nos. 20000000002 and 20000000003',
        '3. OD No. XXXXX000003 with linked FD No. (not recorded)',
        '',
        'Thank you',
        'A Person',
        'CIF No. - 12345678901',
      ].join('\n'),
    )
  })

  it('builds a mailto with to, subject and body URL-encoded', () => {
    const e = buildClosureEmail({ ...base, items: [{ odNo: '1', fdNos: ['2'] }] })
    expect(e.mailto.startsWith('mailto:sbi.00861%40sbi.co.in?subject=Request%20for%20closure')).toBe(true)
    const url = new URL(e.mailto)
    expect(url.searchParams.get('subject')).toBe(CLOSURE_SUBJECT)
    expect(url.searchParams.get('body')).toBe(e.body)
    expect(e.mailto).not.toContain('\n')
  })

  it('includes To and Subject lines in the copyable text', () => {
    const e = buildClosureEmail({ ...base, items: [{ odNo: '1', fdNos: ['2'] }] })
    expect(e.full.split('\n').slice(0, 2)).toEqual([`To: ${base.to}`, `Subject: ${CLOSURE_SUBJECT}`])
  })

  it('writes a follow-up citing the request date', () => {
    const e = followUpEmail({ ...base, requestedOn: '23 Oct 2025', items: [{ odNo: '1', fdNos: ['2'] }] })
    expect(e.subject.startsWith('Follow-up:')).toBe(true)
    expect(e.body).toContain('requested on 23 Oct 2025')
    expect(e.body).toContain('1. OD No. 1 with linked FD No. 2')
  })
})
