import { describe, expect, it } from 'vitest'
import { branchLine, closureLetter, justifiedGap, letterFileName, LETTER_SUBJECT, wrapRuns } from './closureLetter'

const base = {
  bank: 'SBI',
  branchName: 'Calicut',
  branchAddress: 'Mananchira, Kozhikode',
  name: 'A Person',
  cif: '12345678901',
  savingsAccountNo: 'XXXXX000111',
  date: '7 Mar 2026',
}

// Every character is 1 unit wide, so widths are just lengths.
const measure = (s: string) => s.length

describe('closure letter', () => {
  it('addresses the manager of the branch and signs from its locality', () => {
    const L = closureLetter({ ...base, items: [{ odNo: '1', fdNos: ['2'] }] })
    expect(L.to).toEqual(['The Manager', 'State Bank of India', 'Calicut Branch', 'Mananchira, Kozhikode'])
    expect(L.from).toEqual(['A Person', 'CIF No. - 12345678901'])
    expect(L.subject).toBe(LETTER_SUBJECT)
    expect(L.place).toBe('MANANCHIRA, KOZHIKODE')
    expect(L.date).toBe('7 Mar 2026')
    expect(L.signature).toBe('A Person')
  })

  it('leaves out an unset address and keeps an unknown bank as is', () => {
    const L = closureLetter({ ...base, bank: 'HDFC', branchAddress: ' ', items: [{ odNo: '1', fdNos: [] }] })
    expect(L.to).toEqual(['The Manager', 'HDFC', 'Calicut Branch'])
    expect(L.place).toBe('')
  })

  it('tabulates each OD against its FDs and words the request for one or many', () => {
    const many = closureLetter({
      ...base,
      items: [
        { odNo: '43909713488', fdNos: ['43896643282'] },
        { odNo: '43910938045', fdNos: ['43896643099', '43896643100'] },
        { odNo: '3', fdNos: [] },
      ],
    })
    expect(many.table.head).toEqual(['OD Account', 'Linked FD Account'])
    expect(many.table.rows).toEqual([
      ['43909713488', '43896643282'],
      ['43910938045', '43896643099, 43896643100'],
      ['3', '—'],
    ])
    const text = (runs: { text: string }[]) => runs.map((r) => r.text).join('')
    expect(text(many.request)).toBe(
      'I hereby request you to take necessary actions to close my OD accounts mentioned below and remove the lien against their linked FD Accounts.',
    )
    expect(many.request.filter((r) => r.underline).map((r) => r.text)).toEqual(['close my OD accounts', 'remove the lien'])
    expect(text(many.debit)).toBe('The closure can be made by debiting the required amount from my Savings Account No. XXXXX000111.')

    const one = closureLetter({ ...base, items: [{ odNo: '1', fdNos: ['2'] }] })
    expect(text(one.request)).toContain('close my OD account mentioned below')
    expect(text(one.request)).toContain('against its linked FD Account.')
  })

  it('appends "Branch" to the branch name only when it is missing', () => {
    expect(branchLine('Calicut')).toBe('Calicut Branch')
    expect(branchLine('Calicut Branch')).toBe('Calicut Branch')
    expect(branchLine('')).toBe('')
  })

  it('names the file after the last four digits of each OD', () => {
    expect(letterFileName(['43909713488', '43910938045'])).toBe('Closure_of_OD-3488_8045.pdf')
  })
})

describe('wrapRuns', () => {
  it('wraps greedily and marks the last line', () => {
    const lines = wrapRuns([{ text: 'aa bb cc dd' }], 5, measure)
    expect(lines.map((l) => l.words.map((w) => w.text).join(' '))).toEqual(['aa bb', 'cc dd'])
    expect(lines.map((l) => l.last)).toEqual([false, true])
    expect(lines[0].width).toBe(4)
  })

  it('underlines the gaps inside an underlined run but not around it', () => {
    const [line] = wrapRuns([{ text: 'to ' }, { text: 'close my', underline: true }, { text: ' accounts.' }], 100, measure)
    expect(line.words.map((w) => [w.text, w.underline, w.joinNext])).toEqual([
      ['to', false, false],
      ['close', true, true],
      ['my', true, false],
      ['accounts.', false, false],
    ])
  })

  it('joins text across runs when no space separates them', () => {
    const [line] = wrapRuns([{ text: 'lien', underline: true }, { text: '. Next' }], 100, measure)
    expect(line.words.map((w) => w.text)).toEqual(['lien.', 'Next'])
    expect(line.words[0].underline).toBe(true)
  })

  it('gives an over-long word its own line', () => {
    const lines = wrapRuns([{ text: 'a verylongword b' }], 5, measure)
    expect(lines.map((l) => l.words.map((w) => w.text))).toEqual([['a'], ['verylongword'], ['b']])
  })

  it('spreads the slack over the gaps, except on the last line', () => {
    const [first, last] = wrapRuns([{ text: 'aa bb c dd' }], 8, measure)
    expect(justifiedGap(first, 8, 1)).toBe(1.5) // 'aa bb c' = 5 wide, 3 slack over 2 gaps
    expect(justifiedGap(last, 8, 1)).toBe(1)
  })
})
