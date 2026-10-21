import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useBranches, useDelete, useFds, useInsert, useLinkMaps, useOds, useUpdate } from '@/data/hooks'
import { Button, Card, EmptyState, Field, Kpi, PageHeader, SkeletonRows, StatusChip, cx, useConfirm } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { formatDate, formatINR, plural, todayISO } from '@/lib/format'
import { daysToMaturity, depositValue, interestAtMaturity, isOpenDeposit, summarizeDeposits, termLabel } from '@/lib/deposits'
import { DEPOSIT_TYPES, FD_STATUSES, type DepositType, type FixedDeposit, type OdAccount } from '@/lib/types'

type Row = FixedDeposit & { ods: OdAccount[]; days: number | null; value: number }
type SortKey = 'fd_account_no' | 'deposit_type' | 'principal' | 'interest_rate' | 'opened_on' | 'maturity_date' | 'value' | 'maturity_amount' | 'lien_marked'

const COLS: { key: SortKey; label: string; right?: boolean }[] = [
  { key: 'fd_account_no', label: 'Deposit no.' },
  { key: 'deposit_type', label: 'Type' },
  { key: 'principal', label: 'Principal', right: true },
  { key: 'interest_rate', label: 'Rate %', right: true },
  { key: 'opened_on', label: 'Start' },
  { key: 'maturity_date', label: 'Maturity' },
  { key: 'value', label: 'Value now', right: true },
  { key: 'maturity_amount', label: 'At maturity', right: true },
  { key: 'lien_marked', label: 'Lien' },
]

function sortValue(r: Row, k: SortKey): string | number {
  if (k === 'lien_marked') return r.lien_marked ? 1 : 0
  const v = r[k]
  return v === null || v === undefined ? '' : (v as string | number)
}

