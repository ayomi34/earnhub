import { useState } from "react";
import { MessageSquare, Plus, Save, Trash2, Upload, Download, Edit2 } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHead,
  Select, Td, Table, Textarea, fmtDateTime, fmtN,
} from "../components/ui";
import FeudImportModal from "../components/FeudImport";
import {
  adminSaveFeudConfig, adminSaveFeudQuestion, adminDeleteFeudQuestion,
  getFeudConfig, getFeudQuestions, getAllFeudSessions,
} from "../lib/feudServices";
import { getAllUsers, listLevels } from "../lib/services";
import { useAction, useData, useUser } from "../lib/store";
import type { FeudAnswer, FeudConfig, FeudQuestion, FeudScoreTier, FeudGameSession, MembershipLevel } from "../lib/types";

interface SessionRow extends FeudGameSession {
  userName: string;
  userEmail: string;
}

const DIFFICULTIES: FeudQuestion["difficulty"][] = ["easy", "medium", "hard"];

function sameDay(ts: number): boolean {
  const d = new Date(ts), n = new Date();
  return d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
}

export function AdminFeud() {
  const admin = useUser()!;
  const config = useData(getFeudConfig);
  const questions = useData(() => getFeudQuestions(false));
  const users = useData(getAllUsers);
  const levels = useData(() => listLevels(true));
  const { busy, run } = useAction();

  const [draft, setDraft] = useState<FeudConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);
  const [editing, setEditing] = useState<FeudQuestion | null>(null);
  const [deleting, setDeleting] = useState<FeudQuestion | null>(null);
  const [showImport, setShowImport] = useState(false);

  const sessions: SessionRow[] = useData(() =>
    [...getAllFeudSessions()].map((s) => {
      const u = users.find((x) => x.id === s.userId);
      return { ...s, userName: u?.fullName || "Unknown", userEmail: u?.email || "" };
    })
  );

  const activeQuestions = questions.filter((q) => q.status === "active").length;
  const completedSessions = sessions.filter((s) => s.completed);
  const totalRewards = completedSessions.reduce((sum, s) => sum + s.rewardAmount, 0);
  const rewardsToday = completedSessions
    .filter((s) => s.completedAt && sameDay(s.completedAt))
    .reduce((sum, s) => sum + s.rewardAmount, 0);
  const playersToday = new Set(
    sessions.filter((s) => sameDay(s.startedAt)).map((s) => s.userId)
  ).size;

  const set = <K extends keyof FeudConfig>(key: K, value: FeudConfig[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const saveConfig = async () => {
    const ok = await run(() => adminSaveFeudConfig(admin.id, draft), "Survey Feud settings saved.");
    if (ok !== null) setDirty(false);
  };

  const saveQuestion = async (q: FeudQuestion) => {
    const res = await run(() => adminSaveFeudQuestion(admin.id, q), "Question saved.");
    if (res !== null) setEditing(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const res = await run(() => adminDeleteFeudQuestion(admin.id, deleting.id), "Question deleted.");
    if (res !== null) setDeleting(null);
  };

  const exportCsv = () => {
    const header = ["Member", "Email", "Score", "Target", "Reward (NGN)", "Status", "Completed", "Started"];
    const lines = sessions.map((s) => [
      s.userName, s.userEmail, String(s.score), String(s.targetPoints), String(s.rewardAmount),
      s.completed ? "completed" : "in progress",
      s.completedAt ? new Date(s.completedAt).toISOString() : "",
      new Date(s.startedAt).toISOString(),
    ].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "survey-feud-sessions.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-8">
      <PageHead
        title="Family Feud"
        sub="Run the survey game: question bank, timer, score targets, rewards and daily limits."
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="h-4 w-4" /> Import XLSX/CSV
            </Button>
            <Button onClick={() => setEditing(blankQuestion())}>
              <Plus className="h-4 w-4" /> New Question
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Active questions</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{activeQuestions}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{questions.length} total in bank</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Games played</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{completedSessions.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{playersToday} players today</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Rewards paid (total)</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">{fmtN(totalRewards)}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">{fmtN(rewardsToday)} today</p>
        </Card>
        <Card className="p-4 md:p-5">
          <p className="text-xs font-medium text-slate-500">Game status</p>
          <p className="mt-1.5 text-lg font-bold text-slate-900">
            <Badge tone={draft.enabled ? "green" : "red"}>{draft.enabled ? "Live" : "Paused"}</Badge>
          </p>
          <p className="mt-0.5 text-[11px] text-slate-400">{draft.dailyLimit}/user/day · {draft.timeLimitSeconds}s timer</p>
        </Card>
      </div>

      <div className="mt-8 space-y-8">
        <SettingsCard
          draft={draft}
          levels={levels}
          dirty={dirty}
          busy={busy}
          onChange={set}
          onSave={saveConfig}
          onTierChange={(i, patch) => {
            setDraft((prev) => ({
              ...prev,
              scoreTiers: prev.scoreTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
            }));
            setDirty(true);
          }}
          onAddTier={() => {
            setDraft((prev) => ({
              ...prev,
              scoreTiers: [...prev.scoreTiers, { minScore: 0, maxScore: 0, reward: 0 }],
            }));
            setDirty(true);
          }}
          onRemoveTier={(i) => {
            setDraft((prev) => ({ ...prev, scoreTiers: prev.scoreTiers.filter((_, idx) => idx !== i) }));
            setDirty(true);
          }}
        />


        <Card>
          <CardHeader title="Questions" sub={`${activeQuestions} active · ${questions.length} total`} />
          {questions.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-5 w-5" />}
              title="No questions yet"
              sub="Create questions manually or bulk-import an XLSX/CSV file."
              action={<Button onClick={() => setEditing(blankQuestion())}><Plus className="h-4 w-4" /> New Question</Button>}
            />
          ) : (
            <Table head={["Question", "Category", "Answers", "Status", ""]}>
              {questions.slice(0, 50).map((q) => (
                <tr key={q.id}>
                  <Td className="max-w-[260px]">
                    <span className="block truncate font-medium">{q.prompt}</span>
                    <span className="text-xs capitalize text-slate-400">{q.difficulty}</span>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">{q.category}</Td>
                  <Td>{q.answers.length}</Td>
                  <Td>
                    <Badge tone={q.status === "active" ? "green" : "slate"}>
                      {q.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex justify-end gap-1.5">
                      <Button size="sm" variant="outline" onClick={() => setEditing(JSON.parse(JSON.stringify(q)))}>
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setDeleting(q)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

      <Card>
        <CardHeader
          title="Game sessions"
          sub="Every game started by members, with score and reward outcomes"
          action={
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={sessions.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          }
        />
        {sessions.length === 0 ? (
          <EmptyState icon={<MessageSquare className="h-5 w-5" />} title="No games played yet" sub="Sessions appear here as members play." />
        ) : (
          <Table head={["Member", "Score", "Reward", "Status", "When"]}>
            {sessions.slice(0, 50).map((s) => (
              <tr key={s.id}>
                <Td>
                  <span className="block font-medium">{s.userName}</span>
                  <span className="text-xs text-slate-400">{s.userEmail}</span>
                </Td>
                <Td className="font-semibold">
                  {s.score}/{s.targetPoints}
                  <span className="ml-2 text-xs font-normal text-slate-400">{s.rounds.length} rounds</span>
                </Td>
                <Td className="font-semibold">{s.rewardAmount > 0 ? fmtN(s.rewardAmount) : "—"}</Td>
                <Td>
                  <Badge tone={s.completed ? (s.rewardAmount > 0 ? "green" : "slate") : "amber"}>
                    {s.completed ? (s.rewardAmount > 0 ? "Rewarded" : "No reward") : "In progress"}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-xs text-slate-400">
                  {fmtDateTime(s.completedAt || s.startedAt)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      </div>


      {editing && (
        <QuestionModal
          question={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={saveQuestion}
        />
      )}

      <Modal open={!!deleting} onClose={() => setDeleting(null)} title="Delete question">
        <p className="text-sm text-slate-600">
          Delete <span className="font-semibold">"{deleting?.prompt}"</span>? This cannot be undone and may
          interrupt games that are currently in progress.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>

      <FeudImportModal
        open={showImport}
        onClose={() => setShowImport(false)}
        onSuccess={() => setShowImport(false)}
      />
    </div>
  );
}

/* ================= settings ================= */

function SettingsCard({ draft, levels, dirty, busy, onChange, onSave, onTierChange, onAddTier, onRemoveTier }: {
  draft: FeudConfig;
  levels: MembershipLevel[];
  dirty: boolean;
  busy: boolean;
  onChange: <K extends keyof FeudConfig>(key: K, value: FeudConfig[K]) => void;
  onSave: () => void;
  onTierChange: (i: number, patch: Partial<FeudScoreTier>) => void;
  onAddTier: () => void;
  onRemoveTier: (i: number) => void;
}) {
  const num = (v: string, min = 0) => Math.max(min, Math.floor(Number(v) || 0));
  return (
    <Card>
      <CardHeader
        title="Game settings"
        sub="Applies to all future games immediately after saving"
        action={
          <Button onClick={onSave} loading={busy} disabled={!dirty}>
            <Save className="h-4 w-4" /> Save
          </Button>
        }
      />
      <div className="mx-auto grid max-w-5xl gap-5 p-6 md:grid-cols-2 md:p-8">
        <Field label="Status" hint={draft.enabled ? "Members can play now" : "Game is paused"}>
          <Select value={draft.enabled ? "on" : "off"} onChange={(e) => onChange("enabled", e.target.value === "on")}>
            <option value="on">Live — members can play</option>
            <option value="off">Paused — hide from members</option>
          </Select>
        </Field>
        <Field label="Time limit (seconds)" hint="whole game">
          <Input type="number" min={10} max={300} value={draft.timeLimitSeconds} onChange={(e) => onChange("timeLimitSeconds", num(e.target.value, 10))} />
        </Field>
        <Field label="Questions per game">
          <Input type="number" min={1} max={20} value={draft.questionsPerGame} onChange={(e) => onChange("questionsPerGame", num(e.target.value, 1))} />
        </Field>
        <Field label="Daily games per member" hint="0 = unlimited">
          <Input type="number" min={0} max={100} value={draft.dailyLimit} onChange={(e) => onChange("dailyLimit", num(e.target.value))} />
        </Field>
        <Field label="Max total winners" hint="0 = unlimited">
          <Input type="number" min={0} value={draft.maxWinners} onChange={(e) => onChange("maxWinners", num(e.target.value))} />
        </Field>
        <Field label="Minimum score for reward">
          <Input type="number" min={0} value={draft.minScoreForReward} onChange={(e) => onChange("minScoreForReward", num(e.target.value))} />
        </Field>
        <Field label="Activation date" hint="optional — leave empty to start now">
          <Input
            type="date"
            value={draft.startDate ? draft.startDate.slice(0, 10) : ""}
            onChange={(e) => onChange("startDate", e.target.value || null)}
          />
        </Field>
        <Field label="End date" hint="optional — leave empty for no end">
          <Input
            type="date"
            value={draft.endDate ? draft.endDate.slice(0, 10) : ""}
            onChange={(e) => onChange("endDate", e.target.value || null)}
          />
        </Field>
      </div>


      <section className="mt-2 border-t border-slate-100 px-6 py-7 md:px-8">
        <div className="mx-auto mb-6 max-w-5xl">
          <h3 className="text-sm font-semibold text-slate-900">Membership rewards</h3>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Set payouts in naira for each level. Reaching the target score pays its target reward; otherwise, an eligible score can match a score tier.
          </p>
        </div>

        <div className="mx-auto max-w-5xl space-y-8">
          <section className="rounded-md border border-slate-200 p-6 md:p-7">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-[13px] font-semibold text-slate-800">Target score payout</h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">Paid when the member reaches the target score.</p>
              </div>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Target points">
                <Input type="number" min={50} value={draft.targetPoints} onChange={(e) => onChange("targetPoints", num(e.target.value, 50))} />
              </Field>
            {levels.length > 0 ? (
              levels.map((level) => (
                <Field key={level.id} label={`${level.name} payout (NGN)`}>
                  <Input
                    type="number"
                    min={0}
                    value={draft.target200RewardsByLevel?.[level.id] ?? draft.target200Reward}
                    onChange={(e) => onChange("target200RewardsByLevel", {
                      ...draft.target200RewardsByLevel,
                      [level.id]: num(e.target.value),
                    })}
                  />
                </Field>
              ))
            ) : (
              <Field label="Target payout (NGN)" hint="Used when no membership levels are enabled.">
                <Input type="number" min={0} value={draft.target200Reward} onChange={(e) => onChange("target200Reward", num(e.target.value))} />
              </Field>
            )}
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-[13px] font-semibold text-slate-800">Score-tier payouts</h4>
                <p className="mt-1 text-xs text-slate-500">Paid for eligible scores below the target.</p>
              </div>
              <Button size="sm" variant="outline" onClick={onAddTier}>
                <Plus className="h-3.5 w-3.5" /> Add tier
              </Button>
            </div>
            <div className="space-y-5">
              {draft.scoreTiers.map((tier, i) => (
                <div key={i} className="rounded-md border border-slate-200 p-6 md:p-7">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase text-slate-500">Score tier {i + 1}</p>
                    <Button
                      size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                      aria-label={`Remove score tier ${i + 1}`}
                      title="Remove score tier"
                      disabled={draft.scoreTiers.length <= 1}
                      onClick={() => onRemoveTier(i)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid gap-5 md:grid-cols-2">
                    <Field label="Minimum points">
                      <Input type="number" min={0} value={tier.minScore} onChange={(e) => onTierChange(i, { minScore: Number(e.target.value) || 0 })} />
                    </Field>
                    <Field label="Maximum points">
                      <Input type="number" min={0} value={tier.maxScore} onChange={(e) => onTierChange(i, { maxScore: Number(e.target.value) || 0 })} />
                    </Field>
                  </div>
                  <div className="mt-5 grid gap-5 md:grid-cols-2">
                    {levels.length > 0 ? levels.map((level) => (
                      <Field key={level.id} label={`${level.name} payout (NGN)`}>
                        <Input
                          type="number"
                          min={0}
                          value={tier.rewardsByLevel?.[level.id] ?? tier.reward}
                          onChange={(e) => onTierChange(i, {
                            rewardsByLevel: {
                              ...tier.rewardsByLevel,
                              [level.id]: Number(e.target.value) || 0,
                            },
                          })}
                        />
                      </Field>
                    )) : (
                      <Field label="Payout (NGN)">
                        <Input type="number" min={0} value={tier.reward} onChange={(e) => onTierChange(i, { reward: Number(e.target.value) || 0 })} />
                      </Field>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <p className="mx-auto mt-6 max-w-5xl text-xs leading-5 text-slate-500">
          Scores below the minimum score for reward earn nothing. For other scores, the first matching tier pays; reaching the target score uses the target payout instead.
        </p>
      </section>
    </Card>
  );
}


/* ================= question editor ================= */

function blankQuestion(): FeudQuestion {
  return {
    id: "",
    prompt: "",
    category: "General",
    difficulty: "easy",
    explanation: "",
    answers: [
      { id: "a1", text: "", points: 40, rank: 1 },
      { id: "a2", text: "", points: 30, rank: 2 },
      { id: "a3", text: "", points: 20, rank: 3 },
      { id: "a4", text: "", points: 10, rank: 4 },
    ],
    status: "active",
    createdAt: Date.now(),
  };
}

function QuestionModal({ question, busy, onClose, onSave }: {
  question: FeudQuestion;
  busy: boolean;
  onClose: () => void;
  onSave: (q: FeudQuestion) => void;
}) {
  const [draft, setDraft] = useState<FeudQuestion>(() => JSON.parse(JSON.stringify(question)));
  const [error, setError] = useState("");

  const editAnswer = (i: number, patch: Partial<FeudAnswer>) => {
    setDraft((prev) => ({
      ...prev,
      answers: prev.answers.map((a, idx) => (idx === i ? { ...a, ...patch } : a)),
    }));
  };

  const submit = () => {
    if (!draft.prompt.trim()) return setError("Question prompt is required.");
    const validAnswers = draft.answers.filter((a) => a.text.trim());
    if (validAnswers.length === 0) return setError("Add at least one answer.");
    onSave({
      ...draft,
      prompt: draft.prompt.trim(),
      category: draft.category.trim() || "General",
      answers: validAnswers.map((a, i) => ({ ...a, points: Number(a.points) || 0, rank: i + 1 })),
    });
  };

  return (
    <Modal open onClose={onClose} title={draft.id ? "Edit question" : "New question"} wide>
      <div className="space-y-4">
        <Field label="Question prompt" error={error || undefined}>
          <Textarea
            rows={2}
            placeholder="Name something people do immediately after waking up."
            value={draft.prompt}
            onChange={(e) => { setDraft((p) => ({ ...p, prompt: e.target.value })); setError(""); }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Category">
            <Input value={draft.category} onChange={(e) => setDraft((p) => ({ ...p, category: e.target.value }))} />
          </Field>
          <Field label="Difficulty">
            <Select value={draft.difficulty} onChange={(e) => setDraft((p) => ({ ...p, difficulty: e.target.value as FeudQuestion["difficulty"] }))}>
              {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={draft.status} onChange={(e) => setDraft((p) => ({ ...p, status: e.target.value as FeudQuestion["status"] }))}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>
        <Field label="Explanation (optional)" hint="shown after the round, e.g. survey source">
          <Input value={draft.explanation || ""} onChange={(e) => setDraft((p) => ({ ...p, explanation: e.target.value }))} />
        </Field>


        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-medium text-slate-700">Board answers</p>
            <Button
              size="sm" variant="outline"
              onClick={() => setDraft((p) => ({
                ...p,
                answers: [...p.answers, { id: `a${p.answers.length + 1}`, text: "", points: 5, rank: p.answers.length + 1 }],
              }))}
            >
              <Plus className="h-3.5 w-3.5" /> Add answer
            </Button>
          </div>
          <div className="space-y-2">
            {draft.answers.map((a, i) => (
              <div key={i} className="grid grid-cols-[1fr_90px_80px_auto] items-center gap-2">
                <Input
                  placeholder={`Answer ${i + 1}`}
                  value={a.text}
                  onChange={(e) => editAnswer(i, { text: e.target.value })}
                />
                <Input
                  type="number" min={0} title="Points"
                  value={a.points}
                  onChange={(e) => editAnswer(i, { points: Number(e.target.value) || 0 })}
                />
                <Input
                  type="number" min={1} title="Rank"
                  value={a.rank}
                  onChange={(e) => editAnswer(i, { rank: Number(e.target.value) || 1 })}
                />
                <Button
                  size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                  disabled={draft.answers.length <= 2}
                  onClick={() => setDraft((p) => ({ ...p, answers: p.answers.filter((_, idx) => idx !== i) }))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Points come from the survey result — rank 1 answers are worth the most. Order is saved by rank.
          </p>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={submit}>
            <Save className="h-4 w-4" /> Save question
          </Button>
        </div>
      </div>
    </Modal>
  );
}

