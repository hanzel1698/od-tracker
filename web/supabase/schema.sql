-- =============================================================================
-- OD Tracker - Supabase schema
--
-- Run this once against a new Supabase project:
--   Supabase dashboard -> SQL Editor -> paste -> Run
--   (or `supabase db push` if you use the CLI)
--
-- Safe to re-run: every statement is idempotent, and re-running it against an
-- already-provisioned project is a no-op rather than a second set of policies.
--
-- Every table is owned row-by-row by an auth.users id and guarded by row-level
-- security, so the browser's publishable/anon key can only ever reach the
-- signed-in user's own data.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Overdraft accounts
-- ---------------------------------------------------------------------------
create table if not exists public.od_accounts (
    id               uuid primary key default gen_random_uuid(),
    user_id          uuid not null references auth.users (id) on delete cascade,
    od_number        text not null check (length(trim(od_number)) > 0),
    approved_limit   numeric(14, 2) not null check (approved_limit >= 0),
    underlying_fd_no text not null check (length(trim(underlying_fd_no)) > 0),
    fd_maturity_date date not null,
    interest_rate    numeric(6, 3) not null check (interest_rate >= 0),
    status           text not null default 'ACTIVE' check (status in ('ACTIVE', 'CLOSED')),
    lien_removed     boolean not null default false,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists od_accounts_user_id_idx on public.od_accounts (user_id);

-- ---------------------------------------------------------------------------
-- Transactions against an overdraft
--
--   WITHDRAWAL  funds taken out of the OD      -> increases outstanding
--   REPAYMENT   funds paid back into the OD    -> decreases outstanding
--   INTEREST    monthly interest debit by bank -> increases outstanding
--
-- Amounts are always positive; the sign is carried by `type`, never the number.
-- ---------------------------------------------------------------------------
create table if not exists public.od_transactions (
    id         uuid primary key default gen_random_uuid(),
    od_id      uuid not null references public.od_accounts (id) on delete cascade,
    user_id    uuid not null references auth.users (id) on delete cascade,
    type       text not null check (type in ('WITHDRAWAL', 'REPAYMENT', 'INTEREST')),
    amount     numeric(14, 2) not null check (amount > 0),
    date       date not null,
    notes      text not null default '',
    created_at timestamptz not null default now()
);

create index if not exists od_transactions_od_id_idx on public.od_transactions (od_id);
create index if not exists od_transactions_user_id_idx on public.od_transactions (user_id);

-- ---------------------------------------------------------------------------
-- Sender / bank details reused by the closure request letter.
-- One row per user; the app upserts on user_id.
-- ---------------------------------------------------------------------------
create table if not exists public.letter_settings (
    user_id            uuid primary key references auth.users (id) on delete cascade,
    bank_name          text not null default '',
    branch_name        text not null default '',
    branch_address     text not null default '',
    full_name          text not null default '',
    cif_no             text not null default '',
    savings_account_no text not null default '',
    place              text not null default '',
    updated_at         timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Keep updated_at honest without the client having to set it.
--
-- search_path is pinned: an unqualified function called from a trigger body
-- would otherwise resolve against whatever search_path the caller happens to
-- carry. Supabase's security advisor flags the unpinned form.
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- od_transactions is append-and-delete only, so it carries no updated_at.
drop trigger if exists od_accounts_touch_updated_at on public.od_accounts;
create trigger od_accounts_touch_updated_at
    before update on public.od_accounts
    for each row execute function public.touch_updated_at();

drop trigger if exists letter_settings_touch_updated_at on public.letter_settings;
create trigger letter_settings_touch_updated_at
    before update on public.letter_settings
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Table privileges.
--
-- The app only ever reads and writes as a signed-in user, so the anonymous
-- role needs no access at all, and `authenticated` should hold exactly the
-- operations the policies below contemplate - no DELETE on letter_settings,
-- in particular.
--
-- Reaching that state takes a full revoke first, for two reasons. Supabase's
-- default privileges hand new tables in `public` to anon and authenticated, so
-- a bare `grant` adds nothing and leaves the surplus in place. And some of
-- those privileges arrive via the PUBLIC pseudo-role, which every role
-- inherits - revoking from `anon` by name does not take them away.
--
-- service_role is deliberately left alone: the platform and any future
-- server-side job rely on it, and it is never exposed to the browser.
--
-- With RLS on, a surplus grant leaks nothing by itself - anon has no policy to
-- match and auth.uid() is null for it. This is the second line of defence
-- behind the policies, not the first.
-- ---------------------------------------------------------------------------
revoke all on public.od_accounts     from public, anon, authenticated;
revoke all on public.od_transactions from public, anon, authenticated;
revoke all on public.letter_settings from public, anon, authenticated;

grant select, insert, update, delete on public.od_accounts     to authenticated;
grant select, insert, update, delete on public.od_transactions to authenticated;
grant select, insert, update         on public.letter_settings to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security: a user sees and writes only their own rows.
-- ---------------------------------------------------------------------------
alter table public.od_accounts     enable row level security;
alter table public.od_transactions enable row level security;
alter table public.letter_settings enable row level security;

-- Earlier revisions of this file used descriptive policy names. Drop them so a
-- project provisioned from that version does not end up carrying two parallel
-- sets of policies.
drop policy if exists "own accounts: select"     on public.od_accounts;
drop policy if exists "own accounts: insert"     on public.od_accounts;
drop policy if exists "own accounts: update"     on public.od_accounts;
drop policy if exists "own accounts: delete"     on public.od_accounts;
drop policy if exists "own transactions: select" on public.od_transactions;
drop policy if exists "own transactions: insert" on public.od_transactions;
drop policy if exists "own transactions: update" on public.od_transactions;
drop policy if exists "own transactions: delete" on public.od_transactions;
drop policy if exists "own settings: select"     on public.letter_settings;
drop policy if exists "own settings: insert"     on public.letter_settings;
drop policy if exists "own settings: update"     on public.letter_settings;

drop policy if exists od_accounts_select_own on public.od_accounts;
create policy od_accounts_select_own on public.od_accounts
    for select to authenticated
    using (auth.uid() = user_id);

drop policy if exists od_accounts_insert_own on public.od_accounts;
create policy od_accounts_insert_own on public.od_accounts
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists od_accounts_update_own on public.od_accounts;
create policy od_accounts_update_own on public.od_accounts
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

drop policy if exists od_accounts_delete_own on public.od_accounts;
create policy od_accounts_delete_own on public.od_accounts
    for delete to authenticated
    using (auth.uid() = user_id);

drop policy if exists od_transactions_select_own on public.od_transactions;
create policy od_transactions_select_own on public.od_transactions
    for select to authenticated
    using (auth.uid() = user_id);

-- Owning the row is not enough on write: without the parent lookup, a caller
-- could staple a transaction onto somebody else's overdraft by passing a
-- foreign od_id.
drop policy if exists od_transactions_insert_own_account on public.od_transactions;
create policy od_transactions_insert_own_account on public.od_transactions
    for insert to authenticated
    with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.od_accounts a
            where a.id = od_id and a.user_id = auth.uid()
        )
    );

