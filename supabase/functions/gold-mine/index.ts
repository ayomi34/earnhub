import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub Gold Mine edge function.
 * Handles three actions:
 *   join-cycle       — user joins a gold mine cycle (deducts join cost, creates cycle row)
 *   complete-cycles  — marks mature cycles as completed and credits gold
 *   request-conversion — user requests gold-to-cash conversion
 *
 * All privileged writes use the service role and are fully idempotent. */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  const svc = createClient(supabaseUrl, serviceRoleKey);

  // Load settings
  const { data: settingsRow } = await svc.from("settings").select("value").eq("key", "config").maybeSingle();
  const cfg = settingsRow?.value?.goldMine ?? {
    enabled: true,
    goldToCashRate: 10,
    minConversionGold: 50,
    conversionFeePercent: 5,
    maxDailyConversions: 1,
    levelConfigs: [],
  };

  if (!cfg.enabled) return json({ error: "Gold Mine is currently disabled." }, 403);

  const body = await req.json();
  const action = body?.action as string;

  // ── Helper: get user's active membership level ──────────────────────────
  async function getUserLevel() {
    const { data: membership } = await svc
      .from("memberships")
      .select("level_id")
      .eq("user_id", user!.id)
      .eq("status", "active")
      .maybeSingle();
    return membership?.level_id ?? null;
  }

  // ── Helper: compute gold balance ─────────────────────────────────────────
  async function getGoldBalance(userId: string) {
    const { data: cycles } = await svc
      .from("gold_mine_cycles")
      .select("gold_reward")
      .eq("user_id", userId)
      .eq("gold_credited", true);
    const earned = (cycles ?? []).reduce((s: number, c: { gold_reward: number }) => s + c.gold_reward, 0);

    const { data: convs } = await svc
      .from("gold_mine_conversions")
      .select("gold_amount")
      .eq("user_id", userId)
      .neq("status", "rejected");
    const spent = (convs ?? []).reduce((s: number, c: { gold_amount: number }) => s + c.gold_amount, 0);

    return earned - spent;
  }

  // ── join-cycle ────────────────────────────────────────────────────────────
  if (action === "join-cycle") {
    const levelId = await getUserLevel();
    if (!levelId) return json({ error: "An active membership is required to join a Gold Mine cycle." }, 400);

    const levelCfg = cfg.levelConfigs?.find((lc: { levelId: string }) => lc.levelId === levelId);
    if (!levelCfg) return json({ error: "Your membership level is not configured for Gold Mine cycles. Contact support." }, 400);

    const { cycleDays, goldReward, joinCost, maxActiveCycles } = levelCfg;

    // Check active cycle count
    const { count: activeCycleCount } = await svc
      .from("gold_mine_cycles")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "active");

    if ((activeCycleCount ?? 0) >= maxActiveCycles) {
      return json({ error: `You already have ${activeCycleCount} active cycle(s). Wait for one to complete before joining another.` }, 400);
    }

    // Deduct join cost from wallet if applicable
    if (joinCost > 0) {
      // Compute available balance
      const { data: credits } = await svc
        .from("wallet_transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("direction", "credit")
        .eq("status", "approved");
      const { data: debits } = await svc
        .from("wallet_transactions")
        .select("amount")
        .eq("user_id", user.id)
        .eq("direction", "debit")
        .neq("status", "rejected");

      const totalCredit = (credits ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const totalDebit  = (debits  ?? []).reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      const available = totalCredit - totalDebit;

      if (available < joinCost) {
        return json({ error: `Insufficient wallet balance. You need ₦${joinCost} to join this cycle but your balance is ₦${available}.` }, 400);
      }

      const txId  = crypto.randomUUID();
      const txRef = `EH-GM-JOIN-${Date.now().toString(36).toUpperCase()}`;
      const { error: txErr } = await svc.from("wallet_transactions").insert({
        id: txId, user_id: user.id, type: "gold_mine_join",
        direction: "debit", amount: joinCost, status: "approved",
        description: `Gold Mine cycle join fee (${cycleDays}-day cycle)`,
        reference: txRef, source_id: txId,
      });
      if (txErr) return json({ error: `Could not deduct join fee: ${txErr.message}` }, 500);
    }

    const now = new Date();
    const endsAt = new Date(now.getTime() + cycleDays * 24 * 60 * 60 * 1000);
    const cycleId = crypto.randomUUID();

    const { data: cycle, error: cycleErr } = await svc.from("gold_mine_cycles").insert({
      id: cycleId,
      user_id: user.id,
      level_id: levelId,
      gold_reward: goldReward,
      join_cost: joinCost,
      status: "active",
      started_at: now.toISOString(),
      ends_at: endsAt.toISOString(),
      gold_credited: false,
    }).select().maybeSingle();

    if (cycleErr) return json({ error: `Failed to create cycle: ${cycleErr.message}` }, 500);

    // Notification
    await svc.from("notifications").insert({
      id: crypto.randomUUID(), user_id: user.id, type: "system",
      title: "Gold Mine cycle started",
      body: `Your ${cycleDays}-day Gold Mine cycle has begun. You'll earn ${goldReward} gold coins when it completes on ${endsAt.toLocaleDateString("en-NG")}.`,
      read: false,
    });

    return json({ cycle });
  }

  // ── complete-cycles ───────────────────────────────────────────────────────
  // Called by the frontend on page load to process any matured cycles
  if (action === "complete-cycles") {
    const { data: matured } = await svc
      .from("gold_mine_cycles")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "active")
      .eq("gold_credited", false)
      .lte("ends_at", new Date().toISOString());

    const completed: unknown[] = [];
    for (const cycle of matured ?? []) {
      const { error: updErr } = await svc
        .from("gold_mine_cycles")
        .update({ status: "completed", completed_at: new Date().toISOString(), gold_credited: true })
        .eq("id", cycle.id);
      if (!updErr) {
        completed.push(cycle);
        await svc.from("notifications").insert({
          id: crypto.randomUUID(), user_id: user.id, type: "system",
          title: "Gold Mine cycle completed!",
          body: `Your ${cycle.gold_reward}-gold cycle has completed. The coins have been added to your Gold balance.`,
          read: false,
        });
      }
    }
    const goldBalance = await getGoldBalance(user.id);
    return json({ completed, goldBalance });
  }

  // ── request-conversion ────────────────────────────────────────────────────
  if (action === "request-conversion") {
    const goldAmount = Number(body.goldAmount);
    if (!Number.isInteger(goldAmount) || goldAmount <= 0) {
      return json({ error: "Gold amount must be a positive integer." }, 400);
    }

    if (goldAmount < cfg.minConversionGold) {
      return json({ error: `Minimum conversion is ${cfg.minConversionGold} gold coins.` }, 400);
    }

    // Check daily limit
    if (cfg.maxDailyConversions > 0) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await svc
        .from("gold_mine_conversions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .neq("status", "rejected")
        .gte("created_at", dayStart.toISOString());
      if ((todayCount ?? 0) >= cfg.maxDailyConversions) {
        return json({ error: "You've reached your daily conversion limit. Try again tomorrow." }, 400);
      }
    }

    // Check gold balance
    const balance = await getGoldBalance(user.id);
    if (balance < goldAmount) {
      return json({ error: `Insufficient gold balance. You have ${balance} gold coins but requested ${goldAmount}.` }, 400);
    }

    const grossCash = goldAmount * cfg.goldToCashRate;
    const feeAmount = Math.floor(grossCash * cfg.conversionFeePercent / 100);
    const cashAmount = grossCash - feeAmount;

    const reference = `EH-GM-CONV-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

    const { data: conversion, error: convErr } = await svc.from("gold_mine_conversions").insert({
      id: crypto.randomUUID(),
      user_id: user.id,
      gold_amount: goldAmount,
      cash_amount: cashAmount,
      fee_amount: feeAmount,
      status: "pending",
      reference,
    }).select().maybeSingle();

    if (convErr) return json({ error: `Failed to submit conversion: ${convErr.message}` }, 500);

    await svc.from("notifications").insert({
      id: crypto.randomUUID(), user_id: user.id, type: "system",
      title: "Gold conversion submitted",
      body: `Your request to convert ${goldAmount} gold coins to ₦${cashAmount.toLocaleString()} (after ${cfg.conversionFeePercent}% fee) is pending admin approval.`,
      read: false,
    });

    const newBalance = await getGoldBalance(user.id);
    return json({ conversion, goldBalance: newBalance });
  }

  return json({ error: "Unknown action" }, 400);
});
