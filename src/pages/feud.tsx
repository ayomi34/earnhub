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
  Users,
} from "lucide-react";
import { Badge, Button, fmtN, fmtDateTime } from "../components/ui";
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

/* ─────────────────────── timer ring ─────────────────────── */
function TimerRing({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct = Math.max(0, timeLeft / total);
  const r = 32;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;
  const urgent = timeLeft <= 5;
  const warn = timeLeft <= 10 && !urgent;
  const color = urgent ? "#ef4444" : warn ? "#f59e0b" : "#16a34a";

  return (
    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center">
      <svg className="-rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" strokeWidth="5" stroke="#e2e8f0" />
        <circle
          cx="40" cy="40" r={r} fill="none" strokeWidth="5"
          stroke={color}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-xl font-black tabular-nums leading-none ${urgent ? "text-red-500 animate-pulse" : warn ? "text-amber-500" : "text-slate-800"}`}>
          {timeLeft}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">sec</span>
      </div>
    </div>
  );
}

/* ─────────────────────── answer board ─────────────────────── */
type AnswerState = "idle" | "pending" | "hit" | "miss" | "dimmed";

function AnswerBoard({
  index, text, state, points, onClick, disabled,
}: {
  index: number; text: string; state: AnswerState;
  points?: number; onClick?: () => void; disabled?: boolean;
}) {
  const base =
    "group relative flex w-full items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50";

  const variants: Record<AnswerState, string> = {
    idle:    `${base} cursor-pointer border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-brand-50 hover:text-brand-dark active:scale-[0.98] shadow-sm`,
    pending: `${base} cursor-default border-brand/40 bg-brand-50 text-brand-dark shadow-sm`,
    hit:     `${base} cursor-default border-green-400 bg-green-50 text-green-800 shadow-sm`,
    miss:    `${base} cursor-default border-red-200 bg-red-50 text-red-400`,
    dimmed:  `${base} cursor-default border-slate-100 bg-slate-50 text-slate-300`,
  };

  return (
    <button onClick={onClick} disabled={disabled || state !== "idle"} className={variants[state]}>
      {/* Index bubble */}
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-black transition-colors ${
        state === "hit"     ? "bg-green-500 text-white"
        : state === "miss"  ? "bg-red-300 text-white"
        : state === "pending" ? "bg-brand text-white"
        : state === "idle"  ? "bg-slate-100 text-slate-500 group-hover:bg-brand group-hover:text-white"
        : "bg-slate-100 text-slate-300"
      }`}>
        {index + 1}
      </span>

      <span className="flex-1 leading-tight">{text}</span>

      {state === "hit" && points !== undefined && points > 0 && (
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-green-100 px-2.5 py-1 text-xs font-black text-green-700">
          +{points} pts
        </span>
      )}
      {state === "miss" && (
        <span className="ml-auto text-red-300 text-base font-bold">✕</span>
      )}
      {state === "idle" && (
        <ChevronRight className="ml-auto h-4 w-4 text-slate-300 transition-colors group-hover:text-brand/50" />
      )}
    </button>
  );
}

