// Workflow dialogs shared by the dashboard action list and the OD detail page.
// Open them from anywhere with `useOdDialogs().open({ kind, odId })`.
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  useBalances,
  useDefaultSavings,
  useInsert,
  useOds,
  useRpc,
  useSavings,
  useSettings,
  useTxns,
  useUpdate,
} from '@/data/hooks'
import { Button, Field, Modal } from '@/components/ui'
import { formatDate, formatINR, humanize, todayISO } from '@/lib/format'
import { accrualStart, accruedInterest, checkDraw, closureDifference, outstanding, previewBalance, renewalExpiry, round2 } from '@/lib/calc'
import { TXN_TYPES, type OdAccount, type OdTransaction, type TxnType } from '@/lib/types'

export type DialogReq =
  | { kind: 'txn'; odId: number; type?: TxnType; txn?: OdTransaction }
  | { kind: 'renewal'; odId: number }
  | { kind: 'limit'; odId: number }
  | { kind: 'close'; odId: number }
  | { kind: 'lien'; odId: number }

const Ctx = createContext<{ open: (r: DialogReq) => void }>({ open: () => {} })
export const useOdDialogs = () => useContext(Ctx)

export function OdDialogProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<DialogReq | null>(null)
  const value = useMemo(() => ({ open: setReq }), [])
  const close = () => setReq(null)
  return (
    <Ctx.Provider value={value}>
      {children}
      {req?.kind === 'txn' && <TxnDialog key={`${req.odId}-${req.txn?.id}`} {...req} onClose={close} />}
      {req?.kind === 'renewal' && <RenewalDialog odId={req.odId} onClose={close} onClosedInstead={() => setReq({ kind: 'close', odId: req.odId })} />}
      {req?.kind === 'limit' && <LimitDialog odId={req.odId} onClose={close} />}
      {req?.kind === 'close' && <MarkClosedDialog odId={req.odId} onClose={close} onDone={() => setReq({ kind: 'lien', odId: req.odId })} />}
      {req?.kind === 'lien' && <LienDialog odId={req.odId} onClose={close} />}
    </Ctx.Provider>
  )
}

function useOd(odId: number): OdAccount | undefined {
  return useOds().data?.find((o) => o.id === odId)
}

const numberish = z.coerce.number({ invalid_type_error: 'Enter a number' })
const optionalNumber = z.preprocess((v) => (v === '' || v === null || v === undefined ? null : v), z.coerce.number().nullable())

// ---------------------------------------------------------------------------
// Ledger entry (quick-add and edit)
// ---------------------------------------------------------------------------
const TXN_LABEL: Record<TxnType, string> = {
  opening_balance: 'Opening balance',
  draw: 'Draw to savings',
  repayment: 'Repay from savings',
  interest: 'Interest debit',
  charge: 'Charge',
  closure_debit: 'Closure debit',
  adjustment: 'Adjustment (signed)',
}
export const txnLabel = (t: TxnType) => TXN_LABEL[t]

