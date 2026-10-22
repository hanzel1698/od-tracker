import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addDays, format, parseISO } from 'date-fns'
import { useBranches, useDefaultSavings, useFds, useInsert, useRpc, useSavings, useSettings } from '@/data/hooks'
import { Button, Card, Field, Modal, PageHeader } from '@/components/ui'
import { formatDate, formatINR, todayISO } from '@/lib/format'
import { renewalExpiry, round2 } from '@/lib/calc'
import { depositValue, isOpenDeposit } from '@/lib/deposits'
import { OD_CHANNELS } from '@/lib/types'

const blank = (v: unknown) => (v === '' ? null : v)
const schema = z.object({
  od_account_no: z.string().trim().min(1, 'Required'),
  opened_on: z.string().min(1, 'Required'),
  sanctioned_limit: z.coerce.number({ invalid_type_error: 'Enter a number' }).positive('Must be positive'),
  interest_rate: z.preprocess(blank, z.coerce.number().min(0).nullable()),
  term_days: z.preprocess(blank, z.coerce.number().int().positive().nullable()),
  expiry_date: z.string().min(1, 'Required'),
  branch_code: z.string().optional(),
  channel: z.string().optional(),
  savings_account_id: z.preprocess(blank, z.coerce.number().nullable()),
  reference_no: z.string().optional(),
  notes: z.string().optional(),
  fds: z.array(
    z.object({
      // Set when the row was filled from an existing free FD; create_od then links that record.
      fd_id: z.number().nullable().optional(),
      fd_account_no: z.string().trim().min(1, 'FD no. required'),
      principal: z.preprocess(blank, z.coerce.number().nullable()),
      interest_rate: z.preprocess(blank, z.coerce.number().nullable()),
      maturity_date: z.string().optional(),
    }),
  ),
})
type Form = z.infer<typeof schema>
const blankFd: Form['fds'][number] = { fd_id: null, fd_account_no: '', principal: null, interest_rate: null, maturity_date: '' }

