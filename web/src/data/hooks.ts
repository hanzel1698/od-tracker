// Thin TanStack Query layer over Supabase. The data set is small (tens of ODs,
// hundreds of ledger rows), so each table is fetched whole and every write
// invalidates everything; derived views then stay consistent with no bookkeeping.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { errorMessage, supabase } from '@/lib/supabase'
import type {
  Branch,
  FixedDeposit,
  OdAccount,
  OdAlert,
  OdBalance,
  OdEvent,
  OdFdLink,
  OdSummary,
  OdTerm,
  OdTransaction,
  SavingsAccount,
  TableName,
  UserSettings,
  ViewName,
} from '@/lib/types'

interface RowTypes {
  user_settings: UserSettings
  savings_accounts: SavingsAccount
  branches: Branch
  od_accounts: OdAccount
  fixed_deposits: FixedDeposit
  od_fd_links: OdFdLink
  od_events: OdEvent
  od_transactions: OdTransaction
  od_terms: OdTerm
  od_balances: OdBalance
  od_alerts: OdAlert
  od_summary: OdSummary
}

const ORDER: Partial<Record<TableName | ViewName, { column: string; ascending: boolean }>> = {
  od_accounts: { column: 'opened_on', ascending: false },
  fixed_deposits: { column: 'fd_account_no', ascending: true },
  od_events: { column: 'event_date', ascending: true },
  od_transactions: { column: 'txn_date', ascending: true },
  od_terms: { column: 'term_no', ascending: true },
  branches: { column: 'code', ascending: true },
  savings_accounts: { column: 'id', ascending: true },
}

export const qk = (name: TableName | ViewName) => ['t', name] as const

async function fetchAll<K extends keyof RowTypes>(name: K): Promise<RowTypes[K][]> {
  let q = supabase.from(name).select('*')
  const o = ORDER[name as TableName]
  if (o) q = q.order(o.column, { ascending: o.ascending, nullsFirst: false })
  const { data, error } = await q
  if (error) throw error
  return (data ?? []) as RowTypes[K][]
}

export function useRows<K extends keyof RowTypes>(name: K) {
  return useQuery({ queryKey: qk(name as TableName), queryFn: () => fetchAll(name) })
}

export const useOds = () => useRows('od_accounts')
export const useBalances = () => useRows('od_balances')
export const useAlerts = () => useRows('od_alerts')
export const useTxns = () => useRows('od_transactions')
export const useTerms = () => useRows('od_terms')
export const useEvents = () => useRows('od_events')
export const useFds = () => useRows('fixed_deposits')
export const useLinks = () => useRows('od_fd_links')
export const useBranches = () => useRows('branches')
export const useSavings = () => useRows('savings_accounts')

export function useSummary() {
  return useQuery({
    queryKey: qk('od_summary'),
    queryFn: async () => {
      const { data, error } = await supabase.from('od_summary').select('*').single()
      if (error) throw error
      return data as OdSummary
    },
  })
}

export function useSettings() {
  return useQuery({
    queryKey: qk('user_settings'),
    queryFn: async () => {
      const { data, error } = await supabase.from('user_settings').select('*').maybeSingle()
      if (error) throw error
      return (data as UserSettings | null) ?? null
    },
  })
}

export function invalidateAll(qc: QueryClient) {
  return qc.invalidateQueries({ queryKey: ['t'] })
}

type Patch<K extends TableName> = Partial<RowTypes[K]>

/** Insert rows; returns the inserted rows. */
export function useInsert<K extends TableName>(table: K, opts: { silent?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (rows: Patch<K> | Patch<K>[]) => {
      const { data, error } = await supabase.from(table).insert(rows as never).select()
      if (error) throw error
      return data as RowTypes[K][]
    },
    onSuccess: () => {
      if (!opts.silent) toast.success('Saved')
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => invalidateAll(qc),
  })
}

/**
 * Update one row by primary key, optimistically: the cached row changes at
 * once and is rolled back if Supabase rejects the write.
 */
export function useUpdate<K extends TableName>(table: K, opts: { silent?: boolean } = {}) {
  const qc = useQueryClient()
  const key = qk(table)
  const pk = table === 'user_settings' ? 'user_id' : 'id'
  return useMutation({
    mutationFn: async ({ id, patch }: { id: number | string; patch: Patch<K> }) => {
      const { data, error } = await supabase
        .from(table)
        .update(patch as never)
        .eq(pk, id)
        .select()
      if (error) throw error
      if (!data?.length) throw new Error('Nothing was updated (row missing or not yours)')
      return data[0] as RowTypes[K]
    },
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData(key)
      qc.setQueryData(key, (old: unknown) => {
        if (Array.isArray(old))
          return old.map((r: Record<string, unknown>) => (r[pk] === id ? { ...r, ...patch } : r))
        if (old && typeof old === 'object') return { ...old, ...patch }
        return old
      })
      return { prev }
    },
    onError: (e, _v, ctx) => {
      if (ctx) qc.setQueryData(key, ctx.prev)
      toast.error(errorMessage(e))
    },
    onSuccess: () => {
      if (!opts.silent) toast.success('Saved')
    },
    onSettled: () => invalidateAll(qc),
  })
}

export function useDelete<K extends TableName>(table: K) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (match: Record<string, number | string>) => {
      const { error, count } = await supabase.from(table).delete({ count: 'exact' }).match(match)
      if (error) throw error
      if (!count) throw new Error('Nothing was deleted')
    },
    onSuccess: () => toast.success('Deleted'),
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => invalidateAll(qc),
  })
}

/** Call a workflow function (see the migration); all are atomic on the server. */
export function useRpc<A extends Record<string, unknown>, R = unknown>(fn: string, successMsg = 'Saved') {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: A) => {
      const { data, error } = await supabase.rpc(fn, args)
      if (error) throw error
      return data as R
    },
    onSuccess: () => {
      if (successMsg) toast.success(successMsg)
    },
    onError: (e) => toast.error(errorMessage(e)),
    onSettled: () => invalidateAll(qc),
  })
}

/** FD numbers linked to each OD, and OD ids secured by each FD. */
export function useLinkMaps() {
  const links = useLinks().data ?? []
  const fds = useFds().data ?? []
  const fdById = new Map(fds.map((f) => [f.id, f]))
  const fdsByOd = new Map<number, FixedDeposit[]>()
  const odsByFd = new Map<number, number[]>()
  for (const l of links) {
    const fd = fdById.get(l.fd_id)
    if (fd) fdsByOd.set(l.od_id, [...(fdsByOd.get(l.od_id) ?? []), fd])
    odsByFd.set(l.fd_id, [...(odsByFd.get(l.fd_id) ?? []), l.od_id])
  }
  return { fdsByOd, odsByFd }
}

export function useDefaultSavings(): SavingsAccount | undefined {
  const s = useSavings().data ?? []
  return s.find((a) => a.is_default) ?? s[0]
}
