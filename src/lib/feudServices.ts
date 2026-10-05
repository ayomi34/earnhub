import { read, update, uid, genRef, DEFAULT_FEUD_CONFIG } from "./db";
import { supabase } from "./supabase";
import { SvcError, requireAdmin, invokeAdmin, hydrateAll, getUserLevel } from "./services";
import type {
  FeudConfig,
  FeudQuestion,
  FeudGameSession,
  FeudAnswer,
  WalletTx,
} from "./types";

/* ================= MAPPERS & CONFIG ================= */

export function mapFeudQuestion(row: any): FeudQuestion {
  const answers: FeudAnswer[] = Array.isArray(row.answers)
    ? row.answers.map((a: any, idx: number) => ({
        id: a.id || `ans-${idx + 1}`,
        text: String(a.text || "").trim(),
        points: Number.isFinite(Number(a.points)) ? Math.max(1, Math.floor(Number(a.points))) : 10,
        rank: Number.isFinite(Number(a.rank)) ? Number(a.rank) : idx + 1,
      }))
    : [];
  return {
    id: row.id,
    prompt: row.prompt,
    category: row.category || "General",
    difficulty: ["easy", "medium", "hard"].includes(row.difficulty) ? row.difficulty : "easy",
    explanation: row.explanation || undefined,
    answers,
    status: row.status === "inactive" ? "inactive" : "active",
    createdAt: new Date(row.created_at || Date.now()).getTime(),
  };
}

export function mapFeudSession(row: any): FeudGameSession {
  return {
    id: row.id,
    userId: row.user_id,
    score: Number(row.score || 0),
    targetPoints: Number(row.target_points || 200),
    completed: Boolean(row.completed),
    rewardAmount: Number(row.reward_amount || 0),
    rewardStatus: ["none", "pending", "credited"].includes(row.reward_status) ? row.reward_status : "none",
    timeSpentSeconds: Number(row.time_spent_seconds || 0),
    startedAt: new Date(row.started_at || Date.now()).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    questionIds: Array.isArray(row.question_ids) ? row.question_ids : [],
    rounds: Array.isArray(row.rounds) ? row.rounds : [],
  };
}

export function normalizeFeudConfig(raw: any): FeudConfig {
  const d = DEFAULT_FEUD_CONFIG;
  const tiers = Array.isArray(raw?.scoreTiers) && raw.scoreTiers.length > 0
    ? raw.scoreTiers.map((t: any) => ({
        minScore: Number(t.minScore || 0),
        maxScore: Number(t.maxScore || 200),
        reward: Number(t.reward || 0),
        rewardsByLevel: t.rewardsByLevel && typeof t.rewardsByLevel === "object"
          ? Object.fromEntries(Object.entries(t.rewardsByLevel).map(([id, reward]) => [id, Math.max(0, Number(reward) || 0)]))
          : {},
      }))
    : d.scoreTiers;

  return {
    enabled: typeof raw?.enabled === "boolean" ? raw.enabled : d.enabled,
    targetPoints: Number.isFinite(Number(raw?.targetPoints)) ? Number(raw.targetPoints) : d.targetPoints,
    timeLimitSeconds: Number.isFinite(Number(raw?.timeLimitSeconds)) ? Number(raw.timeLimitSeconds) : d.timeLimitSeconds,
    questionsPerGame: Number.isFinite(Number(raw?.questionsPerGame)) ? Number(raw.questionsPerGame) : d.questionsPerGame,
    dailyLimit: Number.isFinite(Number(raw?.dailyLimit)) ? Number(raw.dailyLimit) : d.dailyLimit,
    minScoreForReward: Number.isFinite(Number(raw?.minScoreForReward)) ? Number(raw.minScoreForReward) : d.minScoreForReward,
    target200Reward: Number.isFinite(Number(raw?.target200Reward)) ? Number(raw.target200Reward) : d.target200Reward,
    target200RewardsByLevel: raw?.target200RewardsByLevel && typeof raw.target200RewardsByLevel === "object"
      ? Object.fromEntries(Object.entries(raw.target200RewardsByLevel).map(([id, reward]) => [id, Math.max(0, Number(reward) || 0)]))
      : {},
    scoreTiers: tiers,
    maxWinners: Number.isFinite(Number(raw?.maxWinners)) ? Number(raw.maxWinners) : d.maxWinners,
    startDate: raw?.startDate ? String(raw.startDate) : null,
    endDate: raw?.endDate ? String(raw.endDate) : null,
  };
}

