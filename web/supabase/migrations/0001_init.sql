-- =============================================================================
-- OD Tracker: overdrafts against fixed deposits.
--
-- Run once in the Supabase SQL editor (or `supabase db push`).
-- Every table is owned row-by-row by auth.uid() and fenced by RLS, so the
-- browser's publishable key only ever reaches the signed-in user's rows.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.od_status as enum ('active','closure_requested','closed','unconfirmed','rejected');
create type public.od_channel as enum ('YONO','Online SBI','Branch');
create type public.od_event_type as enum (
  'opened','limit_change','renewed','closure_requested','closed','lien_released','expiry_alert','note'
);
create type public.od_txn_type as enum (
  'opening_balance', -- starting amount owed when tracking begins (+)
  'draw',            -- OD -> savings transfer (+ owed)
  'repayment',       -- savings -> OD transfer (- owed)
  'interest',        -- monthly interest debited by bank (+ owed)
  'charge',          -- any other bank debit (+ owed)
  'closure_debit',   -- residual debited from savings at closure (- owed)
  'adjustment'       -- manual correction, signed amount
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  full_name text,
  cif_no text,
  default_reminder_days int not null default 21 check (default_reminder_days between 0 and 365),
  renewal_months int not null default 12 check (renewal_months between 1 and 120),
  email_reminders boolean not null default false,
  reminder_email text,
  opening_balances_done boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.savings_accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  account_no text not null,
  bank text default 'SBI',
  branch_code text,
  nickname text,
  is_default boolean not null default false,
  unique (user_id, account_no)
);
-- At most one default savings account per user.
create unique index savings_accounts_one_default on public.savings_accounts (user_id) where is_default;

create table public.branches (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  code text not null,
  name text not null,
  email text,
  phone text,
  unique (user_id, code)
);

create table public.od_accounts (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  od_account_no text not null,
  bank text not null default 'SBI',
  branch_code text,                     -- soft link to branches.code
  channel public.od_channel,
  opened_on date,
  sanctioned_limit numeric(12,2),
  current_limit numeric(12,2),
  interest_rate numeric(5,2),
  term_days int,
  expiry_date date,                     -- current expiry; moves forward on renewal
  original_expiry_date date,
  savings_account_id bigint references public.savings_accounts(id) on delete set null,
  status public.od_status not null default 'active',
  closed_on date,
  closure_requested_on date,
  closure_email_to text,
  lien_released_on date,
  reminder_days int default 21,
  bank_reported_balance numeric(12,2),
  bank_balance_as_of date,
  reference_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, od_account_no)
);
create index od_accounts_savings_account_id_idx on public.od_accounts (savings_account_id);

create table public.fixed_deposits (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fd_account_no text not null,
  principal numeric(12,2),
  interest_rate numeric(5,2),
  opened_on date,
  maturity_date date,
  lien_marked boolean default true,
  status text default 'active',         -- active / closed / rolled over
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, fd_account_no)
);

-- One OD can be secured by several FDs.
create table public.od_fd_links (
  od_id bigint not null references public.od_accounts(id) on delete cascade,
  fd_id bigint not null references public.fixed_deposits(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (od_id, fd_id)
);
create index od_fd_links_fd_id_idx on public.od_fd_links (fd_id);
create index od_fd_links_user_id_idx on public.od_fd_links (user_id);

create table public.od_events (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  od_id bigint not null references public.od_accounts(id) on delete cascade,
  event_date date not null,
  event_type public.od_event_type not null,
  amount numeric(12,2),
  new_expiry date,
  description text,
  created_at timestamptz not null default now()
);
create index od_events_od_id_idx on public.od_events (od_id, event_date);
create index od_events_user_id_idx on public.od_events (user_id);

create table public.od_transactions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  od_id bigint not null references public.od_accounts(id) on delete cascade,
  txn_date date not null,
  txn_type public.od_txn_type not null,
  amount numeric(12,2) not null check (amount <> 0),
  savings_account_id bigint references public.savings_accounts(id) on delete set null,
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Only adjustments carry a sign; everything else is a positive magnitude.
  constraint od_transactions_sign check (txn_type = 'adjustment' or amount > 0)
);
create index od_transactions_od_id_idx on public.od_transactions (od_id, txn_date);
create index od_transactions_user_id_idx on public.od_transactions (user_id);
create index od_transactions_savings_account_id_idx on public.od_transactions (savings_account_id);

