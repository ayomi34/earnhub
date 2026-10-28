import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle, CheckCircle2, Clock, Coins, Info,
  Pickaxe, RefreshCw, TrendingUp, Zap,
} from "lucide-react";
import { useData, useUser } from "../lib/store";
import {
  hydrateGoldMine, joinGoldMineCycle, completeMatureCycles,
  requestGoldConversion, getGoldBalance,
} from "../lib/services";
import { DEFAULT_GOLD_MINE_CONFIG } from "../lib/db";
import { Badge, Button, Modal, fmtN } from "../components/ui";
import type { GoldMineCycle, GoldMineConversion } from "../lib/types";

/* ── helpers ─────────────────────────────────────────────────────────── */

function timeLeft(endsAt: number): string {
  const diff = endsAt - Date.now();
  if (diff <= 0) return "Completed";
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h remaining`;
  if (h > 0) return `${h}h ${m}m remaining`;
  return `${m}m remaining`;
}

function cycleProgress(startedAt: number, endsAt: number): number {
  const total = endsAt - startedAt;
  const elapsed = Date.now() - startedAt;
  return Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
}

/* ── CycleCard ───────────────────────────────────────────────────────── */

function CycleCard({ cycle }: { cycle: GoldMineCycle }) {
  const pct = cycleProgress(cycle.startedAt, cycle.endsAt);
  const done = cycle.status === "completed";
  const cancelled = cycle.status === "cancelled";

  return (
    <div className={`rounded-xl border p-4 ${done ? "border-yellow-200 bg-yellow-50" : cancelled ? "border-slate-200 bg-slate-50" : "border-green-200 bg-green-50"}`}>
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${done ? "bg-yellow-400 text-white" : cancelled ? "bg-slate-300 text-slate-600" : "bg-green-500 text-white"}`}>
            {done ? "✓" : cancelled ? "✗" : <Pickaxe className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-800">
              {done ? "Cycle completed" : cancelled ? "Cycle cancelled" : "Active cycle"}
            </p>
            <p className="text-xs text-slate-500">
              Started {new Date(cycle.startedAt).toLocaleDateString("en-NG")}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="flex items-center gap-1 text-sm font-bold text-yellow-600">
            <Coins className="h-3.5 w-3.5" />
            {cycle.goldReward} gold
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
          <div className="h-2 overflow-hidden rounded-full bg-green-100">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Ends {new Date(cycle.endsAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </>
      )}

      {done && (
        <p className="mt-1 text-xs text-yellow-700">
          {cycle.goldCredited ? `${cycle.goldReward} gold coins credited to your balance` : "Cycle ended — processing..."}
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
          {conv.goldAmount} gold → {fmtN(conv.cashAmount)}
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

/* ── Main page ───────────────────────────────────────────────────────── */

export function GoldMinePage() {
  const user = useUser();
  const db = useData();

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

  // Active membership level config
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

  // On mount: hydrate data and process matured cycles
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
      setSuccess("Cycle started! Your gold coins will be credited when the cycle completes.");
    } catch (e: any) {
      setError(e.message || "Failed to join cycle.");
    } finally {
      setLoading(false);
    }
  };

  const handleConvert = async () => {
    if (!user) return;
    const amt = parseInt(goldInput, 10);
    if (!amt || amt <= 0) { setError("Enter a valid gold amount."); return; }
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
        <Pickaxe className="h-10 w-10 text-slate-300" />
        <p className="mt-4 text-sm font-semibold text-slate-700">Gold Mine is currently unavailable</p>
        <p className="mt-1 text-xs text-slate-400">Check back later or contact support.</p>
      </div>
    );
  }

  // Estimated cash value if converting all balance
  const grossCash = goldBalance * cfg.goldToCashRate;
  const fee = Math.floor(grossCash * cfg.conversionFeePercent / 100);
  const netCash = grossCash - fee;

  const inputGold = parseInt(goldInput, 10) || 0;
  const previewGross = inputGold * cfg.goldToCashRate;
  const previewFee = Math.floor(previewGross * cfg.conversionFeePercent / 100);
  const previewNet = previewGross - previewFee;

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-[20px] font-bold text-slate-900">Gold Mine</h1>
        <p className="mt-1 text-sm text-slate-500">
          Join cycles to earn gold coins, then convert them to real cash.
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

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
          <p className="text-xs font-medium text-yellow-600">Gold Balance</p>
          <p className="mt-1 flex items-center gap-1 text-2xl font-bold text-yellow-700">
            <Coins className="h-5 w-5" />
            {goldBalance}
          </p>
          <p className="mt-0.5 text-[11px] text-yellow-500">≈ {fmtN(netCash)} after fee</p>
        </div>
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <p className="text-xs font-medium text-green-600">Active Cycles</p>
          <p className="mt-1 text-2xl font-bold text-green-700">{activeCycles.length}</p>
          <p className="mt-0.5 text-[11px] text-green-500">
            {levelCfg ? `Max ${levelCfg.maxActiveCycles}` : "No active membership"}
          </p>
        </div>
        <div className="col-span-2 rounded-xl border border-slate-200 bg-white p-4 sm:col-span-1">
          <p className="text-xs font-medium text-slate-500">Conversion Rate</p>
          <p className="mt-1 text-sm font-bold text-slate-800">
            1 gold = {fmtN(cfg.goldToCashRate)}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {cfg.conversionFeePercent}% fee · min {cfg.minConversionGold} gold
          </p>
        </div>
      </div>

      {/* Cycle config card */}
      {levelCfg ? (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-800">Your Cycle Plan</p>
              <p className="mt-0.5 text-xs text-slate-500">
                Based on your active membership level
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-700">
              <Coins className="h-3.5 w-3.5" />
              {levelCfg.goldReward} gold / cycle
            </div>
          </div>
          <div className="mb-4 grid grid-cols-3 gap-3 text-center">
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
          <Button
            className="w-full"
            onClick={handleJoin}
            disabled={loading || activeCycles.length >= levelCfg.maxActiveCycles}
          >
            {loading ? (
              <><RefreshCw className="h-4 w-4 animate-spin" /> Starting...</>
            ) : (
              <><Pickaxe className="h-4 w-4" />
                {activeCycles.length >= levelCfg.maxActiveCycles
                  ? "Max active cycles reached"
                  : levelCfg.joinCost > 0
                  ? `Join Cycle — ${fmtN(levelCfg.joinCost)}`
                  : "Join Cycle — Free"}
              </>
            )}
          </Button>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-center">
          <Info className="mx-auto h-6 w-6 text-amber-500" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Membership required</p>
          <p className="mt-1 text-xs text-slate-500">
            Upgrade your membership to unlock Gold Mine cycles.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => { window.location.hash = "#/app/membership"; }}>
            View Membership Plans
          </Button>
        </div>
      )}

      {/* Convert gold section */}
      {goldBalance >= cfg.minConversionGold && (
        <div className="rounded-xl border border-yellow-200 bg-gradient-to-r from-yellow-50 to-amber-50 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                <TrendingUp className="h-4 w-4 text-yellow-600" />
                Convert Gold to Cash
              </p>
              <p className="mt-1 text-xs text-slate-500">
                You have {goldBalance} gold coins available to convert
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

      {/* Conversion history */}
      {conversions.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Conversion History</h2>
          <div className="space-y-2">
            {conversions.map((c) => <ConversionCard key={c.id} conv={c} />)}
          </div>
        </section>
      )}

      {/* Completed cycles */}
      {completedCycles.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Completed Cycles</h2>
          <div className="space-y-3">
            {completedCycles.map((c) => <CycleCard key={c.id} cycle={c} />)}
          </div>
        </section>
      )}

      {/* Empty state */}
      {cycles.length === 0 && conversions.length === 0 && (
        <div className="py-12 text-center">
          <Pickaxe className="mx-auto h-10 w-10 text-slate-200" />
          <p className="mt-3 text-sm font-semibold text-slate-600">No activity yet</p>
          <p className="mt-1 text-xs text-slate-400">
            Join your first Gold Mine cycle to start earning gold coins.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Info className="h-4 w-4 text-brand" /> How Gold Mine Works
        </p>
        <ol className="space-y-2 text-xs text-slate-500">
          <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">1</span> Join a cycle with your active membership plan.</li>
          <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">2</span> Wait for the cycle duration to complete.</li>
          <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">3</span> Gold coins are credited to your balance automatically.</li>
          <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">4</span> Convert {cfg.minConversionGold}+ gold coins to cash at {fmtN(cfg.goldToCashRate)}/coin (minus {cfg.conversionFeePercent}% fee).</li>
          <li className="flex gap-2"><span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white">5</span> Admin approves conversion and funds appear in your wallet.</li>
        </ol>
      </div>

      {/* Conversion modal */}
      <Modal
        open={convModal}
        onClose={() => { setConvModal(false); setError(""); setGoldInput(""); }}
        title="Convert Gold to Cash"
      >
        <div className="space-y-4">
          <div className="rounded-lg bg-yellow-50 px-4 py-3">
            <p className="text-xs text-yellow-600">Available gold balance</p>
            <p className="flex items-center gap-1 text-lg font-bold text-yellow-700">
              <Coins className="h-4 w-4" /> {goldBalance} gold coins
            </p>
            <p className="text-[11px] text-yellow-500">Rate: {fmtN(cfg.goldToCashRate)}/coin · {cfg.conversionFeePercent}% fee</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Gold coins to convert
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
  );
}
