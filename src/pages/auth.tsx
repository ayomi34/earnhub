import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Check, KeyRound, MailCheck } from "lucide-react";
import { Link } from "../components/nav";
import { Logo } from "../components/Layout";
import PaystackCheckout from "../components/Paystack";
import { Button, Card, Field, Input, fmtN } from "../components/ui";
import { supabase, REQUIRE_EMAIL_CONFIRMATION } from "../lib/supabase";
import {
  getSessionUser, initializePayment, listLevels, login, logout,
  hydrateAll, register, requestPasswordReset, resendCode, resetPassword,
} from "../lib/services";
import { navigate, useAction, useData, useRoute, useToast, useUser } from "../lib/store";
import type { MembershipLevel, Payment } from "../lib/types";

function AuthShell({ children, title, sub }: { children: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-100 bg-white px-4 py-3.5">
        <div className="mx-auto max-w-6xl"><Logo /></div>
      </header>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <h1 className="text-center text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
          {sub && <p className="mt-2 text-center text-sm text-slate-500">{sub}</p>}
          <div className="mt-7">{children}</div>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-slate-400">
        Secure sign-in for your EarnHub account
      </p>
    </div>
  );
}

/* ================= LOGIN ================= */

export function Login() {
  const user = useUser();
  const { query } = useRoute();
  const { busy, run } = useAction();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/app");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const u = await run(() => login(email, password));
    if (u) navigate(query.get("next") || (u.role === "admin" ? "/admin" : "/app"));
  };

  return (
    <AuthShell title="Welcome back" sub="Log in to your EarnHub account">
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-4">
          <Field label="Email address">
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" />
          </Field>
          <Field label="Password">
            <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" autoComplete="current-password" />
          </Field>
          <div className="flex justify-end">
            <Link to="/forgot" className="text-xs font-medium text-brand hover:underline">Forgot password?</Link>
          </div>
          <Button loading={busy} className="w-full">Log in</Button>
        </form>
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        New here? <Link to="/register" className="font-semibold text-brand hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}

/* ================= REGISTER ================= */

type RegData = { fullName: string; email: string; phone: string; password: string; confirm: string };

export function Register() {
  const { query } = useRoute();
  const [refCode, setRefCode] = useState((query.get("ref") || "").toUpperCase());
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<RegData>({ fullName: "", email: "", phone: "", password: "", confirm: "" });
  const [errors, setErrors] = useState<Partial<RegData> & { referralCode?: string }>({});
  const { busy, run } = useAction();
  const toast = useToast();
  const submittingRef = useRef(false);

  const next = async () => {
    if (submittingRef.current) return;
    const e: Partial<RegData> & { referralCode?: string } = {};
    if (!refCode.trim()) e.referralCode = "Enter the referral code of the member who invited you";
    if (form.fullName.trim().length < 3) e.fullName = "Enter your full legal name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (!/^(\+?234|0)\d{10}$/.test(form.phone.replace(/\s/g, ""))) e.phone = "e.g. 08012345678";
    if (form.password.length < 8) e.password = "Minimum 8 characters";
    if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    setErrors(e);
    if (Object.keys(e).length) return;

    submittingRef.current = true;
    try {
      const id = await run(
        () => register({ ...form, referralCode: refCode }),
        REQUIRE_EMAIL_CONFIRMATION
          ? "Account created. Check your inbox to confirm your email before payment."
          : "Account created — welcome to EarnHub!"
      );
      if (id) {
        setUserId(id);
        navigate(getSessionUser()?.emailVerified ? "/app" : "/verify");
      }
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-100 bg-white px-4 py-3.5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo />
          <span className="text-xs font-medium text-slate-400">Step {step} of {userId ? 3 : 2}{userId ? "" : "+"}</span>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-10">
        {step === 1 && (
          <>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create your account</h1>
            <p className="mt-1.5 text-sm text-slate-500">Step 1 — your personal information</p>
            <Card className="mt-6 p-6">
              <div className="space-y-4">
                <Field label="Full name" error={errors.fullName}>
                  <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Adaeze Okafor" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Email address" error={errors.email}>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="you@email.com" />
                  </Field>
                  <Field label="Phone number" error={errors.phone}>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="08012345678" inputMode="tel" />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Password" error={errors.password} hint="At least 8 characters">
                    <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Create password" autoComplete="new-password" />
                  </Field>
                  <Field label="Confirm password" error={errors.confirm}>
                    <Input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} placeholder="Repeat password" autoComplete="new-password" />
                  </Field>
                </div>
                <Field
                  label="Referral code"
                  error={errors.referralCode}
                  hint="Registration is by referral only — ask the member who invited you for their code"
                >
                  <Input
                    required
                    value={refCode}
                    onChange={(e) => setRefCode(e.target.value.toUpperCase().trim())}
                    placeholder="e.g. EH-7K2PQX"
                    className="font-mono uppercase tracking-widest"
                  />
                </Field>
                <Button loading={busy} disabled={busy} className="w-full" onClick={next}>
                  Continue <ArrowRight className="h-4 w-4" />
                </Button>
              </div>
            </Card>
            <p className="mt-5 text-center text-sm text-slate-500">
              Already registered? <Link to="/login" className="font-semibold text-brand hover:underline">Log in</Link>
            </p>
          </>
        )}

        {step === 2 && (
          <Step2Levels
            form={form}
            refCode={refCode}
            busy={busy}
            onBack={() => setStep(1)}
            onDone={(id) => {
              setUserId(id);
              setStep(3);
            }}
            onSkip={async () => {
              const id = await run(
                () => register({ ...form, referralCode: refCode }),
                REQUIRE_EMAIL_CONFIRMATION
                  ? "Account created — verify your email to continue."
                  : "Account created — welcome to EarnHub!"
              );
              if (id) {
                toast("info", "You can activate a membership later from your dashboard.");
                navigate(getSessionUser()?.emailVerified ? "/app" : "/verify");
              }
            }}
            run={run}
          />
        )}

        {step === 3 && <VerifyEmail />}
      </div>
    </div>
  );
}

function Step2Levels({ form, refCode, busy, onBack, onDone, onSkip, run }: {
  form: RegData; refCode: string; busy: boolean;
  onBack: () => void; onDone: (userId: string) => void; onSkip: () => void;
  run: <T>(fn: () => Promise<T>, ok?: string) => Promise<T | null>;
}) {
  const levels = useData(() => listLevels());
  const currentUser = useUser();
  const [selected, setSelected] = useState<MembershipLevel | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);

  const beginPayment = async (level: MembershipLevel) => {
    let id = userId;
    if (!id) {
      id = await run(() => register({ ...form, referralCode: refCode }), "Account created.");
      if (!id) return;
      setUserId(id);
      navigate(getSessionUser()?.emailVerified ? "/app" : "/verify");
      return;
    }
    if (!currentUser?.emailVerified) {
      navigate("/verify");
      return;
    }
    setSelected(level);
    const p = await run(() => initializePayment(id!, level.id));
    if (p) setPayment(p);
  };

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight text-slate-900">Choose your earning level</h1>
      <p className="mt-1.5 text-sm text-slate-500">
        Step 2 — membership unlocks its task catalogue. It buys access, not returns.
      </p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {levels.map((l) => (
          <Card key={l.id} className="flex flex-col p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-slate-900">{l.name}</h3>
              <span className="text-lg font-bold text-slate-900">{fmtN(l.price)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">{l.taskLimitPerDay} tasks/day · {l.referralCommission}% referral commission</p>
            <ul className="mt-3 flex-1 space-y-1.5">
              {l.features.slice(0, 3).map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-brand" /> {f}
                </li>
              ))}
            </ul>
            <Button loading={busy && selected?.id === l.id} disabled={busy} className="mt-4 w-full" onClick={() => beginPayment(l)}>
              Pay {fmtN(l.price)} & activate
            </Button>
          </Card>
        ))}
      </div>
      <div className="mt-6 flex items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button onClick={onSkip} disabled={busy} className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-brand hover:underline">
          Skip — choose a level later
        </button>
      </div>

      <PaystackCheckout
        payment={payment}
        level={selected}
        email={form.email}
        onClose={() => setPayment(null)}
        onDone={(ok) => {
          setPayment(null);
          if (ok && userId) onDone(userId);
        }}
      />
    </>
  );
}