const txnSchema = z
  .object({
    txn_date: z.string().min(1, 'Required'),
    txn_type: z.enum(TXN_TYPES as [TxnType, ...TxnType[]]),
    amount: numberish,
    savings_account_id: optionalNumber,
    reference: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine((v) => v.amount !== 0, { path: ['amount'], message: 'Amount cannot be zero' })
  .refine((v) => v.txn_type === 'adjustment' || v.amount > 0, { path: ['amount'], message: 'Must be positive (only adjustments are signed)' })
type TxnForm = z.infer<typeof txnSchema>

function TxnDialog({ odId, type, txn, onClose }: { odId: number; type?: TxnType; txn?: OdTransaction; onClose: () => void }) {
  const od = useOd(odId)
  const txns = (useTxns().data ?? []).filter((t) => t.od_id === odId)
  const savings = useSavings().data ?? []
  const defSav = useDefaultSavings()
  const insert = useInsert('od_transactions')
  const update = useUpdate('od_transactions')
  const current = outstanding(txns)

  const { register, handleSubmit, watch, formState } = useForm<TxnForm>({
    resolver: zodResolver(txnSchema) as never,
    defaultValues: txn
      ? {
          txn_date: txn.txn_date,
          txn_type: txn.txn_type,
          amount: txn.amount,
          savings_account_id: txn.savings_account_id,
          reference: txn.reference ?? '',
          notes: txn.notes ?? '',
        }
      : {
          txn_date: todayISO(),
          txn_type: type ?? 'draw',
          amount: type === 'interest' ? estimateFor(od, txns) || ('' as never) : ('' as never),
          savings_account_id: od?.savings_account_id ?? defSav?.id ?? null,
          reference: '',
          notes: '',
        },
  })
  const w = watch()
  const amt = Number(w.amount) || 0
  const after = previewBalance(txns, { id: txn?.id, txn_type: w.txn_type, amount: amt })
  const drawCheck =
    w.txn_type === 'draw' ? checkDraw({ outstanding: after - amt, limit: od?.current_limit, amount: amt, notes: w.notes }) : null
  const closedAfter = od?.status === 'closed' && od.closed_on && w.txn_date > od.closed_on
  const counter = ['draw', 'repayment', 'closure_debit', 'opening_balance'].includes(w.txn_type)

  const onSubmit = async (f: TxnForm) => {
    const row = {
      ...f,
      savings_account_id: counter ? f.savings_account_id : null,
      reference: f.reference || null,
      notes: f.notes || null,
    }
    if (txn) await update.mutateAsync({ id: txn.id, patch: row })
    else await insert.mutateAsync({ ...row, od_id: odId })
    onClose()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`${txn ? 'Edit' : 'Add'} ${txnLabel(w.txn_type).toLowerCase()} · ${od?.od_account_no ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={formState.isSubmitting || !!drawCheck?.blocked || !!closedAfter}>
            Save
          </Button>
        </>
      }
    >
      <form className="grid grid-cols-2 gap-3" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Type">
          <select className="input" {...register('txn_type')}>
            {TXN_TYPES.map((t) => (
              <option key={t} value={t}>
                {txnLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date" error={formState.errors.txn_date?.message}>
          <input type="date" className="input" {...register('txn_date')} />
        </Field>
        <Field label={w.txn_type === 'adjustment' ? 'Amount (+ owe more, − owe less)' : 'Amount (₹)'} error={formState.errors.amount?.message}>
          <input className="input num" inputMode="decimal" autoFocus {...register('amount')} />
        </Field>
        {counter ? (
          <Field label="Savings account">
            <select className="input" {...register('savings_account_id')}>
              <option value="">—</option>
              {savings.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.account_no} {s.nickname ? `(${s.nickname})` : ''}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}
        <Field label="Reference / UTR">
          <input className="input" {...register('reference')} />
        </Field>
        <Field label="Notes">
          <input className="input" {...register('notes')} placeholder={drawCheck?.overLimit ? 'Type "override" to allow' : ''} />
        </Field>
        <div className="col-span-2 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
          <div className="flex justify-between">
            <span>Outstanding now</span>
            <span className="num">{formatINR(current)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>After this entry</span>
            <span className="num">{formatINR(after)}</span>
          </div>
          {od?.current_limit != null && (
            <div className="flex justify-between text-slate-500 dark:text-slate-400">
              <span>Available after</span>
              <span className="num">{formatINR(round2(od.current_limit - after))}</span>
            </div>
          )}
          {drawCheck?.overLimit && (
            <p className={drawCheck.blocked ? 'mt-2 text-red-600' : 'mt-2 text-amber-600'}>
              Exceeds the limit of {formatINR(od?.current_limit)} by {formatINR(drawCheck.excess)}.
              {drawCheck.blocked ? ' Add "override" to notes to record it anyway.' : ' Recording with override.'}
            </p>
          )}
          {closedAfter && <p className="mt-2 text-red-600">This OD was closed on {formatDate(od?.closed_on)}; entries after that date are not allowed.</p>}
        </div>
      </form>
    </Modal>
  )
}

/** Interest estimate since the last debit, for prefilling an interest entry. */
export function estimateFor(od: OdAccount | undefined, txns: Pick<OdTransaction, 'txn_type' | 'txn_date' | 'amount'>[], today = todayISO()): number {
  if (!od) return 0
  return accruedInterest({ outstanding: outstanding(txns), ratePct: od.interest_rate, sinceISO: accrualStart(txns), todayISO: today })
}

// ---------------------------------------------------------------------------
// C. Record renewal
// ---------------------------------------------------------------------------
const renewalSchema = z.object({
  start: z.string().min(1, 'Required'),
  new_expiry: z.string().min(1, 'Required'),
  limit: numberish.positive('Must be positive'),
  rate: numberish.min(0),
  renewal_type: z.enum(['auto', 'manual']),
  fd_rolled_over: z.boolean(),
  fd_maturity: z.string().optional(),
  notes: z.string().optional(),
})
type RenewalForm = z.infer<typeof renewalSchema>

function RenewalDialog({ odId, onClose, onClosedInstead }: { odId: number; onClose: () => void; onClosedInstead: () => void }) {
  const od = useOd(odId)
  const months = useSettings().data?.renewal_months ?? 12
  const rpc = useRpc('record_renewal', 'Renewal recorded')
  const oldExpiry = od?.expiry_date ?? todayISO()
  const newExpiry = renewalExpiry(oldExpiry, months)
  const { register, handleSubmit, watch, formState } = useForm<RenewalForm>({
    resolver: zodResolver(renewalSchema) as never,
    defaultValues: {
      start: oldExpiry,
      new_expiry: newExpiry,
      limit: od?.current_limit ?? 0,
      rate: od?.interest_rate ?? 0,
      renewal_type: 'auto',
      fd_rolled_over: true,
      fd_maturity: newExpiry,
      notes: '',
    },
  })
  const rolled = watch('fd_rolled_over')
  const onSubmit = async (f: RenewalForm) => {
    await rpc.mutateAsync({
      p_od_id: odId,
      p_start: f.start,
      p_new_expiry: f.new_expiry,
      p_limit: f.limit,
      p_rate: f.rate,
      p_fd_rolled_over: f.fd_rolled_over,
      p_fd_maturity: f.fd_rolled_over && f.fd_maturity ? f.fd_maturity : null,
      p_renewal_type: f.renewal_type,
      p_notes: f.notes || null,
    })
    onClose()
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Record renewal · ${od?.od_account_no ?? ''}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClosedInstead} className="mr-auto">
            It was actually closed →
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit(onSubmit)} disabled={formState.isSubmitting}>
            Save renewal
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        Expired {formatDate(od?.expiry_date)}. The balance carries over unchanged; adjust anything the bank changed.
      </p>
      <form className="grid grid-cols-2 gap-3" onSubmit={handleSubmit(onSubmit)}>
        <Field label="Renewed on (term start)" error={formState.errors.start?.message}>
          <input type="date" className="input" {...register('start')} />
        </Field>
        <Field label="New expiry" error={formState.errors.new_expiry?.message}>
          <input type="date" className="input" {...register('new_expiry')} />
        </Field>
        <Field label="Limit (₹)" error={formState.errors.limit?.message}>
          <input className="input num" inputMode="decimal" {...register('limit')} />
        </Field>
        <Field label="Rate (% p.a.)" error={formState.errors.rate?.message}>
          <input className="input num" inputMode="decimal" {...register('rate')} />
        </Field>
        <Field label="Renewal type">
          <select className="input" {...register('renewal_type')}>
            <option value="auto">Auto</option>
            <option value="manual">Manual</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm">
          <input type="checkbox" className="h-4 w-4" {...register('fd_rolled_over')} /> FD rolled over
        </label>
        {rolled && (
          <Field label="FD new maturity date">
            <input type="date" className="input" {...register('fd_maturity')} />
          </Field>
        )}
        <div className="col-span-2">
          <Field label="Notes">
            <input className="input" {...register('notes')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// D. Limit change
// ---------------------------------------------------------------------------
function LimitDialog({ odId, onClose }: { odId: number; onClose: () => void }) {
  const od = useOd(odId)
  const rpc = useRpc('change_limit', 'Limit updated')
  const schema = z.object({ on: z.string().min(1), limit: numberish.positive('Must be positive'), notes: z.string().optional() })
  const { register, handleSubmit, formState } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema) as never,
    defaultValues: { on: todayISO(), limit: od?.current_limit ?? 0, notes: '' },
  })
  return (
    <Modal
      open
      onClose={onClose}
      title={`Change limit · ${od?.od_account_no ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={formState.isSubmitting}
            onClick={handleSubmit(async (f) => {
              await rpc.mutateAsync({ p_od_id: odId, p_on: f.on, p_new_limit: f.limit, p_notes: f.notes || null })
              onClose()
            })}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Effective date">
          <input type="date" className="input" {...register('on')} />
        </Field>
        <Field label={`New limit (now ${formatINR(od?.current_limit)})`} error={formState.errors.limit?.message}>
          <input className="input num" inputMode="decimal" autoFocus {...register('limit')} />
        </Field>
        <div className="col-span-2">
          <Field label="Notes">
            <input className="input" {...register('notes')} />
          </Field>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// B4. Mark closed
// ---------------------------------------------------------------------------
function MarkClosedDialog({ odId, onClose, onDone }: { odId: number; onClose: () => void; onDone: () => void }) {
  const od = useOd(odId)
  const txns = (useTxns().data ?? []).filter((t) => t.od_id === odId)
  const bal = useBalances().data?.find((b) => b.od_id === odId)
  const rpc = useRpc('mark_closed', 'OD closed')
  const owed = outstanding(txns)
  const est = bal?.accrued_interest_estimate ?? 0
  const [closedOn, setClosedOn] = useState(todayISO())
  // Prefills follow live data (the ledger may still be refetching after a
  // repayment) until the user types their own figure.
  const [interestIn, setInterest] = useState<string | null>(null)
  const [residualIn, setResidual] = useState<string | null>(null)
  const interest = interestIn ?? String(est || '')
  const residual = residualIn ?? String(round2(owed + (Number(interest) || 0)) || '')
  const [adjust, setAdjust] = useState(false)
  const i = Number(interest) || 0
  const r = Number(residual) || 0
  const diff = closureDifference(owed + i, r)
  const canSave = diff === 0 || adjust

  const save = async () => {
    await rpc.mutateAsync({
      p_od_id: odId,
      p_closed_on: closedOn,
      p_residual: r,
      p_final_interest: i,
      p_adjustment: diff === 0 ? 0 : -diff,
    })
    onDone()
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Mark closed · ${od?.od_account_no ?? ''}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="success" onClick={save} disabled={!canSave || rpc.isPending}>
            Mark closed
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Closed on">
          <input type="date" className="input" value={closedOn} onChange={(e) => setClosedOn(e.target.value)} />
        </Field>
        <div />
        <Field label="Final interest debited by bank" hint={`Estimate since last debit: ${formatINR(est)}`}>
          <input className="input num" inputMode="decimal" value={interest} onChange={(e) => setInterest(e.target.value)} />
        </Field>
        <Field label="Residual debited from savings" hint="Amount the bank took from savings to close it">
          <input className="input num" inputMode="decimal" value={residual} onChange={(e) => setResidual(e.target.value)} />
        </Field>
      </div>
      <div className="mt-3 rounded-lg bg-slate-100 p-3 text-sm dark:bg-slate-800">
        <Row label="Outstanding in ledger" value={owed} />
        <Row label="+ final interest" value={i} />
        <Row label="− residual debit" value={r} />
        <div className="mt-1 border-t border-slate-300 pt-1 dark:border-slate-700">
          <Row label="Left after closure" value={diff} bold />
        </div>
        {diff !== 0 && (
          <label className="mt-2 flex items-start gap-2 text-amber-700 dark:text-amber-400">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={adjust} onChange={(e) => setAdjust(e.target.checked)} />
            <span>
              The ledger would not net to zero. Add an adjustment of {formatINR(-diff)} to balance it.
            </span>
          </label>
        )}
      </div>
    </Modal>
  )
}

function Row({ label, value, bold }: { label: string; value: number; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span>{label}</span>
      <span className="num">{formatINR(value)}</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Lien released
// ---------------------------------------------------------------------------
function LienDialog({ odId, onClose }: { odId: number; onClose: () => void }) {
  const od = useOd(odId)
  const rpc = useRpc('mark_lien_released', 'Lien marked released')
  const [on, setOn] = useState(od?.closed_on ?? todayISO())
  return (
    <Modal
      open
      onClose={onClose}
      title="Lien released on the FD?"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Not yet
          </Button>
          <Button
            variant="success"
            disabled={rpc.isPending}
            onClick={async () => {
              await rpc.mutateAsync({ p_od_id: odId, p_on: on })
              onClose()
            }}
          >
            Yes, released
          </Button>
        </>
      }
    >
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        OD {od?.od_account_no} is {humanize(od?.status ?? '')}. Marking the lien released frees the linked FD(s).
      </p>
      <Field label="Released on">
        <input type="date" className="input" value={on} onChange={(e) => setOn(e.target.value)} />
      </Field>
    </Modal>
  )
}
