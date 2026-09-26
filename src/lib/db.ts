import type { DB, SpinConfig } from "./types";

/* EarnHub client cache.
 * All data lives in Supabase — this store is an in-memory cache hydrated
 * from the database so pages can use synchronous selectors. Mutations
 * always go to Supabase first, then flow through update(). */

/** Default wheel — used until an admin customises it in settings. The
 *  daily-spin edge function mirrors these defaults server-side. */
export const DEFAULT_SPIN_CONFIG: SpinConfig = {
  enabled: true,
  requireVerified: true,
  requireMembership: false,
  dailyBudget: 50000,
  segments: [
    { label: "₦10", type: "cash", amount: 10, weight: 30, color: "#10b981" },
    { label: "₦20", type: "cash", amount: 20, weight: 24, color: "#059669" },
    { label: "₦50", type: "cash", amount: 50, weight: 16, color: "#047857" },
    { label: "₦100", type: "cash", amount: 100, weight: 10, color: "#d4af37" },
    { label: "₦150", type: "cash", amount: 150, weight: 6, color: "#b8860b" },
    { label: "₦200", type: "cash", amount: 200, weight: 4, color: "#f59e0b" },
    { label: "Bonus Task", type: "bonus_task", amount: 0, weight: 6, color: "#0ea5e9" },
    { label: "Try Again", type: "none", amount: 0, weight: 12, color: "#334155" },
  ],
};

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

export const genRef = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}${Math
    .random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;

function emptyDB(): DB {
  return {
    profiles: [],
    levels: [],
    memberships: [],
    payments: [],
    walletTx: [],
    tasks: [],
    submissions: [],
    withdrawals: [],
    referrals: [],
    notifications: [],
    tickets: [],
    audit: [],
    spins: [],
    spinWinners: [],
    settings: {
      platformName: "EarnHub",
      supportEmail: "support@earnhub.ng",
      supportPhone: "0800 EARNHUB",
      minWithdrawal: 2000,
      withdrawalFee: 0,
      referralPercentDefault: 5,
      paystackPublicKey: "",
      paymentMode: "live",
      spin: DEFAULT_SPIN_CONFIG,
    },
    session: null,
  };
}

let cache: DB = emptyDB();

export function read(): DB {
  return cache;
}

let version = 0;
const listeners = new Set<() => void>();

export function getVersion() {
  return version;
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Atomic read-modify-write over the cache. Call AFTER a successful
 *  Supabase write so the UI reflects committed data only. */
export function update<T>(fn: (db: DB) => T): T {
  const result = fn(cache);
  version++;
  listeners.forEach((l) => l());
  return result;
}