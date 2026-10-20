import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invalidateAll, useOds, useTxns } from '@/data/hooks'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button, Card, EmptyState, PageHeader, SkeletonRows } from '@/components/ui'
import { errorMessage, supabase } from '@/lib/supabase'
import { formatDate, formatINR, todayISO } from '@/lib/format'

/** One-time: what is owed today on each active OD, as an opening_balance entry. */
export function OpeningBalances() {
  const ods = useOds()
  const txns = useTxns().data ?? []
  const { session } = useAuth()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [date, setDate] = useState(todayISO())
  const [busy, setBusy] = useState(false)

  const active = (ods.data ?? []).filter((o) => o.status === 'active')
  const hasOpening = (id: number) => txns.some((t) => t.od_id === id && t.txn_type === 'opening_balance')

  const save = async () => {
    setBusy(true)
    try {
      const rows = active
        .filter((o) => !hasOpening(o.id) && Number(amounts[o.id]) > 0)
        .map((o) => ({ od_id: o.id, txn_date: date, txn_type: 'opening_balance' as const, amount: Number(amounts[o.id]), notes: 'Balance owed when tracking began (from YONO)' }))
      if (rows.length) {
        const { error } = await supabase.from('od_transactions').insert(rows)
        if (error) throw error
      }
      const { error } = await supabase.from('user_settings').upsert({ user_id: session?.user.id, opening_balances_done: true })
      if (error) throw error
      toast.success(`Saved ${rows.length} opening balance${rows.length === 1 ? '' : 's'}`)
      await invalidateAll(qc)
      nav('/')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Set opening balances" subtitle="Enter what you owe on each active OD right now, as YONO shows it. Leave blank for zero." />
      <Card
        title={
          <label className="flex items-center gap-2 text-sm font-normal">
            As of
            <input type="date" className="input w-auto py-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        }
      >
        {ods.isLoading ? (
          <SkeletonRows />
        ) : !active.length ? (
          <EmptyState title="No active ODs" />
        ) : (
          <ul className="divide-y divide-slate-200 dark:divide-slate-800">
            {active.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-3 py-2">
                <div>
                  <div className="font-mono text-sm font-medium">{o.od_account_no}</div>
                  <div className="text-xs text-slate-500">
                    limit {formatINR(o.current_limit)} · expires {formatDate(o.expiry_date)}
                  </div>
                </div>
                {hasOpening(o.id) ? (
                  <span className="text-xs text-emerald-700 dark:text-emerald-400">already set</span>
                ) : (
                  <input
                    className="input num w-32 text-right"
                    inputMode="decimal"
                    placeholder="0"
                    value={amounts[o.id] ?? ''}
                    onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={save} disabled={busy}>
            Save and finish
          </Button>
          <Button variant="secondary" onClick={() => nav('/')}>
            Later
          </Button>
        </div>
      </Card>
    </div>
  )
}