/* ================= SELECTORS & CHECKS ================= */

export function getFeudConfig(): FeudConfig {
  return normalizeFeudConfig(read().settings.feud);
}

export function getFeudQuestions(activeOnly = true): FeudQuestion[] {
  const all = read().feudQuestions;
  if (!activeOnly) return all;
  return all.filter((q) => q.status === "active");
}

export function getMyFeudSessions(userId: string): FeudGameSession[] {
  return read().feudSessions
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function getAllFeudSessions(): FeudGameSession[] {
  return [...read().feudSessions].sort((a, b) => b.startedAt - a.startedAt);
}

export function todayFeudGamesCount(userId: string): number {
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const startTs = dayStart.getTime();
  return read().feudSessions.filter(
    (s) => s.userId === userId && s.startedAt >= startTs && s.completed
  ).length;
}

export function canStartFeudGame(userId: string): { allowed: boolean; reason?: string } {
  const cfg = getFeudConfig();
  if (!cfg.enabled) {
    return { allowed: false, reason: "Survey Feud is currently paused by admin." };
  }
  const now = Date.now();
  if (cfg.startDate && new Date(cfg.startDate).getTime() > now) {
    return { allowed: false, reason: `Survey Feud starts on ${new Date(cfg.startDate).toLocaleDateString()}.` };
  }
  if (cfg.endDate && new Date(cfg.endDate).getTime() < now) {
    return { allowed: false, reason: "Survey Feud has ended." };
  }

  if (!getUserLevel(userId)) {
    return { allowed: false, reason: "An active membership is required to play Survey Feud." };
  }

  // Active sessions check
  const activeSession = read().feudSessions.find((s) => s.userId === userId && !s.completed);
  if (activeSession) {
    const ageSec = (now - activeSession.startedAt) / 1000;
    if (ageSec < (activeSession.targetPoints ? cfg.timeLimitSeconds + 60 : 120)) {
      return { allowed: true };
    }
  }

  // Daily limit check
  if (cfg.dailyLimit > 0) {
    const todayPlayed = todayFeudGamesCount(userId);
    if (todayPlayed >= cfg.dailyLimit) {
      return { allowed: false, reason: `You have reached your daily limit of ${cfg.dailyLimit} game${cfg.dailyLimit > 1 ? "s" : ""} today.` };
    }
  }

  // Max winners check if applicable
  if (cfg.maxWinners > 0) {
    const totalWinners = read().feudSessions.filter((s) => s.rewardAmount > 0 && s.completed).length;
    if (totalWinners >= cfg.maxWinners) {
      return { allowed: false, reason: `The maximum limit of ${cfg.maxWinners} winners has been reached.` };
    }
  }

  const activeQuestions = getFeudQuestions(true);
  if (activeQuestions.length < 1) {
    return { allowed: false, reason: "No active questions are available right now. Please check back later!" };
  }

  return { allowed: true };
}

/** Compute reward from score according to admin config */
export function calculateFeudReward(score: number, cfg: FeudConfig, levelId: string | null = null): number {
  const targetReward = levelId
    ? cfg.target200RewardsByLevel?.[levelId] ?? cfg.target200Reward
    : cfg.target200Reward;
  if (score >= cfg.targetPoints && targetReward > 0) {
    return targetReward;
  }
  if (score < cfg.minScoreForReward) {
    return 0;
  }
  for (const tier of cfg.scoreTiers) {
    if (score >= tier.minScore && score <= tier.maxScore) {
      return levelId ? tier.rewardsByLevel?.[levelId] ?? tier.reward : tier.reward;
    }
  }
  return 0;
}
/** Calls the feud-game edge function if deployed (server-authoritative timer,
 *  score and daily-limit validation). Returns null when the function isn't
 *  deployed yet so callers fall back seamlessly to the local handler. */
async function invokeFeudGame<T>(body: Record<string, unknown>): Promise<{ ok: true; data: T } | { ok: false; error: string; unreachable: boolean }> {
  let data: any = null;
  let error: any = null;
  let attempted = false;
  try {
    const res = await supabase.functions.invoke("feud-game", { body });
    data = res.data;
    error = res.error;
    attempted = true;
  } catch (e: any) {
    console.warn("[feud-game] invoke threw network error, switching to local handler:", e);
  }

  const unreachable =
    !attempted ||
    (error && (
      String(error.message || "").includes("Failed to send a request") ||
      String(error.message || "").includes("not found") ||
      String(error.name || "") === "FunctionsFetchError" ||
      (error as any)?.context?.status === 404
    ));

  if (unreachable) return { ok: false, error: "", unreachable: true };

  if (error) {
    const ctx: any = (error as any)?.context;
    let serverMsg = "";
    try {
      const ctxJson = ctx && typeof ctx.json === "function" ? await ctx.json().catch(() => null) : ctx;
      serverMsg = (ctxJson as any)?.error || "";
    } catch { /* ignore */ }
    return { ok: false, error: serverMsg || String(error?.message || "Request failed"), unreachable: false };
  }

  return { ok: true, data: data as T };
}

export interface FeudGameStartResult {
  session: FeudGameSession;
  questions: {
    id: string;
    prompt: string;
    category: string;
    difficulty: string;
    answers: { id: string; text: string; rank: number }[];
  }[];
  timeLimitSeconds: number;
}

/** Start a free game session */
export async function startFeudGame(userId: string): Promise<FeudGameStartResult> {
  /* Server-authoritative path: eligibility, daily limits, duplicate sessions
   * and question selection all re-validated in the feud-game function. */
  const edge = await invokeFeudGame<FeudGameStartResult & { session: FeudGameSession }>({ action: "start" });
  if (edge.ok) {
    const payload = edge.data;
    const session: FeudGameSession = {
      ...payload.session,
      startedAt: payload.session.startedAt,
    };
    update((db) => {
      db.feudSessions = db.feudSessions.map((s) =>
        s.userId === userId && !s.completed ? { ...s, completed: true, completedAt: Date.now() } : s
      );
      db.feudSessions = db.feudSessions.filter((s) => s.id !== session.id);
      db.feudSessions.unshift(session);
    });
    return {
      session,
      questions: payload.questions,
      timeLimitSeconds: payload.timeLimitSeconds,
    };
  }
  if (!edge.unreachable) throw new SvcError(edge.error || "Cannot start game at this time.");

  const check = canStartFeudGame(userId);
  if (!check.allowed) {
    throw new SvcError(check.reason || "Cannot start game at this time.");
  }

  const cfg = getFeudConfig();
  const allActive = getFeudQuestions(true);
  const seenPrompts = new Set<string>();
  const uniqueQuestions = allActive.filter((question) => {
    const prompt = question.prompt.trim().replace(/\s+/g, " ").toLowerCase();
    if (!prompt || seenPrompts.has(prompt)) return false;
    seenPrompts.add(prompt);
    return true;
  });
  if (uniqueQuestions.length === 0) {
    throw new SvcError("No questions available.");
  }

  const count = Math.min(cfg.questionsPerGame, uniqueQuestions.length);
  const shuffled = [...uniqueQuestions].sort(() => Math.random() - 0.5);
  const selectedQuestions = shuffled.slice(0, count);

  const sessionId = uid();
  const newSession: FeudGameSession = {
    id: sessionId,
    userId,
    score: 0,
    targetPoints: cfg.targetPoints || 200,
    completed: false,
    rewardAmount: 0,
    rewardStatus: "none",
    timeSpentSeconds: 0,
    startedAt: Date.now(),
    completedAt: null,
    questionIds: selectedQuestions.map((q) => q.id),
    rounds: [],
  };

  update((db) => {
    db.feudSessions = db.feudSessions.map((s) =>
      s.userId === userId && !s.completed ? { ...s, completed: true, completedAt: Date.now() } : s
    );
    db.feudSessions.unshift(newSession);
  });

  try {
    await supabase.from("feud_sessions").insert({
      id: newSession.id,
      user_id: userId,
      score: 0,
      target_points: newSession.targetPoints,
      completed: false,
      reward_amount: 0,
      reward_status: "none",
      time_spent_seconds: 0,
      started_at: new Date(newSession.startedAt).toISOString(),
      question_ids: newSession.questionIds,
      rounds: [],
    });
  } catch (e) {
    console.warn("Could not insert feud session to Supabase, continuing locally:", e);
  }

  const maskedQuestions = selectedQuestions.map((q) => ({
    id: q.id,
    prompt: q.prompt,
    category: q.category,
    difficulty: q.difficulty,
    answers: [...q.answers]
      .sort(() => Math.random() - 0.5)
      .map((a) => ({ id: a.id, text: a.text, rank: a.rank })),
  }));

  return {
    session: newSession,
    questions: maskedQuestions,
    timeLimitSeconds: cfg.timeLimitSeconds,
  };
}
export interface FeudSubmitAnswerResult {
  session: FeudGameSession;
  pointsEarned: number;
  revealedAnswers: { id: string; text: string; points: number; rank: number }[];
  isTargetReached: boolean;
  isGameComplete: boolean;
}

/** Submit an answer for a question in a session */
export async function submitFeudAnswer(
  userId: string,
  sessionId: string,
  questionId: string,
  answerId: string | null
): Promise<FeudSubmitAnswerResult> {
  /* Server-authoritative path: timer, duplicate answers and points are all
   * recomputed from the DB answer bank inside the edge function. */
  const edge = await invokeFeudGame<{
    session: FeudGameSession;
    pointsEarned: number;
    revealedAnswers: FeudSubmitAnswerResult["revealedAnswers"];
    isTargetReached: boolean;
    isGameComplete: boolean;
    walletTx: any;
  }>({ action: "answer", sessionId, questionId, answerId });

  if (edge.ok) {
    const d = edge.data;
    update((state) => {
      state.feudSessions = state.feudSessions.map((s) => (s.id === sessionId ? d.session : s));
      if (d.walletTx) {
        const tx: WalletTx = {
          id: d.walletTx.id,
          userId: d.walletTx.user_id,
          type: d.walletTx.type,
          direction: d.walletTx.direction,
          amount: Number(d.walletTx.amount),
          status: d.walletTx.status,
          description: d.walletTx.description,
          reference: d.walletTx.reference,
          sourceId: d.walletTx.source_id,
          createdAt: new Date(d.walletTx.created_at).getTime(),
        };
        const idx = state.walletTx.findIndex((t) => t.id === tx.id);
        if (idx >= 0) state.walletTx[idx] = tx;
        else state.walletTx.unshift(tx);
      }
      if (d.isGameComplete && d.session.rewardAmount > 0 && !state.notifications.some((n) => n.type === "task" && n.title === "Survey Feud Reward Credited!" && n.userId === d.session.userId)) {
        state.notifications.unshift({
          id: uid(),
          userId: d.session.userId,
          type: "task",
          title: "Survey Feud Reward Credited!",
          body: `Congratulations! You scored ${d.session.score} points in Survey Feud and earned ₦${d.session.rewardAmount.toLocaleString()}. It has been credited to your wallet.`,
          read: false,
          createdAt: Date.now(),
        });
      }
    });
    return {
      session: d.session,
      pointsEarned: d.pointsEarned,
      revealedAnswers: d.revealedAnswers,
      isTargetReached: d.isTargetReached,
      isGameComplete: d.isGameComplete,
    };
  }
  if (!edge.unreachable) throw new SvcError(edge.error || "Could not submit your answer.");

  const db = read();
  const session = db.feudSessions.find((s) => s.id === sessionId && s.userId === userId);
  if (!session) throw new SvcError("Game session not found.");
  if (session.completed) throw new SvcError("This game session is already finished.");

  const question = db.feudQuestions.find((q) => q.id === questionId);
  if (!question) throw new SvcError("Question not found.");

  if (session.rounds.some((r) => r.questionId === questionId)) {
    throw new SvcError("You have already answered this question.");
  }

  let pointsEarned = 0;
  let selectedText: string | null = null;
  if (answerId) {
    const matched = question.answers.find((a) => a.id === answerId);
    if (matched) {
      pointsEarned = matched.points;
      selectedText = matched.text;
    }
  }

  const newScore = Math.min(session.targetPoints, session.score + pointsEarned);
  const roundRecord = {
    questionId,
    prompt: question.prompt,
    selectedAnswerId: answerId,
    selectedText,
    pointsEarned,
    answeredAt: Date.now(),
    options: question.answers
      .filter((a) => a.id === answerId)
      .map((a) => ({ id: a.id, text: a.text, points: a.points, rank: a.rank })),
  };

  const updatedRounds = [...session.rounds, roundRecord];
  const isTargetReached = newScore >= session.targetPoints;
  const isAllQuestionsAnswered = updatedRounds.length >= session.questionIds.length;
  const isGameComplete = isTargetReached || isAllQuestionsAnswered;

  let rewardAmount = session.rewardAmount;
  let rewardStatus = session.rewardStatus;
  const cfg = getFeudConfig();

  if (isGameComplete) {
    rewardAmount = calculateFeudReward(newScore, cfg, getUserLevel(userId)?.id || null);
    rewardStatus = rewardAmount > 0 ? "credited" : "none";
  }

  const timeSpent = Math.max(1, Math.floor((Date.now() - session.startedAt) / 1000));

  const updatedSession: FeudGameSession = {
    ...session,
    score: newScore,
    completed: isGameComplete,
    completedAt: isGameComplete ? Date.now() : null,
    rewardAmount,
    rewardStatus,
    timeSpentSeconds: timeSpent,
    rounds: updatedRounds,
  };

  update((state) => {
    state.feudSessions = state.feudSessions.map((s) => (s.id === sessionId ? updatedSession : s));

    if (isGameComplete && rewardAmount > 0) {
      const txRef = genRef("FEUD");
      const tx: WalletTx = {
        id: uid(),
        userId,
        type: "feud_reward",
        direction: "credit",
        amount: rewardAmount,
        status: "approved",
        description: `Survey Feud Reward (${newScore}/${session.targetPoints} pts)`,
        reference: txRef,
        sourceId: sessionId,
        createdAt: Date.now(),
      };
      state.walletTx.unshift(tx);

      state.notifications.unshift({
        id: uid(),
        userId,
        type: "task",
        title: "Survey Feud Reward Credited!",
        body: `Congratulations! You scored ${newScore} points in Survey Feud and earned ₦${rewardAmount.toLocaleString()}. It has been credited to your wallet.`,
        read: false,
        createdAt: Date.now(),
      });
    }
  });

  try {
    await supabase.from("feud_sessions").upsert({
      id: updatedSession.id,
      user_id: userId,
      score: updatedSession.score,
      target_points: updatedSession.targetPoints,
      completed: updatedSession.completed,
      reward_amount: updatedSession.rewardAmount,
      reward_status: updatedSession.rewardStatus,
      time_spent_seconds: updatedSession.timeSpentSeconds,
      started_at: new Date(updatedSession.startedAt).toISOString(),
      completed_at: updatedSession.completedAt ? new Date(updatedSession.completedAt).toISOString() : null,
      question_ids: updatedSession.questionIds,
      rounds: updatedSession.rounds,
    });

    if (isGameComplete && rewardAmount > 0) {
      const tx = read().walletTx.find((t) => t.sourceId === sessionId);
      if (tx) {
        await supabase.from("wallet_transactions").insert({
          id: tx.id,
          user_id: tx.userId,
          type: tx.type,
          direction: tx.direction,
          amount: tx.amount,
          status: tx.status,
          description: tx.description,
          reference: tx.reference,
          source_id: tx.sourceId,
        });
      }
    }
  } catch (e) {
    console.warn("Could not sync feud session to Supabase:", e);
  }

  return {
    session: updatedSession,
    pointsEarned,
    revealedAnswers: question.answers.filter((a) => a.id === answerId),
    isTargetReached,
    isGameComplete,
  };
}
/** Complete session on timer expiration */
export async function completeFeudGameOnTimeout(userId: string, sessionId: string): Promise<FeudGameSession> {
  /* Server-authoritative finalize: score and reward come from the DB row. */
  const edge = await invokeFeudGame<{ session: FeudGameSession; walletTx: any }>({
    action: "timeout", sessionId,
  });
  if (edge.ok) {
    const d = edge.data;
    update((state) => {
      state.feudSessions = state.feudSessions.map((s) => (s.id === sessionId ? d.session : s));
      if (d.walletTx) {
        const tx: WalletTx = {
          id: d.walletTx.id,
          userId: d.walletTx.user_id,
          type: d.walletTx.type,
          direction: d.walletTx.direction,
          amount: Number(d.walletTx.amount),
          status: d.walletTx.status,
          description: d.walletTx.description,
          reference: d.walletTx.reference,
          sourceId: d.walletTx.source_id,
          createdAt: new Date(d.walletTx.created_at).getTime(),
        };
        const idx = state.walletTx.findIndex((t) => t.id === tx.id);
        if (idx >= 0) state.walletTx[idx] = tx;
        else state.walletTx.unshift(tx);
      }
    });
    return d.session;
  }
  if (!edge.unreachable) {
    /* fall back to the locally stored session so the UI can still finish */
    console.warn("[feud-game] timeout finalize failed:", edge.error);
  }

  const db = read();
  const session = db.feudSessions.find((s) => s.id === sessionId && s.userId === userId);
  if (!session || session.completed) return session || ({} as FeudGameSession);

  const cfg = getFeudConfig();
  const rewardAmount = calculateFeudReward(session.score, cfg, getUserLevel(userId)?.id || null);
  const rewardStatus = rewardAmount > 0 ? "credited" : "none";
  const timeSpent = Math.max(1, Math.floor((Date.now() - session.startedAt) / 1000));

  const updatedSession: FeudGameSession = {
    ...session,
    completed: true,
    completedAt: Date.now(),
    rewardAmount,
    rewardStatus,
    timeSpentSeconds: timeSpent,
  };

  update((state) => {
    state.feudSessions = state.feudSessions.map((s) => (s.id === sessionId ? updatedSession : s));

    if (rewardAmount > 0) {
      const txRef = genRef("FEUD");
      const tx: WalletTx = {
        id: uid(),
        userId,
        type: "feud_reward",
        direction: "credit",
        amount: rewardAmount,
        status: "approved",
        description: `Survey Feud Reward (${session.score}/${session.targetPoints} pts)`,
        reference: txRef,
        sourceId: sessionId,
        createdAt: Date.now(),
      };
      state.walletTx.unshift(tx);

      state.notifications.unshift({
        id: uid(),
        userId,
        type: "task",
        title: "Survey Feud Reward Credited!",
        body: `You scored ${session.score} points in Survey Feud and earned ₦${rewardAmount.toLocaleString()}.`,
        read: false,
        createdAt: Date.now(),
      });
    }
  });

  try {
    await supabase.from("feud_sessions").upsert({
      id: updatedSession.id,
      user_id: userId,
      score: updatedSession.score,
      target_points: updatedSession.targetPoints,
      completed: true,
      reward_amount: updatedSession.rewardAmount,
      reward_status: updatedSession.rewardStatus,
      time_spent_seconds: updatedSession.timeSpentSeconds,
      started_at: new Date(updatedSession.startedAt).toISOString(),
      completed_at: new Date(updatedSession.completedAt!).toISOString(),
      question_ids: updatedSession.questionIds,
      rounds: updatedSession.rounds,
    });
  } catch (e) {
    console.warn("Could not sync feud timeout session:", e);
  }

  return updatedSession;
}

/* ================= ADMIN FEUD MANAGEMENT ================= */

export async function adminSaveFeudConfig(adminId: string, config: FeudConfig) {
  requireAdmin(adminId);
  try {
    await invokeAdmin("save-feud-settings", { config });
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      const { data: curr } = await supabase.from("platform_settings").select("payload").eq("id", true).maybeSingle();
      const payload = { ...(curr?.payload || {}), feud: config };
      await supabase.from("platform_settings").upsert({ id: true, payload, updated_at: new Date().toISOString() });
      update((db) => {
        db.settings.feud = config;
      });
      return;
    }
    throw err;
  }
  await hydrateAll();
}
export async function adminSaveFeudQuestion(adminId: string, question: Omit<FeudQuestion, "createdAt"> & { id?: string }) {
  requireAdmin(adminId);
  const id = question.id || uid();
  const fullQuestion: FeudQuestion = {
    id,
    prompt: question.prompt.trim(),
    category: question.category.trim() || "General",
    difficulty: question.difficulty,
    explanation: question.explanation?.trim(),
    answers: question.answers.map((a, i) => ({
      id: a.id || `ans-${i + 1}`,
      text: a.text.trim(),
      points: Number(a.points) || 10,
      rank: Number(a.rank) || i + 1,
    })),
    status: question.status,
    createdAt: Date.now(),
  };

  try {
    await invokeAdmin("save-feud-question", { question: fullQuestion });
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      update((db) => {
        const idx = db.feudQuestions.findIndex((q) => q.id === id);
        if (idx >= 0) {
          db.feudQuestions[idx] = { ...db.feudQuestions[idx], ...fullQuestion };
        } else {
          db.feudQuestions.unshift(fullQuestion);
        }
      });
      await supabase.from("feud_questions").upsert({
        id: fullQuestion.id,
        prompt: fullQuestion.prompt,
        category: fullQuestion.category,
        difficulty: fullQuestion.difficulty,
        explanation: fullQuestion.explanation,
        answers: fullQuestion.answers,
        status: fullQuestion.status,
      });
      return;
    }
    throw err;
  }
  await hydrateAll();
}

