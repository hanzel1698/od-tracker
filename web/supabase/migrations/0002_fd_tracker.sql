-- =============================================================================
-- FDs & OD Tracker: track every deposit, not only the ones under lien.
--
-- Run after 0001_init.sql. Adds what YONO shows for each deposit so the FDs
-- page can hold the whole portfolio (free FDs, the RD, the PPF) next to the
-- ones securing ODs. Existing rows keep working: every new column is nullable
-- except deposit_type, which defaults to 'FD'.
-- =============================================================================

alter table public.fixed_deposits
  add column deposit_type text not null default 'FD' check (deposit_type in ('FD', 'RD', 'PPF')),
  add column variant text,                       -- e.g. 'Regular FD'
  add column branch_code text,                   -- soft link to branches.code
  add column term_months int check (term_months > 0),
  add column maturity_amount numeric(12,2),
  add column current_value numeric(12,2),
  add column value_as_of date,                   -- when current_value was read from the bank
  add column maturity_instruction text,          -- e.g. 'Credit to Account', 'Renew Principal and Repay Interest'
  add column interest_payout text,               -- e.g. 'At Maturity'
  add column lien_amount numeric(12,2),
  add column installment_amount numeric(12,2),   -- RD monthly installment
  add column closed_on date;

create index fixed_deposits_maturity_date_idx on public.fixed_deposits (user_id, maturity_date);

notify pgrst, 'reload schema';
