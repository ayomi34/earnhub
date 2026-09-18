import { useState } from "react";
import {
  ArrowRight, BadgeCheck, Check, ClipboardCheck, Coins, FileText, HelpCircle,
  Mail, Minus, Phone, Plus, ShieldCheck, Smartphone, UserPlus, Wallet,
} from "lucide-react";
import { Link } from "../components/nav";
import { Badge, Button, Card, Field, Input, Select, Textarea, fmtN } from "../components/ui";
import { createTicket, listLevels } from "../lib/services";
import { useAction, useData, useSettings, useUser } from "../lib/store";

/* ---------- shared bits ---------- */

export function LevelCards({ compact = false }: { compact?: boolean }) {
  const levels = useData(() => listLevels());
  const user = useUser();
  return (
    <div className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-4" : "sm:grid-cols-2"}`}>
      {levels.map((l, i) => (
        <Card
          key={l.id}
          className={`relative flex flex-col p-5 ${i === 1 ? "border-brand ring-1 ring-brand" : ""}`}
        >
          {i === 1 && (
            <span className="absolute -top-2.5 left-5 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              Popular
            </span>
          )}
          <div className="flex items-baseline justify-between">
            <h3 className="font-semibold text-slate-900">{l.name}</h3>
            <Badge tone="green">{l.taskLimitPerDay} tasks/day</Badge>
          </div>
          <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900">
            {fmtN(l.price)}
            <span className="ml-1 text-xs font-normal text-slate-400">one-time access</span>
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{l.description}</p>
          <ul className="mt-4 flex-1 space-y-2">
            {l.features.slice(0, compact ? 4 : l.features.length).map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] text-slate-600">
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" /> {f}
              </li>
            ))}
          </ul>
          <Link
            to={user ? "/app/membership" : "/register"}
            className={`mt-5 block rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${
              i === 1 ? "bg-brand text-white hover:bg-brand-dark" : "border border-slate-300 text-slate-700 hover:border-brand hover:text-brand"
            }`}
          >
            Choose {l.name}
          </Link>
        </Card>
      ))}
    </div>
  );
}

const STEPS = [
  {
    icon: UserPlus,
    title: "Register",
    desc: "Create your free account in under two minutes with your name, email and phone number.",
  },
  {
    icon: BadgeCheck,
    title: "Choose a membership",
    desc: "Pick a level from ₦6,500 to unlock its task catalogue. Membership buys access — never guaranteed returns.",
  },
  {
    icon: Coins,
    title: "Complete tasks & withdraw",
    desc: "Do real digital work. Once a reviewer approves your submission, the reward lands in your wallet — withdraw to any Nigerian bank.",
  },
];

export function Steps() {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {STEPS.map((s, i) => (
        <Card key={s.title} className="p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <s.icon className="h-5 w-5" />
            </span>
            <span className="font-mono text-xs font-semibold text-slate-300">STEP {i + 1}</span>
          </div>
          <h3 className="mt-4 font-semibold text-slate-900">{s.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.desc}</p>
        </Card>
      ))}
    </div>
  );
}

const FAQS = [
  {
    q: "Is EarnHub an investment or Ponzi scheme?",
    a: "No. Your membership payment buys access to a task catalogue and platform features — it is not a deposit and it is never returned to you with 'profit'. Every naira in your wallet comes from a specific, approved task reward or a referral commission on someone else's approved work. There are no guaranteed returns of any kind.",
  },
  {
    q: "What kind of tasks will I do?",
    a: "Real micro-work from verified partners: data verification, surveys, transcription, website testing, research and categorisation. Each task shows its reward, requirements and estimated time before you start.",
  },
  {
    q: "How do withdrawals work?",
    a: "Once your available balance reaches the minimum (shown on your Wallet page), you can request a withdrawal to any Nigerian bank account. Requests are reviewed and paid manually — you'll see each status (pending, processing, paid) in real time. Requested funds are held, never silently deducted.",
  },
  {
    q: "How does the referral programme work?",
    a: "Share your unique referral link. Once a person you referred activates a membership, you earn a small commission each time one of their task submissions is approved. It is single-level, paid only on real work, and commission rates are set by the platform — it is not a multi-level scheme.",
  },
  {
    q: "Why is there a membership fee at all?",
    a: "The fee covers platform operations: sourcing verified tasks, manual quality review of submissions, payment processing and support. It also filters out bots and bad-faith actors, which keeps reward rates fair for genuine workers.",
  },
  {
    q: "When do I get credited for a task?",
    a: "Submissions go to manual review (usually within 24 hours). Only approved submissions are credited to your available balance. Rejected submissions include a reason so you can improve on the next task.",
  },
];

