import { useState } from "react";
import {
  Banknote, Check, ClipboardList, CreditCard, Eye, FileText, Landmark,
  Receipt, Save, ShieldCheck, X,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHead,
  StatusBadge, Td, Table, Textarea, fmtDate, fmtDateTime, fmtN,
} from "../components/ui";
import {
  adminSaveSettings, adminSetWithdrawal, getAllUsers, getAuditLog, getPayments,
  getSubmissionRows, getWalletTx, getWithdrawals, listLevels, maskName,
  reviewSubmission,
} from "../lib/services";
import { useAction, useData, useSettings, useUser } from "../lib/store";
import type { Withdrawal } from "../lib/types";

/* ================= SUBMISSIONS ================= */

export function AdminSubmissions() {
  const admin = useUser()!;
  const { busy, run } = useAction();
  const [filter, setFilter] = useState<"submitted" | "approved" | "rejected" | "in_progress">("submitted");
  const rows = useData(() => getSubmissionRows());
  const filtered = rows.filter((r) => r.status === filter);

  const [reviewing, setReviewing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const reviewRow = rows.find((r) => r.id === reviewing);

  const tabs = [
    { id: "submitted", label: "Awaiting review", count: rows.filter((r) => r.status === "submitted").length },
    { id: "in_progress", label: "In progress", count: rows.filter((r) => r.status === "in_progress").length },
    { id: "approved", label: "Approved", count: rows.filter((r) => r.status === "approved").length },
    { id: "rejected", label: "Rejected", count: rows.filter((r) => r.status === "rejected").length },
  ] as const;

  return (
    <div>
      <PageHead title="Task Submissions" sub="Approve real work — rewards credit instantly and idempotently" />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${filter === t.id ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand"}`}>
            {t.label} ({t.count})
          </button>
        ))}
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="Nothing here" sub={filter === "submitted" ? "The review queue is clear." : "No submissions with this status."} />
        ) : (
          <Table head={["User", "Task", "Reward", "Submitted", "Status", ""]}>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td><span className="block font-medium">{r.user?.fullName || "Unknown"}</span><span className="text-xs text-slate-400">{r.user?.email}</span></Td>
                <Td className="max-w-[220px]"><span className="block truncate">{r.task?.title || "Deleted"}</span><span className="text-xs text-slate-400">{r.task?.category}</span></Td>
                <Td className="font-semibold">{r.task ? fmtN(r.task.reward) : "—"}</Td>
                <Td className="text-xs text-slate-400">{r.submittedAt ? fmtDateTime(r.submittedAt) : "—"}</Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td>
                  {r.status === "submitted" && (
                    <Button size="sm" variant="outline" onClick={() => { setReviewing(r.id); setNote(""); }}>
                      <Eye className="h-3.5 w-3.5" /> Review
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal open={!!reviewing} onClose={() => setReviewing(null)} title="Review submission" wide>
        {reviewRow && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Task</p>
              <p className="mt-1 font-semibold text-slate-900">{reviewRow.task?.title}</p>
              <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-500">{reviewRow.task?.instructions}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Submitted proof — by {reviewRow.user?.fullName}</p>
              <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{reviewRow.proof}</p>
            </div>
            <Field label="Review note (required for rejection)">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Approved as-is / Row 7 missing source link — please be thorough" />
            </Field>
            <div className="flex gap-2.5">
              <Button className="flex-1" loading={busy}
                onClick={async () => {
                  const ok = await run(() => reviewSubmission(admin.id, reviewRow.id, true, note), `Approved — ${fmtN(reviewRow.task?.reward || 0)} credited.`);
                  if (ok !== null) setReviewing(null);
                }}>
                <Check className="h-4 w-4" /> Approve & pay {reviewRow.task ? fmtN(reviewRow.task.reward) : ""}
              </Button>
              <Button variant="danger" loading={busy}
                onClick={async () => {
                  const ok = await run(() => reviewSubmission(admin.id, reviewRow.id, false, note), "Submission rejected.");
                  if (ok !== null) setReviewing(null);
                }}>
                <X className="h-4 w-4" /> Reject
              </Button>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              Approval writes the wallet credit and any referral commission atomically — repeated approvals of the same
              submission cannot double-pay.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================= WITHDRAWALS ================= */

export function AdminWithdrawals() {
  const admin = useUser()!;
  const { busy, run } = useAction();
  const users = useData(getAllUsers);
  const all = useData(() => getWithdrawals());
  const [filter, setFilter] = useState<Withdrawal["status"] | "all">("pending");
  const filtered = all.filter((w) => filter === "all" || w.status === filter);

  const [acting, setActing] = useState<{ w: Withdrawal; action: "processing" | "paid" | "rejected" } | null>(null);
  const [payoutRef, setPayoutRef] = useState("");
  const [note, setNote] = useState("");

  const tabs = ["pending", "processing", "paid", "rejected", "all"] as const;

  return (
    <div>
      <PageHead title="Withdrawals" sub="Manual two-step payout: process, then mark paid with the bank reference" />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${filter === t ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand"}`}>
            {t} ({t === "all" ? all.length : all.filter((w) => w.status === t).length})
          </button>
        ))}
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<Landmark className="h-5 w-5" />} title="No withdrawals here" sub="New member requests appear in Pending." />
        ) : (
          <Table head={["Member", "Bank details", "Amount", "Reference", "Requested", "Status", "Actions"]}>
            {filtered.map((w) => {
              const u = users.find((x) => x.id === w.userId);
              return (
                <tr key={w.id}>
                  <Td><span className="block font-medium">{u?.fullName || "Unknown"}</span><span className="text-xs text-slate-400">{u?.email}</span></Td>
                  <Td><span className="block text-[13px]">{w.bank}</span><span className="text-xs text-slate-400">{w.accountNumber} · {w.accountName}</span></Td>
                  <Td>
                    <span className="block font-semibold">{fmtN(w.amount)}</span>
                    {w.fee > 0 && <span className="text-xs text-slate-400">+{fmtN(w.fee)} fee</span>}
                  </Td>
                  <Td className="font-mono text-[11px] text-slate-400">{w.reference}</Td>
                  <Td className="text-xs text-slate-400">{fmtDate(w.createdAt)}</Td>
                  <Td><StatusBadge status={w.status} /></Td>
                  <Td>
                    <div className="flex flex-wrap gap-1.5">
                      {w.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => { setActing({ w, action: "processing" }); setNote(""); setPayoutRef(""); }}>
                          Process
                        </Button>
                      )}
                      {(w.status === "pending" || w.status === "processing") && (
                        <>
                          <Button size="sm" onClick={() => { setActing({ w, action: "paid" }); setPayoutRef(""); setNote(""); }}>Mark paid</Button>
                          <Button size="sm" variant="danger" onClick={() => { setActing({ w, action: "rejected" }); setNote(""); setPayoutRef(""); }}>Reject</Button>
                        </>
                      )}
                      {w.status === "paid" && w.payoutRef && <span className="font-mono text-[10px] text-slate-400">{w.payoutRef}</span>}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Modal open={!!acting} onClose={() => setActing(null)} title={
        acting?.action === "paid" ? "Confirm payout" : acting?.action === "rejected" ? "Reject withdrawal" : "Start processing"
      }>
        {acting && (
          <div className="space-y-4">
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Amount</span><span className="font-bold">{fmtN(acting.w.amount)}</span></p>
              <p className="mt-1 flex justify-between"><span className="text-slate-500">Destination</span><span>{acting.w.bank} · {acting.w.accountNumber}</span></p>
              <p className="mt-1 flex justify-between"><span className="text-slate-500">Account name</span><span>{acting.w.accountName}</span></p>
            </div>

            {acting.action === "paid" && (
              <Field label="Bank / payout transaction reference" hint="Required — recorded against the ledger debit">
                <Input value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} placeholder="e.g. NIBSS/90012345678" />
              </Field>
            )}
            {acting.action === "rejected" && (
              <Field label="Rejection reason (shown to the member)">
                <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Account name does not match profile name" />
              </Field>
            )}
            {acting.action === "processing" && (
              <p className="text-xs leading-relaxed text-slate-500">
                Marking as processing signals to the member that payment is underway. Funds remain held.
              </p>
            )}

            <Button
              className="w-full" loading={busy}
              variant={acting.action === "rejected" ? "danger" : "primary"}
              disabled={(acting.action === "paid" && !payoutRef.trim()) || (acting.action === "rejected" && note.trim().length < 5)}
              onClick={async () => {
                const ok = await run(
                  () => adminSetWithdrawal(admin.id, acting.w.id, acting.action, { payoutRef, note }),
                  acting.action === "paid" ? "Marked paid — ledger debit written." : "Withdrawal updated."
                );
                if (ok !== null) setActing(null);
              }}
            >
              {acting.action === "paid" ? <Check className="h-4 w-4" /> : acting.action === "rejected" ? <X className="h-4 w-4" /> : <Banknote className="h-4 w-4" />}
              {acting.action === "paid" ? "Confirm paid" : acting.action === "rejected" ? "Reject & release hold" : "Mark as processing"}
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ================= PAYMENTS ================= */

export function AdminPayments() {
  const payments = useData(() => getPayments());
  const users = useData(getAllUsers);
  const levels = useData(() => listLevels(true));
  return (
    <div>
      <PageHead title="Membership Payments" sub="Every checkout attempt, with its gateway + verification status" />
      <Card>
        {payments.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No payments yet" sub="Membership purchases will be listed here." />
        ) : (
          <Table head={["Date", "User", "Level", "Amount", "Reference", "Gateway", "Verified"]}>
            {payments.map((p) => {
              const u = users.find((x) => x.id === p.userId);
              return (
                <tr key={p.id}>
                  <Td className="text-xs text-slate-400">{fmtDateTime(p.createdAt)}</Td>
                  <Td><span className="block font-medium">{u?.fullName || maskName("Unknown user")}</span><span className="text-xs text-slate-400">{u?.email}</span></Td>
                  <Td>{levels.find((l) => l.id === p.levelId)?.name || "—"}</Td>
                  <Td className="font-semibold">{fmtN(p.amount)}</Td>
                  <Td className="font-mono text-[11px] text-slate-400">{p.reference}</Td>
                  <Td><StatusBadge status={p.gatewayStatus === "success" ? "success" : p.gatewayStatus === "failed" ? "failed" : "pending"} /></Td>
                  <Td><StatusBadge status={p.status} /></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ================= TRANSACTIONS LEDGER ================= */

export function AdminTransactions() {
  const txs = useData(() => getWalletTx());
  const users = useData(getAllUsers);
  const [type, setType] = useState("all");
  const filtered = txs.filter((t) => type === "all" || t.type === type);

  return (
    <div>
      <PageHead title="Wallet Ledger" sub="Every credit and debit across all members — immutable and source-linked" />
      <div className="mb-4 flex flex-wrap gap-2">
        {["all", "task_reward", "referral_bonus", "withdrawal", "refund", "adjustment"].map((t) => (
          <button key={t} onClick={() => setType(t)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium capitalize transition-colors ${type === t ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand"}`}>
            {t.replace("_", " ")}
          </button>
        ))}
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState icon={<Receipt className="h-5 w-5" />} title="No ledger entries" sub="Entries appear when tasks are approved or payouts complete." />
        ) : (
          <Table head={["Date", "Member", "Type", "Description", "Amount", "Status", "Reference"]}>
            {filtered.slice(0, 100).map((t) => {
              const u = users.find((x) => x.id === t.userId);
              return (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(t.createdAt)}</Td>
                  <Td>{u?.fullName || "Unknown"}</Td>
                  <Td><Badge tone={t.direction === "credit" ? "green" : "slate"}>{t.type.replace("_", " ")}</Badge></Td>
                  <Td className="max-w-[200px] truncate text-xs">{t.description}</Td>
                  <Td className={`font-semibold ${t.direction === "credit" ? "text-brand" : "text-slate-700"}`}>
                    {t.direction === "credit" ? "+" : "−"}{fmtN(t.amount)}
                  </Td>
                  <Td><StatusBadge status={t.status} /></Td>
                  <Td className="font-mono text-[11px] text-slate-400">{t.reference}</Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ================= SETTINGS ================= */

export function AdminSettings() {
  const admin = useUser()!;
  const current = useSettings();
  const { busy, run } = useAction();
  const [s, setS] = useState({ ...current });

  return (
    <div>
      <PageHead title="Platform Settings" sub="Changes are audit-logged with your admin identity" />
      <Card className="max-w-2xl">
        <CardHeader title="General & financial rules" />
        <form
          className="space-y-4 p-5"
          onSubmit={async (e) => {
            e.preventDefault();
            await run(() => adminSaveSettings(admin.id, s), "Settings saved.");
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Platform name"><Input value={s.platformName} onChange={(e) => setS({ ...s, platformName: e.target.value })} /></Field>
            <Field label="Support email"><Input type="email" value={s.supportEmail} onChange={(e) => setS({ ...s, supportEmail: e.target.value })} /></Field>
          </div>
          <Field label="Support phone"><Input value={s.supportPhone} onChange={(e) => setS({ ...s, supportPhone: e.target.value })} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Min withdrawal (₦)"><Input type="number" min={100} value={s.minWithdrawal} onChange={(e) => setS({ ...s, minWithdrawal: Number(e.target.value) })} /></Field>
            <Field label="Withdrawal fee (₦)"><Input type="number" min={0} value={s.withdrawalFee} onChange={(e) => setS({ ...s, withdrawalFee: Number(e.target.value) })} /></Field>
            <Field label="Default referral %" hint="Per-level rates override"><Input type="number" min={0} max={30} step={0.5} value={s.referralPercentDefault} onChange={(e) => setS({ ...s, referralPercentDefault: Number(e.target.value) })} /></Field>
          </div>
          <Field label="Paystack public key" hint="Secret key lives server-side only">
            <Input value={s.paystackPublicKey} onChange={(e) => setS({ ...s, paystackPublicKey: e.target.value })} />
          </Field>
          <Button loading={busy}><Save className="h-4 w-4" /> Save settings</Button>
        </form>
      </Card>

      <Card className="mt-5 max-w-2xl p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <ShieldCheck className="h-4.5 w-4.5 text-brand" /> How this works
        </p>
        <p className="mt-2 text-xs leading-relaxed text-slate-500">
          All data lives in Supabase with Row Level Security. Privileged writes (levels, tasks, review
          approvals, payouts, settings) go through the <span className="font-mono text-[11px] text-slate-700">admin-action</span>{" "}
          edge function, which re-verifies your admin role server-side, writes with the service role, and
          appends an audit log entry in the same flow. Wallet credits and payout debits are idempotent, so
          repeated approvals can never double-pay.
        </p>
      </Card>
    </div>
  );
}

/* ================= AUDIT ================= */

export function AdminAudit() {
  const logs = useData(getAuditLog);
  return (
    <div>
      <PageHead title="Audit Logs" sub="Every administrative action on money and configuration" />
      <Card>
        {logs.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No admin actions yet" sub="Approvals, payouts and configuration changes will be recorded here." />
        ) : (
          <Table head={["Time", "Administrator", "Action", "Detail"]}>
            {logs.map((l) => (
              <tr key={l.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(l.createdAt)}</Td>
                <Td>{l.adminName}</Td>
                <Td><Badge tone="blue">{l.action}</Badge></Td>
                <Td className="max-w-[320px] truncate text-xs text-slate-500">{l.detail}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}


