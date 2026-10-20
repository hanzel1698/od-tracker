import { useBranches } from '@/data/hooks'
import { CrudTable } from '@/components/CrudTable'
import { PageHeader } from '@/components/ui'
import type { Branch } from '@/lib/types'

export function BranchList() {
  const q = useBranches()
  return (
    <div>
      <PageHeader title="Branches" subtitle="Closure emails go to the branch email of the OD's home branch." />
      <CrudTable<Branch>
        table="branches"
        rows={q.data ?? []}
        loading={q.isLoading}
        newRow={() => ({})}
        describe={(r) => `branch ${r.code} (${r.name})`}
        cols={[
          { key: 'code', label: 'Code', required: true },
          { key: 'name', label: 'Name', required: true },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
        ]}
      />
    </div>
  )
}
