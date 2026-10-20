import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDelete, useFds, useLinkMaps, useOds, useUpdate } from '@/data/hooks'
import { CrudTable } from '@/components/CrudTable'
import { Button, Card, EmptyState, Field, PageHeader, SkeletonRows, StatusChip, useConfirm } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { formatDate } from '@/lib/format'
import type { FixedDeposit } from '@/lib/types'

const FD_STATUS = ['active', 'rolled over', 'closed']

export function FdList() {
  const q = useFds()
  const ods = useOds().data ?? []
  const { odsByFd } = useLinkMaps()
  const [filter, setFilter] = useState<'lien' | 'all' | 'free'>('lien')
  const [search, setSearch] = useState('')

  const rows = useMemo(
    () =>
      (q.data ?? []).filter((f) => {
        if (filter === 'lien' && !f.lien_marked) return false
        if (filter === 'free' && f.lien_marked) return false
        const s = search.trim()
        return !s || f.fd_account_no.includes(s)
      }),
    [q.data, filter, search],
  )

  const odLinks = (f: FixedDeposit) => {
    const linked = (odsByFd.get(f.id) ?? []).map((id) => ods.find((o) => o.id === id)).filter(Boolean)
    if (!linked.length) return <span className="text-slate-400">—</span>
    return (
      <div className="flex flex-col gap-0.5">
        {linked.map((o) => (
          <Link key={o!.id} to={`/ods/${o!.id}`} className="flex items-center gap-1.5 font-mono text-xs text-blue-700 hover:underline dark:text-blue-400">
            {o!.od_account_no} <StatusChip status={o!.status} />
          </Link>
        ))}
      </div>
    )
  }

  return (
    <div>
      <PageHeader title="Fixed deposits" subtitle={`${rows.length} shown`} />
      <div className="mb-3 flex flex-wrap gap-2">
        <input className="input max-w-56" placeholder="Search FD no." value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input max-w-48" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          <option value="lien">Under lien</option>
          <option value="free">Lien released</option>
          <option value="all">All</option>
        </select>
      </div>
      <CrudTable<FixedDeposit>
        table="fixed_deposits"
        rows={rows}
        loading={q.isLoading}
        newRow={() => ({ lien_marked: true, status: 'active' })}
        describe={(r) => `FD ${r.fd_account_no}`}
        extra={(r) => (
          <Link to={`/fds/${r.id}`} className="px-1 text-slate-400 hover:text-blue-600" title="Open">
            ↗
          </Link>
        )}
        cols={[
          { key: 'fd_account_no', label: 'FD no.', required: true },
          { key: 'principal', label: 'Principal', kind: 'money' },
          { key: 'interest_rate', label: 'Rate %', kind: 'number' },
          { key: 'opened_on', label: 'Opened', kind: 'date' },
          { key: 'maturity_date', label: 'Maturity', kind: 'date' },
          {
            key: 'lien_marked',
            label: 'Lien',
            kind: 'boolean',
            render: (r) => (r.lien_marked ? <span className="text-amber-700 dark:text-amber-400">Marked</span> : <span className="text-emerald-700 dark:text-emerald-400">Released</span>),
          },
          { key: 'status', label: 'Status', kind: 'select', options: FD_STATUS },
          { key: 'id', label: 'Secures OD', readOnly: true, render: odLinks },
        ]}
      />
    </div>
  )
}

export function FdDetail() {
  const id = Number(useParams().id)
  const q = useFds()
  const fd = q.data?.find((f) => f.id === id)
  const ods = useOds().data ?? []
  const { odsByFd } = useLinkMaps()
  const update = useUpdate('fixed_deposits')
  const del = useDelete('fixed_deposits')
  const confirm = useConfirm()
  const nav = useNavigate()

  if (q.isLoading) return <SkeletonRows />
  if (!fd) return <EmptyState title="FD not found" />
  const save = (k: keyof FixedDeposit) => (v: unknown) => update.mutate({ id: fd.id, patch: { [k]: v } as Partial<FixedDeposit> })
  const linked = (odsByFd.get(fd.id) ?? []).map((i) => ods.find((o) => o.id === i)).filter(Boolean)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-1 text-sm">
        <Link to="/fds" className="text-blue-600 hover:underline">
          ← Fixed deposits
        </Link>
      </div>
      <PageHeader
        title={<span className="font-mono">FD {fd.fd_account_no}</span>}
        subtitle={`${fd.lien_marked ? 'Under lien' : 'Lien released'} · matures ${formatDate(fd.maturity_date)}`}
        actions={
          <Button
            variant="ghost"
            className="text-red-600"
            onClick={async () => {
              if (await confirm({ title: `Delete FD ${fd.fd_account_no}?`, message: 'Its links to ODs are removed too.' })) {
                await del.mutateAsync({ id: fd.id })
                nav('/fds')
              }
            }}
          >
            Delete
          </Button>
        }
      />
      <Card>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="FD no.">
            <EditableCell required value={fd.fd_account_no} onSave={save('fd_account_no')} />
          </Field>
          <Field label="Principal">
            <EditableCell kind="money" value={fd.principal} onSave={save('principal')} />
          </Field>
          <Field label="Rate %">
            <EditableCell kind="number" value={fd.interest_rate} onSave={save('interest_rate')} />
          </Field>
          <Field label="Opened on">
            <EditableCell kind="date" value={fd.opened_on} onSave={save('opened_on')} />
          </Field>
          <Field label="Maturity date">
            <EditableCell kind="date" value={fd.maturity_date} onSave={save('maturity_date')} />
          </Field>
          <Field label="Lien marked">
            <EditableCell kind="boolean" value={fd.lien_marked} onSave={save('lien_marked')} />
          </Field>
          <Field label="Status">
            <EditableCell kind="select" options={FD_STATUS} value={fd.status} onSave={save('status')} />
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
          <EmptyState title="Not linked to any OD" />
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
