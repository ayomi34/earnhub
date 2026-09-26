-- ============================================================
-- EarnHub — post-review migration (run after schema.sql)
-- Idempotent. Safe to re-run.
-- ============================================================
create extension if not exists "pgcrypto";

-- ---------- 1. Link referrals at signup ----------
-- handle_new_user now resolves the referral code from signup metadata
-- and writes profiles.referred_by + a pending referrals row.
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

-- ---------- 2. Protect sensitive profile columns ----------
-- Clients may only change full_name / phone / bank. role, status,
-- membership_id, referred_by and referral_code are admin/service only.
create or replace function public.protect_profile_columns()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  -- service_role (edge functions) and DB admins bypass; browser clients cannot change these columns
  if public.is_admin() or auth.role() = 'service_role' then return new; end if;
  new.role          := old.role;
  new.status        := old.status;
  new.membership_id := old.membership_id;
  new.referred_by   := old.referred_by;
  new.referral_code := old.referral_code;
  return new;
end;
$$;

drop trigger if exists on_profile_update on public.profiles;
create trigger on_profile_update
  before update on public.profiles
  for each row execute procedure public.protect_profile_columns();

-- ---------- 3. One active membership per payment ----------
drop trigger if exists on_payment_verified on public.payments;
drop trigger if exists on_membership_created on public.memberships;
create or replace function public.expire_prior_memberships()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  update public.memberships
  set status = 'expired'
  where user_id = new.user_id and status = 'active' and id <> new.id;
  return new;
end;
$$;
create trigger on_membership_created
  before insert on public.memberships
  for each row execute procedure public.expire_prior_memberships();

-- prevent duplicate memberships from the same payment (retry safety)
create unique index if not exists memberships_payment_id_key
  on public.memberships (payment_id);

-- ---------- 4. Notifications: users may only set read ----------
drop policy if exists "notifications: self mark" on public.notifications;
drop policy if exists "notifications: self mark read only" on public.notifications;
create policy "notifications: self mark read only" on public.notifications
  for update using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and type  = (select n.type    from public.notifications n where n.id = notifications.id)
    and title = (select n.title   from public.notifications n where n.id = notifications.id)
    and body  = (select n.body    from public.notifications n where n.id = notifications.id)
    and user_id = (select n.user_id from public.notifications n where n.id = notifications.id)
  );

-- ---------- 5. Seed default platform settings ----------
insert into public.platform_settings (id, payload)
values (true, '{
  "platformName": "EarnHub",
  "supportEmail": "support@earnhub.ng",
  "supportPhone": "0800 EARNHUB",
  "minWithdrawal": 2000,
  "withdrawalFee": 0,
  "referralPercentDefault": 5,
  "paystackPublicKey": "",
  "paymentMode": "live"
}'::jsonb)
on conflict (id) do nothing;

-- ============================================================
-- ADMIN EDGE FUNCTIONS to deploy (service role):
--   review-submission  POST {submissionId, approve, note}
--     -> approval credits task reward + referral commission atomically
--        (wallet_transactions inserted with idempotent source_id)
--   payout             POST {withdrawalId, action, payoutRef, note}
--     -> re-checks ledger balance in a transaction before marking paid
--        and inserting the withdrawal debit (source_id = withdrawal id)

-- ---------- 6. Public referral-code validation (registration is code-mandatory) ----------
-- Anonymous sign-ups must verify a referrer's code before creating an account.
-- SECURITY DEFINER is required because RLS hides other members' profiles;
-- the function returns only true/false — no member data is exposed.
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

-- ---------- 7. Daily spin ----------
-- Results are determined ONLY by the daily-spin edge function (service
-- role); clients may read their own rows. Cash rewards start pending and
-- are credited to the wallet only after admin approval.
create table if not exists public.spins (
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
create index if not exists spins_user_id_created_at_idx on public.spins (user_id, created_at desc);
create index if not exists spins_created_at_idx on public.spins (created_at desc);

alter table public.spins enable row level security;
drop policy if exists "spins: self read" on public.spins;
create policy "spins: self read" on public.spins for select
  using (auth.uid() = user_id or public.is_admin());

-- spins may add a new wallet credit type
do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.wallet_transactions'::regclass
      and conname = 'wallet_transactions_type_check'
  ) then
    alter table public.wallet_transactions drop constraint wallet_transactions_type_check;
  end if;
end
$$;
alter table public.wallet_transactions add constraint wallet_transactions_type_check
  check (type in ('task_reward','referral_bonus','withdrawal','refund','adjustment','spin_reward'));

-- anonymized recent winners for the spin page (no profile data exposed:
-- names are masked server-side before leaving the database)
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
-- ============================================================