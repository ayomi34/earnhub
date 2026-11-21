import { useCallback, useEffect, useState } from "react";
import {
  ArrowUpRight, Clock3, Coins, Disc3, Hourglass, Medal, ShieldCheck,
  Sparkles, Timer, Trophy, Zap,
} from "lucide-react";
import SpinWheel from "../components/SpinWheel";
import { StatusBadge, fmtDateTime, fmtN } from "../components/ui";
import {
  getMySpins, getRecentWinners, getSpinConfig, refreshMySpins, refreshSpinWinners, spinWheel,
} from "../lib/services";
import { useAction, useData, useUser } from "../lib/store";

function useCountdown(target: number | null) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (target === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [target]);
  if (target === null) return null;
  const remaining = Math.max(0, target - now);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  return {
    compact: `${hours}h ${minutes}m`,
    clock: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`,
  };
}

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

  const displayedSpins = pendingSpinId ? spins.filter((spin) => spin.id !== pendingSpinId) : spins;
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayReward = displayedSpins
    .filter((spin) => spin.createdAt >= dayStart.getTime() && spin.rewardType === "cash" && spin.amount > 0)
    .reduce((sum, spin) => sum + spin.amount, 0);
  const wins = displayedSpins.filter((spin) => spin.rewardType !== "none").length;
  const highestPrize = config.segments
    .filter((segment) => segment.type === "cash" && segment.amount > 0)
    .reduce((maximum, segment) => Math.max(maximum, segment.amount), 0);

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
    });
    if (result === null) {
      setWinningIndex(null);
      setSpinning(false);
      setPendingSpinId(null);
    }
  };

  if (!config.enabled) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-3xl border border-slate-200 bg-white px-6 py-20 text-center shadow-sm">
        <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Disc3 className="h-8 w-8" />
        </span>
        <h1 className="mt-5 text-xl font-bold text-slate-900">Daily Spin is taking a break</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">The wheel is paused right now. Check back soon for your next chance to win.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-12">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[.18em] text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,.14)]" />
            EarnHub Daily Spin
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950 md:text-3xl">Spin for your next reward.</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">One secure spin every 24 hours. The result is locked before the wheel moves.</p>
        </div>
        <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-500 shadow-sm sm:flex">
          <ShieldCheck className="h-4 w-4 text-emerald-600" /> Server-verified rewards
        </div>
      </div>

      {/* Main wheel stage */}
      <section className="relative isolate overflow-hidden rounded-[28px] border border-slate-800 bg-[#07111f] shadow-[0_24px_70px_rgba(15,23,42,.18)]">
        <div className="pointer-events-none absolute -left-28 -top-36 h-96 w-96 rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-44 right-0 h-[28rem] w-[28rem] rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 opacity-[.08]" style={{ backgroundImage: "radial-gradient(#cbd5e1 .7px, transparent .7px)", backgroundSize: "19px 19px" }} />

        <div className="relative grid items-center gap-8 px-5 py-7 sm:px-8 sm:py-9 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,.9fr)] lg:gap-5 lg:px-12 lg:py-10">
          <div className="flex flex-col items-center">
            <div className="mb-1 flex w-full max-w-[470px] items-center justify-between px-1 text-[10px] font-bold uppercase tracking-[.2em] text-emerald-100/65">
              <span className="inline-flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-emerald-300" /> Prize wheel</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] tracking-[.14em] text-white/60">1 spin / 24h</span>
            </div>
            <SpinWheel
              segments={config.segments}
              spinning={spinning}
              winningIndex={winningIndex}
              onSpin={() => void doSpin()}
              disabled={!canSpinAgain}
              onAnimationEnd={handleAnimationEnd}
            />
            <p className="-mt-1 text-center text-[10px] font-medium tracking-wide text-white/40">Tap the center to spin · no purchase required for today’s spin</p>
          </div>

          <aside className="mx-auto w-full max-w-md lg:pl-5">
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.17em] text-emerald-100/75">
              <Zap className="h-3.5 w-3.5 text-amber-300" /> Your daily drop
            </div>
            <h2 className="max-w-md text-3xl font-bold leading-[1.08] tracking-tight text-white sm:text-4xl">
              A little luck. <span className="text-emerald-300">A real reward.</span>
            </h2>
            <p className="mt-4 max-w-sm text-sm leading-6 text-slate-300/75">
              Give the wheel a spin and see what lands. Cash prizes are credited to your wallet; every result is recorded securely.
            </p>

            <div className="mt-7 rounded-2xl border border-white/10 bg-white/[.055] p-4 shadow-inner shadow-white/[.025]">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[.16em] text-slate-400">Top cash prize</p>
                  <p className="mt-1 text-3xl font-bold tracking-tight text-white">{highestPrize > 0 ? fmtN(highestPrize) : "—"}</p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/15 bg-amber-300/10 text-amber-200">
                  <Coins className="h-6 w-6" />
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {config.segments.filter((segment) => segment.type === "cash" && segment.amount > 0).slice(0, 4).map((segment, index) => (
                  <span key={`${segment.label}-${index}`} className="rounded-full border border-white/10 bg-slate-950/30 px-2.5 py-1 text-[10px] font-semibold text-slate-200">
                    {segment.label}
                  </span>
                ))}
                {config.segments.some((segment) => segment.type === "bonus_task") && (
                  <span className="rounded-full border border-white/10 bg-slate-950/30 px-2.5 py-1 text-[10px] font-semibold text-slate-200">Bonus task</span>
                )}
              </div>
            </div>

            {canSpinAgain ? (
              <button
                type="button"
                onClick={() => void doSpin()}
                disabled={spinning}
                className="mt-5 inline-flex w-full items-center justify-center gap-2.5 rounded-xl bg-emerald-300 px-5 py-3.5 text-sm font-extrabold text-emerald-950 shadow-[0_8px_28px_rgba(52,211,153,.18)] transition hover:-translate-y-0.5 hover:bg-emerald-200 hover:shadow-[0_12px_32px_rgba(52,211,153,.28)] active:translate-y-0 disabled:cursor-wait disabled:opacity-70 sm:w-auto sm:min-w-[190px]"
              >
                {spinning ? <RotateIcon /> : <Sparkles className="h-4 w-4" />}
                {spinning ? "Spinning…" : "Spin now"}
                {!spinning && <ArrowUpRight className="h-4 w-4" />}
              </button>
            ) : (
              <div className="mt-5 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/[.06] p-4 sm:max-w-sm">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-emerald-200"><Timer className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400">Next spin unlocks in</p>
                  <p className="mt-0.5 font-mono text-lg font-bold tabular-nums tracking-wide text-white">{countdown?.clock ?? "00:00:00"}</p>
                </div>
                <Clock3 className="h-4 w-4 text-white/30" />
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
              <MiniFeature icon={<Clock3 className="h-4 w-4" />} title="Daily chance" detail="Resets every 24h" />
              <MiniFeature icon={<ShieldCheck className="h-4 w-4" />} title="Fair result" detail="Server secured" />
            </div>
          </aside>
        </div>
      </section>

      {/* Your numbers */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Coins className="h-4 w-4" />} label="Earned today" value={todayReward > 0 ? fmtN(todayReward) : "—"} tone="emerald" />
        <StatCard icon={<Medal className="h-4 w-4" />} label="Total wins" value={String(wins)} tone="amber" />
        <StatCard icon={<Disc3 className="h-4 w-4" />} label="Total spins" value={String(displayedSpins.length)} tone="slate" />
      </div>

      {/* Recent winners and history */}
      <div className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Trophy className="h-4.5 w-4.5" /></span>
              <div><h3 className="text-sm font-bold text-slate-900">Recent winners</h3><p className="mt-0.5 text-[11px] text-slate-400">A peek at today’s luck</p></div>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live</span>
          </div>
          {winners.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <Trophy className="h-7 w-7 text-slate-200" />
              <p className="mt-2 text-xs font-medium text-slate-400">No winners to show yet</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/80 px-5">
              {winners.slice(0, 6).map((winner, index) => (
                <div key={`${winner.winner}-${winner.wonAt}-${index}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${index === 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}>
                      {index === 0 ? <Medal className="h-4 w-4" /> : String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-700">{winner.winner}</p><p className="mt-0.5 text-[10px] text-slate-400">{fmtDateTime(winner.wonAt)}</p></div>
                  </div>
                  <span className="shrink-0 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700">{fmtN(winner.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Hourglass className="h-4 w-4" /></span>
            <div><h3 className="text-sm font-bold text-slate-900">Spin history</h3><p className="mt-0.5 text-[11px] text-slate-400">Your latest results and references</p></div>
          </div>
          {displayedSpins.length === 0 ? (
            <div className="flex flex-col items-center px-5 py-10 text-center">
              <Sparkles className="h-7 w-7 text-slate-200" />
              <p className="mt-2 text-xs font-medium text-slate-400">Your first spin is waiting</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100/80 px-5">
              {displayedSpins.slice(0, 8).map((spin) => (
                <div key={spin.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${spin.rewardType === "cash" && spin.amount > 0 ? "bg-emerald-50 text-emerald-700" : spin.rewardType === "bonus_task" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-400"}`}>
                      {spin.rewardType === "cash" && spin.amount > 0 ? <Coins className="h-4 w-4" /> : spin.rewardType === "bonus_task" ? <Sparkles className="h-4 w-4" /> : <Disc3 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-700">{spin.label}</p><p className="mt-0.5 truncate font-mono text-[9px] text-slate-400">{spin.reference}</p></div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className={`text-xs font-bold ${spin.rewardType === "cash" && spin.amount > 0 ? "text-emerald-700" : "text-slate-400"}`}>
                      {spin.rewardType === "cash" && spin.amount > 0 ? fmtN(spin.amount) : spin.rewardType === "bonus_task" ? "Bonus" : "—"}
                    </span>
                    <StatusBadge status={spin.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RotateIcon() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-emerald-950/20 border-t-emerald-950" />;
}

function MiniFeature({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-emerald-300">{icon}</span>
      <div><p className="text-[11px] font-semibold text-white/85">{title}</p><p className="mt-0.5 text-[10px] text-slate-400">{detail}</p></div>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone: "emerald" | "amber" | "slate" }) {
  const tones = {
    emerald: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-600",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>{icon}</span>
      <div className="min-w-0"><p className="truncate text-[10px] font-bold uppercase tracking-[.15em] text-slate-400">{label}</p><p className="mt-0.5 text-lg font-bold text-slate-900">{value}</p></div>
    </div>
  );
}
