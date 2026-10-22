// The printable closure letter: what it says (pure) and how its justified,
// partly underlined paragraphs wrap (pure, given a text measurer).

export interface ClosureLetterItem {
  odNo: string
  fdNos: string[]
}

export interface ClosureLetterInput {
  bank: string
  branchName: string
  branchAddress: string
  name: string
  cif: string
  savingsAccountNo: string
  items: ClosureLetterItem[]
  /** Already formatted, e.g. "7 Mar 2026". */
  date: string
}

/** A piece of paragraph text; underlined pieces get a rule under them. */
export interface Run {
  text: string
  underline?: boolean
}

export interface ClosureLetter {
  to: string[]
  from: string[]
  subject: string
  request: Run[]
  table: { head: [string, string]; rows: [string, string][] }
  debit: Run[]
  thanks: string
  signature: string
  place: string
  date: string
}

const BANK_NAMES: Record<string, string> = { SBI: 'State Bank of India' }

export const LETTER_SUBJECT =
  'Request for closure of OD account taken against FD and removal of lien on corresponding FD'

/** "Calicut" -> "Calicut Branch"; a name already ending in "Branch" is kept. */
export function branchLine(name: string): string {
  const n = name.trim()
  if (!n) return ''
  return /\bbranch$/i.test(n) ? n : `${n} Branch`
}

export function closureLetter(input: ClosureLetterInput): ClosureLetter {
  const many = input.items.length > 1
  const address = input.branchAddress.trim()
  return {
    to: ['The Manager', BANK_NAMES[input.bank] ?? input.bank, branchLine(input.branchName), address].filter(Boolean),
    from: [input.name, `CIF No. - ${input.cif}`],
    subject: LETTER_SUBJECT,
    request: [
      { text: 'I hereby request you to take necessary actions to ' },
      { text: many ? 'close my OD accounts' : 'close my OD account', underline: true },
      { text: ' mentioned below and ' },
      { text: 'remove the lien', underline: true },
      { text: many ? ' against their linked FD Accounts.' : ' against its linked FD Account.' },
    ],
    table: {
      head: ['OD Account', 'Linked FD Account'],
      rows: input.items.map((it) => [it.odNo, it.fdNos.filter(Boolean).join(', ') || '—']),
    },
    debit: [
      { text: `The closure can be made by debiting the required amount from my Savings Account No. ${input.savingsAccountNo}.` },
    ],
    thanks: 'Thanking you',
    signature: input.name,
    place: address.toUpperCase(),
    date: input.date,
  }
}

/** One word as laid out: where it starts on its line and whether to underline it. */
export interface Word {
  text: string
  underline: boolean
  /** Underline the gap after this word too (the next word continues the same underlined run). */
  joinNext: boolean
}

export interface Line {
  words: Word[]
  /** Width of the words alone, without gaps. */
  width: number
  last: boolean
}

/**
 * Greedy word wrap of `runs` into lines no wider than `maxWidth`, measuring with
 * `measure`. A word longer than the line gets a line of its own.
 */
export function wrapRuns(runs: Run[], maxWidth: number, measure: (s: string) => number): Line[] {
  const words: Word[] = []
  let gap = true // whitespace since the last word; without it, text from the next run continues that word
  let gapUnderlined = false
  for (const run of runs) {
    for (const part of run.text.split(/(\s+)/)) {
      if (part === '') continue
      if (/^\s+$/.test(part)) {
        gap = true
        gapUnderlined = !!run.underline
        continue
      }
      const prev = words[words.length - 1]
      if (prev && !gap) {
        prev.text += part
        prev.underline ||= !!run.underline
      } else {
        // A gap is underlined only inside an underlined run, between two underlined words.
        if (prev) prev.joinNext = gapUnderlined && prev.underline && !!run.underline
        words.push({ text: part, underline: !!run.underline, joinNext: false })
      }
      gap = false
    }
  }

  const space = measure(' ')
  const lines: Line[] = []
  let cur: Word[] = []
  let curWidth = 0
  for (const w of words) {
    const ww = measure(w.text)
    const needed = curWidth + (cur.length ? space * cur.length : 0) + ww
    if (cur.length && needed > maxWidth) {
      lines.push({ words: cur, width: curWidth, last: false })
      cur = []
      curWidth = 0
    }
    cur.push(w)
    curWidth += ww
  }
  if (cur.length) lines.push({ words: cur, width: curWidth, last: false })
  if (lines.length) lines[lines.length - 1].last = true
  return lines
}

/** Gap between words on a justified line; the last line keeps normal spacing. */
export function justifiedGap(line: Line, maxWidth: number, space: number): number {
  if (line.last || line.words.length < 2) return space
  return (maxWidth - line.width) / (line.words.length - 1)
}

/** "Closure_of_OD-3488_8045.pdf": the last four digits of each OD. */
export function letterFileName(odNos: string[]): string {
  const tails = odNos.map((n) => n.replace(/\D/g, '').slice(-4) || n).join('_')
  return `Closure_of_OD-${tails}.pdf`
}
