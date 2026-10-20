import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useBalances, useBranches, useLinkMaps, useOds, useUpdate } from '@/data/hooks'
import { Button, EmptyState, Meter, PageHeader, SkeletonRows, StatusChip, cx } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { formatINR } from '@/lib/format'
import { OD_CHANNELS, OD_STATUSES, type OdAccount, type OdBalance, type OdStatus } from '@/lib/types'

type Row = OdAccount & { bal?: OdBalance; fdNos: string[] }
type SortKey = 'od_account_no' | 'status' | 'branch_code' | 'opened_on' | 'current_limit' | 'outstanding' | 'available' | 'interest_rate' | 'expiry_date'

const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'od_account_no', label: 'OD no.' },
  { key: 'status', label: 'Status' },
  { key: 'branch_code', label: 'Branch' },
  { key: 'opened_on', label: 'Opened' },
  { key: 'current_limit', label: 'Limit', right: true },
  { key: 'outstanding', label: 'Outstanding', right: true },
  { key: 'available', label: 'Available', right: true },
  { key: 'interest_rate', label: 'Rate %', right: true },
  { key: 'expiry_date', label: 'Expiry' },
]

function sortValue(r: Row, k: SortKey): string | number {
  if (k === 'outstanding') return r.bal?.outstanding ?? 0
  if (k === 'available') return r.bal?.available ?? 0
  const v = r[k]
  return v === null || v === undefined ? '' : (v as string | number)
}

