/** Mirrors the `od_accounts` / `od_transactions` tables in supabase/schema.sql. */

export type OdStatus = 'ACTIVE' | 'CLOSED'

/**
 * WITHDRAWAL  funds taken out of the OD      -> increases outstanding
 * REPAYMENT   funds paid back into the OD    -> decreases outstanding
 * INTEREST    monthly interest debit by bank -> increases outstanding
 */
export type TransactionType = 'WITHDRAWAL' | 'REPAYMENT' | 'INTEREST'

export interface OdAccount {
  id: string
  user_id: string
  od_number: string
  approved_limit: number
  underlying_fd_no: string
  /** ISO calendar date, `YYYY-MM-DD`. */
  fd_maturity_date: string
  interest_rate: number
  status: OdStatus
  lien_removed: boolean
  created_at: string
  updated_at: string
}

export interface OdTransaction {
  id: string
  od_id: string
  user_id: string
  type: TransactionType
  amount: number
  /** ISO calendar date, `YYYY-MM-DD`. */
  date: string
  notes: string
  created_at: string
}

/** An account joined with its transactions, the shape every screen works from. */
export interface OdAccountWithTransactions {
  account: OdAccount
  transactions: OdTransaction[]
}

export interface LetterSettings {
  bank_name: string
  branch_name: string
  branch_address: string
  full_name: string
  cif_no: string
  savings_account_no: string
  place: string
}

export const EMPTY_LETTER_SETTINGS: LetterSettings = {
  bank_name: '',
  branch_name: '',
  branch_address: '',
  full_name: '',
  cif_no: '',
  savings_account_no: '',
  place: '',
}

/** Fields the add/edit form collects; the rest is filled in by the database. */
export interface OdAccountInput {
  od_number: string
  approved_limit: number
  underlying_fd_no: string
  fd_maturity_date: string
  interest_rate: number
  status: OdStatus
  lien_removed: boolean
}

export interface TransactionInput {
  od_id: string
  type: TransactionType
  amount: number
  date: string
  notes: string
}
