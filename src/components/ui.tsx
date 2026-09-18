import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Check, Copy, Loader2, X } from "lucide-react";
import { useState } from "react";

export const fmtN = (n: number) => `₦${Math.round(n).toLocaleString("en-NG")}`;
export const fmtDate = (ts: number) =>
  new Date(ts).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });
export const fmtDateTime = (ts: number) =>
  `${fmtDate(ts)}, ${new Date(ts).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}`;

/* ---------- buttons ---------- */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "accent";
  size?: "sm" | "md";
  loading?: boolean;
};

export function Button({ variant = "primary", size = "md", loading, className = "", children, disabled, ...rest }: BtnProps) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2.5 text-sm" };
  const variants = {
    primary: "bg-brand text-white hover:bg-brand-dark",
    accent: "bg-accent text-white hover:bg-amber-600",
    outline: "border border-slate-300 bg-white text-slate-700 hover:border-brand hover:text-brand",
    ghost: "text-slate-600 hover:bg-slate-100",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------- form fields ---------- */

export function Field({ label, error, hint, children }: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-400">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition-colors focus:border-brand focus:ring-2 focus:ring-brand/15";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputCls} ${props.className || ""}`} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={4} {...props} className={`${inputCls} resize-y ${props.className || ""}`} />;
}

/* ---------- cards / layout ---------- */

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

export function CardHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
      <div>
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{title}</h1>
        {sub && <p className="mt-1 text-sm text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

/* ---------- badges ---------- */

const badgeTones: Record<string, string> = {
  green: "bg-green-100 text-green-800",
  amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-700",
  slate: "bg-slate-100 text-slate-600",
  blue: "bg-sky-100 text-sky-800",
};
export function Badge({ tone = "slate", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium ${badgeTones[tone]}`}>
      {children}
    </span>
  );
}

export const statusBadge: Record<string, { tone: keyof typeof badgeTones; label: string }> = {
  active: { tone: "green", label: "Active" },
  suspended: { tone: "red", label: "Suspended" },
  pending: { tone: "amber", label: "Pending" },
  processing: { tone: "blue", label: "Processing" },
  paid: { tone: "green", label: "Paid" },
  rejected: { tone: "red", label: "Rejected" },
  success: { tone: "green", label: "Success" },
  failed: { tone: "red", label: "Failed" },
  abandoned: { tone: "slate", label: "Abandoned" },
  approved: { tone: "green", label: "Approved" },
  submitted: { tone: "blue", label: "Under Review" },
  in_progress: { tone: "amber", label: "In Progress" },
  expired: { tone: "slate", label: "Expired" },
  draft: { tone: "slate", label: "Draft" },
  paused: { tone: "amber", label: "Paused" },
  archived: { tone: "slate", label: "Archived" },
  open: { tone: "amber", label: "Open" },
  closed: { tone: "green", label: "Resolved" },
  available: { tone: "green", label: "Available" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = statusBadge[status] || { tone: "slate" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

/* ---------- table ---------- */

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
            {head.map((h, i) => (
              <th key={i} className="px-5 py-3 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export const Td = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <td className={`px-5 py-3.5 align-middle text-slate-700 ${className}`}>{children}</td>
);

/* ---------- misc ---------- */

export function EmptyState({ icon, title, sub, action }: { icon: ReactNode; title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="mt-4 text-sm font-semibold text-slate-800">{title}</p>
      {sub && <p className="mt-1 max-w-xs text-xs leading-relaxed text-slate-500">{sub}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Modal({
  open, onClose, title, children, wide,
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div
        className={`fade-up relative max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-md"
        }`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4">
          <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).catch(() => {});
        setDone(true);
        window.setTimeout(() => setDone(false), 1600);
      }}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-brand hover:text-brand"
    >
      {done ? <Check className="h-3.5 w-3.5 text-brand" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}

export function Stat({ label, value, icon, tone = "default", sub }: {
  label: string; value: string; icon?: ReactNode; sub?: string;
  tone?: "default" | "brand";
}) {
  return (
    <Card className="p-4 md:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-500">{label}</p>
          <p className={`mt-1.5 truncate text-lg font-bold tracking-tight md:text-[22px] ${tone === "brand" ? "text-brand" : "text-slate-900"}`}>
            {value}
          </p>
          {sub && <p className="mt-0.5 truncate text-[11px] text-slate-400">{sub}</p>}
        </div>
        {icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone === "brand" ? "bg-brand-50 text-brand" : "bg-slate-100 text-slate-500"}`}>
            {icon}
          </span>
        )}
      </div>
    </Card>
  );
}

export const NG_BANKS = [
  "Access Bank", "Citibank Nigeria", "Ecobank Nigeria", "Fidelity Bank", "First Bank of Nigeria",
  "First City Monument Bank", "Globus Bank", "Guaranty Trust Bank", "Jaiz Bank", "Keystone Bank",
  "Kuda Microfinance Bank", "Moniepoint MFB", "Opay", "PalmPay", "Parallex Bank", "Polaris Bank",
  "Premium Trust Bank", "Providus Bank", "Stanbic IBTC Bank", "Sterling Bank", "SunTrust Bank",
  "Titan Trust Bank", "Union Bank of Nigeria", "United Bank for Africa", "Unity Bank", "VFD MFB",
  "Wema Bank", "Zenith Bank",
];
