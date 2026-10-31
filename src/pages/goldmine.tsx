import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle, Check, CheckCircle2, Coins, Crown, Info, Medal, RefreshCw,
  TrendingUp, Trophy, X, Zap,
} from "lucide-react";
import { useData, useUser } from "../lib/store";
import { read } from "../lib/db";
import {
  hydrateGoldMine, joinGoldMineCycle, completeMatureCycles,
  requestGoldConversion, getGoldBalance, getZentraLeaderboard,
} from "../lib/services";
import type { ZentraLeaderboardRow } from "../lib/services";
import { DEFAULT_GOLD_MINE_CONFIG } from "../lib/db";
import { Button, Modal, fmtN } from "../components/ui";
import type { GoldMineCycle, GoldMineConversion } from "../lib/types";

/* ── helpers ─────────────────────────────────────────────────────────── */

function timeLeft(endsAt: number): string {
  const diff = endsAt - Date.now();
  if (diff <= 0) return "Completed";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (d > 0) return `${d}d ${h}h ${m}m remaining`;
  if (h > 0) return `${h}h ${m}m ${s}s remaining`;
  return `${m}m ${s}s remaining`;
}

function cycleProgress(startedAt: number, endsAt: number): number {
  const total = endsAt - startedAt;
  const elapsed = Date.now() - startedAt;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/* ── ZentraCore animation ────────────────────────────────────────────── */

function ZentraCore({ active }: { active: boolean }) {
  return (
    <div className="relative mx-auto flex h-44 w-44 items-center justify-center select-none">
      {/* outer ring */}
      <div
        className="absolute h-44 w-44 rounded-full border border-cyan-400/30"
        style={{
          animation: active ? "zentra-spin 8s linear infinite" : "none",
          opacity: active ? 1 : 0.3,
        }}
      >
        <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-cyan-400" />
      </div>
      {/* mid ring */}
      <div
        className="absolute h-32 w-32 rounded-full border border-violet-400/40"
        style={{
          animation: active ? "zentra-spin-rev 5s linear infinite" : "none",
          opacity: active ? 1 : 0.3,
        }}
      >
        <div className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-violet-400" />
      </div>
      {/* inner ring */}
      <div
        className="absolute h-20 w-20 rounded-full border border-indigo-400/50"
        style={{
          animation: active ? "zentra-spin 3s linear infinite" : "none",
          opacity: active ? 1 : 0.3,
        }}
      >
        <div className="absolute -top-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-indigo-400" />
      </div>
      {/* core */}
      <div
        className={`relative z-10 flex h-14 w-14 items-center justify-center rounded-full transition-all duration-700 ${
          active
            ? "bg-gradient-to-br from-cyan-400 to-violet-500 shadow-[0_0_24px_rgba(139,92,246,0.6)]"
            : "bg-slate-700 shadow-none"
        }`}
        style={{ animation: active ? "zentra-pulse 2s ease-in-out infinite" : "none" }}
      >
        <Zap className={`h-6 w-6 ${active ? "text-white" : "text-slate-500"}`} />
      </div>
      {active && (
        <div className="absolute h-14 w-14 rounded-full bg-violet-500/20 blur-xl" />
      )}
    </div>
  );
}

/* ── CycleCard ───────────────────────────────────────────────────────── */

function CycleCard({ cycle }: { cycle: GoldMineCycle }) {
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cycle.status === "active") {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 1_000);
    }
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [cycle.status]);

  const pct = cycleProgress(cycle.startedAt, cycle.endsAt);
  const done = cycle.status === "completed";
  const cancelled = cycle.status === "cancelled";

  return (
    <div className={`rounded-xl border p-4 ${done ? "border-violet-200 bg-violet-50" : cancelled ? "border-slate-200 bg-slate-50" : "border-cyan-200 bg-cyan-50"}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-violet-500 text-white" : cancelled ? "bg-slate-300 text-slate-600" : "bg-cyan-500 text-white"}`}>
            {done ? <Check className="h-4 w-4" /> : cancelled ? <X className="h-4 w-4" /> : <Zap className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {done ? "Cycle Completed" : cancelled ? "Cycle cancelled" : "Zentra is running"}
            </p>
            <p className="text-xs text-slate-500">
              Started {new Date(cycle.startedAt).toLocaleDateString("en-NG")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="flex items-center gap-1 text-sm font-bold text-violet-600">
            <Coins className="h-3.5 w-3.5" />
            {cycle.goldReward} ZNTR
          </p>
          {cycle.joinCost > 0 && (
            <p className="text-xs text-slate-400">Cost: {fmtN(cycle.joinCost)}</p>
          )}
        </div>
      </div>

      {!done && !cancelled && (
        <>
          <div className="mb-1 flex justify-between text-xs text-slate-500">
            <span>{timeLeft(cycle.endsAt)}</span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-cyan-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Completes {new Date(cycle.endsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </>
      )}

      {done && (
        <p className="mt-1 text-xs text-violet-700">
          {cycle.goldCredited ? `${cycle.goldReward} ZNTR credited to your balance` : "Cycle ended — processing..."}
        </p>
      )}
    </div>
  );
}

/* ── ConversionCard ──────────────────────────────────────────────────── */

function ConversionCard({ conv }: { conv: GoldMineConversion }) {
  const statusColor = conv.status === "approved"
    ? "text-green-700 bg-green-100"
    : conv.status === "rejected"
    ? "text-red-700 bg-red-100"
    : "text-amber-700 bg-amber-100";

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">
          {conv.goldAmount} ZNTR → {fmtN(conv.cashAmount)}
        </p>
        <p className="text-xs text-slate-400">
          {new Date(conv.createdAt).toLocaleDateString("en-NG")} · {conv.reference}
        </p>
        {conv.note && (
          <p className="mt-0.5 text-xs text-red-600">{conv.note}</p>
        )}
      </div>
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusColor}`}>
        {conv.status.charAt(0).toUpperCase() + conv.status.slice(1)}
      </span>
    </div>
  );
}

/* ── Leaderboard tab ─────────────────────────────────────────────────── */

type LBPeriod = "all" | "weekly" | "monthly";

function ZentraLeaderboard({ currentUserId }: { currentUserId: string }) {
  const [period, setPeriod] = useState<LBPeriod>("all");
  const [rows, setRows] = useState<ZentraLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getZentraLeaderboard(period)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [period]);

  const myRow = rows.find((r) => r.userId === currentUserId);
  const MEDAL = ["text-yellow-500", "text-slate-400", "text-amber-600"];

  return (
    <div className="space-y-4">
      {/* period tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["all", "weekly", "monthly"] as LBPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`flex-1 rounded-md py-2 text-xs font-semibold transition-colors ${
              period === p ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {p === "all" ? "All Time" : p === "weekly" ? "This Week" : "This Month"}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <RefreshCw className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-600">No miners yet</p>
          <p className="mt-1 text-sm text-slate-400">Complete a Zentra cycle to appear on the leaderboard.</p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          {/* top 3 podium */}
          {rows.length >= 3 && (
            <div className="flex items-end justify-center gap-4 pt-2 pb-4">
              {/* 2nd */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-lg font-black text-slate-600 shadow">
                  {rows[1].displayName.slice(0, 1)}
                </div>
                <p className="text-[11px] font-semibold text-slate-600">#{2}</p>
                <div className="flex h-14 w-16 flex-col items-center justify-center rounded-t-xl border border-slate-200 bg-slate-100">
                  <Medal className="h-4 w-4 text-slate-400" />
                  <p className="text-[10px] font-bold text-slate-500">{rows[1].totalZntr} Z</p>
                </div>
              </div>
              {/* 1st */}
              <div className="flex flex-col items-center gap-1">
                <Crown className="h-5 w-5 text-yellow-500" />
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-xl font-black text-yellow-700 shadow-md ring-2 ring-yellow-400">
                  {rows[0].displayName.slice(0, 1)}
                </div>
                <p className="text-[11px] font-semibold text-slate-600">#{1}</p>
                <div className="flex h-20 w-16 flex-col items-center justify-center rounded-t-xl border border-yellow-200 bg-yellow-50">
                  <Crown className="h-4 w-4 text-yellow-500" />
                  <p className="text-[10px] font-bold text-yellow-600">{rows[0].totalZntr} Z</p>
                </div>
              </div>
              {/* 3rd */}
              <div className="flex flex-col items-center gap-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-lg font-black text-amber-700 shadow">
                  {rows[2].displayName.slice(0, 1)}
                </div>
                <p className="text-[11px] font-semibold text-slate-600">#{3}</p>
                <div className="flex h-10 w-16 flex-col items-center justify-center rounded-t-xl border border-amber-200 bg-amber-50">
                  <Medal className="h-4 w-4 text-amber-600" />
                  <p className="text-[10px] font-bold text-amber-600">{rows[2].totalZntr} Z</p>
                </div>
              </div>
            </div>
          )}

          {/* ranked list */}
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={r.userId}
                className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${
                  r.userId === currentUserId
                    ? "border-cyan-300 bg-cyan-50"
                    : i < 3
                    ? ["border-yellow-200 bg-yellow-50", "border-slate-200 bg-slate-50", "border-amber-200 bg-amber-50"][i]
                    : "border-slate-100 bg-white"
                }`}
              >
                <div className="w-7 text-center">
                  {i < 3 ? (
                    <Medal className={`mx-auto h-5 w-5 ${MEDAL[i]}`} />
                  ) : (
                    <span className="text-sm font-bold text-slate-400">#{i + 1}</span>
                  )}
                </div>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                  r.userId === currentUserId ? "bg-cyan-500 text-white" :
                  i === 0 ? "bg-yellow-100 text-yellow-700" :
                  i === 1 ? "bg-slate-200 text-slate-600" :
                  i === 2 ? "bg-amber-100 text-amber-700" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  {r.displayName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800">
                    {r.displayName}
                    {r.userId === currentUserId && <span className="ml-1.5 text-[10px] font-bold text-cyan-600">(You)</span>}
                  </p>
                  <p className="text-[11px] text-slate-400">{r.completedCycles} cycle{r.completedCycles !== 1 ? "s" : ""} completed</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-bold text-violet-600">
                  <Coins className="h-3.5 w-3.5" />
                  {r.totalZntr}
                </div>
              </div>
            ))}
          </div>

          {/* my rank callout if not in top 50 */}
          {myRow && (
            <p className="text-center text-xs text-slate-400">
              Your rank: <strong className="text-cyan-600">#{myRow.rank}</strong> · {myRow.totalZntr} ZNTR earned
            </p>
          )}
          {!myRow && (
            <p className="text-center text-xs text-slate-400">
              Complete a cycle to appear on the leaderboard.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ── Main Zentra page (no tabs) ──────────────────────────────────────── */

export function GoldMinePage() {
  const user = useUser();
  const db = useData(read);

  const cfg = db.settings.goldMine ?? DEFAULT_GOLD_MINE_CONFIG;
  const cycles = useMemo(
    () => (db.goldMineCycles ?? []).filter((c) => c.userId === user?.id),
    [db.goldMineCycles, user?.id]
  );
  const conversions = useMemo(
    () => (db.goldMineConversions ?? []).filter((c) => c.userId === user?.id),
    [db.goldMineConversions, user?.id]
  );

  const goldBalance = user ? getGoldBalance(user.id) : 0;

  const activeMembership = db.memberships.find(
    (m) => m.userId === user?.id && m.status === "active"
  );
  const levelCfg = activeMembership
    ? cfg.levelConfigs?.find((lc) => lc.levelId === activeMembership.levelId)
    : null;

  const activeCycles = cycles.filter((c) => c.status === "active");
  const completedCycles = cycles.filter((c) => c.status === "completed");

  const [loading, setLoading] = useState(false);
  const [convModal, setConvModal] = useState(false);
  const [goldInput, setGoldInput] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!user) return;
    void hydrateGoldMine(user.id).then(() => completeMatureCycles(user.id));
  }, [user?.id]);

  const handleJoin = async () => {
    if (!user) return;
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await joinGoldMineCycle(user.id);
      setSuccess("Zentra cycle activated! Your ZNTR will be credited when the cycle completes.");
    } catch (e: any) {
      setError(e.message || "Failed to activate cycle.");
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!user) return;
    const amt = parseInt(goldInput, 10);
    if (!amt || amt <= 0) { setError("Enter a valid ZNTR amount."); return; }
    setError("");
    setLoading(true);
    try {
      await requestGoldConversion(user.id, amt);
      setConvModal(false);
      setGoldInput("");
      setSuccess("Conversion request submitted! It will be reviewed by our team.");
    } catch (e: any) {
      setError(e.message || "Conversion failed.");
    } finally {
      setLoading(false);
    }
  };

  if (!cfg.enabled) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Zap className="h-10 w-10 text-slate-300" />
        <p className="mt-4 text-sm font-semibold text-slate-700">Zentra is currently unavailable</p>
        <p className="mt-1 text-xs text-slate-400">Check back later or contact support.</p>
      </div>
    );
  }

  const grossCash = goldBalance * cfg.goldToCashRate;
  const fee = Math.floor(grossCash * cfg.conversionFeePercent / 100);
  const netCash = grossCash - fee;

  const inputGold = parseInt(goldInput, 10) || 0;
  const previewGross = inputGold * cfg.goldToCashRate;
  const previewFee = Math.floor(previewGross * cfg.conversionFeePercent / 100);
  const previewNet = previewGross - previewFee;

  return (
    <>
      <style>{`
        @keyframes zentra-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes zentra-spin-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes zentra-pulse { 0%,100% { box-shadow: 0 0 16px rgba(139,92,246,0.5); } 50% { box-shadow: 0 0 32px rgba(139,92,246,0.85); } }
      `}</style>

      <div className="space-y-6 pb-8">
        {/* Header */}
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Zentra</h1>
          <p className="mt-1 text-sm text-slate-500">
            Activate cycles to earn ZNTR, then convert to real cash.
          </p>
        </div>

        {/* Feedback banners */}
        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2.5 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{success}</p>
          </div>
        )}

        {/* Animated core + primary action */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center">
          <ZentraCore active={activeCycles.length > 0} />

          <p className={`mt-3 text-sm font-semibold ${activeCycles.length > 0 ? "text-cyan-400" : "text-slate-400"}`}>
            {activeCycles.length > 0
              ? `${activeCycles.length} cycle${activeCycles.length > 1 ? "s" : ""} running`
              : "No active cycles"}
          </p>

          {levelCfg ? (
            <div className="mt-4">
              <Button
                className="w-full max-w-xs !bg-gradient-to-r !from-cyan-500 !to-violet-600 !text-white hover:opacity-90"
                onClick={handleJoin}
                disabled={loading || activeCycles.length >= levelCfg.maxActiveCycles}
              >
                {loading ? (
                  <><RefreshCw className="h-4 w-4 animate-spin" /> Activating...</>
                ) : activeCycles.length >= levelCfg.maxActiveCycles ? (
                  "Max cycles active"
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    {levelCfg.joinCost > 0
                      ? `Activate Zentra — ${fmtN(levelCfg.joinCost)}`
                      : "Activate Zentra — Free"}
                  </>
                )}
              </Button>
              <p className="mt-2 text-xs text-slate-500">
                {levelCfg.cycleDays}-day cycle · {levelCfg.goldReward} ZNTR reward
              </p>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-xs text-slate-400 mb-3">Membership required to activate Zentra cycles</p>
              <Button
                variant="outline"
                className="!border-slate-600 !text-slate-300 hover:!bg-slate-800"
                onClick={() => { window.location.hash = "#/app/membership"; }}
              >
                View Membership Plans
              </Button>
            </div>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="text-xs font-medium text-violet-600">ZNTR Balance</p>
            <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-violet-700">
              <Coins className="h-5 w-5" />
              {goldBalance}
            </p>
            <p className="mt-0.5 text-[11px] text-violet-400">≈ {fmtN(netCash)} after fee</p>
          </div>
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
            <p className="text-xs font-medium text-cyan-600">Active Cycles</p>
            <p className="mt-1 text-2xl font-bold text-cyan-700">{activeCycles.length}</p>
            <p className="mt-0.5 text-[11px] text-cyan-500">
              {levelCfg ? `Max ${levelCfg.maxActiveCycles}` : "No active membership"}
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-1">
            <p className="text-xs font-medium text-slate-500">Conversion Rate</p>
            <p className="mt-1 text-sm font-bold text-slate-800">
              1 ZNTR = {fmtN(cfg.goldToCashRate)}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {cfg.conversionFeePercent}% fee · min {cfg.minConversionGold} ZNTR
            </p>
          </div>
        </div>

        {/* Cycle plan card */}
        {levelCfg && (
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Your Cycle Plan</p>
                <p className="mt-0.5 text-xs text-slate-500">Based on your active membership level</p>
              </div>
              <div className="flex items-center gap-1 rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                <Coins className="h-3.5 w-3.5" />
                {levelCfg.goldReward} ZNTR / cycle
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Duration</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{levelCfg.cycleDays} days</p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Join Cost</p>
                <p className="mt-1 text-sm font-bold text-slate-800">
                  {levelCfg.joinCost > 0 ? fmtN(levelCfg.joinCost) : "Free"}
                </p>
              </div>
              <div className="rounded-lg bg-slate-50 p-3">
                <p className="text-xs text-slate-400">Max Active</p>
                <p className="mt-1 text-sm font-bold text-slate-800">{levelCfg.maxActiveCycles}</p>
              </div>
            </div>
          </div>
        )}

        {/* Convert ZNTR section */}
        {goldBalance >= cfg.minConversionGold && (
          <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-cyan-50 p-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <TrendingUp className="h-4 w-4 text-violet-600" />
                  Convert ZNTR to Cash
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  You have {goldBalance} ZNTR ready to convert
                </p>
              </div>
              <Button onClick={() => { setConvModal(true); setError(""); }}>
                <Coins className="h-4 w-4" /> Convert
              </Button>
            </div>
          </div>
        )}

        {/* Active cycles */}
        {activeCycles.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Active Cycles</h2>
            <div className="space-y-3">
              {activeCycles.map((c) => <CycleCard key={c.id} cycle={c} />)}
            </div>
          </section>
        )}

        {/* History — conversion history */}
        {conversions.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Conversion History</h2>
            <div className="space-y-2">
              {conversions.map((c) => <ConversionCard key={c.id} conv={c} />)}
            </div>
          </section>
        )}

        {/* History — completed cycles */}
        {completedCycles.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Completed Cycles</h2>
            <div className="space-y-3">
              {completedCycles.map((c) => <CycleCard key={c.id} cycle={c} />)}
            </div>
          </section>
        )}

        {/* History — cancelled cycles */}
        {cycles.filter((c) => c.status === "cancelled").length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Cancelled Cycles</h2>
            <div className="space-y-3">
              {cycles.filter((c) => c.status === "cancelled").map((c) => <CycleCard key={c.id} cycle={c} />)}
            </div>
          </section>
        )}

        {/* Empty state */}
        {cycles.length === 0 && conversions.length === 0 && (
          <div className="py-12 text-center">
            <Zap className="mx-auto h-10 w-10 text-slate-200" />
            <p className="mt-3 text-sm font-semibold text-slate-600">No activity yet</p>
            <p className="mt-1 text-xs text-slate-400">
              Activate your first Zentra cycle to start earning ZNTR.
            </p>
          </div>
        )}

        {/* How it works */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Info className="h-4 w-4 text-brand" /> How Zentra Works
          </p>
          <ol className="space-y-2 text-xs text-slate-500">
            <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">1</span> Activate a cycle with your active membership plan.</li>
            <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">2</span> Wait for the cycle duration to complete.</li>
            <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">3</span> ZNTR is credited to your balance automatically.</li>
            <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">4</span> Convert {cfg.minConversionGold}+ ZNTR to cash at {fmtN(cfg.goldToCashRate)}/ZNTR (minus {cfg.conversionFeePercent}% fee).</li>
            <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">5</span> Admin approves conversion and funds appear in your wallet.</li>
          </ol>
        </div>

        {/* Conversion modal */}
        <Modal
          open={convModal}
          onClose={() => { setConvModal(false); setError(""); setGoldInput(""); }}
          title="Convert ZNTR to Cash"
        >
          <div className="space-y-4">
            <div className="rounded-lg bg-violet-50 px-4 py-3">
              <p className="text-xs text-violet-600">Available ZNTR balance</p>
              <p className="flex items-center gap-1 text-lg font-bold text-violet-700">
                <Coins className="h-4 w-4" /> {goldBalance} ZNTR
              </p>
              <p className="text-[11px] text-violet-500">Rate: {fmtN(cfg.goldToCashRate)}/ZNTR · {cfg.conversionFeePercent}% fee</p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                ZNTR to convert
              </label>
              <input
                type="number"
                min={cfg.minConversionGold}
                max={goldBalance}
                value={goldInput}
                onChange={(e) => { setGoldInput(e.target.value); setError(""); }}
                placeholder={`Min ${cfg.minConversionGold}`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>

            {inputGold >= cfg.minConversionGold && inputGold <= goldBalance && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross cash</span>
                  <span className="font-semibold">{fmtN(previewGross)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Fee ({cfg.conversionFeePercent}%)</span>
                  <span className="text-red-500">− {fmtN(previewFee)}</span>
                </div>
                <div className="flex justify-between border-t border-slate-200 pt-1">
                  <span className="font-semibold text-slate-700">You receive</span>
                  <span className="font-bold text-green-700">{fmtN(previewNet)}</span>
                </div>
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
            )}

            <Button className="w-full" onClick={handleConvert} disabled={loading}>
              {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Submitting...</> : "Request Conversion"}
            </Button>
            <p className="text-[11px] text-center text-slate-400">
              Conversion requests are reviewed and approved within 24 hours.
            </p>
          </div>
        </Modal>
      </div>
    </>
  );
}

/* ── Standalone Zentra Leaderboard page ──────────────────────────────── */

export function ZentraLeaderboardPage() {
  const user = useUser();
  return (
    <div className="space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-100">
          <Trophy className="h-5 w-5 text-violet-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Zentra Leaderboard</h1>
          <p className="text-xs text-slate-500">Top ZNTR earners across all miners</p>
        </div>
      </div>
      {user && <ZentraLeaderboard currentUserId={user.id} />}
    </div>
  );
}
