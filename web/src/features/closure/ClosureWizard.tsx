import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useBalances, useBranches, useInsert, useLinkMaps, useOds, useRpc, useSavings, useSettings } from '@/data/hooks'
import { Button, Card, EmptyState, Field, PageHeader, StatusChip, copyText, cx } from '@/components/ui'
import { buildClosureEmail } from '@/lib/closureEmail'
import { formatDate, formatINR, todayISO } from '@/lib/format'

type Step = 1 | 2 | 3

/** Normal closure path: pay off → email the branch → confirm sent. */
export function ClosureWizard() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const ods = useOds().data ?? []
  const balances = useBalances().data ?? []
  const branches = useBranches().data ?? []
  const savings = useSavings().data ?? []
  const settings = useSettings().data
  const { fdsByOd } = useLinkMaps()
  const insertTxn = useInsert('od_transactions', { silent: true })
  const request = useRpc('request_closure', 'Marked as closure requested')

  const initial = (params.get('ids') ?? '').split(',').map(Number).filter(Boolean)
  const [selected, setSelected] = useState<number[]>(initial)
  const [step, setStep] = useState<Step>(1)
  const [amounts, setAmounts] = useState<Record<number, string>>({})
  const [paid, setPaid] = useState<Set<number>>(new Set())
  const [today] = useState(todayISO())

  const first = ods.find((o) => o.id === selected[0])
  const branchCode = first?.branch_code ?? null
  const branch = branches.find((b) => b.code === branchCode)
  const candidates = ods.filter((o) => ['active', 'unconfirmed'].includes(o.status) && (!branchCode || o.branch_code === branchCode))
  const chosen = ods.filter((o) => selected.includes(o.id))
  const bal = (id: number) => balances.find((b) => b.od_id === id)
  const sav = savings.find((s) => s.id === first?.savings_account_id) ?? savings.find((s) => s.is_default)

  const email = useMemo(
    () =>
      buildClosureEmail({
        to: branch?.email ?? '',
        savingsAccountNo: sav?.account_no ?? '',
        name: settings?.full_name ?? '',
        cif: settings?.cif_no ?? '',
        items: chosen.map((o) => ({ odNo: o.od_account_no, fdNos: (fdsByOd.get(o.id) ?? []).map((f) => f.fd_account_no) })),
      }),
    [branch, sav, settings, chosen, fdsByOd],
  )

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const amountFor = (id: number) => amounts[id] ?? String(Math.max(bal(id)?.outstanding ?? 0, 0))

  const recordRepayments = async () => {
    for (const o of chosen) {
      if (paid.has(o.id)) continue
      const amt = Number(amountFor(o.id))
      if (amt > 0) {
        await insertTxn.mutateAsync({
          od_id: o.id,
          txn_date: today,
          txn_type: 'repayment',
          amount: amt,
          savings_account_id: o.savings_account_id ?? sav?.id ?? null,
          notes: 'Payoff before closure request',
        })
      }
      setPaid((p) => new Set(p).add(o.id))
    }
    toast.success('Repayments recorded')
    setStep(2)
  }

  if (!ods.length) return <EmptyState title="Loading…" />

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Close OD(s)" subtitle="Pay off, email the branch, then confirm." />
      <ol className="mb-4 flex gap-2 text-xs">
        {['Payoff', 'Email', 'Confirm sent'].map((l, i) => (
          <li key={l} className={cx('flex-1 rounded-full px-3 py-1.5 text-center font-medium', step === i + 1 ? 'bg-blue-600 text-white' : step > i + 1 ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400')}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card title={`ODs to close${branch ? ` · ${branch.name}` : ''}`}>
          {!candidates.length ? (
            <EmptyState title="No open ODs" />
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">One email per branch: only ODs from {branch ? branch.name : 'the same branch'} can be combined.</p>
              {candidates.map((o) => {
                const b = bal(o.id)
                const on = selected.includes(o.id)
                return (
                  <div key={o.id} className={cx('rounded-lg border p-3', on ? 'border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30' : 'border-slate-200 dark:border-slate-800')}>
                    <label className="flex items-center gap-3">
                      <input type="checkbox" className="h-4 w-4" checked={on} onChange={() => toggle(o.id)} />
                      <span className="font-mono font-medium">{o.od_account_no}</span>
                      <StatusChip status={o.status} />
                      <span className="ml-auto text-xs text-slate-500">expires {formatDate(o.expiry_date)}</span>
                    </label>
                    {on && (
                      <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                        <div>
                          <div className="text-xs text-slate-500">Outstanding</div>
                          <div className="num font-medium">{formatINR(b?.outstanding)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Accrued (est.)</div>
                          <div className="num">{formatINR(b?.accrued_interest_estimate)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">Suggested payoff</div>
                          <div className="num">{formatINR(b?.payoff_estimate)}</div>
                        </div>
                        <Field label="Transferring now">
                          <input
                            className="input num"
                            inputMode="decimal"
                            disabled={paid.has(o.id)}
                            value={amountFor(o.id)}
                            onChange={(e) => setAmounts({ ...amounts, [o.id]: e.target.value })}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                )
              })}
              <p className="text-xs text-slate-500">
                The accrued interest is left for the bank to debit from savings at closure, as the email asks.
              </p>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button disabled={!chosen.length || insertTxn.isPending} onClick={recordRepayments}>
                  Record repayment(s) & continue
                </Button>
                <Button variant="secondary" disabled={!chosen.length} onClick={() => setStep(2)}>
                  Already paid, skip
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="Closure email">
          {(!branch?.email || !settings?.full_name || !settings?.cif_no || !sav) && (
            <p className="mb-3 rounded-lg bg-amber-100 p-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              Missing: {[!branch?.email && 'branch email', !settings?.full_name && 'your name', !settings?.cif_no && 'CIF', !sav && 'savings account'].filter(Boolean).join(', ')}.{' '}
              <Link to="/settings" className="underline">
                Settings
              </Link>{' '}
              ·{' '}
              <Link to="/branches" className="underline">
                Branches
              </Link>
            </p>
          )}
          <div className="space-y-2 text-sm">
            <div>
              <span className="text-slate-500">To:</span> {email.to || '—'}
            </div>
            <div>
              <span className="text-slate-500">Subject:</span> {email.subject}
            </div>
            <pre className="rounded-lg bg-slate-100 p-3 font-sans whitespace-pre-wrap dark:bg-slate-800">{email.body}</pre>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={async () => (await copyText(email.full)) && toast.success('Email copied')}>
              Copy
            </Button>
            <a href={email.mailto}>
              <Button variant="secondary">Open in mail app</Button>
            </a>
            <Button onClick={() => setStep(3)}>Next</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <Card title="Did you send it?">
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            Confirming marks {chosen.map((o) => o.od_account_no).join(', ')} as <b>closure requested</b> today, with the email sent to {email.to || 'the branch'}. When the bank closes
            them, use <b>Mark closed</b> to record the residual debit.
          </p>
          <div className="flex gap-2">
            <Button
              variant="success"
              disabled={request.isPending}
              onClick={async () => {
                await request.mutateAsync({ p_od_ids: chosen.map((o) => o.id), p_on: today, p_email_to: email.to || null })
                nav(chosen.length === 1 ? `/ods/${chosen[0].id}?tab=events` : '/')
              }}
            >
              I've sent it
            </Button>
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
          </div>
        </Card>
      )}
    </div>
  )
}