-- One row per term: the original plus each renewal.
create table public.od_terms (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  od_id bigint not null references public.od_accounts(id) on delete cascade,
  term_no int not null,
  start_date date not null,
  expiry_date date not null,
  limit_amount numeric(12,2),
  interest_rate numeric(5,2),
  renewal_type text check (renewal_type in ('original','auto','manual')),
  fd_rolled_over boolean,
  notes text,
  unique (od_id, term_no)
);
create index od_terms_user_id_idx on public.od_terms (user_id);

create index savings_accounts_user_id_idx on public.savings_accounts (user_id);
create index branches_user_id_idx on public.branches (user_id);
create index od_accounts_user_id_idx on public.od_accounts (user_id);
create index fixed_deposits_user_id_idx on public.fixed_deposits (user_id);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger touch_updated_at before update on public.od_accounts
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.fixed_deposits
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.od_transactions
  for each row execute function public.touch_updated_at();
create trigger touch_updated_at before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Ledger arithmetic
-- ---------------------------------------------------------------------------
-- Effect of one transaction on what is owed.
create function public.txn_signed_amount(t public.od_txn_type, amount numeric) returns numeric
language sql immutable set search_path = '' as $$
  select case
    when t in ('repayment','closure_debit') then -amount
    else amount            -- opening_balance, draw, interest, charge, adjustment (signed)
  end
$$;

create function public.od_outstanding(p_od_id bigint, p_exclude_txn bigint default null) returns numeric
language sql stable set search_path = '' as $$
  select coalesce(sum(public.txn_signed_amount(t.txn_type, t.amount)), 0)
  from public.od_transactions t
  where t.od_id = p_od_id
    and (p_exclude_txn is null or t.id <> p_exclude_txn)
$$;

-- ---------------------------------------------------------------------------
-- Integrity rules
-- ---------------------------------------------------------------------------
create function public.od_transactions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  od public.od_accounts%rowtype;
  after_draw numeric;
begin
  select * into od from public.od_accounts where id = new.od_id;
  if not found then
    raise exception 'OD % not found', new.od_id;
  end if;

  -- No transactions on a closed OD after its closing date.
  if od.status = 'closed' and od.closed_on is not null and new.txn_date > od.closed_on then
    raise exception 'OD % was closed on %; no transactions allowed after that date',
      od.od_account_no, od.closed_on using errcode = 'check_violation';
  end if;

  -- A draw may not push outstanding beyond the limit, unless notes say "override".
  if new.txn_type = 'draw' and od.current_limit is not null
     and coalesce(new.notes, '') !~* 'override' then
    after_draw := public.od_outstanding(new.od_id, case when tg_op = 'UPDATE' then new.id end) + new.amount;
    if after_draw > od.current_limit then
      raise exception 'Draw would take outstanding to % against a limit of % (add "override" to notes to force)',
        after_draw, od.current_limit using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

create trigger od_transactions_guard before insert or update on public.od_transactions
  for each row execute function public.od_transactions_guard();

-- Closing an OD requires the ledger to net to zero.
create function public.od_accounts_close_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  bal numeric;
begin
  if new.status = 'closed' and old.status is distinct from 'closed' then
    bal := public.od_outstanding(new.id);
    if bal <> 0 then
      raise exception 'Cannot close OD %: outstanding is % (add a closure debit or adjustment first)',
        new.od_account_no, bal using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;

create trigger od_accounts_close_guard before update of status on public.od_accounts
  for each row execute function public.od_accounts_close_guard();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.user_settings    enable row level security;
alter table public.savings_accounts enable row level security;
alter table public.branches         enable row level security;
alter table public.od_accounts      enable row level security;
alter table public.fixed_deposits   enable row level security;
alter table public.od_fd_links      enable row level security;
alter table public.od_events        enable row level security;
alter table public.od_transactions  enable row level security;
alter table public.od_terms         enable row level security;

