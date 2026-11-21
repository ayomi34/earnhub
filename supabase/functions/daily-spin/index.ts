import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub daily-spin edge function.
 * The wheel result is determined HERE, server-side, before the client
 * animation runs. All abuse vectors converge on the same checks:
 *  - refresh / new device / second browser -> same account row in `spins`
 *  - direct API calls -> every eligibility rule re-verified here
 *  - tampering with the frontend -> irrelevant, client only visualizes
 * Cash rewards and wallet credits are committed together by a service-role
 * database RPC after the eligibility, cooldown, and budget checks pass. */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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

  const { data: membership } = await admin
    .from("memberships").select("id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return json({ error: "An active membership is required to spin." }, 403);

  const { data: settingsRow } = await admin
    .from("platform_settings").select("payload").eq("id", true).maybeSingle();
  const cfg: any = {
    ...structuredClone(DEFAULT_SPIN),
    ...((settingsRow?.payload as any)?.spin ?? {}),
  };
  if (cfg.enabled !== true) return json({ error: "The daily spin is currently unavailable." }, 403);
  const dailyBudget = Number(cfg.dailyBudget);
  if (!Number.isSafeInteger(dailyBudget) || dailyBudget < 0)
    return json({ error: "The wheel is misconfigured. Contact support." }, 500);
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
  const reference = `EH-SPIN-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  /* All limits and writes execute under a database lock in one transaction.
   * This prevents parallel requests from double-spinning or exceeding budget. */
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const userAgent = (req.headers.get("user-agent") || "").slice(0, 200) || null;
  const { data: result, error: commitError } = await admin.rpc("commit_daily_spin", {
    p_user_id: user.id,
    p_segment_index: segmentIndex,
    p_label: String(segment.label ?? "—"),
    p_reward_type: rewardType,
    p_amount: amount,
    p_reference: reference,
    p_require_verified: cfg.requireVerified === true,
    p_daily_budget: dailyBudget,
    p_ip: ip,
    p_user_agent: userAgent,
  });
  if (commitError) {
    console.error("[daily-spin] atomic commit failed:", commitError.message);
    return json({ error: "Could not securely record your spin. Please try again." }, 500);
  }
  if (result?.error) return json({ error: result.error }, Number(result.status) || 400);
  return json(result);
});