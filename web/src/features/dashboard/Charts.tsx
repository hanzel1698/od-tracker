import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { format, parseISO } from 'date-fns'
import { useBalances, useTxns } from '@/data/hooks'
import { EmptyState, SkeletonRows } from '@/components/ui'
import { formatINR } from '@/lib/format'

const axis = { fontSize: 11, fill: 'currentColor' }
const compact = (n: number) => (n >= 1000 ? `₹${Math.round(n / 1000)}k` : `₹${n}`)

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-500">{p.name}</span>
          <span className="num ml-auto font-medium">{formatINR(p.value)}</span>
        </div>
      ))}
    </div>
  )
}

/** Outstanding against limit for each active OD. */
export function OutstandingChart() {
  const q = useBalances()
  if (q.isLoading) return <SkeletonRows rows={4} />
  const rows = (q.data ?? [])
    .filter((b) => b.status === 'active')
    .map((b) => ({ name: b.od_account_no.slice(-6), Limit: Number(b.current_limit ?? 0), Outstanding: Number(b.outstanding) }))
  if (!rows.length) return <EmptyState title="No active ODs" />
  return (
    <div className="h-72 text-slate-500 dark:text-slate-400">
      <ResponsiveContainer>
        <BarChart data={rows} barGap={2} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="name" tick={axis} tickLine={false} axisLine={false} interval={0} angle={-45} textAnchor="end" height={50} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} width={48} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Limit" fill="var(--color-track)" radius={[4, 4, 0, 0]} maxBarSize={18} />
          <Bar dataKey="Outstanding" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Interest debited per calendar month, across all ODs. */
export function InterestChart() {
  const q = useTxns()
  if (q.isLoading) return <SkeletonRows rows={4} />
  const byMonth = new Map<string, number>()
  for (const t of q.data ?? []) {
    if (t.txn_type !== 'interest') continue
    const m = t.txn_date.slice(0, 7)
    byMonth.set(m, (byMonth.get(m) ?? 0) + Number(t.amount))
  }
  const rows = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-24)
    .map(([m, v]) => ({ month: format(parseISO(`${m}-01`), 'MMM yy'), Interest: Math.round(v * 100) / 100 }))
  if (!rows.length) return <EmptyState title="No interest logged yet">Use Interest → bulk entry at month-end.</EmptyState>
  return (
    <div className="h-64 text-slate-500 dark:text-slate-400">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.12} />
          <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
          <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={(n) => `₹${n}`} width={48} />
          <Tooltip content={<ChartTooltip />} cursor={{ fill: 'currentColor', fillOpacity: 0.06 }} />
          <Bar dataKey="Interest" fill="var(--color-series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
