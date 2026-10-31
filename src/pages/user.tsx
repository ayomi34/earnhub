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
        className="absolute h-16 w-16 rounded-full border border-green-400/50"
        style={{ animation: active ? "zdash-spin 6s linear infinite" : "none", opacity: active ? 1 : 0.25 }}
      >
        <div className="absolute -top-1 left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-green-400" />
      </div>
      <div
        className="absolute h-10 w-10 rounded-full border border-emerald-400/50"
        style={{ animation: active ? "zdash-spin-rev 4s linear infinite" : "none", opacity: active ? 1 : 0.25 }}
      >
        <div className="absolute -top-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-emerald-400" />
      </div>
      <div
        className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${
          active ? "bg-gradient-to-br from-green-500 to-emerald-600 shadow-[0_0_12px_rgba(34,197,94,0.45)]" : "bg-slate-200"
        }`}
        style={{ animation: active ? "zdash-pulse 2s ease-in-out infinite" : "none" }}
      >
        <Zap className={`h-4 w-4 ${active ? "text-white" : "text-slate-400"}`} />
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
        @keyframes zdash-pulse { 0%,100% { box-shadow: 0 0 10px rgba(34,197,94,0.35); } 50% { box-shadow: 0 0 20px rgba(34,197,94,0.65); } }
      `}</style>
      <div
        onClick={() => navigate("/app/goldmine")}
        className="cursor-pointer overflow-hidden rounded-2xl border border-green-200 bg-white p-4 shadow-sm transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <ZentraMiniCore active={activeCycles.length > 0} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-bold text-slate-900">Zentra</p>
              <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${activeCycles.length > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                {activeCycles.length > 0 ? "RUNNING" : "IDLE"}
              </span>
            </div>
            {activeC ? (
              <>
                <p className="mt-0.5 text-xs text-slate-500">{timeLabel} remaining</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-green-400 to-emerald-500 transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <p className="text-[10px] text-slate-400">{progressPct}% complete</p>
                  <p className="flex items-center gap-0.5 text-[10px] font-semibold text-green-700">
                    <Coins className="h-3 w-3" /> {activeC.goldReward} ZNTR
                  </p>
                </div>
              </>
            ) : (
              <>
                <p className="mt-0.5 text-xs text-slate-500">
                  {goldBalance > 0 ? `${goldBalance} ZNTR ready to convert` : levelCfg ? "Ready to activate" : "Membership needed"}
                </p>
                <p className="mt-1.5 text-[10px] text-slate-400">
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
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a4d2e] to-[#0f3b22] px-5 py-6 text-white">
        <div className="pointer-events-none absolute right-2 top-2 select-none opacity-10">
          <Zap className="h-20 w-20 text-white" />
        </div>
        <div className="pointer-events-none absolute -right-4 bottom-0 select-none opacity-10">
          <Coins className="h-24 w-24 text-white" />
        </div>

        <p className="text-sm text-green-200">Welcome back,</p>
        <h1 className="mt-0.5 text-[20px] font-black leading-tight">
          {firstName}
        </h1>
        <p className="mt-1 text-sm text-green-100/80">Activate Zentra cycles and earn ZNTR rewards!</p>

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
        className="cursor-pointer overflow-hidden rounded-2xl border border-green-200 bg-white p-5 shadow-sm transition-all active:scale-[0.98]"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-100">
                <Zap className="h-4 w-4 text-green-700" />
              </span>
              <p className="font-bold text-slate-900">Zentra Mining</p>
            </div>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Activate mining cycles and earn ZNTR. Convert your ZNTR balance to cash at any time.
            </p>
          </div>
          <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-green-600" />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {([
            { label: "Activate", Icon: Zap, desc: "Start a cycle" },
            { label: "Earn ZNTR", Icon: Medal, desc: "Cycle rewards" },
            { label: "Convert", Icon: Coins, desc: "ZNTR → Cash" },
          ] as const).map((f) => (
            <div key={f.label} className="rounded-xl bg-green-50 px-3 py-3 text-center">
              <f.Icon className="mx-auto h-5 w-5 text-green-700" />
              <p className="mt-1 text-[11px] font-bold text-slate-800">{f.label}</p>
              <p className="text-[9px] text-slate-500">{f.desc}</p>
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

function GameThumb({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return <img src={src} alt={alt} className={`h-full w-full object-cover ${className}`} />;
}

/** Premium SVG illustration for the Zentra mining card */
function ZentraThumb() {
  return (
    <svg viewBox="0 0 80 80" className="h-full w-full" xmlns="http://www.w3.org/2000/svg">
      {/* Deep space background */}
      <defs>
        <linearGradient id="zt-bg" x1="0" y1="0" x2="80" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0a0f1e" />
          <stop offset="100%" stopColor="#0e1a0a" />
        </linearGradient>
        <linearGradient id="zt-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f5e08a" />
          <stop offset="100%" stopColor="#b8860b" />
        </linearGradient>
        <linearGradient id="zt-ore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#7a5c0e" />
        </linearGradient>
      </defs>
      <rect width="80" height="80" fill="url(#zt-bg)" />

      {/* Circuit grid lines */}
      <line x1="10" y1="20" x2="70" y2="20" stroke="#1a3a1a" strokeWidth="0.5" />
      <line x1="10" y1="40" x2="70" y2="40" stroke="#1a3a1a" strokeWidth="0.5" />
      <line x1="10" y1="60" x2="70" y2="60" stroke="#1a3a1a" strokeWidth="0.5" />
      <line x1="20" y1="10" x2="20" y2="70" stroke="#1a3a1a" strokeWidth="0.5" />
      <line x1="40" y1="10" x2="40" y2="70" stroke="#1a3a1a" strokeWidth="0.5" />
      <line x1="60" y1="10" x2="60" y2="70" stroke="#1a3a1a" strokeWidth="0.5" />

      {/* Hexagonal ore crystal */}
      <polygon points="40,14 52,21 52,35 40,42 28,35 28,21"
        fill="url(#zt-ore)" stroke="#f5e08a" strokeWidth="0.8" opacity="0.9" />
      <polygon points="40,18 49,23 49,33 40,38 31,33 31,23"
        fill="none" stroke="rgba(255,248,200,0.4)" strokeWidth="0.5" />
      {/* Inner gem facet */}
      <line x1="40" y1="14" x2="40" y2="42" stroke="rgba(255,248,200,0.3)" strokeWidth="0.5" />
      <line x1="28" y1="21" x2="52" y2="35" stroke="rgba(255,248,200,0.3)" strokeWidth="0.5" />
      <line x1="52" y1="21" x2="28" y2="35" stroke="rgba(255,248,200,0.3)" strokeWidth="0.5" />
      {/* Glint */}
      <circle cx="35" cy="20" r="1.5" fill="rgba(255,255,255,0.7)" />

      {/* Circuit nodes */}
      <circle cx="20" cy="55" r="3" fill="#1a6b2e" stroke="#2ecc71" strokeWidth="0.8" />
      <circle cx="60" cy="55" r="3" fill="#1a6b2e" stroke="#2ecc71" strokeWidth="0.8" />
      <circle cx="40" cy="62" r="3" fill="#1a6b2e" stroke="#2ecc71" strokeWidth="0.8" />

      {/* Circuit traces from crystal to nodes */}
      <path d="M34 42 L20 52" stroke="#2ecc71" strokeWidth="0.8" fill="none" opacity="0.7" />
      <path d="M46 42 L60 52" stroke="#2ecc71" strokeWidth="0.8" fill="none" opacity="0.7" />
      <path d="M40 42 L40 59" stroke="#2ecc71" strokeWidth="0.8" fill="none" opacity="0.7" />

      {/* Connection line between nodes */}
      <path d="M20 55 L40 62 L60 55" stroke="#2ecc71" strokeWidth="0.6" fill="none" opacity="0.5" strokeDasharray="2 1" />

      {/* Ambient glow dots */}
      <circle cx="15" cy="15" r="1" fill="#d4af37" opacity="0.5" />
      <circle cx="65" cy="12" r="1" fill="#d4af37" opacity="0.4" />
      <circle cx="68" cy="68" r="1" fill="#2ecc71" opacity="0.4" />
      <circle cx="12" cy="65" r="1" fill="#2ecc71" opacity="0.4" />
    </svg>
  );
}

const GAME_LIST = [
  {
    to: "/app/feud",
    label: "Family Feud",
    desc: "Guess the most popular answers to win.",
    tags: [{ text: "Popular", color: "text-rose-600 bg-rose-50 border border-rose-200" }, { text: "Live", color: "text-slate-500 bg-slate-100" }],
    thumb: <GameThumb src="/images/game-familyfeud.jpg" alt="Family Feud" />,
  },
  {
    to: "/app/spin",
    label: "Spin & Win",
    desc: "Spin the wheel for instant cash rewards.",
    tags: [{ text: "Daily", color: "text-purple-600 bg-purple-50 border border-purple-200" }, { text: "Instant", color: "text-slate-500 bg-slate-100" }],
    thumb: <GameThumb src="/images/game-spinwheel.jpg" alt="Spin & Win" />,
  },
  {
    to: "/app/goldmine",
    label: "Zentra Mining",
    desc: "Activate cycles, earn ZNTR, convert to cash.",
    tags: [{ text: "Strategy", color: "text-amber-700 bg-amber-50 border border-amber-200" }, { text: "Earn", color: "text-slate-500 bg-slate-100" }],
    thumb: <ZentraThumb />,
  },
];

const GAME_CATS = ["All", "Family Feud", "Spin & Win", "Zentra"];

export function GamesPage() {
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("All");

  const filtered = GAME_LIST.filter((g) => {
    const q = search.toLowerCase();
    const matchSearch = !q || g.label.toLowerCase().includes(q) || g.desc.toLowerCase().includes(q);
    const matchCat = cat === "All"
      || (cat === "Family Feud" && g.to === "/app/feud")
      || (cat === "Spin & Win" && g.to === "/app/spin")
      || (cat === "Zentra" && g.to === "/app/goldmine");
    return matchSearch && matchCat;
  });

  return (
    <div className="space-y-3">
      {/* search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search games…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-8 pr-4 text-sm outline-none focus:border-green-500 focus:ring-1 focus:ring-green-500"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* category pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {GAME_CATS.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              cat === c ? "bg-[#1a4d2e] text-white" : "border border-slate-200 bg-white text-slate-500 hover:border-slate-300"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* game cards */}
      <div className="space-y-2.5">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white p-8 text-center">
            <p className="text-sm text-slate-400">No games match your search.</p>
          </div>
        ) : (
          filtered.map((g) => (
            <div
              key={g.label}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm transition-all active:scale-[0.99]"
            >
              {/* thumbnail */}
              <div className="h-[60px] w-[60px] shrink-0 overflow-hidden rounded-lg">
                {g.thumb}
              </div>

              {/* info */}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight text-slate-900">{g.label}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{g.desc}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {g.tags.map((t) => (
                    <span key={t.text} className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${t.color}`}>
                      {t.text}
                    </span>
                  ))}
                </div>
              </div>

              {/* play button */}
              <button
                onClick={() => navigate(g.to)}
                className="shrink-0 rounded-full bg-green-600 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-green-700 active:scale-95"
              >
                Play
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