-- Four owner-only policies per table. Child tables additionally require the
-- parent OD to be visible (i.e. owned), so a guessed od_id from another user
-- cannot be written against.
do $$
declare
  t text;
  parent_check text;
begin
  foreach t in array array[
    'user_settings','savings_accounts','branches','od_accounts','fixed_deposits',
    'od_fd_links','od_events','od_transactions','od_terms'
  ] loop
    parent_check := case
      when t in ('od_events','od_transactions','od_terms','od_fd_links')
        then ' and exists (select 1 from public.od_accounts o where o.id = od_id)'
      else ''
    end;

    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid())%s)',
      t || '_insert_own', t, parent_check);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid())%s)',
      t || '_update_own', t, parent_check);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
      t || '_delete_own', t);

    execute format('revoke all on public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Derived views (security_invoker: they run under the caller's RLS)
-- ---------------------------------------------------------------------------
create view public.od_balances with (security_invoker = true) as
with cur_term as (
  select distinct on (od_id) od_id, term_no, start_date
  from public.od_terms
  order by od_id, term_no desc
),
agg as (
  select
    o.id as od_id,
    coalesce(sum(public.txn_signed_amount(t.txn_type, t.amount)), 0) as outstanding,
    coalesce(sum(t.amount) filter (where t.txn_type = 'draw'), 0) as total_drawn,
    coalesce(sum(t.amount) filter (where t.txn_type in ('repayment','closure_debit')), 0) as total_repaid,
    coalesce(sum(t.amount) filter (where t.txn_type = 'interest'), 0) as total_interest_paid,
    coalesce(sum(t.amount) filter (where t.txn_type = 'draw' and t.txn_date >= ct.start_date), 0) as term_drawn,
    coalesce(sum(t.amount) filter (where t.txn_type in ('repayment','closure_debit') and t.txn_date >= ct.start_date), 0) as term_repaid,
    coalesce(sum(t.amount) filter (where t.txn_type = 'interest' and t.txn_date >= ct.start_date), 0) as term_interest_paid,
    max(t.txn_date) filter (where t.txn_type = 'interest') as last_interest_date,
    min(t.txn_date) filter (where t.txn_type in ('draw','opening_balance')) as first_draw_date,
    max(t.txn_date) as last_txn_date,
    count(t.id) as txn_count
  from public.od_accounts o
  left join cur_term ct on ct.od_id = o.id
  left join public.od_transactions t on t.od_id = o.id
  group by o.id
)
select
  o.id as od_id,
  o.od_account_no,
  o.status,
  o.current_limit,
  o.interest_rate,
  o.expiry_date,
  ct.term_no as current_term_no,
  ct.start_date as current_term_start,
  a.outstanding,
  o.current_limit - a.outstanding as available,
  a.total_drawn, a.total_repaid, a.total_interest_paid,
  a.term_drawn, a.term_repaid, a.term_interest_paid,
  a.last_interest_date,
  a.first_draw_date,
  a.last_txn_date,
  a.txn_count,
  case
    when a.outstanding <= 0 or o.interest_rate is null
      or coalesce(a.last_interest_date, a.first_draw_date) is null then 0
    else round(a.outstanding * o.interest_rate / 100
         * greatest(current_date - coalesce(a.last_interest_date, a.first_draw_date), 0) / 365, 2)
  end as accrued_interest_estimate,
  a.outstanding + case
    when a.outstanding <= 0 or o.interest_rate is null
      or coalesce(a.last_interest_date, a.first_draw_date) is null then 0
    else round(a.outstanding * o.interest_rate / 100
         * greatest(current_date - coalesce(a.last_interest_date, a.first_draw_date), 0) / 365, 2)
  end as payoff_estimate,
  o.expiry_date - current_date as days_to_expiry,
  case when o.bank_reported_balance is not null then o.bank_reported_balance - a.outstanding end as reconciliation_diff
from public.od_accounts o
join agg a on a.od_id = o.id
left join cur_term ct on ct.od_id = o.id;

