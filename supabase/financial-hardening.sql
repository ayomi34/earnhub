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
    return jsonb_build_object('error','An active membership is required to join a Zentra cycle.','status',403);
  end if;
  if p_cycle_days < 1 or p_cycle_days > 365 or p_gold_reward < 1 or p_join_cost < 0 or p_max_active_cycles < 1 then
    return jsonb_build_object('error','Zentra cycle configuration is invalid.','status',400);
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
        format('Zentra cycle join fee (%s-day cycle)',p_cycle_days),
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
