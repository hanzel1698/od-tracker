-- =============================================================================
-- FDs & OD Tracker: closure credit, the refund side of a closure debit.
--
-- Run after 0003_branch_address.sql. When a payoff overshoots (the OD ends in
-- credit), the bank closes it by transferring the leftover from the OD to
-- savings ("CLOSE TFR ... BY A/C CLOSURE"). That raises the ledger back to 0,
-- like a draw, so txn_signed_amount's default (+amount) already handles it.
-- =============================================================================

alter type public.od_txn_type add value if not exists 'closure_credit' before 'adjustment';

-- Mark closed: a negative residual is a refund to savings, recorded as a
-- closure_credit of its absolute value.
create or replace function public.mark_closed(
  p_od_id bigint, p_closed_on date, p_residual numeric default 0, p_adjustment numeric default 0,
  p_final_interest numeric default 0
) returns void
language plpgsql set search_path = '' as $$
declare
  v_sav bigint;
begin
  select savings_account_id into v_sav from public.od_accounts where id = p_od_id;
  if coalesce(p_final_interest, 0) > 0 then
    insert into public.od_transactions (od_id, txn_date, txn_type, amount, notes)
    values (p_od_id, p_closed_on, 'interest', p_final_interest, 'Interest debited at closure');
  end if;
  if coalesce(p_residual, 0) > 0 then
    insert into public.od_transactions (od_id, txn_date, txn_type, amount, savings_account_id, notes)
    values (p_od_id, p_closed_on, 'closure_debit', p_residual, v_sav, 'Residual debited from savings at closure');
  elsif coalesce(p_residual, 0) < 0 then
    insert into public.od_transactions (od_id, txn_date, txn_type, amount, savings_account_id, notes)
    values (p_od_id, p_closed_on, 'closure_credit', -p_residual, v_sav, 'Credit balance refunded to savings at closure');
  end if;
  if coalesce(p_adjustment, 0) <> 0 then
    insert into public.od_transactions (od_id, txn_date, txn_type, amount, notes)
    values (p_od_id, p_closed_on, 'adjustment', p_adjustment, 'Balancing adjustment at closure');
  end if;
  update public.od_accounts set status = 'closed', closed_on = p_closed_on where id = p_od_id;
  insert into public.od_events (od_id, event_date, event_type, amount, description)
  values (p_od_id, p_closed_on, 'closed', nullif(p_residual, 0), 'OD closed by bank');
end $$;
