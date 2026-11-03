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
      <section className="border-b border-slate-100 bg-gradient-to-b from-brand-50/60 to-white overflow-hidden">
        <div className="mx-auto max-w-6xl px-4 py-16 md:px-6 md:py-24">
          <div className="grid items-center gap-12 md:grid-cols-2">
            <div>
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
            {/* hero image */}
            <div className="relative hidden md:block">
              <div className="absolute inset-0 -z-10 rounded-3xl bg-brand-100/50 blur-3xl" />
              <img
                src="https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=720&q=80"
                alt="African professional woman working on a laptop"
                className="relative w-full rounded-2xl object-cover shadow-2xl ring-1 ring-slate-200"
                style={{ aspectRatio: "4/3" }}
              />
              {/* floating earnings badge */}
              <div className="absolute -bottom-4 -left-4 flex items-center gap-3 rounded-2xl bg-white p-3.5 shadow-xl ring-1 ring-slate-100">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand text-white">
                  <Wallet className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-[11px] text-slate-400">Latest payout</p>
                  <p className="text-sm font-bold text-slate-900">₦14,200 paid</p>
                </div>
              </div>
              {/* floating task badge */}
              <div className="absolute -top-4 -right-4 flex items-center gap-2 rounded-2xl bg-white p-3 shadow-xl ring-1 ring-slate-100">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand">
                  <ClipboardCheck className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[11px] text-slate-400">Tasks reviewed</p>
                  <p className="text-sm font-bold text-slate-900">12,400+</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* honesty strip */}
      <section className="border-b border-slate-100">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-10 sm:grid-cols-3 md:px-6">
          {[
            { icon: ClipboardCheck, title: "Work-verified earnings", desc: "Every reward is credited only after a human reviewer approves your submission.", img: "https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=200&q=70" },
            { icon: Wallet, title: "Real ledger wallet", desc: "Pending, available and withdrawn balances are computed from an auditable ledger.", img: "https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=200&q=70" },
            { icon: Smartphone, title: "Paid to your bank", desc: "Withdraw to any Nigerian bank account once you reach the minimum threshold.", img: "https://images.unsplash.com/photo-1616803689943-5601631c7fec?w=200&q=70" },
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
        <div className="text-center mb-10">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
          <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Three steps. No promises, just process.</h2>
        </div>
        <Steps />
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
      <section className="relative border-t border-slate-100 overflow-hidden bg-brand">
        <img
          src="https://images.unsplash.com/photo-1531685250784-7569952593d2?w=1400&q=60"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-10 mix-blend-luminosity"
        />
        <div className="relative mx-auto max-w-6xl px-4 py-14 text-center md:px-6">
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
      {/* page header — clean, text-only */}
      <div className="mb-10 border-b border-slate-100 pb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand">How it works</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl">
          A transparent earning pipeline
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-500">
          No hidden mechanics. Here is exactly how money moves through EarnHub — and where it never comes from.
        </p>
      </div>
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
  const sections: [string, string | string[]][] = [
    [
      "1. About this agreement",
      `These Terms & Conditions ("Terms") govern your access to and use of ${s.platformName} ("the Platform", "we", "us"). By creating an account or clicking "I agree to the Terms & Conditions" during registration you confirm that you have read, understood and accepted these Terms in full. If you do not agree, do not register or use the Platform.`,
    ],
    [
      "2. Eligibility",
      [
        "You must be at least 18 years old to register.",
        "Registration is by referral only — you must provide a valid referral code issued by an existing member.",
        "You may hold only one account. Creating multiple accounts for the same person constitutes fraud and results in permanent suspension.",
        "You must be capable of entering into a legally binding contract under Nigerian law.",
      ],
    ],
    [
      "3. Nature of the Platform",
      `${s.platformName} is a digital micro-task platform. Paying a membership fee grants you access to a catalogue of tasks supplied by platform partners. Membership access does not constitute an investment, a deposit, a savings plan, a share of platform revenue, or any form of financial instrument. Earnings are not guaranteed. The Platform does not represent that any level of income will be achieved.`,
    ],
    [
      "4. Membership fees",
      [
        "Membership fees are one-time access fees, charged per level.",
        "Fees are non-refundable once membership has been activated and the task catalogue accessed.",
        "Payment is processed through Paystack. Membership activation occurs only after server-side payment verification; an unverified payment never activates a membership.",
        "Fee amounts may change at any time; the price displayed and confirmed at checkout applies to your purchase.",
        "Purchasing a higher membership level deactivates your current level; the difference in value is not refunded.",
      ],
    ],
    [
      "5. Earnings and wallet",
      [
        "Wallet credit is generated exclusively from: (a) task rewards for submissions approved through manual review, (b) single-level referral commissions on approved task rewards of your direct referrals, (c) Zentra (ZNTR) gold-coin commissions when your direct referrals complete Gold Mine cycles, and (d) membership registration commissions when your direct referrals purchase and activate a membership.",
        "Referral commissions apply only to direct referrals (one level). There are no multi-level or network commissions.",
        "Task reward rates are set by the Platform and may change without notice. Rates displayed at the time of submission apply to that submission.",
        "The Platform may reject any submission that does not meet stated requirements. Rejected work earns nothing. Review decisions are final, subject to a one-time support appeal.",
        "Wallet balances are computed from the live ledger. The Platform does not hold fiat currency on your behalf; balances represent an amount available for withdrawal, not a bank deposit.",
        "ZNTR gold coins are an in-platform unit only. They have no monetary value outside the Platform and cannot be transferred, sold, or exchanged except through the Platform's Gold Mine conversion feature.",
      ],
    ],
    [
      "6. Withdrawals",
      [
        "Withdrawals require a minimum balance as set by the Platform, and a minimum of three active referrals (referrals who have activated a paid membership).",
        "All withdrawals are processed manually to a Nigerian bank account in your name. Processing typically takes 24–48 hours on business days; this is an estimate, not a guarantee.",
        "The Platform may delay or reject withdrawals that fail anti-fraud, duplicate-account, or submission-quality checks. Rejected withdrawals return the held amount to your available balance.",
        "The Platform reserves the right to place a temporary hold on withdrawals during investigations.",
        "Providing incorrect bank details is your responsibility. The Platform is not liable for failed transfers resulting from incorrect details.",
      ],
    ],
    [
      "7. Acceptable use",
      [
        "One account per person. Sharing accounts or creating accounts on behalf of others is prohibited.",
        "All task submissions must be your own original work, completed honestly and in accordance with task instructions.",
        "Prohibited conduct includes: automated or bot-assisted submissions; plagiarism or copy-paste from other sources; fabricated screenshots, proofs or evidence; manipulating the referral system with fake accounts; attempting to reverse-engineer, scrape, or abuse the Platform's API or backend.",
        "Violations result in immediate account suspension, forfeiture of unapproved earnings, and may be reported to relevant Nigerian authorities where financial fraud is suspected.",
      ],
    ],
    [
      "8. Gold Mine feature",
      `The Gold Mine feature allows members to run timed cycles that credit ZNTR gold coins on completion. ZNTR coins may be converted to NGN at the Platform's published rate, subject to a conversion fee, minimum balance, and daily conversion limit. Conversion requests are subject to admin approval. The Platform may adjust Gold Mine parameters, rates, and availability at any time without prior notice.`,
    ],
    [
      "9. Intellectual property",
      `All content on the Platform — including task briefs, UI, branding and instructional material — belongs to ${s.platformName} or its licensors. You may not copy, distribute or resell any part of the Platform's content. Task submissions you upload grant the Platform a perpetual, royalty-free licence to use, store and review them for the purpose of operating the Platform.`,
    ],
    [
      "10. Account suspension and termination",
      [
        "We may suspend or terminate your account at any time for breach of these Terms, suspected fraud, inactivity exceeding 12 months, or at our discretion with reasonable notice.",
        "On suspension for fraud or Terms violation, unapproved earnings are forfeited. Approved earnings that have not yet been withdrawn may be released at our discretion following investigation.",
        "You may close your account by contacting support. Any approved balance will be paid out (subject to withdrawal minimums) before closure.",
      ],
    ],
    [
      "11. Limitation of liability",
      `The Platform is provided "as-is". Task availability fluctuates and we make no warranty regarding minimum earnings, uptime or uninterrupted access. To the fullest extent permitted by Nigerian law, ${s.platformName} is not liable for indirect, incidental or consequential losses arising from your use of the Platform. Our total aggregate liability to you for any claim shall not exceed the total membership fee you paid in the 12 months preceding the claim.`,
    ],
    [
      "12. Governing law",
      `These Terms are governed by the laws of the Federal Republic of Nigeria. Any dispute arising from these Terms shall be subject to the exclusive jurisdiction of the courts of Nigeria. If you have a complaint, contact our support team first — most issues are resolved within 48 hours.`,
    ],
    [
      "13. Changes to these Terms",
      `We may update these Terms at any time. The updated version will be published on this page with a revised date. Continued use of the Platform after changes are published constitutes acceptance of the new Terms. Material changes will be announced via in-app notification.`,
    ],
    [
      "14. Contact",
      `For questions about these Terms, contact us at ${s.supportEmail} or ${s.supportPhone}.`,
    ],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms &amp; Conditions</h1>
      <p className="mt-2 text-xs text-slate-400">Last updated: November 2026 · Effective immediately on registration</p>
      <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] leading-relaxed text-amber-800">
        <strong>Please read carefully.</strong> By registering on {s.platformName} you agree to be bound by these Terms. Membership fees are non-refundable. Earnings are not guaranteed.
      </p>
      <div className="mt-8 space-y-7">
        {sections.map(([title, body]) => (
          <div key={title}>
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {Array.isArray(body) ? (
              <ul className="mt-2 space-y-1.5 pl-1">
                {body.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PrivacyPage() {
  const s = useSettings();
  const sections: [string, string | string[]][] = [
    [
      "1. Introduction",
      `This Privacy Policy explains how ${s.platformName} ("we", "us", "the Platform") collects, uses, stores and protects your personal data when you register and use the Platform. We are committed to handling your information responsibly and in line with the Nigeria Data Protection Act 2023 (NDPA). By registering you consent to the practices described in this Policy.`,
    ],
    [
      "2. Data we collect",
      [
        "Identity & contact: full name, email address, phone number, and (when provided) a profile photo.",
        "Account data: referral code used at registration, referral code assigned to you, membership level, account creation date.",
        "Financial data: task earnings, wallet balance, withdrawal requests, bank name, account number, account name. Card details are processed directly by Paystack and never stored on our servers.",
        "Task submissions: work you submit, including any uploaded screenshots, documents or other proof files.",
        "Usage data: pages visited, actions taken within the app, browser type, device type, and approximate location (country/region) derived from IP address.",
        "Communications: support tickets, messages and any other correspondence you send us.",
      ],
    ],
    [
      "3. How we use your data",
      [
        "To create and manage your account, including identity verification.",
        "To operate your wallet and compute balances from the live transaction ledger.",
        "To review task submissions and determine whether rewards are payable.",
        "To process withdrawals to your nominated Nigerian bank account.",
        "To calculate and credit referral commissions, Zentra commissions and membership registration commissions.",
        "To send in-app notifications about your account activity, task updates and Platform announcements.",
        "To detect and prevent fraud, duplicate accounts, and abuse of the referral or task systems.",
        "To comply with applicable Nigerian financial regulations and payment-compliance obligations.",
        "To improve the Platform through aggregate, anonymised analytics.",
      ],
    ],
    [
      "4. Data sharing",
      [
        "We do not sell your personal data to third parties.",
        "Payment processing: Paystack processes card transactions. Their privacy policy governs that data.",
        "Bank transfers: your bank name, account number and account name are shared with our payment partner solely to execute your withdrawal.",
        "Service providers: we use trusted providers for hosting (Supabase), email notifications (Resend), and cloud infrastructure. These providers are contractually restricted from using your data for any other purpose.",
        "Legal obligations: we may disclose data if required by a Nigerian court order, regulatory body, or law enforcement authority.",
        "Referral display: the Platform may display a member's first name (masked) in referral statistics visible to their referrer. Full names are never shown to other members.",
      ],
    ],
    [
      "5. Data retention",
      [
        "Account and wallet data is retained for as long as your account is active and for seven years after closure, in line with Nigerian financial-record retention requirements.",
        "Task submission files are retained for 12 months after submission date, then deleted unless disputed.",
        "Support correspondence is retained for three years.",
        "You may request deletion of non-financial data at any time; financial transaction records cannot be deleted before the statutory retention period expires.",
      ],
    ],
    [
      "6. Security",
      `We use industry-standard security measures including HTTPS encryption in transit, row-level security on the database, hashed passwords, and restricted access to production systems. No internet-based transmission is 100% secure; we cannot guarantee absolute security, but we take reasonable steps to protect your data and will notify you of a data breach affecting your account within 72 hours of discovery.`,
    ],
    [
      "7. Your rights (NDPA 2023)",
      [
        "Access: request a copy of the personal data we hold about you.",
        "Correction: ask us to correct inaccurate or incomplete data.",
        "Deletion: request deletion of your personal data (subject to legal retention obligations).",
        "Portability: receive your data in a structured, machine-readable format.",
        "Objection: object to processing based on legitimate interest.",
        "Withdraw consent: where processing is based on consent (e.g. marketing emails), you may withdraw consent at any time.",
        `To exercise any of these rights, contact us at ${s.supportEmail}. We will respond within 30 days.`,
      ],
    ],
    [
      "8. Cookies and tracking",
      `The Platform uses session storage and local storage in your browser to maintain your login session and preferences. We do not use third-party advertising cookies. Usage analytics are collected in aggregate and do not identify you individually.`,
    ],
    [
      "9. Children",
      `The Platform is not directed at persons under 18. We do not knowingly collect data from minors. If you believe a minor has registered, contact us immediately and we will delete the account.`,
    ],
    [
      "10. Changes to this Policy",
      `We may update this Policy periodically. The current version is always available at this URL. Material changes will be announced via in-app notification at least 14 days before taking effect.`,
    ],
    [
      "11. Contact",
      `Data protection enquiries: ${s.supportEmail} · ${s.supportPhone}. For formal complaints, you may also contact the Nigeria Data Protection Commission (NDPC) at ndpb.gov.ng.`,
    ],
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-14 md:px-6">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
      <p className="mt-2 text-xs text-slate-400">Last updated: November 2026 · Applies to all registered members</p>
      <div className="mt-8 space-y-7">
        {sections.map(([title, body]) => (
          <div key={title}>
            <h2 className="text-sm font-bold text-slate-900">{title}</h2>
            {Array.isArray(body) ? (
              <ul className="mt-2 space-y-1.5 pl-1">
                {body.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
            )}
          </div>
        ))}
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
