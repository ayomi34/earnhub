import { useState, useEffect, useRef } from "react";
import {
  Trophy,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Zap,
  Info,
  Play,
  Award,
  Users,
  X,
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

/* ──────────────────────── circular timer ──────────────────────── */
function TimerRing({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct    = Math.max(0, timeLeft / total);
  const r      = 30;
  const circ   = 2 * Math.PI * r;
  const dash   = circ * pct;
  const urgent = timeLeft <= 5;
  const warn   = timeLeft <= 10 && !urgent;
  const stroke = urgent ? "#ef4444" : warn ? "#f59e0b" : "#16a34a";

  return (
    <div className="relative flex h-[76px] w-[76px] shrink-0 items-center justify-center">
      <svg className="-rotate-90" width="76" height="76">
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="5" stroke="#d1fae5" />
        <circle
          cx="38" cy="38" r={r} fill="none" strokeWidth="5"
          stroke={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-base font-black tabular-nums leading-none" style={{ color: stroke }}>
          {timeLeft}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-green-600">sec</span>
      </div>
    </div>
  );
}

/* ──────────────────────── answer button ──────────────────────── */
type AnswerState = "idle" | "pending" | "hit" | "miss" | "dimmed";

function AnswerBoard({
  index, text, state, points, onClick, disabled,
}: {
  index: number; text: string; state: AnswerState;
  points?: number; onClick?: () => void; disabled?: boolean;
}) {
  const base = "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all duration-150 focus:outline-none select-none";

  const variants: Record<AnswerState, string> = {
    idle:    `${base} cursor-pointer border-green-200 bg-white text-slate-800 hover:border-green-400 hover:bg-green-50 active:scale-[0.98]`,
    pending: `${base} cursor-default border-green-400 bg-green-50 text-green-800`,
    hit:     `${base} cursor-default border-green-500 bg-green-100 text-green-900`,
    miss:    `${base} cursor-default border-red-200  bg-red-50   text-red-500`,
    dimmed:  `${base} cursor-default border-slate-100 bg-white/50 text-slate-300`,
  };

  return (
    <button onClick={onClick} disabled={disabled || state !== "idle"} className={variants[state]}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
        state === "hit"       ? "bg-green-500 text-white"
        : state === "miss"    ? "bg-red-300 text-white"
        : state === "pending" ? "bg-green-500 text-white"
        : "bg-green-100 text-green-700"
      }`}>
        {index + 1}
      </span>
      <span className="flex-1">{text}</span>
      {state === "hit" && points !== undefined && points > 0 && (
        <span className="rounded-md bg-green-500 px-2 py-0.5 text-xs font-bold text-white">+{points}</span>
      )}
      {state === "miss" && <X className="h-4 w-4 text-red-300" />}
      {state === "idle" && <ChevronRight className="h-4 w-4 text-green-300" />}
    </button>
  );
}

/* ──────────────────────── page ──────────────────────── */
export function FeudGamePage() {
  const user          = useUser()!;
  const toast         = useToast();
  const { busy, run } = useAction();

  const cfg         = useData(getFeudConfig);
  const mySessions  = useData(() => getMyFeudSessions(user.id));
  const todayCount  = useData(() => todayFeudGamesCount(user.id));
  const eligibility = useData(() => canStartFeudGame(user.id));

  const [gameState, setGameState]         = useState<"idle"|"playing"|"revealed"|"summary">("idle");
  const [activeGame, setActiveGame]       = useState<FeudGameStartResult | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [currentScore, setCurrentScore]   = useState(0);
  const [timeLeft, setTimeLeft]           = useState<number>(25);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [revealedOptions, setRevealedOptions]   = useState<{ id: string; text: string; points: number; rank: number }[] | null>(null);
  const [roundPoints, setRoundPoints]     = useState<number>(0);
  const [gameResult, setGameResult]       = useState<{ score: number; targetPoints: number; reward: number; timeSpent: number } | null>(null);
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

  /* ════════════════════ LOBBY ════════════════════ */
  if (gameState === "idle") {
    return (
      <div className="space-y-4">

        {/* Header */}
        <div className="rounded-2xl bg-green-50 border border-green-200 px-5 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-black text-slate-900">Survey Feud</h1>
              <p className="mt-1 text-[13px] text-slate-600">
                Guess what most people answered — win real cash
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[11px] text-slate-500">Today</p>
              <p className="text-sm font-black text-slate-800">
                {todayCount}/{cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"}
              </p>
            </div>
          </div>

          <div className="mt-4">
            {eligibility.allowed ? (
              <button
                onClick={handleStart} disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 py-3.5 text-sm font-bold text-white transition-all hover:bg-green-700 active:scale-[0.98] disabled:opacity-60"
              >
                {busy
                  ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  : <Play className="h-4 w-4 fill-white" />
                }
                Start Game
              </button>
            ) : (
              <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{eligibility.reason}</span>
              </div>
            )}
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Jackpot",    value: fmtN(cfg.target200Reward) },
            { label: "Questions",  value: String(cfg.questionsPerGame) },
            { label: "Time limit", value: `${cfg.timeLimitSeconds}s` },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-green-50 border border-green-200 px-3 py-3.5 text-center">
              <p className="text-sm font-black text-green-700">{s.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* How to play */}
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-slate-700">
            <Info className="h-4 w-4 text-green-500" /> How to play
          </div>
          <div className="space-y-2.5">
            {[
              `Pick the answer you think most people gave in a survey.`,
              `Popular answers score more points. You have ${cfg.timeLimitSeconds}s total.`,
              `Score ${cfg.minScoreForReward}+ pts for a reward. Hit ${cfg.targetPoints} pts for the ${fmtN(cfg.target200Reward)} jackpot.`,
            ].map((text, i) => (
              <div key={i} className="flex gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-600">{text}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent games */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="border-b border-slate-100 px-5 py-3.5">
            <p className="text-sm font-bold text-slate-800">Recent games</p>
          </div>
          {mySessions.length === 0 ? (
            <div className="flex flex-col items-center py-10 text-center px-4">
              <Users className="h-8 w-8 text-green-200" />
              <p className="mt-2 text-sm font-medium text-slate-600">No games yet</p>
              <p className="text-xs text-slate-400">Play your first game to start earning.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {mySessions.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      s.rewardAmount > 0 ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
                    }`}>
                      {s.rewardAmount > 0 ? <Trophy className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{s.score}/{s.targetPoints} pts</p>
                      <p className="text-xs text-slate-400">{fmtDateTime(s.completedAt || s.startedAt)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {s.rewardAmount > 0 && (
                      <span className="text-sm font-bold text-green-600">{fmtN(s.rewardAmount)}</span>
                    )}
                    <Badge tone={s.rewardAmount > 0 ? "green" : "slate"}>
                      {s.rewardAmount > 0 ? "Rewarded" : s.completed ? "Done" : "Active"}
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

  /* ════════════════════ PLAYING / REVEALED ════════════════════ */
  if ((gameState === "playing" || gameState === "revealed") && activeGame && currentQ) {
    const totalQ   = activeGame.questions.length;
    const scorePct = Math.min(100, Math.round((currentScore / activeGame.session.targetPoints) * 100));

    return (
      <div className="space-y-3">

        {/* Game bar */}
        <div className="rounded-2xl bg-green-50 border border-green-200 px-4 py-3">
          <div className="flex items-center gap-4">
            <TimerRing timeLeft={timeLeft} total={activeGame.timeLimitSeconds || 25} />

            <div className="flex-1 min-w-0">
              <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                <span>Score</span>
                <span className="font-bold text-slate-800">{currentScore} / {activeGame.session.targetPoints} pts</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-green-200">
                <div
                  className="h-full rounded-full bg-green-600 transition-all duration-500"
                  style={{ width: `${scorePct}%` }}
                />
              </div>
              <div className="mt-2 flex items-center gap-1">
                {activeGame.questions.map((_, i) => (
                  <div key={i} className={`flex-1 rounded-full transition-all ${
                    i < currentQIndex  ? "h-1.5 bg-green-500"
                    : i === currentQIndex ? "h-2 bg-green-600"
                    : "h-1 bg-green-200"
                  }`} />
                ))}
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                Question <span className="font-semibold text-slate-700">{currentQIndex + 1}</span> of {totalQ}
              </p>
            </div>
          </div>
        </div>

        {/* Question + answers */}
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white">
          <div className="bg-green-600 px-5 py-2.5">
            <p className="text-xs font-bold uppercase tracking-widest text-green-100">Survey says…</p>
          </div>

          <div className="px-5 py-4">
            <h2 className="text-base font-bold leading-snug text-slate-900">{currentQ.prompt}</h2>
          </div>

          <div className="space-y-2 px-4 pb-4">
            {currentQ.answers.map((a, i) => {
              let state: AnswerState = "idle";
              if (gameState === "revealed") {
                const isSelected = selectedAnswerId === a.id;
                const hitData    = isSelected ? revealedOptions?.find((r) => r.id === a.id) : undefined;
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

          {/* Round feedback */}
          {gameState === "revealed" && (
            <div className={`border-t px-5 py-4 ${
              roundPoints > 0 ? "border-green-100 bg-green-50" : "border-red-100 bg-red-50"
            }`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className={`text-sm font-bold ${roundPoints > 0 ? "text-green-700" : "text-red-500"}`}>
                    {roundPoints > 0 ? `+${roundPoints} points` : "Not on the board"}
                  </p>
                  <p className="text-xs text-slate-400">{currentScore} / {activeGame.session.targetPoints} pts total</p>
                </div>
                <button
                  onClick={handleNextQuestion}
                  className="flex items-center gap-1.5 rounded-xl bg-slate-800 px-4 py-2 text-sm font-bold text-white transition-all hover:bg-slate-700 active:scale-95"
                >
                  {currentQIndex + 1 < activeGame.questions.length ? "Next" : "Results"}
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ════════════════════ SUMMARY ════════════════════ */
  if (gameState === "summary" && gameResult) {
    const won = gameResult.reward > 0;
    const pct = Math.min(100, Math.round((gameResult.score / gameResult.targetPoints) * 100));

    return (
      <div className="space-y-4">

        {/* Result */}
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-6 text-center">
          <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ${
            won ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-400"
          }`}>
            {won ? <Trophy className="h-8 w-8" /> : <Sparkles className="h-8 w-8" />}
          </div>

          <h2 className="mt-4 text-[17px] font-black text-slate-900">
            {won ? "You won!" : "Game over"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {won
              ? `${fmtN(gameResult.reward)} has been added to your wallet.`
              : `You needed ${cfg.minScoreForReward}+ pts to qualify.`}
          </p>

          <div className="mx-auto mt-6 max-w-xs">
            <div className="mb-1 flex justify-between text-xs text-slate-400">
              <span>0</span><span>{gameResult.targetPoints} pts</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-green-100">
              <div
                className={`h-full rounded-full transition-all duration-700 ${won ? "bg-green-500" : "bg-slate-300"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-4 text-2xl font-black text-slate-900">
              {gameResult.score}
              <span className="ml-1 text-sm font-medium text-slate-400">pts</span>
            </p>
            <p className="text-xs text-slate-400">{gameResult.timeSpent}s</p>
          </div>

          {won && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-5 py-2.5">
              <Award className="h-4 w-4 text-green-600" />
              <span className="text-sm font-black text-green-700">{fmtN(gameResult.reward)}</span>
              <span className="text-sm text-slate-400">earned</span>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Score",  value: `${gameResult.score} pts` },
            { label: "Target", value: `${gameResult.targetPoints} pts` },
            { label: "Time",   value: `${gameResult.timeSpent}s` },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-green-50 border border-green-200 px-3 py-3.5 text-center">
              <p className="text-sm font-black text-slate-800">{item.value}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <Button
            variant="outline" className="flex-1"
            onClick={() => { setGameState("idle"); setActiveGame(null); setGameResult(null); }}
          >
            <RotateCcw className="h-4 w-4" /> Lobby
          </Button>
          <button
            onClick={handleStart}
            disabled={busy || (cfg.dailyLimit > 0 && todayCount >= cfg.dailyLimit)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white transition-all hover:bg-green-700 active:scale-95 disabled:opacity-50"
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
