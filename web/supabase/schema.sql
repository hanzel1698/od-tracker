-- =============================================================================
-- OD Tracker - Supabase schema
--
-- Run this once against a new Supabase project:
--   Supabase dashboard -> SQL Editor -> paste -> Run
--   (or `supabase db push` if you use the CLI)
--
-- Every table is owned row-by-row by an auth.users id and guarded by row-level
-- security, so the browser's anon key can only ever reach the signed-in user's
-- own data.
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
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists od_accounts_touch_updated_at on public.od_accounts;
create trigger od_accounts_touch_updated_at
    before update on public.od_accounts
    for each row execute function public.touch_updated_at();

drop trigger if exists letter_settings_touch_updated_at on public.letter_settings;
create trigger letter_settings_touch_updated_at
    before update on public.letter_settings
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user sees and writes only their own rows.
-- ---------------------------------------------------------------------------
alter table public.od_accounts     enable row level security;
alter table public.od_transactions enable row level security;
alter table public.letter_settings enable row level security;

drop policy if exists "own accounts: select" on public.od_accounts;
create policy "own accounts: select" on public.od_accounts
    for select using (auth.uid() = user_id);

drop policy if exists "own accounts: insert" on public.od_accounts;
create policy "own accounts: insert" on public.od_accounts
    for insert with check (auth.uid() = user_id);

drop policy if exists "own accounts: update" on public.od_accounts;
create policy "own accounts: update" on public.od_accounts
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own accounts: delete" on public.od_accounts;
create policy "own accounts: delete" on public.od_accounts
    for delete using (auth.uid() = user_id);

drop policy if exists "own transactions: select" on public.od_transactions;
create policy "own transactions: select" on public.od_transactions
    for select using (auth.uid() = user_id);

-- The extra od_accounts lookup stops a caller from stapling a transaction onto
-- somebody else's overdraft by passing a foreign od_id.
drop policy if exists "own transactions: insert" on public.od_transactions;
create policy "own transactions: insert" on public.od_transactions
    for insert with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.od_accounts a
            where a.id = od_id and a.user_id = auth.uid()
        )
    );

drop policy if exists "own transactions: update" on public.od_transactions;
create policy "own transactions: update" on public.od_transactions
    for update using (auth.uid() = user_id) with check (
        auth.uid() = user_id
        and exists (
            select 1 from public.od_accounts a
            where a.id = od_id and a.user_id = auth.uid()
        )
    );

drop policy if exists "own transactions: delete" on public.od_transactions;
create policy "own transactions: delete" on public.od_transactions
    for delete using (auth.uid() = user_id);

drop policy if exists "own settings: select" on public.letter_settings;
create policy "own settings: select" on public.letter_settings
    for select using (auth.uid() = user_id);

drop policy if exists "own settings: insert" on public.letter_settings;
create policy "own settings: insert" on public.letter_settings
    for insert with check (auth.uid() = user_id);

drop policy if exists "own settings: update" on public.letter_settings;
create policy "own settings: update" on public.letter_settings
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime: let other signed-in devices pick up changes as they happen.
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