function MaturityHint({ days, open }: { days: number | null; open: boolean }) {
  if (days == null || !open) return null
  return (
    <div className={cx('text-xs', days < 0 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-slate-500')}>
      {days < 0 ? `matured ${-days}d ago` : days === 0 ? 'matures today' : `in ${days}d`}
    </div>
  )
}

function LienChip({ f }: { f: FixedDeposit }) {
  return f.lien_marked ? (
    <span className="text-amber-700 dark:text-amber-400">
      Lien{f.lien_amount ? <span className="num text-xs text-slate-500"> · {formatINR(f.lien_amount, { whole: true })}</span> : null}
    </span>
  ) : (
    <span className="text-emerald-700 dark:text-emerald-400">Free</span>
  )
}

function OdLinks({ ods }: { ods: OdAccount[] }) {
  if (!ods.length) return <span className="text-slate-400">—</span>
  return (
    <div className="flex flex-col gap-0.5">
      {ods.map((o) => (
        <Link key={o.id} to={`/ods/${o.id}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 font-mono text-xs text-blue-700 hover:underline dark:text-blue-400">
          {o.od_account_no} <StatusChip status={o.status} />
        </Link>
      ))}
    </div>
  )
}

export function FdList() {
  const q = useFds()
  const ods = useOds().data ?? []
  const { odsByFd } = useLinkMaps()
  const update = useUpdate('fixed_deposits')
  const nav = useNavigate()
  const today = todayISO()

  const [type, setType] = useState<DepositType | ''>('')
  const [lien, setLien] = useState<'' | 'lien' | 'free'>('')
  const [status, setStatus] = useState<'open' | 'closed' | ''>('open')
  const [due, setDue] = useState<'' | '30' | '90'>('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: 'maturity_date', asc: true })
  const [adding, setAdding] = useState(false)

  const rows: Row[] = useMemo(() => {
    const odById = new Map(ods.map((o) => [o.id, o]))
    return (q.data ?? []).map((f) => ({
      ...f,
      ods: (odsByFd.get(f.id) ?? []).map((id) => odById.get(id)).filter((o): o is OdAccount => !!o),
      days: daysToMaturity(f, today),
      value: depositValue(f),
    }))
  }, [q.data, ods, odsByFd, today])

  const summary = useMemo(() => summarizeDeposits(q.data ?? [], today), [q.data, today])
  const asOf = useMemo(() => (q.data ?? []).map((f) => f.value_as_of).filter(Boolean).sort().pop() ?? null, [q.data])

  const filtered = useMemo(() => {
    const needle = search.trim()
    return rows
      .filter((r) => {
        if (type && r.deposit_type !== type) return false
        if (lien === 'lien' && !r.lien_marked) return false
        if (lien === 'free' && r.lien_marked) return false
        if (status === 'open' && !isOpenDeposit(r)) return false
        if (status === 'closed' && isOpenDeposit(r)) return false
        if (due && (r.days == null || r.days < 0 || r.days > Number(due))) return false
        if (needle && !r.fd_account_no.includes(needle) && !r.ods.some((o) => o.od_account_no.includes(needle))) return false
        return true
      })
      .sort((a, b) => {
        const x = sortValue(a, sort.key)
        const y = sortValue(b, sort.key)
        if (x === '' && y !== '') return 1
        if (y === '' && x !== '') return -1
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))
        return sort.asc ? c : -c
      })
  }, [rows, type, lien, status, due, search, sort])

  const totals = filtered.reduce(
    (t, r) => ({ principal: t.principal + Number(r.principal ?? 0), value: t.value + r.value, maturity: t.maturity + Number(r.maturity_amount ?? 0) }),
    { principal: 0, value: 0, maturity: 0 },
  )
  const save = (id: number, k: keyof FixedDeposit) => (v: unknown) => update.mutate({ id, patch: { [k]: v } as Partial<FixedDeposit> })

  return (
    <div>
      <PageHeader
        title="Deposits"
        subtitle={`${filtered.length} of ${rows.length}${asOf ? ` · bank values as of ${formatDate(asOf)}` : ''}`}
        actions={<Button onClick={() => setAdding((a) => !a)}>{adding ? 'Close' : '+ Add deposit'}</Button>}
      />

      {adding && <AddDeposit onDone={() => setAdding(false)} />}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {q.isLoading ? null : (
          <>
            <Kpi label="Open deposits" value={summary.count} sub={`Principal ${formatINR(summary.principal, { whole: true })}`} />
            <Kpi label="Value now" value={formatINR(summary.value, { whole: true })} sub={`${formatINR(summary.maturityValue, { whole: true })} at maturity`} />
            <Kpi label="Under lien" value={formatINR(summary.lienValue, { whole: true })} sub={plural(summary.lienCount, 'deposit')} />
            <Kpi label="Free" value={formatINR(summary.freeValue, { whole: true })} sub={plural(summary.freeCount, 'deposit')} />
            <Kpi label="Maturing in 30 days" value={formatINR(summary.dueSoonValue, { whole: true })} sub={plural(summary.dueSoonCount, 'deposit')} />
          </>
        )}
      </div>

      {summary.maturedCount > 0 && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          {plural(summary.maturedCount, 'open deposit')} past maturity: update the maturity date if it renewed, or mark it closed.
        </div>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        <input className="input col-span-2 sm:col-span-1" placeholder="Search deposit / OD no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
          <option value="">All</option>
        </select>
        <select className="input" value={lien} onChange={(e) => setLien(e.target.value as typeof lien)}>
          <option value="">Lien or free</option>
          <option value="lien">Under lien</option>
          <option value="free">Free</option>
        </select>
        <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="">All types</option>
          {DEPOSIT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="input" value={due} onChange={(e) => setDue(e.target.value as typeof due)}>
          <option value="">Any maturity</option>
          <option value="30">Maturing in 30 days</option>
          <option value="90">Maturing in 90 days</option>
        </select>
      </div>

      {q.isLoading ? (
        <SkeletonRows rows={8} />
      ) : !filtered.length ? (
        <EmptyState title={rows.length ? 'No deposits match these filters' : 'No deposits yet'} />
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
                  <th className="th">Secures OD</th>
                  <th className="th">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="td font-mono">
                      <Link to={`/fds/${r.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                        {r.fd_account_no}
                      </Link>
                    </td>
                    <td className="td">
                      <EditableCell kind="select" required options={DEPOSIT_TYPES} value={r.deposit_type} display={r.deposit_type} onSave={save(r.id, 'deposit_type')} />
                    </td>
                    <td className="td text-right">
                      <EditableCell kind="money" align="right" value={r.principal} onSave={save(r.id, 'principal')} />
                    </td>
                    <td className="td text-right">
                      <EditableCell kind="number" align="right" value={r.interest_rate} onSave={save(r.id, 'interest_rate')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="date" value={r.opened_on} onSave={save(r.id, 'opened_on')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="date" value={r.maturity_date} onSave={save(r.id, 'maturity_date')} />
                      <MaturityHint days={r.days} open={isOpenDeposit(r)} />
                    </td>
                    <td className="td text-right">
                      <EditableCell kind="money" align="right" value={r.current_value} onSave={save(r.id, 'current_value')} />
                    </td>
                    <td className="td text-right">
                      <EditableCell kind="money" align="right" value={r.maturity_amount} onSave={save(r.id, 'maturity_amount')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="boolean" value={r.lien_marked} display={<LienChip f={r} />} onSave={save(r.id, 'lien_marked')} />
                    </td>
                    <td className="td">
                      <OdLinks ods={r.ods} />
                    </td>
                    <td className="td">
                      <EditableCell kind="select" options={FD_STATUSES} value={r.status} onSave={save(r.id, 'status')} />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 font-semibold dark:border-slate-700">
                <tr>
                  <td className="td" colSpan={2}>
                    Total ({filtered.length})
                  </td>
                  <td className="td num text-right">{formatINR(totals.principal, { whole: true })}</td>
                  <td colSpan={3} />
                  <td className="td num text-right">{formatINR(totals.value, { whole: true })}</td>
                  <td className="td num text-right">{formatINR(totals.maturity, { whole: true })}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            <div className="card flex justify-between p-3 text-xs">
              <span>
                Principal <b className="num">{formatINR(totals.principal, { whole: true })}</b>
              </span>
              <span>
                Now <b className="num">{formatINR(totals.value, { whole: true })}</b>
              </span>
              <span>
                Maturity <b className="num">{formatINR(totals.maturity, { whole: true })}</b>
              </span>
            </div>
            {filtered.map((r) => (
              <div key={r.id} className="card p-3" onClick={() => nav(`/fds/${r.id}`)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">{r.fd_account_no}</div>
                    <div className="text-xs text-slate-500">
                      {r.deposit_type}
                      {r.interest_rate != null ? ` · ${r.interest_rate}%` : ''}
                      {r.branch_code ? ` · ${r.branch_code}` : ''}
                    </div>
                  </div>
                  <div className="text-right text-sm">
                    <LienChip f={r} />
                    {r.status === 'closed' && <div className="text-xs text-slate-500">Closed</div>}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <div>
                    <div className="text-xs text-slate-500">Principal</div>
                    <div className="num">{formatINR(r.principal, { whole: true })}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Value now</div>
                    <div className="num">{formatINR(r.value, { whole: true })}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">Matures</div>
                    <div className="whitespace-nowrap">{formatDate(r.maturity_date)}</div>
                    <MaturityHint days={r.days} open={isOpenDeposit(r)} />
                  </div>
                </div>
                {r.ods.length > 0 && (
                  <div className="mt-2 text-xs text-slate-500">
                    Secures <OdLinks ods={r.ods} />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function AddDeposit({ onDone }: { onDone: () => void }) {
  const insert = useInsert('fixed_deposits')
  const blank = { fd_account_no: '', deposit_type: 'FD' as DepositType, principal: '', interest_rate: '', opened_on: '', maturity_date: '', maturity_amount: '', lien_marked: false }
  const [f, setF] = useState(blank)
  const num = (s: string) => (s.trim() ? Number(s.replace(/[₹,\s]/g, '')) : null)
  const valid = f.fd_account_no.trim() && [f.principal, f.interest_rate, f.maturity_amount].every((s) => !s.trim() || Number.isFinite(num(s)))

  const submit = () =>
    insert.mutate(
      {
        fd_account_no: f.fd_account_no.trim(),
        deposit_type: f.deposit_type,
        principal: num(f.principal),
        interest_rate: num(f.interest_rate),
        opened_on: f.opened_on || null,
        maturity_date: f.maturity_date || null,
        maturity_amount: num(f.maturity_amount),
        lien_marked: f.lien_marked,
        status: 'active',
      },
      { onSuccess: onDone },
    )

  return (
    <Card title="Add a deposit" className="mb-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="col-span-2">
          <Field label="Deposit no. *">
            <input className="input font-mono" value={f.fd_account_no} onChange={(e) => setF({ ...f, fd_account_no: e.target.value })} />
          </Field>
        </div>
        <Field label="Type">
          <select className="input" value={f.deposit_type} onChange={(e) => setF({ ...f, deposit_type: e.target.value as DepositType })}>
            {DEPOSIT_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </Field>
        <Field label="Lien">
          <select className="input" value={String(f.lien_marked)} onChange={(e) => setF({ ...f, lien_marked: e.target.value === 'true' })}>
            <option value="false">Free</option>
            <option value="true">Under lien</option>
          </select>
        </Field>
        <Field label="Principal">
          <input className="input" inputMode="decimal" value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value })} />
        </Field>
        <Field label="Rate %">
          <input className="input" inputMode="decimal" value={f.interest_rate} onChange={(e) => setF({ ...f, interest_rate: e.target.value })} />
        </Field>
        <Field label="Start date">
          <input className="input" type="date" value={f.opened_on} onChange={(e) => setF({ ...f, opened_on: e.target.value })} />
        </Field>
        <Field label="Maturity date">
          <input className="input" type="date" value={f.maturity_date} onChange={(e) => setF({ ...f, maturity_date: e.target.value })} />
        </Field>
        <Field label="Maturity amount">
          <input className="input" inputMode="decimal" value={f.maturity_amount} onChange={(e) => setF({ ...f, maturity_amount: e.target.value })} />
        </Field>
      </div>
      <div className="mt-3 flex gap-2">
        <Button disabled={!valid || insert.isPending} onClick={submit}>
          Add deposit
        </Button>
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

export function FdDetail() {
  const id = Number(useParams().id)
  const q = useFds()
  const fd = q.data?.find((f) => f.id === id)
  const ods = useOds().data ?? []
  const branches = useBranches().data ?? []
  const { odsByFd } = useLinkMaps()
  const update = useUpdate('fixed_deposits')
  const del = useDelete('fixed_deposits')
  const confirm = useConfirm()
  const nav = useNavigate()

  if (q.isLoading) return <SkeletonRows />
  if (!fd) return <EmptyState title="Deposit not found" />
  const save = (k: keyof FixedDeposit) => (v: unknown) => update.mutate({ id: fd.id, patch: { [k]: v } as Partial<FixedDeposit> })
  const linked = (odsByFd.get(fd.id) ?? []).map((i) => ods.find((o) => o.id === i)).filter(Boolean)
  const days = daysToMaturity(fd, todayISO())
  const interest = interestAtMaturity(fd)
  const branchOpts = branches.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` }))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 text-sm">
        <Link to="/fds" className="text-blue-600 hover:underline">
          ← Deposits
        </Link>
      </div>
      <PageHeader
        title={
          <span className="font-mono">
            {fd.deposit_type} {fd.fd_account_no}
          </span>
        }
        subtitle={
          <>
            {fd.lien_marked ? 'Under lien' : 'Free'}
            {fd.maturity_date && ` · matures ${formatDate(fd.maturity_date)}`}
            {days != null && isOpenDeposit(fd) && (days < 0 ? ` (${-days}d ago)` : ` (in ${days}d)`)}
          </>
        }
        actions={
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={async () => {
              if (await confirm({ title: `Delete deposit ${fd.fd_account_no}?`, message: 'Its links to ODs are removed too.' })) {
                await del.mutateAsync({ id: fd.id })
                nav('/fds')
              }
            }}
          >
            Delete
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Kpi label="Value now" value={formatINR(depositValue(fd), { whole: true })} sub={fd.value_as_of ? `as of ${formatDate(fd.value_as_of)}` : undefined} />
        <Kpi label="At maturity" value={formatINR(fd.maturity_amount, { whole: true })} sub={interest != null ? `${formatINR(interest, { whole: true })} interest` : undefined} />
        <Kpi label="Term" value={termLabel(fd.term_months)} sub={fd.deposit_type === 'RD' && fd.installment_amount ? `${formatINR(fd.installment_amount, { whole: true })} / month` : undefined} />
      </div>

      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Deposit no.">
            <EditableCell required value={fd.fd_account_no} onSave={save('fd_account_no')} />
          </Field>
          <Field label="Type">
            <EditableCell kind="select" required options={DEPOSIT_TYPES} value={fd.deposit_type} display={fd.deposit_type} onSave={save('deposit_type')} />
          </Field>
          <Field label="Variant">
            <EditableCell value={fd.variant} onSave={save('variant')} />
          </Field>
          <Field label="Branch">
            <EditableCell kind="select" options={branchOpts} value={fd.branch_code} onSave={save('branch_code')} />
          </Field>
          <Field label="Principal">
            <EditableCell kind="money" value={fd.principal} onSave={save('principal')} />
          </Field>
          <Field label="Rate %">
            <EditableCell kind="number" value={fd.interest_rate} onSave={save('interest_rate')} />
          </Field>
          <Field label="Start date">
            <EditableCell kind="date" value={fd.opened_on} onSave={save('opened_on')} />
          </Field>
          <Field label="Maturity date">
            <EditableCell kind="date" value={fd.maturity_date} onSave={save('maturity_date')} />
          </Field>
          <Field label="Term (months)">
            <EditableCell kind="number" value={fd.term_months} onSave={save('term_months')} />
          </Field>
          <Field label="Maturity amount">
            <EditableCell kind="money" value={fd.maturity_amount} onSave={save('maturity_amount')} />
          </Field>
          <Field label="Current value">
            <EditableCell kind="money" value={fd.current_value} onSave={save('current_value')} />
          </Field>
          <Field label="Value as of">
            <EditableCell kind="date" value={fd.value_as_of} onSave={save('value_as_of')} />
          </Field>
          <Field label="Maturity instruction">
            <EditableCell value={fd.maturity_instruction} onSave={save('maturity_instruction')} />
          </Field>
          <Field label="Interest payout">
            <EditableCell value={fd.interest_payout} onSave={save('interest_payout')} />
          </Field>
          <Field label="Lien marked">
            <EditableCell kind="boolean" value={fd.lien_marked} onSave={save('lien_marked')} />
          </Field>
          <Field label="Lien amount">
            <EditableCell kind="money" value={fd.lien_amount} onSave={save('lien_amount')} />
          </Field>
          {fd.deposit_type === 'RD' && (
            <Field label="Monthly installment">
              <EditableCell kind="money" value={fd.installment_amount} onSave={save('installment_amount')} />
            </Field>
          )}
          <Field label="Status">
            <EditableCell kind="select" options={FD_STATUSES} value={fd.status} onSave={save('status')} />
          </Field>
          <Field label="Closed on">
            <EditableCell kind="date" value={fd.closed_on} onSave={save('closed_on')} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Notes">
              <EditableCell kind="textarea" value={fd.notes} onSave={save('notes')} />
            </Field>
          </div>
        </div>
      </Card>
      <Card title="Secures" className="mt-4">
        {!linked.length ? (
          <EmptyState title="Not linked to any OD">This deposit is free to be used for a new OD.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {linked.map((o) => (
              <li key={o!.id} className="flex items-center justify-between py-2 text-sm">
                <Link to={`/ods/${o!.id}?tab=fds`} className="font-mono text-blue-700 hover:underline dark:text-blue-400">
                  {o!.od_account_no}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">expires {formatDate(o!.expiry_date)}</span>
                  <StatusChip status={o!.status} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
