import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invalidateAll, useOds } from '@/data/hooks'
import { Button, Card, PageHeader, cx } from '@/components/ui'
import { errorMessage, supabase } from '@/lib/supabase'
import { download, parseOdCsv, toCsv, OD_IMPORT_COLUMNS, type ImportRow } from '@/lib/csv'
import { todayISO } from '@/lib/format'
import type { TableName } from '@/lib/types'

const TABLES: TableName[] = [
  'od_accounts',
  'od_transactions',
  'od_terms',
  'od_events',
  'fixed_deposits',
  'od_fd_links',
  'savings_accounts',
  'branches',
  'user_settings',
]

async function fetchTable(t: TableName) {
  const { data, error } = await supabase.from(t).select('*')
  if (error) throw error
  return (data ?? []) as Record<string, unknown>[]
}

export function ImportExport() {
  const qc = useQueryClient()
  const existing = new Set((useOds().data ?? []).map((o) => o.od_account_no))
  const [busy, setBusy] = useState(false)
  const [parsed, setParsed] = useState<ReturnType<typeof parseOdCsv> | null>(null)

  const exportCsv = async (t: TableName) => {
    try {
      download(`${t}-${todayISO()}.csv`, toCsv(await fetchTable(t)))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }
  const exportJson = async () => {
    setBusy(true)
    try {
      const all: Record<string, unknown> = { exported_at: new Date().toISOString() }
      for (const t of TABLES) all[t] = await fetchTable(t)
      download(`od-tracker-${todayISO()}.json`, JSON.stringify(all, null, 2), 'application/json')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  const valid = parsed?.rows.filter((r) => !r.errors.length) ?? []
  const doImport = async () => {
    if (!valid.length) return
    setBusy(true)
    const { error } = await supabase.from('od_accounts').upsert(
      valid.map((r) => r.data),
      { onConflict: 'user_id,od_account_no' },
    )
    setBusy(false)
    if (error) return toast.error(errorMessage(error))
    toast.success(`Imported ${valid.length} OD${valid.length === 1 ? '' : 's'}`)
    setParsed(null)
    invalidateAll(qc)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Import / export" />
      <Card title="Export">
        <div className="flex flex-wrap gap-2">
          <Button onClick={exportJson} disabled={busy}>
            Everything as JSON
          </Button>
          {TABLES.map((t) => (
            <Button key={t} variant="secondary" size="sm" onClick={() => exportCsv(t)}>
              {t}.csv
            </Button>
          ))}
        </div>
      </Card>

      <Card title="Import ODs from CSV">
        <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
          Matches on <code>od_account_no</code>: existing ODs are updated, new ones inserted. Only the columns in your file are touched. Accepted columns:{' '}
          <span className="font-mono text-xs">{Object.keys(OD_IMPORT_COLUMNS).join(', ')}</span>. Dates as YYYY-MM-DD or DD-MM-YYYY.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          className="block text-sm"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) setParsed(parseOdCsv(await f.text()))
            e.target.value = ''
          }}
        />
        {parsed?.fatal && <p className="mt-3 text-sm text-red-600">{parsed.fatal}</p>}
        {parsed && !parsed.fatal && (
          <div className="mt-4">
            <p className="mb-2 text-sm">
              {parsed.rows.length} rows · <b className="text-emerald-700 dark:text-emerald-400">{valid.length} valid</b>
              {parsed.rows.length - valid.length > 0 && <b className="text-red-600"> · {parsed.rows.length - valid.length} with errors (skipped)</b>}
              {parsed.ignored.length > 0 && <span className="text-slate-500"> · ignoring columns: {parsed.ignored.join(', ')}</span>}
            </p>
            <div className="max-h-96 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="th">Line</th>
                    <th className="th">Action</th>
                    {parsed.columns.map((c) => (
                      <th key={c} className="th">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {parsed.rows.map((r: ImportRow) => (
                    <tr key={r.line} className={cx(r.errors.length > 0 && 'bg-red-50 dark:bg-red-950/30')}>
                      <td className="td">{r.line}</td>
                      <td className="td">
                        {r.errors.length ? <span className="text-red-600">{r.errors.join('; ')}</span> : existing.has(String(r.data.od_account_no)) ? 'update' : 'insert'}
                      </td>
                      {parsed.columns.map((c) => (
                        <td key={c} className="td whitespace-nowrap">
                          {r.data[c] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex gap-2">
              <Button onClick={doImport} disabled={!valid.length || busy}>
                Import {valid.length} row{valid.length === 1 ? '' : 's'}
              </Button>
              <Button variant="secondary" onClick={() => setParsed(null)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