/* ─────────────────────── main page ─────────────────────── */
export function FeudGamePage() {
  const user = useUser()!;
  const toast = useToast();
  const { busy, run } = useAction();

  const cfg          = useData(getFeudConfig);
  const mySessions   = useData(() => getMyFeudSessions(user.id));
  const todayCount   = useData(() => todayFeudGamesCount(user.id));
  const eligibility  = useData(() => canStartFeudGame(user.id));

  const [gameState, setGameState] = useState<"idle" | "playing" | "revealed" | "summary">("idle");
  const [activeGame, setActiveGame]     = useState<FeudGameStartResult | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [currentScore, setCurrentScore] = useState(0);
  const [timeLeft, setTimeLeft]         = useState<number>(25);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [revealedOptions, setRevealedOptions]   = useState<{ id: string; text: string; points: number; rank: number }[] | null>(null);
  const [roundPoints, setRoundPoints]   = useState<number>(0);
  const [gameResult, setGameResult]     = useState<{ score: number; targetPoints: number; reward: number; timeSpent: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (gameState !== "playing") {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; void handleTimeout(); return 0; }
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
    if (!eligibility.allowed) { toast("error", eligibility.reason || "Cannot start a game right now."); return; }
    const result = await run(async () => startFeudGame(user.id));
    if (result) {
      setActiveGame(result);
      setCurrentQIndex(0); setCurrentScore(0);
      setTimeLeft(result.timeLimitSeconds || 25);
      setSelectedAnswerId(null); setRevealedOptions(null);
      setRoundPoints(0); setGameResult(null);
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
      setSelectedAnswerId(null); setRevealedOptions(null); setRoundPoints(0);
      setGameState("playing");
    } else {
      setGameState("summary");
    }
  };

  const currentQ = activeGame ? activeGame.questions[currentQIndex] : null;

  /* ══════════════════ IDLE / LOBBY ══════════════════ */
  if (gameState === "idle") {
    const bestReward = Math.max(0, ...mySessions.map((s) => s.rewardAmount));
    const bestScore  = Math.max(0, ...mySessions.map((s) => s.score));

    return (
      <div className="space-y-5">
        {/* Hero banner */}
        <div className="relative overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-emerald-50 px-6 py-7 shadow-sm">
          <div className="pointer-events-none absolute right-0 top-0 h-48 w-48 translate-x-1/4 -translate-y-1/4 rounded-full bg-brand/8 blur-3xl" />
          <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white">
                  <Star className="h-4 w-4" />
                </span>
                <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-brand">
                  Survey Feud
                </span>
              </div>
              <h1 className="text-2xl font-black text-slate-900 sm:text-3xl">Family Feud</h1>
              <p className="mt-1 max-w-sm text-sm text-slate-500">
                Guess the most popular survey answers, beat the clock, and earn real rewards.
              </p>

              <div className="mt-4 flex flex-wrap gap-4">
                {[
                  { label: "Jackpot", value: fmtN(cfg.target200Reward), color: "text-amber-600 bg-amber-50 border-amber-200" },
                  { label: `${cfg.timeLimitSeconds}s clock`, value: "per game", color: "text-blue-600 bg-blue-50 border-blue-200" },
                  { label: `${cfg.questionsPerGame} questions`, value: "per round", color: "text-purple-600 bg-purple-50 border-purple-200" },
                ].map((pill) => (
                  <div key={pill.label} className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${pill.color}`}>
                    <span className="font-black">{pill.label}</span>
                    <span className="opacity-60">{pill.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="shrink-0">
              {eligibility.allowed ? (
                <button
                  onClick={handleStart} disabled={busy}
                  className="flex items-center gap-2.5 rounded-xl bg-brand px-7 py-3.5 text-sm font-bold text-white shadow-md shadow-brand/25 transition-all hover:bg-brand-dark active:scale-95 disabled:opacity-60"
                >
                  {busy
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    : <Play className="h-4 w-4 fill-white" />
                  }
                  Start Game
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{eligibility.reason}</span>
                </div>
              )}
              {eligibility.allowed && (
                <p className="mt-2 text-center text-xs text-slate-400">
                  {todayCount} of {cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"} games used today
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games played", value: mySessions.length, icon: <Zap className="h-4 w-4" />, bg: "bg-blue-50", fg: "text-blue-600" },
            { label: "Best score",   value: `${bestScore} pts`, icon: <Target className="h-4 w-4" />, bg: "bg-purple-50", fg: "text-purple-600" },
            { label: "Best reward",  value: fmtN(bestReward), icon: <Trophy className="h-4 w-4" />, bg: "bg-amber-50", fg: "text-amber-600" },
            { label: "Today",        value: `${todayCount}/${cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"}`, icon: <Clock className="h-4 w-4" />, bg: "bg-brand-50", fg: "text-brand" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-lg ${s.bg} ${s.fg}`}>
                {s.icon}
              </div>
              <p className="text-lg font-black text-slate-900">{s.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{s.label}</p>
            </div>
          ))}
        </div>

        {/* How to play */}
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100">
              <Info className="h-4 w-4 text-slate-500" />
            </span>
            <h2 className="text-sm font-bold text-slate-800">How to play</h2>
          </div>
          <div className="space-y-3">
            {[
              { icon: <CheckCircle2 className="h-4 w-4 text-brand shrink-0 mt-0.5" />, text: `Each game has ${cfg.questionsPerGame} questions — pick the answer you think most people gave in a survey.` },
              { icon: <CheckCircle2 className="h-4 w-4 text-brand shrink-0 mt-0.5" />, text: `Popular answers score more points. You have ${cfg.timeLimitSeconds} seconds total for the entire game.` },
              { icon: <TrendingUp className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />, text: `Score ${cfg.minScoreForReward}+ points to earn a tiered reward. Hit ${cfg.targetPoints} points for the jackpot of ${fmtN(cfg.target200Reward)}.` },
              { icon: <AlertCircle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />, text: `Up to ${cfg.dailyLimit > 0 ? cfg.dailyLimit : "unlimited"} games per day. Rewards are credited instantly to your wallet.` },
            ].map((item, i) => (
              <div key={i} className="flex gap-3">
                {item.icon}
                <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent games */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Recent games</h2>
            <p className="text-xs text-slate-400">Your last Survey Feud sessions</p>
          </div>
          {mySessions.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
                <Users className="h-6 w-6 text-slate-400" />
              </span>
              <p className="mt-3 text-sm font-semibold text-slate-700">No games yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">Play your first game to start earning rewards.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {mySessions.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${s.rewardAmount > 0 ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-400"}`}>
                      {s.rewardAmount > 0 ? <Trophy className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{s.score}/{s.targetPoints} pts</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(s.completedAt || s.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.rewardAmount > 0 && (
                      <span className="text-sm font-bold text-brand">{fmtN(s.rewardAmount)}</span>
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

  /* ══════════════════ PLAYING / REVEALED ══════════════════ */
  if ((gameState === "playing" || gameState === "revealed") && activeGame && currentQ) {
    const totalQ  = activeGame.questions.length;
    const scorePct = Math.min(100, Math.round((currentScore / activeGame.session.targetPoints) * 100));

    return (
      <div className="space-y-4">
        {/* Game header */}
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-4">
            {/* Timer ring */}
            <TimerRing timeLeft={timeLeft} total={activeGame.timeLimitSeconds || 25} />

            {/* Score + dots */}
            <div className="flex flex-1 flex-col gap-3 min-w-0">
              {/* Score bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-500">
                  <span>Score</span>
                  <span className="text-slate-800">{currentScore} / {activeGame.session.targetPoints} pts</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${scorePct}%` }}
                  />
                </div>
              </div>
              {/* Question progress dots */}
              <div className="flex items-center gap-1.5">
                {activeGame.questions.map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    i < currentQIndex ? "bg-brand"
                    : i === currentQIndex ? "bg-brand/50"
                    : "bg-slate-200"
                  }`} />
                ))}
              </div>
              <p className="text-xs text-slate-400">
                Question <span className="font-semibold text-slate-600">{currentQIndex + 1}</span> of {totalQ}
                {currentQ.category && <> · <span className="font-medium">{currentQ.category}</span></>}
              </p>
            </div>
          </div>
        </div>

        {/* Question card */}
        <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden">
          {/* Survey says header */}
          <div className="border-b border-slate-100 bg-slate-50 px-5 py-3.5">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-brand animate-pulse" />
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand">Survey says…</span>
              {currentQ.difficulty && (
                <span className="ml-auto rounded-md bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-500 uppercase">
                  {currentQ.difficulty}
                </span>
              )}
            </div>
          </div>

          {/* Prompt */}
          <div className="px-5 py-5">
            <h2 className="text-base font-black leading-snug text-slate-900 sm:text-lg">
              {currentQ.prompt}
            </h2>
          </div>

          {/* Answer options */}
          <div className="space-y-2 px-4 pb-4 sm:px-5 sm:pb-5">
            {currentQ.answers.map((a, i) => {
              let state: AnswerState = "idle";
              if (gameState === "revealed") {
                const isSelected = selectedAnswerId === a.id;
                const hitData = isSelected ? revealedOptions?.find((r) => r.id === a.id) : undefined;
                if (isSelected && hitData && hitData.points > 0) state = "hit";
                else if (isSelected) state = "miss";
                else state = "dimmed";
              } else if (selectedAnswerId === a.id) {
                state = "pending";
              }
              return (
                <AnswerBoard
                  key={a.id} index={i} text={a.text} state={state}
                  points={revealedOptions?.find((r) => r.id === a.id)?.points}
                  onClick={() => handleSelectAnswer(a.id)}
                  disabled={busy || gameState !== "playing"}
                />
              );
            })}
          </div>

          {/* Post-answer footer */}
          {gameState === "revealed" && (
            <div className={`border-t px-5 py-4 ${roundPoints > 0 ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`font-bold ${roundPoints > 0 ? "text-green-700" : "text-red-500"}`}>
                    {roundPoints > 0
                      ? `🎉 +${roundPoints} points! Nice answer.`
                      : "Not on the board — no points this round."}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Total: {currentScore} / {activeGame.session.targetPoints} pts
                  </p>
                </div>
                {currentQIndex + 1 < activeGame.questions.length ? (
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-2.5 text-sm font-bold text-white transition-all hover:bg-slate-700 active:scale-95"
                  >
                    Next question <ChevronRight className="h-4 w-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleNextQuestion}
                    className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-all hover:bg-brand-dark active:scale-95"
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

  /* ══════════════════ SUMMARY ══════════════════ */
  if (gameState === "summary" && gameResult) {
    const won  = gameResult.reward > 0;
    const pct  = Math.min(100, Math.round((gameResult.score / gameResult.targetPoints) * 100));

    return (
      <div className="space-y-4">
        {/* Result card */}
        <div className={`relative overflow-hidden rounded-2xl border p-7 text-center shadow-sm ${won ? "border-green-200 bg-gradient-to-b from-green-50 to-white" : "border-slate-200 bg-white"}`}>
          {/* Icon */}
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${won ? "bg-amber-100 text-amber-500" : "bg-slate-100 text-slate-400"}`}>
            {won ? <Trophy className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
          </div>

          <h2 className="mt-4 text-2xl font-black text-slate-900">
            {won ? "You won! 🎉" : "Game over"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {won
              ? `${fmtN(gameResult.reward)} has been credited to your wallet.`
              : `You needed at least ${cfg.minScoreForReward} pts. Keep playing!`}
          </p>

          {/* Score bar */}
          <div className="mx-auto mt-6 max-w-xs">
            <div className="mb-1.5 flex justify-between text-xs text-slate-400">
              <span>0 pts</span>
              <span>{gameResult.targetPoints} pts</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full transition-all duration-700 ${won ? "bg-brand" : "bg-slate-300"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-3 text-4xl font-black text-slate-900">
              {gameResult.score}
              <span className="ml-1 text-base font-medium text-slate-400">pts</span>
            </p>
            <p className="text-xs text-slate-400">in {gameResult.timeSpent}s</p>
          </div>

          {/* Reward badge */}
          {won && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-5 py-2.5">
              <Award className="h-5 w-5 text-brand" />
              <span className="text-lg font-black text-brand">{fmtN(gameResult.reward)}</span>
              <span className="text-sm text-slate-500">earned</span>
            </div>
          )}
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Final score", value: `${gameResult.score} pts` },
            { label: "Target",      value: `${gameResult.targetPoints} pts` },
            { label: "Time spent",  value: `${gameResult.timeSpent}s` },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-slate-100 bg-white px-3 py-4 text-center shadow-sm">
              <p className="text-lg font-black text-slate-900">{item.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="outline" className="flex-1"
            onClick={() => { setGameState("idle"); setActiveGame(null); setGameResult(null); }}
          >
            <RotateCcw className="h-4 w-4" /> Back to lobby
          </Button>
          <button
            onClick={handleStart}
            disabled={busy || (cfg.dailyLimit > 0 && todayCount >= cfg.dailyLimit)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-brand/20 transition-all hover:bg-brand-dark active:scale-95 disabled:opacity-50"
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