create view public.od_alerts with (security_invoker = true) as
select o.id as od_id, o.od_account_no, 'expiring_soon'::text as alert_type,
       o.expiry_date as alert_date, b.days_to_expiry as days, b.payoff_estimate as amount
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where o.status = 'active' and b.days_to_expiry between 0 and coalesce(o.reminder_days, 21)
union all
-- The bank has probably auto-renewed; prompt to record it. Unconfirmed ODs are
-- included because they are exactly the ones whose fate is unknown.
select o.id, o.od_account_no, 'expiry_passed_unhandled',
       o.expiry_date, current_date - o.expiry_date, b.outstanding
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where o.status in ('active','unconfirmed') and o.expiry_date < current_date
  and not exists (
    select 1 from public.od_terms t
    where t.od_id = o.id and current_date between t.start_date and t.expiry_date
  )
union all
select o.id, o.od_account_no, 'closure_pending',
       o.closure_requested_on, current_date - o.closure_requested_on, b.outstanding
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where o.status = 'closure_requested' and o.closure_requested_on <= current_date - 7
union all
select o.id, o.od_account_no, 'lien_not_released',
       o.closed_on, current_date - o.closed_on, null
from public.od_accounts o
where o.status = 'closed' and o.lien_released_on is null
union all
select o.id, o.od_account_no, 'over_limit',
       null, null, b.outstanding - o.current_limit
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where o.status not in ('closed','rejected') and b.outstanding > o.current_limit
union all
-- Monthly debit probably not logged. Measured from the last interest debit, or
-- from when the balance started if there has never been one.
select o.id, o.od_account_no, 'missing_interest',
       coalesce(b.last_interest_date, b.first_draw_date),
       current_date - coalesce(b.last_interest_date, b.first_draw_date), b.outstanding
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where o.status = 'active' and b.outstanding > 0
  and coalesce(b.last_interest_date, b.first_draw_date) < current_date - 40
union all
select o.id, o.od_account_no, 'reconcile',
       o.bank_balance_as_of, null, b.reconciliation_diff
from public.od_accounts o join public.od_balances b on b.od_id = o.id
where abs(b.reconciliation_diff) > 1;

create view public.od_summary with (security_invoker = true) as
select
  count(*) filter (where b.status = 'active') as active_count,
  coalesce(sum(b.current_limit) filter (where b.status = 'active'), 0) as total_active_limit,
  coalesce(sum(b.outstanding) filter (where b.status not in ('closed','rejected')), 0) as total_outstanding,
  coalesce(sum(b.available) filter (where b.status = 'active'), 0) as total_available,
  coalesce(round(sum(greatest(b.outstanding, 0) * coalesce(b.interest_rate, 0) / 100 / 365
    * extract(day from (date_trunc('month', current_date) + interval '1 month - 1 day'))::int)
    filter (where b.status = 'active'), 2), 0) as est_monthly_interest,
  min(b.expiry_date) filter (where b.status = 'active' and b.expiry_date >= current_date) as next_expiry,
  (select count(*) from public.od_alerts where alert_type = 'expiring_soon') as alerts_expiring_soon,
  (select count(*) from public.od_alerts where alert_type = 'expiry_passed_unhandled') as alerts_expiry_passed_unhandled,
  (select count(*) from public.od_alerts where alert_type = 'closure_pending') as alerts_closure_pending,
  (select count(*) from public.od_alerts where alert_type = 'lien_not_released') as alerts_lien_not_released,
  (select count(*) from public.od_alerts where alert_type = 'over_limit') as alerts_over_limit,
  (select count(*) from public.od_alerts where alert_type = 'missing_interest') as alerts_missing_interest,
  (select count(*) from public.od_alerts where alert_type = 'reconcile') as alerts_reconcile
from public.od_balances b;

revoke all on public.od_balances, public.od_alerts, public.od_summary from public, anon;
grant select on public.od_balances, public.od_alerts, public.od_summary to authenticated;

-- ---------------------------------------------------------------------------
-- Workflow functions. SECURITY INVOKER (the default), so RLS applies to every
-- statement inside; they exist only to make multi-row workflows atomic.
-- ---------------------------------------------------------------------------

-- A. Open a new OD: account, term #1, FDs + links, `opened` event.
-- p_fds: [{"fd_account_no": "...", "principal": 0, "interest_rate": 0, "maturity_date": "YYYY-MM-DD"}]
create function public.create_od(p_od jsonb, p_fds jsonb default '[]') returns bigint
language plpgsql set search_path = '' as $$
declare
  v_id bigint;
  v_fd_id bigint;
  fd jsonb;
