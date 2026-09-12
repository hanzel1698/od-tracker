/**
 * React Query bindings over `api.ts`, plus the realtime subscription that keeps
 * a second device's screen honest while you edit on the first.
 */
import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import * as api from './api'
import { supabase } from './supabase'
import { useAuth } from '../context/AuthContext'
import type { LetterSettings, OdAccountInput, TransactionInput } from './types'

export const queryKeys = {
  accounts: ['accounts'] as const,
  account: (id: string) => ['accounts', id] as const,
  letterSettings: ['letter-settings'] as const,
}

/** Both the list and any open detail view read the same rows, so refresh both. */
function invalidateAccounts(client: QueryClient): void {
  void client.invalidateQueries({ queryKey: queryKeys.accounts })
}

export function useAccounts() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.accounts,
    queryFn: api.fetchAccounts,
    enabled: Boolean(user),
  })
}

export function useAccount(id: string | undefined) {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.account(id ?? ''),
    queryFn: () => api.fetchAccount(id!),
    enabled: Boolean(user) && Boolean(id),
  })
}

export function useCreateAccount() {
  const client = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (input: OdAccountInput) => api.createAccount(input, user!.id),
    onSuccess: () => invalidateAccounts(client),
  })
}

export function useUpdateAccount() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: OdAccountInput }) =>
      api.updateAccount(id, input),
    onSuccess: () => invalidateAccounts(client),
  })
}

export function useDeleteAccount() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteAccount(id),
    onSuccess: () => invalidateAccounts(client),
  })
}

export function useCreateTransaction() {
  const client = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (input: TransactionInput) => api.createTransaction(input, user!.id),
    onSuccess: () => invalidateAccounts(client),
  })
}

export function useDeleteTransaction() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.deleteTransaction(id),
    onSuccess: () => invalidateAccounts(client),
  })
}

export function useLetterSettings() {
  const { user } = useAuth()
  return useQuery({
    queryKey: queryKeys.letterSettings,
    queryFn: api.fetchLetterSettings,
    enabled: Boolean(user),
  })
}

export function useSaveLetterSettings() {
  const client = useQueryClient()
  const { user } = useAuth()
  return useMutation({
    mutationFn: (settings: LetterSettings) => api.saveLetterSettings(settings, user!.id),
    onSuccess: (saved) => {
      client.setQueryData(queryKeys.letterSettings, saved)
    },
  })
}

/**
 * Subscribes to Postgres changes on the user's rows and refetches when anything
 * moves. Row level security applies to the realtime stream too, so this only
 * ever hears about the signed-in user's own data.
 */
export function useRealtimeSync(): void {
  const { user } = useAuth()
  const client = useQueryClient()

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel('od-tracker-sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'od_accounts', filter: `user_id=eq.${user.id}` },
        () => invalidateAccounts(client),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'od_transactions', filter: `user_id=eq.${user.id}` },
        () => invalidateAccounts(client),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, client])
}
