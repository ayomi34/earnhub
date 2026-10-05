import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Badge, Button, Card, CardHeader, PageHead, fmtN, fmtDateTime } from "../components/ui";
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
  const [selectedAnswerId, setSelectedAnswerId] = useState<string | null>(null); // highlighted while awaiting server result
  const [revealedOptions, setRevealedOptions] = useState<{ id: string; text: string; points: number; rank: number }[] | null>(null);
  const [roundPoints, setRoundPoints] = useState<number>(0);
  const [gameResult, setGameResult] = useState<{
    score: number;
    targetPoints: number;
    reward: number;
    timeSpent: number;
  } | null>(null);

  useEffect(() => {
    if (gameState !== "playing" && gameState !== "revealed") return;
    if (timeLeft <= 0) {
      void handleTimeout();
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          void handleTimeout();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [gameState, timeLeft]);

  const handleTimeout = async () => {
    if (!activeGame) return;
    toast("info", "Time expired for this round!");
    const session = await completeFeudGameOnTimeout(user.id, activeGame.session.id);
    setGameResult({
      score: session.score,
      targetPoints: session.targetPoints,
      reward: session.rewardAmount,
      timeSpent: session.timeSpentSeconds,
    });
    setGameState("summary");
  };

  const handleStart = async () => {
    if (!eligibility.allowed) {
      toast("error", eligibility.reason || "You cannot start a game right now.");
      return;
    }

    const result = await run(async () => {
      return await startFeudGame(user.id);
    });

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
    const res = await run(async () => {
      return await submitFeudAnswer(user.id, activeGame.session.id, currQ.id, answerId);
    });

    if (res) {
      setRevealedOptions(res.revealedAnswers);
      setRoundPoints(res.pointsEarned);
      setCurrentScore(res.session.score);
      setGameState("revealed");

      if (res.isGameComplete) {
        setTimeout(() => {
          setGameResult({
            score: res.session.score,
            targetPoints: res.session.targetPoints,
            reward: res.session.rewardAmount,
            timeSpent: res.session.timeSpentSeconds,
          });
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

  const revealed = gameState === "revealed" ? revealedOptions : null;

  return (
    <div>
      <PageHead
        title="Family Feud"
        sub="Guess the most popular survey answers, stack points before the clock runs out and earn rewards."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Target score</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{cfg.targetPoints} pts</p>
          <p className="mt-0.5 text-[11px] text-slate-400">reach it to hit the jackpot reward</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Time limit</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{cfg.timeLimitSeconds}s</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{cfg.questionsPerGame} questions per game</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Games today</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">
            {todayCount}/{cfg.dailyLimit > 0 ? cfg.dailyLimit : "∞"}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">resets at midnight</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Best reward</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">
            {fmtN(Math.max(0, ...mySessions.map((s) => s.rewardAmount)))}
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            best score {Math.max(0, ...mySessions.map((s) => s.score))} pts
          </p>
        </Card>
      </div>

      {gameState === "idle" && (
        <Card className="mt-5">
          <CardHeader
            title="How to play"
            sub={`Earn up to ${fmtN(cfg.target200Reward)} per game when you hit ${cfg.targetPoints} points`}
          />
          <ul className="space-y-2.5 text-sm text-slate-600">
            <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Each round shows a survey question — pick the answer you think most people gave.</li>
            <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Popular answers score more points; you have {cfg.timeLimitSeconds} seconds for the whole game.</li>
            <li className="flex gap-2.5"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> Score {cfg.minScoreForReward}+ points to qualify for a tiered reward — reaching {cfg.targetPoints} pays {fmtN(cfg.target200Reward)}.</li>
            <li className="flex gap-2.5"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> You can play up to {cfg.dailyLimit > 0 ? cfg.dailyLimit : "unlimited"} games per day. Rewards are credited instantly.</li>
          </ul>

          {!eligibility.allowed && (
            <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 px-3.5 py-3 text-sm text-amber-700">
              <Info className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{eligibility.reason}</span>
            </div>
          )}

          <Button className="mt-5 w-full sm:w-auto" size="md" disabled={!eligibility.allowed || busy} loading={busy} onClick={handleStart}>
            <Zap className="h-4 w-4" /> Start game
          </Button>
        </Card>
      )}

      {(gameState === "playing" || gameState === "revealed") && activeGame && currentQ && (
        <Card className="mt-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Badge tone="brand">Question {currentQIndex + 1}/{activeGame.questions.length}</Badge>
              <Badge tone="slate">{currentQ.category}</Badge>
            </div>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-bold ${timeLeft <= 5 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-700"}`}>
              <Timer className="h-4 w-4" /> {timeLeft}s
            </div>
          </div>

          <div className="mb-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
            <span className="text-sm font-medium text-brand-dark">Your score</span>
            <span className="text-lg font-bold text-brand">{currentScore} / {activeGame.session.targetPoints} pts</span>
          </div>

          <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{currentQ.prompt}</h3>

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            {gameState === "playing"
              ? currentQ.answers.map((a, i) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectAnswer(a.id)}
                    disabled={busy}
                    className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-colors disabled:opacity-60 ${
                      selectedAnswerId === a.id
                        ? "border-brand bg-brand-50 text-brand"
                        : "border-slate-200 bg-white text-slate-700 hover:border-brand hover:bg-brand-50 hover:text-brand"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-500">{i + 1}</span>
                      {a.text}
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </button>
                ))
              : currentQ.answers.map((a, i) => {
                  const isSelected = selectedAnswerId === a.id;
                  const hit = isSelected ? revealed?.find((r) => r.id === a.id) : undefined;
                  return (
                    <div
                      key={a.id}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3.5 text-sm font-medium ${
                        isSelected ? "border-brand bg-brand-50 text-brand" : "border-slate-100 bg-slate-50 text-slate-400"
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md text-xs font-bold ${isSelected ? "bg-brand text-white" : "bg-slate-200 text-slate-400"}`}>{i + 1}</span>
                        {a.text}
                      </span>
                      {isSelected && hit && <span className="font-bold">+{hit.points}</span>}
                    </div>
                  );
                })}
          </div>

          {gameState === "revealed" && (
            <div className="mt-4 flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-4 text-center sm:flex-row sm:justify-between sm:text-left">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {roundPoints > 0 ? `Nice! You scored ${roundPoints} points` : "Not on the board — no points this round"}
                </p>
                <p className="text-xs text-slate-500">Total: {currentScore} / {activeGame.session.targetPoints} pts</p>
              </div>
              {gameState === "revealed" && (
                <Button onClick={handleNextQuestion} disabled={busy}>
                  {currentQIndex + 1 < activeGame.questions.length ? "Next question" : "Finish"} <ChevronRight className="h-4 w-4" />
                </Button>
              )}
            </div>
          )}
        </Card>
      )}


      {gameState === "summary" && gameResult && (
        <Card className="mt-5">
          <div className="flex flex-col items-center py-4 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand">
              {gameResult.reward > 0 ? <Trophy className="h-7 w-7" /> : <Sparkles className="h-7 w-7" />}
            </span>
            <h3 className="mt-4 text-xl font-bold text-slate-900">
              {gameResult.reward > 0 ? `You earned ${fmtN(gameResult.reward)}!` : "Game over!"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Final score <span className="font-bold text-slate-800">{gameResult.score}/{gameResult.targetPoints}</span>
              {" · "}took {gameResult.timeSpent}s
            </p>
            {gameResult.reward > 0 ? (
              <p className="mt-3 rounded-lg bg-green-50 px-4 py-2 text-sm font-medium text-green-700">
                {fmtN(gameResult.reward)} has been credited to your wallet.
              </p>
            ) : (
              <p className="mt-3 max-w-sm text-xs text-slate-400">
                You needed at least {cfg.minScoreForReward} points for a reward. Try again tomorrow — you have {Math.max(0, cfg.dailyLimit - todayCount)} games left today.
              </p>
            )}
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => { setGameState("idle"); setActiveGame(null); setGameResult(null); }}
              >
                <RotateCcw className="h-4 w-4" /> Back to lobby
              </Button>
              <Button disabled={busy || todayCount >= (cfg.dailyLimit > 0 ? cfg.dailyLimit : Infinity)} onClick={handleStart}>
                <Zap className="h-4 w-4" /> Play again
              </Button>
            </div>
          </div>
        </Card>
      )}

      {gameState === "idle" && (
        <Card className="mt-5">
          <CardHeader title="Recent games" sub="Your last Family Feud sessions" />
          {mySessions.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <p className="text-sm font-semibold text-slate-800">No games yet</p>
              <p className="mt-1 max-w-xs text-xs text-slate-500">Play your first game to start earning rewards.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-medium">Score</th>
                    <th className="px-5 py-3 font-medium">Reward</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                    <th className="px-5 py-3 font-medium">When</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mySessions.slice(0, 10).map((s) => (
                    <tr key={s.id}>
                      <td className="px-5 py-3.5 font-semibold text-slate-700">{s.score}/{s.targetPoints}</td>
                      <td className="px-5 py-3.5 font-semibold text-slate-700">
                        {s.rewardAmount > 0 ? fmtN(s.rewardAmount) : "—"}
                      </td>
                      <td className="px-5 py-3.5">
                        <Badge tone={s.rewardAmount > 0 ? "green" : "slate"}>
                          {s.rewardAmount > 0 ? "Rewarded" : s.completed ? "Completed" : "In progress"}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {fmtDateTime(s.completedAt || s.startedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}


