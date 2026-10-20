import { useBalances, useDelete, useSavings, useTxns, useUpdate } from '@/data/hooks'
import { Button, Card, EmptyState, SkeletonRows, useConfirm, cx } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { formatDate, formatINR } from '@/lib/format'
import { runningBalances, signedAmount } from '@/lib/calc'
import { TXN_TYPES, type OdAccount, type OdTransaction, type TxnType } from '@/lib/types'
import { txnLabel, useOdDialogs } from './OdDialogs'

const QUICK: { type: TxnType; label: string; variant?: 'primary' | 'secondary' }[] = [
  { type: 'draw', label: 'Draw to savings', variant: 'primary' },
  { type: 'repayment', label: 'Repay from savings', variant: 'primary' },
  { type: 'interest', label: 'Interest debit' },
  { type: 'charge', label: 'Charge' },
  { type: 'adjustment', label: 'Adjustment' },
]

export function LedgerTab({ od }: { od: OdAccount }) {
  const q = useTxns()
  const savings = useSavings().data ?? []
  const bal = useBalances().data?.find((b) => b.od_id === od.id)
  const dialogs = useOdDialogs()
  const update = useUpdate('od_transactions')
  const del = useDelete('od_transactions')
  const confirm = useConfirm()
  // Recomputed on every render, so edits (applied optimistically) move the running balance at once.
  const rows = runningBalances((q.data ?? []).filter((t) => t.od_id === od.id))
  const save = (t: OdTransaction, field: keyof OdTransaction) => (v: unknown) => update.mutate({ id: t.id, patch: { [field]: v } as Partial<OdTransaction> })
  const savOpts = savings.map((s) => ({ value: String(s.id), label: s.account_no }))
  const typeOpts = TXN_TYPES.map((t) => ({ value: t, label: txnLabel(t) }))

  const remove = async (t: OdTransaction) => {
    if (await confirm({ title: 'Delete this entry?', message: `${txnLabel(t.txn_type)} of ${formatINR(t.amount)} on ${formatDate(t.txn_date)}` })) del.mutate({ id: t.id })
  }

  return (
    <Card
      title="Ledger"
      actions={QUICK.map((b) => (
        <Button key={b.type} size="sm" variant={b.variant ?? 'secondary'} onClick={() => dialogs.open({ kind: 'txn', odId: od.id, type: b.type })}>
          + {b.label}
        </Button>
      ))}
    >
      {bal && (
        <div className="mb-3 grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4 dark:text-slate-400">
          <span>Drawn: <b className="num">{formatINR(bal.total_drawn)}</b> <span className="text-slate-400">(term {formatINR(bal.term_drawn)})</span></span>
          <span>Repaid: <b className="num">{formatINR(bal.total_repaid)}</b> <span className="text-slate-400">(term {formatINR(bal.term_repaid)})</span></span>
          <span>Interest: <b className="num">{formatINR(bal.total_interest_paid)}</b> <span className="text-slate-400">(term {formatINR(bal.term_interest_paid)})</span></span>
          <span>Last interest: <b>{formatDate(bal.last_interest_date)}</b></span>
        </div>
      )}
      {q.isLoading ? (
        <SkeletonRows />
      ) : !rows.length ? (
        <EmptyState title="No entries yet">Record the opening balance or the first draw with the buttons above.</EmptyState>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">Date</th>
                <th className="th">Type</th>
                <th className="th text-right">Amount</th>
                <th className="th text-right">Balance</th>
                <th className="th">Savings a/c</th>
                <th className="th">Ref.</th>
                <th className="th">Notes</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map((t) => {
                const s = signedAmount(t.txn_type, Number(t.amount))
                return (
                  <tr key={t.id}>
                    <td className="td">
                      <EditableCell kind="date" required value={t.txn_date} onSave={save(t, 'txn_date')} />
                    </td>
                    <td className="td">
                      <EditableCell kind="select" required options={typeOpts} value={t.txn_type} onSave={save(t, 'txn_type')} />
                    </td>
                    <td className={cx('td text-right', s < 0 ? 'text-emerald-700 dark:text-emerald-400' : '')}>
                      <EditableCell
                        kind="money"
                        align="right"
                        required
                        value={t.amount}
                        display={<span className="num">{s < 0 ? '−' : '+'}{formatINR(Math.abs(s))}</span>}
                        onSave={save(t, 'amount')}
                      />
                    </td>
                    <td className="td num text-right font-medium">{formatINR(t.balance)}</td>
                    <td className="td">
                      <EditableCell
                        kind="select"
                        options={savOpts}
                        value={t.savings_account_id == null ? null : String(t.savings_account_id)}
                        onSave={(v) => update.mutate({ id: t.id, patch: { savings_account_id: v == null ? null : Number(v) } })}
                      />
                    </td>
                    <td className="td">
                      <EditableCell value={t.reference} onSave={save(t, 'reference')} />
                    </td>
                    <td className="td max-w-56">
                      <EditableCell value={t.notes} onSave={save(t, 'notes')} />
                    </td>
                    <td className="td whitespace-nowrap text-right">
                      <button className="px-1 text-slate-400 hover:text-blue-600" title="Edit in form" onClick={() => dialogs.open({ kind: 'txn', odId: od.id, txn: t })}>
                        ✎
                      </button>
                      <button className="px-1 text-slate-400 hover:text-red-600" title="Delete" onClick={() => remove(t)}>
                        🗑
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
