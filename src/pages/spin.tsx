import { useCallback, useEffect, useState } from "react";
import { Disc3, Hourglass, Timer, Trophy } from "lucide-react";
import SpinWheel from "../components/SpinWheel";
import { Badge, Button, EmptyState, StatusBadge, Td, Table, fmtDateTime, fmtN } from "../components/ui";
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
    <>
      <style>{`
        @keyframes gold-float {
          0%,100% { transform: translateY(0px); }
          50%      { transform: translateY(-6px); }
        }
        @keyframes ticker-badge {
          0%,100% { opacity: 1; }
          50%      { opacity: 0.6; }
        }
        .gold-float { animation: gold-float 3.5s ease-in-out infinite; }
        .ticker-badge { animation: ticker-badge 2s ease-in-out infinite; }
      `}</style>

      <div className="space-y-8 pb-12">

        {/* ── Hero stage ─────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden rounded-3xl px-4 py-10 text-center"
          style={{
            background: "linear-gradient(160deg,#0a0f1a 0%,#0f172a 50%,#0a0f1a 100%)",
            boxShadow: "inset 0 0 80px rgba(212,175,55,0.06)",
          }}
        >
          {/* background bokeh */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {[
              { top:"10%", left:"8%",  size:180, op:0.04 },
              { top:"60%", left:"75%", size:220, op:0.05 },
              { top:"30%", left:"55%", size:100, op:0.03 },
            ].map((b, i) => (
              <div key={i} className="absolute rounded-full"
                style={{ top:b.top, left:b.left, width:b.size, height:b.size,
                  background:"radial-gradient(circle,#d4af37,transparent 70%)", opacity:b.op }} />
            ))}
          </div>

          {/* crown badge */}
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-xs font-bold tracking-wider text-amber-400 uppercase">
            <span className="text-base">👑</span> Daily Spin
          </div>

          {/* status line */}
          <p className="mb-8 text-sm text-slate-400">
            {canSpinAgain
              ? <span className="text-amber-400 font-semibold">Your free spin is ready!</span>
              : <>Next spin in <span className="font-mono text-amber-400">{countdown?.labelWithSeconds ?? "—"}</span></>
            }
          </p>

          {/* Wheel */}
          <div className="gold-float">
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
          <div className="mt-10">
            {canSpinAgain ? (
              <button
                onClick={() => void doSpin()}
                disabled={spinning}
                className="relative inline-flex items-center gap-2 rounded-full px-8 py-3 text-sm font-black tracking-wide text-amber-900 transition-all hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                style={{
                  background: "linear-gradient(135deg,#f5e08a 0%,#d4af37 45%,#a97f1f 100%)",
                  boxShadow: "0 0 0 2px #7a5c0e, 0 8px 24px rgba(212,175,55,0.35), 0 4px 8px rgba(0,0,0,0.3)",
                }}
              >
                {spinning ? "Spinning…" : "✨ Spin the Wheel"}
              </button>
            ) : (
              <div
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-xs font-semibold"
                style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.1)", color:"rgba(255,255,255,0.45)" }}
              >
                <Timer className="h-3.5 w-3.5" />
                {countdown?.labelWithSeconds ?? "—"}
              </div>
            )}
          </div>
        </div>

        {/* ── Stats row ──────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard
            label="Today's Reward"
            value={todayReward > 0 ? fmtN(todayReward) : "—"}
            accent="#d4af37"
          />
          <StatCard
            label="Total Wins"
            value={String(displayedSpins.filter((s) => s.rewardType !== "none").length)}
            accent="#10b981"
          />
          <div
            className="col-span-2 rounded-2xl p-4 sm:col-span-1"
            style={{ background:"linear-gradient(135deg,rgba(212,175,55,0.08),rgba(212,175,55,0.03))", border:"1px solid rgba(212,175,55,0.2)" }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400/70">Total Spins</p>
            <p className="mt-1 text-2xl font-black text-white">{displayedSpins.length}</p>
          </div>
        </div>

        {/* ── Recent Winners ─────────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background:"linear-gradient(135deg,#0a0f1a,#0f172a)", border:"1px solid rgba(212,175,55,0.15)" }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-amber-400/10">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-400" />
              <p className="text-sm font-bold text-white">Recent Winners</p>
            </div>
            <span className="ticker-badge rounded-full bg-amber-400/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">LIVE</span>
          </div>

          {winners.length === 0 ? (
            <div className="py-10 text-center">
              <Trophy className="mx-auto h-8 w-8 text-slate-700" />
              <p className="mt-2 text-sm text-slate-500">No winners yet</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {winners.slice(0, 6).map((w, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-black"
                      style={{
                        background: i < 3
                          ? "linear-gradient(135deg,#f5e08a,#d4af37)"
                          : "rgba(255,255,255,0.06)",
                        color: i < 3 ? "#7a5c0e" : "rgba(255,255,255,0.5)",
                        border: `1px solid ${i < 3 ? "#a97f1f" : "rgba(255,255,255,0.08)"}`,
                      }}
                    >
                      {i < 3 ? ["🥇","🥈","🥉"][i] : w.winner.charAt(0)}
                    </span>
                    <span className="text-sm font-medium text-slate-300">{w.winner}</span>
                  </div>
                  <span
                    className="rounded-full px-3 py-1 text-xs font-black"
                    style={{ background:"rgba(212,175,55,0.12)", color:"#f5e08a", border:"1px solid rgba(212,175,55,0.25)" }}
                  >
                    {fmtN(w.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Spin History ───────────────────────────────────────────── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background:"#0a0f1a", border:"1px solid rgba(255,255,255,0.07)" }}
        >
          <div className="border-b border-white/5 px-5 py-4">
            <p className="text-sm font-bold text-white">Spin History</p>
            <p className="mt-0.5 text-xs text-slate-500">Every spin logged with a unique reference</p>
          </div>

          {displayedSpins.length === 0 ? (
            <div className="py-10 text-center">
              <Hourglass className="mx-auto h-8 w-8 text-slate-700" />
              <p className="mt-2 text-sm text-slate-500">No spins yet — your first one is free!</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5">
                    {["Date","Result","Reward","Status","Reference"].map((h) => (
                      <th key={h} className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {displayedSpins.slice(0, 30).map((s) => (
                    <tr key={s.id} className="hover:bg-white/[0.02] transition-colors">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{fmtDateTime(s.createdAt)}</td>
                      <td className="px-5 py-3 font-medium text-slate-300">{s.label}</td>
                      <td className="px-5 py-3 font-bold" style={{ color: s.rewardType === "cash" && s.amount > 0 ? "#f5e08a" : "rgba(255,255,255,0.25)" }}>
                        {s.rewardType === "cash" && s.amount > 0 ? fmtN(s.amount) : s.rewardType === "bonus_task" ? "Bonus Task" : "—"}
                      </td>
                      <td className="px-5 py-3"><StatusBadge status={s.status} /></td>
                      <td className="whitespace-nowrap px-5 py-3 font-mono text-[11px] text-slate-500">{s.reference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-2xl p-4"
      style={{ background:"#0a0f1a", border:`1px solid ${accent}22` }}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color:`${accent}99` }}>{label}</p>
      <p className="mt-1 text-2xl font-black text-white">{value}</p>
    </div>
  );
}