export function FaqList({ items = FAQS }: { items?: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="space-y-2.5">
      {items.map((f, i) => (
        <Card key={i} className="overflow-hidden">
          <button onClick={() => setOpen(open === i ? null : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left">
            <span className="text-sm font-semibold text-slate-800">{f.q}</span>
            {open === i ? <Minus className="h-4 w-4 shrink-0 text-brand" /> : <Plus className="h-4 w-4 shrink-0 text-slate-400" />}
          </button>
          {open === i && <p className="border-t border-slate-100 px-5 py-4 text-sm leading-relaxed text-slate-500">{f.a}</p>}
        </Card>
      ))}
    </div>
  );
}

/* ---------- pages ---------- */

export function Landing() {
  const levels = useData(() => listLevels());
  const min = levels.length ? Math.min(...levels.map((l) => l.price)) : 6500;
  return (
    <>
      {/* hero */}
      <section className="border-b border-slate-100 bg-gradient-to-b from-brand-50/60 to-white">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="max-w-2xl">
            <Badge tone="green">
              <ShieldCheck className="h-3 w-3" /> Legitimate tasks · Manual review · Bank payouts
            </Badge>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-tight text-slate-900 md:text-[52px]">
              Turn Your Time Into <span className="text-brand">Digital Earnings</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-slate-600 md:text-lg">
              Complete legitimate digital tasks, earn rewards, and manage your
              earnings from one simple platform.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-dark">
                Get Started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/how-it-works" className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 transition-colors hover:border-brand hover:text-brand">
                How It Works
              </Link>
            </div>
            <p className="mt-5 text-xs text-slate-400">
              Membership from {fmtN(min)} · Withdraw to any Nigerian bank from the minimum threshold
            </p>
          </div>
        </div>
      </section>

      {/* honesty strip */}
      <section className="border-b border-slate-100">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 md:px-6">
          {[
            { icon: ClipboardCheck, title: "Work-verified earnings", desc: "Every reward is credited only after a human reviewer approves your submission." },
            { icon: Wallet, title: "Real ledger wallet", desc: "Pending, available and withdrawn balances are computed from an auditable ledger." },
            { icon: Smartphone, title: "Paid to your bank", desc: "Withdraw to any Nigerian bank account once you reach the minimum threshold." },
          ].map((f) => (
            <div key={f.title} className="flex gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
                <f.icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{f.title}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* steps */}
      <section className="mx-auto max-w-6xl px-4 py-16 md:px-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
        <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Three steps. No promises, just process.</h2>
        <div className="mt-8"><Steps /></div>
      </section>

      {/* levels */}
      <section className="border-y border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-brand">Membership levels</p>
              <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Pick the access that fits you</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-500">
                Every level unlocks its task catalogue and daily limits. Higher levels see
                higher-value tasks — nothing earns automatically.
              </p>
            </div>
            <Link to="/levels" className="text-sm font-semibold text-brand hover:underline">Compare all levels</Link>
          </div>
          <div className="mt-8"><LevelCards compact /></div>
        </div>
      </section>

      {/* faq */}
      <section className="mx-auto max-w-3xl px-4 py-16 md:px-6">
        <div className="text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">FAQ</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Honest answers</h2>
        </div>
        <div className="mt-8"><FaqList items={FAQS.slice(0, 4)} /></div>
        <div className="mt-6 text-center">
          <Link to="/faq" className="text-sm font-semibold text-brand hover:underline">See all questions</Link>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-slate-100 bg-brand">
        <div className="mx-auto max-w-6xl px-4 py-14 text-center md:px-6">
          <h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">Ready to do real work for real naira?</h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-green-100">
            Create your account, verify your email, and pick a membership level to open your task catalogue.
          </p>
          <Link to="/register" className="mt-7 inline-flex items-center gap-2 rounded-lg bg-white px-6 py-3.5 text-sm font-semibold text-brand transition-colors hover:bg-green-50">
            Create free account <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-14 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">A transparent earning pipeline</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
        No hidden mechanics. Here is exactly how money moves through EarnHub — and where it never comes from.
      </p>
      <div className="mt-10"><Steps /></div>

      <div className="mt-12 space-y-4">
        {[
          {
            title: "Where your earnings come from",
            points: [
              "Approved task rewards — a reviewer checks every submission against the task requirements",
              "Referral commissions — a platform-set percentage credited only when your referral's own task work is approved",
            ],
            good: true,
          },
          {
            title: "Where earnings never come from",
            points: [
              "Your membership fee — it buys access to the catalogue, full stop. It is not a deposit and earns no return",
              "Other members' fees — there is no redistribution of joining payments between users",
            ],
            good: false,
          },
        ].map((b) => (
          <Card key={b.title} className="p-6">
            <h3 className="font-semibold text-slate-900">{b.title}</h3>
            <ul className="mt-3 space-y-2.5">
              {b.points.map((p) => (
                <li key={p} className="flex items-start gap-2.5 text-sm leading-relaxed text-slate-600">
                  {b.good ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand" /> : <Minus className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />}
                  {p}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="mt-10 text-center">
        <Link to="/register" className="inline-flex items-center gap-2 rounded-lg bg-brand px-6 py-3 text-sm font-semibold text-white hover:bg-brand-dark">
          Get Started <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

export function LevelsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 md:px-6">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand">Membership levels</p>
      <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">Choose your access level</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-500">
        Your level determines which tasks you can see and how many you can submit per day.
        Levels are set by the platform administrator and can change — you always pay the price shown at checkout.
      </p>
      <div className="mt-10"><LevelCards /></div>
      <Card className="mt-8 flex items-start gap-3 border-amber-200 bg-amber-50 p-5">
        <FileText className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <p className="text-[13px] leading-relaxed text-amber-800">
          Membership is non-refundable access to platform features. It does not entitle you to
          any income by itself. Task rewards vary by availability, quality and review outcomes.
          Read the <Link to="/terms" className="font-semibold underline">Terms & Conditions</Link> before paying.
        </p>
      </Card>
    </div>
  );
}

export function FaqPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand"><HelpCircle className="h-5 w-5" /></span>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Frequently asked questions</h1>
      </div>
      <div className="mt-8"><FaqList /></div>
      <p className="mt-8 text-center text-sm text-slate-500">
        Still stuck? <Link to="/contact" className="font-semibold text-brand hover:underline">Talk to support</Link>
      </p>
    </div>
  );
}

export function TermsPage() {
  const s = useSettings();
  const sections = [
    ["1. Service description", `${s.platformName} is a digital micro-task platform. Members pay a one-time access fee to unlock a catalogue of tasks supplied by platform partners. Membership access does not constitute an investment, deposit, savings plan or share in platform revenue, and no income is guaranteed by holding a membership.`],
    ["2. Earnings", "Wallet credit is generated exclusively from: (a) task rewards for submissions approved through manual review, and (b) single-level referral commissions calculated on approved task work of direct referrals at rates set by the platform. The platform may reject submissions that do not meet stated requirements; rejected work earns nothing and decisions are final subject to support review."],
    ["3. Membership fees", "Membership fees are non-refundable once the catalogue has been accessed. Fees may differ between levels and may be changed by the platform at any time; the price displayed and paid at checkout applies to your purchase. Failure of payment verification leaves membership inactive."],
    ["4. Withdrawals", "Withdrawals are subject to a minimum threshold, account verification and manual processing. The platform may delay or reject withdrawals that fail fraud, duplicate-account or quality checks. Rejected withdrawals return the held amount to the available balance. Processing times are estimates, not guarantees."],
    ["5. Acceptable use", "One account per person. Automated submissions, plagiarism, fabricated proof, multi-accounting and attempts to manipulate the ledger or referral system result in suspension and forfeiture of unapproved earnings."],
    ["6. Liability", "The platform is provided as-is. Task availability fluctuates and the platform does not warrant any minimum earning level. Nothing on this platform is financial advice."],
  ];
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms & Conditions</h1>
      <p className="mt-2 text-xs text-slate-400">Last updated: January 2026</p>
      <div className="mt-8 space-y-6">
        {sections.map(([t, b]) => (
          <div key={t}>
            <h2 className="text-sm font-semibold text-slate-900">{t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{b}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  const s = useSettings();
  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-xs text-slate-400">Last updated: January 2026</p>
      <div className="mt-8 space-y-6 text-sm leading-relaxed text-slate-600">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Data we collect</h2>
          <p className="mt-2">Account details (name, email, phone), task submissions and proofs, withdrawal bank details, and payment references. Card details are processed directly by Paystack and never touch {s.platformName} servers.</p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-slate-900">How we use it</h2>
          <p className="mt-2">To operate your wallet and ledger, review submissions, process payouts via your bank, prevent fraud and meet payment-compliance obligations. We do not sell personal data. Referral leaderboards mask member names.</p>
        </div>
        <div>
          <h2 className="text-sm semibold text-slate-900 font-semibold">Your rights</h2>
          <p className="mt-2">You may request account data export or deletion (subject to financial-record retention required by Nigerian regulation) via {s.supportEmail}.</p>
        </div>
      </div>
    </div>
  );
}

export function ContactPage() {
  const s = useSettings();
  const { busy, run } = useAction();
  const [sent, setSent] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", subject: "General enquiry", message: "" });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(
      () => createTicket({ userId: null, ...form }),
      "Message received — support replies within 24 hours."
    );
    if (ok !== null) setSent(true);
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-14 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Contact support</h1>
      <div className="mt-8 grid gap-6 md:grid-cols-5">
        <div className="space-y-4 md:col-span-2">
          {[
            { icon: Mail, label: "Email", value: s.supportEmail },
            { icon: Phone, label: "Phone", value: s.supportPhone },
          ].map((c) => (
            <Card key={c.label} className="flex items-center gap-3.5 p-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand"><c.icon className="h-5 w-5" /></span>
              <div>
                <p className="text-xs text-slate-400">{c.label}</p>
                <p className="text-sm font-medium text-slate-800">{c.value}</p>
              </div>
            </Card>
          ))}
          <Card className="p-4">
            <p className="text-xs text-slate-400">Support hours</p>
            <p className="mt-1 text-sm font-medium text-slate-800">Mon–Sat, 8:00–20:00 WAT</p>
          </Card>
        </div>
        <Card className="p-5 md:col-span-3">
          {sent ? (
            <div className="flex flex-col items-center py-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100"><Check className="h-6 w-6 text-brand" /></span>
              <p className="mt-4 font-semibold text-slate-900">Message sent</p>
              <p className="mt-1 text-sm text-slate-500">Our team will reply to {form.email} shortly.</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Full name"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ada Obi" /></Field>
                <Field label="Email"><Input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" /></Field>
              </div>
              <Field label="Subject">
                <Select value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                  {["General enquiry", "Payment issue", "Task review", "Withdrawal help", "Account problem"].map((o) => <option key={o}>{o}</option>)}
                </Select>
              </Field>
              <Field label="Message"><Textarea required value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="How can we help?" /></Field>
              <Button loading={busy} className="w-full sm:w-auto">Send message</Button>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
