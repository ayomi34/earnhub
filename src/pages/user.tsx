import { useState } from "react";
import {
  AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ClipboardList, Clock,
  Coins, CreditCard, Hourglass, Layers, Lock, MailWarning, Play, Receipt,
  Send, Share2, TrendingUp, Users, Wallet, Trophy, Disc3, MessageSquare,
  History, UserPlus,
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
import { navigate, useAction, useData, useSettings, useUser } from "../lib/store";

/* ================= DASHBOARD ================= */

export function Dashboard() {
  const user = useUser()!;
  const s    = useSettings();
  const bal  = useData(() => getBalances(user.id));
  const level = useData(() => getUserLevel(user.id));

  const firstName = user.fullName.split(" ")[0];

  const games = [
    {
      to: "/app/feud",
      label: "Family Feud",
      desc: "Guess the most popular answers!",
      bg: "bg-[#1a3a6b]",
      thumb: (
        <div className="flex h-full items-center justify-center">
          <div className="relative flex h-16 w-28 items-center justify-center rounded-xl border-4 border-yellow-400 bg-[#c0392b] shadow-lg">
            <span className="text-center text-sm font-black uppercase leading-tight text-yellow-300 drop-shadow">
              Family<br />Feud
            </span>
          </div>
        </div>
      ),
    },
    {
      to: "/app/spin",
      label: "Spin Wheel",
      desc: "Spin & win rewards!",
      bg: "bg-[#1a4d2e]",
      thumb: (
        <div className="flex h-full items-center justify-center">
          <div className="relative h-16 w-16">
            {["#e74c3c","#f39c12","#2ecc71","#3498db","#9b59b6","#1abc9c"].map((c, i) => (
              <div
                key={i}
                className="absolute inset-0 rounded-full border-4 border-white/20"
                style={{
                  background: `conic-gradient(${c} ${i * 60}deg ${(i + 1) * 60}deg, transparent ${(i + 1) * 60}deg)`,
                }}
              />
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-4 w-4 rounded-full bg-white shadow" />
            </div>
          </div>
        </div>
      ),
    },
    {
      to: "/app/earn",
      label: "Trivia Quiz",
      desc: "Test your knowledge!",
      bg: "bg-[#1a3a6b]",
      thumb: (
        <div className="flex h-full items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-400 shadow-lg">
            <span className="text-3xl">💡</span>
          </div>
        </div>
      ),
    },
    {
      to: "/app/earn",
      label: "Gold Mine",
      desc: "Dig and earn coins!",
      bg: "bg-[#1a4d2e]",
      thumb: (
        <div className="flex h-full items-center justify-center">
          <span className="text-5xl drop-shadow-lg">🪙</span>
        </div>
      ),
    },
  ];

  const quickActions = [
    { to: "/app/spin",      icon: <Disc3 className="h-5 w-5 text-amber-600" />,   bg: "bg-amber-100",  label: "Daily Spin",    desc: "Free spins" },
    { to: "/app/tasks",     icon: <History className="h-5 w-5 text-green-600" />,  bg: "bg-green-100",  label: "Your History",  desc: "View past games" },
    { to: "/app/referrals", icon: <UserPlus className="h-5 w-5 text-rose-500" />,  bg: "bg-rose-100",   label: "Invite Friends", desc: "Get bonus points" },
  ];

  return (
    <div className="space-y-5">

      {/* ── Email / membership alerts ── */}
      {!user.emailVerified && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2.5">
            <MailWarning className="h-4 w-4 text-amber-500" />
            <p className="text-sm text-amber-800">Verify your email to unlock tasks and withdrawals.</p>
          </div>
          <Button size="sm" variant="accent" onClick={() => navigate("/verify")}>Verify now</Button>
        </div>
      )}

      {/* ── Hero banner ── */}
      <div className="relative overflow-hidden rounded-2xl bg-[#1a4d2e] px-5 py-6 text-white">
        {/* background leaf decoration */}
        <div className="pointer-events-none absolute right-4 top-2 select-none text-[80px] opacity-20">🍃</div>
        <div className="pointer-events-none absolute -right-4 bottom-0 select-none text-[100px] opacity-10">🏆</div>

        <p className="text-sm text-green-200">Welcome back,</p>
        <h1 className="mt-0.5 text-2xl font-black leading-tight">
          {firstName} 👋
        </h1>
        <p className="mt-1 text-sm text-green-200">Play your favourite games and win amazing rewards!</p>

        {/* Points pill */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f0c040] px-4 py-2">
          <span className="text-base">🪙</span>
          <span className="text-sm font-black text-[#7a4f00]">{fmtN(bal.available)}</span>
        </div>
      </div>

      {/* ── Featured Games ── */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <p className="text-base font-bold text-slate-900">Featured Games</p>
          <button onClick={() => navigate("/app/earn")} className="text-sm font-semibold text-green-600 hover:underline">
            View all →
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {games.map((g) => (
            <div
              key={g.label}
              onClick={() => navigate(g.to)}
              className="cursor-pointer overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm transition-all active:scale-[0.97]"
            >
              {/* thumbnail */}
              <div className={`${g.bg} h-28`}>{g.thumb}</div>
              {/* info */}
              <div className="px-3 pt-2.5 pb-3">
                <p className="text-sm font-bold text-slate-900">{g.label}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{g.desc}</p>
                <button className="mt-2.5 w-full rounded-full bg-green-600 py-1.5 text-xs font-bold text-white transition-colors hover:bg-green-700">
                  Play Now
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick Actions ── */}
      <div>
        <p className="mb-3 text-base font-bold text-slate-900">Quick Actions</p>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map((a) => (
            <div
              key={a.label}
              onClick={() => navigate(a.to)}
              className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-slate-100 bg-white px-2 py-4 text-center shadow-sm transition-all active:scale-[0.97]"
            >
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${a.bg}`}>
                {a.icon}
              </span>
              <div>
                <p className="text-xs font-bold text-slate-800 leading-tight">{a.label}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{a.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── No membership nudge ── */}
      {!level && (
        <div className="overflow-hidden rounded-2xl bg-green-600 p-5 text-white">
          <p className="font-bold">Activate a membership</p>
          <p className="mt-1 text-sm text-green-100">
            Unlock the task catalogue and start earning real rewards.
          </p>
          <button
            onClick={() => navigate("/app/membership")}
            className="mt-3 flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-xs font-bold text-green-700"
          >
            View levels <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
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
