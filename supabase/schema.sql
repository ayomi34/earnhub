-- ============================================================
-- EarnHub — Supabase production schema
-- Postgres 15 · UUID keys · Ledger wallet · Row Level Security
-- Run in the Supabase SQL editor, then deploy the edge functions
-- noted at the bottom for payment verification and payouts.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- profiles (extends auth.users) ----------
create table public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  role          text not null default 'user' check (role in ('user','admin')),
  full_name     text not null,
  email         text not null unique,
  phone         text not null,
  status        text not null default 'active' check (status in ('active','suspended')),
  referral_code text not null unique,
  referred_by   uuid references public.profiles(id),
  membership_id uuid,                       -- fk added after memberships
  bank          jsonb,
  created_at    timestamptz not null default now()
);

-- ---------- helpers ----------
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Anonymous sign-ups must verify a referrer's code before creating an
-- account (registration is referral-only). SECURITY DEFINER is required
-- because RLS hides other members' profiles; the function returns only
-- true/false — no member data is exposed.
create or replace function public.validate_referral_code(code text)
returns boolean
language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where referral_code = upper(trim(coalesce(code, '')))
  );
$$;

grant execute on function public.validate_referral_code(text) to anon, authenticated;

-- Create the application user row whenever Supabase Auth creates an account.
-- This runs with database privileges because the signup client cannot insert
-- profile rows before the new session is fully established.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  referrer public.profiles;
begin
  insert into public.profiles (id, full_name, email, phone, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', 'User'),
    new.email,
    coalesce(new.raw_user_meta_data->>'phone', ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'referral_code', ''),
      'EH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
    )
  )
  on conflict (id) do nothing;

  -- Registration is referral-only: link the invited member to their referrer.
  -- The client validates the code (validate_referral_code) before signUp.
  if coalesce(new.raw_user_meta_data->>'referral_code', '') <> '' then
    select * into referrer from public.profiles
    where referral_code = upper(new.raw_user_meta_data->>'referral_code')
      and id <> new.id limit 1;
    if found then
      update public.profiles set referred_by = referrer.id where id = new.id;
      insert into public.referrals (referrer_id, referred_id, status)
      values (referrer.id, new.id, 'pending')
      on conflict (referred_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill accounts created before this trigger was installed.
insert into public.profiles (id, full_name, email, phone, referral_code)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'full_name', 'User'),
  u.email,
  coalesce(u.raw_user_meta_data->>'phone', ''),
  'EH-' || upper(substr(md5(u.id::text), 1, 6))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- ---------- membership levels ----------
create table public.membership_levels (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  price                integer not null check (price >= 500),      -- naira
  description          text not null default '',
  features             jsonb not null default '[]',
  task_limit_per_day   integer not null default 3 check (task_limit_per_day > 0),
  referral_commission  numeric(4,1) not null default 5 check (referral_commission between 0 and 30),
  enabled              boolean not null default true,
  sort_order           integer not null default 99,
  created_at           timestamptz not null default now()
);

-- ---------- payments (paystack) ----------
create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id),
  level_id       uuid not null references public.membership_levels(id),
  amount         integer not null check (amount > 0),
  reference      text not null unique,
  gateway        text not null default 'paystack',
  gateway_status text not null default 'initialized',
  status         text not null default 'pending'
                 check (status in ('pending','success','failed','abandoned')),
  verified_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------- memberships ----------
create table public.memberships (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id),
  level_id     uuid not null references public.membership_levels(id),
  payment_id   uuid not null references public.payments(id),
  status       text not null default 'active' check (status in ('active','expired')),
  activated_at timestamptz not null default now()
);
alter table public.profiles
  add constraint profiles_membership_fk
  foreign key (membership_id) references public.memberships(id);

-- ---------- wallet ledger (immutable) ----------
create table public.wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id),
  type        text not null check (type in ('task_reward','referral_bonus','withdrawal','refund','adjustment')),
  direction   text not null check (direction in ('credit','debit')),
  amount      integer not null check (amount > 0),
  status      text not null default 'approved' check (status in ('pending','approved','rejected')),
  description text not null,
  reference   text not null unique,
  source_id   text not null unique,          -- idempotency key: no double credits
  created_at  timestamptz not null default now()
);
create index on public.wallet_transactions (user_id, created_at desc);

-- balances are derived: never trust a mutable balance column
create or replace view public.wallet_balances as
select user_id,
  coalesce(sum(case when status='approved' and direction='credit' then amount end),0)
  - coalesce(sum(case when status='approved' and direction='debit' then amount end),0)
  as ledger_balance
from public.wallet_transactions
group by user_id;

-- ---------- tasks ----------
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  description     text not null,
  instructions    text not null default '',
  category        text not null,
  reward          integer not null check (reward >= 50),
  est_minutes     integer not null default 15,
  max_submissions integer not null default 100,
  daily_limit     integer not null default 1,
  level_ids       uuid[] not null,
  verification    text not null default 'manual_review',
  starts_at       timestamptz not null default now(),
  ends_at         timestamptz not null default now() + interval '90 days',
  status          text not null default 'draft' check (status in ('draft','active','paused','archived')),
  created_at      timestamptz not null default now()
);

