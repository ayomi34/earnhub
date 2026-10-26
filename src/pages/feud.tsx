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
  Star,
  Target,
  Clock,
  Play,
  Award,
  TrendingUp,
  Users,
  Flame,
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

/* ──────────────────────── dot-grid background ──────────────────────── */
const DOT_BG = {
  backgroundImage:
    "radial-gradient(circle, #16a34a22 1.2px, transparent 1.2px)",
  backgroundSize: "22px 22px",
} as React.CSSProperties;

const WARM_DOT_BG = {
  backgroundImage:
    "radial-gradient(circle, #f59e0b18 1.2px, transparent 1.2px)",
  backgroundSize: "20px 20px",
} as React.CSSProperties;

/* ──────────────────────── circular timer ──────────────────────── */
function TimerRing({ timeLeft, total }: { timeLeft: number; total: number }) {
  const pct    = Math.max(0, timeLeft / total);
  const r      = 34;
  const circ   = 2 * Math.PI * r;
  const dash   = circ * pct;
  const urgent = timeLeft <= 5;
  const warn   = timeLeft <= 10 && !urgent;
  const stroke = urgent ? "#ef4444" : warn ? "#f59e0b" : "#16a34a";

  return (
    <div className="relative flex h-[84px] w-[84px] shrink-0 items-center justify-center">
      {/* outer glow ring */}
      <div
        className="absolute inset-0 rounded-full transition-colors duration-300"
        style={{ boxShadow: `0 0 0 4px ${stroke}22` }}
      />
      <svg className="-rotate-90" width="84" height="84">
        <circle cx="42" cy="42" r={r} fill="none" strokeWidth="6" stroke="#e2e8f0" />
        <circle
          cx="42" cy="42" r={r} fill="none" strokeWidth="6"
          stroke={stroke}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="text-xl font-black tabular-nums leading-none transition-colors duration-300"
          style={{ color: stroke }}
        >
          {timeLeft}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-widest text-slate-400">
          sec
        </span>
      </div>
    </div>
  );
}

/* ──────────────────────── answer board ──────────────────────── */
type AnswerState = "idle" | "pending" | "hit" | "miss" | "dimmed";

