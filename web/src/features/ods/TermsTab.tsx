import { useDelete, useInsert, useTerms, useUpdate } from '@/data/hooks'
import { Button, Card, EmptyState, SkeletonRows, useConfirm } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { renewalExpiry } from '@/lib/calc'
import { todayISO } from '@/lib/format'
import type { OdAccount, OdTerm } from '@/lib/types'
import { useOdDialogs } from './OdDialogs'

export function TermsTab({ od }: { od: OdAccount }) {
  const q = useTerms()
  const terms = (q.data ?? []).filter((t) => t.od_id === od.id)
  const update = useUpdate('od_terms')
  const insert = useInsert('od_terms')
  const del = useDelete('od_terms')
  const confirm = useConfirm()
  const dialogs = useOdDialogs()
  const save = (t: OdTerm, f: keyof OdTerm) => (v: unknown) => update.mutate({ id: t.id, patch: { [f]: v } as Partial<OdTerm> })

  const addBlank = () => {
    const last = terms[terms.length - 1]
    const start = last?.expiry_date ?? od.opened_on ?? todayISO()
    insert.mutate({
      od_id: od.id,
      term_no: (last?.term_no ?? 0) + 1,
      start_date: start,
      expiry_date: renewalExpiry(start),
      limit_amount: od.current_limit,
      interest_rate: od.interest_rate,
      renewal_type: last ? 'manual' : 'original',
    })
  }

  return (
    <Card
      title="Terms"
      actions={
        <>
          <Button size="sm" onClick={() => dialogs.open({ kind: 'renewal', odId: od.id })}>
            Record renewal
          </Button>
          <Button size="sm" variant="secondary" onClick={addBlank}>
            + Add term row
          </Button>
        </>
      }
    >
      {q.isLoading ? (
        <SkeletonRows rows={2} />
      ) : !terms.length ? (
        <EmptyState title="No terms recorded" />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">#</th>
                <th className="th">Start</th>
                <th className="th">Expiry</th>
                <th className="th text-right">Limit</th>
                <th className="th text-right">Rate %</th>
                <th className="th">Type</th>
                <th className="th">FD rolled</th>
                <th className="th">Notes</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {terms.map((t) => (
                <tr key={t.id}>
                  <td className="td">
                    <EditableCell kind="number" required value={t.term_no} onSave={save(t, 'term_no')} />
                  </td>
                  <td className="td">
                    <EditableCell kind="date" required value={t.start_date} onSave={save(t, 'start_date')} />
                  </td>
                  <td className="td">
                    <EditableCell kind="date" required value={t.expiry_date} onSave={save(t, 'expiry_date')} />
                  </td>
                  <td className="td text-right">
                    <EditableCell kind="money" align="right" value={t.limit_amount} onSave={save(t, 'limit_amount')} />
                  </td>
                  <td className="td text-right">
                    <EditableCell kind="number" align="right" value={t.interest_rate} onSave={save(t, 'interest_rate')} />
                  </td>
                  <td className="td">
                    <EditableCell kind="select" options={['original', 'auto', 'manual']} value={t.renewal_type} onSave={save(t, 'renewal_type')} />
                  </td>
                  <td className="td">
                    <EditableCell kind="boolean" value={t.fd_rolled_over} onSave={save(t, 'fd_rolled_over')} />
                  </td>
                  <td className="td">
                    <EditableCell value={t.notes} onSave={save(t, 'notes')} />
                  </td>
                  <td className="td text-right">
                    <button
                      className="px-1 text-slate-400 hover:text-red-600"
                      title="Delete"
                      onClick={async () => (await confirm({ title: `Delete term #${t.term_no}?` })) && del.mutate({ id: t.id })}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-slate-500">Editing a term does not change the OD's current expiry/limit; edit those in Details.</p>
    </Card>
  )
}
