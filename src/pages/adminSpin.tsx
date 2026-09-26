import { useState } from "react";
import { Check, Disc3, Plus, Save, Trash2 } from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHead,
  StatusBadge, Td, Table, Textarea, fmtDateTime, fmtN,
} from "../components/ui";
import { adminSetSpinReward, adminSaveSpinConfig, getAllUsers, getSpinConfig } from "../lib/services";
import { read } from "../lib/db";
import { useAction, useData, useUser } from "../lib/store";
import type { SpinConfig, SpinSegment, SpinReward, SpinRewardType } from "../lib/types";

interface SpinRow extends SpinReward {
  userName: string;
  userEmail: string;
}

const PALETTE = ["#10b981", "#059669", "#047857", "#d4af37", "#b8860b", "#f59e0b", "#0ea5e9", "#334155", "#7c3aed", "#be123c", "#0891b2", "#65a30d"];

function sameDay(ts: number): boolean {
  const d = new Date(ts), n = new Date();
  return d.getUTCFullYear() === n.getUTCFullYear() && d.getUTCMonth() === n.getUTCMonth() && d.getUTCDate() === n.getUTCDate();
}

interface FraudFlag { kind: string; userName: string; detail: string; }

/** Lightweight heuristics surfaced for manual review: multiple accounts
 *  sharing one IP / device fingerprint. */
function detectFraud(spins: SpinRow[]): FraudFlag[] {
  const flags: FraudFlag[] = [];
  const byIp = new Map<string, Set<string>>();
  const byUa = new Map<string, Set<string>>();
  for (const s of spins) {
    if (s.ip) {
      if (!byIp.has(s.ip)) byIp.set(s.ip, new Set());
      byIp.get(s.ip)!.add(s.userId);
    }
    if (s.userAgent) {
      if (!byUa.has(s.userAgent)) byUa.set(s.userAgent, new Set());
      byUa.get(s.userAgent)!.add(s.userId);
    }
  }
  const nameOf = (id: string) => spins.find((s) => s.userId === id)?.userName || id.slice(0, 8);
  const isLoopback = (ip: string) => ip === "::1" || ip.toLowerCase() === "localhost" || ip.startsWith("127.");
  for (const [ip, ids] of byIp) {
    if (ids.size > 2 && !isLoopback(ip)) {
      flags.push({ kind: "shared IP", userName: [...ids].map(nameOf).slice(0, 3).join(", "), detail: `${ids.size} accounts spun from ${ip}` });
    }
  }
  for (const ids of byUa.values()) {
    if (ids.size > 3) {
      flags.push({ kind: "shared device", userName: [...ids].map(nameOf).slice(0, 3).join(", "), detail: `${ids.size} accounts share a browser fingerprint` });
    }
  }
  return flags;
}

