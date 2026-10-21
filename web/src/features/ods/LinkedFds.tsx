import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useDelete, useFds, useInsert, useLinks, useUpdate } from '@/data/hooks'
import { Button, Card, EmptyState, Field, useConfirm } from '@/components/ui'
import { EditableCell } from '@/components/EditableCell'
import { FD_STATUSES, type FixedDeposit, type OdAccount } from '@/lib/types'
import { depositValue, isOpenDeposit } from '@/lib/deposits'
import { formatDate, formatINR } from '@/lib/format'
import { useOdDialogs } from './OdDialogs'

export function LinkedFds({ od }: { od: OdAccount }) {
  const fds = useFds().data ?? []
  const links = useLinks().data ?? []
  const linkedIds = new Set(links.filter((l) => l.od_id === od.id).map((l) => l.fd_id))
  const linked = fds.filter((f) => linkedIds.has(f.id))
  // Only deposits that could secure this OD: open, free and not already linked.
  const others = fds
    .filter((f) => !linkedIds.has(f.id) && isOpenDeposit(f) && !f.lien_marked)
    .sort((a, b) => (a.maturity_date ?? '').localeCompare(b.maturity_date ?? ''))
  const addLink = useInsert('od_fd_links')
  const unlink = useDelete('od_fd_links')
  const insertFd = useInsert('fixed_deposits', { silent: true })
  const update = useUpdate('fixed_deposits')
  const confirm = useConfirm()
  const dialogs = useOdDialogs()
  const [pick, setPick] = useState('')
  const [newFd, setNewFd] = useState({ fd_account_no: '', principal: '', maturity_date: '' })

  const save = (f: FixedDeposit, k: keyof FixedDeposit) => (v: unknown) => update.mutate({ id: f.id, patch: { [k]: v } as Partial<FixedDeposit> })

  const createAndLink = async () => {
    if (!newFd.fd_account_no.trim()) return
    const [fd] = await insertFd.mutateAsync({
      fd_account_no: newFd.fd_account_no.trim(),
      principal: newFd.principal ? Number(newFd.principal) : null,
      maturity_date: newFd.maturity_date || null,
      opened_on: od.opened_on,
      lien_marked: true,
    })
    await addLink.mutateAsync({ od_id: od.id, fd_id: fd.id })
    setNewFd({ fd_account_no: '', principal: '', maturity_date: '' })
  }

  return (
    <Card
      title="Linked FDs (lien)"
      actions={
        od.status === 'closed' &&
        !od.lien_released_on && (
          <Button size="sm" onClick={() => dialogs.open({ kind: 'lien', odId: od.id })}>
            Mark lien released
          </Button>
        )
      }
    >
      {!linked.length ? (
        <EmptyState title="No FD linked" />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="th">FD no.</th>
                <th className="th text-right">Principal</th>
                <th className="th">Maturity</th>
                <th className="th">Lien</th>
                <th className="th">Status</th>
                <th className="th" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {linked.map((f) => (
                <tr key={f.id}>
                  <td className="td font-mono">
                    <Link to={`/fds/${f.id}`} className="text-blue-700 hover:underline dark:text-blue-400">
                      {f.fd_account_no}
                    </Link>
                  </td>
                  <td className="td text-right">
                    <EditableCell kind="money" align="right" value={f.principal} onSave={save(f, 'principal')} />
                  </td>
                  <td className="td">
                    <EditableCell kind="date" value={f.maturity_date} onSave={save(f, 'maturity_date')} />
                  </td>
                  <td className="td">
                    <EditableCell
                      kind="boolean"
                      value={f.lien_marked}
                      display={f.lien_marked ? <span className="text-amber-700 dark:text-amber-400">Marked</span> : <span className="text-emerald-700 dark:text-emerald-400">Released</span>}
                      onSave={save(f, 'lien_marked')}
                    />
                  </td>
                  <td className="td">
                    <EditableCell kind="select" options={FD_STATUSES} value={f.status} onSave={save(f, 'status')} />
                  </td>
                  <td className="td text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () =>
                        (await confirm({ title: `Unlink FD ${f.fd_account_no}?`, message: 'The FD record is kept; only the link to this OD is removed.', confirmLabel: 'Unlink' })) &&
                        unlink.mutate({ od_id: od.id, fd_id: f.id })
                      }
                    >
                      Unlink
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-sm font-medium">Link a free FD</div>
          <div className="flex gap-2">
            <select className="input" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {others.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.fd_account_no} · {formatINR(depositValue(f), { whole: true })}
                  {f.maturity_date ? ` · matures ${formatDate(f.maturity_date)}` : ''}
                </option>
              ))}
            </select>
            <Button disabled={!pick} onClick={() => addLink.mutate({ od_id: od.id, fd_id: Number(pick) }, { onSuccess: () => setPick('') })}>
              Link
            </Button>
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 text-sm font-medium">Create a new FD and link it</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="col-span-2">
              <Field label="FD no.">
                <input className="input" value={newFd.fd_account_no} onChange={(e) => setNewFd({ ...newFd, fd_account_no: e.target.value })} />
              </Field>
            </div>
            <Field label="Principal">
              <input className="input" inputMode="decimal" value={newFd.principal} onChange={(e) => setNewFd({ ...newFd, principal: e.target.value })} />
            </Field>
            <Field label="Maturity">
              <input className="input" type="date" value={newFd.maturity_date} onChange={(e) => setNewFd({ ...newFd, maturity_date: e.target.value })} />
            </Field>
          </div>
          <Button className="mt-2" disabled={!newFd.fd_account_no.trim()} onClick={createAndLink}>
            Create & link
          </Button>
        </div>
      </div>
    </Card>
  )
}
