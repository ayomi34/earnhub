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
    'EH-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6))
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
  type        text not null check (type in ('task_reward','referral_bonus','withdrawal','refund','adjustment','spin_reward','feud_reward')),
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

-- ---------- daily spin ----------
-- Results are determined ONLY by the daily-spin edge function (service
-- role); clients may read their own rows. Cash rewards start pending and
-- are credited to the wallet only after admin approval.
create table public.spins (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id),
  segment_index integer not null check (segment_index >= 0),
  label         text not null,
  reward_type   text not null check (reward_type in ('cash','bonus_task','none')),
  amount        integer not null default 0 check (amount >= 0),
  status        text not null default 'pending'
                check (status in ('pending','approved','rejected','none')),
  reference     text not null unique,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now()
);
create index on public.spins (user_id, created_at desc);
create index on public.spins (created_at desc);

create policy "spins: self read" on public.spins for select
  using (auth.uid() = user_id or public.is_admin());
alter table public.spins enable row level security;

-- anonymized recent winners for the spin page (names masked server-side)
create or replace function public.recent_spin_winners()
returns table (winner text, amount integer, won_at timestamptz)
language sql stable security definer
set search_path = public as $$
  select
    left(split_part(p.full_name, ' ', 1), 1) || '*** ' ||
    left(split_part(p.full_name, ' ', -1), 1) || '.' as winner,
    s.amount,
    s.created_at
  from (
    select * from public.spins
    where reward_type = 'cash' and status in ('pending','approved') and amount > 0
    order by created_at desc
    limit 10
  ) s
  join public.profiles p on p.id = s.user_id;
$$;

grant execute on function public.recent_spin_winners() to authenticated;

-- ---------- survey feud ----------
-- Question bank is written by admins (admin-action edge function with the
-- service role; direct admin writes are also allowed by RLS). Members read
-- active questions only. Game sessions are created/scored by members during
-- play and validated server-side by the feud-game edge function when deployed.
create table public.feud_questions (
  id          uuid primary key default gen_random_uuid(),
  prompt      text not null,
  category    text not null default 'General',
  difficulty  text not null default 'easy'
              check (difficulty in ('easy','medium','hard')),
  explanation text,
  answers     jsonb not null default '[]'::jsonb, -- [{id,text,points,rank}]
  status      text not null default 'active'
              check (status in ('active','inactive')),
  created_at  timestamptz not null default now()
);
create index on public.feud_questions (status);