export function AdminSpin() {
  const admin = useUser()!;
  const config = useData(getSpinConfig);
  const users = useData(getAllUsers);
  const { busy, run } = useAction();

  const [draft, setDraft] = useState<SpinConfig>(() => JSON.parse(JSON.stringify(config)));
  const [dirty, setDirty] = useState(false);
  const [reviewing, setReviewing] = useState<{ spin: SpinRow; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");

  const spins = useData((): SpinRow[] =>
    [...read().spins]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((s) => {
        const u = users.find((x) => x.id === s.userId);
        return { ...s, userName: u?.fullName || "Unknown", userEmail: u?.email || "" };
      })
  );

  const pendingCount = spins.filter((s) => s.rewardType === "cash" && s.status === "pending").length;
  const awardedToday = spins
    .filter((s) => s.rewardType === "cash" && s.status !== "rejected" && sameDay(s.createdAt))
    .reduce((sum, s) => sum + s.amount, 0);
  const fraudFlags = detectFraud(spins);

  const editSeg = (i: number, patch: Partial<SpinSegment>) => {
    setDraft({ ...draft, segments: draft.segments.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
    setDirty(true);
  };
  const addSeg = () => {
    if (draft.segments.length >= 12) return;
    setDraft({
      ...draft,
      segments: [...draft.segments, { label: "₦25", type: "cash", amount: 25, weight: 10, color: PALETTE[draft.segments.length % PALETTE.length] }],
    });
    setDirty(true);
  };
  const removeSeg = (i: number) => {
    if (draft.segments.length <= 2) return;
    setDraft({ ...draft, segments: draft.segments.filter((_, idx) => idx !== i) });
    setDirty(true);
  };

  const save = async () => {
    const ok = await run(() => adminSaveSpinConfig(admin.id, draft), "Spin settings saved.");
    if (ok !== null) setDirty(false);
  };

  return (
    <div>
      <PageHead
        title="Daily Spin"
        sub="Configure the wheel, review rewards and monitor for abuse"
        action={
          <Button onClick={save} loading={busy} disabled={!dirty}>
            <Save className="h-4 w-4" /> {dirty ? "Save changes" : "Saved"}
          </Button>
        }
      />

      {/* stats */}
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Status</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{config.enabled ? "Active" : "Paused"}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Awarded today</p>
          <p className="mt-1 text-sm font-bold text-slate-900">
            {fmtN(awardedToday)} <span className="text-xs font-normal text-slate-400">/ {fmtN(draft.dailyBudget)}</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Pending rewards</p>
          <p className="mt-1 text-sm font-bold text-slate-900">{pendingCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Fraud flags</p>
          <p className={`mt-1 text-sm font-bold ${fraudFlags.length ? "text-red-600" : "text-slate-900"}`}>{fraudFlags.length}</p>
        </Card>
      </div>

      {/* settings */}
      <Card className="mt-5">
        <CardHeader title="Eligibility & budget" />
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={draft.enabled} onChange={(e) => { setDraft({ ...draft, enabled: e.target.checked }); setDirty(true); }} className="h-4 w-4 accent-emerald-600" />
            Spin enabled
          </label>
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={draft.requireVerified} onChange={(e) => { setDraft({ ...draft, requireVerified: e.target.checked }); setDirty(true); }} className="h-4 w-4 accent-emerald-600" />
            Require verified email
          </label>
          <label className="flex items-center gap-2.5 text-sm text-slate-700">
            <input type="checkbox" checked={draft.requireMembership} onChange={(e) => { setDraft({ ...draft, requireMembership: e.target.checked }); setDirty(true); }} className="h-4 w-4 accent-emerald-600" />
            Require active membership
          </label>
          <Field label="Max daily reward budget (₦)">
            <Input type="number" min={0} value={draft.dailyBudget} onChange={(e) => { setDraft({ ...draft, dailyBudget: Math.max(0, Math.floor(Number(e.target.value))) }); setDirty(true); }} />
          </Field>
        </div>
      </Card>

      <SegmentsEditor draft={draft} editSeg={editSeg} addSeg={addSeg} removeSeg={removeSeg} />

      {/* fraud flags */}
      {fraudFlags.length > 0 && (
        <Card className="mt-5 border-red-200">
          <CardHeader title="Fraud detection" sub="Automatic signals for manual review" />
          <div className="divide-y divide-slate-100">
            {fraudFlags.map((f, i) => (
              <div key={i} className="flex items-start gap-3 px-5 py-3 text-sm">
                <Badge tone="red">{f.kind}</Badge>
                <div>
                  <p className="font-medium text-slate-800">{f.userName}</p>
                  <p className="text-xs text-slate-500">{f.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <HistoryTable spins={spins} onReview={(s, decision) => { setReviewing({ spin: s, decision }); setNote(""); }} />

      <Modal
        open={!!reviewing}
        onClose={() => setReviewing(null)}
        title={reviewing?.decision === "approve" ? "Approve spin reward" : "Decline spin reward"}
      >
        {reviewing && (
          <form
            className="space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const { spin, decision } = reviewing;
              const ok = await run(
                () => adminSetSpinReward(admin.id, spin.id, decision, note),
                decision === "approve" ? "Reward approved and credited." : "Reward declined.",
              );
              if (ok !== null) setReviewing(null);
            }}
          >
            {reviewing.decision === "approve" ? (
              <p className="text-sm text-slate-600">
                Approving <span className="font-semibold">{fmtN(reviewing.spin.amount)}</span> for{" "}
                <span className="font-semibold">{reviewing.spin.userName}</span> credits the pending wallet reward.
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Declining <span className="font-semibold">{fmtN(reviewing.spin.amount)}</span> for{" "}
                <span className="font-semibold">{reviewing.spin.userName}</span> removes the pending wallet credit.
              </p>
            )}
            {reviewing.decision === "reject" && (
              <Field label="Reason (shown to the member)" hint="At least 5 characters">
                <Textarea rows={3} required value={note} onChange={(e) => setNote(e.target.value)} />
              </Field>
            )}
            <div className="flex gap-2.5">
              <Button
                type="submit"
                loading={busy}
                variant={reviewing.decision === "reject" ? "danger" : "primary"}
                className="flex-1"
              >
                <Check className="h-4 w-4" /> {reviewing.decision === "approve" ? "Approve reward" : "Decline reward"}
              </Button>
              <Button type="button" variant="outline" onClick={() => setReviewing(null)}>Cancel</Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

/* ================= segments editor ================= */

function SegmentsEditor({ draft, editSeg, addSeg, removeSeg }: {
  draft: SpinConfig;
  editSeg: (i: number, patch: Partial<SpinSegment>) => void;
  addSeg: () => void;
  removeSeg: (i: number) => void;
}) {
  return (
    <Card className="mt-5">
      <CardHeader
        title="Wheel segments"
        sub="Reward amounts, probabilities (weights) and colours — 2 to 12 segments"
        action={
          <Button size="sm" variant="outline" onClick={addSeg} disabled={draft.segments.length >= 12}>
            <Plus className="h-3.5 w-3.5" /> Add segment
          </Button>
        }
      />
      <div className="space-y-3 p-5">
        {draft.segments.map((seg, i) => {
          const total = draft.segments.reduce((s, x) => s + Math.max(1, x.weight), 0);
          const pct = ((Math.max(1, seg.weight) / total) * 100).toFixed(1);
          return (
            <div key={i} className="grid items-end gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-3 sm:grid-cols-[auto_1fr_1fr_1fr_1fr_auto]">
              <input
                type="color" value={seg.color} title="Segment colour"
                onChange={(e) => editSeg(i, { color: e.target.value })}
                className="h-9 w-9 cursor-pointer rounded-lg border border-slate-200 bg-white p-1"
              />
              <Field label={`Label (segment ${i + 1})`}>
                <Input value={seg.label} maxLength={24} onChange={(e) => editSeg(i, { label: e.target.value })} />
              </Field>
              <Field label="Type">
                <select
                  value={seg.type}
                  onChange={(e) => editSeg(i, { type: e.target.value as SpinRewardType })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand"
                >
                  <option value="cash">Cash</option>
                  <option value="bonus_task">Bonus Task</option>
                  <option value="none">Try Again</option>
                </select>
              </Field>
              <Field label="Amount (₦)">
                <Input
                  type="number" min={seg.type === "cash" ? 1 : 0} value={seg.amount}
                  disabled={seg.type !== "cash"}
                  onChange={(e) => editSeg(i, { amount: Math.max(0, Math.floor(Number(e.target.value))) })}
                />
              </Field>
              <Field label={`Weight (${pct}%)`} hint="relative chance">
                <Input
                  type="number" min={1} max={1000} value={seg.weight}
                  onChange={(e) => editSeg(i, { weight: Math.min(1000, Math.max(1, Math.floor(Number(e.target.value) || 1))) })}
                />
              </Field>
              <Button size="sm" variant="ghost" className="text-red-500 hover:bg-red-50" disabled={draft.segments.length <= 2} onClick={() => removeSeg(i)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
        <p className="text-[11px] text-slate-400">
          Weights are relative — a weight of 30 among a total of 108 gives ~27.8% chance. Changes apply to all future spins immediately after saving.
        </p>
      </div>
    </Card>
  );
}

/* ================= history table ================= */

function HistoryTable({ spins, onReview }: {
  spins: SpinRow[];
  onReview: (s: SpinRow, decision: "approve" | "reject") => void;
}) {
  return (
    <Card className="mt-5">
      <CardHeader title="Spin history & reward approval" sub="Cash rewards stay pending until approved here" />
      {spins.length === 0 ? (
        <EmptyState icon={<Disc3 className="h-5 w-5" />} title="No spins yet" sub="Spins appear here with IP and device details." />
      ) : (
        <Table head={["Member", "Result", "Reward", "Status", "When", "IP / device", ""]}>
          {spins.slice(0, 50).map((s) => (
            <tr key={s.id}>
              <Td>
                <span className="block font-medium">{s.userName}</span>
                <span className="text-xs text-slate-400">{s.userEmail}</span>
              </Td>
              <Td>{s.label}</Td>
              <Td className="font-semibold">
                {s.rewardType === "cash" && s.amount > 0 ? fmtN(s.amount) : s.rewardType === "bonus_task" ? "Bonus Task" : "—"}
              </Td>
              <Td><StatusBadge status={s.status} /></Td>
              <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(s.createdAt)}</Td>
              <Td className="max-w-[180px]">
                <span className="block truncate font-mono text-[11px] text-slate-400">{s.ip || "—"}</span>
                <span className="block truncate text-[10px] text-slate-300">{s.userAgent || ""}</span>
              </Td>
              <Td>
                {s.rewardType === "cash" && s.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="outline" onClick={() => onReview(s, "approve")}>
                      <Check className="h-3.5 w-3.5" /> Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => onReview(s, "reject")}>
                      Decline
                    </Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}