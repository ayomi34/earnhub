import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Clock3, Coins, Disc3, Hourglass, Medal, Trophy } from "lucide-react";
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
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
      <div className="mx-auto flex max-w-xl flex-col items-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center">
        <Disc3 className="h-8 w-8 text-slate-300" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Daily Spin is unavailable</h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Please check back later.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12 text-slate-900">
      <header className="pb-1">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em] text-slate-900 sm:text-[30px]">Daily Spin</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-slate-600">Try the wheel once every 24 hours. Cash rewards are added to your account when you win.</p>
      </header>

      <section className="grid items-center gap-5 overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(280px,.95fr)] lg:gap-8 lg:p-8">
        <div className="rounded-xl bg-slate-50 px-3 py-4 sm:px-5 sm:py-5">
          <SpinWheel
            segments={config.segments}
            spinning={spinning}
            winningIndex={winningIndex}
            onSpin={() => void doSpin()}
            disabled={!canSpinAgain}
            onAnimationEnd={handleAnimationEnd}
          />
        </div>

        <div className="mx-auto w-full max-w-md py-2 lg:py-4">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">Today’s wheel</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            There is one spin available every 24 hours. Use the button in the centre of the wheel to play.
          </p>

          <div className="mt-6 border-y border-slate-200 py-5">
            <p className="text-sm font-medium text-slate-500">Top cash prize</p>
            <p className="mt-1 text-3xl font-semibold leading-tight tracking-tight tabular-nums text-slate-900">
              {highestPrize > 0 ? fmtN(highestPrize) : "—"}
            </p>
            <p className="mt-1 text-sm text-slate-500">See the wheel for the available rewards.</p>
          </div>

          <div className="mt-5 flex min-h-12 items-center gap-3">
            {canSpinAgain ? (
              <>
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-600" />
                <p className="text-sm font-medium text-emerald-800">Your daily spin is ready.</p>
              </>
            ) : (
              <>
                <Clock3 className="h-5 w-5 shrink-0 text-slate-500" />
                <div>
                  <p className="text-sm text-slate-600">Next spin available in</p>
                  <p className="mt-0.5 font-mono text-lg font-semibold tabular-nums text-slate-900">{countdown ?? "00:00:00"}</p>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      <section aria-label="Spin totals" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard icon={<Coins className="h-4 w-4" />} label="Earned today" value={todayReward > 0 ? fmtN(todayReward) : "—"} />
        <StatCard icon={<Medal className="h-4 w-4" />} label="Winning spins" value={String(wins)} />
        <StatCard icon={<Disc3 className="h-4 w-4" />} label="Total spins" value={String(displayedSpins.length)} />
      </section>

      <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <SectionHeading icon={<Trophy className="h-4 w-4" />} title="Recent winners" />
          {winners.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">No recent cash winners.</p>
          ) : (
            <div className="divide-y divide-slate-100 px-5">
              {winners.slice(0, 6).map((winner, index) => (
                <div key={`${winner.winner}-${winner.wonAt}-${index}`} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">
                      {index === 0 ? <Medal className="h-4 w-4" /> : String(index + 1)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{winner.winner}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{fmtDateTime(winner.wonAt)}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-emerald-800">{fmtN(winner.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <SectionHeading icon={<Hourglass className="h-4 w-4" />} title="Spin history" detail="Your latest results" />
          {displayedSpins.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">Your completed spins will appear here.</p>
          ) : (
            <div className="divide-y divide-slate-100 px-5">
              {displayedSpins.slice(0, 8).map((spin) => (
                <div key={spin.id} className="flex items-center justify-between gap-3 py-3.5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${spin.rewardType === "cash" && spin.amount > 0 ? "bg-emerald-50 text-emerald-700" : spin.rewardType === "bonus_task" ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"}`}>
                      {spin.rewardType === "cash" && spin.amount > 0 ? <Coins className="h-4 w-4" /> : spin.rewardType === "bonus_task" ? <Disc3 className="h-4 w-4" /> : <Disc3 className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{spin.label}</p>
                      <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500">{spin.reference}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`text-sm font-semibold tabular-nums ${spin.rewardType === "cash" && spin.amount > 0 ? "text-emerald-800" : "text-slate-500"}`}>
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

function SectionHeading({ icon, title, detail }: { icon: ReactNode; title: string; detail?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
      <span className="text-slate-500">{icon}</span>
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-slate-500">{label}</p>
        <p className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
  );
}
