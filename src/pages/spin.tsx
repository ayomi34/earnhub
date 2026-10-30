import { useCallback, useEffect, useState } from "react";
import { Disc3, Hourglass, Timer, Trophy } from "lucide-react";
import SpinWheel from "../components/SpinWheel";
import { StatusBadge, fmtDateTime, fmtN } from "../components/ui";
import {
  getMySpins, getRecentWinners, getSpinConfig, refreshMySpins, refreshSpinWinners, spinWheel,
} from "../lib/services";
import { useAction, useData, useUser } from "../lib/store";

/* ─── countdown ─────────────────────────────────────────────────────── */
function useCountdown(target: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (target === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [target]);
  if (target === null) return null;
  const ms = Math.max(0, target - now);
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return { label: `${h}h ${m}m`, labelWithSeconds: `${h}h ${m}m ${s}s` };
}

/* ─── main page ──────────────────────────────────────────────────────── */
export function SpinPage() {
  const user = useUser()!;
  const config = useData(getSpinConfig);
  const spins = useData(() => getMySpins(user.id));
  const winners = useData(getRecentWinners);
  const { run } = useAction();

  const lastSpin = spins[0] ?? null;
  const canSpinAgain = !lastSpin || Date.now() - lastSpin.createdAt >= 24 * 60 * 60 * 1000;
  const nextAt = canSpinAgain ? null : lastSpin!.createdAt + 24 * 60 * 60 * 1000;
  const countdown = useCountdown(nextAt);

  const [spinning, setSpinning] = useState(false);
  const [winningIndex, setWinningIndex] = useState<number | null>(null);
  const [pendingSpinId, setPendingSpinId] = useState<string | null>(null);

  useEffect(() => { void refreshSpinWinners(); }, []);

  const displayedSpins = pendingSpinId ? spins.filter((s) => s.id !== pendingSpinId) : spins;

  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const todayReward = displayedSpins
    .filter((s) => s.createdAt >= dayStart.getTime() && s.rewardType === "cash" && s.amount > 0)
    .reduce((sum, s) => sum + s.amount, 0);

  const handleAnimationEnd = useCallback(() => {
    setSpinning(false);
    setPendingSpinId(null);
    void refreshMySpins(user.id);
  }, [user.id]);

  const doSpin = async () => {
    if (spinning || !canSpinAgain) return;
    setSpinning(true);
    setPendingSpinId(null);
    setWinningIndex(null);
    const result = await run(async () => {
      const { spin } = await spinWheel(user.id);
      setPendingSpinId(spin.id);
      setWinningIndex(spin.segmentIndex);
      void refreshSpinWinners();
      return spin;
    }, undefined);
    if (result === null) {
      setWinningIndex(null);
      setSpinning(false);
      setPendingSpinId(null);
    }
  };

  if (!config.enabled) {
    return (
      <div className="flex flex-col items-center py-24 text-center">
        <Disc3 className="h-12 w-12 text-slate-300" />
        <p className="mt-4 text-base font-bold text-slate-700">Daily Spin is paused</p>
        <p className="mt-1 text-sm text-slate-400">Check back soon — the wheel will return.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">

      {/* ── Hero stage — deep red radial gradient ──────────────────── */}
      <div
        className="relative overflow-hidden rounded-3xl px-4 pt-8 pb-10 text-center"
        style={{
          background: "radial-gradient(ellipse at 50% 35%, #c83010 0%, #8B0000 45%, #4a0000 75%, #1a0000 100%)",
        }}
      >
        {/* Light rays */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background: "repeating-conic-gradient(rgba(255,200,80,0.06) 0deg 12deg, transparent 12deg 24deg)",
            borderRadius: "inherit",
          }}
        />

        {/* Crown badge */}
        <div className="relative mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-400/40 bg-yellow-400/10 px-4 py-1.5 text-xs font-bold tracking-wider text-yellow-300 uppercase">
          <span className="text-base">🎰</span> Daily Spin
        </div>

        {/* Status */}
        <p className="relative mb-6 text-sm" style={{ color: "rgba(255,255,255,0.7)" }}>
          {canSpinAgain
            ? <span className="font-semibold text-yellow-300">Your free spin is ready!</span>
            : <>Next spin in <span className="font-mono text-yellow-300">{countdown?.labelWithSeconds ?? "—"}</span></>
          }
        </p>

        {/* Wheel */}
        <div className="relative px-2">
          <SpinWheel
            segments={config.segments}
            spinning={spinning}
            winningIndex={winningIndex}
            onSpin={() => void doSpin()}
            disabled={!canSpinAgain}
            onAnimationEnd={handleAnimationEnd}
          />
        </div>

        {/* CTA */}
        <div className="relative mt-8">
          {canSpinAgain ? (
            <button
              onClick={() => void doSpin()}
              disabled={spinning}
              className="inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-black tracking-wide text-amber-900 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
              style={{
                background: "linear-gradient(135deg,#f5e08a 0%,#d4af37 45%,#a97f1f 100%)",
                boxShadow: "0 0 0 2px #7a5c0e, 0 8px 24px rgba(212,175,55,0.4), 0 4px 8px rgba(0,0,0,0.4)",
              }}
            >
              {spinning ? "Spinning…" : "✨ Spin the Wheel"}
            </button>
          ) : (
            <div
              className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.5)" }}
            >
              <Timer className="h-3.5 w-3.5" />
              {countdown?.labelWithSeconds ?? "—"}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats row — white background ───────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today's Reward" value={todayReward > 0 ? fmtN(todayReward) : "—"} accent="#d4af37" />
        <StatCard label="Total Wins"     value={String(displayedSpins.filter((s) => s.rewardType !== "none").length)} accent="#16a34a" />
        <StatCard label="Total Spins"    value={String(displayedSpins.length)} accent="#C8161D" />
      </div>

      {/* ── Recent Winners — white background ──────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-bold text-slate-800">Recent Winners</p>
          </div>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-600 border border-red-100"
            style={{ animation: "live-pulse 2s ease-in-out infinite" }}>
            LIVE
          </span>
        </div>

        {winners.length === 0 ? (
          <div className="py-10 text-center">
            <Trophy className="mx-auto h-8 w-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">No winners yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {winners.slice(0, 6).map((w, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                    style={{
                      background: i < 3
                        ? "linear-gradient(135deg,#f5e08a,#d4af37)"
                        : "#f8f8f8",
                      color: i < 3 ? "#7a5c0e" : "#94a3b8",
                      border: `1px solid ${i < 3 ? "#d4af37" : "#e2e8f0"}`,
                    }}
                  >
                    {i < 3 ? ["🥇","🥈","🥉"][i] : w.winner.charAt(0)}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{w.winner}</span>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700 border border-amber-200">
                  {fmtN(w.amount)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Spin History — white background ────────────────────────── */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100">
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-sm font-bold text-slate-800">Spin History</p>
          <p className="mt-0.5 text-xs text-slate-400">Every spin logged with a unique reference</p>
        </div>

        {displayedSpins.length === 0 ? (
          <div className="py-10 text-center">
            <Hourglass className="mx-auto h-8 w-8 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">No spins yet — your first one is free!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Date","Result","Reward","Status","Reference"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedSpins.slice(0, 30).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">{fmtDateTime(s.createdAt)}</td>
                    <td className="px-5 py-3 font-medium text-slate-700">{s.label}</td>
                    <td className="px-5 py-3 font-bold" style={{ color: s.rewardType === "cash" && s.amount > 0 ? "#b87a00" : "#cbd5e1" }}>
                      {s.rewardType === "cash" && s.amount > 0 ? fmtN(s.amount) : s.rewardType === "bonus_task" ? "Bonus Task" : "—"}
                    </td>
                    <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                    <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px] text-slate-400">{s.reference}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <style>{`
        @keyframes live-pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
      `}</style>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100">
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: accent }}>{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-800">{value}</p>
    </div>
  );
}
