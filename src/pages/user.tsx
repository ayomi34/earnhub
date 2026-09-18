import { useState } from "react";
import {
  AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ClipboardList, Clock,
  Coins, CreditCard, Hourglass, Layers, Lock, MailWarning, Play, Receipt,
  Send, Share2, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Link } from "../components/nav";
import {
  Badge, Button, Card, CardHeader, EmptyState, Modal, PageHead, Stat, StatusBadge,
  Td, Table, Textarea, fmtDate, fmtN,
} from "../components/ui";
import {
  getBalances, getLevel, getMySubmissions, getTaskViews, getUserLevel,
  getWalletTx, startTask, submitTaskProof, todaySubmissionCount,
} from "../lib/services";
import type { TaskView } from "../lib/services";
import { navigate, useAction, useData, useUser } from "../lib/store";

/* ================= DASHBOARD ================= */

export function Dashboard() {
  const user = useUser()!;
  const bal = useData(() => getBalances(user.id));
  const level = useData(() => getUserLevel(user.id));
  const recentTx = useData(() => getWalletTx(user.id).slice(0, 5));
  const today = useData(() => todaySubmissionCount(user.id));

  return (
    <div>
      <PageHead
        title={`Hello, ${user.fullName.split(" ")[0]}`}
        sub={level ? `${level.name} member · ${today}/${level.taskLimitPerDay} tasks used today` : "Get your account ready to start earning"}
      />

      {!user.emailVerified && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-3">
            <MailWarning className="h-5 w-5 text-amber-500" />
            <p className="text-sm text-amber-800">Verify your email to unlock tasks and withdrawals.</p>
          </div>
          <Button size="sm" variant="accent" onClick={() => navigate("/verify")}>Verify now</Button>
        </Card>
      )}

      {!level && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex flex-col items-start justify-between gap-4 bg-brand p-5 sm:flex-row sm:items-center">
            <div>
              <p className="font-semibold text-white">Activate a membership to start earning</p>
              <p className="mt-0.5 text-sm text-green-100">
                Membership unlocks the task catalogue. Levels start from ₦6,500 — tasks are reviewed by humans before rewards land in your wallet.
              </p>
            </div>
            <Button variant="outline" className="border-white/40 bg-white/10 text-white hover:bg-white hover:text-brand" onClick={() => navigate("/app/membership")}>
              View levels <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Available balance" value={fmtN(bal.available)} tone="brand" icon={<Wallet className="h-4.5 w-4.5" />} sub="ready to withdraw" />
        <Stat label="Total earnings" value={fmtN(bal.totalEarned)} icon={<TrendingUp className="h-4.5 w-4.5" />} />
        <Stat label="Today's earnings" value={fmtN(bal.todayEarned)} icon={<Coins className="h-4.5 w-4.5" />} />
        <Stat label="Pending review" value={fmtN(bal.pending)} icon={<Hourglass className="h-4.5 w-4.5" />} sub="submissions under review" />
        <Stat label="Total withdrawn" value={fmtN(bal.totalWithdrawn)} icon={<ArrowRight className="h-4.5 w-4.5" />} />
        <Stat label="Membership" value={level ? level.name : "None"} icon={<Layers className="h-4.5 w-4.5" />} sub={level ? `${level.taskLimitPerDay} tasks/day` : "not activated"} />
        <Stat label="Tasks completed" value={String(bal.tasksCompleted)} icon={<CheckCircle2 className="h-4.5 w-4.5" />} />
        <Stat label="Referral earnings" value={fmtN(bal.referralEarnings)} icon={<Users className="h-4.5 w-4.5" />} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader
            title="Recent activity"
            action={<Link to="/app/transactions" className="text-xs font-semibold text-brand hover:underline">View all</Link>}
          />
          {recentTx.length === 0 ? (
            <EmptyState
              icon={<Receipt className="h-5 w-5" />}
              title="No activity yet"
              sub={level ? "Complete your first task and its approved reward will appear here." : "Activate a membership, then complete tasks to see ledger entries here."}
              action={<Button size="sm" onClick={() => navigate(level ? "/app/earn" : "/app/membership")}>{level ? "Browse tasks" : "Choose membership"}</Button>}
            />
          ) : (
            <Table head={["Description", "Type", "Amount", "Date"]}>
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <Td className="max-w-[220px] truncate font-medium">{t.description}</Td>
                  <Td><Badge tone={t.direction === "credit" ? "green" : "slate"}>{t.type.replace("_", " ")}</Badge></Td>
                  <Td className={`font-semibold ${t.direction === "credit" ? "text-brand" : "text-slate-700"}`}>
                    {t.direction === "credit" ? "+" : "−"}{fmtN(t.amount)}
                  </Td>
                  <Td className="text-xs text-slate-400">{fmtDate(t.createdAt)}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Quick actions" />
          <div className="grid gap-2.5 p-4">
            {[
              { to: "/app/earn", icon: Briefcase, label: "Find tasks to earn", desc: "Browse today's catalogue" },
              { to: "/app/wallet", icon: Wallet, label: "Withdraw to bank", desc: "From the minimum threshold" },
              { to: "/app/referrals", icon: Share2, label: "Invite & earn commission", desc: "On your referrals' approved work" },
              { to: "/app/membership", icon: CreditCard, label: "Upgrade membership", desc: "Unlock higher-value tasks" },
            ].map((a) => (
              <Link key={a.to} to={a.to} className="flex items-center gap-3.5 rounded-lg border border-slate-200 p-3.5 transition-colors hover:border-brand hover:bg-brand-50/40">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand"><a.icon className="h-4.5 w-4.5" /></span>
                <span className="flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{a.label}</span>
                  <span className="block text-xs text-slate-400">{a.desc}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================= EARN ================= */

function TaskCard({ view, userId }: { view: TaskView; userId: string }) {
  const { busy, run } = useAction();
  const [showStart, setShowStart] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [proof, setProof] = useState("");
  const sub = view.mySubmission;
  const full = view.slotsUsed >= view.maxSubmissions;

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge tone="slate">{view.category}</Badge>
        {sub ? <StatusBadge status={sub.status} /> : full ? <Badge tone="red">Full</Badge> : <StatusBadge status="available" />}
      </div>
      <h3 className="mt-3 font-semibold leading-snug text-slate-900">{view.title}</h3>
      <p className="mt-1.5 line-clamp-2 flex-1 text-[13px] leading-relaxed text-slate-500">{view.description}</p>
      <div className="mt-4 flex items-center gap-4 text-xs text-slate-400">
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> ~{view.estMinutes} min</span>
        <span>{view.slotsUsed}/{view.maxSubmissions} slots</span>
        <span className="ml-auto text-base font-bold text-brand">{fmtN(view.reward)}</span>
      </div>

      <div className="mt-4">
        {view.membershipRequired ? (
          <Button variant="outline" className="w-full" onClick={() => navigate("/app/membership")}>
            <Lock className="h-4 w-4" /> Membership required
          </Button>
        ) : view.levelLocked ? (
          <Button variant="outline" className="w-full" disabled>
            <Lock className="h-4 w-4" /> Requires higher level
          </Button>
        ) : !sub ? (
          <Button className="w-full" disabled={full || !view.isOpen} onClick={() => setShowStart(true)}>
            <Play className="h-4 w-4" /> {full ? "No slots left" : "Start Task"}
          </Button>
        ) : sub.status === "in_progress" ? (
          <Button className="w-full" onClick={() => setShowSubmit(true)}>
            <Send className="h-4 w-4" /> Submit work
          </Button>
        ) : (
          <Button variant="outline" className="w-full" disabled>
            {sub.status === "submitted" ? "Awaiting review" : sub.status === "approved" ? "Reward credited" : "Rejected"}
          </Button>
        )}
      </div>

      {/* start modal */}
      <Modal open={showStart} onClose={() => setShowStart(false)} title={view.title} wide>
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="slate">{view.category}</Badge>
            <Badge tone="green">Reward {fmtN(view.reward)}</Badge>
            <Badge tone="amber">~{view.estMinutes} min</Badge>
          </div>
          <p className="text-sm leading-relaxed text-slate-600">{view.description}</p>
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Instructions</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{view.instructions}</p>
          </div>
          <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs leading-relaxed text-amber-800">
              Rewards are credited only after manual review of your proof. Fabricated or
              low-quality work is rejected and repeated abuse leads to suspension.
            </p>
          </div>
          <Button loading={busy} className="w-full" onClick={async () => {
            const started = await run(() => startTask(userId, view.id));
            if (started) {
              setShowStart(false);
              setShowSubmit(true);
            }
          }}>
            Start this task
          </Button>
        </div>
      </Modal>

      {/* submit modal */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title={`Submit — ${view.title}`} wide>
        <div className="space-y-4">
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Instructions recap</p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{view.instructions}</p>
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700">
              Proof of work <span className="text-slate-400">(link, completion code, or description)</span>
            </label>
            <Textarea value={proof} onChange={(e) => setProof(e.target.value)} placeholder="e.g. Worksheet link: https://docs.google.com/… — all 20 rows verified" />
          </div>
          <Button
            loading={busy}
            className="w-full"
            disabled={proof.trim().length < 12}
            onClick={async () => {
              const ok = await run(
                () => submitTaskProof(userId, view.id, proof),
                "Submitted for review — you’ll be notified of the outcome."
              );
              if (ok !== null) {
                setShowSubmit(false);
                setProof("");
              }
            }}
          >
            <Send className="h-4 w-4" /> Submit for review
          </Button>
        </div>
      </Modal>
    </Card>
  );
}

export function Earn() {
  const user = useUser()!;
  const views = useData(() => getTaskViews(user.id));
  const level = useData(() => getUserLevel(user.id));
  const today = useData(() => todaySubmissionCount(user.id));
  const [cat, setCat] = useState("All");
  const cats = ["All", ...Array.from(new Set(views.map((v) => v.category)))];
  const filtered = cat === "All" ? views : views.filter((v) => v.category === cat);

  return (
    <div>
      <PageHead
        title="Earn"
        sub={
          level
            ? `${level.name} catalogue · ${today}/${level.taskLimitPerDay} tasks started today`
            : "Activate a membership to unlock task submissions"
        }
      />
      <div className="mb-5 flex flex-wrap gap-2">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              cat === c ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={<Briefcase className="h-5 w-5" />} title="No tasks in this category right now" sub="New tasks are added regularly — check back soon." />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v) => <TaskCard key={v.id} view={v} userId={user.id} />)}
        </div>
      )}
    </div>
  );
}

/* ================= MY TASKS ================= */

export function MyTasks() {
  const user = useUser()!;
  const rows = useData(() => getMySubmissions(user.id));

  return (
    <div>
      <PageHead title="My Tasks" sub="Everything you've started, submitted and earned from" />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-5 w-5" />}
            title="No tasks yet"
            sub="Start a task from the Earn page and it will appear here with its live review status."
            action={<Button size="sm" onClick={() => navigate("/app/earn")}>Browse tasks</Button>}
          />
        ) : (
          <Table head={["Task", "Reward", "Status", "Started", "Review note"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="max-w-[220px]">
                  <span className="block truncate font-medium">{r.task?.title || "Deleted task"}</span>
                  <span className="text-xs text-slate-400">{r.task?.category}</span>
                </Td>
                <Td className="font-semibold text-slate-900">{r.task ? fmtN(r.task.reward) : "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="text-xs text-slate-400">{fmtDate(r.startedAt)}</Td>
                <Td className="max-w-[200px] text-xs text-slate-500">{r.reviewNote || "—"}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

export { getLevel as _levelRef };
