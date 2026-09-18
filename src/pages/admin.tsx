import { useMemo, useState } from "react";
import {
  BadgeCheck, Ban, Check, ClipboardList, Coins, CreditCard,
  Layers, ListChecks, Pencil, Plus, Search, Trash2, TrendingUp, Upload, Users, Wallet, X,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHead,
  Select, Stat, StatusBadge, Td, Table, Textarea, fmtDate, fmtN,
} from "../components/ui";
import {
  adminDeleteLevel, adminDeleteTask, adminSaveLevel, adminSaveTask, adminSetUserStatus,
  adminStats, getAllUsers, getBalances, getMySubmissions, getPayments, getUserLevel,
  getWithdrawals, listLevels,
} from "../lib/services";
import TaskImportModal from "../components/TaskImport";
import { read } from "../lib/db";
import { useAction, useData, useUser } from "../lib/store";
import type { MembershipLevel, Profile, Task, TaskCategory } from "../lib/types";

const CATEGORIES: TaskCategory[] = [
  "Data Entry", "Surveys", "Content", "Research", "Social Media", "Website Testing", "Digital Services", "Other",
];

/* ================= OVERVIEW ================= */

export function AdminOverview() {
  const stats = useData(adminStats);
  const recentUsers = useData(() => getAllUsers().slice(0, 6));

  return (
    <div>
      <PageHead title="Overview" sub="Platform health at a glance" />
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Total users" value={String(stats.totalUsers)} icon={<Users className="h-4.5 w-4.5" />} sub={`${stats.newToday} new today`} />
        <Stat label="Active users" value={String(stats.activeUsers)} icon={<BadgeCheck className="h-4.5 w-4.5" />} />
        <Stat label="Active members" value={String(stats.activeMembers)} icon={<Layers className="h-4.5 w-4.5" />} />
        <Stat label="Membership revenue" value={fmtN(stats.membershipRevenue)} tone="brand" icon={<CreditCard className="h-4.5 w-4.5" />} />
        <Stat label="Task payouts" value={fmtN(stats.taskPayouts)} icon={<ListChecks className="h-4.5 w-4.5" />} />
        <Stat label="Referral payouts" value={fmtN(stats.referralPayouts)} icon={<TrendingUp className="h-4.5 w-4.5" />} />
        <Stat label="Pending withdrawals" value={String(stats.pendingWithdrawals.length)} icon={<Coins className="h-4.5 w-4.5" />}
          sub={fmtN(stats.pendingWithdrawals.reduce((s, w) => s + w.amount, 0)) + " held"} />
        <Stat label="Total paid out" value={fmtN(stats.totalWithdrawn)} icon={<Wallet className="h-4.5 w-4.5" />} />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Latest registrations" />
          {recentUsers.length === 0 ? (
            <EmptyState icon={<Users className="h-5 w-5" />} title="No users yet" sub="Registrations will appear here." />
          ) : (
            <Table head={["User", "Joined", "Status", "Verified"]}>
              {recentUsers.map((u) => (
                <tr key={u.id}>
                  <Td>
                    <span className="block font-medium">{u.fullName}</span>
                    <span className="text-xs text-slate-400">{u.email}</span>
                  </Td>
                  <Td className="text-xs text-slate-400">{fmtDate(u.createdAt)}</Td>
                  <Td><StatusBadge status={u.status} /></Td>
                  <Td>{u.emailVerified ? <Badge tone="green">Yes</Badge> : <Badge tone="amber">No</Badge>}</Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card>
          <CardHeader title="Action queues" />
          <div className="grid gap-2.5 p-4">
            {[
              { to: "/admin/submissions", icon: ClipboardList, label: "Submissions awaiting review", count: stats.pendingSubmissions },
              { to: "/admin/withdrawals", icon: Coins, label: "Withdrawals awaiting processing", count: stats.pendingWithdrawals.length },
            ].map((q) => (
              <a key={q.to} href={`#${q.to}`} className="flex items-center gap-3.5 rounded-lg border border-slate-200 p-4 transition-colors hover:border-brand hover:bg-brand-50/40">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand"><q.icon className="h-4.5 w-4.5" /></span>
                <span className="flex-1 text-sm font-medium text-slate-700">{q.label}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${q.count > 0 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-400"}`}>
                  {q.count}
                </span>
              </a>
            ))}
            <div className="rounded-lg bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
              <span className="font-semibold text-slate-700">Integrity note:</span> every approval, payout and
              configuration change is recorded in the audit log with the acting administrator.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

/* ================= USERS ================= */

export function AdminUsers() {
  const admin = useUser()!;
  const { busy, run } = useAction();
  const [q, setQ] = useState("");
  const users = useData(getAllUsers);
  const [detail, setDetail] = useState<Profile | null>(null);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) => u.fullName.toLowerCase().includes(s) || u.email.includes(s) || u.referralCode.toLowerCase().includes(s));
  }, [users, q]);

  return (
    <div>
      <PageHead title="Users" sub={`${users.length} registered accounts`} />
      <div className="relative mb-4 max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or referral code…" className="pl-9" />
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="No users found" />
        ) : (
          <Table head={["User", "Level", "Joined", "Status", ""]}>
            {filtered.map((u) => (
              <UserRow key={u.id} u={u} onOpen={() => setDetail(u)} />
            ))}
          </Table>
        )}
      </Card>

      {/* user detail drawer */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title="User profile" wide>
        {detail && <UserDetail u={detail} adminId={admin.id} busy={busy} run={run} onChanged={setDetail} />}
      </Modal>
    </div>
  );
}

function UserRow({ u, onOpen }: { u: Profile; onOpen: () => void }) {
  const level = useData(() => getUserLevel(u.id));
  return (
    <tr className="cursor-pointer hover:bg-slate-50" onClick={onOpen}>
      <Td>
        <span className="block font-medium">{u.fullName}</span>
        <span className="text-xs text-slate-400">{u.email} · {u.phone}</span>
      </Td>
      <Td>{level ? <Badge tone="green">{level.name}</Badge> : <span className="text-xs text-slate-400">None</span>}</Td>
      <Td className="text-xs text-slate-400">{fmtDate(u.createdAt)}</Td>
      <Td><StatusBadge status={u.status} /></Td>
      <Td className="text-right text-xs font-semibold text-brand">Manage</Td>
    </tr>
  );
}

function UserDetail({ u, adminId, busy, run, onChanged }: {
  u: Profile; adminId: string; busy: boolean;
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>;
  onChanged: (p: Profile) => void;
}) {
  const fresh = useData(() => read().profiles.find((p) => p.id === u.id) || u);
  const level = useData(() => getUserLevel(fresh.id));
  const bal = useData(() => getBalances(fresh.id));
  const payments = useData(() => getPayments(fresh.id));
  const subs = useData(() => getMySubmissions(fresh.id).slice(0, 6));
  const withdrawals = useData(() => getWithdrawals(fresh.id).slice(0, 4));
  const refs = useData(() => read().referrals.filter((r) => r.referrerId === fresh.id).length);
  const approvedCount = useData(() => getMySubmissions(fresh.id).filter((s) => s.status === "approved").length);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-slate-900">{fresh.fullName}</p>
          <p className="text-sm text-slate-500">{fresh.email} · {fresh.phone}</p>
          <p className="mt-1 font-mono text-[11px] text-slate-400">ID {fresh.id.slice(0, 8)} · Ref code {fresh.referralCode} · Joined {fmtDate(fresh.createdAt)}</p>
        </div>
        <div className="flex gap-2">
          <StatusBadge status={fresh.status} />
          {fresh.emailVerified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-400">Available</p><p className="mt-0.5 font-bold text-brand">{fmtN(bal.available)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-400">Total earned</p><p className="mt-0.5 font-bold">{fmtN(bal.totalEarned)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-400">Withdrawn</p><p className="mt-0.5 font-bold">{fmtN(bal.totalWithdrawn)}</p></div>
        <div className="rounded-lg bg-slate-50 p-3"><p className="text-[11px] text-slate-400">Referrals</p><p className="mt-0.5 font-bold">{refs}</p></div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Membership</p>
          {level ? (
            <p className="mt-2 text-sm font-semibold text-slate-800">{level.name} — {level.taskLimitPerDay} tasks/day · {level.referralCommission}% comm.</p>
          ) : (
            <p className="mt-2 text-sm text-slate-500">No active membership</p>
          )}
          <p className="mt-1 text-xs text-slate-400">Payments: {payments.filter((p) => p.status === "success").length} verified</p>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Recent work</p>
          <p className="mt-2 text-sm text-slate-700">{subs.length} recent submissions · {withdrawals.length} withdrawals</p>
          <p className="mt-1 text-xs text-slate-400">Approved: {approvedCount}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5 border-t border-slate-100 pt-4">
        {fresh.status === "active" ? (
          <Button variant="danger" size="sm" loading={busy}
            onClick={async () => {
              const ok = await run(() => adminSetUserStatus(adminId, fresh.id, "suspended"), "Account suspended.");
              if (ok !== null) onChanged({ ...fresh, status: "suspended" });
            }}>
            <Ban className="h-3.5 w-3.5" /> Suspend account
          </Button>
        ) : (
          <Button size="sm" loading={busy}
            onClick={async () => {
              const ok = await run(() => adminSetUserStatus(adminId, fresh.id, "active"), "Account reactivated.");
              if (ok !== null) onChanged({ ...fresh, status: "active" });
            }}>
            <Check className="h-3.5 w-3.5" /> Reactivate account
          </Button>
        )}
        <p className="text-[11px] leading-relaxed text-slate-400 sm:ml-auto sm:max-w-[220px]">
          Suspended users cannot log in, start tasks or request withdrawals. All actions are audit-logged.
        </p>
      </div>
    </div>
  );
}

/* ================= LEVELS ================= */

const emptyLevel: Partial<MembershipLevel> = {
  name: "", price: 6500, description: "", features: [], taskLimitPerDay: 3, referralCommission: 5, enabled: true, sortOrder: 99,
};

export function AdminLevels() {
  const admin = useUser()!;
  const { busy, run } = useAction();
  const levels = useData(() => listLevels(true));
  const [editing, setEditing] = useState<Partial<MembershipLevel> | null>(null);
  const [featureText, setFeatureText] = useState("");

  const openEdit = (l: MembershipLevel | null) => {
    setEditing(l ? { ...l } : { ...emptyLevel });
    setFeatureText(l ? l.features.join("\n") : "");
  };

  return (
    <div>
      <PageHead title="Membership Levels" sub="Create, price, order and toggle access levels"
        action={<Button onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> New level</Button>} />
      <Card>
        <Table head={["#", "Level", "Price", "Limits", "Commission", "Status", "Actions"]}>
          {levels.map((l) => (
            <tr key={l.id}>
              <Td className="text-slate-400">{l.sortOrder}</Td>
              <Td>
                <span className="block font-medium">{l.name}</span>
                <span className="line-clamp-1 max-w-[220px] text-xs text-slate-400">{l.description}</span>
              </Td>
              <Td className="font-semibold">{fmtN(l.price)}</Td>
              <Td>{l.taskLimitPerDay}/day</Td>
              <Td>{l.referralCommission}%</Td>
              <Td>{l.enabled ? <Badge tone="green">Enabled</Badge> : <Badge tone="slate">Disabled</Badge>}</Td>
              <Td>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(l)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                    onClick={() => run(() => adminDeleteLevel(admin.id, l.id), "Level deleted.")}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? `Edit — ${editing.name}` : "Create level"} wide>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () => adminSaveLevel(admin.id, { ...editing, features: featureText.split("\n").map((f) => f.trim()).filter(Boolean) }),
                "Level saved."
              );
              if (ok !== null) setEditing(null);
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Level name"><Input required value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Platinum" /></Field>
              <Field label="Price (₦)"><Input required type="number" min={500} value={editing.price || 0} onChange={(e) => setEditing({ ...editing, price: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Description"><Input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Features" hint="One per line">
              <Textarea value={featureText} onChange={(e) => setFeatureText(e.target.value)} placeholder={"Access to all tasks\nPriority support"} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Task limit / day"><Input type="number" min={1} max={100} value={editing.taskLimitPerDay || 3} onChange={(e) => setEditing({ ...editing, taskLimitPerDay: Number(e.target.value) })} /></Field>
              <Field label="Referral commission %"><Input type="number" min={0} max={30} step={0.5} value={editing.referralCommission ?? 5} onChange={(e) => setEditing({ ...editing, referralCommission: Number(e.target.value) })} /></Field>
              <Field label="Sort order"><Input type="number" min={1} value={editing.sortOrder || 99} onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })} /></Field>
            </div>
            <label className="flex items-center gap-2.5 text-sm text-slate-700">
              <input type="checkbox" checked={editing.enabled ?? true} onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })} className="h-4 w-4 accent-green-600" />
              Level is purchasable
            </label>
            <div className="flex gap-2.5 pt-1">
              <Button loading={busy} className="flex-1">Save level</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ================= TASKS ================= */

export function AdminTasks() {
  const admin = useUser()!;
  const { busy, run } = useAction();
  const tasks = useData(() => read().tasks.sort((a, b) => b.createdAt - a.createdAt));
  const levels = useData(() => listLevels(true));
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const [importing, setImporting] = useState(false);

  const openEdit = (t: Task | null) => {
    setEditing(
      t
        ? { ...t }
        : {
            title: "", description: "", instructions: "", category: "Data Entry",
            reward: 500, estMinutes: 20, maxSubmissions: 100, dailyLimit: 1,
            levelIds: levels.slice(0, 1).map((l) => l.id), verification: "manual_review",
            status: "active",
          }
    );
  };

  return (
    <div>
      <PageHead title="Tasks" sub="The earning catalogue shown to members"
        action={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setImporting(true)}>
              <Upload className="h-4 w-4" /> Import CSV / Excel
            </Button>
            <Button onClick={() => openEdit(null)}><Plus className="h-4 w-4" /> New task</Button>
          </div>
        } />
      <Card>
        {tasks.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-5 w-5" />} title="No tasks yet" sub="Create the first task to open earning." />
        ) : (
          <Table head={["Task", "Reward", "Category", "Levels", "Slots", "Status", "Actions"]}>
            {tasks.map((t) => {
              const used = read().submissions.filter((s) => s.taskId === t.id && s.status !== "rejected").length;
              return (
                <tr key={t.id}>
                  <Td className="max-w-[260px]">
                    <span className="block truncate font-medium">{t.title}</span>
                    <span className="line-clamp-1 text-xs text-slate-400">{t.description}</span>
                  </Td>
                  <Td className="font-semibold">{fmtN(t.reward)}</Td>
                  <Td><Badge tone="slate">{t.category}</Badge></Td>
                  <Td className="text-xs text-slate-500">{t.levelIds.map((id) => levels.find((l) => l.id === id)?.name || "?").join(", ")}</Td>
                  <Td className="text-xs">{used}/{t.maxSubmissions}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50"
                        onClick={() => run(() => adminDeleteTask(admin.id, t.id), "Task deleted.")}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Edit task" : "Create task"} wide>
        {editing && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => adminSaveTask(admin.id, editing), "Task saved.");
              if (ok !== null) setEditing(null);
            }}
          >
            <Field label="Task title"><Input required value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></Field>
            <Field label="Description"><Textarea rows={2} required value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></Field>
            <Field label="Instructions" hint="Shown before a member starts the task">
              <Textarea value={editing.instructions || ""} onChange={(e) => setEditing({ ...editing, instructions: e.target.value })} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Category">
                <Select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value as TaskCategory })}>
                  {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                </Select>
              </Field>
              <Field label="Reward (₦)"><Input type="number" min={50} required value={editing.reward || 0} onChange={(e) => setEditing({ ...editing, reward: Number(e.target.value) })} /></Field>
              <Field label="Est. minutes"><Input type="number" min={1} value={editing.estMinutes || 15} onChange={(e) => setEditing({ ...editing, estMinutes: Number(e.target.value) })} /></Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Max submissions"><Input type="number" min={1} value={editing.maxSubmissions || 100} onChange={(e) => setEditing({ ...editing, maxSubmissions: Number(e.target.value) })} /></Field>
              <Field label="Daily limit / user"><Input type="number" min={1} max={10} value={editing.dailyLimit || 1} onChange={(e) => setEditing({ ...editing, dailyLimit: Number(e.target.value) })} /></Field>
              <Field label="Status">
                <Select value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value as Task["status"] })}>
                  {["draft", "active", "paused", "archived"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Verification method">
              <Select value={editing.verification} onChange={(e) => setEditing({ ...editing, verification: e.target.value as Task["verification"] })}>
                <option value="manual_review">Manual review</option>
                <option value="link_check">Link check</option>
                <option value="code_check">Completion code</option>
              </Select>
            </Field>
            <div>
              <p className="mb-2 text-[13px] font-medium text-slate-700">Allowed membership levels</p>
              <div className="flex flex-wrap gap-2">
                {levels.map((l) => {
                  const on = editing.levelIds?.includes(l.id);
                  return (
                    <button type="button" key={l.id}
                      onClick={() =>
                        setEditing({
                          ...editing,
                          levelIds: on ? editing.levelIds!.filter((x) => x !== l.id) : [...(editing.levelIds || []), l.id],
                        })
                      }
                      className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${on ? "bg-brand text-white" : "border border-slate-300 text-slate-600 hover:border-brand"}`}>
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="flex gap-2.5 pt-1">
              <Button loading={busy} className="flex-1">Save task</Button>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}><X className="h-4 w-4" /></Button>
            </div>
          </form>
        )}
      </Modal>

      <TaskImportModal
        open={importing}
        onClose={() => setImporting(false)}
        levels={levels}
      />
    </div>
  );
}


