import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const schema = read("supabase/schema.sql");
const migration = read("supabase/migration.sql");
const hardening = read("supabase/financial-hardening.sql");
const goldMine = read("supabase/functions/gold-mine/index.ts");
const dailySpin = read("supabase/functions/daily-spin/index.ts");
const paymentVerification = read("supabase/functions/paystack-verify/index.ts");
const clientServices = read("src/lib/services.ts");

test("fresh-install and upgrade SQL define Zentra data and safe reads", () => {
  for (const sql of [schema, migration, hardening]) {
    assert.match(sql, /create table if not exists public\.gold_mine_cycles/i);
    assert.match(sql, /create table if not exists public\.gold_mine_conversions/i);
    assert.match(sql, /alter table public\.gold_mine_cycles enable row level security/i);
    assert.match(sql, /gold mine conversions: self read/i);
  }
});

test("Zentra debits, cycle creation and cash conversions use atomic database RPCs", () => {
  assert.match(goldMine, /rpc\("join_gold_mine_cycle"/);
  assert.match(goldMine, /rpc\("request_gold_conversion"/);
  assert.doesNotMatch(goldMine, /from\("wallet_transactions"\)\.insert/);
  assert.doesNotMatch(goldMine, /from\("gold_mine_conversions"\)\.insert/);
  assert.match(hardening, /create or replace function public\.join_gold_mine_cycle/i);
  assert.match(hardening, /create or replace function public\.request_gold_conversion/i);
  assert.match(hardening, /create or replace function public\.admin_approve_gold_conversion/i);
  assert.match(hardening, /v_cash,v_fee,'pending'/i);
  assert.match(goldMine, /request_gold_conversion/);
  assert.match(read("supabase/functions/admin-action/index.ts"), /admin_approve_gold_conversion/);
});

test("daily spin fails closed in browser and commits limits + ledger together", () => {
  assert.match(clientServices, /server-authoritative/);
  assert.doesNotMatch(clientServices, /executeDirectSpin/);
  assert.match(dailySpin, /rpc\("commit_daily_spin"/);
  assert.doesNotMatch(dailySpin, /from\("spins"\)\.insert/);
  assert.match(hardening, /pg_advisory_xact_lock/);
  assert.match(hardening, /create or replace function public\.commit_daily_spin/i);
});

test("Paystack fulfillment is transactional and idempotent per payment", () => {
  assert.match(paymentVerification, /rpc\("fulfill_verified_payment"/);
  assert.doesNotMatch(paymentVerification, /from\("memberships"\)\.insert/);
  assert.match(hardening, /unique index if not exists memberships_payment_id_key/i);
  assert.match(hardening, /create or replace function public\.fulfill_verified_payment/i);
  assert.match(hardening, /for update/i);
});

test("profile update trigger protects authorization and account state", () => {
  for (const sql of [schema, migration, hardening]) {
    assert.match(sql, /create or replace function public\.protect_profile_columns/i);
    assert.match(sql, /new\.role := old\.role/i);
    assert.match(sql, /new\.status := old\.status/i);
    assert.match(sql, /new\.membership_id := old\.membership_id/i);
  }
});

test("the wallet transaction constraint includes every feature ledger type", () => {
  for (const sql of [schema, migration, hardening]) {
    assert.match(sql, /'membership_commission'/);
    assert.match(sql, /'gold_mine_join'/);
    assert.match(sql, /'gold_mine_conversion'/);
  }
});