export function NewOd() {
  const nav = useNavigate()
  const branches = useBranches().data ?? []
  const savings = useSavings().data ?? []
  const defSav = useDefaultSavings()
  const settings = useSettings().data
  // Deposits that could secure the new OD: open and not already under lien.
  const freeFds = (useFds().data ?? [])
    .filter((f) => isOpenDeposit(f) && !f.lien_marked)
    .sort((a, b) => (a.maturity_date ?? '').localeCompare(b.maturity_date ?? ''))
  const create = useRpc<Record<string, unknown>, number>('create_od', 'OD created')
  const insertTxn = useInsert('od_transactions')
  const [created, setCreated] = useState<{ id: number; limit: number; savingsId: number | null; date: string } | null>(null)

  const today = todayISO()
  const { register, control, handleSubmit, setValue, getValues, formState } = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      opened_on: today,
      expiry_date: renewalExpiry(today, 12),
      channel: 'YONO',
      branch_code: branches[0]?.code ?? '',
      savings_account_id: defSav?.id ?? null,
      fds: [{ ...blankFd }],
    },
  })
  const fds = useFieldArray({ control, name: 'fds' })
  const fdRows = useWatch({ control, name: 'fds' }) ?? []
  const fdTotal = round2(fdRows.reduce((s, r) => s + (Number(r?.principal) || 0), 0))

  /** Fill row i from a free FD, or clear it back to a blank, hand-entered FD. */
  const pickFd = (i: number, id: string) => {
    const fd = freeFds.find((f) => f.id === Number(id))
    const row = fd
      ? { fd_id: fd.id, fd_account_no: fd.fd_account_no, principal: fd.principal, interest_rate: fd.interest_rate, maturity_date: fd.maturity_date ?? '' }
      : blankFd
    for (const [k, v] of Object.entries(row)) setValue(`fds.${i}.${k as keyof typeof row}`, v as never, { shouldValidate: k === 'fd_account_no' && !!fd })
  }

  // Lists may arrive after the first render; fill the defaults once they do.
  useEffect(() => {
    if (!getValues('branch_code') && branches[0]) setValue('branch_code', branches[0].code)
    if (!getValues('savings_account_id') && defSav) setValue('savings_account_id', defSav.id)
  }, [branches, defSav, getValues, setValue])

  const onSubmit = async (f: Form) => {
    const { fds: fdRows, ...od } = f
    const id = await create.mutateAsync({
      p_od: {
        ...od,
        branch_code: od.branch_code || null,
        channel: od.channel || null,
        current_limit: od.sanctioned_limit,
        reminder_days: settings?.default_reminder_days ?? 21,
        savings_account_id: od.savings_account_id ?? defSav?.id ?? null,
      },
      p_fds: fdRows.map(({ fd_id: _, ...x }) => ({ ...x, maturity_date: x.maturity_date || null, opened_on: od.opened_on })),
    })
    setCreated({ id, limit: od.sanctioned_limit, savingsId: od.savings_account_id ?? defSav?.id ?? null, date: od.opened_on })
  }

  const fromTerm = () => {
    const d = Number(getValues('term_days'))
    const o = getValues('opened_on')
    if (d && o) setValue('expiry_date', format(addDays(parseISO(o), d), 'yyyy-MM-dd'))
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Open new OD" subtitle="Creates the OD, its first term, FD links and an 'opened' event." />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Card title="Overdraft">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="OD account no." error={formState.errors.od_account_no?.message}>
              <input className="input font-mono" {...register('od_account_no')} />
            </Field>
            <Field label="Opening date" error={formState.errors.opened_on?.message}>
              <input type="date" className="input" {...register('opened_on')} />
            </Field>
            <Field
              label="Sanctioned limit (₹)"
              error={formState.errors.sanctioned_limit?.message}
              hint={fdTotal > 0 ? `Usually about 90% of the FD: ${formatINR(round2(fdTotal * 0.9), { whole: true })}` : 'Usually about 90% of the FD'}
            >
              <input className="input num" inputMode="decimal" {...register('sanctioned_limit')} />
            </Field>
            <Field label="Interest rate (% p.a.)" error={formState.errors.interest_rate?.message}>
              <input className="input num" inputMode="decimal" {...register('interest_rate')} />
            </Field>
            <Field label="Term (days)" hint={<button type="button" className="text-blue-600 underline" onClick={fromTerm}>Set expiry from term</button>}>
              <input className="input num" inputMode="numeric" {...register('term_days')} />
            </Field>
            <Field label="Expiry date" error={formState.errors.expiry_date?.message}>
              <input type="date" className="input" {...register('expiry_date')} />
            </Field>
            <Field label="Branch">
              <select className="input" {...register('branch_code')}>
                <option value="">—</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.code}>
                    {b.code} · {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Channel">
              <select className="input" {...register('channel')}>
                {OD_CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
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
            <Field label="Reference no.">
              <input className="input" {...register('reference_no')} />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Notes">
                <input className="input" {...register('notes')} />
              </Field>
            </div>
          </div>
        </Card>

        <Card
          title="Fixed deposit(s) under lien"
          actions={
            <Button size="sm" variant="secondary" onClick={() => fds.append({ ...blankFd })}>
              + Another FD
            </Button>
          }
        >
          <div className="space-y-3">
            {fds.fields.map((f, i) => {
              const pickedId = fdRows[i]?.fd_id ?? null
              // A picked FD's details come from its record; edit them on the FD itself.
              const locked = pickedId != null
              const takenElsewhere = new Set(fdRows.filter((_, j) => j !== i).map((r) => r?.fd_id))
              return (
                <div key={f.id} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-slate-800">
                  {freeFds.length > 0 && (
                    <Field label="Free FD">
                      <select className="input" value={pickedId ?? ''} onChange={(e) => pickFd(i, e.target.value)}>
                        <option value="">New FD (enter details below)</option>
                        {freeFds
                          .filter((d) => !takenElsewhere.has(d.id))
                          .map((d) => (
                            <option key={d.id} value={d.id}>
                              {d.fd_account_no} · {formatINR(depositValue(d), { whole: true })}
                              {d.maturity_date ? ` · matures ${formatDate(d.maturity_date)}` : ''}
                            </option>
                          ))}
                      </select>
                    </Field>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                    <div className="col-span-2 sm:col-span-1">
                      <Field label="FD no." error={formState.errors.fds?.[i]?.fd_account_no?.message}>
                        <input className="input font-mono" readOnly={locked} {...register(`fds.${i}.fd_account_no`)} />
                      </Field>
                    </div>
                    <Field label="Principal">
                      <input className="input num" inputMode="decimal" readOnly={locked} {...register(`fds.${i}.principal`)} />
                    </Field>
                    <Field label="Rate %">
                      <input className="input num" inputMode="decimal" readOnly={locked} {...register(`fds.${i}.interest_rate`)} />
                    </Field>
                    <Field label="Maturity">
                      <input type="date" className="input" readOnly={locked} {...register(`fds.${i}.maturity_date`)} />
                    </Field>
                    <button type="button" className="self-end pb-2 text-slate-400 hover:text-red-600" onClick={() => fds.remove(i)} title="Remove">
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}
            {!fds.fields.length && <p className="text-sm text-slate-500">No FD (you can link one later).</p>}
          </div>
        </Card>

        <div className="flex gap-2">
          <Button type="submit" disabled={formState.isSubmitting}>
            Create OD
          </Button>
          <Button variant="secondary" onClick={() => nav(-1)}>
            Cancel
          </Button>
        </div>
      </form>

      <Modal
        open={!!created}
        onClose={() => nav(`/ods/${created?.id}`)}
        title="Record first draw?"
        footer={
          <>
            <Button variant="secondary" onClick={() => nav(`/ods/${created?.id}`)}>
              Not now
            </Button>
            <Button
              disabled={insertTxn.isPending}
              onClick={async () => {
                if (!created) return
                await insertTxn.mutateAsync({
                  od_id: created.id,
                  txn_date: created.date,
                  txn_type: 'draw',
                  amount: created.limit,
                  savings_account_id: created.savingsId,
                  notes: 'First draw to savings',
                })
                nav(`/ods/${created.id}`)
              }}
            >
              Draw {formatINR(created?.limit)} to savings
            </Button>
          </>
        }
      >
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Transfer the full limit of {formatINR(created?.limit)} to your savings account
          {savings.find((s) => s.id === created?.savingsId) ? ` ${savings.find((s) => s.id === created?.savingsId)!.account_no}` : ''}? You can edit the
          amount in the ledger later.
        </p>
      </Modal>
    </div>
  )
}
