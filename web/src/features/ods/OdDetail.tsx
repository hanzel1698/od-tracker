import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useBalances, useBranches, useDelete, useOds } from '@/data/hooks'
import { Button, EmptyState, Meter, SkeletonRows, StatusChip, Tabs, useConfirm, cx } from '@/components/ui'
import { formatDate, formatINR, formatPct } from '@/lib/format'
import { useOdDialogs } from './OdDialogs'
import { OdForm } from './OdForm'
import { LedgerTab } from './LedgerTab'
import { TermsTab } from './TermsTab'
import { LinkedFds } from './LinkedFds'
import { EventTimeline } from './EventTimeline'

type Tab = 'ledger' | 'details' | 'terms' | 'fds' | 'events'

export function OdDetail() {
  const id = Number(useParams().id)
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) ?? 'ledger'
  const ods = useOds()
  const od = ods.data?.find((o) => o.id === id)
  const bal = useBalances().data?.find((b) => b.od_id === id)
  const branch = useBranches().data?.find((b) => b.code === od?.branch_code)
  const dialogs = useOdDialogs()
  const del = useDelete('od_accounts')
  const confirm = useConfirm()
  const nav = useNavigate()

  if (ods.isLoading) return <SkeletonRows rows={6} />
  if (!od) return <EmptyState title="OD not found"><Link to="/ods" className="text-blue-600 underline">Back to list</Link></EmptyState>

  const open = !['closed', 'rejected'].includes(od.status)
  const days = bal?.days_to_expiry

  return (
    <div>
      <div className="mb-1 text-sm">
        <Link to="/ods" className="text-blue-600 hover:underline">
          ← Overdrafts
        </Link>
      </div>
      <div className="card mb-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-xl font-bold">{od.od_account_no}</h1>
              <StatusChip status={od.status} />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {od.bank} {branch ? `· ${branch.name} (${branch.code})` : od.branch_code ? `· ${od.branch_code}` : ''} · {od.channel ?? '—'} · opened {formatDate(od.opened_on)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {od.status === 'closure_requested' && (
              <Button size="sm" variant="success" onClick={() => dialogs.open({ kind: 'close', odId: od.id })}>
                Mark closed
              </Button>
            )}
            {open && od.status !== 'closure_requested' && (
              <>
                <Button size="sm" onClick={() => nav(`/closure?ids=${od.id}`)}>
                  Start closure
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'renewal', odId: od.id })}>
                  Record renewal
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'limit', odId: od.id })}>
                  Change limit
                </Button>
                <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'close', odId: od.id })}>
                  Mark closed
                </Button>
              </>
            )}
            {od.status === 'closure_requested' && (
              <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'renewal', odId: od.id })}>
                It was renewed instead
              </Button>
            )}
            {od.status === 'closed' && !od.lien_released_on && (
              <Button size="sm" onClick={() => dialogs.open({ kind: 'lien', odId: od.id })}>
                Mark lien released
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-red-600"
              onClick={async () => {
                if (
                  await confirm({
                    title: `Delete OD ${od.od_account_no}?`,
                    message: 'This deletes the OD with its ledger, terms, events and FD links. FDs themselves are kept.',
                  })
                ) {
                  await del.mutateAsync({ id: od.id })
                  nav('/ods')
                }
              }}
            >
              Delete
            </Button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Stat label="Limit" value={formatINR(od.current_limit)} />
          <Stat label="Outstanding" value={formatINR(bal?.outstanding)} />
          <Stat label="Available" value={formatINR(bal?.available)} tone={(bal?.available ?? 0) < 0 ? 'text-red-600' : undefined} />
          <Stat label="Payoff (est.)" value={formatINR(bal?.payoff_estimate)} sub={bal?.accrued_interest_estimate ? `incl. ${formatINR(bal.accrued_interest_estimate)} accrued` : undefined} />
          <Stat label="Rate" value={formatPct(od.interest_rate)} />
          <Stat
            label="Expiry"
            value={formatDate(od.expiry_date)}
            sub={open && days != null ? (days < 0 ? `${-days} days ago` : `in ${days} days`) : undefined}
            tone={open && days != null ? (days < 0 ? 'text-red-600' : days <= (od.reminder_days ?? 21) ? 'text-amber-600' : undefined) : undefined}
          />
        </div>
        <div className="mt-3">
          <Meter used={Number(bal?.outstanding ?? 0)} limit={od.current_limit} />
        </div>
      </div>

      <Tabs
        value={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'ledger', label: 'Ledger' },
          { id: 'details', label: 'Details' },
          { id: 'terms', label: 'Terms' },
          { id: 'fds', label: 'Linked FDs' },
          { id: 'events', label: 'Timeline' },
        ]}
      />
      {tab === 'ledger' && <LedgerTab od={od} />}
      {tab === 'details' && <OdForm od={od} />}
      {tab === 'terms' && <TermsTab od={od} />}
      {tab === 'fds' && <LinkedFds od={od} />}
      {tab === 'events' && <EventTimeline od={od} />}
    </div>
  )
}

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      <div className={cx('num font-semibold', tone)}>{value}</div>
      {sub && <div className={cx('text-xs', tone ?? 'text-slate-500')}>{sub}</div>}
    </div>
  )
}
