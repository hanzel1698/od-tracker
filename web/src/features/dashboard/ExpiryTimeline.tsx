import { Link } from 'react-router-dom'
import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useBalances, useFds, useOds } from '@/data/hooks'
import { EmptyState, SkeletonRows } from '@/components/ui'
import { formatDate, formatINR, todayISO } from '@/lib/format'

const HORIZON = 90

interface Item {
  date: string
  kind: 'OD expiry' | 'FD maturity'
  label: string
  to: string
  amount?: number
}

/** OD expiries and FD maturities over the next 90 days, on a single scale. */
export function ExpiryTimeline() {
  const ods = useOds()
  const fds = useFds().data ?? []
  const balances = useBalances().data ?? []
  const today = todayISO()
  const end = format(addDays(parseISO(today), HORIZON), 'yyyy-MM-dd')

  if (ods.isLoading) return <SkeletonRows rows={3} />

  const items: Item[] = [
    ...(ods.data ?? [])
      .filter((o) => ['active', 'unconfirmed', 'closure_requested'].includes(o.status) && o.expiry_date && o.expiry_date >= today && o.expiry_date <= end)
      .map((o) => ({
        date: o.expiry_date!,
        kind: 'OD expiry' as const,
        label: o.od_account_no,
        to: `/ods/${o.id}`,
        amount: balances.find((b) => b.od_id === o.id)?.payoff_estimate,
      })),
    ...fds
      .filter((f) => f.status !== 'closed' && f.maturity_date && f.maturity_date >= today && f.maturity_date <= end)
      .map((f) => ({ date: f.maturity_date!, kind: 'FD maturity' as const, label: f.fd_account_no, to: `/fds/${f.id}` })),
  ].sort((a, b) => a.date.localeCompare(b.date))

  if (!items.length) return <EmptyState title="Nothing due in the next 90 days" />

  const pos = (d: string) => (differenceInCalendarDays(parseISO(d), parseISO(today)) / HORIZON) * 100
  const months = [0, 30, 60, 90].map((d) => ({ left: (d / HORIZON) * 100, label: d === 0 ? 'Today' : format(addDays(parseISO(today), d), 'dd MMM') }))

  return (
    <div>
      <div className="relative mb-6 h-10" aria-hidden>
        <div className="absolute top-4 right-0 left-0 h-0.5 bg-(--color-track)" />
        {months.map((m) => (
          <div key={m.left} className="absolute top-6 -translate-x-1/2 text-[10px] text-slate-500" style={{ left: `${Math.min(Math.max(m.left, 4), 96)}%` }}>
            {m.label}
          </div>
        ))}
        {items.map((it, i) => (
          <div
            key={i}
            title={`${it.kind} ${it.label} · ${formatDate(it.date)}`}
            className={`absolute top-2.5 h-3.5 w-3.5 -translate-x-1/2 rounded-full ring-2 ring-white dark:ring-slate-900 ${it.kind === 'OD expiry' ? 'bg-(--color-series-1)' : 'bg-slate-400'}`}
            style={{ left: `${pos(it.date)}%` }}
          />
        ))}
      </div>
      <div className="mb-2 flex gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-(--color-series-1)" /> OD expiry
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> FD maturity
        </span>
      </div>
      <ul className="divide-y divide-slate-200 text-sm dark:divide-slate-800">
        {items.map((it, i) => (
          <li key={i} className="flex items-center justify-between gap-2 py-2">
            <div>
              <Link to={it.to} className="font-mono text-blue-700 hover:underline dark:text-blue-400">
                {it.label}
              </Link>
              <span className="ml-2 text-xs text-slate-500">{it.kind}</span>
            </div>
            <div className="text-right">
              <div className="whitespace-nowrap">{formatDate(it.date)}</div>
              <div className="text-xs text-slate-500">
                in {differenceInCalendarDays(parseISO(it.date), parseISO(today))}d{it.amount ? ` · owe ${formatINR(it.amount, { whole: true })}` : ''}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