-- ---------- task submissions ----------
create table public.task_submissions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid not null references public.tasks(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  status      text not null default 'in_progress'
              check (status in ('in_progress','submitted','approved','rejected','expired')),
  proof       text not null default '',
  review_note text,
  started_at  timestamptz not null default now(),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  unique (task_id, user_id)                  -- one attempt per task per member
);

-- ---------- withdrawals ----------
create table public.withdrawals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.profiles(id),
  bank           text not null,
  account_number text not null check (account_number ~ '^\d{10}$'),
  account_name   text not null,
  amount         integer not null check (amount > 0),
  fee            integer not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending','processing','paid','rejected')),
  reference      text not null unique,
  payout_ref     text,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------- referrals (single level) ----------
create table public.referrals (
  id          uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null references public.profiles(id) unique,  -- one referrer per member
  status      text not null default 'pending' check (status in ('pending','active')),
  earned      integer not null default 0,
  created_at  timestamptz not null default now()
);

-- ---------- notifications / support / audit / settings ----------
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id),
  type       text not null,
  title      text not null,
  body       text not null,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.support_tickets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles(id),
  name       text not null,
  email      text not null,
  subject    text not null,
  message    text not null,
  status     text not null default 'open' check (status in ('open','closed')),
  created_at timestamptz not null default now()
);

create table public.admin_users (
  id         uuid primary key references public.profiles(id),
  granted_at timestamptz not null default now()
);

create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid not null references public.profiles(id),
  action     text not null,
  detail     text not null default '',
  created_at timestamptz not null default now()
);

create table public.platform_settings (
  id         boolean primary key default true check (id),  -- singleton row
  payload    jsonb not null,
  updated_at timestamptz not null default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- Members can read their own rows and create a narrow set of
-- requests. NO role can update/deleted financial truth from the
-- client: wallet_transactions, payments.status and
-- withdrawals.status are service-role (edge function) only.
-- ============================================================

alter table public.profiles            enable row level security;
alter table public.membership_levels   enable row level security;
alter table public.memberships         enable row level security;
alter table public.payments            enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.tasks               enable row level security;
alter table public.task_submissions    enable row level security;
alter table public.withdrawals         enable row level security;
alter table public.referrals           enable row level security;
alter table public.notifications       enable row level security;
alter table public.support_tickets     enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.platform_settings   enable row level security;

create policy "profiles: self read"        on public.profiles for select using (auth.uid() = id or public.is_admin());
create policy "profiles: self update safe" on public.profiles for update using (auth.uid() = id)
  with check (auth.uid() = id and role = (select role from public.profiles where id = auth.uid()));

create policy "levels: public read enabled" on public.membership_levels for select using (enabled or public.is_admin());

create policy "memberships: self read"  on public.memberships for select using (auth.uid() = user_id or public.is_admin());
create policy "payments: self read"     on public.payments for select using (auth.uid() = user_id or public.is_admin());
create policy "payments: self insert pending" on public.payments for insert
  with check (auth.uid() = user_id and status = 'pending');
-- NOTE: no client update policy on payments — verification is service-role only

create policy "ledger: self read" on public.wallet_transactions for select
  using (auth.uid() = user_id or public.is_admin());
-- NOTE: no client insert/update/delete on wallet_transactions — edge functions only

create policy "tasks: read active"      on public.tasks for select using (status = 'active' or public.is_admin());

create policy "submissions: self read"  on public.task_submissions for select using (auth.uid() = user_id or public.is_admin());
create policy "submissions: self start" on public.task_submissions for insert
  with check (auth.uid() = user_id and status in ('in_progress','submitted'));
create policy "submissions: self submit" on public.task_submissions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status in ('in_progress','submitted'));

create policy "withdrawals: self read"  on public.withdrawals for select using (auth.uid() = user_id or public.is_admin());
create policy "withdrawals: self request" on public.withdrawals for insert
  with check (auth.uid() = user_id and status = 'pending');
-- balance re-check + payout is atomic in the payout edge function:
--   begin;
--     select … for update;
--     if available >= amount + fee then
--       update withdrawals set status='paid';
--       insert into wallet_transactions (… direction='debit', source_id=withdrawal_id …)
--       on conflict (source_id) do nothing;   -- idempotent
--   commit;

create policy "referrals: self read"    on public.referrals for select using (auth.uid() = referrer_id or public.is_admin());

create policy "notifications: self read"   on public.notifications for select using (auth.uid() = user_id or public.is_admin());
create policy "notifications: self mark"   on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "tickets: insert"         on public.support_tickets for insert with check (true);
create policy "tickets: self read"      on public.support_tickets for select using (auth.uid() = user_id or public.is_admin());

create policy "audit: admin read"       on public.audit_logs for select using (public.is_admin());
create policy "settings: public read"   on public.platform_settings for select using (true);

-- admin writes (levels, tasks, submissions review) go through edge functions
-- that verify is_admin() server-side, then write with the service role and
-- append to audit_logs in the same transaction.

-- ============================================================
-- EDGE FUNCTIONS to deploy (service role):
--   paystack-verify   POST {reference}  -> GET api.paystack.co/transaction/verify/:reference
--                       on success: payment->success, create/replace membership,
--                       activate referral, insert notifications (single tx, idempotent)
--   review-submission POST {submissionId, approve, note}
--   payout            POST {withdrawalId, action, payoutRef, note}  (see block above)
-- Secret PAYSTACK_SECRET_KEY lives in function env vars — never in the client.
-- ============================================================