create table public.feud_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id),
  score              integer not null default 0 check (score >= 0),
  target_points      integer not null default 200 check (target_points > 0),
  completed          boolean not null default false,
  reward_amount      integer not null default 0 check (reward_amount >= 0),
  reward_status      text not null default 'none'
                     check (reward_status in ('none','pending','credited')),
  time_spent_seconds integer not null default 0,
  started_at         timestamptz not null default now(),
  completed_at       timestamptz,
  question_ids       jsonb not null default '[]'::jsonb,
  rounds             jsonb not null default '[]'::jsonb  -- answer history
);
create index on public.feud_sessions (user_id, started_at desc);
create index on public.feud_sessions (started_at desc);

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
alter table public.feud_questions      enable row level security;
alter table public.feud_sessions       enable row level security;

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
  with check (auth.uid() = user_id and status in ('in_progress','submitted')
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active'));
create policy "submissions: self submit" on public.task_submissions for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id and status in ('in_progress','submitted')
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active'));

create policy "withdrawals: self read"  on public.withdrawals for select using (auth.uid() = user_id or public.is_admin());
create policy "withdrawals: self request" on public.withdrawals for insert
  with check (auth.uid() = user_id and status = 'pending'
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active')
    and (select count(*) from public.referrals r
      where r.referrer_id = auth.uid() and r.status = 'active') >= 3);
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

-- survey feud: only admins read the full question bank. Members receive
-- playable questions through the edge function without answer-point values.
-- Sessions may only be inserted/updated by their owner.
create policy "feud questions: read"    on public.feud_questions for select
  using (public.is_admin());
create policy "feud questions: admin write" on public.feud_questions
  using (public.is_admin()) with check (public.is_admin());
create policy "feud sessions: self read" on public.feud_sessions for select
  using (auth.uid() = user_id or public.is_admin());
create policy "feud sessions: self insert" on public.feud_sessions for insert
  with check (auth.uid() = user_id
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active'));
create policy "feud sessions: self update" on public.feud_sessions for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id
    and exists (select 1 from public.memberships m where m.user_id = auth.uid() and m.status = 'active'));

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
-- EarnHub financial hardening migration.
-- Run this standalone after prior migrations on an existing project. Fresh installs
-- run schema.sql then migration.sql (which includes this hardening script). Safe to re-run.
-- All reward/payment balance transitions are atomic database transactions
-- invoked only by service-role Edge Functions.

create extension if not exists "pgcrypto";

create table if not exists public.referral_commissions (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals(id),
  referrer_id uuid not null references public.profiles(id),
  referred_id uuid not null references public.profiles(id),
  commission_type text not null check (commission_type in ('zentra','membership')),
  amount numeric not null check (amount > 0),
  currency text not null check (currency in ('ZNTR','NGN')),
  source_id text not null,
  status text not null default 'approved' check (status in ('approved','reversed')),
  description text,
  created_at timestamptz not null default now()
);
create unique index if not exists referral_commissions_source_type_idx
  on public.referral_commissions(source_id,commission_type);
create index if not exists referral_commissions_referrer_idx
  on public.referral_commissions(referrer_id,created_at desc);
create index if not exists referral_commissions_referred_idx
  on public.referral_commissions(referred_id,commission_type);
alter table public.referral_commissions enable row level security;
drop policy if exists "referral_commissions: self read" on public.referral_commissions;
create policy "referral_commissions: self read" on public.referral_commissions
  for select using (auth.uid()=referrer_id or auth.uid()=referred_id);
drop policy if exists "referral_commissions: admin read" on public.referral_commissions;
create policy "referral_commissions: admin read" on public.referral_commissions
  for select using (public.is_admin());

-- Repair the vulnerable profile self-update policy on installations that ran
-- the original schema. A trigger preserves every field except user-editable
-- profile details, including against direct PostgREST PATCH requests.
create or replace function public.protect_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if session_user in ('postgres','supabase_admin') or coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  new.id := old.id;
  new.role := old.role;
  new.email := old.email;
  new.status := old.status;
  new.referral_code := old.referral_code;
  new.referred_by := old.referred_by;
  new.membership_id := old.membership_id;
  new.created_at := old.created_at;
  return new;
end;
$$;
drop trigger if exists on_profile_update on public.profiles;
create trigger on_profile_update before update on public.profiles
for each row execute function public.protect_profile_columns();

-- Collapse any historical duplicate fulfillment rows before enforcing uniqueness.
with ranked as (
  select id, payment_id,
    first_value(id) over (partition by payment_id order by (status='active') desc, activated_at desc, id) as keep_id,
    row_number() over (partition by payment_id order by (status='active') desc, activated_at desc, id) as rn
  from public.memberships
), duplicate_map as (
  select id, keep_id from ranked where rn > 1
)
update public.profiles p set membership_id=d.keep_id
from duplicate_map d where p.membership_id=d.id;
with ranked as (
  select id, row_number() over (partition by payment_id order by (status='active') desc, activated_at desc, id) as rn
  from public.memberships
)
delete from public.memberships m using ranked r where m.id=r.id and r.rn>1;

-- One membership per successful payment; the transaction RPC below serializes
-- activations for a given member so only one can remain active.
create unique index if not exists memberships_payment_id_key
  on public.memberships(payment_id);

-- These tables were used by the application before being included in the
-- checked-in setup SQL. Keep this section idempotent for existing projects.
create table if not exists public.gold_mine_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  level_id uuid not null references public.membership_levels(id),
  gold_reward integer not null check (gold_reward > 0),
  join_cost integer not null default 0 check (join_cost >= 0),
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  completed_at timestamptz,
  gold_credited boolean not null default false,
  request_id uuid not null,
  created_at timestamptz not null default now()
);
create index if not exists gold_mine_cycles_user_created_idx
  on public.gold_mine_cycles(user_id, created_at desc);
create index if not exists gold_mine_cycles_active_idx
  on public.gold_mine_cycles(user_id, status) where status = 'active';
-- Backfill idempotency keys for installations where these tables predate this migration.
alter table public.gold_mine_cycles add column if not exists request_id uuid;
update public.gold_mine_cycles set request_id=gen_random_uuid() where request_id is null;
alter table public.gold_mine_cycles alter column request_id set not null;
create unique index if not exists gold_mine_cycles_user_request_idx
  on public.gold_mine_cycles(user_id,request_id);