begin
  insert into public.od_accounts (
    od_account_no, bank, branch_code, channel, opened_on, sanctioned_limit, current_limit,
    interest_rate, term_days, expiry_date, original_expiry_date, savings_account_id,
    status, reminder_days, reference_no, notes
  ) values (
    p_od->>'od_account_no',
    coalesce(p_od->>'bank', 'SBI'),
    nullif(p_od->>'branch_code', ''),
    nullif(p_od->>'channel', '')::public.od_channel,
    (p_od->>'opened_on')::date,
    (p_od->>'sanctioned_limit')::numeric,
    coalesce((p_od->>'current_limit')::numeric, (p_od->>'sanctioned_limit')::numeric),
    (p_od->>'interest_rate')::numeric,
    (p_od->>'term_days')::int,
    (p_od->>'expiry_date')::date,
    (p_od->>'expiry_date')::date,
    (p_od->>'savings_account_id')::bigint,
    coalesce(nullif(p_od->>'status', ''), 'active')::public.od_status,
    coalesce((p_od->>'reminder_days')::int, 21),
    nullif(p_od->>'reference_no', ''),
    nullif(p_od->>'notes', '')
  ) returning id into v_id;

  if (p_od->>'opened_on') is not null and (p_od->>'expiry_date') is not null then
    insert into public.od_terms (od_id, term_no, start_date, expiry_date, limit_amount, interest_rate, renewal_type)
    values (v_id, 1, (p_od->>'opened_on')::date, (p_od->>'expiry_date')::date,
            (p_od->>'sanctioned_limit')::numeric, (p_od->>'interest_rate')::numeric, 'original');
  end if;

  for fd in select * from jsonb_array_elements(coalesce(p_fds, '[]'::jsonb)) loop
    insert into public.fixed_deposits (fd_account_no, principal, interest_rate, opened_on, maturity_date, lien_marked)
    values (fd->>'fd_account_no', (fd->>'principal')::numeric, (fd->>'interest_rate')::numeric,
            (fd->>'opened_on')::date, (fd->>'maturity_date')::date, true)
    on conflict (user_id, fd_account_no) do update set lien_marked = true
    returning id into v_fd_id;
    insert into public.od_fd_links (od_id, fd_id) values (v_id, v_fd_id) on conflict do nothing;
  end loop;

  insert into public.od_events (od_id, event_date, event_type, amount, new_expiry, description)
  values (v_id, coalesce((p_od->>'opened_on')::date, current_date), 'opened',
          (p_od->>'sanctioned_limit')::numeric, (p_od->>'expiry_date')::date,
          'Opened via ' || coalesce(p_od->>'channel', 'unknown channel'));
  return v_id;
end $$;

-- C. Auto/manual renewal: new term, OD moves forward, `renewed` event. Balance untouched.
create function public.record_renewal(
  p_od_id bigint, p_start date, p_new_expiry date, p_limit numeric, p_rate numeric,
  p_fd_rolled_over boolean default true, p_fd_maturity date default null,
  p_renewal_type text default 'auto', p_notes text default null
) returns void
language plpgsql set search_path = '' as $$
declare
  v_term int;
begin
  select coalesce(max(term_no), 0) + 1 into v_term from public.od_terms where od_id = p_od_id;
  insert into public.od_terms (od_id, term_no, start_date, expiry_date, limit_amount, interest_rate,
                               renewal_type, fd_rolled_over, notes)
  values (p_od_id, v_term, p_start, p_new_expiry, p_limit, p_rate, p_renewal_type, p_fd_rolled_over, p_notes);

  update public.od_accounts
     set expiry_date = p_new_expiry, current_limit = p_limit, interest_rate = p_rate,
         status = case when status in ('unconfirmed','closure_requested') then 'active'::public.od_status else status end
   where id = p_od_id;
  if not found then raise exception 'OD % not found', p_od_id; end if;

  if p_fd_rolled_over and p_fd_maturity is not null then
    update public.fixed_deposits f set maturity_date = p_fd_maturity, status = 'rolled over'
      from public.od_fd_links l where l.fd_id = f.id and l.od_id = p_od_id;
  end if;

  insert into public.od_events (od_id, event_date, event_type, amount, new_expiry, description)
  values (p_od_id, p_start, 'renewed', p_limit, p_new_expiry,
          initcap(p_renewal_type) || ' renewal (term ' || v_term || ')' ||
          case when p_fd_rolled_over then ', FD rolled over' else '' end ||
          coalesce('. ' || p_notes, ''));
