import type { DB } from "./types";

/* EarnHub client cache.
 * All data lives in Supabase — this store is an in-memory cache hydrated
 * from the database so pages can use synchronous selectors. Mutations
 * always go to Supabase first, then flow through update(). */

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
    settings: {
      platformName: "EarnHub",
      supportEmail: "support@earnhub.ng",
      supportPhone: "0800 EARNHUB",
      minWithdrawal: 2000,
      withdrawalFee: 0,
      referralPercentDefault: 5,
      paystackPublicKey: "",
      paymentMode: "live",
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