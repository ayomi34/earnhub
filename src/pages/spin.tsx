import { useEffect, useState } from "react";
import { Disc3, Hourglass, Timer, Trophy } from "lucide-react";
import SpinWheel from "../components/SpinWheel";
import { Badge, Button, Card, CardHeader, EmptyState, PageHead, StatusBadge, Td, Table, fmtDateTime, fmtN } from "../components/ui";
import {
  getMySpins, getRecentWinners, getSpinConfig, refreshSpinWinners, spinWheel,
} from "../lib/services";
import { useAction, useData, useUser } from "../lib/store";

/* ================= DAILY SPIN PAGE ================= */

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

  useEffect(() => {
    void refreshSpinWinners();
  }, []);

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const todayReward = spins
    .filter((s) => s.createdAt >= dayStart.getTime() && s.rewardType === "cash" && s.amount > 0)
    .reduce((sum, s) => sum + s.amount, 0);

  const doSpin = async () => {
    if (spinning || !canSpinAgain) return;
    setSpinning(true);
    setWinningIndex(null);
    const result = await run(async () => {
      const { spin } = await spinWheel(user.id);
      setWinningIndex(spin.segmentIndex);
      void refreshSpinWinners();
      window.setTimeout(() => setSpinning(false), 5200);
      return spin;
    }, undefined);
    if (result === null) {
      // run() already showed an error toast — reset so the user can retry.
      setWinningIndex(null);
      setSpinning(false);
    }
  };

  if (!config.enabled) {
    return (
      <div>
        <PageHead title="Daily Spin" sub="Your daily chance to win a reward" />
        <Card>
          <EmptyState icon={<Disc3 className="h-5 w-5" />} title="Daily spin is paused" sub="Check back soon — the wheel will return." />
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHead title="Daily Spin" sub="Your daily chance to win a reward" />

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* ---------- wheel column ---------- */}
        <Card className="p-6">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[13px] font-semibold text-slate-800">Next Spin</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {canSpinAgain ? "You have a free spin ready" : `Available again in ${countdown?.labelWithSeconds ?? "—"}`}
              </p>
            </div>
            <Badge tone={canSpinAgain ? "green" : "slate"}>{canSpinAgain ? "Ready" : "1 / day"}</Badge>
          </div>

          <SpinWheel
            segments={config.segments}
            spinning={spinning}
            winningIndex={winningIndex}
            onSpin={() => void doSpin()}
            disabled={!canSpinAgain}
          />

          <div className="mt-6 text-center">
            {canSpinAgain ? (
              <Button onClick={() => void doSpin()} disabled={spinning}>
                {spinning ? "Spinning…" : "Spin now"}
              </Button>
            ) : (
              <p className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-4 py-2 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
                <Timer className="h-3.5 w-3.5" />
                Next spin in {countdown?.labelWithSeconds ?? "—"}
              </p>
            )}
          </div>
        </Card>

        {/* ---------- side column ---------- */}
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Today's Reward</p>
              <p className="mt-1 text-lg font-bold text-slate-900">{todayReward > 0 ? fmtN(todayReward) : "—"}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Total Wins</p>
              <p className="mt-1 text-lg font-bold text-slate-900">
                {spins.filter((s) => s.rewardType !== "none").length}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader title="Recent Winners" sub="Cash winners across the platform" />
            {winners.length === 0 ? (
              <EmptyState icon={<Trophy className="h-5 w-5" />} title="No winners yet" sub="Be the first to land a cash reward." />
            ) : (
              <div className="divide-y divide-slate-100">
                {winners.slice(0, 6).map((w, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-50 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                        {w.winner.charAt(0)}
                      </span>
                      <span className="text-sm font-medium text-slate-700">{w.winner}</span>
                    </div>
                    <span className="text-sm font-bold text-brand">{fmtN(w.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ---------- history ---------- */}
      <Card className="mt-5">
        <CardHeader title="Your spin history" sub="Every spin is recorded with a unique reference" />
        {spins.length === 0 ? (
          <EmptyState icon={<Hourglass className="h-5 w-5" />} title="No spins yet" sub="Your first free spin is waiting." />
        ) : (
          <Table head={["Date", "Result", "Reward", "Status", "Reference"]}>
            {spins.slice(0, 30).map((s) => (
              <tr key={s.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(s.createdAt)}</Td>
                <Td className="font-medium">{s.label}</Td>
                <Td className="font-semibold">
                  {s.rewardType === "cash" && s.amount > 0 ? fmtN(s.amount) : s.rewardType === "bonus_task" ? "Bonus Task" : "—"}
                </Td>
                <Td><StatusBadge status={s.status} /></Td>
                <Td className="whitespace-nowrap font-mono text-[11px] text-slate-400">{s.reference}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}