drop policy if exists od_transactions_update_own_account on public.od_transactions;
create policy od_transactions_update_own_account on public.od_transactions
    for update to authenticated
    using (
        auth.uid() = user_id
        and exists (
            select 1 from public.od_accounts a
            where a.id = od_id and a.user_id = auth.uid()
        )
    )
    with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.od_accounts a
            where a.id = od_id and a.user_id = auth.uid()
        )
    );

drop policy if exists od_transactions_delete_own on public.od_transactions;
create policy od_transactions_delete_own on public.od_transactions
    for delete to authenticated
    using (auth.uid() = user_id);

drop policy if exists letter_settings_select_own on public.letter_settings;
create policy letter_settings_select_own on public.letter_settings
    for select to authenticated
    using (auth.uid() = user_id);

-- Insert and update both exist because the app upserts these on user_id, and
-- PostgREST's upsert needs both. There is deliberately no delete policy: these
-- rows go away with the user, via the cascade.
drop policy if exists letter_settings_insert_own on public.letter_settings;
create policy letter_settings_insert_own on public.letter_settings
    for insert to authenticated
    with check (auth.uid() = user_id);

drop policy if exists letter_settings_update_own on public.letter_settings;
create policy letter_settings_update_own on public.letter_settings
    for update to authenticated
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: let other signed-in devices pick up changes as they happen.
-- letter_settings is deliberately left out; it has nothing to stream.
-- ---------------------------------------------------------------------------
do $$
begin
    alter publication supabase_realtime add table public.od_accounts;
exception
    when duplicate_object then null;
end;
$$;

do $$
begin
    alter publication supabase_realtime add table public.od_transactions;
exception
    when duplicate_object then null;
end;
$$;