export async function adminDeleteFeudQuestion(adminId: string, questionId: string) {
  requireAdmin(adminId);
  try {
    await invokeAdmin("delete-feud-question", { questionId });
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      update((db) => {
        db.feudQuestions = db.feudQuestions.filter((q) => q.id !== questionId);
      });
      await supabase.from("feud_questions").delete().eq("id", questionId);
      return;
    }
    throw err;
  }
  await hydrateAll();
}

export interface FeudImportResult {
  inserted: number;
  failed: number;
  errors: { row: number; error: string }[];
}

export async function adminImportFeudQuestions(
  adminId: string,
  questions: Omit<FeudQuestion, "id" | "createdAt">[]
): Promise<FeudImportResult> {
  requireAdmin(adminId);
  try {
    const res = await invokeAdmin("import-feud-questions", { questions });
    await hydrateAll();
    return res as FeudImportResult;
  } catch (err: any) {
    const isUnreachable =
      String(err?.message || "").includes("Failed to send a request") ||
      String(err?.message || "").includes("not found") ||
      String(err?.message || "").includes("404");
    if (isUnreachable) {
      let inserted = 0;
      let failed = 0;
      const errors: { row: number; error: string }[] = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.prompt?.trim() || !q.answers || q.answers.length === 0) {
          failed++;
          errors.push({ row: i + 1, error: "Missing prompt or answers" });
          continue;
        }

        const newQ: FeudQuestion = {
          id: uid(),
          prompt: q.prompt.trim(),
          category: q.category || "General",
          difficulty: q.difficulty || "easy",
          explanation: q.explanation,
          answers: q.answers.map((a, aIdx) => ({
            id: uid(),
            text: a.text.trim(),
            points: Number(a.points) || 10,
            rank: a.rank || aIdx + 1,
          })),
          status: q.status || "active",
          createdAt: Date.now(),
        };

        const db = read();
        const exists = db.feudQuestions.some(
          (existing) => existing.prompt.toLowerCase() === newQ.prompt.toLowerCase()
        );
        if (!exists) {
          update((state) => {
            state.feudQuestions.unshift(newQ);
          });
          inserted++;
          await supabase.from("feud_questions").upsert({
            id: newQ.id,
            prompt: newQ.prompt,
            category: newQ.category,
            difficulty: newQ.difficulty,
            explanation: newQ.explanation,
            answers: newQ.answers,
            status: newQ.status,
          });
        } else {
          failed++;
          errors.push({ row: i + 1, error: `Duplicate question: "${newQ.prompt}"` });
        }
      }

      return { inserted, failed, errors };
    }
    throw err;
  }
}