function AnswerBoard({
  index, text, state, points, onClick, disabled,
}: {
  index: number; text: string; state: AnswerState;
  points?: number; onClick?: () => void; disabled?: boolean;
}) {
  /* index-based tint for idle answers (light, friendly palette) */
  const tints = [
    "hover:border-emerald-400 hover:bg-emerald-50 hover:text-emerald-800",
    "hover:border-blue-400   hover:bg-blue-50   hover:text-blue-800",
    "hover:border-violet-400 hover:bg-violet-50 hover:text-violet-800",
    "hover:border-rose-400   hover:bg-rose-50   hover:text-rose-800",
    "hover:border-amber-400  hover:bg-amber-50  hover:text-amber-800",
    "hover:border-cyan-400   hover:bg-cyan-50   hover:text-cyan-800",
  ];
  const tint = tints[index % tints.length];

  const numColors = [
    "bg-emerald-100 text-emerald-700",
    "bg-blue-100   text-blue-700",
    "bg-violet-100 text-violet-700",
    "bg-rose-100   text-rose-700",
    "bg-amber-100  text-amber-700",
    "bg-cyan-100   text-cyan-700",
  ];
  const numColor = numColors[index % numColors.length];

  const base =
    "group relative flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left text-sm font-semibold transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 select-none";

  const variants: Record<AnswerState, string> = {
    idle:    `${base} cursor-pointer border-slate-200 bg-white text-slate-700 ${tint} active:scale-[0.98] shadow-sm`,
    pending: `${base} cursor-default border-brand/50 bg-brand-50 text-brand-dark shadow-sm`,
    hit:     `${base} cursor-default border-green-400 bg-green-50  text-green-800 shadow-sm`,
    miss:    `${base} cursor-default border-red-200  bg-red-50   text-red-500`,
    dimmed:  `${base} cursor-default border-slate-100 bg-slate-50 text-slate-300 opacity-60`,
  };

  return (
    <button onClick={onClick} disabled={disabled || state !== "idle"} className={variants[state]}>
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl text-xs font-black transition-colors ${
          state === "hit"     ? "bg-green-500 text-white"
          : state === "miss"  ? "bg-red-300   text-white"
          : state === "pending" ? "bg-brand text-white"
          : state === "idle"  ? `${numColor} group-hover:bg-white group-hover:text-slate-700`
          : "bg-slate-100 text-slate-300"
        }`}
      >
        {index + 1}
      </span>

      <span className="flex-1 leading-tight">{text}</span>

      {state === "hit" && points !== undefined && points > 0 && (
        <span className="ml-auto flex items-center gap-1 rounded-lg bg-green-100 px-2.5 py-1 text-xs font-black text-green-700">
          +{points} pts
        </span>
      )}
      {state === "miss" && (
        <span className="ml-auto text-lg font-black text-red-300">✕</span>
      )}
      {state === "idle" && (
        <ChevronRight className="ml-auto h-4 w-4 text-slate-200 transition-colors group-hover:text-current" />
      )}
    </button>
  );
}

/* ──────────────────────── main page ──────────────────────── */
export function FeudGamePage() {
  const user        = useUser()!;
  const toast       = useToast();
  const { busy, run } = useAction();

  const cfg         = useData(getFeudConfig);
  const mySessions  = useData(() => getMyFeudSessions(user.id));
  const todayCount  = useData(() => todayFeudGamesCount(user.id));
  const eligibility = useData(() => canStartFeudGame(user.id));

  const [gameState, setGameState]     = useState<"idle"|"playing"|"revealed"|"summary">("idle");
  const [activeGame, setActiveGame]   = useState<FeudGameStartResult | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [currentScore, setCurrentScore]   = useState(0);
  const [timeLeft, setTimeLeft]       = useState<number>(25);
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null);
  const [revealedOptions, setRevealedOptions]   = useState<{ id: string; text: string; points: number; rank: number }[] | null>(null);
  const [roundPoints, setRoundPoints] = useState<number>(0);
  const [gameResult, setGameResult]   = useState<{ score: number; targetPoints: number; reward: number; timeSpent: number } | null>(null);
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
    const bestReward = Math.max(0, ...mySessions.map((s) => s.rewardAmount));
    const bestScore  = Math.max(0, ...mySessions.map((s) => s.score));

    return (
      <div className="space-y-5">

        {/* ── Hero banner ── */}
        <div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 px-6 py-8 text-white shadow-xl shadow-green-200"
          style={DOT_BG}
        >
          {/* decorative circles */}
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-white/10" />
          <div className="pointer-events-none absolute -bottom-14 -left-6 h-48 w-48 rounded-full bg-white/8" />
          <div className="pointer-events-none absolute bottom-4 right-20 h-20 w-20 rounded-full border-4 border-white/15" />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <Star className="h-5 w-5 text-yellow-300 fill-yellow-300" />
                </span>
                <span className="rounded-full bg-white/20 px-3 py-0.5 text-[11px] font-bold uppercase tracking-widest backdrop-blur-sm">
                  Live Game
                </span>
              </div>

              <h1 className="text-3xl font-black tracking-tight drop-shadow-sm sm:text-4xl">
                Survey Feud
              </h1>
              <p className="mt-1.5 max-w-sm text-sm text-white/80 leading-relaxed">
                Guess the top survey answers before the clock runs out — and win real cash!
              </p>

              {/* pill stats */}
              <div className="mt-5 flex flex-wrap gap-2">
                {[
                  { label: "Jackpot", value: fmtN(cfg.target200Reward), bg: "bg-yellow-400/20 border-yellow-300/40 text-yellow-100" },
                  { label: `${cfg.timeLimitSeconds}s timer`, value: "", bg: "bg-white/15 border-white/30 text-white" },
                  { label: `${cfg.questionsPerGame} questions`, value: "", bg: "bg-white/15 border-white/30 text-white" },
                ].map((p) => (
                  <span
                    key={p.label}
                    className={`rounded-full border px-3.5 py-1.5 text-xs font-bold backdrop-blur-sm ${p.bg}`}
                  >
                    {p.label}{p.value && <span className="ml-1 opacity-70">{p.value}</span>}
                  </span>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="shrink-0 text-center">
              {eligibility.allowed ? (
                <button
                  onClick={handleStart} disabled={busy}
                  className="flex items-center gap-2.5 rounded-2xl bg-white px-8 py-4 text-sm font-black text-green-700 shadow-lg shadow-black/20 transition-all hover:bg-green-50 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:hover:scale-100"
                >
                  {busy
                    ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-green-300 border-t-green-700" />
                    : <Play className="h-5 w-5 fill-green-600 text-green-600" />
                  }
                  Start Game
                </button>
              ) : (
                <div className="flex items-start gap-2 rounded-2xl border border-white/30 bg-white/10 px-4 py-3 text-sm text-white/90 backdrop-blur-sm">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-300" />
                  <span>{eligibility.reason}</span>
                </div>
              )}
              <p className="mt-2.5 text-center text-xs text-white/50">
                {todayCount} of {cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"} games played today
              </p>
            </div>
          </div>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Games played", value: String(mySessions.length),  icon: <Zap className="h-4 w-4" />, from: "from-blue-50",   to: "to-indigo-50",  border: "border-blue-100",   fg: "text-blue-600",   num: "text-blue-800" },
            { label: "Best score",   value: `${bestScore} pts`,          icon: <Target className="h-4 w-4" />, from: "from-violet-50", to: "to-purple-50",  border: "border-violet-100", fg: "text-violet-600", num: "text-violet-800" },
            { label: "Best reward",  value: fmtN(bestReward),            icon: <Trophy className="h-4 w-4" />, from: "from-amber-50",  to: "to-yellow-50",  border: "border-amber-100",  fg: "text-amber-600",  num: "text-amber-800" },
            { label: "Today",        value: `${todayCount}/${cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"}`, icon: <Clock className="h-4 w-4" />, from: "from-green-50",  to: "to-emerald-50", border: "border-green-100",  fg: "text-green-600",  num: "text-green-800" },
          ].map((s) => (
            <div
              key={s.label}
              className={`rounded-2xl border bg-gradient-to-br ${s.from} ${s.to} ${s.border} p-4 shadow-sm`}
            >
              <div className={`mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 shadow-sm ${s.fg}`}>
                {s.icon}
              </div>
              <p className={`text-xl font-black ${s.num}`}>{s.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── How to play ── */}
        <div
          className="relative overflow-hidden rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50 to-blue-50 p-5 shadow-sm"
          style={WARM_DOT_BG}
        >
          <div className="relative">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Info className="h-4 w-4" />
              </span>
              <h2 className="text-sm font-bold text-slate-800">How to play</h2>
            </div>
            <div className="space-y-3">
              {[
                { icon: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />, text: `Each game has ${cfg.questionsPerGame} questions — pick the answer you think most people gave in a survey.` },
                { icon: <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />, text: `Popular answers score more points. You have ${cfg.timeLimitSeconds} seconds total for the entire game.` },
                { icon: <TrendingUp   className="h-4 w-4 text-blue-500  shrink-0 mt-0.5" />, text: `Score ${cfg.minScoreForReward}+ points for a tiered reward. Hit ${cfg.targetPoints} points for the jackpot of ${fmtN(cfg.target200Reward)}.` },
                { icon: <AlertCircle  className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />, text: `Up to ${cfg.dailyLimit > 0 ? cfg.dailyLimit : "unlimited"} games per day. Rewards are credited to your wallet instantly.` },
              ].map((item, i) => (
                <div key={i} className="flex gap-3">
                  {item.icon}
                  <p className="text-sm text-slate-600 leading-relaxed">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Recent games ── */}
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
          <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
            <h2 className="text-sm font-bold text-slate-900">Recent games</h2>
            <p className="text-xs text-slate-400">Your last Survey Feud sessions</p>
          </div>
          {mySessions.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-14 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-green-50 to-emerald-100 text-green-500">
                <Users className="h-7 w-7" />
              </span>
              <p className="mt-3 text-sm font-bold text-slate-700">No games yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-400">Play your first game to start earning rewards.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {mySessions.slice(0, 8).map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm ${
                      s.rewardAmount > 0
                        ? "bg-gradient-to-br from-amber-100 to-yellow-100 text-amber-600"
                        : "bg-slate-100 text-slate-400"
                    }`}>
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

  /* ════════════════════ PLAYING / REVEALED ════════════════════ */
  if ((gameState === "playing" || gameState === "revealed") && activeGame && currentQ) {
    const totalQ   = activeGame.questions.length;
    const scorePct = Math.min(100, Math.round((currentScore / activeGame.session.targetPoints) * 100));

    return (
      <div className="space-y-4">

        {/* ── Game top bar ── */}
        <div
          className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-green-500 via-emerald-500 to-teal-500 p-4 shadow-lg shadow-green-200"
          style={DOT_BG}
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            {/* Timer ring on white pill */}
            <div className="flex items-center justify-center rounded-2xl bg-white/90 p-2 shadow-md backdrop-blur-sm">
              <TimerRing timeLeft={timeLeft} total={activeGame.timeLimitSeconds || 25} />
            </div>

            <div className="flex flex-1 flex-col gap-2.5 min-w-0">
              {/* Score bar */}
              <div>
                <div className="mb-1 flex items-center justify-between text-xs font-semibold text-white/80">
                  <span>Score</span>
                  <span className="text-white font-black">{currentScore} / {activeGame.session.targetPoints} pts</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/25">
                  <div
                    className="h-full rounded-full bg-white transition-all duration-500 shadow-sm"
                    style={{ width: `${scorePct}%` }}
                  />
                </div>
              </div>

              {/* Question dots */}
              <div className="flex items-center gap-1.5">
                {activeGame.questions.map((_, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-full transition-all duration-300 ${
                      i < currentQIndex  ? "h-2 bg-white"
                      : i === currentQIndex ? "h-2.5 bg-white shadow-sm"
                      : "h-1.5 bg-white/30"
                    }`}
                  />
                ))}
              </div>

              <p className="text-xs text-white/70 font-medium">
                Question <span className="text-white font-black">{currentQIndex + 1}</span> of {totalQ}
                {currentQ.category && <span className="ml-1.5 opacity-70">· {currentQ.category}</span>}
              </p>
            </div>
          </div>
        </div>

        {/* ── Question + answers card ── */}
        <div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">

          {/* "Survey says…" banner */}
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-amber-50 to-yellow-50 border-b border-amber-100 px-5 py-3.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-400 text-white">
              <Flame className="h-4 w-4" />
            </span>
            <span className="text-xs font-black uppercase tracking-widest text-amber-700">
              Survey says…
            </span>
            {currentQ.difficulty && (
              <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600">
                {currentQ.difficulty}
              </span>
            )}
          </div>

          {/* Prompt */}
          <div className="bg-gradient-to-b from-white to-slate-50/50 px-5 pt-5 pb-4">
            <h2 className="text-base font-black leading-snug text-slate-900 sm:text-lg">
              {currentQ.prompt}
            </h2>
          </div>

          {/* Answers */}
          <div className="space-y-2 px-4 pb-5 sm:px-5">
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

          {/* Post-answer feedback */}
          {gameState === "revealed" && (
            <div
              className={`border-t px-5 py-4 ${
                roundPoints > 0
                  ? "border-green-100 bg-gradient-to-r from-green-50 to-emerald-50"
                  : "border-red-100   bg-gradient-to-r from-red-50   to-rose-50"
              }`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className={`font-black ${roundPoints > 0 ? "text-green-700" : "text-red-500"}`}>
                    {roundPoints > 0
                      ? `🎉 +${roundPoints} points — great pick!`
                      : "❌ Not on the board this round."}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Running total: <strong>{currentScore}</strong> / {activeGame.session.targetPoints} pts
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
                    className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm shadow-brand/30 transition-all hover:bg-brand-dark active:scale-95"
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

  /* ════════════════════ SUMMARY ════════════════════ */
  if (gameState === "summary" && gameResult) {
    const won = gameResult.reward > 0;
    const pct = Math.min(100, Math.round((gameResult.score / gameResult.targetPoints) * 100));

    return (
      <div className="space-y-4">

        {/* ── Result hero ── */}
        <div
          className={`relative overflow-hidden rounded-3xl border p-7 text-center shadow-md ${
            won
              ? "border-yellow-200 bg-gradient-to-br from-yellow-50 via-amber-50 to-orange-50 shadow-amber-100"
              : "border-slate-200 bg-gradient-to-br from-slate-50 to-white"
          }`}
          style={won ? WARM_DOT_BG : {}}
        >
          {/* decorative rings */}
          {won && (
            <>
              <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full border-8 border-yellow-200/60" />
              <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full border-8 border-amber-200/60" />
            </>
          )}

          <div className="relative">
            {/* Trophy / sparkle icon */}
            <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-3xl shadow-sm ${
              won
                ? "bg-gradient-to-br from-amber-400 to-yellow-300 text-white shadow-amber-200"
                : "bg-slate-100 text-slate-400"
            }`}>
              {won ? <Trophy className="h-10 w-10" /> : <Sparkles className="h-10 w-10" />}
            </div>

            <h2 className={`mt-4 text-2xl font-black ${won ? "text-amber-800" : "text-slate-800"}`}>
              {won ? "You won! 🎉" : "Game over"}
            </h2>
            <p className={`mt-1 text-sm ${won ? "text-amber-700" : "text-slate-500"}`}>
              {won
                ? `${fmtN(gameResult.reward)} has been credited to your wallet.`
                : `You needed at least ${cfg.minScoreForReward} pts to qualify — try again!`}
            </p>

            {/* Score bar */}
            <div className="mx-auto mt-6 max-w-xs">
              <div className="mb-1.5 flex justify-between text-xs text-slate-400">
                <span>0</span>
                <span>{gameResult.targetPoints} pts</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                    won
                      ? "bg-gradient-to-r from-amber-400 to-yellow-300"
                      : "bg-gradient-to-r from-slate-300 to-slate-400"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="mt-3 text-5xl font-black text-slate-900">
                {gameResult.score}
                <span className="ml-1.5 text-lg font-medium text-slate-400">pts</span>
              </p>
              <p className="text-xs text-slate-400">completed in {gameResult.timeSpent}s</p>
            </div>

            {/* Reward badge */}
            {won && (
              <div className="mx-auto mt-5 inline-flex items-center gap-2.5 rounded-full border border-green-200 bg-white px-6 py-3 shadow-sm">
                <Award className="h-5 w-5 text-brand" />
                <span className="text-xl font-black text-brand">{fmtN(gameResult.reward)}</span>
                <span className="text-sm text-slate-500">earned</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Summary stats ── */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Final score", value: `${gameResult.score} pts`, from: "from-brand-50", to: "to-emerald-50", border: "border-brand-100", num: "text-brand" },
            { label: "Target",      value: `${gameResult.targetPoints} pts`, from: "from-blue-50",  to: "to-indigo-50",  border: "border-blue-100",  num: "text-blue-700" },
            { label: "Time spent",  value: `${gameResult.timeSpent}s`,       from: "from-purple-50", to: "to-violet-50", border: "border-purple-100", num: "text-purple-700" },
          ].map((item) => (
            <div
              key={item.label}
              className={`rounded-2xl border bg-gradient-to-b ${item.from} ${item.to} ${item.border} px-3 py-4 text-center shadow-sm`}
            >
              <p className={`text-xl font-black ${item.num}`}>{item.value}</p>
              <p className="mt-0.5 text-xs font-medium text-slate-500">{item.label}</p>
            </div>
          ))}
        </div>

        {/* ── Actions ── */}
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
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-500 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-green-200 transition-all hover:from-green-400 hover:to-emerald-400 active:scale-95 disabled:opacity-50"
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
