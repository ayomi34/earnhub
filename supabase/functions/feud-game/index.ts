import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub feud-game edge function.
 * The Family Feud session lifecycle is validated HERE, server-side:
 *  - start   : eligibility (enabled, dates, daily limit, max winners, questions)
 *              + duplicate active-session prevention, then inserts the session
 *  - answer  : timer re-check, question membership, one-answer-per-question,
 *              points computed from the DB answer bank (client can't inflate),
 *              reward tiers re-evaluated on completion, wallet credit + notify
 *  - timeout : finalize with the stored score after the timer has expired
 * The client only visualizes; tampering with it changes nothing. */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/* Mirrors DEFAULT_FEUD_CONFIG in src/lib/db.ts */
const DEFAULT_FEUD = {
  enabled: true,
  targetPoints: 200,
  timeLimitSeconds: 25,
  questionsPerGame: 4,
  dailyLimit: 3,
  minScoreForReward: 100,
  target200Reward: 100,
  target200RewardsByLevel: {} as Record<string, number>,
  scoreTiers: [
    { minScore: 100, maxScore: 149, reward: 25, rewardsByLevel: {} as Record<string, number> },
    { minScore: 150, maxScore: 199, reward: 50, rewardsByLevel: {} as Record<string, number> },
    { minScore: 200, maxScore: 200, reward: 100, rewardsByLevel: {} as Record<string, number> },
  ],
  maxWinners: 0,
  startDate: null as string | null,
  endDate: null as string | null,
};

/** Server-authoritative reward calculation (mirrors calculateFeudReward). */
function calcReward(score: number, cfg: typeof DEFAULT_FEUD, levelId: string | null): number {
  const targetReward = levelId
    ? cfg.target200RewardsByLevel?.[levelId] ?? cfg.target200Reward
    : cfg.target200Reward;
  if (score >= (cfg.targetPoints || 200) && targetReward > 0) return targetReward;
  if (score < cfg.minScoreForReward) return 0;
  for (const tier of cfg.scoreTiers) {
    if (score >= tier.minScore && score <= tier.maxScore) {
      return levelId ? tier.rewardsByLevel?.[levelId] ?? tier.reward : tier.reward;
    }
  }
  return 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body ok */ }
  const action = String(body?.action || "start");

  /* ---------- profile + config ---------- */
  const { data: profile } = await admin
    .from("profiles").select("id, status, membership_id").eq("id", user.id).maybeSingle();
  if (!profile) return json({ error: "Profile not found" }, 404);
  if (profile.status !== "active") return json({ error: "This account has been suspended." }, 403);

  const { data: membership } = await admin
    .from("memberships").select("level_id").eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!membership) return json({ error: "An active membership is required to play Survey Feud." }, 403);
  const membershipLevelId: string = membership.level_id;

  const { data: settingsRow } = await admin
    .from("platform_settings").select("payload").eq("id", true).maybeSingle();
  const cfg: typeof DEFAULT_FEUD = {
    ...structuredClone(DEFAULT_FEUD),
    ...((settingsRow?.payload as any)?.feud ?? {}),
  };
  if (cfg.enabled !== true) return json({ error: "Survey Feud is currently paused by admin." }, 403);

  const now = Date.now();
  if (cfg.startDate && new Date(cfg.startDate).getTime() > now)
    return json({ error: `Survey Feud starts on ${new Date(cfg.startDate).toLocaleDateString()}.` }, 403);
  if (cfg.endDate && new Date(cfg.endDate).getTime() < now)
    return json({ error: "Survey Feud has ended." }, 403);

  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayStartIso = dayStart.toISOString();

  const { data: myToday } = await admin
    .from("feud_sessions")
    .select("id, completed, started_at, reward_amount")
    .eq("user_id", user.id)
    .gte("started_at", dayStartIso);

  if (action === "start") {
    /* daily limit (completed games today) */
    const completedToday = (myToday ?? []).filter((s: any) => s.completed).length;
    if (cfg.dailyLimit > 0 && completedToday >= cfg.dailyLimit)
      return json({ error: `You have reached your daily limit of ${cfg.dailyLimit} game${cfg.dailyLimit > 1 ? "s" : ""} today.` }, 429);

    /* max winners */
    if (cfg.maxWinners > 0) {
      const { count: winners } = await admin
        .from("feud_sessions")
        .select("id", { count: "exact", head: true })
        .gt("reward_amount", 0)
        .eq("completed", true);
      if ((winners ?? 0) >= cfg.maxWinners)
        return json({ error: `The maximum limit of ${cfg.maxWinners} winners has been reached.` }, 429);
    }

    /* duplicate active-session prevention: finalize stale ones, block fresh ones */
    const activeSessions = (myToday ?? []).filter((s: any) => !s.completed);
    const staleCutoff = new Date(now - (Number(cfg.timeLimitSeconds) + 60) * 1000).toISOString();
    const freshActive = activeSessions.find((s: any) => s.started_at > staleCutoff);
    if (freshActive)
      return json({ error: "You already have a game in progress." }, 409);
    for (const stale of activeSessions) {
      await admin.from("feud_sessions")
        .update({ completed: true, completed_at: new Date().toISOString() })
        .eq("id", stale.id);
    }

    /* questions */
    const { data: questions } = await admin
      .from("feud_questions").select("*")
      .eq("status", "active");
    if (!questions || questions.length < 1)
      return json({ error: "No active questions are available right now. Please check back later!" }, 404);

    const seenPrompts = new Set<string>();
    const uniqueQuestions = questions.filter((question: any) => {
      const prompt = String(question.prompt || "").trim().replace(/\s+/g, " ").toLowerCase();
      if (!prompt || seenPrompts.has(prompt)) return false;
      seenPrompts.add(prompt);
      return true;
    });
    if (uniqueQuestions.length === 0)
      return json({ error: "No active questions are available right now. Please check back later!" }, 404);
    const shuffled = [...uniqueQuestions].sort(() => Math.random() - 0.5);
    const count = Math.min(Math.max(1, Number(cfg.questionsPerGame) || 4), shuffled.length);
    const selected = shuffled.slice(0, count);

    const targetPoints = Math.max(50, Number(cfg.targetPoints) || 200);
    const { data: session, error: insertError } = await admin.from("feud_sessions").insert({
      user_id: user.id,
      score: 0,
      target_points: targetPoints,
      completed: false,
      reward_amount: 0,
      reward_status: "none",
      time_spent_seconds: 0,
      started_at: new Date().toISOString(),
      question_ids: selected.map((q) => q.id),
      rounds: [],
    }).select().single();
    if (insertError || !session)
      return json({ error: insertError?.message || "Could not start the game" }, 500);

    return json({
      session: mapSession(session),
      questions: selected.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        category: q.category,
        difficulty: q.difficulty,
        answers: Array.isArray(q.answers)
          ? q.answers.map((a: any) => ({ id: a.id, text: a.text, rank: a.rank }))
          : [],
      })),
      timeLimitSeconds: Number(cfg.timeLimitSeconds) || 25,
    });
  }

  if (action === "answer" || action === "timeout") {
    const sessionId = String(body?.sessionId || "");
    if (!sessionId) return json({ error: "sessionId is required" }, 400);

    const { data: session } = await admin
      .from("feud_sessions").select("*").eq("id", sessionId).maybeSingle();
    if (!session || session.user_id !== user.id)
      return json({ error: "Game session not found." }, 404);
    if (session.completed)
      return json({ error: "This game session is already finished." }, 409);

    /* server-side timer: enforce deadline + 90s network grace */
    const startedMs = new Date(session.started_at).getTime();
    const deadline = startedMs + (Number(cfg.timeLimitSeconds) || 25) * 1000 + 90_000;
    const expired = now > deadline;

    const rounds: any[] = Array.isArray(session.rounds) ? session.rounds : [];
    const questionIds: string[] = Array.isArray(session.question_ids) ? session.question_ids : [];
    let score = Number(session.score) || 0;
    let pointsEarned = 0;
    let revealedAnswers: any[] = [];

    if (action === "answer") {
      if (expired)
        return json({ error: "Time is up for this game." }, 409);

      const questionId = String(body?.questionId || "");
      if (!questionIds.includes(questionId))
        return json({ error: "Question is not part of this game." }, 400);
      if (rounds.some((r) => r.questionId === questionId))
        return json({ error: "You have already answered this question." }, 409);

      const { data: q } = await admin
        .from("feud_questions").select("*").eq("id", questionId).maybeSingle();
      if (!q) return json({ error: "Question not found." }, 404);

      const answers: any[] = Array.isArray(q.answers) ? q.answers : [];
      const answerId = body?.answerId ? String(body.answerId) : null;
      revealedAnswers = answers.filter((a: any) => a.id === answerId);
      if (answerId) {
        const matched = answers.find((a: any) => a.id === answerId);
        if (matched) pointsEarned = Math.max(0, Number(matched.points) || 0);
      }
      score = Math.min(Number(session.target_points) || 200, score + pointsEarned);

      rounds.push({
        questionId,
        prompt: q.prompt,
        selectedAnswerId: answerId,
        selectedText: answerId ? (answers.find((a: any) => a.id === answerId)?.text ?? null) : null,
        pointsEarned,
        answeredAt: now,
        options: answers
          .filter((a: any) => a.id === answerId)
          .map((a: any) => ({ id: a.id, text: a.text, points: a.points, rank: a.rank })),
      });
    }

    const targetReached = score >= (Number(session.target_points) || 200);
    const allAnswered = rounds.length >= questionIds.length;
    const isGameComplete = expired || targetReached || allAnswered;

    let rewardAmount = 0;
    let rewardStatus = "none";
    if (isGameComplete) {
      rewardAmount = calcReward(score, cfg, membershipLevelId);
      rewardStatus = rewardAmount > 0 ? "credited" : "none";
    }
    const timeSpent = Math.max(1, Math.round((now - startedMs) / 1000));

    const { data: updated, error: updateError } = await admin.from("feud_sessions").update({
      score,
      rounds,
      completed: isGameComplete,
      completed_at: isGameComplete ? new Date().toISOString() : null,
      reward_amount: rewardAmount,
      reward_status: rewardStatus,
      time_spent_seconds: timeSpent,
    }).eq("id", sessionId).select().single();
    if (updateError || !updated)
      return json({ error: updateError?.message || "Could not save the game" }, 500);


    /* wallet credit + notification on completion (idempotent via source_id) */
    let walletTx = null;
    if (isGameComplete && rewardAmount > 0) {
      const { data: existingTx } = await admin
        .from("wallet_transactions").select("*")
        .eq("source_id", sessionId).maybeSingle();
      if (existingTx) {
        walletTx = existingTx;
      } else {
        const reference = `EH-FEUD-${Date.now().toString(36).toUpperCase()}${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const { data: tx } = await admin.from("wallet_transactions").insert({
          user_id: user.id,
          type: "feud_reward",
          direction: "credit",
          amount: rewardAmount,
          status: "approved",
          description: `Survey Feud Reward (${score}/${session.target_points} pts)`,
          reference,
          source_id: sessionId,
        }).select().single();
        walletTx = tx ?? null;

        await admin.from("notifications").insert({
          user_id: user.id,
          type: "task",
          title: "Survey Feud Reward Credited!",
          body: `Congratulations! You scored ${score} points in Survey Feud and earned ₦${rewardAmount.toLocaleString()}. It has been credited to your wallet.`,
          read: false,
        });
      }
    }

    return json({
      session: mapSession(updated),
      pointsEarned,
      revealedAnswers,
      isTargetReached: targetReached,
      isGameComplete,
      walletTx,
    });
  }

  return json({ error: "Unknown action" }, 400);
});

function mapSession(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    score: Number(row.score) || 0,
    targetPoints: Number(row.target_points) || 200,
    completed: !!row.completed,
    rewardAmount: Number(row.reward_amount) || 0,
    rewardStatus: row.reward_status || "none",
    timeSpentSeconds: Number(row.time_spent_seconds) || 0,
    startedAt: new Date(row.started_at).getTime(),
    completedAt: row.completed_at ? new Date(row.completed_at).getTime() : null,
    questionIds: Array.isArray(row.question_ids) ? row.question_ids : [],
    rounds: Array.isArray(row.rounds) ? row.rounds : [],
  };
}


