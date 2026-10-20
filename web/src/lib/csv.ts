import Papa from 'papaparse'
import { OD_CHANNELS, OD_STATUSES } from './types'

export function toCsv(rows: Record<string, unknown>[]): string {
  return Papa.unparse(rows.map((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v === null || v === undefined ? '' : v]))))
}

export function download(filename: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// Columns accepted when importing od_accounts. id/user_id/timestamps are never
// taken from a file; savings_account_id is an internal id and is skipped too.
export const OD_IMPORT_COLUMNS = {
  od_account_no: 'text',
  bank: 'text',
  branch_code: 'text',
  channel: 'channel',
  opened_on: 'date',
  sanctioned_limit: 'number',
  current_limit: 'number',
  interest_rate: 'number',
  term_days: 'int',
  expiry_date: 'date',
  original_expiry_date: 'date',
  status: 'status',
  closed_on: 'date',
  closure_requested_on: 'date',
  closure_email_to: 'text',
  lien_released_on: 'date',
  reminder_days: 'int',
  bank_reported_balance: 'number',
  bank_balance_as_of: 'date',
  reference_no: 'text',
  notes: 'text',
} as const
type ColKind = (typeof OD_IMPORT_COLUMNS)[keyof typeof OD_IMPORT_COLUMNS]

export interface ImportRow {
  line: number
  data: Record<string, string | number | null>
  errors: string[]
}

const DMY = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/

function parseValue(raw: string, kind: ColKind): { v: string | number | null; err?: string } {
  const s = raw.trim()
  if (s === '') return { v: null }
  switch (kind) {
    case 'number':
    case 'int': {
      const n = Number(s.replace(/[₹,\s]/g, ''))
      if (!Number.isFinite(n)) return { v: null, err: `"${s}" is not a number` }
      if (kind === 'int' && !Number.isInteger(n)) return { v: null, err: `"${s}" is not a whole number` }
      return { v: n }
    }
    case 'date': {
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return { v: s }
      const m = s.match(DMY) // dd-mm-yyyy, as Indian bank exports write it
      if (m) return { v: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` }
      return { v: null, err: `"${s}" is not a date (use YYYY-MM-DD or DD-MM-YYYY)` }
    }
    case 'status':
      return (OD_STATUSES as string[]).includes(s) ? { v: s } : { v: null, err: `status "${s}" must be one of ${OD_STATUSES.join(', ')}` }
    case 'channel':
      return (OD_CHANNELS as string[]).includes(s) ? { v: s } : { v: null, err: `channel "${s}" must be one of ${OD_CHANNELS.join(', ')}` }
    default:
      return { v: s }
  }
}

/**
 * Parse and validate a CSV of OD accounts. Only columns present in the header
 * are imported, so an upsert never blanks fields the file does not mention.
 */
export function parseOdCsv(text: string): { columns: string[]; ignored: string[]; rows: ImportRow[]; fatal?: string } {
  const res = Papa.parse<Record<string, string>>(text.trim(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim() })
  const header = res.meta.fields ?? []
  const columns = header.filter((h) => h in OD_IMPORT_COLUMNS)
  const ignored = header.filter((h) => !(h in OD_IMPORT_COLUMNS))
  if (!columns.includes('od_account_no')) return { columns, ignored, rows: [], fatal: 'The file needs an od_account_no column' }

  const seen = new Map<string, number>()
  const rows = res.data.map((rec, i) => {
    const line = i + 2
    const data: ImportRow['data'] = {}
    const errors: string[] = []
    for (const c of columns) {
      const { v, err } = parseValue(rec[c] ?? '', OD_IMPORT_COLUMNS[c as keyof typeof OD_IMPORT_COLUMNS])
      if (err) errors.push(`${c}: ${err}`)
      data[c] = v
    }
    const no = data.od_account_no
    if (!no) errors.push('od_account_no is required')
    else if (seen.has(String(no))) errors.push(`duplicate of line ${seen.get(String(no))}`)
    else seen.set(String(no), line)
    if ('status' in data && data.status === null) data.status = 'active'
    if ('bank' in data && data.bank === null) data.bank = 'SBI'
    return { line, data, errors }
  })
  return { columns, ignored, rows }
}
