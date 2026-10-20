import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { addDays, format, parseISO } from 'date-fns'
import { useBranches, useDefaultSavings, useInsert, useRpc, useSavings, useSettings } from '@/data/hooks'
import { Button, Card, Field, Modal, PageHeader } from '@/components/ui'
import { formatINR, todayISO } from '@/lib/format'
import { renewalExpiry } from '@/lib/calc'
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
      fd_account_no: z.string().trim().min(1, 'FD no. required'),
      principal: z.preprocess(blank, z.coerce.number().nullable()),
      interest_rate: z.preprocess(blank, z.coerce.number().nullable()),
      maturity_date: z.string().optional(),
    }),
  ),
})
type Form = z.infer<typeof schema>

export function NewOd() {
  const nav = useNavigate()
  const branches = useBranches().data ?? []
  const savings = useSavings().data ?? []
  const defSav = useDefaultSavings()
  const settings = useSettings().data
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
      fds: [{ fd_account_no: '', principal: null, interest_rate: null, maturity_date: '' }],
    },
  })
  const fds = useFieldArray({ control, name: 'fds' })

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
      p_fds: fdRows.map((x) => ({ ...x, maturity_date: x.maturity_date || null, opened_on: od.opened_on })),
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
            <Field label="Sanctioned limit (₹)" error={formState.errors.sanctioned_limit?.message} hint="Usually about 90% of the FD">
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
            <Button size="sm" variant="secondary" onClick={() => fds.append({ fd_account_no: '', principal: null, interest_rate: null, maturity_date: '' })}>
              + Another FD
            </Button>
          }
        >
          <div className="space-y-3">
            {fds.fields.map((f, i) => (
              <div key={f.id} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                <div className="col-span-2 sm:col-span-1">
                  <Field label="FD no." error={formState.errors.fds?.[i]?.fd_account_no?.message}>
                    <input className="input font-mono" {...register(`fds.${i}.fd_account_no`)} />
                  </Field>
                </div>
                <Field label="Principal">
                  <input className="input num" inputMode="decimal" {...register(`fds.${i}.principal`)} />
                </Field>
                <Field label="Rate %">
                  <input className="input num" inputMode="decimal" {...register(`fds.${i}.interest_rate`)} />
                </Field>
                <Field label="Maturity">
                  <input type="date" className="input" {...register(`fds.${i}.maturity_date`)} />
                </Field>
                <button type="button" className="self-end pb-2 text-slate-400 hover:text-red-600" onClick={() => fds.remove(i)} title="Remove">
                  ✕
                </button>
              </div>
            ))}
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
