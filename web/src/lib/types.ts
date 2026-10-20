// Row shapes for the tables and views in supabase/migrations/0001_init.sql.
// Postgres numerics arrive from PostgREST as JSON numbers; dates as 'YYYY-MM-DD'.

export type OdStatus = 'active' | 'closure_requested' | 'closed' | 'unconfirmed' | 'rejected'
export type OdChannel = 'YONO' | 'Online SBI' | 'Branch'
export type OdEventType =
  | 'opened'
  | 'limit_change'
  | 'renewed'
  | 'closure_requested'
  | 'closed'
  | 'lien_released'
  | 'expiry_alert'
  | 'note'
export type TxnType =
  | 'opening_balance'
  | 'draw'
  | 'repayment'
  | 'interest'
  | 'charge'
  | 'closure_debit'
  | 'adjustment'

export const OD_STATUSES: OdStatus[] = ['active', 'closure_requested', 'closed', 'unconfirmed', 'rejected']
export const OD_CHANNELS: OdChannel[] = ['YONO', 'Online SBI', 'Branch']
export const EVENT_TYPES: OdEventType[] = [
  'opened',
  'limit_change',
  'renewed',
  'closure_requested',
  'closed',
  'lien_released',
  'expiry_alert',
  'note',
]
export const TXN_TYPES: TxnType[] = [
  'opening_balance',
  'draw',
  'repayment',
  'interest',
  'charge',
  'closure_debit',
  'adjustment',
]

export interface UserSettings {
  user_id: string
  full_name: string | null
  cif_no: string | null
  default_reminder_days: number
  renewal_months: number
  email_reminders: boolean
  reminder_email: string | null
  opening_balances_done: boolean
  updated_at: string
}

export interface SavingsAccount {
  id: number
  user_id: string
  account_no: string
  bank: string | null
  branch_code: string | null
  nickname: string | null
  is_default: boolean
}

export interface Branch {
  id: number
  user_id: string
  code: string
  name: string
  email: string | null
  phone: string | null
}

export interface OdAccount {
  id: number
  user_id: string
  od_account_no: string
  bank: string
  branch_code: string | null
  channel: OdChannel | null
  opened_on: string | null
  sanctioned_limit: number | null
  current_limit: number | null
  interest_rate: number | null
  term_days: number | null
  expiry_date: string | null
  original_expiry_date: string | null
  savings_account_id: number | null
  status: OdStatus
  closed_on: string | null
  closure_requested_on: string | null
  closure_email_to: string | null
  lien_released_on: string | null
  reminder_days: number | null
  bank_reported_balance: number | null
  bank_balance_as_of: string | null
  reference_no: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface FixedDeposit {
  id: number
  user_id: string
  fd_account_no: string
  principal: number | null
  interest_rate: number | null
  opened_on: string | null
  maturity_date: string | null
  lien_marked: boolean | null
  status: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface OdFdLink {
  od_id: number
  fd_id: number
  user_id: string
}

export interface OdEvent {
  id: number
  user_id: string
  od_id: number
  event_date: string
  event_type: OdEventType
  amount: number | null
  new_expiry: string | null
  description: string | null
  created_at: string
}

export interface OdTransaction {
  id: number
  user_id: string
  od_id: number
  txn_date: string
  txn_type: TxnType
  amount: number
  savings_account_id: number | null
  reference: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface OdTerm {
  id: number
  user_id: string
  od_id: number
  term_no: number
  start_date: string
  expiry_date: string
  limit_amount: number | null
  interest_rate: number | null
  renewal_type: 'original' | 'auto' | 'manual' | null
  fd_rolled_over: boolean | null
  notes: string | null
}

export interface OdBalance {
  od_id: number
  od_account_no: string
  status: OdStatus
  current_limit: number | null
  interest_rate: number | null
  expiry_date: string | null
  current_term_no: number | null
  current_term_start: string | null
  outstanding: number
  available: number | null
  total_drawn: number
  total_repaid: number
  total_interest_paid: number
  term_drawn: number
  term_repaid: number
  term_interest_paid: number
  last_interest_date: string | null
  first_draw_date: string | null
  last_txn_date: string | null
  txn_count: number
  accrued_interest_estimate: number
  payoff_estimate: number
  days_to_expiry: number | null
  reconciliation_diff: number | null
}

export type AlertType =
  | 'expiring_soon'
  | 'expiry_passed_unhandled'
  | 'closure_pending'
  | 'lien_not_released'
  | 'over_limit'
  | 'missing_interest'
  | 'reconcile'

export interface OdAlert {
  od_id: number
  od_account_no: string
  alert_type: AlertType
  alert_date: string | null
  days: number | null
  amount: number | null
}

export interface OdSummary {
  active_count: number
  total_active_limit: number
  total_outstanding: number
  total_available: number
  est_monthly_interest: number
  next_expiry: string | null
  alerts_expiring_soon: number
  alerts_expiry_passed_unhandled: number
  alerts_closure_pending: number
  alerts_lien_not_released: number
  alerts_over_limit: number
  alerts_missing_interest: number
  alerts_reconcile: number
}

export type TableName =
  | 'user_settings'
  | 'savings_accounts'
  | 'branches'
  | 'od_accounts'
  | 'fixed_deposits'
  | 'od_fd_links'
  | 'od_events'
  | 'od_transactions'
  | 'od_terms'

export type ViewName = 'od_balances' | 'od_alerts' | 'od_summary'
