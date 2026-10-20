import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { endOfMonth, format } from 'date-fns'
import { useBalances, useInsert, useOds } from '@/data/hooks'
import { Button, Card, EmptyState, PageHeader, SkeletonRows } from '@/components/ui'
import { accruedInterest, round2 } from '@/lib/calc'
import { formatDate, formatINR, formatPct } from '@/lib/format'

/**
 * Month-end: one row per active OD that owes something, prefilled with
 * outstanding × rate/365 × days since the last debit (or first draw) up to
 * the debit date. Correct each to the actual YONO debit and save them together.
 */
export function BulkInterest() {
  const ods = useOds()
  const balances = useBalances().data ?? []
  const insert = useInsert('od_transactions')
  const [date, setDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [skip, setSkip] = useState<Set<number>>(new Set())

  const rows = useMemo(
    () =>
      (ods.data ?? [])
        .filter((o) => o.status === 'active')
        .map((o) => ({ od: o, bal: balances.find((b) => b.od_id === o.id) }))
        .filter((r) => (r.bal?.outstanding ?? 0) > 0)
        .map((r) => {
          const since = r.bal?.last_interest_date ?? r.bal?.first_draw_date ?? null
          const est = accruedInterest({ outstanding: r.bal!.outstanding, ratePct: r.od.interest_rate, sinceISO: since, todayISO: date })
          return { ...r, since, est }
        })
        .sort((a, b) => a.od.od_account_no.localeCompare(b.od.od_account_no)),
    [ods.data, balances, date],
  )

  const value = (id: number, est: number) => amounts[id] ?? (est ? String(est) : '')
  const toSave = rows.filter((r) => !skip.has(r.od.id) && Number(value(r.od.id, r.est)) > 0)
  const total = round2(toSave.reduce((s, r) => s + Number(value(r.od.id, r.est)), 0))

  const saveAll = () =>
    insert.mutate(
      toSave.map((r) => ({
        od_id: r.od.id,
        txn_date: date,
        txn_type: 'interest' as const,
        amount: Number(value(r.od.id, r.est)),
        notes: `Monthly interest ${format(new Date(date), 'MMM yyyy')}`,
      })),
      {
        onSuccess: () => {
          setAmounts({})
          setSkip(new Set())
        },
      },
    )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Bulk interest entry" subtitle="Prefilled with estimates; replace with the actual debits from YONO." />
      <Card
        title={
          <label className="flex items-center gap-2 text-sm font-normal">
            Debit date
            <input type="date" className="input w-auto py-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        }
        actions={
          <Button disabled={!toSave.length || insert.isPending} onClick={saveAll}>
            Save {toSave.length} entr{toSave.length === 1 ? 'y' : 'ies'} · {formatINR(total)}
          </Button>
        }
      >
        {ods.isLoading ? (
          <SkeletonRows />
        ) : !rows.length ? (
          <EmptyState title="No active OD owes anything">Interest is only debited on a balance.</EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[620px] text-sm">
              <thead className="border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="th">Include</th>
                  <th className="th">OD</th>
                  <th className="th text-right">Outstanding</th>
                  <th className="th text-right">Rate</th>
                  <th className="th">Since</th>
                  <th className="th text-right">Estimate</th>
                  <th className="th text-right">Actual debit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.od.id} className={skip.has(r.od.id) ? 'opacity-50' : ''}>
                    <td className="td">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={!skip.has(r.od.id)}
                        onChange={() =>
                          setSkip((s) => {
                            const n = new Set(s)
                            if (n.has(r.od.id)) n.delete(r.od.id)
                            else n.add(r.od.id)
                            return n
                          })
                        }
                      />
                    </td>
                    <td className="td font-mono">
                      <Link to={`/ods/${r.od.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                        {r.od.od_account_no}
                      </Link>
                    </td>
                    <td className="td num text-right">{formatINR(r.bal?.outstanding)}</td>
                    <td className="td num text-right">{formatPct(r.od.interest_rate)}</td>
                    <td className="td whitespace-nowrap">{formatDate(r.since)}</td>
                    <td className="td num text-right text-slate-500">{formatINR(r.est)}</td>
                    <td className="td text-right">
                      <input
                        className="input num w-28 py-1 text-right"
                        inputMode="decimal"
                        value={value(r.od.id, r.est)}
                        onChange={(e) => setAmounts({ ...amounts, [r.od.id]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