/* ================= VERIFY EMAIL ================= */

export function VerifyEmail() {
  const user = useUser();
  const { busy, run } = useAction();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let timer: number | undefined;

    // Poll while the page is open — the moment the email is confirmed
    // (even from another tab), the app advances automatically.
    const checkConfirmation = async () => {
      const { data } = await supabase.auth.getUser();
      if (!isMounted) return;
      if (data.user?.email_confirmed_at) {
        await hydrateAll();
        navigate("/app");
      }
    };

    void checkConfirmation();
    timer = window.setInterval(() => void checkConfirmation(), 5000);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return;
      if ((event === "SIGNED_IN" || event === "USER_UPDATED") && session?.user?.email_confirmed_at) {
        void hydrateAll().then(() => {
          navigate("/app");
        });
      }
    });

    return () => {
      isMounted = false;
      if (timer) window.clearInterval(timer);
      subscription.unsubscribe();
    };
  }, [user]);

  if (!user) {
    navigate("/login?next=/verify");
    return null;
  }
  if (user.emailVerified) {
    navigate("/app");
    return null;
  }

  const confirmNow = async () => {
    const { data, error } = await supabase.auth.getUser();
    if (data.user?.email_confirmed_at) {
      await hydrateAll();
      navigate("/app");
      return;
    }
    if (error && /session/i.test(error.message)) {
      toast("info", "Open the confirmation link from your email in this browser — it signs you in and finishes verification automatically.");
      return;
    }
    toast("info", "Not confirmed yet. Click the link in your inbox — check Spam and Promotions folders too.");
  };

  return (
    <AuthShell title="Check your inbox" sub={`We sent a confirmation link to ${user.email}`}>
      <Card className="p-6">
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
          <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <div className="min-w-0 text-xs leading-relaxed text-amber-800">
            <p>Click the confirmation link in your inbox to continue with payment or task access.</p>
            <p className="mt-1.5">
              Can’t find it? Check your <span className="font-semibold">Spam</span> and{" "}
              <span className="font-semibold">Promotions</span> folders — it can take a few minutes to arrive.
              This page checks automatically and moves on the moment you’re confirmed.
            </p>
          </div>
        </div>
        <Button loading={busy} className="w-full" onClick={confirmNow}>
          I’ve confirmed my email
        </Button>
        <button
          disabled={busy}
          onClick={async () => {
            await run(() => resendCode(user.id), "A new confirmation email has been sent — check your inbox.");
          }}
          className="mt-4 w-full text-center text-xs font-medium text-brand hover:underline"
        >
          Didn’t get it? Resend email
        </button>
        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="mt-2 w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Wrong email address? Log out and register again
        </button>
      </Card>
    </AuthShell>
  );
}

