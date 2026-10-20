import { useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useBranches, useSavings, useUpdate } from '@/data/hooks'
import { Button, Card, Field } from '@/components/ui'
import { OD_CHANNELS, OD_STATUSES, type OdAccount } from '@/lib/types'

const blankToNull = (v: unknown) => (v === '' || v === undefined ? null : v)
const num = z.preprocess(blankToNull, z.coerce.number({ invalid_type_error: 'Enter a number' }).nullable())
const int = z.preprocess(blankToNull, z.coerce.number().int('Whole number').nullable())
const str = z.preprocess(blankToNull, z.string().nullable())
const date = z.preprocess(blankToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable())

export const odSchema = z.object({
  od_account_no: z.string().trim().min(1, 'Required'),
  bank: z.string().trim().min(1, 'Required'),
  branch_code: str,
  channel: z.preprocess(blankToNull, z.enum(OD_CHANNELS as [string, ...string[]]).nullable()),
  opened_on: date,
  sanctioned_limit: num,
  current_limit: num,
  interest_rate: num,
  term_days: int,
  expiry_date: date,
  original_expiry_date: date,
  savings_account_id: int,
  status: z.enum(OD_STATUSES as [string, ...string[]]),
  closed_on: date,
  closure_requested_on: date,
  closure_email_to: str,
  lien_released_on: date,
  reminder_days: int,
  bank_reported_balance: num,
  bank_balance_as_of: date,
  reference_no: str,
  notes: str,
})
type Form = z.infer<typeof odSchema>

const FIELDS: { name: keyof Form; label: string; type?: 'date' | 'number' | 'textarea'; hint?: string }[] = [
  { name: 'od_account_no', label: 'OD account no.' },
  { name: 'bank', label: 'Bank' },
  { name: 'opened_on', label: 'Opened on', type: 'date' },
  { name: 'sanctioned_limit', label: 'Sanctioned limit (₹)', type: 'number' },
  { name: 'current_limit', label: 'Current limit (₹)', type: 'number' },
  { name: 'interest_rate', label: 'Interest rate (% p.a.)', type: 'number' },
  { name: 'term_days', label: 'Term (days)', type: 'number' },
  { name: 'expiry_date', label: 'Current expiry', type: 'date' },
  { name: 'original_expiry_date', label: 'Original expiry', type: 'date' },
  { name: 'reminder_days', label: 'Warn days before expiry', type: 'number' },
  { name: 'closure_requested_on', label: 'Closure requested on', type: 'date' },
  { name: 'closure_email_to', label: 'Closure email sent to' },
  { name: 'closed_on', label: 'Closed on', type: 'date' },
  { name: 'lien_released_on', label: 'Lien released on', type: 'date' },
  { name: 'bank_reported_balance', label: 'Bank-reported balance (₹)', type: 'number', hint: 'From YONO, for reconciliation' },
  { name: 'bank_balance_as_of', label: 'Bank balance as of', type: 'date' },
  { name: 'reference_no', label: 'Reference / SR no.' },
]

function toForm(od: OdAccount): Form {
  const f: Record<string, unknown> = {}
  for (const k of Object.keys(odSchema.shape)) f[k] = (od as unknown as Record<string, unknown>)[k] ?? ''
  return f as Form
}

export function OdForm({ od }: { od: OdAccount }) {
  const branches = useBranches().data ?? []
  const savings = useSavings().data ?? []
  const update = useUpdate('od_accounts')
  const { register, handleSubmit, reset, formState } = useForm<Form>({ resolver: zodResolver(odSchema) as never, defaultValues: toForm(od) })

  useEffect(() => {
    if (!formState.isDirty) reset(toForm(od))
  }, [od, reset, formState.isDirty])

  const onSubmit = async (f: Form) => {
    await update.mutateAsync({ id: od.id, patch: f as Partial<OdAccount> })
    reset(f)
  }

  return (
    <Card>
      <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Status">
          <select className="input" {...register('status')}>
            {OD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Branch">
          <select className="input" {...register('branch_code')}>
            <option value="">—</option>
            {branches.map((b) => (
              <option key={b.id} value={b.code}>
                {b.code} · {b.name}
              </option>
            ))}
            {od.branch_code && !branches.some((b) => b.code === od.branch_code) && <option value={od.branch_code}>{od.branch_code}</option>}
          </select>
        </Field>
        <Field label="Channel">
          <select className="input" {...register('channel')}>
            <option value="">—</option>
            {OD_CHANNELS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Savings account (draw / repay)">
          <select className="input" {...register('savings_account_id')}>
            <option value="">—</option>
            {savings.map((s) => (
              <option key={s.id} value={s.id}>
                {s.account_no} {s.nickname ? `(${s.nickname})` : ''}
              </option>
            ))}
          </select>
        </Field>
        {FIELDS.map((f) => (
          <Field key={f.name} label={f.label} hint={f.hint} error={formState.errors[f.name]?.message as string | undefined}>
            <input
              className="input"
              type={f.type === 'date' ? 'date' : 'text'}
              inputMode={f.type === 'number' ? 'decimal' : undefined}
              {...register(f.name)}
            />
          </Field>
        ))}
        <div className="sm:col-span-2 lg:col-span-3">
          <Field label="Notes">
            <textarea className="input" rows={3} {...register('notes')} />
          </Field>
        </div>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={!formState.isDirty || formState.isSubmitting}>
            Save changes
          </Button>
          <Button variant="secondary" disabled={!formState.isDirty} onClick={() => reset(toForm(od))}>
            Discard
          </Button>
        </div>
      </form>
    </Card>
  )
}
