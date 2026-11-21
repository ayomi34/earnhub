import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub Zentra edge function.
 * Handles three actions:
 *   join-cycle       — user joins a Zentra cycle (deducts join cost, creates cycle row)
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

  // Load settings from platform_settings (the actual config table)
  const { data: settingsRow } = await svc.from("platform_settings").select("payload").eq("id", true).maybeSingle();
  const cfg = settingsRow?.payload?.goldMine ?? {
    enabled: true,
    goldToCashRate: 10,
    minConversionGold: 50,
    conversionFeePercent: 5,
    maxDailyConversions: 1,
    levelConfigs: [],
  };

  if (!cfg.enabled) return json({ error: "Zentra is currently disabled." }, 403);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body." }, 400); }
  const action = body?.action as string;

  const { data: profile, error: profileError } = await svc
    .from("profiles").select("id, status").eq("id", user.id).maybeSingle();
  if (profileError || !profile) return json({ error: "Profile not found." }, 404);
  if (profile.status !== "active") return json({ error: "This account has been suspended." }, 403);

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
    if (!levelId) return json({ error: "An active membership is required to join a Zentra cycle." }, 400);

    const levelCfg = cfg.levelConfigs?.find((lc: { levelId: string }) => lc.levelId === levelId);
    if (!levelCfg) return json({ error: "Your membership level is not configured for Zentra cycles. Contact support." }, 400);

    const { cycleDays, goldReward, joinCost, maxActiveCycles } = levelCfg;
    if (![cycleDays, goldReward, joinCost, maxActiveCycles].every(Number.isFinite) ||
        cycleDays < 1 || goldReward < 1 || joinCost < 0 || maxActiveCycles < 1) {
      return json({ error: "Zentra level configuration is invalid. Contact support." }, 500);
    }
    const requestId = typeof body.requestId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
      ? body.requestId : crypto.randomUUID();
    const { data: cycle, error: joinError } = await svc.rpc("join_gold_mine_cycle", {
      p_user_id: user.id,
      p_level_id: levelId,
      p_cycle_days: Math.floor(cycleDays),
      p_gold_reward: Math.floor(goldReward),
      p_join_cost: Math.floor(joinCost),
      p_max_active_cycles: Math.floor(maxActiveCycles),
      p_request_id: requestId,
    });
    if (joinError) {
      console.error("[gold-mine] atomic join failed:", joinError.message);
      return json({ error: "Could not securely join this cycle. Please try again." }, 500);
    }
    if (cycle?.error) return json({ error: cycle.error }, Number(cycle.status) || 400);

    const createdCycle = cycle?.cycle;
    if (!createdCycle) return json({ error: "Failed to create cycle." }, 500);
    const endsAt = new Date(createdCycle.ends_at);
    await svc.from("notifications").insert({
      id: crypto.randomUUID(), user_id: user.id, type: "system",
      title: "Zentra cycle started",
      body: `Your ${cycleDays}-day Zentra cycle has begun. You'll earn ${goldReward} gold coins when it completes on ${endsAt.toLocaleDateString("en-NG")}.`,
      read: false,
    });
    return json({ cycle: createdCycle });
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

    // Load commission config from platform_settings (frontend settings table)
    const { data: platformSettingsRow } = await svc
      .from("platform_settings")
      .select("payload")
      .eq("id", true)
      .maybeSingle();
    const commissionCfg = platformSettingsRow?.payload?.referralCommissions ?? {
      zentraEnabled: true,
      zentraPercent: 10,
      membershipEnabled: true,
      membershipFlatAmount: 500,
    };

    // Find the referring user (if any) — one lookup per batch, not per cycle
    const { data: profileRow } = await svc
      .from("profiles")
      .select("referred_by")
      .eq("id", user.id)
      .maybeSingle();
    let referralRow: { id: string; referrer_id: string } | null = null;
    if (profileRow?.referred_by) {
      const { data: ref } = await svc
        .from("referrals")
        .select("id, referrer_id")
        .eq("referred_id", user.id)
        .eq("status", "active")
        .maybeSingle();
      referralRow = ref ?? null;
    }

    const completed: unknown[] = [];
    for (const cycle of matured ?? []) {
      const { data: claimedCycle, error: updErr } = await svc
        .from("gold_mine_cycles")
        .update({ status: "completed", completed_at: new Date().toISOString(), gold_credited: true })
        .eq("id", cycle.id)
        .eq("status", "active")
        .eq("gold_credited", false)
        .select()
        .maybeSingle();
      if (!updErr && claimedCycle) {
        completed.push(claimedCycle);
        await svc.from("notifications").insert({
          id: crypto.randomUUID(), user_id: user.id, type: "system",
          title: "Zentra cycle completed!",
          body: `Your ${cycle.gold_reward}-gold cycle has completed. The coins have been added to your Gold balance.`,
          read: false,
        });

        // ── Zentra referral commission ────────────────────────────────────
        if (commissionCfg.zentraEnabled && referralRow && cycle.gold_reward > 0) {
          const commissionAmount = Math.floor(cycle.gold_reward * commissionCfg.zentraPercent / 100);
          if (commissionAmount > 0) {
            // Idempotent: UNIQUE(source_id, commission_type) prevents duplicates
            const { error: commErr } = await svc.from("referral_commissions").insert({
              id: crypto.randomUUID(),
              referral_id: referralRow.id,
              referrer_id: referralRow.referrer_id,
              referred_id: user.id,
              commission_type: "zentra",
              amount: commissionAmount,
              currency: "ZNTR",
              source_id: cycle.id,
              status: "approved",
              description: `${commissionCfg.zentraPercent}% Zentra commission on ${cycle.gold_reward} ZNTR cycle`,
            });
            if (!commErr) {
              // Notify referrer
              await svc.from("notifications").insert({
                id: crypto.randomUUID(),
                user_id: referralRow.referrer_id,
                type: "referral",
                title: "Zentra commission earned!",
                body: `You earned ${commissionAmount} ZNTR as a referral commission — your referral completed a Zentra cycle.`,
                read: false,
              });
            }
          }
        }
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

    const rate = Number(cfg.goldToCashRate);
    const feePercent = Number(cfg.conversionFeePercent);
    const maxDailyConversions = Number(cfg.maxDailyConversions);
    if (!Number.isFinite(rate) || rate <= 0 || !Number.isFinite(feePercent) || feePercent < 0 || feePercent >= 100 ||
        !Number.isFinite(maxDailyConversions) || maxDailyConversions < 0) {
      return json({ error: "Zentra conversion configuration is invalid. Contact support." }, 500);
    }
    const requestId = typeof body.requestId === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId)
      ? body.requestId : crypto.randomUUID();
    const { data: result, error: conversionError } = await svc.rpc("request_gold_conversion", {
      p_user_id: user.id,
      p_gold_amount: goldAmount,
      p_gold_to_cash_rate: rate,
      p_fee_percent: feePercent,
      p_min_conversion_gold: Math.max(1, Math.floor(Number(cfg.minConversionGold) || 1)),
      p_max_daily_conversions: Math.floor(maxDailyConversions),
      p_request_id: requestId,
    });
    if (conversionError) {
      console.error("[gold-mine] atomic conversion failed:", conversionError.message);
      return json({ error: "Could not securely complete this conversion. Please try again." }, 500);
    }
    if (result?.error) return json({ error: result.error }, Number(result.status) || 400);
    if (!result?.conversion)
      return json({ error: "Conversion could not be recorded. Please contact support." }, 500);
    return json(result);
  }

  return json({ error: "Unknown action" }, 400);
});
