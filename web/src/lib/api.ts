/**
 * Every read and write the app makes against Supabase.
 *
 * Row level security scopes all of these to the signed-in user (see
 * supabase/schema.sql), so no query here filters by user_id itself; the only
 * place the id appears is on insert, where the policy requires it to match.
 */
import { supabase } from './supabase'
import {
  EMPTY_LETTER_SETTINGS,
  type LetterSettings,
  type OdAccount,
  type OdAccountInput,
  type OdAccountWithTransactions,
  type OdTransaction,
  type TransactionInput,
} from './types'

/**
 * PostgREST may hand back `numeric` columns as strings to preserve precision,
 * so money and rates are coerced rather than trusted to arrive as numbers.
 */
function toNumber(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) ? n : 0
}

function mapAccount(row: Record<string, unknown>): OdAccount {
  return {
    ...(row as unknown as OdAccount),
    approved_limit: toNumber(row.approved_limit),
    interest_rate: toNumber(row.interest_rate),
  }
}

function mapTransaction(row: Record<string, unknown>): OdTransaction {
  return {
    ...(row as unknown as OdTransaction),
    amount: toNumber(row.amount),
  }
}

/** Newest first, matching the Android app's `ORDER BY date DESC`. */
function byDateDescending(a: OdTransaction, b: OdTransaction): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  return a.created_at < b.created_at ? 1 : -1
}

/** All of the user's overdrafts with their transactions, in one round trip. */
export async function fetchAccounts(): Promise<OdAccountWithTransactions[]> {
  const { data, error } = await supabase
    .from('od_accounts')
    .select('*, od_transactions(*)')
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)

  return (data ?? []).map((row) => {
    const { od_transactions: transactions, ...account } = row as Record<string, unknown> & {
      od_transactions: Record<string, unknown>[]
    }
    return {
      account: mapAccount(account),
      transactions: (transactions ?? []).map(mapTransaction).sort(byDateDescending),
    }
  })
}

export async function fetchAccount(id: string): Promise<OdAccountWithTransactions | null> {
  const { data, error } = await supabase
    .from('od_accounts')
    .select('*, od_transactions(*)')
    .eq('id', id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return null

  const { od_transactions: transactions, ...account } = data as Record<string, unknown> & {
    od_transactions: Record<string, unknown>[]
  }
  return {
    account: mapAccount(account),
    transactions: (transactions ?? []).map(mapTransaction).sort(byDateDescending),
  }
}

export async function createAccount(input: OdAccountInput, userId: string): Promise<OdAccount> {
  const { data, error } = await supabase
    .from('od_accounts')
    .insert({ ...input, user_id: userId })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAccount(data)
}

export async function updateAccount(id: string, input: OdAccountInput): Promise<OdAccount> {
  const { data, error } = await supabase
    .from('od_accounts')
    .update(input)
    .eq('id', id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapAccount(data)
}

/** Deleting an account takes its transactions with it (ON DELETE CASCADE). */
export async function deleteAccount(id: string): Promise<void> {
  const { error } = await supabase.from('od_accounts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createTransaction(
  input: TransactionInput,
  userId: string,
): Promise<OdTransaction> {
  const { data, error } = await supabase
    .from('od_transactions')
    .insert({ ...input, user_id: userId })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return mapTransaction(data)
}

export async function deleteTransaction(id: string): Promise<void> {
  const { error } = await supabase.from('od_transactions').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

/** Falls back to blanks for a user who has never opened the settings screen. */
export async function fetchLetterSettings(): Promise<LetterSettings> {
  const { data, error } = await supabase
    .from('letter_settings')
    .select('*')
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) return { ...EMPTY_LETTER_SETTINGS }

  return {
    bank_name: data.bank_name ?? '',
    branch_name: data.branch_name ?? '',
    branch_address: data.branch_address ?? '',
    full_name: data.full_name ?? '',
    cif_no: data.cif_no ?? '',
    savings_account_no: data.savings_account_no ?? '',
    place: data.place ?? '',
  }
}

export async function saveLetterSettings(
  settings: LetterSettings,
  userId: string,
): Promise<LetterSettings> {
  const { data, error } = await supabase
    .from('letter_settings')
    .upsert({ ...settings, user_id: userId }, { onConflict: 'user_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data as LetterSettings
}
