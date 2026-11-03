import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, Eye, EyeOff, KeyRound,
  MailCheck, Shield, TrendingUp, Users,
} from "lucide-react";
import { Link } from "../components/nav";
import { Logo } from "../components/Layout";
import PaystackCheckout from "../components/Paystack";
import { Button, Field, Input, fmtN } from "../components/ui";
import { supabase, REQUIRE_EMAIL_CONFIRMATION } from "../lib/supabase";
import {
  getSessionUser, initializePayment, listLevels, login, loginWithGoogle, logout,
  hydrateAll, register, requestPasswordReset, resendCode, resendConfirmationByEmail, resetPassword,
} from "../lib/services";
import { navigate, useAction, useData, useRoute, useToast, useUser } from "../lib/store";
import type { MembershipLevel, Payment } from "../lib/types";

/* ─────────────────────────── helpers ─────────────────────────── */

function PasswordInput({
  value,
  onChange,
  placeholder,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((s) => !s)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600"
        aria-label={show ? "Hide password" : "Show password"}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function pwStrength(pw: string): { level: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!pw) return { level: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const level = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  const map = [
    { label: "", color: "" },
    { label: "Weak", color: "bg-red-400" },
    { label: "Fair", color: "bg-amber-400" },
    { label: "Good", color: "bg-blue-400" },
    { label: "Strong", color: "bg-green-500" },
  ];
  return { level, ...map[level] };
}

function PasswordStrength({ password }: { password: string }) {
  const { level, label, color } = pwStrength(password);
  if (!password) return null;
  return (
    <div className="mt-1.5">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= level ? color : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      {label && (
        <p className={`mt-1 text-[11px] font-medium ${
          level === 1 ? "text-red-500" :
          level === 2 ? "text-amber-500" :
          level === 3 ? "text-blue-500" :
          "text-green-600"
        }`}>{label}</p>
      )}
    </div>
  );
}

/* ─────────────────────────── OAuth helpers ─────────────────────────── */

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 shrink-0" aria-hidden>
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function OAuthDivider() {
  return (
    <div className="relative my-5 flex items-center">
      <div className="flex-1 border-t border-slate-200" />
      <span className="mx-3 text-xs font-medium text-slate-400">or</span>
      <div className="flex-1 border-t border-slate-200" />
    </div>
  );
}

function GoogleButton({ loading, onClick }: { loading?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? (
        <span className="h-4.5 w-4.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
      ) : (
        <GoogleIcon />
      )}
      Continue with Google
    </button>
  );
}

/* ─────────────────────────── shell ─────────────────────────── */

const BRAND_FEATURES = [
  { icon: TrendingUp, text: "Complete tasks and earn real Nigerian naira" },
  { icon: Users, text: "Grow your network and earn referral commissions" },
  { icon: Shield, text: "Secure payouts directly to your bank account" },
];

function BrandPanel() {
  return (
    <div className="hidden flex-col justify-between bg-gradient-to-br from-[#1a4d2e] to-[#0f3b22] px-10 py-12 lg:flex">
      <div>
        <Logo dark />
        <p className="mt-8 text-2xl font-bold leading-snug text-white">
          Earn while you complete tasks and grow your network
        </p>
        <p className="mt-3 text-sm leading-relaxed text-green-200">
          EarnHub connects you to paid tasks, referral rewards, and daily earning opportunities — all in one platform.
        </p>
        <ul className="mt-8 space-y-4">
          {BRAND_FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10">
                <Icon className="h-4 w-4 text-green-300" />
              </span>
              <span className="text-sm text-green-100">{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-green-300/60">
        &copy; {new Date().getFullYear()} EarnHub. All rights reserved.
      </p>
    </div>
  );
}

function AuthShell({
  children,
  title,
  sub,
}: {
  children: React.ReactNode;
  title: string;
  sub?: string;
}) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <BrandPanel />

      {/* Right: form pane */}
      <div className="flex min-h-screen flex-col bg-white">
        {/* Mobile header */}
        <header className="border-b border-slate-100 px-5 py-4 lg:hidden">
          <Logo />
        </header>

        <div className="flex flex-1 flex-col items-center justify-center px-5 py-10">
          <div className="w-full max-w-sm">
            {/* Desktop: logo above form */}
            <div className="mb-7 hidden lg:block">
              <Logo />
            </div>

            <h1 className="text-xl font-bold tracking-tight text-slate-900">{title}</h1>
            {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}

            <div className="mt-6">{children}</div>
          </div>
        </div>

        <p className="pb-5 text-center text-xs text-slate-400">
          Secure sign-in powered by EarnHub
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── LOGIN ─────────────────────────── */

export function Login() {
  const user = useUser();
  const { query } = useRoute();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  /** Set to the email address when Supabase says it's not confirmed yet */
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resendSent, setResendSent] = useState(false);

  if (user) {
    navigate(user.role === "admin" ? "/admin" : "/app");
    return null;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setUnverifiedEmail(null);
    setResendSent(false);
    setBusy(true);
    try {
      const u = await login(email, password);
      if (u) navigate(query.get("next") || (u.role === "admin" ? "/admin" : "/app"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      if (msg === "__EMAIL_NOT_CONFIRMED__") {
        setUnverifiedEmail(email.trim().toLowerCase());
      } else {
        toast("error", msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleBusy(true);
    try {
      await loginWithGoogle();
      // Browser will redirect; keep spinner until page unloads
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Google sign-in failed.");
      setGoogleBusy(false);
    }
  };

  const handleResend = async () => {
    if (!unverifiedEmail) return;
    setBusy(true);
    try {
      await resendConfirmationByEmail(unverifiedEmail);
      setResendSent(true);
    } catch (err) {
      toast("error", err instanceof Error ? err.message : "Could not resend email.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell
      title="Welcome back"
      sub="Sign in to continue your earning journey."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Email address">
          <Input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
          />
        </Field>

        <div className="space-y-1.5">
          <Field label="Password">
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="Your password"
              autoComplete="current-password"
            />
          </Field>
          <div className="flex justify-end">
            <Link
              to="/forgot"
              className="text-xs font-medium text-green-700 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        <Button loading={busy} disabled={busy || googleBusy} className="w-full">
          Sign In
        </Button>
      </form>

      {/* Google OAuth */}
      <OAuthDivider />

      <GoogleButton loading={googleBusy} onClick={handleGoogle} />

      {/* Inline unverified-email nudge */}
      {unverifiedEmail && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3.5">
          <p className="text-sm font-medium text-amber-800">Email not confirmed yet</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-700">
            Check <span className="font-semibold">{unverifiedEmail}</span> for your
            confirmation link — including Spam and Promotions.
          </p>
          {resendSent ? (
            <p className="mt-2 text-xs font-medium text-green-700">
              ✓ New confirmation email sent — check your inbox.
            </p>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={handleResend}
              className="mt-2 text-xs font-semibold text-amber-800 underline underline-offset-2 hover:text-amber-900"
            >
              Resend confirmation email
            </button>
          )}
        </div>
      )}

      <div className="mt-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
        Don't have an account?{" "}
        <Link
          to="/register"
          className="font-semibold text-green-700 hover:underline"
        >
          Create one
        </Link>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────── REGISTER ─────────────────────────── */

type RegData = { fullName: string; email: string; phone: string; password: string; confirm: string };

export function Register() {
  const { query } = useRoute();
  const [refCode, setRefCode] = useState((query.get("ref") || "").toUpperCase());
  const [step, setStep] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);
  const [form, setForm] = useState<RegData>({
    fullName: "", email: "", phone: "", password: "", confirm: "",
  });
  const [agreed, setAgreed] = useState(false);
  const [errors, setErrors] = useState<Partial<RegData> & { referralCode?: string; agreed?: string }>({});
  const { busy, run } = useAction();
  const toast = useToast();
  const submittingRef = useRef(false);
  const [googleSignupBusy, setGoogleSignupBusy] = useState(false);

  const next = async () => {
    if (submittingRef.current) return;
    const e: Partial<RegData> & { referralCode?: string } = {};
    if (!refCode.trim()) e.referralCode = "Enter the referral code of the member who invited you";
    if (form.fullName.trim().length < 3) e.fullName = "Enter your full legal name";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Enter a valid email";
    if (!/^(\+?234|0)\d{10}$/.test(form.phone.replace(/\s/g, ""))) e.phone = "e.g. 08012345678";
    if (form.password.length < 8) e.password = "Minimum 8 characters";
    if (form.confirm !== form.password) e.confirm = "Passwords do not match";
    if (!agreed) e.agreed = "You must read and accept the Terms & Conditions and Privacy Policy to continue";
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

  const stepLabel = userId ? `Step ${step} of 3` : `Step ${step} of 2+`;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <BrandPanel />

      <div className="flex min-h-screen flex-col bg-white">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <Logo />
          <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
            {stepLabel}
          </span>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-8">
          <div className="mx-auto w-full max-w-lg">
            {step === 1 && (
              <>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Create your account
                </h1>
                <p className="mt-1 text-sm text-slate-500">
                  Fill in your details to get started.
                </p>

                <div className="space-y-4">
                  <Field label="Full name" error={errors.fullName}>
                    <Input
                      value={form.fullName}
                      onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                      placeholder="e.g. Adaeze Okafor"
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Email address" error={errors.email}>
                      <Input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="you@email.com"
                      />
                    </Field>
                    <Field label="Phone number" error={errors.phone}>
                      <Input
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="08012345678"
                        inputMode="tel"
                      />
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Password" error={errors.password}>
                      <PasswordInput
                        value={form.password}
                        onChange={(v) => setForm({ ...form, password: v })}
                        placeholder="Create password"
                        autoComplete="new-password"
                      />
                      <PasswordStrength password={form.password} />
                    </Field>
                    <Field label="Confirm password" error={errors.confirm}>
                      <PasswordInput
                        value={form.confirm}
                        onChange={(v) => setForm({ ...form, confirm: v })}
                        placeholder="Repeat password"
                        autoComplete="new-password"
                      />
                    </Field>
                  </div>

                  <Field
                    label="Referral code"
                    error={errors.referralCode}
                    hint="Registration is by referral only — ask the member who invited you"
                  >
                    <Input
                      required
                      value={refCode}
                      onChange={(e) => setRefCode(e.target.value.toUpperCase().trim())}
                      placeholder="e.g. EH-7K2PQX"
                      className="font-mono uppercase tracking-widest"
                    />
                  </Field>

                  {/* Terms acceptance */}
                  <div className={`rounded-lg border p-3.5 ${errors.agreed ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        checked={agreed}
                        onChange={(e) => {
                          setAgreed(e.target.checked);
                          if (e.target.checked) setErrors((prev) => { const n = { ...prev }; delete n.agreed; return n; });
                        }}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
                      />
                      <span className="text-[13px] leading-relaxed text-slate-700">
                        I have read and I agree to the{" "}
                        <a href="/#/terms" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">
                          Terms &amp; Conditions
                        </a>{" "}
                        and{" "}
                        <a href="/#/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold text-brand underline underline-offset-2">
                          Privacy Policy
                        </a>
                        . I understand that membership fees are non-refundable and that earnings are not guaranteed.
                      </span>
                    </label>
                    {errors.agreed && (
                      <p className="mt-2 text-[12px] font-medium text-red-600">{errors.agreed}</p>
                    )}
                  </div>

                  <Button loading={busy} disabled={busy} className="w-full" onClick={next}>
                    Continue <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>

                {/* Google OAuth — quick registration */}
                <OAuthDivider />

                <GoogleButton
                  loading={googleSignupBusy}
                  onClick={async () => {
                    const googleErrors: typeof errors = {};
                    if (!refCode.trim()) googleErrors.referralCode = "Enter your referral code before continuing with Google";
                    if (!agreed) googleErrors.agreed = "You must accept the Terms & Conditions and Privacy Policy to continue";
                    if (Object.keys(googleErrors).length) { setErrors(googleErrors); return; }
                    setGoogleSignupBusy(true);
                    try {
                      try { sessionStorage.setItem("eh_ref", refCode.trim().toUpperCase()); } catch { /* ignore */ }
                      await loginWithGoogle();
                    } catch (err) {
                      toast("error", err instanceof Error ? err.message : "Google sign-in failed.");
                      setGoogleSignupBusy(false);
                    }
                  }}
                />

                <div className="mt-5 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm text-slate-500">
                  Already registered?{" "}
                  <Link to="/login" className="font-semibold text-green-700 hover:underline">
                    Sign in
                  </Link>
                </div>
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
                  navigate("/app/tasks");
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
      </div>
    </div>
  );
}

function Step2Levels({
  form, refCode, busy, onBack, onDone, onSkip, run,
}: {
  form: RegData;
  refCode: string;
  busy: boolean;
  onBack: () => void;
  onDone: (userId: string) => void;
  onSkip: () => void;
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
      <h1 className="text-xl font-bold tracking-tight text-slate-900">
        Choose your earning level
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Membership unlocks your task catalogue. It buys access, not returns.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {levels.map((l) => (
          <div
            key={l.id}
            className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-baseline justify-between">
              <h3 className="font-semibold text-slate-900">{l.name}</h3>
              <span className="text-lg font-bold text-slate-900">{fmtN(l.price)}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {l.taskLimitPerDay} tasks/day · {l.referralCommission}% referral commission
            </p>
            <ul className="mt-3 flex-1 space-y-1.5">
              {l.features.slice(0, 3).map((f) => (
                <li key={f} className="flex items-start gap-2 text-xs text-slate-600">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-600" /> {f}
                </li>
              ))}
            </ul>
            <Button
              loading={busy && selected?.id === l.id}
              disabled={busy}
              className="mt-4 w-full"
              onClick={() => beginPayment(l)}
            >
              Pay {fmtN(l.price)} &amp; activate
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-6 flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-sm font-medium text-slate-500 underline-offset-2 hover:text-green-700 hover:underline"
        >
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

/* ─────────────────────────── VERIFY EMAIL ─────────────────────────── */

export function VerifyEmail() {
  const user = useUser();
  const { busy, run } = useAction();
  const toast = useToast();

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    let timer: number | undefined;

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
      if (
        (event === "SIGNED_IN" || event === "USER_UPDATED") &&
        session?.user?.email_confirmed_at
      ) {
        void hydrateAll().then(() => navigate("/app"));
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
      toast(
        "info",
        "Open the confirmation link from your email in this browser — it signs you in and finishes verification automatically."
      );
      return;
    }
    toast(
      "info",
      "Not confirmed yet. Click the link in your inbox — check Spam and Promotions folders too."
    );
  };

  return (
    <AuthShell
      title="Check your inbox"
      sub={`We sent a confirmation link to ${user.email}`}
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
            <div className="text-sm leading-relaxed text-green-800">
              <p className="font-medium">Confirm your email to continue</p>
              <p className="mt-1 text-xs text-green-700">
                Click the confirmation link in your inbox. Check{" "}
                <span className="font-semibold">Spam</span> and{" "}
                <span className="font-semibold">Promotions</span> — it may take a few minutes.
                This page will advance automatically once confirmed.
              </p>
            </div>
          </div>
        </div>

        <Button loading={busy} className="w-full" onClick={confirmNow}>
          I've confirmed my email
        </Button>

        <button
          disabled={busy}
          onClick={async () => {
            await run(
              () => resendCode(user.id),
              "A new confirmation email has been sent — check your inbox."
            );
          }}
          className="w-full text-center text-xs font-medium text-green-700 hover:underline"
        >
          Didn't get it? Resend email
        </button>

        <button
          onClick={async () => {
            await logout();
            navigate("/login");
          }}
          className="w-full text-center text-xs text-slate-400 hover:text-slate-600"
        >
          Wrong email address? Log out and register again
        </button>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────── FORGOT PASSWORD ─────────────────────────── */

export function Forgot() {
  const { busy, run } = useAction();
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"email" | "sent">("email");

  return (
    <AuthShell title="Forgot your password?" sub="Enter your email and we'll send a reset link.">
      {phase === "email" && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(
              () => requestPasswordReset(email),
              "Reset link sent — check your inbox."
            );
            if (ok !== null) setPhase("sent");
          }}
          className="space-y-4"
        >
          <Field label="Account email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              autoComplete="email"
            />
          </Field>
          <Button loading={busy} className="w-full">
            <KeyRound className="h-4 w-4" /> Send reset link
          </Button>
        </form>
      )}

      {phase === "sent" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-green-200 bg-green-50 p-4">
            <div className="flex items-start gap-3">
              <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-medium text-green-800">Reset link sent</p>
                <p className="mt-1 text-xs leading-relaxed text-green-700">
                  If an account exists for <span className="font-semibold">{email}</span>, a
                  password-reset link is on its way. Open the link to choose a new password.
                </p>
              </div>
            </div>
          </div>

          <button
            disabled={busy}
            onClick={async () => {
              await run(() => requestPasswordReset(email), "Reset link sent again.");
            }}
            className="w-full text-center text-xs font-medium text-green-700 hover:underline"
          >
            Didn't get it? Resend link
          </button>
        </div>
      )}

      <div className="mt-5 text-center text-sm text-slate-500">
        Remembered it?{" "}
        <Link to="/login" className="font-semibold text-green-700 hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthShell>
  );
}

/* ─────────────────────────── RESET PASSWORD ─────────────────────────── */

export function ResetPassword() {
  const { busy, run } = useAction();
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <AuthShell title="Password updated" sub="Your password has been changed successfully.">
        <div className="rounded-xl border border-green-200 bg-green-50 py-8 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <Check className="h-6 w-6 text-green-600" />
          </span>
          <p className="mt-4 font-semibold text-slate-900">You can now sign in</p>
          <p className="mt-1 text-sm text-slate-500">
            Use your new password to access your account.
          </p>
          <Link
            to="/login"
            className="mt-5 inline-block rounded-lg bg-green-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-green-800"
          >
            Go to sign in
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set a new password"
      sub="Pick something strong you don't use elsewhere."
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (pw.length < 8 || pw !== confirm) return;
          const ok = await run(
            () => resetPassword(pw),
            "Password updated — log in with your new password."
          );
          if (ok !== null) setDone(true);
        }}
        className="space-y-4"
      >
        <Field
          label="New password"
          hint="At least 8 characters"
          error={pw && pw.length < 8 ? "Minimum 8 characters" : undefined}
        >
          <PasswordInput
            value={pw}
            onChange={setPw}
            placeholder="New password"
            autoComplete="new-password"
          />
          <PasswordStrength password={pw} />
        </Field>

        <Field
          label="Confirm new password"
          error={confirm && pw !== confirm ? "Passwords do not match" : undefined}
        >
          <PasswordInput
            value={confirm}
            onChange={setConfirm}
            placeholder="Repeat new password"
            autoComplete="new-password"
          />
        </Field>

        <Button
          loading={busy}
          className="w-full"
          disabled={pw.length < 8 || pw !== confirm}
        >
          Update password
        </Button>
      </form>
    </AuthShell>
  );
}

export { getSessionUser };