create table if not exists public.gold_mine_conversions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  gold_amount integer not null check (gold_amount > 0),
  cash_amount integer not null check (cash_amount > 0),
  fee_amount integer not null default 0 check (fee_amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reference text not null unique,
  request_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists gold_mine_conversions_user_created_idx
  on public.gold_mine_conversions(user_id, created_at desc);
create index if not exists gold_mine_conversions_daily_idx
  on public.gold_mine_conversions(user_id, created_at) where status <> 'rejected';
alter table public.gold_mine_conversions add column if not exists request_id uuid;
update public.gold_mine_conversions set request_id=gen_random_uuid() where request_id is null;
alter table public.gold_mine_conversions alter column request_id set not null;
create unique index if not exists gold_mine_conversions_user_request_idx
  on public.gold_mine_conversions(user_id,request_id);
-- Old auto-approved conversions without a corresponding ledger credit were
-- stranded by the previous invalid ledger type; queue them for admin review.
update public.gold_mine_conversions c set status='pending', processed_at=null
where c.status='approved'
  and not exists (select 1 from public.wallet_transactions w where w.source_id=c.id::text);

alter table public.gold_mine_cycles enable row level security;
alter table public.gold_mine_conversions enable row level security;
drop policy if exists "gold mine cycles: self read" on public.gold_mine_cycles;
create policy "gold mine cycles: self read" on public.gold_mine_cycles
  for select using (auth.uid() = user_id or public.is_admin());
drop policy if exists "gold mine conversions: self read" on public.gold_mine_conversions;
create policy "gold mine conversions: self read" on public.gold_mine_conversions
  for select using (auth.uid() = user_id or public.is_admin());
-- Intentionally no client insert/update/delete policies for either table.
-- Revoke table-level grants as well, so stale permissive policies cannot reopen writes.
revoke insert, update, delete on table public.gold_mine_cycles, public.gold_mine_conversions,
  public.wallet_transactions, public.spins, public.referral_commissions from anon, authenticated;

-- Include all application transaction types in both fresh and upgraded schemas.
alter table public.wallet_transactions drop constraint if exists wallet_transactions_type_check;
alter table public.wallet_transactions add constraint wallet_transactions_type_check
  check (type in (
    'task_reward','referral_bonus','membership_commission','withdrawal','refund',
    'adjustment','spin_reward','feud_reward','gold_mine_join','gold_mine_conversion'
  ));

-- A successful Paystack verification and all membership/referral side effects
-- commit together. payment_id uniqueness and row locks make retries idempotent.
create or replace function public.fulfill_verified_payment(p_payment_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.payments%rowtype;
  v_membership public.memberships%rowtype;
  v_level public.membership_levels%rowtype;
  v_profile public.profiles%rowtype;
  v_ref public.referrals%rowtype;
  v_referrer_id uuid;
  v_full_name text;
  v_commission_id uuid;
  v_commission_amount integer;
  v_settings jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  select * into v_payment from public.payments
    where id = p_payment_id and user_id = p_user_id for update;
  if not found then
    return jsonb_build_object('error','Payment record not found.','status',404);
  end if;
  if v_payment.status not in ('pending','failed','success') then
    return jsonb_build_object('error','Payment is not eligible for activation.','status',409);
  end if;

  select * into v_membership from public.memberships where payment_id = v_payment.id;
  if found then
    if v_membership.status = 'active' then
      update public.profiles set membership_id = v_membership.id where id = p_user_id;
    end if;
    return jsonb_build_object('payment',to_jsonb(v_payment),'membership',to_jsonb(v_membership));
  end if;

  -- Serialize membership replacements for this user across different payments.
  select * into v_profile from public.profiles where id = p_user_id for update;
  if not found or v_profile.status <> 'active' then
    return jsonb_build_object('error','This account is not active.','status',403);
  end if;
  select * into v_level from public.membership_levels where id = v_payment.level_id;
  if not found then
    return jsonb_build_object('error','Membership level not found.','status',404);
  end if;

  update public.payments set status='success', gateway_status='success', verified_at=coalesce(verified_at,now())
    where id = v_payment.id returning * into v_payment;
  update public.memberships set status='expired' where user_id=p_user_id and status='active';
  insert into public.memberships(user_id,level_id,payment_id,status)
    values (p_user_id,v_payment.level_id,v_payment.id,'active') returning * into v_membership;
  update public.profiles set membership_id=v_membership.id where id=p_user_id;

  insert into public.notifications(user_id,type,title,body)
    values (p_user_id,'payment','Payment successful',
      format('Your payment of ₦%s for the %s level was verified. Reference: %s.',
        to_char(v_payment.amount,'FM999,999,999'),v_level.name,v_payment.reference));
  insert into public.notifications(user_id,type,title,body)
    values (p_user_id,'membership',v_level.name || ' membership activated',
      format('You now have access to %s tasks. Complete approved tasks to earn — membership itself does not generate income.',v_level.name));

  select referred_by, full_name into v_referrer_id, v_full_name from public.profiles where id=p_user_id;
  if v_referrer_id is not null then
    select * into v_ref from public.referrals where referred_id=p_user_id for update;
    if found then
      update public.referrals set status='active' where id=v_ref.id and status='pending';
      select payload into v_settings from public.platform_settings where id=true;
      if coalesce((v_settings->'referralCommissions'->>'membershipEnabled')::boolean,true) then
        v_commission_amount := floor(coalesce((v_settings->'referralCommissions'->>'membershipFlatAmount')::numeric,500));
        if v_commission_amount > 0 then
          insert into public.referral_commissions(
            referral_id,referrer_id,referred_id,commission_type,amount,currency,source_id,status,description
          ) values (
            v_ref.id,v_ref.referrer_id,p_user_id,'membership',v_commission_amount,'NGN',v_payment.id::text,'approved',
            format('Membership registration commission — %s activated %s',v_full_name,v_level.name)
          ) on conflict (source_id,commission_type) do nothing returning id into v_commission_id;
          if v_commission_id is not null then
            insert into public.wallet_transactions(user_id,type,direction,amount,status,description,reference,source_id)
              values (v_ref.referrer_id,'membership_commission','credit',v_commission_amount,'approved',
                format('Membership commission — %s activated %s',v_full_name,v_level.name),
                'EH-MEM-COMM-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,20)),v_commission_id::text);
            insert into public.notifications(user_id,type,title,body)
              values (v_ref.referrer_id,'referral','Membership commission earned!',
                format('You earned ₦%s — your referral %s purchased a %s membership.',
                  to_char(v_commission_amount,'FM999,999,999'),v_full_name,v_level.name));
          end if;
        end if;
      end if;
    end if;
  end if;

  return jsonb_build_object('payment',to_jsonb(v_payment),'membership',to_jsonb(v_membership));
end;
$$;
revoke all on function public.fulfill_verified_payment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fulfill_verified_payment(uuid,uuid) to service_role;

-- Atomically enforce one spin per 24 hours and the shared daily prize budget,
-- then persist the spin, wallet credit and notification in the same commit.
create or replace function public.commit_daily_spin(
  p_user_id uuid, p_segment_index integer, p_label text, p_reward_type text,
  p_amount integer, p_reference text, p_require_verified boolean,
  p_daily_budget integer, p_ip text, p_user_agent text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_spin public.spins%rowtype;
  v_wallet public.wallet_transactions%rowtype;
  v_last timestamptz;
  v_spent bigint;
  v_email_confirmed timestamptz;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  if p_segment_index < 0 or p_amount < 0 or p_reward_type not in ('cash','bonus_task','none') or length(trim(p_label))=0 then
    return jsonb_build_object('error','Invalid spin result.','status',400);
  end if;
  -- A shared advisory lock prevents parallel accounts from exceeding the day's budget.
  perform pg_advisory_xact_lock(hashtextextended('daily-spin:' || (v_now at time zone 'UTC')::date::text,0));
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found then return jsonb_build_object('error','Profile not found.','status',404); end if;
  if v_profile.status <> 'active' then return jsonb_build_object('error','This account has been suspended.','status',403); end if;
  if not exists (select 1 from public.memberships where user_id=p_user_id and status='active') then
    return jsonb_build_object('error','An active membership is required to spin.','status',403);
  end if;
  if p_require_verified then
    select email_confirmed_at into v_email_confirmed from auth.users where id=p_user_id;
    if v_email_confirmed is null then
      return jsonb_build_object('error','Verify your email address to unlock the daily spin.','status',403);
    end if;
  end if;
  select created_at into v_last from public.spins where user_id=p_user_id order by created_at desc limit 1;
  if v_last is not null and v_last > v_now - interval '24 hours' then
    return jsonb_build_object('error','Your next free spin is not ready yet.','status',429,
      'nextSpinAt',to_jsonb(v_last + interval '24 hours'));
  end if;
  select coalesce(sum(amount),0) into v_spent from public.spins
    where reward_type='cash' and status in ('pending','approved')
      and created_at >= date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
  if p_daily_budget > 0 and p_reward_type='cash' and v_spent + p_amount > p_daily_budget then
    return jsonb_build_object('error','Today''s reward budget has been reached. Come back tomorrow!','status',429);
  end if;

  insert into public.spins(user_id,segment_index,label,reward_type,amount,status,reference,ip,user_agent)
    values (p_user_id,p_segment_index,p_label,p_reward_type,p_amount,
      case when p_reward_type='none' then 'none' else 'approved' end,p_reference,p_ip,p_user_agent)
    returning * into v_spin;
  if p_reward_type='cash' and p_amount > 0 then
    insert into public.wallet_transactions(user_id,type,direction,amount,status,description,reference,source_id)
      values (p_user_id,'spin_reward','credit',p_amount,'approved','Daily spin reward',p_reference,v_spin.id::text)
      returning * into v_wallet;
  end if;
  insert into public.notifications(user_id,type,title,body)
    values (p_user_id,'system',case when p_reward_type='cash' and p_amount>0 then 'Daily spin reward' else 'Daily spin' end,
      case when p_reward_type='cash' and p_amount>0
        then format('You won %s on the daily spin! Reference %s. The reward has been credited to your wallet.',p_label,p_reference)
        when p_reward_type='bonus_task' then 'You won a bonus task slot on the daily spin.'
        else 'No reward this time — your next free spin is available in 24 hours.' end);
  return jsonb_build_object('spin',to_jsonb(v_spin),
    'walletTx',case when v_wallet.id is null then null else to_jsonb(v_wallet) end,
    'segmentIndex',p_segment_index,'label',p_label,'rewardType',p_reward_type,
    'amount',p_amount,'reference',p_reference,'nextSpinAt',to_jsonb(v_now+interval '24 hours'));
end;
$$;
revoke all on function public.commit_daily_spin(uuid,integer,text,text,integer,text,boolean,integer,text,text) from public, anon, authenticated;
grant execute on function public.commit_daily_spin(uuid,integer,text,text,integer,text,boolean,integer,text,text) to service_role;

-- Cycle creation and its optional wallet debit are a single serializable-by-user
-- transaction. The request id makes retries return the existing cycle.
create or replace function public.join_gold_mine_cycle(
  p_user_id uuid, p_level_id uuid, p_cycle_days integer, p_gold_reward integer,
  p_join_cost integer, p_max_active_cycles integer, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_cycle public.gold_mine_cycles%rowtype;
  v_active integer;
  v_balance bigint;
  v_cycle_id uuid;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found or v_profile.status <> 'active' then return jsonb_build_object('error','This account is not active.','status',403); end if;
  select * into v_cycle from public.gold_mine_cycles where user_id=p_user_id and request_id=p_request_id;
  if found then return jsonb_build_object('cycle',to_jsonb(v_cycle)); end if;
  if not exists (select 1 from public.memberships where user_id=p_user_id and level_id=p_level_id and status='active') then
    return jsonb_build_object('error','An active membership is required to join a Gold Mine cycle.','status',403);
  end if;
  if p_cycle_days < 1 or p_cycle_days > 365 or p_gold_reward < 1 or p_join_cost < 0 or p_max_active_cycles < 1 then
    return jsonb_build_object('error','Gold Mine cycle configuration is invalid.','status',400);
  end if;
  select count(*) into v_active from public.gold_mine_cycles where user_id=p_user_id and status='active';
  if v_active >= p_max_active_cycles then
    return jsonb_build_object('error',format('You already have %s active cycle(s). Wait for one to complete before joining another.',v_active),'status',400);
  end if;
  select coalesce(sum(case when status='approved' and direction='credit' then amount else 0 end),0)
       - coalesce(sum(case when status <> 'rejected' and direction='debit' then amount else 0 end),0)
    into v_balance from public.wallet_transactions where user_id=p_user_id;
  if v_balance < p_join_cost then
    return jsonb_build_object('error',format('Insufficient wallet balance. You need ₦%s to join this cycle but your balance is ₦%s.',p_join_cost,v_balance),'status',400);
  end if;
  v_cycle_id := gen_random_uuid();
  if p_join_cost > 0 then
    insert into public.wallet_transactions(user_id,type,direction,amount,status,description,reference,source_id)
      values (p_user_id,'gold_mine_join','debit',p_join_cost,'approved',
        format('Gold Mine cycle join fee (%s-day cycle)',p_cycle_days),
        'EH-GM-JOIN-' || upper(substr(replace(v_cycle_id::text,'-',''),1,20)),v_cycle_id::text);
  end if;
  insert into public.gold_mine_cycles(id,user_id,level_id,gold_reward,join_cost,status,started_at,ends_at,gold_credited,request_id)
    values (v_cycle_id,p_user_id,p_level_id,p_gold_reward,p_join_cost,'active',v_now,
      v_now + make_interval(days=>p_cycle_days),false,p_request_id) returning * into v_cycle;
  return jsonb_build_object('cycle',to_jsonb(v_cycle));
end;
$$;
revoke all on function public.join_gold_mine_cycle(uuid,uuid,integer,integer,integer,integer,uuid) from public, anon, authenticated;
grant execute on function public.join_gold_mine_cycle(uuid,uuid,integer,integer,integer,integer,uuid) to service_role;

-- Conversion balance check, daily cap and gold reservation commit together
-- under the same per-user lock. Cash is credited only after admin approval.
create or replace function public.request_gold_conversion(
  p_user_id uuid, p_gold_amount integer, p_gold_to_cash_rate numeric,
  p_fee_percent numeric, p_min_conversion_gold integer,
  p_max_daily_conversions integer, p_request_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_conversion public.gold_mine_conversions%rowtype;
  v_wallet public.wallet_transactions%rowtype;
  v_earned bigint;
  v_spent bigint;
  v_daily integer;
  v_gross integer;
  v_fee integer;
  v_cash integer;
  v_ref text;
  v_now timestamptz := now();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id=p_user_id for update;
  if not found or v_profile.status <> 'active' then return jsonb_build_object('error','This account is not active.','status',403); end if;
  select * into v_conversion from public.gold_mine_conversions where user_id=p_user_id and request_id=p_request_id;
  if found then
    select * into v_wallet from public.wallet_transactions where source_id=v_conversion.id::text;
    return jsonb_build_object('conversion',to_jsonb(v_conversion),
      'walletTx',case when v_wallet.id is null then null else to_jsonb(v_wallet) end);
  end if;
  if p_gold_amount < p_min_conversion_gold or p_gold_amount < 1 then
    return jsonb_build_object('error',format('Minimum conversion is %s gold coins.',p_min_conversion_gold),'status',400);
  end if;
  if p_gold_to_cash_rate <= 0 or p_fee_percent < 0 or p_fee_percent >= 100 then
    return jsonb_build_object('error','Conversion configuration is invalid.','status',400);
  end if;
  if not exists (select 1 from public.memberships where user_id=p_user_id and status='active') then
    return jsonb_build_object('error','An active membership is required to convert ZNTR.','status',403);
  end if;
  select coalesce((select sum(gold_reward) from public.gold_mine_cycles where user_id=p_user_id and gold_credited),0)
       + coalesce((select sum(amount) from public.referral_commissions where referrer_id=p_user_id and commission_type='zentra' and status='approved'),0),
         coalesce((select sum(gold_amount) from public.gold_mine_conversions where user_id=p_user_id and status <> 'rejected'),0)
    into v_earned,v_spent;
  if v_earned-v_spent < p_gold_amount then
    return jsonb_build_object('error',format('Insufficient gold balance. You have %s gold coins but requested %s.',v_earned-v_spent,p_gold_amount),'status',400);
  end if;
  if p_max_daily_conversions > 0 then
    select count(*) into v_daily from public.gold_mine_conversions
      where user_id=p_user_id and status <> 'rejected'
        and created_at >= date_trunc('day',v_now at time zone 'UTC') at time zone 'UTC';
    if v_daily >= p_max_daily_conversions then
      return jsonb_build_object('error','You have reached the daily conversion limit. Come back tomorrow.','status',429);
    end if;
  end if;
  v_gross := floor(p_gold_amount*p_gold_to_cash_rate);
  v_fee := floor(v_gross*p_fee_percent/100);
  v_cash := v_gross-v_fee;
  if v_cash < 1 then return jsonb_build_object('error','Conversion amount is too small to credit.','status',400); end if;
  v_ref := 'EH-GM-CONV-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,24));
  insert into public.gold_mine_conversions(user_id,gold_amount,cash_amount,fee_amount,status,reference,request_id,processed_at)
    values (p_user_id,p_gold_amount,v_cash,v_fee,'pending',v_ref,p_request_id,null) returning * into v_conversion;
  insert into public.notifications(user_id,type,title,body)
    values (p_user_id,'system','ZNTR conversion submitted',
      format('Your request to convert %s ZNTR to ₦%s is pending admin approval.',p_gold_amount,to_char(v_cash,'FM999,999,999')));
  return jsonb_build_object('conversion',to_jsonb(v_conversion),'walletTx',null,'goldBalance',v_earned-v_spent-p_gold_amount);
end;
$$;
revoke all on function public.request_gold_conversion(uuid,integer,numeric,numeric,integer,integer,uuid) from public, anon, authenticated;
grant execute on function public.request_gold_conversion(uuid,integer,numeric,numeric,integer,integer,uuid) to service_role;


-- Legacy pending requests and all new conversions are reviewed via admin-action.
-- Locking each row plus a single transaction prevents duplicate credits/races.
create or replace function public.admin_approve_gold_conversion(p_conversion_id uuid, p_admin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversion public.gold_mine_conversions%rowtype;
  v_wallet public.wallet_transactions%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    return jsonb_build_object('error','Administrator access required.','status',403);
  end if;
  select * into v_conversion from public.gold_mine_conversions where id=p_conversion_id for update;
  if not found then return jsonb_build_object('error','Conversion not found.','status',404); end if;
  if v_conversion.status <> 'pending' then
    return jsonb_build_object('error','Only pending conversions can be approved.','status',409);
  end if;
  insert into public.wallet_transactions(user_id,type,direction,amount,status,description,reference,source_id)
    values (v_conversion.user_id,'gold_mine_conversion','credit',v_conversion.cash_amount,'approved',
      format('Gold conversion — %s ZNTR → ₦%s',v_conversion.gold_amount,to_char(v_conversion.cash_amount,'FM999,999,999')),
      'EH-GM-CASH-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,24)),v_conversion.id::text)
    returning * into v_wallet;
  update public.gold_mine_conversions set status='approved',processed_at=now()
    where id=v_conversion.id returning * into v_conversion;
  insert into public.notifications(user_id,type,title,body)
    values (v_conversion.user_id,'system','ZNTR conversion approved',
      format('Your conversion of %s ZNTR to ₦%s has been approved and credited to your wallet.',
        v_conversion.gold_amount,to_char(v_conversion.cash_amount,'FM999,999,999')));
  return jsonb_build_object('conversion',to_jsonb(v_conversion),'walletTx',to_jsonb(v_wallet));
end;
$$;
revoke all on function public.admin_approve_gold_conversion(uuid,uuid) from public, anon, authenticated;
grant execute on function public.admin_approve_gold_conversion(uuid,uuid) to service_role;

create or replace function public.admin_reject_gold_conversion(p_conversion_id uuid, p_admin_id uuid, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_conversion public.gold_mine_conversions%rowtype;
begin
  if coalesce(auth.role(),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles where id=p_admin_id and role='admin') then
    return jsonb_build_object('error','Administrator access required.','status',403);
  end if;
  select * into v_conversion from public.gold_mine_conversions where id=p_conversion_id for update;
  if not found then return jsonb_build_object('error','Conversion not found.','status',404); end if;
  if v_conversion.status <> 'pending' then
    return jsonb_build_object('error','Only pending conversions can be rejected.','status',409);
  end if;
  update public.gold_mine_conversions set status='rejected',note=left(coalesce(p_note,''),500),processed_at=now()
    where id=v_conversion.id returning * into v_conversion;
  insert into public.notifications(user_id,type,title,body)
    values (v_conversion.user_id,'system','ZNTR conversion rejected',
      format('Your request to convert %s ZNTR was not approved. %s Your ZNTR balance is available again.',
        v_conversion.gold_amount,case when length(trim(coalesce(p_note,'')))>0 then 'Reason: ' || left(trim(p_note),500) else 'Contact support for more information.' end));
  return jsonb_build_object('conversion',to_jsonb(v_conversion));
end;
$$;
revoke all on function public.admin_reject_gold_conversion(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.admin_reject_gold_conversion(uuid,uuid,text) to service_role;
