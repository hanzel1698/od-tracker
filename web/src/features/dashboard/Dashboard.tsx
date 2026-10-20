import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAlerts, useBalances, useBranches, useLinkMaps, useOds, useSavings, useSettings, useSummary } from '@/data/hooks'
import { Button, Card, EmptyState, Kpi, PageHeader, Skeleton, copyText } from '@/components/ui'
import { formatDate, formatINR, plural } from '@/lib/format'
import { followUpEmail } from '@/lib/closureEmail'
import type { AlertType, OdAlert } from '@/lib/types'
import { useOdDialogs } from '@/features/ods/OdDialogs'
import { ExpiryTimeline } from './ExpiryTimeline'
import { InterestChart, OutstandingChart } from './Charts'

const ALERT_ORDER: AlertType[] = [
  'over_limit',
  'expiry_passed_unhandled',
  'expiring_soon',
  'closure_pending',
  'missing_interest',
  'reconcile',
  'lien_not_released',
]

export function Dashboard() {
  const summary = useSummary()
  const alerts = useAlerts()
  const ods = useOds()
  const settings = useSettings().data
  const s = summary.data
  const hasActive = (ods.data ?? []).some((o) => o.status === 'active')
  const needOpening = settings && !settings.opening_balances_done && hasActive

  return (
    <div className="space-y-5">
      <PageHeader
        title="Dashboard"
        subtitle={s?.next_expiry ? `Next expiry ${formatDate(s.next_expiry)}` : undefined}
        actions={
          <Link to="/ods/new">
            <Button>+ New OD</Button>
          </Link>
        }
      />

      {needOpening && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-900 dark:bg-blue-950/50">
          <span>
            <b>One-time setup:</b> enter what you currently owe on each active OD (from YONO) so balances start right.
          </span>
          <Link to="/opening-balances">
            <Button size="sm">Set opening balances</Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {summary.isLoading || !s ? (
          Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-20" />)
        ) : (
          <>
            <Kpi label="Active ODs" value={s.active_count} />
            <Kpi label="Total limit" value={formatINR(s.total_active_limit, { whole: true })} />
            <Kpi label="Outstanding" value={formatINR(s.total_outstanding, { whole: true })} />
            <Kpi label="Available" value={formatINR(s.total_available, { whole: true })} />
            <Kpi label="Est. interest this month" value={formatINR(s.est_monthly_interest, { whole: true })} />
          </>
        )}
      </div>

      <Card title={`Needs attention${alerts.data?.length ? ` (${alerts.data.length})` : ''}`}>
        {alerts.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : !alerts.data?.length ? (
          <EmptyState title="All clear">Nothing is expiring, overdue or out of step.</EmptyState>
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {[...alerts.data]
              .sort((a, b) => ALERT_ORDER.indexOf(a.alert_type) - ALERT_ORDER.indexOf(b.alert_type) || (a.days ?? 0) - (b.days ?? 0))
              .map((a) => (
                <AlertRow key={`${a.od_id}-${a.alert_type}`} a={a} />
              ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Expiries in the next 90 days">
          <ExpiryTimeline />
        </Card>
        <Card title="Monthly interest paid">
          <InterestChart />
        </Card>
      </div>
      <Card title="Outstanding vs limit (active ODs)">
        <OutstandingChart />
      </Card>
    </div>
  )
}

const TONE: Record<AlertType, string> = {
  over_limit: 'bg-red-500',
  expiry_passed_unhandled: 'bg-red-500',
  expiring_soon: 'bg-amber-500',
  closure_pending: 'bg-amber-500',
  missing_interest: 'bg-blue-500',
  reconcile: 'bg-blue-500',
  lien_not_released: 'bg-slate-400',
}

function AlertRow({ a }: { a: OdAlert }) {
  const dialogs = useOdDialogs()
  const nav = useNavigate()
  const ods = useOds().data ?? []
  const balances = useBalances().data ?? []
  const branches = useBranches().data ?? []
  const savings = useSavings().data ?? []
  const settings = useSettings().data
  const { fdsByOd } = useLinkMaps()
  const od = ods.find((o) => o.id === a.od_id)
  const bal = balances.find((b) => b.od_id === a.od_id)
  const days = a.days ?? 0

  let text: React.ReactNode
  let actions: React.ReactNode
  switch (a.alert_type) {
    case 'expiring_soon':
      text = (
        <>
          Expiring in {plural(days, 'day')} ({formatDate(a.alert_date)}): owe {formatINR(bal?.payoff_estimate)} (est.)
        </>
      )
      actions = (
        <Button size="sm" onClick={() => nav(`/closure?ids=${a.od_id}`)}>
          Start closure
        </Button>
      )
      break
    case 'expiry_passed_unhandled':
      text = (
        <>
          Expiry passed {plural(days, 'day')} ago ({formatDate(a.alert_date)}): renewed?
        </>
      )
      actions = (
        <>
          <Button size="sm" onClick={() => dialogs.open({ kind: 'renewal', odId: a.od_id })}>
            Record auto-renewal
          </Button>
          <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'close', odId: a.od_id })}>
            It was closed
          </Button>
        </>
      )
      break
    case 'closure_pending':
      text = <>Closure requested {plural(days, 'day')} ago, not closed yet</>
      actions = (
        <>
          <Button size="sm" variant="success" onClick={() => dialogs.open({ kind: 'close', odId: a.od_id })}>
            Mark closed
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              const branch = branches.find((b) => b.code === od?.branch_code)
              const sav = savings.find((s) => s.id === od?.savings_account_id) ?? savings.find((s) => s.is_default)
              const e = followUpEmail({
                to: od?.closure_email_to ?? branch?.email ?? '',
                savingsAccountNo: sav?.account_no ?? '',
                name: settings?.full_name ?? '',
                cif: settings?.cif_no ?? '',
                requestedOn: formatDate(od?.closure_requested_on),
                items: [{ odNo: od?.od_account_no ?? '', fdNos: (fdsByOd.get(a.od_id) ?? []).map((f) => f.fd_account_no) }],
              })
              if (await copyText(e.full)) toast.success('Follow-up email copied')
            }}
          >
            Copy follow-up email
          </Button>
        </>
      )
      break
    case 'lien_not_released':
      text = <>Closed {formatDate(a.alert_date)}; lien not yet released</>
      actions = (
        <Button size="sm" onClick={() => dialogs.open({ kind: 'lien', odId: a.od_id })}>
          Mark lien released
        </Button>
      )
      break
    case 'over_limit':
      text = <>Over limit by {formatINR(a.amount)}</>
      actions = (
        <Link to={`/ods/${a.od_id}?tab=ledger`}>
          <Button size="sm" variant="secondary">
            Review ledger
          </Button>
        </Link>
      )
      break
    case 'missing_interest':
      text = <>No interest logged since {formatDate(a.alert_date)}</>
      actions = (
        <Button size="sm" onClick={() => dialogs.open({ kind: 'txn', odId: a.od_id, type: 'interest' })}>
          Add interest
        </Button>
      )
      break
    case 'reconcile':
      text = <>Ledger differs from bank balance by {formatINR(a.amount)}</>
      actions = (
        <Button size="sm" variant="secondary" onClick={() => dialogs.open({ kind: 'txn', odId: a.od_id, type: 'adjustment' })}>
          Add adjustment
        </Button>
      )
      break
  }

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${TONE[a.alert_type]}`} aria-hidden />
        <div>
          <Link to={`/ods/${a.od_id}`} className="font-mono text-sm font-medium text-blue-700 hover:underline dark:text-blue-400">
            {a.od_account_no}
          </Link>
          <div className="text-sm text-slate-700 dark:text-slate-300">{text}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-4.5 sm:pl-0">{actions}</div>
    </li>
  )
}
