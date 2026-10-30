import { useCallback, useEffect, useState } from "react";
import { Disc3, Hourglass, Timer, Trophy } from "lucide-react";
import SpinWheel from "../components/SpinWheel";
import { StatusBadge, fmtDateTime, fmtN } from "../components/ui";
import {
  getMySpins, getRecentWinners, getSpinConfig, refreshMySpins, refreshSpinWinners, spinWheel,
} from "../lib/services";
import { useAction, useData, useUser } from "../lib/store";

/* ─── countdown ──────────────────────────────────────────────────────── */
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

/* ─── main page ───────────────────────────────────────────────────────── */
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
        <Disc3 className="h-10 w-10 text-slate-300" />
        <p className="mt-4 text-sm font-semibold text-slate-600">Daily Spin is paused</p>
        <p className="mt-1 text-sm text-slate-400">Check back soon.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-12">

      {/* ── Wheel section ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm px-4 py-8 flex flex-col items-center gap-5">
        <SpinWheel
          segments={config.segments}
          spinning={spinning}
          winningIndex={winningIndex}
          onSpin={() => void doSpin()}
          disabled={!canSpinAgain}
          onAnimationEnd={handleAnimationEnd}
        />

        {/* CTA / countdown */}
        {canSpinAgain ? (
          <button
            onClick={() => void doSpin()}
            disabled={spinning}
            className="rounded-full px-8 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
            style={{ background: "#C8161D" }}
          >
            {spinning ? "Spinning…" : "Spin Now"}
          </button>
        ) : (
          <div className="flex items-center gap-1.5 text-sm text-slate-500">
            <Timer className="h-4 w-4 flex-shrink-0 text-slate-400" />
            Next spin in{" "}
            <span className="font-semibold text-slate-700 tabular-nums">
              {countdown?.labelWithSeconds ?? "—"}
            </span>
          </div>
        )}
      </div>

      {/* ── Stats row ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Today's Reward" value={todayReward > 0 ? fmtN(todayReward) : "—"} />
        <StatCard label="Total Wins"     value={String(displayedSpins.filter((s) => s.rewardType !== "none").length)} />
        <StatCard label="Total Spins"    value={String(displayedSpins.length)} />
      </div>

      {/* ── Recent Winners ─────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <p className="text-sm font-semibold text-slate-700">Recent Winners</p>
          </div>
          <span className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Live</span>
        </div>

        {winners.length === 0 ? (
          <div className="py-10 text-center">
            <Trophy className="mx-auto h-7 w-7 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">No winners yet</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {winners.slice(0, 6).map((w, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3">
                <div className="flex items-center gap-3">
                  {/* Medal without circular background */}
                  <span className="text-base leading-none">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (
                      <span className="text-xs font-semibold text-slate-400">{i + 1}</span>
                    )}
                  </span>
                  <span className="text-sm text-slate-600">{w.winner}</span>
                </div>
                <span className="text-sm font-semibold text-amber-700">{fmtN(w.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Spin History ───────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="border-b border-slate-100 px-5 py-3.5">
          <p className="text-sm font-semibold text-slate-700">Spin History</p>
          <p className="mt-0.5 text-xs text-slate-400">Every spin logged with a unique reference</p>
        </div>

        {displayedSpins.length === 0 ? (
          <div className="py-10 text-center">
            <Hourglass className="mx-auto h-7 w-7 text-slate-200" />
            <p className="mt-2 text-sm text-slate-400">No spins yet — your first one is free!</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {["Date","Result","Reward","Status","Reference"].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {displayedSpins.slice(0, 30).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">{fmtDateTime(s.createdAt)}</td>
                    <td className="px-5 py-3 text-sm text-slate-600">{s.label}</td>
                    <td className="px-5 py-3 text-sm font-semibold"
                      style={{ color: s.rewardType === "cash" && s.amount > 0 ? "#b45309" : "#cbd5e1" }}>
                      {s.rewardType === "cash" && s.amount > 0
                        ? fmtN(s.amount)
                        : s.rewardType === "bonus_task"
                        ? "Bonus Task"
                        : "—"}
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
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-sm p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-bold text-slate-800">{value}</p>
    </div>
  );
}
