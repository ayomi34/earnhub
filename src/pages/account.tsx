import { useMemo, useState } from "react";
import {
  ArrowUpRight, BadgeCheck, Check, Coins, CreditCard,
  Hourglass, Info, Landmark, Receipt, Share2, TrendingUp, Users, Wallet,
} from "lucide-react";
import { Link } from "../components/nav";
import PaystackCheckout from "../components/Paystack";
import {
  Badge, Button, Card, CardHeader, CopyButton, EmptyState, Field, Input, Modal,
  NG_BANKS, PageHead, Select, Stat, StatusBadge, Td, Table, fmtDate, fmtDateTime, fmtN,
} from "../components/ui";
import {
  getBalances, getMySubmissions, getPayments, getReferralRows, getReferralStats,
  getUserLevel, getWalletTx, getWithdrawals, initializePayment, listLevels, requestWithdrawal,
} from "../lib/services";
import { navigate, useAction, useData, useSettings, useUser } from "../lib/store";
import type { MembershipLevel, Payment } from "../lib/types";

/* ================= WALLET ================= */

export function WalletPage() {
  const user = useUser()!;
  const settings = useSettings();
  const bal = useData(() => getBalances(user.id));
  const withdrawals = useData(() => getWithdrawals(user.id));
  const [open, setOpen] = useState(false);

  return (
    <div>
      <PageHead
        title="Wallet"
        sub="Balances are computed live from your ledger — pending withdrawals are held, never silently deducted."
        action={<Button onClick={() => setOpen(true)}><ArrowUpRight className="h-4 w-4" /> Withdraw</Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Available balance" value={fmtN(bal.available)} tone="brand" icon={<Wallet className="h-4.5 w-4.5" />} />
        <Stat label="Pending earnings" value={fmtN(bal.pending)} icon={<Hourglass className="h-4.5 w-4.5" />} sub="awaiting task review" />
        <Stat label="Total earned" value={fmtN(bal.totalEarned)} icon={<TrendingUp className="h-4.5 w-4.5" />} />
        <Stat label="Total withdrawn" value={fmtN(bal.totalWithdrawn)} icon={<ArrowUpRight className="h-4.5 w-4.5" />} />
      </div>

      <Card className="mt-5">
        <CardHeader
          title="Withdrawal history"
          sub={`Minimum withdrawal ${fmtN(settings.minWithdrawal)}${settings.withdrawalFee ? ` · fee ${fmtN(settings.withdrawalFee)}` : " · no fees"} · manual processing, usually within 24–48h`}
        />
        {withdrawals.length === 0 ? (
          <EmptyState
            icon={<Landmark className="h-5 w-5" />}
            title="No withdrawals yet"
            sub={`Once your available balance reaches ${fmtN(settings.minWithdrawal)}, you can request a payout to any Nigerian bank.`}
          />
        ) : (
          <Table head={["Reference", "Bank", "Amount", "Fee", "Status", "Requested", "Note"]}>
            {withdrawals.map((w) => (
              <tr key={w.id}>
                <Td className="font-mono text-xs">{w.reference}</Td>
                <Td>
                  <span className="block text-[13px] font-medium">{w.bank}</span>
                  <span className="text-xs text-slate-400">{w.accountNumber} · {w.accountName}</span>
                </Td>
                <Td className="font-semibold">{fmtN(w.amount)}</Td>
                <Td>{w.fee ? fmtN(w.fee) : "—"}</Td>
                <Td><StatusBadge status={w.status} /></Td>
                <Td className="text-xs text-slate-400">{fmtDate(w.createdAt)}</Td>
                <Td className="max-w-[180px] text-xs text-slate-500">
                  {w.status === "paid" ? `Paid · ${w.payoutRef}` : w.note || "—"}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <WithdrawModal open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function WithdrawModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const user = useUser()!;
  const settings = useSettings();
  const bal = useData(() => getBalances(user.id));
  const { busy, run } = useAction();
  const [form, setForm] = useState({
    bank: user.bank?.bank || "", accountNumber: user.bank?.accountNumber || "",
    accountName: user.bank?.accountName || "", amount: "" as string | number,
  });

  const amount = Math.floor(Number(form.amount) || 0);
  const valid =
    form.bank && /^\d{10}$/.test(form.accountNumber) && form.accountName.trim().length >= 3 &&
    amount >= settings.minWithdrawal && amount + settings.withdrawalFee <= bal.available;

  const submit = async () => {
    const ok = await run(
      () => requestWithdrawal(user.id, { bank: form.bank, accountNumber: form.accountNumber, accountName: form.accountName, amount }),
      "Withdrawal requested — funds are now on hold pending review."
    );
    if (ok) onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Request withdrawal" wide>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-brand-50 px-4 py-3">
        <span className="text-sm text-green-900">Available balance</span>
        <span className="text-lg font-bold text-green-900">{fmtN(bal.available)}</span>
      </div>
      <div className="space-y-4">
        <Field label="Bank">
          <Select value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })}>
            <option value="">Select your bank</option>
            {NG_BANKS.map((b) => <option key={b}>{b}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Account number" hint="10 digits — verified with the bank at payout">
            <Input value={form.accountNumber} inputMode="numeric" maxLength={10}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value.replace(/\D/g, "").slice(0, 10) })}
              placeholder="0123456789" />
          </Field>
          <Field label="Account name" hint="Must match the bank record">
            <Input value={form.accountName} onChange={(e) => setForm({ ...form, accountName: e.target.value })} placeholder="Name on account" />
          </Field>
        </div>
        <Field label={`Amount (min ${fmtN(settings.minWithdrawal)})`}>
          <Input type="number" min={settings.minWithdrawal} value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
        </Field>
        {amount > bal.available && (
          <p className="text-xs font-medium text-red-600">Amount exceeds your available balance.</p>
        )}
        <div className="rounded-lg bg-slate-50 p-3.5 text-xs leading-relaxed text-slate-500">
          <p className="flex justify-between"><span>You receive</span><span className="font-semibold text-slate-800">{fmtN(Math.max(0, amount))}</span></p>
          <p className="mt-1 flex justify-between"><span>Processing fee</span><span>{settings.withdrawalFee ? fmtN(settings.withdrawalFee) : "Free"}</span></p>
          <p className="mt-2 border-t border-slate-200 pt-2">
            Requested funds are held (not deducted) until an admin processes the payout. One active withdrawal at a time.
          </p>
        </div>
        <Button loading={busy} disabled={!valid} className="w-full" onClick={submit}>
          Request withdrawal of {fmtN(Math.max(0, amount))}
        </Button>
      </div>
    </Modal>
  );
}

/* ================= TRANSACTIONS ================= */

type TxRow = {
  id: string; date: number; type: string; desc: string; amount: number;
  credit: boolean; status: string; reference: string;
};

export function Transactions() {
  const user = useUser()!;
  const [filter, setFilter] = useState("All");

  const rows = useData((): TxRow[] => {
    const payments = getPayments(user.id)
      .filter((p) => p.status !== "abandoned")
      .map((p): TxRow => ({
        id: p.id, date: p.createdAt, type: "Membership Payment",
        desc: `Membership level purchase`, amount: p.amount, credit: false,
        status: p.status, reference: p.reference,
      }));
    const wallet = getWalletTx(user.id).map((t): TxRow => ({
      id: t.id, date: t.createdAt,
      type: (({ task_reward: "Task Reward", referral_bonus: "Referral Bonus", withdrawal: "Withdrawal", refund: "Refund", adjustment: "Adjustment", spin_reward: "Spin Reward", feud_reward: "Survey Feud Reward" } as const)[t.type] || "Reward"),
      desc: t.description, amount: t.amount, credit: t.direction === "credit",
      status: t.status, reference: t.reference,
    }));
    return [...payments, ...wallet].sort((a, b) => b.date - a.date);
  });

  const types = ["All", "Membership Payment", "Task Reward", "Referral Bonus", "Spin Reward", "Withdrawal", "Refund", "Adjustment"];
  const filtered = useMemo(
    () => (filter === "All" ? rows : rows.filter((r) => r.type === filter)),
    [rows, filter]
  );

  return (
    <div>
      <PageHead title="Transactions" sub="Your complete financial ledger on EarnHub" />
      <div className="mb-4 flex flex-wrap gap-2">
        {types.map((t) => (
          <button key={t} onClick={() => setFilter(t)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${filter === t ? "bg-brand text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-brand hover:text-brand"}`}>
            {t}
          </button>
        ))}
      </div>
      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-5 w-5" />}
            title="No transactions"
            sub="Payments, rewards, commissions and withdrawals will all appear here with references."
            action={<Link to="/app/earn"><Button size="sm">Go earn</Button></Link>}
          />
        ) : (
          <Table head={["Date", "Type", "Description", "Amount", "Status", "Reference"]}>
            {filtered.map((r) => (
              <tr key={r.id}>
                <Td className="whitespace-nowrap text-xs text-slate-400">{fmtDateTime(r.date)}</Td>
                <Td><Badge tone={r.type === "Task Reward" || r.type === "Referral Bonus" ? "green" : "slate"}>{r.type}</Badge></Td>
                <Td className="max-w-[220px] truncate">{r.desc}</Td>
                <Td className={`whitespace-nowrap font-semibold ${r.credit ? "text-brand" : "text-slate-700"}`}>
                  {r.credit ? "+" : "−"}{fmtN(r.amount)}
                </Td>
                <Td><StatusBadge status={r.status} /></Td>
                <Td className="whitespace-nowrap font-mono text-[11px] text-slate-400">{r.reference}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ================= REFERRALS ================= */

export function Referrals() {
  const user = useUser()!;
  const stats = useData(() => getReferralStats(user.id));
  const rows = useData(() => getReferralRows(user.id));
  const code = user.referralCode;

  return (
    <div>
      <PageHead title="Referrals" sub="Single-level commissions — paid only when your referral's own task work is approved." />
      <Card className="mb-5 p-5">
        <p className="text-[13px] font-medium text-slate-700">Your referral code</p>
        <div className="mt-2.5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <Share2 className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="font-mono text-lg font-bold tracking-widest text-slate-800">{code}</span>
          </div>
          <CopyButton text={code} label="Copy code" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          New members must enter this code during registration — accounts cannot be created without it.
          Your rate: {stats.percent}% of each approved task reward.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4">
        <Stat label="Total referrals" value={String(stats.total)} icon={<Users className="h-4.5 w-4.5" />} />
        <Stat label="Active referrals" value={String(stats.active)} icon={<BadgeCheck className="h-4.5 w-4.5" />} sub="membership activated" />
        <Stat label="Referral earnings" value={fmtN(stats.earned)} tone="brand" icon={<Coins className="h-4.5 w-4.5" />} />
        <Stat label="Pending commission" value={fmtN(stats.pending)} icon={<Hourglass className="h-4.5 w-4.5" />} sub="from referrals' submissions in review" />
      </div>

      <Card className="mt-5">
        <CardHeader title="Your referrals" />
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-5 w-5" />}
            title="No referrals yet"
            sub="Share your code. When someone registers with it and activates a membership, they appear here."
            action={<CopyButton text={code} label="Copy your code" />}
          />
        ) : (
          <Table head={["Member", "Joined", "Status", "Your commission earned"]}>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td className="font-medium">{r.name}</Td>
                <Td className="text-xs text-slate-400">{fmtDate(r.joined)}</Td>
                <Td>{r.status === "active" ? <Badge tone="green">Active</Badge> : <Badge tone="amber">Registered</Badge>}</Td>
                <Td className="font-semibold text-brand">{fmtN(r.earned)}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ================= MEMBERSHIP ================= */

export function MembershipPage() {
  const user = useUser()!;
  const level = useData(() => getUserLevel(user.id));
  const levels = useData(() => listLevels());
  const payments = useData(() => getPayments(user.id));
  const { busy, run } = useAction();
  const usersTasksToday = useData(() => getMySubmissions(user.id).filter((s) => {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    return s.startedAt >= d.getTime() && s.status !== "rejected";
  }).length);
  const [selected, setSelected] = useState<MembershipLevel | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  const buy = async (l: MembershipLevel) => {
    setSelected(l);
    const p = await run(() => initializePayment(user.id, l.id));
    if (p) setPayment(p);
  };

  return (
    <div>
      <PageHead title="Membership" sub="Your access level to the task catalogue" />

      {level ? (
        <Card className="mb-5 overflow-hidden">
          <div className="bg-brand p-5 text-white">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-green-100">Active membership</p>
                <p className="mt-1 text-2xl font-bold">{level.name}</p>
              </div>
              <Badge tone="green"><Check className="h-3 w-3" /> Activated</Badge>
            </div>
          </div>
          <div className="grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs text-slate-400">Daily tasks used</p>
              <p className="mt-1 font-semibold text-slate-900">{usersTasksToday} / {level.taskLimitPerDay}</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (usersTasksToday / level.taskLimitPerDay) * 100)}%` }} />
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-400">Referral commission</p>
              <p className="mt-1 font-semibold text-slate-900">{level.referralCommission}% per approved task</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Support tier</p>
              <p className="mt-1 font-semibold text-slate-900">{level.price >= 15000 ? "Priority" : "Standard"}</p>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="mb-5 flex items-start gap-3 border-amber-200 bg-amber-50 p-5">
          <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div>
            <p className="text-sm font-semibold text-amber-900">No active membership</p>
            <p className="mt-1 text-[13px] leading-relaxed text-amber-700">
              Choose a level below. Payment is verified with Paystack before activation — an unverified payment never activates anything.
            </p>
          </div>
        </Card>
      )}

      <h3 className="mb-3 text-sm font-semibold text-slate-900">{level ? "Upgrade or switch level" : "Available levels"}</h3>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {levels.map((l) => {
          const current = level?.id === l.id;
          return (
            <Card key={l.id} className={`flex flex-col p-5 ${current ? "border-brand ring-1 ring-brand" : ""}`}>
              <div className="flex items-baseline justify-between">
                <h4 className="font-semibold text-slate-900">{l.name}</h4>
                {current && <Badge tone="green">Current</Badge>}
              </div>
              <p className="mt-2 text-xl font-bold text-slate-900">{fmtN(l.price)}</p>
              <p className="mt-1 text-xs text-slate-500">{l.taskLimitPerDay} tasks/day · {l.referralCommission}% commission</p>
              <ul className="mt-3 flex-1 space-y-1.5">
                {l.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> {f}
                  </li>
                ))}
              </ul>
              <Button size="sm" variant={current ? "outline" : "primary"} disabled={current} loading={busy && selected?.id === l.id}
                className="mt-4 w-full" onClick={() => buy(l)}>
                {current ? "Your level" : `Pay ${fmtN(l.price)}`}
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader title="Membership payments" sub="Only server-verified payments activate a level" />
        {payments.length === 0 ? (
          <EmptyState icon={<CreditCard className="h-5 w-5" />} title="No payments yet" />
        ) : (
          <Table head={["Date", "Level", "Amount", "Reference", "Status"]}>
            {payments.map((p) => (
              <tr key={p.id}>
                <Td className="text-xs text-slate-400">{fmtDateTime(p.createdAt)}</Td>
                <Td>{levels.find((l) => l.id === p.levelId)?.name || "Level"}</Td>
                <Td className="font-semibold">{fmtN(p.amount)}</Td>
                <Td className="font-mono text-[11px] text-slate-400">{p.reference}</Td>
                <Td><StatusBadge status={p.status} /></Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <PaystackCheckout
        payment={payment}
        level={selected}
        email={user.email}
        onClose={() => setPayment(null)}
        onDone={(ok) => {
          setPayment(null);
          if (ok) navigate("/app");
        }}
      />
    </div>
  );
}