export function OdList() {
  const ods = useOds()
  const balances = useBalances().data ?? []
  const branches = useBranches().data ?? []
  const { fdsByOd } = useLinkMaps()
  const update = useUpdate('od_accounts')
  const nav = useNavigate()

  const [status, setStatus] = useState<OdStatus | 'open' | ''>('open')
  const [year, setYear] = useState('')
  const [branch, setBranch] = useState('')
  const [channel, setChannel] = useState('')
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'expiry_date', asc: true })

  const rows: Row[] = useMemo(() => {
    const bal = new Map(balances.map((b) => [b.od_id, b]))
    return (ods.data ?? []).map((o) => ({ ...o, bal: bal.get(o.id), fdNos: (fdsByOd.get(o.id) ?? []).map((f) => f.fd_account_no) }))
  }, [ods.data, balances, fdsByOd])

  const years = useMemo(() => [...new Set(rows.map((r) => r.opened_on?.slice(0, 4)).filter(Boolean))].sort().reverse() as string[], [rows])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows
      .filter((r) => {
        if (status === 'open' && ['closed', 'rejected'].includes(r.status)) return false
        if (status && status !== 'open' && r.status !== status) return false
        if (year && r.opened_on?.slice(0, 4) !== year) return false
        if (branch && r.branch_code !== branch) return false
        if (channel && r.channel !== channel) return false
        if (needle && !r.od_account_no.toLowerCase().includes(needle) && !r.fdNos.some((f) => f.toLowerCase().includes(needle))) return false
        return true
      })
      .sort((a, b) => {
        const x = sortValue(a, sort.key)
        const y = sortValue(b, sort.key)
        // Blanks always last
        if (x === '' && y !== '') return 1
        if (y === '' && x !== '') return -1
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return sort.asc ? c : -c
      })
  }, [rows, status, year, branch, channel, q, sort])

  const totals = filtered.reduce(
    (t, r) => ({
      limit: t.limit + Number(r.current_limit ?? 0),
      outstanding: t.outstanding + Number(r.bal?.outstanding ?? 0),
      available: t.available + Number(r.bal?.available ?? 0),
    }),
    { limit: 0, outstanding: 0, available: 0 },
  )

  const save = (id: number, field: keyof OdAccount) => (v: unknown) => update.mutate({ id, patch: { [field]: v } as Partial<OdAccount> })
  const branchOpts = branches.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` }))
  const branchName = (code: string | null) => branches.find((b) => b.code === code)?.name

  return (
    <div>
      <PageHeader
        title="Overdrafts"
        subtitle={`${filtered.length} of ${rows.length}`}
        actions={
          <Link to="/ods/new">
            <Button>+ New OD</Button>
          </Link>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="input col-span-2 sm:col-span-1" placeholder="Search OD / FD no." value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as OdStatus)}>
          <option value="open">Open (not closed)</option>
          <option value="">All statuses</option>
          {OD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
        <select className="input" value={year} onChange={(e) => setYear(e.target.value)}>
          <option value="">All years</option>
          {years.map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <select className="input" value={branch} onChange={(e) => setBranch(e.target.value)}>
          <option value="">All branches</option>
          {branchOpts.map((b) => (
            <option key={b.value} value={b.value}>
              {b.label}
            </option>
          ))}
        </select>
        <select className="input" value={channel} onChange={(e) => setChannel(e.target.value)}>
          <option value="">All channels</option>
          {OD_CHANNELS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>

      {ods.isLoading ? (
        <SkeletonRows rows={8} />
      ) : !filtered.length ? (
        <EmptyState title={rows.length ? 'No ODs match these filters' : 'No ODs yet'}>
          {!rows.length && <Link to="/ods/new" className="text-blue-600 underline">Open your first OD</Link>}
        </EmptyState>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} className={cx('th cursor-pointer select-none', c.right && 'text-right')} onClick={() => setSort((s) => ({ key: c.key, asc: s.key === c.key ? !s.asc : true }))}>
                      {c.label}
                      {sort.key === c.key ? (sort.asc ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th className="th">FD(s)</th>
                  <th className="th">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono">
                      <Link to={`/ods/${r.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                        {r.od_account_no}
                      </Link>
                    </td>
                    <td className="td">
                      <EditableCell kind="select" required options={OD_STATUSES} value={r.status} display={<StatusChip status={r.status} />} onSave={save(r.id, 'status')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="select" options={branchOpts} value={r.branch_code} display={r.branch_code ? <span title={branchName(r.branch_code)}>{r.branch_code}</span> : undefined} onSave={save(r.id, 'branch_code')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="date" value={r.opened_on} onSave={save(r.id, 'opened_on')} />
                    </td>
                    <td className="td text-right">
                      <EditableCell kind="money" align="right" value={r.current_limit} onSave={save(r.id, 'current_limit')} />
                    </td>
                    <td className="td num text-right">
                      {formatINR(r.bal?.outstanding)}
                      <Meter used={Number(r.bal?.outstanding ?? 0)} limit={r.current_limit} />
                    </td>
                    <td className={cx('td num text-right', (r.bal?.available ?? 0) < 0 && 'text-red-600')}>{formatINR(r.bal?.available)}</td>
                    <td className="td text-right">
                      <EditableCell kind="number" align="right" value={r.interest_rate} onSave={save(r.id, 'interest_rate')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="date" value={r.expiry_date} onSave={save(r.id, 'expiry_date')} />
                      {r.bal?.days_to_expiry != null && !['closed', 'rejected'].includes(r.status) && (
                        <div className={cx('text-xs', r.bal.days_to_expiry < 0 ? 'text-red-600' : r.bal.days_to_expiry <= (r.reminder_days ?? 21) ? 'text-amber-600' : 'text-slate-500')}>
                          {r.bal.days_to_expiry < 0 ? `${-r.bal.days_to_expiry}d ago` : `in ${r.bal.days_to_expiry}d`}
                        </div>
                      )}
                    </td>
                    <td className="td font-mono text-xs">{r.fdNos.join(', ') || '—'}</td>
                    <td className="td max-w-56">
                      <EditableCell kind="textarea" value={r.notes} onSave={save(r.id, 'notes')} className="truncate" />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                <tr>
                  <td className="td" colSpan={4}>
                    Total ({filtered.length})
                  </td>
                  <td className="td num text-right">{formatINR(totals.limit)}</td>
                  <td className="td num text-right">{formatINR(totals.outstanding)}</td>
                  <td className="td num text-right">{formatINR(totals.available)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            <div className="card flex justify-between p-3 text-xs">
              <span>
                Limit <b className="num">{formatINR(totals.limit, { whole: true })}</b>
              </span>
              <span>
                Owed <b className="num">{formatINR(totals.outstanding, { whole: true })}</b>
              </span>
              <span>
                Free <b className="num">{formatINR(totals.available, { whole: true })}</b>
              </span>
            </div>
            {filtered.map((r) => (
              <div key={r.id} className="card p-3" onClick={() => nav(`/ods/${r.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">{r.od_account_no}</div>
                    <div className="text-xs text-slate-500">
                      {r.branch_code} · {r.channel ?? '—'} {r.fdNos.length ? `· FD ${r.fdNos.join(', ')}` : ''}
                    </div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <EditableCell kind="select" required options={OD_STATUSES} value={r.status} display={<StatusChip status={r.status} />} onSave={save(r.id, 'status')} />
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs text-slate-500">Limit</div>
                    <EditableCell kind="money" value={r.current_limit} onSave={save(r.id, 'current_limit')} />
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Outstanding</div>
                    <div className="num py-0.5">{formatINR(r.bal?.outstanding)}</div>
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <div className="text-xs text-slate-500">Expiry</div>
                    <EditableCell kind="date" value={r.expiry_date} onSave={save(r.id, 'expiry_date')} />
                  </div>
                </div>
                <div className="mt-2">
                  <Meter used={Number(r.bal?.outstanding ?? 0)} limit={r.current_limit} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
