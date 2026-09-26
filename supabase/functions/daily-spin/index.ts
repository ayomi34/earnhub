import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub daily-spin edge function.
 * The wheel result is determined HERE, server-side, before the client
 * animation runs. All abuse vectors converge on the same checks:
 *  - refresh / new device / second browser -> same account row in `spins`
 *  - direct API calls -> every eligibility rule re-verified here
 *  - tampering with the frontend -> irrelevant, client only visualizes
 * Cash rewards are recorded as PENDING wallet credits; an admin approves
 * them from the dashboard before they become withdrawable. */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const DAY_MS = 24 * 60 * 60 * 1000;

/* Mirrors DEFAULT_SPIN_CONFIG in src/lib/db.ts — used when the platform
 * settings row has no spin section yet. */
const DEFAULT_SPIN = {
  enabled: true,
  requireVerified: true,
  requireMembership: false,
  dailyBudget: 50000,
  segments: [
    { label: "₦10", type: "cash", amount: 10, weight: 30, color: "#10b981" },
    { label: "₦20", type: "cash", amount: 20, weight: 24, color: "#059669" },
    { label: "₦50", type: "cash", amount: 50, weight: 16, color: "#047857" },
    { label: "₦100", type: "cash", amount: 100, weight: 10, color: "#d4af37" },
    { label: "₦150", type: "cash", amount: 150, weight: 6, color: "#b8860b" },
    { label: "₦200", type: "cash", amount: 200, weight: 4, color: "#f59e0b" },
    { label: "Bonus Task", type: "bonus_task", amount: 0, weight: 6, color: "#0ea5e9" },
    { label: "Try Again", type: "none", amount: 0, weight: 12, color: "#334155" },
  ],
} as const;

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

  const admin = createClient(supabaseUrl, serviceRoleKey);

  /* ---------- profile + eligibility ---------- */
  const { data: profile } = await admin
    .from("profiles").select("id, status").eq("id", user.id).maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 404);
  if (profile.status !== "active") return json({ error: "This account has been suspended." }, 403);

  const { data: settingsRow } = await admin
    .from("platform_settings").select("payload").eq("id", true).maybeSingle();
  const cfg: any = {
    ...structuredClone(DEFAULT_SPIN),
    ...((settingsRow?.payload as any)?.spin ?? {}),
  };
  if (cfg.enabled !== true) return json({ error: "The daily spin is currently unavailable." }, 403);
  if (!Array.isArray(cfg.segments) || cfg.segments.length < 2 || cfg.segments.length > 12)
    return json({ error: "The wheel is misconfigured. Contact support." }, 500);
  const validSegments = cfg.segments.every((seg: any) =>
    typeof seg?.label === "string" && seg.label.trim().length > 0 && seg.label.trim().length <= 24 &&
    ["cash", "bonus_task", "none"].includes(seg.type) &&
    Number.isFinite(Number(seg.amount)) && Number(seg.amount) >= (seg.type === "cash" ? 1 : 0) &&
    Number.isFinite(Number(seg.weight)) && Number(seg.weight) >= 1 && Number(seg.weight) <= 1000 &&
    /^#[0-9a-fA-F]{6}$/.test(String(seg.color ?? ""))
  );
  if (!validSegments) return json({ error: "The wheel is misconfigured. Contact support." }, 500);

  if (cfg.requireVerified === true && !user.email_confirmed_at)
    return json({ error: "Verify your email address to unlock the daily spin." }, 403);

  if (cfg.requireMembership === true) {
    const { data: membership } = await admin
      .from("memberships").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
    if (!membership) return json({ error: "An active membership is required to spin." }, 403);
  }

  /* ---------- one spin per 24h (server-enforced) ---------- */
  const { data: lastSpin } = await admin
    .from("spins").select("created_at").eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let lastNextSpinAt: string | null = null;
  if (lastSpin) {
    const last = new Date(lastSpin.created_at).getTime();
    lastNextSpinAt = new Date(last + DAY_MS).toISOString();
    if (Date.now() - last < DAY_MS)
      return json({ error: "Your next free spin is not ready yet.", nextSpinAt: lastNextSpinAt }, 429);
  }

  /* ---------- platform-wide daily budget ---------- */
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const { data: todays } = await admin
    .from("spins")
    .select("amount")
    .eq("reward_type", "cash")
    .in("status", ["pending", "approved"])
    .gte("created_at", dayStart.toISOString());
  const dailyBudget = Number(cfg.dailyBudget);
  const awardedToday = (todays ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  if (dailyBudget > 0 && awardedToday >= dailyBudget)
    return json({ error: "Today's reward budget has been reached. Come back tomorrow!" }, 429);

  /* ---------- secure weighted random result ---------- */
  const segments: any[] = cfg.segments;
  const totalWeight = segments.reduce((s, seg) => s + Math.max(0, Number(seg.weight || 0)), 0);
  if (totalWeight <= 0) return json({ error: "The wheel is misconfigured. Contact support." }, 500);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let roll = (buf[0] / 4294967296) * totalWeight;
  let segmentIndex = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    roll -= Math.max(0, Number(segments[i].weight || 0));
    if (roll < 0) { segmentIndex = i; break; }
  }
  const segment = segments[segmentIndex];
  const rewardType = ["cash", "bonus_task", "none"].includes(segment?.type) ? segment.type : "none";
  const amount = rewardType === "cash" ? Math.max(0, Math.floor(Number(segment.amount || 0))) : 0;
  const status = rewardType === "cash" ? "pending" : rewardType === "bonus_task" ? "approved" : "none";
  const reference = `EH-SPIN-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  /* ---------- record spin (audit: ip + user agent) ---------- */
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;
  const { data: spin, error: spinError } = await admin.from("spins").insert({
    user_id: user.id,
    segment_index: segmentIndex,
    label: String(segment.label ?? "—"),
    reward_type: rewardType,
    amount,
    status,
    reference,
    ip,
    user_agent: userAgent,
  }).select().single();
  if (spinError || !spin) return json({ error: spinError?.message || "Could not record the spin" }, 500);

  /* ---------- cash -> pending wallet credit (idempotent via source_id) ---------- */
  let walletTx = null;
  if (rewardType === "cash" && amount > 0) {
    const { data: tx } = await admin.from("wallet_transactions").insert({
      user_id: user.id,
      type: "spin_reward",
      direction: "credit",
      amount,
      status: "pending",
      description: "Daily spin reward",
      reference,
      source_id: spin.id,
    }).select().single();
    walletTx = tx ?? null;
  }

  await admin.from("notifications").insert({
    user_id: user.id,
    type: "system",
    title: rewardType === "cash" && amount > 0 ? "Daily spin reward" : "Daily spin",
    body: rewardType === "cash" && amount > 0
      ? `You won ${segment.label} on the daily spin. Reference ${reference}. The reward is pending review and will be credited once approved.`
      : rewardType === "bonus_task"
      ? "You won a bonus task slot on the daily spin. One extra task is available to you today."
      : "No reward this time — your next free spin is available in 24 hours.",
  });

  return json({
    spin,
    walletTx,
    segmentIndex,
    label: segment.label,
    rewardType,
    amount,
    reference,
    nextSpinAt: new Date(Date.now() + DAY_MS).toISOString(),
  });
});