/* ================= FORGOT / RESET ================= */

export function Forgot() {
  const { busy, run } = useAction();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"email" | "sent">("email");

  return (
    <AuthShell title="Reset password" sub="We'll help you get back in">
      <Card className="p-6">
        {phase === "email" && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => requestPasswordReset(email), "Reset link sent — check your inbox.");
              if (ok !== null) setPhase("sent");
            }}
            className="space-y-4"
          >
            <Field label="Account email">
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" />
            </Field>
            <Button loading={busy} className="w-full">
              <KeyRound className="h-4 w-4" /> Send reset link
            </Button>
          </form>
        )}
        {phase === "sent" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-xs leading-relaxed text-amber-800">
                If an account exists for {email}, a password-reset link is on its way. Open the link to choose a new password.
              </p>
            </div>
            <button
              disabled={busy}
              onClick={async () => {
                await run(() => requestPasswordReset(email), "Reset link sent again.");
              }}
              className="w-full text-center text-xs font-medium text-brand hover:underline"
            >
              Didn’t get it? Resend link
            </button>
          </div>
        )}
      </Card>
      <p className="mt-5 text-center text-sm text-slate-500">
        Remembered it? <Link to="/login" className="font-semibold text-brand hover:underline">Back to login</Link>
      </p>
    </AuthShell>
  );
}

/** Reached via the reset link in the email — the recovery session is
 *  established automatically, then the user picks a new password. */
export function ResetPassword() {
  const { busy, run } = useAction();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthShell title="Password updated" sub="Your password has been changed">
        <Card className="py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100"><Check className="h-6 w-6 text-brand" /></span>
          <p className="mt-4 font-semibold text-slate-900">You can now log in</p>
          <Link to="/login" className="mt-4 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white">Log in</Link>
        </Card>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" sub="Pick something strong you don't use elsewhere">
      <Card className="p-6">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 8 || pw !== confirm) return;
            const ok = await run(() => resetPassword(pw), "Password updated — log in with your new password.");
            if (ok !== null) setDone(true);
          }}
          className="space-y-4"
        >
          <Field label="New password" hint="At least 8 characters">
            <Input type="password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password" autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" error={confirm && pw !== confirm ? "Passwords do not match" : undefined}>
            <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat new password" autoComplete="new-password" />
          </Field>
          <Button loading={busy} className="w-full" disabled={pw.length < 8 || pw !== confirm}>Update password</Button>
        </form>
      </Card>
    </AuthShell>
  );
}

export { getSessionUser };