end $$;

-- B3. Closure email sent for one or more ODs.
create function public.request_closure(p_od_ids bigint[], p_on date, p_email_to text) returns void
language plpgsql set search_path = '' as $$
begin
  update public.od_accounts
     set status = 'closure_requested', closure_requested_on = p_on, closure_email_to = p_email_to
   where id = any(p_od_ids);
  insert into public.od_events (od_id, event_date, event_type, description)
  select id, p_on, 'closure_requested', 'Closure email sent to ' || coalesce(p_email_to, 'branch')
    from public.od_accounts where id = any(p_od_ids);
end $$;

-- B4. Bank closed the OD. Records the interest the bank debited at closure
-- (accrued since the last logged debit), the residual taken from savings and
-- an optional balancing adjustment, then closes; the close guard checks the
-- ledger nets to 0.
create function public.mark_closed(
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
  end if;
  if coalesce(p_adjustment, 0) <> 0 then
    insert into public.od_transactions (od_id, txn_date, txn_type, amount, notes)
    values (p_od_id, p_closed_on, 'adjustment', p_adjustment, 'Balancing adjustment at closure');
  end if;
  update public.od_accounts set status = 'closed', closed_on = p_closed_on where id = p_od_id;
  insert into public.od_events (od_id, event_date, event_type, amount, description)
  values (p_od_id, p_closed_on, 'closed', nullif(p_residual, 0), 'OD closed by bank');
end $$;

create function public.mark_lien_released(p_od_id bigint, p_on date) returns void
language plpgsql set search_path = '' as $$
begin
  update public.od_accounts set lien_released_on = p_on where id = p_od_id;
  update public.fixed_deposits f set lien_marked = false
    from public.od_fd_links l where l.fd_id = f.id and l.od_id = p_od_id;
  insert into public.od_events (od_id, event_date, event_type, description)
  values (p_od_id, p_on, 'lien_released', 'Lien on linked FD(s) removed');
end $$;

-- D. Limit change: OD, current term and a `limit_change` event.
create function public.change_limit(p_od_id bigint, p_on date, p_new_limit numeric, p_notes text default null)
returns void
language plpgsql set search_path = '' as $$
begin
  update public.od_accounts set current_limit = p_new_limit where id = p_od_id;
  update public.od_terms set limit_amount = p_new_limit
   where od_id = p_od_id
     and term_no = (select max(term_no) from public.od_terms where od_id = p_od_id);
  insert into public.od_events (od_id, event_date, event_type, amount, description)
  values (p_od_id, p_on, 'limit_change', p_new_limit, coalesce(p_notes, 'Limit changed'));
end $$;

-- Functions in public are executable by PUBLIC by default; keep them to signed-in users.
revoke execute on function
  public.create_od(jsonb, jsonb),
  public.record_renewal(bigint, date, date, numeric, numeric, boolean, date, text, text),
  public.request_closure(bigint[], date, text),
  public.mark_closed(bigint, date, numeric, numeric, numeric),
  public.mark_lien_released(bigint, date),
  public.change_limit(bigint, date, numeric, text),
  public.od_outstanding(bigint, bigint),
  public.txn_signed_amount(public.od_txn_type, numeric)
from public, anon;
grant execute on function
  public.create_od(jsonb, jsonb),
  public.record_renewal(bigint, date, date, numeric, numeric, boolean, date, text, text),
  public.request_closure(bigint[], date, text),
  public.mark_closed(bigint, date, numeric, numeric, numeric),
  public.mark_lien_released(bigint, date),
  public.change_limit(bigint, date, numeric, text),
  public.od_outstanding(bigint, bigint),
  public.txn_signed_amount(public.od_txn_type, numeric)
to authenticated;
