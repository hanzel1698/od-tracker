import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'
import { invalidateAll, useDefaultSavings, useSettings } from '@/data/hooks'
import { useAuth } from '@/features/auth/AuthProvider'
import { Button, Card, Field, PageHeader } from '@/components/ui'
import { errorMessage, supabase } from '@/lib/supabase'

const schema = z.object({
  full_name: z.string().trim().min(1, 'Used to sign closure emails'),
  cif_no: z.string().trim().min(1, 'Used in closure emails'),
  default_reminder_days: z.coerce.number().int().min(0).max(365),
  renewal_months: z.coerce.number().int().min(1).max(120),
})
type Form = z.infer<typeof schema>

export function Settings() {
  const q = useSettings()
  const { session } = useAuth()
  const defSav = useDefaultSavings()
  const qc = useQueryClient()
  const { register, handleSubmit, reset, formState } = useForm<Form>({
    resolver: zodResolver(schema) as never,
    defaultValues: { full_name: '', cif_no: '', default_reminder_days: 21, renewal_months: 12 },
  })

  useEffect(() => {
    if (q.data)
      reset({
        full_name: q.data.full_name ?? '',
        cif_no: q.data.cif_no ?? '',
        default_reminder_days: q.data.default_reminder_days,
        renewal_months: q.data.renewal_months,
      })
  }, [q.data, reset])

  const onSubmit = async (f: Form) => {
    const { error } = await supabase.from('user_settings').upsert({ user_id: session?.user.id, ...f })
    if (error) toast.error(errorMessage(error))
    else toast.success('Settings saved')
    invalidateAll(qc)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader title="Settings" subtitle={session?.user.email} />
      <Card>
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Your name (signs emails)" error={formState.errors.full_name?.message}>
            <input className="input" {...register('full_name')} />
          </Field>
          <Field label="CIF number" error={formState.errors.cif_no?.message}>
            <input className="input font-mono" {...register('cif_no')} />
          </Field>
          <Field label="Default reminder (days before expiry)" hint="Used for new ODs; each OD has its own value too.">
            <input className="input num" inputMode="numeric" {...register('default_reminder_days')} />
          </Field>
          <Field label="Default auto-renewal period (months)">
            <input className="input num" inputMode="numeric" {...register('renewal_months')} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={formState.isSubmitting}>
              Save
            </Button>
          </div>
        </form>
      </Card>
      <Card title="Default savings account">
        <p className="text-sm">
          {defSav ? (
            <>
              <span className="font-mono">{defSav.account_no}</span> {defSav.nickname && `(${defSav.nickname})`}
            </>
          ) : (
            'None set.'
          )}{' '}
          <Link to="/savings" className="text-blue-600 underline">
            Change
          </Link>
        </p>
      </Card>
      <Card title="Opening balances">
        <p className="mb-2 text-sm text-slate-600 dark:text-slate-300">Record what you owed on active ODs when you started tracking.</p>
        <Link to="/opening-balances">
          <Button variant="secondary" size="sm">
            Open the opening-balances screen
          </Button>
        </Link>
      </Card>
    </div>
  )
}
