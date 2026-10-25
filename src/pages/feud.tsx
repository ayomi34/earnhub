import { useState, useEffect, useRef } from "react";
import {
  Trophy,
  Timer,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Zap,
  Info,
  Star,
  Target,
  Clock,
  Play,
  Award,
  TrendingUp,
} from "lucide-react";
import { Badge, Button, Card, fmtN, fmtDateTime } from "../components/ui";
import {
  getFeudConfig,
  getMyFeudSessions,
  todayFeudGamesCount,
  canStartFeudGame,
  startFeudGame,
  submitFeudAnswer,
  completeFeudGameOnTimeout,
  type FeudGameStartResult,
} from "../lib/feudServices";
import { useAction, useData, useToast, useUser } from "../lib/store";

/* ─────────────────────── helpers ─────────────────────── */
function CircularTimer({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = Math.max(0, timeLeft / total);
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const urgent = timeLeft <= 5;
  const warning = timeLeft <= 10 && !urgent;

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="-rotate-90" width="96" height="96">
        <circle cx="48" cy="48" r={r} fill="none" strokeWidth="6" stroke="rgba(255,255,255,0.12)" />
        <circle
          cx="48" cy="48" r={r} fill="none" strokeWidth="6"
          stroke={urgent ? "#ef4444" : warning ? "#f59e0b" : "#22c55e"}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-2xl font-black tabular-nums ${urgent ? "text-red-400 animate-pulse" : "text-white"}`}>
          {timeLeft}
        </span>
        <span className="text-[10px] font-medium text-white/50">SEC</span>
      </div>
    </div>
  );
}

function ScoreBar({ current, target }: { current: number; target: number }) {
  const pct = Math.min(100, Math.round((current / target) * 100));
  return (
    <div className="w-full">
      <div className="mb-1.5 flex justify-between text-xs font-semibold">
        <span className="text-white/70">SCORE</span>
        <span className="text-white">{current} / {target} pts</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-300 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* Answer board — the "flip card" style row */
function AnswerBoard({
  index,
  text,
  state,
  points,
  onClick,
  disabled,
}: {
  index: number;
  text: string;
  state: "idle" | "selected" | "revealed-hit" | "revealed-miss" | "dimmed";
  points?: number;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const base = "relative flex w-full items-center gap-3 overflow-hidden rounded-xl border-2 px-4 py-3.5 text-left transition-all duration-200";

  const styles: Record<string, string> = {
    idle: `${base} cursor-pointer border-white/10 bg-white/5 text-white hover:border-green-400/60 hover:bg-green-500/10 active:scale-[0.98]`,
    selected: `${base} cursor-default border-green-400 bg-green-500/20 text-white shadow-[0_0_0_1px_#22c55e30]`,
    "revealed-hit": `${base} cursor-default border-green-400 bg-green-500/25 text-green-300`,
    "revealed-miss": `${base} cursor-default border-white/5 bg-white/3 text-white/30`,
    dimmed: `${base} cursor-default border-white/5 bg-white/3 text-white/30`,
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || state !== "idle"}
      className={styles[state] ?? styles.idle}
    >
      {/* Index bubble */}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
        state === "revealed-hit" ? "bg-green-400 text-black"
        : state === "selected" ? "bg-green-500 text-white"
        : "bg-white/10 text-white/60"
      }`}>
        {index + 1}
      </span>

      {/* Text */}
      <span className="flex-1 text-sm font-semibold leading-tight">{text}</span>

      {/* Points badge on reveal */}
      {(state === "revealed-hit" || state === "selected") && points !== undefined && points > 0 && (
        <span className="ml-auto rounded-md bg-green-400/20 px-2 py-0.5 text-xs font-black text-green-300">
          +{points}
        </span>
      )}
      {state === "revealed-miss" && (
        <span className="ml-auto text-xs text-white/20">✕</span>
      )}
    </button>
  );
}

/* ─────────────────────── main page ─────────────────────── */
export function FeudGamePage() {
  const user = useUser()!;
  const toast = useToast();
  const { busy, run } = useAction();

  const cfg = useData(getFeudConfig);
  const mySessions = useData(() => getMyFeudSessions(user.id));
  const todayCount = useData(() => todayFeudGamesCount(user.id));
  const eligibility = useData(() => canStartFeudGame(user.id));

  const [gameState, setGameState] = useState<"idle" | "playing" | "revealed" | "summary">("idle");
  const [activeGame, setActiveGame] = useState<FeudGameStartResult | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState<number>(25);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [revealedOptions, setRevealedOptions] = useState<{ id: string; text: string; points: number; rank: number }[] | null>(null);
  const [roundPoints, setRoundPoints] = useState<number>(0);
  const [gameResult, setGameResult] = useState<{
    score: number;
    targetPoints: number;
    reward: number;
    timeSpent: number;
  } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (gameState !== "playing") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          void handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [gameState]);

  const handleTimeout = async () => {
    if (!activeGame) return;
    toast("info", "Time expired!");
    const session = await completeFeudGameOnTimeout(user.id, activeGame.session.id);
    setGameResult({ score: session.score, targetPoints: session.targetPoints, reward: session.rewardAmount, timeSpent: session.timeSpentSeconds });
    setGameState("summary");
  };

  const handleStart = async () => {
    if (!eligibility.allowed) { toast("error", eligibility.reason || "You cannot start a game right now."); return; }
    const result = await run(async () => startFeudGame(user.id));
    if (result) {
      setActiveGame(result);
      setCurrentQIndex(0);
      setCurrentScore(0);
      setTimeLeft(result.timeLimitSeconds || 25);
      setSelectedAnswerId(null);
      setRevealedOptions(null);
      setRoundPoints(0);
      setGameResult(null);
      setGameState("playing");
    }
  };

  const handleSelectAnswer = async (answerId: string) => {
    if (gameState !== "playing" || !activeGame || busy) return;
    setSelectedAnswerId(answerId);
    const currQ = activeGame.questions[currentQIndex];
    const res = await run(async () => submitFeudAnswer(user.id, activeGame.session.id, currQ.id, answerId));
    if (res) {
      setRevealedOptions(res.revealedAnswers);
      setRoundPoints(res.pointsEarned);
      setCurrentScore(res.session.score);
      setGameState("revealed");
      if (res.isGameComplete) {
        setTimeout(() => {
          setGameResult({ score: res.session.score, targetPoints: res.session.targetPoints, reward: res.session.rewardAmount, timeSpent: res.session.timeSpentSeconds });
          setGameState("summary");
        }, 2200);
      }
    }
  };

  const handleNextQuestion = () => {
    if (!activeGame) return;
    if (currentQIndex + 1 < activeGame.questions.length) {
      setCurrentQIndex((prev) => prev + 1);
      setSelectedAnswerId(null);
      setRevealedOptions(null);
      setRoundPoints(0);
      setGameState("playing");
    } else {
      setGameState("summary");
    }
  };

  const currentQ = activeGame ? activeGame.questions[currentQIndex] : null;

  /* ── IDLE / LOBBY ── */
  if (gameState === "idle") {
    const bestReward = Math.max(0, ...mySessions.map((s) => s.rewardAmount));
    const bestScore  = Math.max(0, ...mySessions.map((s) => s.score));

    return (
      <div className="space-y-5">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-8 text-white shadow-xl">
          {/* decorative glow */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full bg-green-500/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-8 left-1/3 h-32 w-32 rounded-full bg-emerald-400/10 blur-2xl" />

          <div className="relative">
            <div className="mb-3 flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-500/20 text-green-400">
                <Star className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-green-500/15 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-green-400">
                Live Game
              </span>
            </div>
            <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Survey Feud</h1>
            <p className="mt-1.5 max-w-sm text-sm text-white/60">
              Guess the most popular survey answers, beat the clock, and earn real rewards.
            </p>

            <div className="mt-6 grid grid-cols-3 gap-3 border-t border-white/10 pt-5">
              <div>
                <p className="text-xl font-black text-green-400">{fmtN(cfg.target200Reward)}</p>
                <p className="mt-0.5 text-[11px] text-white/40">jackpot reward</p>
              </div>
              <div>
                <p className="text-xl font-black text-white">{cfg.timeLimitSeconds}s</p>
                <p className="mt-0.5 text-[11px] text-white/40">per game</p>
              </div>
              <div>
                <p className="text-xl font-black text-white">{cfg.questionsPerGame}</p>
                <p className="mt-0.5 text-[11px] text-white/40">questions</p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {eligibility.allowed ? (
                <button
                  onClick={handleStart}
                  disabled={busy}
                  className="group flex items-center gap-2 rounded-xl bg-green-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-green-500/25 transition-all hover:bg-green-400 hover:shadow-green-400/30 active:scale-95 disabled:opacity-60"
                >
                  {busy ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <Play className="h-4 w-4 fill-white" />
                  )}
                  Start Game
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{eligibility.reason}</span>
                </div>
              )}
              <div className="text-xs text-white/30">
                {todayCount} of {cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"} games used today
              </div>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games Played", value: mySessions.length, icon: <Zap className="h-4 w-4" />, color: "text-blue-500" },
            { label: "Best Score", value: `${bestScore} pts`, icon: <Target className="h-4 w-4" />, color: "text-purple-500" },
            { label: "Best Reward", value: fmtN(bestReward), icon: <Trophy className="h-4 w-4" />, color: "text-amber-500" },
            { label: "Daily Limit", value: `${todayCount}/${cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"}`, icon: <Clock className="h-4 w-4" />, color: "text-green-500" },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 ${stat.color}`}>
                {stat.icon}
              </div>
              <p className="text-lg font-black text-slate-900">{stat.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* How to play */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50">
              <Info className="h-4 w-4 text-green-600" />
            </span>
            <h2 className="text-sm font-bold text-slate-800">How to play</h2>
          </div>
          <div className="space-y-3">
            {[
              { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, text: `Each game has ${cfg.questionsPerGame} questions — pick the answer you think most people gave in a survey.` },
              { icon: <CheckCircle2 className="h-4 w-4 text-green-500" />, text: `Popular answers score more points. You have ${cfg.timeLimitSeconds} seconds total for the entire game.` },
              { icon: <TrendingUp className="h-4 w-4 text-blue-500" />, text: `Score ${cfg.minScoreForReward}+ points to earn a tiered reward. Hit ${cfg.targetPoints} points for the jackpot of ${fmtN(cfg.target200Reward)}.` },
              { icon: <AlertCircle className="h-4 w-4 text-amber-500" />, text: `You can play up to ${cfg.dailyLimit > 0 ? cfg.dailyLimit : "unlimited"} games per day. Rewards are credited instantly to your wallet.` },
            ].map((item, i) => (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 shrink-0">{item.icon}</span>
                <p className="text-sm text-slate-600">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent games */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Recent games</h2>
              <p className="text-xs text-slate-400">Your last Family Feud sessions</p>
            </div>
          </div>
          {mySessions.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                <Trophy className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">No games yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">Play your first game to start earning rewards.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {mySessions.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${s.rewardAmount > 0 ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                      {s.rewardAmount > 0 ? <Trophy className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.score}/{s.targetPoints} pts</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(s.completedAt || s.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.rewardAmount > 0 && (
                      <span className="text-sm font-bold text-green-600">{fmtN(s.rewardAmount)}</span>
                    )}
                    <Badge tone={s.rewardAmount > 0 ? "green" : "slate"}>
                      {s.rewardAmount > 0 ? "Rewarded" : s.completed ? "Done" : "In progress"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── PLAYING / REVEALED ── */
  if ((gameState === "playing" || gameState === "revealed") && activeGame && currentQ) {
    const totalQ = activeGame.questions.length;

    return (
      <div className="flex flex-col gap-4">
        {/* Game header bar */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 px-5 py-4 shadow-xl">
          {/* decorative */}
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-green-500/5 to-transparent" />

          <div className="relative flex flex-wrap items-center gap-4">
            {/* Timer */}
            <CircularTimer timeLeft={timeLeft} total={activeGame.timeLimitSeconds || 25} />

            {/* Score + progress */}
            <div className="flex flex-1 flex-col gap-3 min-w-0">
              <ScoreBar current={currentScore} target={activeGame.session.targetPoints} />
              {/* Question bubbles */}
              <div className="flex gap-1.5">
                {activeGame.questions.map((_, i) => (
                  <div
                    key={i}
                    className={`h-2 flex-1 rounded-full transition-colors ${
                      i < currentQIndex ? "bg-green-400"
                      : i === currentQIndex ? "bg-white"
                      : "bg-white/15"
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-white/40">
                Question {currentQIndex + 1} of {totalQ} · {currentQ.category}
              </p>
            </div>
          </div>
        </div>

        {/* Question + answers */}
        <div className="overflow-hidden rounded-2xl bg-gradient-to-b from-slate-900 to-slate-800 shadow-xl">
          {/* Question prompt */}
          <div className="border-b border-white/8 px-5 py-5">
            <div className="mb-2 flex items-center gap-2">
              <span className="rounded-md bg-green-500/15 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-green-400">
                Survey says...
              </span>
              {currentQ.difficulty && (
                <span className="rounded-md bg-white/5 px-2 py-0.5 text-[11px] text-white/40">
                  {currentQ.difficulty}
                </span>
              )}
            </div>
            <h2 className="text-lg font-black leading-snug text-white sm:text-xl">
              {currentQ.prompt}
            </h2>
          </div>

          {/* Answers */}
          <div className="space-y-2.5 p-4 sm:p-5">
            {currentQ.answers.map((a, i) => {
              let state: "idle" | "selected" | "revealed-hit" | "revealed-miss" | "dimmed" = "idle";
              if (gameState === "revealed") {
                const isSelected = selectedAnswerId === a.id;
                const hitData = isSelected ? revealedOptions?.find((r) => r.id === a.id) : undefined;
                if (isSelected && hitData) state = "revealed-hit";
                else if (isSelected) state = "revealed-miss";
                else state = "dimmed";
              } else if (selectedAnswerId === a.id) {
                state = "selected";
              }
              return (
                <AnswerBoard
                  key={a.id}
                  index={i}
                  text={a.text}
                  state={state}
                  points={revealedOptions?.find((r) => r.id === a.id)?.points}
                  onClick={() => handleSelectAnswer(a.id)}
                  disabled={busy || gameState !== "playing"}
                />
              );
            })}
          </div>

          {/* Post-answer feedback */}
          {gameState === "revealed" && (
            <div className="border-t border-white/8 px-5 py-4">
              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  {roundPoints > 0 ? (
                    <p className="font-bold text-green-400">
                      🎉 +{roundPoints} points!
                    </p>
                  ) : (
                    <p className="font-bold text-white/50">
                      Not on the board this round
                    </p>
                  )}
                  <p className="mt-0.5 text-xs text-white/30">
                    Running total: {currentScore} / {activeGame.session.targetPoints} pts
                  </p>
                </div>
                {currentQIndex + 1 < activeGame.questions.length ? (
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-green-400 active:scale-95"
                  >
                    Next question <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-amber-400 active:scale-95"
                  >
                    See results <Trophy className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── SUMMARY ── */
  if (gameState === "summary" && gameResult) {
    const won = gameResult.reward > 0;
    const pct = Math.min(100, Math.round((gameResult.score / gameResult.targetPoints) * 100));

    return (
      <div className="flex flex-col gap-4">
        {/* Result hero */}
        <div className={`relative overflow-hidden rounded-2xl px-6 py-8 text-center shadow-xl ${won ? "bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900" : "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"}`}>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-5">
            <Trophy className="h-64 w-64" />
          </div>
          <div className="relative">
            {/* Icon */}
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${won ? "bg-green-500/20" : "bg-white/10"}`}>
              {won
                ? <Trophy className="h-10 w-10 text-green-400" />
                : <Sparkles className="h-10 w-10 text-white/60" />
              }
            </div>

            <h2 className={`mt-4 text-3xl font-black ${won ? "text-green-300" : "text-white"}`}>
              {won ? "You won!" : "Game over"}
            </h2>
            <p className="mt-1 text-sm text-white/50">
              {won ? `₦${gameResult.reward.toLocaleString()} credited to your wallet` : `Score ${cfg.minScoreForReward}+ pts next time to earn a reward`}
            </p>

            {/* Score display */}
            <div className="mx-auto mt-6 max-w-xs">
              <div className="mb-2 flex justify-between text-xs text-white/40">
                <span>0</span>
                <span>{gameResult.targetPoints} pts</span>
              </div>
              <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${won ? "bg-gradient-to-r from-green-500 to-emerald-300" : "bg-gradient-to-r from-slate-500 to-slate-400"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-3 text-4xl font-black text-white">
                {gameResult.score} <span className="text-lg font-medium text-white/40">pts</span>
              </p>
              <p className="mt-1 text-xs text-white/30">completed in {gameResult.timeSpent}s</p>
            </div>

            {/* Reward badge */}
            {won && (
              <div className="mx-auto mt-5 flex max-w-xs items-center justify-center gap-2 rounded-xl bg-green-500/15 px-5 py-3">
                <Award className="h-5 w-5 text-green-400" />
                <span className="text-lg font-black text-green-300">{fmtN(gameResult.reward)}</span>
                <span className="text-sm text-green-500">earned</span>
              </div>
            )}
          </div>
        </div>

        {/* Score breakdown card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">Game summary</h3>
          <div className="grid grid-cols-3 gap-4 text-center">
            {[
              { label: "Final score", value: `${gameResult.score} pts` },
              { label: "Target", value: `${gameResult.targetPoints} pts` },
              { label: "Time spent", value: `${gameResult.timeSpent}s` },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 px-3 py-3.5">
                <p className="text-lg font-black text-slate-900">{item.value}</p>
                <p className="mt-0.5 text-xs text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => { setGameState("idle"); setActiveGame(null); setGameResult(null); }}
          >
            <RotateCcw className="h-4 w-4" /> Back to lobby
          </Button>
          <button
            onClick={handleStart}
            disabled={busy || (cfg.dailyLimit > 0 && todayCount >= cfg.dailyLimit)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-500 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-green-500/20 transition-all hover:bg-green-400 active:scale-95 disabled:opacity-50"
          >
            {busy
              ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              : <Zap className="h-4 w-4" />
            }
            Play again
          </button>
        </div>
      </div>
    );
  }

  return null;
}
