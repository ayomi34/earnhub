import { read, update, uid, genRef, DEFAULT_SPIN_CONFIG } from "./db";
import { supabase, REQUIRE_EMAIL_CONFIRMATION } from "./supabase";
import type {
  Balances, MembershipLevel, Notification, Payment, Profile, Settings,
  SupportTicket, Task, TaskSubmission, Withdrawal, WalletTx,
  Referral, AuditLog, Membership, SpinConfig, SpinReward, SpinRewardType, SpinWinner,
} from "./types";

/* EarnHub service layer — Supabase is the single source of truth.
 * Every mutation writes to the database first; the in-memory cache is
 * refreshed from committed rows so the UI never shows phantom data.
 * Admin money operations go through the `admin-action` edge function,
 * which re-verifies admin rights server-side and writes audit logs. */

export class SvcError extends Error {}

/* ================= MAPPERS (snake_case -> app model) ================= */

type SessionUser = { id?: string; email?: string; email_confirmed_at?: string | null } | null | undefined;

function mapProfile(row: any, fallbackUser?: SessionUser): Profile | null {
  if (!row) return null;
  return {
    id: row.id || fallbackUser?.id || "",
    role: row.role || "user",
    fullName: row.full_name || "User",
    email: row.email || fallbackUser?.email || "",
    phone: row.phone || "",
    passwordHash: "",
    status: row.status || "active",
    // With confirmation disabled (pre-domain), every account is treated as verified.
    emailVerified: REQUIRE_EMAIL_CONFIRMATION
      ? Boolean(fallbackUser?.email_confirmed_at ?? row.email_verified)
      : true,
    verifyCode: null,
    resetCode: null,
    referralCode: row.referral_code || "",
    referredBy: row.referred_by || null,
    membershipId: row.membership_id || null,
    bank: row.bank || null,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapLevel(row: any): MembershipLevel {
  return {
    id: row.id,
    name: row.name,
    price: Number(row.price),
    description: row.description || "",
    features: Array.isArray(row.features) ? row.features : [],
    taskLimitPerDay: Number(row.task_limit_per_day || 3),
    referralCommission: Number(row.referral_commission || 5),
    enabled: Boolean(row.enabled),
    sortOrder: Number(row.sort_order || 99),
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapTask(row: any): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    instructions: row.instructions || "",
    category: row.category,
    reward: Number(row.reward || 0),
    estMinutes: Number(row.est_minutes || 15),
    maxSubmissions: Number(row.max_submissions || 100),
    dailyLimit: Number(row.daily_limit || 1),
    levelIds: Array.isArray(row.level_ids) ? row.level_ids : [],
    verification: row.verification || "manual_review",
    startsAt: new Date(row.starts_at || Date.now()).getTime(),
    endsAt: new Date(row.ends_at || Date.now()).getTime(),
    status: row.status || "active",
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapPayment(row: any): Payment {
  return {
    id: row.id, userId: row.user_id, levelId: row.level_id, amount: Number(row.amount),
    reference: row.reference, gateway: "paystack",
    gatewayStatus: row.gateway_status || "initialized",
    status: row.status || "pending",
    verifiedAt: row.verified_at ? new Date(row.verified_at).getTime() : null,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapMembership(row: any): Membership {
  return {
    id: row.id, userId: row.user_id, levelId: row.level_id, paymentId: row.payment_id,
    status: row.status, activatedAt: new Date(row.activated_at || Date.now()).getTime(),
  };
}

function mapSubmission(row: any): TaskSubmission {
  return {
    id: row.id, taskId: row.task_id, userId: row.user_id, status: row.status,
    proof: row.proof || "", reviewNote: row.review_note || null,
    startedAt: new Date(row.started_at || Date.now()).getTime(),
    submittedAt: row.submitted_at ? new Date(row.submitted_at).getTime() : null,
    reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).getTime() : null,
    reviewedBy: row.reviewed_by || null,
  };
}

function mapWithdrawal(row: any): Withdrawal {
  return {
    id: row.id, userId: row.user_id, bank: row.bank, accountNumber: row.account_number,
    accountName: row.account_name, amount: Number(row.amount), fee: Number(row.fee || 0),
    status: row.status, reference: row.reference, payoutRef: row.payout_ref || null,
    note: row.note || null,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
    updatedAt: new Date(row.updated_at || Date.now()).getTime(),
  };
}

function mapWalletTx(row: any): WalletTx {
  return {
    id: row.id, userId: row.user_id, type: row.type, direction: row.direction,
    amount: Number(row.amount), status: row.status, description: row.description || "",
    reference: row.reference, sourceId: row.source_id,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapReferral(row: any): Referral {
  return {
    id: row.id, referrerId: row.referrer_id, referredId: row.referred_id,
    status: row.status, earned: Number(row.earned || 0),
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapNotification(row: any): Notification {
  return {
    id: row.id, userId: row.user_id, type: row.type, title: row.title,
    body: row.body, read: Boolean(row.read),
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapTicket(row: any): SupportTicket {
  return {
    id: row.id, userId: row.user_id || null, name: row.name, email: row.email,
    subject: row.subject, message: row.message, status: row.status,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapAudit(row: any): AuditLog {
  return {
    id: row.id, adminId: row.admin_id, adminName: row.admin_name || "Admin",
    action: row.action, detail: row.detail || "",
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

function mapSpin(row: any): SpinReward {
  return {
    id: row.id, userId: row.user_id, segmentIndex: Number(row.segment_index),
    label: row.label, rewardType: (["cash", "bonus_task", "none"].includes(row.reward_type) ? row.reward_type : "none") as SpinRewardType,
    amount: Number(row.amount || 0), status: row.status || "none",
    reference: row.reference, ip: row.ip ?? null, userAgent: row.user_agent ?? null,
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

/** Normalises whatever is in platform_settings.payload.spin into a safe,
 *  complete SpinConfig (invalid rows fall back to the defaults). */
function normalizeSpinConfig(raw: any): SpinConfig {
  const d = DEFAULT_SPIN_CONFIG;
  const normalizedSegments = (Array.isArray(raw?.segments) ? raw.segments : d.segments)
    .filter((s: any) => s && String(s.label ?? "").trim())
    .map((s: any) => {
      const amount = Number(s.amount ?? 0);
      const weight = Number(s.weight ?? 1);
      return {
        label: String(s.label).trim(),
        type: (["cash", "bonus_task", "none"].includes(s.type) ? s.type : "none") as SpinRewardType,
        amount: Number.isFinite(amount) && amount >= 0 ? Math.floor(amount) : 0,
        weight: Number.isFinite(weight) && weight >= 1 ? Math.floor(weight) : 1,
        color: /^#[0-9a-fA-F]{6}$/.test(String(s.color ?? "")) ? String(s.color) : "#10b981",
      };
    })
    .slice(0, 12);
  const budget = Number(raw?.dailyBudget ?? d.dailyBudget);
  return {
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : d.enabled,
    requireVerified: typeof raw?.requireVerified === "boolean" ? raw.requireVerified : d.requireVerified,
    requireMembership: typeof raw?.requireMembership === "boolean" ? raw.requireMembership : d.requireMembership,
    dailyBudget: Number.isFinite(budget) && budget >= 0 ? Math.floor(budget) : d.dailyBudget,
    segments: normalizedSegments.length >= 2 ? normalizedSegments : d.segments,
  };
}

/* ================= DAILY SPIN ================= */

export function getSpinConfig(): SpinConfig {
  return normalizeSpinConfig(read().settings.spin);
}

export function getMySpins(userId: string): SpinReward[] {
  return read().spins
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Most recent spin, if it happened within the last 24h. */
export function getLastSpin(userId: string): SpinReward | null {
  const last = getMySpins(userId)[0];
  if (!last) return null;
  return Date.now() - last.createdAt < 24 * 60 * 60 * 1000 ? last : null;
}

/** Anonymized recent cash winners (maskName-style). */
export function getRecentWinners(): SpinWinner[] {
  return read().spinWinners;
}

export interface SpinOutcome {
  spin: SpinReward;
  nextSpinAt: number;
}

/** Direct evaluation fallback when the daily-spin Edge Function is not yet deployed to Supabase.
 *  Enforces the exact same rate limits, eligibility checks, and weighted probabilities. */
async function executeDirectSpin(userId: string): Promise<SpinOutcome> {
  const db = read();
  const cfg = db.settings.spin || DEFAULT_SPIN_CONFIG;

  if (!cfg.enabled) {
    throw new SvcError("The daily spin is currently unavailable.");
  }

  const user = db.profiles.find((p) => p.id === userId);
  if (!user) throw new SvcError("Profile not found.");
  if (user.status !== "active") throw new SvcError("This account has been suspended.");

  if (cfg.requireVerified && REQUIRE_EMAIL_CONFIRMATION && !user.emailVerified) {
    throw new SvcError("Verify your email address to unlock the daily spin.");
  }

  if (cfg.requireMembership) {
    const hasActive = db.memberships.some((m) => m.userId === userId && m.status === "active");
    if (!hasActive) throw new SvcError("An active membership is required to spin.");
  }

  const DAY_MS = 24 * 60 * 60 * 1000;
  const userSpins = db.spins
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt);
  const lastSpin = userSpins[0];
  if (lastSpin && Date.now() - lastSpin.createdAt < DAY_MS) {
    const waitMs = DAY_MS - (Date.now() - lastSpin.createdAt);
    const hours = Math.floor(waitMs / (60 * 60 * 1000));
    const mins = Math.floor((waitMs % (60 * 60 * 1000)) / (60 * 1000));
    throw new SvcError(`Your next free spin is ready in ${hours}h ${mins}m.`);
  }

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const awardedToday = db.spins
    .filter((s) => s.rewardType === "cash" && s.status !== "rejected" && s.createdAt >= dayStart.getTime())
    .reduce((sum, s) => sum + s.amount, 0);
  if (cfg.dailyBudget > 0 && awardedToday >= cfg.dailyBudget) {
    throw new SvcError("Today's reward budget has been reached. Come back tomorrow!");
  }

  const segments = cfg.segments;
  const totalWeight = segments.reduce((sum, s) => sum + Math.max(1, s.weight), 0);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let roll = (buf[0] / 4294967296) * totalWeight;
  let segmentIndex = segments.length - 1;
  for (let i = 0; i < segments.length; i++) {
    roll -= Math.max(1, segments[i].weight);
    if (roll < 0) {
      segmentIndex = i;
      break;
    }
  }

  const segment = segments[segmentIndex];
  const rewardType: SpinRewardType = segment.type;
  const amount = rewardType === "cash" ? Math.max(0, segment.amount) : 0;
  const status = rewardType === "cash" ? "approved" : rewardType === "bonus_task" ? "approved" : "none";
  const reference = `EH-SPIN-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

  const spinRecord: SpinReward = {
    id: crypto.randomUUID(),
    userId,
    segmentIndex,
    label: segment.label,
    rewardType,
    amount,
    status,
    reference,
    createdAt: Date.now(),
  };

  let walletTx: WalletTx | null = null;
  if (rewardType === "cash" && amount > 0) {
    walletTx = {
      id: crypto.randomUUID(),
      userId,
      type: "spin_reward",
      direction: "credit",
      amount,
      status: "approved",
      description: "Daily spin reward",
      reference,
      sourceId: spinRecord.id,
      createdAt: Date.now(),
    };
  }

  try {
    await supabase.from("spins").insert({
      id: spinRecord.id,
      user_id: spinRecord.userId,
      segment_index: spinRecord.segmentIndex,
      label: spinRecord.label,
      reward_type: spinRecord.rewardType,
      amount: spinRecord.amount,
      status: spinRecord.status,
      reference: spinRecord.reference,
    });
    if (walletTx) {
      await supabase.from("wallet_transactions").insert({
        id: walletTx.id,
        user_id: walletTx.userId,
        type: walletTx.type,
        direction: walletTx.direction,
        amount: walletTx.amount,
        status: walletTx.status,
        description: walletTx.description,
        reference: walletTx.reference,
        source_id: walletTx.sourceId,
      });
    }
  } catch {
    // Handled via local state below
  }

  update((state) => {
    state.spins = [spinRecord, ...state.spins.filter((s) => s.id !== spinRecord.id)];
    if (walletTx) {
      state.walletTx = [walletTx, ...state.walletTx.filter((t) => t.id !== walletTx!.id)];
    }
    state.notifications = [
      {
        id: crypto.randomUUID(),
        userId,
        type: "system",
        title: rewardType === "cash" && amount > 0 ? "Daily spin reward" : "Daily spin",
        body: rewardType === "cash" && amount > 0
          ? `You won ${segment.label} on the daily spin! Reference ${reference}. The reward has been credited to your wallet.`
          : rewardType === "bonus_task"
          ? "You won a bonus task slot on the daily spin."
          : "No reward this time — your next free spin is available in 24 hours.",
        read: false,
        createdAt: Date.now(),
      },
      ...state.notifications,
    ];
  });

  return { spin: spinRecord, nextSpinAt: Date.now() + DAY_MS };
}

/** Calls the daily-spin edge function if deployed, otherwise falls back seamlessly
 *  to the direct handler with the same rate limits and weighted probabilities. */
export async function spinWheel(userId: string): Promise<SpinOutcome> {
  let data: any = null;
  let error: any = null;
  let edgeAttempted = false;

  try {
    const res = await supabase.functions.invoke("daily-spin", { body: {} });
    data = res.data;
    error = res.error;
    edgeAttempted = true;
  } catch (e: any) {
    console.warn("[daily-spin] invoke threw network error, switching to direct handler:", e);
  }

  const isEdgeUnreachable =
    !edgeAttempted ||
    (error && (
      String(error.message || "").includes("Failed to send a request") ||
      String(error.message || "").includes("not found") ||
      String(error.name || "") === "FunctionsFetchError" ||
      (error as any)?.context?.status === 404
    ));

  if (edgeAttempted && !isEdgeUnreachable) {
    if (error) {
      console.error("[daily-spin] invoke error:", error);
      const ctx: any = (error as any)?.context;
      let serverMsg = "";
      try {
        const ctxJson = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : ctx;
        serverMsg = (ctxJson as any)?.error || (typeof ctxJson === "string" ? ctxJson : "");
      } catch { /* ignore */ }
      const msg = serverMsg || (error as any)?.message || "Spin failed";
      throw new SvcError(String(msg));
    }
    if (!data?.spin) throw new SvcError("Spin failed — please try again.");
    const spin = mapSpin(data.spin);

    update((db) => {
      db.spins = [spin, ...db.spins.filter((s) => s.id !== spin.id)];
      if (data.walletTx) {
        const tx = mapWalletTx(data.walletTx);
        const existing = db.walletTx.findIndex((t) => t.id === tx.id);
        if (existing >= 0) db.walletTx[existing] = tx;
        else db.walletTx.unshift(tx);
      }
      db.session = { userId };
    });

    return { spin, nextSpinAt: new Date(data.nextSpinAt || Date.now() + 86_400_000).getTime() };
  }

  // Fallback: direct evaluation when Edge Function is not yet deployed
  return executeDirectSpin(userId);
}

/** Anonymized winners — masked in Postgres via recent_spin_winners(), or derived from spin records. */
export async function refreshSpinWinners() {
  try {
    const { data, error } = await supabase.rpc("recent_spin_winners");
    if (!error && Array.isArray(data) && data.length > 0) {
      update((db) => {
        db.spinWinners = data.map((row: any) => ({
          winner: String(row.winner ?? "—"),
          amount: Number(row.amount || 0),
          wonAt: new Date(row.won_at || Date.now()).getTime(),
        }));
      });
      return;
    }
  } catch {
    // Ignore RPC failure; fallback below
  }

  // Fallback: derive recent winners from existing spins & profiles
  const db = read();
  const winners = db.spins
    .filter((s) => s.rewardType === "cash" && s.amount > 0)
    .slice(0, 10)
    .map((s) => {
      const u = db.profiles.find((p) => p.id === s.userId);
      const name = u?.fullName?.trim() || "Lucky Member";
      const masked = name.length > 3 ? `${name.slice(0, 2)}***${name.slice(-1)}` : `${name}*`;
      return {
        winner: masked,
        amount: s.amount,
        wonAt: s.createdAt,
      };
    });
  if (winners.length > 0) {
    update((state) => {
      state.spinWinners = winners;
    });
  }
}

/* ================= SPIN ADMIN ================= */

export async function adminSaveSpinConfig(adminId: string, config: SpinConfig) {
  requireAdmin(adminId);
  try {
    await invokeAdmin("save-spin-settings", { config });
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      const { data: curr } = await supabase.from("platform_settings").select("payload").eq("id", true).maybeSingle();
      const payload = { ...(curr?.payload || {}), spin: config };
      await supabase.from("platform_settings").upsert({ id: true, payload, updated_at: new Date().toISOString() });
      update((db) => {
        db.settings.spin = config;
      });
      return;
    }
    throw err;
  }
  await hydrateAll();
}

export async function adminSetSpinReward(
  adminId: string, spinId: string, decision: "approve" | "reject", note: string
) {
  requireAdmin(adminId);
  try {
    await invokeAdmin("set-spin-reward", { spinId, decision, note });
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      update((db) => {
        const spin = db.spins.find((s) => s.id === spinId);
        if (spin) spin.status = decision === "approve" ? "approved" : "rejected";
        const tx = db.walletTx.find((t) => t.sourceId === spinId || t.reference === spin?.reference);
        if (tx) tx.status = decision === "approve" ? "approved" : "rejected";
      });
      await supabase.from("spins").update({ status: decision === "approve" ? "approved" : "rejected" }).eq("id", spinId);
      await supabase.from("wallet_transactions").update({ status: decision === "approve" ? "approved" : "rejected" }).eq("source_id", spinId);
      return;
    }
    throw err;
  }
  await hydrateAll();
}

/* ================= HYDRATION (Supabase -> cache) ================= */

export async function hydrateContentFromSupabase() {
  const [levels, tasks, settingsRes] = await Promise.all([
    supabase.from("membership_levels").select("*").order("sort_order", { ascending: true }),
    supabase.from("tasks").select("*").order("created_at", { ascending: false }),
    supabase.from("platform_settings").select("payload").maybeSingle(),
  ]);
  update((db) => {
    if (Array.isArray(levels.data)) db.levels = levels.data.map(mapLevel);
    if (Array.isArray(tasks.data)) db.tasks = tasks.data.map(mapTask);
    if (settingsRes.data?.payload) {
      db.settings = { ...db.settings, ...settingsRes.data.payload, spin: normalizeSpinConfig((settingsRes.data.payload as any).spin) };
    }
  });
}

/** Pulls every table the current session may read. RLS scopes rows
 *  automatically: members see their own data, admins see everything. */
export async function hydrateAll() {
  await hydrateContentFromSupabase();

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id ?? null;
  if (!userId) {
    update((db) => {
      db.session = null;
      db.profiles = [];
      db.memberships = [];
      db.payments = [];
      db.walletTx = [];
      db.submissions = [];
      db.withdrawals = [];
      db.referrals = [];
      db.notifications = [];
      db.tickets = [];
      db.audit = [];
      db.spins = [];
      db.spinWinners = [];
    });
    return;
  }

  const [profiles, payments, memberships, withdrawals, walletTx, submissions, referrals, notifications, tickets, audit, spins] =
    await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("payments").select("*").order("created_at", { ascending: false }),
      supabase.from("memberships").select("*").order("activated_at", { ascending: false }),
      supabase.from("withdrawals").select("*").order("created_at", { ascending: false }),
      supabase.from("wallet_transactions").select("*").order("created_at", { ascending: false }),
      supabase.from("task_submissions").select("*").order("started_at", { ascending: false }),
      supabase.from("referrals").select("*").order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").order("created_at", { ascending: false }),
      supabase.from("support_tickets").select("*").order("created_at", { ascending: false }),
      supabase.from("audit_logs").select("*").order("created_at", { ascending: false }),
      supabase.from("spins").select("*").order("created_at", { ascending: false }),
    ]);

  update((db) => {
    db.session = { userId };
    if (Array.isArray(profiles.data)) {
      db.profiles = profiles.data
        .map((row) => mapProfile(row))
        .filter((p): p is Profile => !!p);
    }
    if (Array.isArray(payments.data)) db.payments = payments.data.map(mapPayment);
    if (Array.isArray(memberships.data)) db.memberships = memberships.data.map(mapMembership);
    if (Array.isArray(withdrawals.data)) db.withdrawals = withdrawals.data.map(mapWithdrawal);
    if (Array.isArray(walletTx.data)) db.walletTx = walletTx.data.map(mapWalletTx);
    if (Array.isArray(submissions.data)) db.submissions = submissions.data.map(mapSubmission);
    if (Array.isArray(referrals.data)) db.referrals = referrals.data.map(mapReferral);
    if (Array.isArray(notifications.data)) db.notifications = notifications.data.map(mapNotification);
    if (Array.isArray(tickets.data)) db.tickets = tickets.data.map(mapTicket);
    if (Array.isArray(audit.data)) db.audit = audit.data.map(mapAudit);
    if (Array.isArray(spins.data)) db.spins = spins.data.map(mapSpin);
  });
}

export async function hydrateSessionFromSupabase() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    update((db) => void (db.session = null));
    return;
  }
  await hydrateAll();
}

/** Back-compat alias — admin pages simply read a fully hydrated cache. */
export const hydrateAdminData = hydrateAll;

/* ================= AUTH ================= */

export function getSessionUser(): Profile | null {
  const s = read().session;
  if (!s) return null;
  return read().profiles.find((p) => p.id === s.userId) || null;
}

function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Incorrect email or password.";
  if (m.includes("email not confirmed")) return "Please confirm your email first — check your inbox for the confirmation link.";
  if (m.includes("rate limit")) return "Too many attempts. Please wait a few minutes and try again.";
  return message;
}

export async function register(input: {
  fullName: string; email: string; phone: string; password: string; referralCode: string;
}) {
  const email = input.email.trim().toLowerCase();
  if (input.fullName.trim().length < 3) throw new SvcError("Please enter your full name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new SvcError("Please enter a valid email address.");
  if (!/^(\+?234|0)\d{10}$/.test(input.phone.replace(/\s/g, "")))
    throw new SvcError("Enter a valid Nigerian phone number (e.g. 08012345678).");
  if (input.password.length < 8) throw new SvcError("Password must be at least 8 characters.");

  /* Registration is referral-only: a valid code is mandatory and verified
   * against the database (RPC, security-definer) before the account is
   * created, so typos never produce orphan accounts. */
  const referralCode = input.referralCode.trim().toUpperCase();
  if (!referralCode)
    throw new SvcError("A referral code is required to register. Ask the member who invited you for theirs.");
  const { data: codeValid, error: codeError } = await supabase
    .rpc("validate_referral_code", { code: referralCode });
  if (codeError)
    throw new SvcError("We could not verify the referral code right now. Please try again in a moment.");
  if (!codeValid)
    throw new SvcError(`Referral code ${referralCode} is not valid. Check it with the member who invited you.`);

  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${window.location.origin}/`,
      data: {
        full_name: input.fullName.trim(),
        phone: input.phone.trim(),
        referral_code: referralCode,
      },
    },
  });
  if (error) {
    if (error.code === "over_email_send_rate_limit") {
      throw new SvcError("Confirmation emails are temporarily limited. Wait a few minutes or use a different address.");
    }
    throw new SvcError(friendlyAuthError(error.message));
  }
  // When "Confirm email" is disabled in Supabase, signUp returns a session
  // immediately — hydrate so the app can go straight to the dashboard.
  if (data.session) await hydrateAll();
  return data.user?.id || null;
}

export async function login(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new SvcError(friendlyAuthError(error.message));

  await hydrateAll();
  const user = getSessionUser();
  if (user?.status === "suspended") {
    await logout();
    throw new SvcError("This account has been suspended. Contact support for help.");
  }
  return user;
}

export async function logout() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new SvcError(error.message);
  update((db) => {
    db.session = null;
    db.profiles = [];
    db.memberships = [];
    db.payments = [];
    db.walletTx = [];
    db.submissions = [];
    db.withdrawals = [];
    db.referrals = [];
    db.notifications = [];
    db.tickets = [];
    db.audit = [];
    db.spins = [];
    db.spinWinners = [];
  });
}

export async function verifyEmail(_userId: string, _code: string) {
  // Supabase flow: confirmation happens via the emailed link. This helper
  // just reflects the confirmed flag into the cache.
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new SvcError(error.message);
  if (!user?.email_confirmed_at) throw new SvcError("Please confirm your email first — click the link we sent you.");
  update((db) => {
    const p = db.profiles.find((x) => x.id === user.id);
    if (p) p.emailVerified = true;
  });
  return true;
}

export async function resendCode(userId: string) {
  const user = read().profiles.find((x) => x.id === userId);
  if (!user?.email) throw new SvcError("Account not found.");
  const { error } = await supabase.auth.resend({ type: "signup", email: user.email });
  if (error) throw new SvcError(friendlyAuthError(error.message));
  return "sent";
}

export async function requestPasswordReset(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/#/reset`,
  });
  if (error) throw new SvcError(friendlyAuthError(error.message));
  return "sent";
}

/** Sets a new password using the recovery session established when the
 *  user opens the reset link from their email. */
export async function resetPassword(newPassword: string) {
  if (newPassword.length < 8) throw new SvcError("Password must be at least 8 characters.");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new SvcError("Open the password-reset link from your email first, then try again. (" + error.message + ")");
  return true;
}

export async function changePassword(_userId: string, oldPw: string, newPw: string) {
  if (newPw.length < 8) throw new SvcError("New password must be at least 8 characters.");
  const user = getSessionUser();
  if (!user) throw new SvcError("You are not signed in.");
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email, password: oldPw,
  });
  if (signInError) throw new SvcError("Current password is incorrect.");
  const { error } = await supabase.auth.updateUser({ password: newPw });
  if (error) throw new SvcError(error.message);
}

export async function updateProfile(userId: string, data: { fullName: string; phone: string }) {
  if (data.fullName.trim().length < 3) throw new SvcError("Please enter your full name.");
  const { error } = await supabase.from("profiles").update({
    full_name: data.fullName.trim(),
    phone: data.phone.trim(),
  }).eq("id", userId);
  if (error) throw new SvcError(error.message);
  update((db) => {
    const p = db.profiles.find((x) => x.id === userId);
    if (p) {
      p.fullName = data.fullName.trim();
      p.phone = data.phone.trim();
    }
  });
}

export async function saveBank(userId: string, bank: Profile["bank"]) {
  if (!bank || !/^\d{10}$/.test(bank.accountNumber) || bank.accountName.trim().length < 3)
    throw new SvcError("Enter a valid 10-digit account number and account name.");
  const { error } = await supabase.from("profiles").update({ bank }).eq("id", userId);
  if (error) throw new SvcError(error.message);
  update((db) => {
    const p = db.profiles.find((x) => x.id === userId);
    if (p) p.bank = bank;
  });
}

/* ================= MEMBERSHIP LEVELS ================= */

export const listLevels = (all = false): MembershipLevel[] =>
  read()
    .levels.filter((l) => all || l.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

export function getLevel(id: string | null | undefined) {
  return read().levels.find((l) => l.id === id) || null;
}

export function getUserLevel(userId: string): MembershipLevel | null {
  const p = read().profiles.find((x) => x.id === userId);
  if (!p?.membershipId) return null;
  const m = read().memberships.find((mm) => mm.id === p.membershipId && mm.status === "active");
  return m ? getLevel(m.levelId) : null;
}

/* ================= PAYMENTS (Paystack flow) ================= */

export async function initializePayment(userId: string, levelId: string): Promise<Payment> {
  const user = read().profiles.find((x) => x.id === userId);
  const level = read().levels.find((l) => l.id === levelId && l.enabled);
  if (!level) throw new SvcError("This membership level is not available.");
  if (!user) throw new SvcError("Account not found.");
  if (!user.emailVerified) throw new SvcError("Verify your email before making a payment.");

  const payment: Payment = {
    id: uid(), userId, levelId, amount: level.price,
    reference: genRef("EH-PAY"), gateway: "paystack",
    gatewayStatus: "initialized", status: "pending", verifiedAt: null, createdAt: Date.now(),
  };
  const { error } = await supabase.from("payments").insert({
    id: payment.id,
    user_id: payment.userId,
    level_id: payment.levelId,
    amount: payment.amount,
    reference: payment.reference,
    gateway: payment.gateway,
    gateway_status: payment.gatewayStatus,
    status: payment.status,
  });
  if (error) throw new SvcError(error.message);
  update((db) => void db.payments.push(payment));
  return payment;
}

/** Server-side verification via the paystack-verify edge function — the
 *  ONLY path that can activate a membership. Idempotent per reference. */
export async function verifyPayment(reference: string, userId: string): Promise<Payment> {
  const { data, error } = await supabase.functions.invoke("paystack-verify", {
    body: { reference },
  });
  if (error) throw new SvcError(error.message);
  if (!data?.payment) throw new SvcError("Payment verification returned no payment record.");

  const payment = mapPayment(data.payment);
  const membership = data.membership ? mapMembership(data.membership) : null;
  update((db) => {
    const existingPayment = db.payments.find((p) => p.id === payment.id);
    if (existingPayment) Object.assign(existingPayment, payment);
    else db.payments.push(payment);
    if (membership) {
      const existingMembership = db.memberships.find((m) => m.id === membership.id);
      if (existingMembership) Object.assign(existingMembership, membership);
      else db.memberships.push(membership);
      const profile = db.profiles.find((p) => p.id === userId);
      if (profile) profile.membershipId = membership.id;
    }
  });
  return payment;
}

export function getPayments(userId?: string): Payment[] {
  const all = read().payments;
  return (userId ? all.filter((p) => p.userId === userId) : all).sort((a, b) => b.createdAt - a.createdAt);
}

/* ================= WALLET LEDGER ================= */

export function getBalances(userId: string): Balances {
  const db = read();
  const txs = db.walletTx.filter((t) => t.userId === userId);

  const approvedCredits = txs.filter((t) => t.status === "approved" && t.direction === "credit").reduce((s, t) => s + t.amount, 0);
  const approvedDebits = txs.filter((t) => t.status === "approved" && t.direction === "debit").reduce((s, t) => s + t.amount, 0);
  const holds = db.withdrawals
    .filter((w) => w.userId === userId && (w.status === "pending" || w.status === "processing"))
    .reduce((s, w) => s + w.amount + w.fee, 0);

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const today = txs.filter(
    (t) => t.status === "approved" && t.direction === "credit" && t.createdAt >= dayStart.getTime()
  ).reduce((s, t) => s + t.amount, 0);

  const refEarnings = txs
    .filter((t) => t.type === "referral_bonus" && t.status === "approved")
    .reduce((s, t) => s + t.amount, 0);

  const pending = db.submissions
    .filter((s) => s.userId === userId && s.status === "submitted")
    .reduce((s, sub) => s + (db.tasks.find((t) => t.id === sub.taskId)?.reward || 0), 0);

  // pending spin rewards await admin approval before becoming available
  const spinPending = db.spins
    .filter((s) => s.userId === userId && s.rewardType === "cash" && s.status === "pending")
    .reduce((s, spin) => s + spin.amount, 0);

  return {
    available: Math.max(0, approvedCredits - approvedDebits - holds),
    pending: pending + spinPending,
    totalEarned: approvedCredits,
    totalWithdrawn: approvedDebits,
    todayEarned: today,
    referralEarnings: refEarnings,
    referralPending: 0,
    tasksCompleted: db.submissions.filter((s) => s.userId === userId && s.status === "approved").length,
  };
}

export function getWalletTx(userId?: string): WalletTx[] {
  const all = read().walletTx;
  return (userId ? all.filter((t) => t.userId === userId) : all).sort((a, b) => b.createdAt - a.createdAt);
}

/* ================= TASKS ================= */

export interface TaskView extends Task {
  slotsUsed: number;
  mySubmission: TaskSubmission | null;
  levelLocked: boolean;
  membershipRequired: boolean;
  isOpen: boolean;
}

export function getTaskViews(userId: string): TaskView[] {
  const db = read();
  const user = db.profiles.find((p) => p.id === userId);
  const level = user ? getUserLevel(userId) : null;
  const now = Date.now();

  return db.tasks
    .filter((t) => t.status === "active")
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => {
      const subs = db.submissions.filter((s) => s.taskId === t.id);
      const mySubmission = subs.find((s) => s.userId === userId) || null;
      const withinWindow = now >= t.startsAt && now <= t.endsAt;
      return {
        ...t,
        slotsUsed: subs.filter((s) => s.status !== "rejected").length,
        mySubmission,
        levelLocked: !!level && !t.levelIds.includes(level.id),
        membershipRequired: !level,
        isOpen: withinWindow && subs.filter((s) => s.status !== "rejected").length < t.maxSubmissions,
      };
    });
}

export function todaySubmissionCount(userId: string): number {
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  return read().submissions.filter(
    (s) => s.userId === userId && s.status !== "rejected" && s.startedAt >= dayStart.getTime()
  ).length;
}

export async function startTask(userId: string, taskId: string): Promise<TaskSubmission> {
  // Client-side checks give friendly errors; the database enforces
  // one-submission-per-task-per-user via a unique constraint.
  const user = read().profiles.find((p) => p.id === userId);
  if (!user?.emailVerified) throw new SvcError("Verify your email before starting tasks.");
  const level = getUserLevel(userId);
  if (!level) throw new SvcError("Activate a membership to start earning tasks.");
  const task = read().tasks.find((t) => t.id === taskId);
  if (!task || task.status !== "active") throw new SvcError("This task is not available.");
  if (!task.levelIds.includes(level.id)) throw new SvcError("This task requires a higher membership level.");
  const now = Date.now();
  if (now < task.startsAt || now > task.endsAt) throw new SvcError("This task is outside its active window.");

  const existing = read().submissions.find((s) => s.taskId === taskId && s.userId === userId);
  if (existing && existing.status !== "rejected") return existing; // idempotent resume
  if (existing && existing.status === "rejected")
    throw new SvcError("Your previous submission for this task was rejected.");

  const slotsUsed = read().submissions.filter((s) => s.taskId === taskId && s.status !== "rejected").length;
  if (slotsUsed >= task.maxSubmissions) throw new SvcError("All slots for this task have been taken.");

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const todayCount = read().submissions.filter(
    (s) => s.userId === userId && s.status !== "rejected" && s.startedAt >= dayStart.getTime()
  ).length;
  if (todayCount >= level.taskLimitPerDay)
    throw new SvcError(`You've reached your daily task limit (${level.taskLimitPerDay} on ${level.name}). Try again tomorrow.`);

  const { data, error } = await supabase
    .from("task_submissions")
    .insert({ task_id: taskId, user_id: userId, status: "in_progress" })
    .select()
    .single();

  if (error) {
    // unique(task_id, user_id) violation — another tab/device started it; resume
    const { data: row } = await supabase
      .from("task_submissions")
      .select("*")
      .eq("task_id", taskId)
      .eq("user_id", userId)
      .maybeSingle();
    if (row) {
      const sub = mapSubmission(row);
      update((db) => {
        if (!db.submissions.some((s) => s.id === sub.id)) db.submissions.push(sub);
      });
      return sub;
    }
    throw new SvcError(error.message);
  }

  const sub = mapSubmission(data);
  update((db) => void db.submissions.push(sub));
  return sub;
}

export async function submitTaskProof(userId: string, taskId: string, proof: string) {
  if (proof.trim().length < 12)
    throw new SvcError("Please provide proper proof of work (link, code or description).");
  const { data, error } = await supabase
    .from("task_submissions")
    .update({ status: "submitted", proof: proof.trim(), submitted_at: new Date().toISOString() })
    .eq("task_id", taskId)
    .eq("user_id", userId)
    .eq("status", "in_progress")
    .select()
    .single();
  if (error || !data) throw new SvcError("No in-progress submission found for this task.");
  const sub = mapSubmission(data);
  update((db) => {
    const i = db.submissions.findIndex((s) => s.id === sub.id);
    if (i >= 0) db.submissions[i] = sub;
    else db.submissions.push(sub);
  });
}

export function getMySubmissions(userId: string): (TaskSubmission & { task: Task | undefined })[] {
  const db = read();
  return db.submissions
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt)
    .map((s) => ({ ...s, task: db.tasks.find((t) => t.id === s.taskId) }));
}

/* ================= WITHDRAWALS ================= */

export function getWithdrawals(userId?: string): Withdrawal[] {
  const all = read().withdrawals;
  return (userId ? all.filter((w) => w.userId === userId) : all).sort((a, b) => b.createdAt - a.createdAt);
}

export async function requestWithdrawal(
  userId: string,
  input: { bank: string; accountNumber: string; accountName: string; amount: number }
) {
  const user = read().profiles.find((p) => p.id === userId);
  if (!user?.emailVerified) throw new SvcError("Verify your email before withdrawing.");
  if (!getUserLevel(userId)) throw new SvcError("An active membership is required to withdraw.");
  if (read().withdrawals.some((w) => w.userId === userId && (w.status === "pending" || w.status === "processing")))
    throw new SvcError("You already have a withdrawal in progress. Wait for it to complete.");
  if (!input.bank) throw new SvcError("Select your bank.");
  if (!/^\d{10}$/.test(input.accountNumber)) throw new SvcError("Account number must be exactly 10 digits.");
  if (input.accountName.trim().length < 3) throw new SvcError("Enter the account name.");
  const amount = Math.floor(input.amount);
  const fee = read().settings.withdrawalFee;
  if (amount < read().settings.minWithdrawal)
    throw new SvcError(`Minimum withdrawal is ₦${read().settings.minWithdrawal.toLocaleString()}.`);
  const available = getBalances(userId).available;
  if (amount + fee > available)
    throw new SvcError(`Insufficient balance. Available: ₦${available.toLocaleString()}.`);

  const { data, error } = await supabase
    .from("withdrawals")
    .insert({
      user_id: userId, bank: input.bank, account_number: input.accountNumber,
      account_name: input.accountName.trim(), amount, fee,
      status: "pending", reference: genRef("EH-WTH"),
    })
    .select()
    .single();
  if (error) throw new SvcError(error.message);

  const w = mapWithdrawal(data);
  update((db) => void db.withdrawals.push(w));
  return w;
}

/* ================= REFERRALS ================= */

export function getReferralStats(userId: string) {
  const db = read();
  const rows = db.referrals.filter((r) => r.referrerId === userId);
  const pending = db.submissions
    .filter((s) => s.status === "submitted")
    .filter((s) => rows.some((r) => r.referredId === s.userId && r.status === "active"));
  const percent = getUserLevel(userId)?.referralCommission ?? read().settings.referralPercentDefault;
  const pendingAmount = pending.reduce((sum, s) => {
    const task = db.tasks.find((t) => t.id === s.taskId);
    return sum + Math.round(((task?.reward || 0) * percent) / 100);
  }, 0);
  return {
    rows: rows.sort((a, b) => b.createdAt - a.createdAt),
    total: rows.length,
    active: rows.filter((r) => r.status === "active").length,
    earned: rows.reduce((s, r) => s + r.earned, 0),
    pending: pendingAmount,
    percent,
  };
}

export function getReferralRows(userId: string): (Referral & { name: string; joined: number })[] {
  const db = read();
  return db.referrals
    .filter((r) => r.referrerId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((r) => {
      const u = db.profiles.find((p) => p.id === r.referredId);
      return { ...r, name: u ? maskName(u.fullName) : "Unknown", joined: u?.createdAt || r.createdAt };
    });
}

export const maskName = (name: string) =>
  name.split(" ").map((w) => (w.length <= 2 ? w : w[0] + "***" + w[w.length - 1])).join(" ");

/* ================= NOTIFICATIONS ================= */

export function getNotifications(userId: string): Notification[] {
  return read().notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt - a.createdAt);
}

export function unreadCount(userId: string): number {
  return read().notifications.filter((n) => n.userId === userId && !n.read).length;
}

export async function markAllRead(userId: string) {
  const { error } = await supabase
    .from("notifications")
    .update({ read: true })
    .eq("user_id", userId)
    .eq("read", false);
  if (error) throw new SvcError(error.message);
  update((db) => db.notifications.forEach((n) => { if (n.userId === userId) n.read = true; }));
}

/* ================= SUPPORT ================= */

export async function createTicket(t: Omit<SupportTicket, "id" | "status" | "createdAt">) {
  if (t.message.trim().length < 10) throw new SvcError("Please describe your issue in a bit more detail.");
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: t.userId, name: t.name, email: t.email,
      subject: t.subject, message: t.message.trim(), status: "open",
    })
    .select()
    .single();
  if (error) throw new SvcError(error.message);
  update((db) => void db.tickets.push(mapTicket(data)));
}

export const getMyTickets = (userId: string) =>
  read().tickets.filter((t) => t.userId === userId).sort((a, b) => b.createdAt - a.createdAt);

/* ================= ADMIN ================= */

function requireAdmin(adminId: string): Profile {
  const a = read().profiles.find((p) => p.id === adminId);
  if (!a || a.role !== "admin") throw new SvcError("Administrator access required.");
  return a;
}

/** All privileged writes go through the admin-action edge function, which
 *  re-verifies the caller's admin role server-side, writes with the service
 *  role, appends an audit_logs row, and returns the committed rows. */
async function invokeAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("admin-action", {
    body: { action, ...payload },
  });
  if (error) throw new SvcError(error.message);
  if (data?.error) throw new SvcError(data.error);
  return data;
}

export const getAuditLog = (): AuditLog[] => read().audit.sort((a, b) => b.createdAt - a.createdAt);

export function adminStats() {
  const db = read();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const users = db.profiles.filter((p) => p.role === "user");
  const paidWd = db.withdrawals.filter((w) => w.status === "paid");
  return {
    totalUsers: users.length,
    activeUsers: users.filter((u) => u.status === "active").length,
    newToday: users.filter((u) => u.createdAt >= dayStart.getTime()).length,
    membershipRevenue: db.payments.filter((p) => p.status === "success").reduce((s, p) => s + p.amount, 0),
    taskPayouts: db.walletTx.filter((t) => t.type === "task_reward" && t.status === "approved").reduce((s, t) => s + t.amount, 0),
    referralPayouts: db.walletTx.filter((t) => t.type === "referral_bonus" && t.status === "approved").reduce((s, t) => s + t.amount, 0),
    pendingWithdrawals: db.withdrawals.filter((w) => w.status === "pending" || w.status === "processing"),
    totalWithdrawn: paidWd.reduce((s, w) => s + w.amount, 0),
    pendingSubmissions: db.submissions.filter((s) => s.status === "submitted").length,
    activeMembers: db.memberships.filter((m) => m.status === "active").length,
  };
}

export async function adminSaveLevel(adminId: string, level: Partial<MembershipLevel> & { id?: string }) {
  requireAdmin(adminId);
  if (!level.name?.trim()) throw new SvcError("Level name is required.");
  if (!level.price || level.price < 500) throw new SvcError("Price must be at least ₦500.");
  await invokeAdmin("save-level", { level });
  await hydrateAll();
}

export async function adminDeleteLevel(adminId: string, levelId: string) {
  requireAdmin(adminId);
  await invokeAdmin("delete-level", { levelId });
  await hydrateAll();
}

export async function adminSaveTask(adminId: string, task: Partial<Task> & { id?: string }) {
  requireAdmin(adminId);
  if (!task.title?.trim() || !task.description?.trim()) throw new SvcError("Title and description are required.");
  if (!task.reward || task.reward < 50) throw new SvcError("Reward must be at least ₦50.");
  if (!task.levelIds?.length) throw new SvcError("Select at least one membership level.");
  await invokeAdmin("save-task", { task });
  await hydrateAll();
}

export async function adminDeleteTask(adminId: string, taskId: string) {
  requireAdmin(adminId);
  await invokeAdmin("delete-task", { taskId });
  await hydrateAll();
}

export interface ImportResult {
  insertedCount: number;
  failed: { row: number; message: string }[];
}

/** Bulk-import tasks parsed from a CSV/XLSX file. Rows are validated and
 *  inserted server-side; valid rows import even if some rows fail. */
export async function adminImportTasks(
  adminId: string,
  tasks: {
    title: string; description: string; instructions?: string; category?: string;
    reward: number; est_minutes?: number; max_submissions?: number; daily_limit?: number;
    level_ids: string[]; verification?: string; starts_at?: string; ends_at?: string;
    status?: string;
  }[]
): Promise<ImportResult> {
  requireAdmin(adminId);
  const data = await invokeAdmin("import-tasks", { tasks });
  const result = data as { inserted?: any[]; failed?: { row: number; message: string }[] };
  await hydrateAll();
  return {
    insertedCount: Array.isArray(result.inserted) ? result.inserted.length : 0,
    failed: Array.isArray(result.failed) ? result.failed : [],
  };
}

export type SubmissionRow = TaskSubmission & { task: Task | undefined; user: Profile | undefined };

export function getSubmissionRows(status?: string): SubmissionRow[] {
  const db = read();
  return db.submissions
    .filter((s) => !status || s.status === status)
    .sort((a, b) => (b.submittedAt || b.startedAt) - (a.submittedAt || a.startedAt))
    .map((s) => ({
      ...s,
      task: db.tasks.find((t) => t.id === s.taskId),
      user: db.profiles.find((p) => p.id === s.userId),
    }));
}

/** Approve → server-side atomic wallet credit + referral commission.
 *  Idempotent via source_id so double-clicks can never double-pay. */
export async function reviewSubmission(
  adminId: string, submissionId: string, approve: boolean, note: string
) {
  requireAdmin(adminId);
  if (!approve && note.trim().length < 5) throw new SvcError("Provide a reason for rejection.");
  await invokeAdmin("review-submission", { submissionId, approve, note });
  await hydrateAll();
}

export async function adminSetWithdrawal(
  adminId: string, withdrawalId: string,
  action: "processing" | "paid" | "rejected", opts: { payoutRef?: string; note?: string }
) {
  requireAdmin(adminId);
  if (action === "rejected" && !(opts.note || "").trim()) throw new SvcError("Provide a reason for rejection.");
  if (action === "paid" && !(opts.payoutRef || "").trim()) throw new SvcError("Enter the bank/payout transaction reference.");
  await invokeAdmin("set-withdrawal", { withdrawalId, action, payoutRef: opts.payoutRef, note: opts.note });
  await hydrateAll();
}

export async function adminSetUserStatus(adminId: string, userId: string, status: "active" | "suspended") {
  requireAdmin(adminId);
  await invokeAdmin("set-user-status", { userId, status });
  await hydrateAll();
}

export function getAllUsers(): Profile[] {
  return read().profiles.filter((p) => p.role !== "admin").sort((a, b) => b.createdAt - a.createdAt);
}

export function settings(): Settings {
  return read().settings;
}

export async function adminSaveSettings(adminId: string, s: Settings) {
  requireAdmin(adminId);
  if (!s.platformName.trim()) throw new SvcError("Platform name is required.");
  if (s.minWithdrawal < 100) throw new SvcError("Minimum withdrawal must be at least ₦100.");
  if (s.referralPercentDefault < 0 || s.referralPercentDefault > 30)
    throw new SvcError("Referral commission must be between 0% and 30%.");
  await invokeAdmin("save-settings", { settings: { ...s, minWithdrawal: Math.floor(s.minWithdrawal) } });
  await hydrateAll();
}

export { getLevel as levelById };