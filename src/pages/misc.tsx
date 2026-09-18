import { useState } from "react";
import {
  Bell, Headset, KeyRound, Landmark, MailPlus, Save, Send,
} from "lucide-react";
import {
  Badge, Button, Card, CardHeader, EmptyState, Field, Input, NG_BANKS, PageHead,
  Select, StatusBadge, Td, Table, Textarea, fmtDateTime,
} from "../components/ui";
import {
  changePassword, createTicket, getMyTickets, getNotifications, markAllRead,
  saveBank, updateProfile,
} from "../lib/services";
import { useAction, useData, useSettings, useUser } from "../lib/store";

/* ================= PROFILE ================= */

export function Profile() {
  const user = useUser()!;
  const profileAction = useAction();
  const bankAction = useAction();
  const pwAction = useAction();

  const [p, setP] = useState({ fullName: user.fullName, phone: user.phone });
  const [bank, setBank] = useState({
    bank: user.bank?.bank || "", accountNumber: user.bank?.accountNumber || "", accountName: user.bank?.accountName || "",
  });
  const [pw, setPw] = useState({ old: "", next: "", confirm: "" });

  return (
    <div>
      <PageHead title="Profile" sub="Your account details and payout bank" />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Personal information" />
          <form
            className="space-y-4 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              await profileAction.run(() => updateProfile(user.id, p), "Profile updated.");
            }}
          >
            <Field label="Full name"><Input value={p.fullName} onChange={(e) => setP({ ...p, fullName: e.target.value })} /></Field>
            <Field label="Email address" hint={user.emailVerified ? "Verified" : "Not verified"}>
              <Input value={user.email} disabled className="bg-slate-50 text-slate-400" />
            </Field>
            <Field label="Phone number"><Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} /></Field>
            <Button loading={profileAction.busy}><Save className="h-4 w-4" /> Save changes</Button>
          </form>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Payout bank" sub="Pre-fill your withdrawals — verified again at payout time" />
            <form
              className="space-y-4 p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                await bankAction.run(() => saveBank(user.id, bank), "Bank details saved.");
              }}
            >
              <Field label="Bank">
                <Select value={bank.bank} onChange={(e) => setBank({ ...bank, bank: e.target.value })}>
                  <option value="">Select bank</option>
                  {NG_BANKS.map((b) => <option key={b}>{b}</option>)}
                </Select>
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Account number">
                  <Input value={bank.accountNumber} inputMode="numeric" placeholder="0123456789"
                    onChange={(e) => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                </Field>
                <Field label="Account name">
                  <Input value={bank.accountName} onChange={(e) => setBank({ ...bank, accountName: e.target.value })} placeholder="Name on account" />
                </Field>
              </div>
              <Button loading={bankAction.busy} variant="outline"><Landmark className="h-4 w-4" /> Save bank</Button>
            </form>
          </Card>

          <Card>
            <CardHeader title="Change password" />
            <form
              className="space-y-4 p-5"
              onSubmit={async (e) => {
                e.preventDefault();
                if (pw.next !== pw.confirm) {
                  pwAction.run(() => Promise.reject(new Error("New passwords do not match.")));
                  return;
                }
                const ok = await pwAction.run(() => changePassword(user.id, pw.old, pw.next), "Password changed.");
                if (ok !== null) setPw({ old: "", next: "", confirm: "" });
              }}
            >
              <Field label="Current password"><Input type="password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="New password" hint="Min 8 characters"><Input type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
                <Field label="Confirm new password"><Input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} /></Field>
              </div>
              <Button loading={pwAction.busy} variant="outline"><KeyRound className="h-4 w-4" /> Update password</Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ================= NOTIFICATIONS ================= */

const typeBadge: Record<string, { tone: "green" | "amber" | "red" | "slate" | "blue"; label: string }> = {
  account: { tone: "blue", label: "Account" },
  payment: { tone: "green", label: "Payment" },
  membership: { tone: "green", label: "Membership" },
  task: { tone: "blue", label: "Task" },
  referral: { tone: "green", label: "Referral" },
  withdrawal: { tone: "amber", label: "Withdrawal" },
  system: { tone: "slate", label: "System" },
};

export function Notifications() {
  const user = useUser()!;
  const rows = useData(() => getNotifications(user.id));

  return (
    <div>
      <PageHead
        title="Notifications"
        sub="Every important account event, in one place"
        action={rows.some((r) => !r.read) ? <Button size="sm" variant="outline" onClick={() => markAllRead(user.id)}>Mark all read</Button> : undefined}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={<Bell className="h-5 w-5" />} title="Nothing here yet" sub="Payments, task reviews, referrals and withdrawal updates will land here." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => (
              <li key={n.id} className={`flex items-start gap-4 px-5 py-4 ${n.read ? "" : "bg-brand-50/40"}`}>
                <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${n.read ? "bg-slate-200" : "bg-brand"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className={`text-sm ${n.read ? "font-medium text-slate-700" : "font-semibold text-slate-900"}`}>{n.title}</p>
                    <Badge tone={typeBadge[n.type]?.tone || "slate"}>{typeBadge[n.type]?.label || n.type}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{n.body}</p>
                  <p className="mt-1.5 text-[11px] text-slate-400">{fmtDateTime(n.createdAt)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/* ================= SUPPORT ================= */

export function Support() {
  const user = useUser()!;
  const settings = useSettings();
  const { busy, run } = useAction();
  const tickets = useData(() => getMyTickets(user.id));
  const [form, setForm] = useState({ subject: "Payment issue", message: "" });

  return (
    <div>
      <PageHead title="Support" sub={`${settings.supportEmail} · ${settings.supportPhone} · replies within 24h`} />
      <div className="grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader title="Open a ticket" />
          <form
            className="space-y-4 p-5"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(
                () => createTicket({ userId: user.id, name: user.fullName, email: user.email, ...form }),
                "Ticket opened — our team will reply to your email."
              );
              if (ok !== null) setForm({ subject: "Payment issue", message: "" });
            }}
          >
            <Field label="Subject">
              <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {["Payment issue", "Task review", "Withdrawal help", "Account problem", "General enquiry"].map((o) => <option key={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="Describe the issue">
              <Textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Include reference numbers if you have them…" />
            </Field>
            <Button loading={busy} className="w-full"><Send className="h-4 w-4" /> Submit ticket</Button>
          </form>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader title="Your tickets" />
          {tickets.length === 0 ? (
            <EmptyState icon={<Headset className="h-5 w-5" />} title="No tickets yet" sub="Open one and track its status here." />
          ) : (
            <Table head={["Date", "Subject", "Message", "Status"]}>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(t.createdAt)}</Td>
                  <Td className="font-medium">{t.subject}</Td>
                  <Td className="max-w-[260px] truncate text-xs text-slate-500">{t.message}</Td>
                  <Td><StatusBadge status={t.status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      </div>
      <Card className="mt-5 flex items-start gap-3 p-4">
        <MailPlus className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
        <p className="text-xs leading-relaxed text-slate-500">
          Prefer email? Write to <span className="font-semibold text-slate-700">{settings.supportEmail}</span> from
          your registered email address and include your account ID: <span className="font-mono text-[11px]">{user.id.slice(0, 8)}</span>
        </p>
      </Card>
    </div>
  );
}
