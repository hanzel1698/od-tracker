import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { invalidateAll, useBranches, useSavings, useUpdate } from '@/data/hooks'
import { CrudTable } from '@/components/CrudTable'
import { PageHeader } from '@/components/ui'
import { errorMessage, supabase } from '@/lib/supabase'
import type { SavingsAccount } from '@/lib/types'

export function SavingsList() {
  const q = useSavings()
  const branches = useBranches().data ?? []
  const update = useUpdate('savings_accounts')
  const qc = useQueryClient()

  // Only one default: clear the old one first (a partial unique index enforces it).
  const makeDefault = async (id: number) => {
    const { error: e1 } = await supabase.from('savings_accounts').update({ is_default: false }).eq('is_default', true)
    const { error: e2 } = e1 ? { error: e1 } : await supabase.from('savings_accounts').update({ is_default: true }).eq('id', id)
    if (e2) toast.error(errorMessage(e2))
    else toast.success('Default savings account updated')
    invalidateAll(qc)
  }

  return (
    <div>
      <PageHeader title="Savings accounts" subtitle="Where draws go and repayments come from. One is the default for new entries." />
      <CrudTable<SavingsAccount>
        table="savings_accounts"
        rows={q.data ?? []}
        loading={q.isLoading}
        newRow={() => ({ bank: 'SBI', is_default: !(q.data ?? []).length })}
        describe={(r) => `savings account ${r.account_no}`}
        onSave={(r, key, v) => (key === 'is_default' ? (v ? makeDefault(r.id) : update.mutate({ id: r.id, patch: { is_default: false } })) : update.mutate({ id: r.id, patch: { [key]: v } }))}
        cols={[
          { key: 'account_no', label: 'Account no.', required: true },
          { key: 'nickname', label: 'Nickname' },
          { key: 'bank', label: 'Bank' },
          { key: 'branch_code', label: 'Branch', kind: 'select', options: branches.map((b) => ({ value: b.code, label: `${b.code} · ${b.name}` })) },
          {
            key: 'is_default',
            label: 'Default',
            kind: 'boolean',
            render: (r) => (r.is_default ? <span className="font-medium text-emerald-700 dark:text-emerald-400">★ Default</span> : <span className="text-slate-400">—</span>),
          },
        ]}
      />
    </div>
  )
}
