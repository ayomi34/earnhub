import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Briefcase, CheckCircle2, ClipboardList, Clock,
  Coins, CreditCard, Gamepad2, Hourglass, Layers, Lock, MailWarning, Play, Receipt,
  Send, Share2, TrendingUp, Users, Wallet, Trophy, Disc3, MessageSquare,
  History, UserPlus, Search, Medal, Crown, X, Zap,
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
import { read as readDB, DEFAULT_GOLD_MINE_CONFIG } from "../lib/db";
import type { TaskView } from "../lib/services";
import { navigate, useAction, useData, useDBVersion, useSettings, useUser } from "../lib/store";
import {
  hydrateGoldMine, completeMatureCycles, getGoldBalance,
} from "../lib/services";

/* ================= ZENTRA DASHBOARD CARD ================= */

function ZentraMiniCore({ active }: { active: boolean }) {
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center select-none">
      <div
        className="absolute h-16 w-16 rounded-full border border-cyan-400/40"
        style={{ animation: active ? "zdash-spin 6s linear infinite" : "none", opacity: active ? 1 : 0.25 }}
      >
        <div className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-400" />
      </div>
      <div
        className="absolute h-10 w-10 rounded-full border border-violet-400/40"
        style={{ animation: active ? "zdash-spin-rev 4s linear infinite" : "none", opacity: active ? 1 : 0.25 }}
      >
        <div className="absolute -top-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-violet-400" />
      </div>
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${
          active ? "bg-gradient-to-br from-cyan-400 to-violet-500 shadow-[0_0_12px_rgba(139,92,246,0.5)]" : "bg-slate-700"
        }`}
        style={{ animation: active ? "zdash-pulse 2s ease-in-out infinite" : "none" }}
      >
        <Zap className={`h-4 w-4 ${active ? "text-white" : "text-slate-500"}`} />
      </div>
    </div>
  );
}

function ZentraDashCard() {
  const user = useUser();
  const db = useData(readDB);

  const cfg = db.settings.goldMine ?? DEFAULT_GOLD_MINE_CONFIG;
  const cycles = useMemo(
    () => (db.goldMineCycles ?? []).filter((c) => c.userId === user?.id),
    [db.goldMineCycles, user?.id]
  );
  const activeCycles = cycles.filter((c) => c.status === "active");
  const goldBalance = user ? getGoldBalance(user.id) : 0;

  const activeMembership = db.memberships.find(
    (m) => m.userId === user?.id && m.status === "active"
  );
  const levelCfg = activeMembership
    ? cfg.levelConfigs?.find((lc) => lc.levelId === activeMembership.levelId)
    : null;

  // live countdown ticker
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    tickRef.current = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // hydrate on mount
  useEffect(() => {
    if (!user) return;
    void hydrateGoldMine(user.id).then(() => completeMatureCycles(user.id));
  }, [user?.id]);

  if (!cfg.enabled) return null;

  const activeC = activeCycles[0];
  let progressPct = 0;
  let timeLabel = "";
  if (activeC) {
    const total = activeC.endsAt - activeC.startedAt;
    const elapsed = Date.now() - activeC.startedAt;
    progressPct = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    const diff = activeC.endsAt - Date.now();
    if (diff > 0) {
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1_000);
      timeLabel = d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`;
    } else {
      timeLabel = "Completing...";
    }
  }

  return (
    <>
      <style>{`
        @keyframes zdash-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes zdash-spin-rev { from { transform: rotate(0deg); } to { transform: rotate(-360deg); } }
        @keyframes zdash-pulse { 0%,100% { box-shadow: 0 0 10px rgba(139,92,246,0.4); } 50% { box-shadow: 0 0 20px rgba(139,92,246,0.75); } }
      `}</style>
      <div
        onClick={() => navigate("/app/goldmine")}
        className="cursor-pointer overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-4 transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <ZentraMiniCore active={activeCycles.length > 0} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-bold text-white">Zentra</p>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${activeCycles.length > 0 ? "bg-cyan-500/20 text-cyan-400" : "bg-slate-700 text-slate-400"}`}>
                {activeCycles.length > 0 ? "RUNNING" : "IDLE"}
              </span>
            </div>
            {activeC ? (
              <>
                <p className="mt-0.5 text-xs text-slate-400">{timeLabel} remaining</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-violet-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[10px] text-slate-500">{progressPct}% complete</p>
                  <p className="flex items-center gap-0.5 text-[10px] font-semibold text-violet-400">
                    <Coins className="h-3 w-3" /> {activeC.goldReward} ZNTR
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-xs text-slate-400">
                  {goldBalance > 0 ? `${goldBalance} ZNTR ready to convert` : levelCfg ? "Ready to activate" : "Membership needed"}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-500">
                  {levelCfg
                    ? `${levelCfg.cycleDays}-day cycle · ${levelCfg.goldReward} ZNTR reward`
                    : "Upgrade membership to unlock"}
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================= DASHBOARD ================= */

export function Dashboard() {
  const user = useUser()!;
  const s    = useSettings();
  const bal  = useData(() => getBalances(user.id));
  const level = useData(() => getUserLevel(user.id));

  const firstName = user.fullName.split(" ")[0];

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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0f1c2e] to-[#1a0f3e] px-5 py-6 text-white">
        <div className="pointer-events-none absolute right-2 top-2 select-none opacity-10">
          <Zap className="h-20 w-20 text-white" />
        </div>
        <div className="pointer-events-none absolute -right-4 bottom-0 select-none opacity-10">
          <Coins className="h-24 w-24 text-white" />
        </div>

        <p className="text-sm text-cyan-300">Welcome back,</p>
        <h1 className="mt-0.5 text-[20px] font-black leading-tight">
          {firstName}
        </h1>
        <p className="mt-1 text-sm text-violet-200">Activate Zentra cycles and earn ZNTR rewards!</p>

        {/* Points pill */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#f0c040] px-4 py-2">
          <Coins className="h-4 w-4 text-[#7a4f00]" />
          <span className="text-sm font-black text-[#7a4f00]">{fmtN(bal.available)}</span>
        </div>
      </div>

      {/* ── Zentra widget ── */}
      <ZentraDashCard />

      {/* ── Zentra feature highlight ── */}
      <div
        onClick={() => navigate("/app/goldmine")}
        className="cursor-pointer overflow-hidden rounded-2xl border border-cyan-900/40 bg-gradient-to-br from-slate-900 to-[#0d1a2e] p-5 transition-all active:scale-[0.98]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cyan-500/20">
                <Zap className="h-4 w-4 text-cyan-400" />
              </span>
              <p className="font-bold text-white">Zentra Mining</p>
            </div>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Activate mining cycles and earn ZNTR. Convert your ZNTR balance to cash at any time.
            </p>
          </div>
          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-cyan-400" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([
            { label: "Activate", Icon: Zap, desc: "Start a cycle" },
            { label: "Earn ZNTR", Icon: Medal, desc: "Cycle rewards" },
            { label: "Convert", Icon: Coins, desc: "ZNTR → Cash" },
          ] as const).map((f) => (
            <div key={f.label} className="rounded-xl bg-slate-800/60 px-3 py-3 text-center">
              <f.Icon className="mx-auto h-5 w-5 text-cyan-400" />
              <p className="mt-1 text-[11px] font-bold text-white">{f.label}</p>
              <p className="text-[9px] text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── No membership nudge ── */}
      {!level && (
        <div className="overflow-hidden rounded-2xl bg-green-600 p-5 text-white">
          <p className="font-bold">Activate a membership</p>
          <p className="mt-1 text-sm text-green-100">
            Unlock Zentra mining cycles and start earning ZNTR rewards.
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

/* ================= GAMES PAGE ================= */

// Game thumbnail component — renders a photo where available, SVG fallback otherwise
function GameThumb({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
}

function TriviaThumb() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" fill="#1a2e6b" />
      <circle cx="40" cy="38" r="24" fill="#f1c40f" />
      <ellipse cx="40" cy="58" rx="10" ry="4" fill="#e6a800" />
      <rect x="36" y="56" width="8" height="10" rx="2" fill="#e6a800" />
      <text x="40" y="44" textAnchor="middle" fill="#1a2e6b" fontSize="22" fontWeight="bold" fontFamily="sans-serif">?</text>
    </svg>
  );
}

const GAME_LIST = [
  {
    to: "/app/feud",
    label: "Family Feud",
    desc: "Guess the most popular answers!",
    tags: [{ text: "Popular", color: "text-rose-600 bg-rose-50 border border-rose-200" }, { text: "Multiplayer", color: "text-slate-600 bg-slate-100" }],
    thumb: <GameThumb src="/images/game-familyfeud.jpg" alt="Family Feud" />,
  },
  {
    to: "/app/spin",
    label: "Spin Wheel",
    desc: "Spin & win exciting rewards!",
    tags: [{ text: "Luck", color: "text-purple-600 bg-purple-50 border border-purple-200" }, { text: "Instant Win", color: "text-slate-600 bg-slate-100" }],
    thumb: <GameThumb src="/images/game-spinwheel.jpg" alt="Spin Wheel" />,
  },
  {
    to: "/app/earn",
    label: "Trivia Quiz",
    desc: "Test your knowledge!",
    tags: [{ text: "Single Player", color: "text-blue-600 bg-blue-50 border border-blue-200" }, { text: "Daily", color: "text-slate-600 bg-slate-100" }],
    thumb: <TriviaThumb />,
  },
  {
    to: "/app/goldmine",
    label: "Zentra",
    desc: "Activate cycles, earn gold!",
    tags: [{ text: "Strategy", color: "text-green-600 bg-green-50 border border-green-200" }, { text: "Earn", color: "text-slate-600 bg-slate-100" }],
    thumb: <GameThumb src="/images/game-goldmine.png" alt="Zentra" className="object-top" />,
  },
  {
    to: "/app/feud",
    label: "Family Challenge",
    desc: "Team up and win big!",
    tags: [{ text: "Multiplayer", color: "text-rose-600 bg-rose-50 border border-rose-200" }, { text: "Rewards", color: "text-purple-600 bg-purple-50 border border-purple-200" }],
    thumb: <GameThumb src="/images/game-familyfeud.jpg" alt="Family Challenge" />,
  },
];

const GAME_CATS = ["All", "Family Feud", "Spin & Win", "Quiz", "Earn"];

export function GamesPage() {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");

  const filtered = GAME_LIST.filter((g) => {
    const matchSearch = g.label.toLowerCase().includes(search.toLowerCase()) || g.desc.toLowerCase().includes(search.toLowerCase());
    const matchCat = cat === "All"
      || (cat === "Family Feud" && g.label.toLowerCase().includes("feud"))
      || (cat === "Spin & Win" && g.label.toLowerCase().includes("spin"))
      || (cat === "Quiz" && g.label.toLowerCase().includes("quiz"))
      || (cat === "Earn" && g.tags.some((t) => t.text === "Earn" || t.text === "Strategy"));
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <button onClick={() => window.history.back()} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200">
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
        </button>
        <h1 className="text-xl font-bold text-slate-900">Games</h1>
      </div>

      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search games..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        )}
      </div>

      {/* category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {GAME_CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              cat === c ? "bg-[#1a4d2e] text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-slate-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* game list */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center">
            <p className="text-sm text-slate-500">No games match your search.</p>
          </div>
        ) : (
          filtered.map((g) => (
            <div
              key={g.label}
              className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm transition-all active:scale-[0.99]"
            >
              {/* thumbnail */}
              <div className="h-[72px] w-[72px] shrink-0 overflow-hidden rounded-xl shadow-sm">
                {g.thumb}
              </div>
              {/* info */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{g.label}</p>
                    <p className="mt-0.5 text-xs text-slate-500">{g.desc}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {g.tags.map((t) => (
                        <span key={t.text} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${t.color}`}>
                          {t.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" className="mt-1 h-4 w-4 shrink-0 text-slate-300" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </div>
              </div>
              {/* play button */}
              <button
                onClick={() => navigate(g.to)}
                className="shrink-0 rounded-full bg-green-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-green-700 active:scale-95"
              >
                Play Now
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ================= LEADERBOARD PAGE ================= */

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

const MEDAL_COLORS = ["text-yellow-500", "text-slate-400", "text-amber-600"];
const RANK_BG = ["bg-yellow-50 border-yellow-200", "bg-slate-50 border-slate-200", "bg-amber-50 border-amber-200"];

export function LeaderboardPage() {
  const [tab, setTab] = useState<"feud" | "overall">("feud");
  const version = useDBVersion();

  const rows = useMemo(() => {
    const state = readDB();
    const profiles = state.profiles;

    if (tab === "feud") {
      // Aggregate feud sessions per user: best score + total games
      const map = new Map<string, { score: number; games: number }>();
      for (const s of state.feudSessions) {
        if (!s.completed) continue;
        const prev = map.get(s.userId) ?? { score: 0, games: 0 };
        map.set(s.userId, { score: Math.max(prev.score, s.score), games: prev.games + 1 });
      }
      return Array.from(map.entries())
        .map(([userId, stats]) => {
          const p = profiles.find((pr) => pr.id === userId);
          return p ? { id: userId, name: p.fullName, score: stats.score, games: stats.games, metric: `${stats.score} pts` } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b!.score - a!.score)
        .slice(0, 50) as { id: string; name: string; score: number; games: number; metric: string }[];
    } else {
      // Overall: sum of approved wallet credits per user
      const map = new Map<string, number>();
      for (const tx of state.walletTx) {
        if (tx.direction !== "credit" || tx.status !== "approved") continue;
        map.set(tx.userId, (map.get(tx.userId) ?? 0) + tx.amount);
      }
      return Array.from(map.entries())
        .map(([userId, total]) => {
          const p = profiles.find((pr) => pr.id === userId);
          return p ? { id: userId, name: p.fullName, score: total, games: 0, metric: `₦${total.toLocaleString()}` } : null;
        })
        .filter(Boolean)
        .sort((a, b) => b!.score - a!.score)
        .slice(0, 50) as { id: string; name: string; score: number; games: number; metric: string }[];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, version]);

  return (
    <div className="space-y-4">
      {/* header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-yellow-50">
          <Trophy className="h-5 w-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">Leaderboard</h1>
          <p className="text-xs text-slate-500">Top players this season</p>
        </div>
      </div>

      {/* tab switcher */}
      <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-1">
        {(["feud", "overall"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
              tab === t ? "bg-white shadow text-slate-900" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              {t === "feud" ? <Gamepad2 className="h-3.5 w-3.5" /> : <Trophy className="h-3.5 w-3.5" />}
              {t === "feud" ? "Family Feud" : "Overall Earnings"}
            </span>
          </button>
        ))}
      </div>

      {/* top 3 podium */}
      {rows.length >= 3 && (
        <div className="flex items-end justify-center gap-3 pt-2 pb-4">
          {/* 2nd place */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-black text-slate-600 shadow">
              {initials(rows[1].name)}
            </div>
            <p className="max-w-[64px] truncate text-center text-[11px] font-semibold text-slate-700">{rows[1].name.split(" ")[0]}</p>
            <div className="flex h-14 w-16 flex-col items-center justify-center rounded-t-xl bg-slate-100 border border-slate-200">
              <Medal className="h-4 w-4 text-slate-400" />
              <p className="text-[10px] font-bold text-slate-500">{rows[1].metric}</p>
            </div>
          </div>
          {/* 1st place */}
          <div className="flex flex-col items-center gap-1.5">
            <Crown className="h-5 w-5 text-yellow-500" />
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-yellow-100 text-base font-black text-yellow-700 shadow-md ring-2 ring-yellow-400">
              {initials(rows[0].name)}
            </div>
            <p className="max-w-[72px] truncate text-center text-[11px] font-semibold text-slate-700">{rows[0].name.split(" ")[0]}</p>
            <div className="flex h-20 w-16 flex-col items-center justify-center rounded-t-xl bg-yellow-50 border border-yellow-200">
              <Crown className="h-4 w-4 text-yellow-500" />
              <p className="text-[10px] font-bold text-yellow-600">{rows[0].metric}</p>
            </div>
          </div>
          {/* 3rd place */}
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-sm font-black text-amber-700 shadow">
              {initials(rows[2].name)}
            </div>
            <p className="max-w-[64px] truncate text-center text-[11px] font-semibold text-slate-700">{rows[2].name.split(" ")[0]}</p>
            <div className="flex h-10 w-16 flex-col items-center justify-center rounded-t-xl bg-amber-50 border border-amber-200">
              <Medal className="h-4 w-4 text-amber-600" />
              <p className="text-[10px] font-bold text-amber-600">{rows[2].metric}</p>
            </div>
          </div>
        </div>
      )}

      {/* ranked list */}
      {rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-10 text-center">
          <Trophy className="mx-auto mb-3 h-8 w-8 text-slate-300" />
          <p className="font-semibold text-slate-600">No rankings yet</p>
          <p className="mt-1 text-sm text-slate-400">
            {tab === "feud" ? "Complete a Family Feud game to appear on the board." : "Earn rewards to appear here."}
          </p>
          <button
            onClick={() => navigate(tab === "feud" ? "/app/feud" : "/app/earn")}
            className="mt-4 rounded-full bg-green-600 px-5 py-2 text-sm font-bold text-white hover:bg-green-700"
          >
            {tab === "feud" ? "Play Family Feud" : "Start Earning"}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${i < 3 ? RANK_BG[i] : "border-slate-100 bg-white"}`}
            >
              {/* rank */}
              <div className="w-7 text-center">
                {i < 3 ? (
                  <Medal className={`mx-auto h-5 w-5 ${MEDAL_COLORS[i]}`} />
                ) : (
                  <span className="text-sm font-bold text-slate-400">#{i + 1}</span>
                )}
              </div>
              {/* avatar */}
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                i === 0 ? "bg-yellow-100 text-yellow-700" :
                i === 1 ? "bg-slate-200 text-slate-600" :
                i === 2 ? "bg-amber-100 text-amber-700" :
                "bg-green-100 text-green-700"
              }`}>
                {initials(r.name)}
              </div>
              {/* name */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{r.name}</p>
                {r.games > 0 && <p className="text-[11px] text-slate-400">{r.games} game{r.games !== 1 ? "s" : ""}</p>}
              </div>
              {/* score */}
              <p className={`text-sm font-bold ${i === 0 ? "text-yellow-600" : i === 1 ? "text-slate-500" : i === 2 ? "text-amber-600" : "text-green-600"}`}>
                {r.metric}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
