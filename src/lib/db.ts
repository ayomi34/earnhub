import type { DB, SpinConfig, FeudConfig, FeudQuestion } from "./types";

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
export const DEFAULT_FEUD_CONFIG: FeudConfig = {
  enabled: true,
  targetPoints: 200,
  timeLimitSeconds: 25,
  questionsPerGame: 4,
  dailyLimit: 3,
  minScoreForReward: 100,
  target200Reward: 100,
  scoreTiers: [
    { minScore: 100, maxScore: 149, reward: 25 },
    { minScore: 150, maxScore: 199, reward: 50 },
    { minScore: 200, maxScore: 200, reward: 100 },
  ],
  maxWinners: 0,
  startDate: null,
  endDate: null,
};

export const DEFAULT_FEUD_QUESTIONS: FeudQuestion[] = [
  {
    id: "feud-q-1",
    prompt: "Name something people do immediately after waking up.",
    category: "Daily Routine",
    difficulty: "easy",
    explanation: "Survey of 100 people across major cities.",
    answers: [
      { id: "a1", text: "Check their phone", points: 40, rank: 1 },
      { id: "a2", text: "Brush their teeth", points: 30, rank: 2 },
      { id: "a3", text: "Pray", points: 20, rank: 3 },
      { id: "a4", text: "Drink water", points: 10, rank: 4 },
      { id: "a5", text: "Take a bath", points: 5, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
  {
    id: "feud-q-2",
    prompt: "Name a popular Nigerian street food snack.",
    category: "Food & Dining",
    difficulty: "easy",
    explanation: "Street food survey conducted with university students and workers.",
    answers: [
      { id: "b1", text: "Suya", points: 38, rank: 1 },
      { id: "b2", text: "Akara & Puff Puff", points: 28, rank: 2 },
      { id: "b3", text: "Roasted Corn & Pear", points: 18, rank: 3 },
      { id: "b4", text: "Boli (Roasted Plantain)", points: 11, rank: 4 },
      { id: "b5", text: "Gala & Sausage", points: 5, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
  {
    id: "feud-q-3",
    prompt: "Name something you always carry when leaving the house.",
    category: "Everyday Life",
    difficulty: "easy",
    explanation: "Daily essentials survey of urban commuters.",
    answers: [
      { id: "c1", text: "Smartphone", points: 42, rank: 1 },
      { id: "c2", text: "Wallet or ATM card", points: 26, rank: 2 },
      { id: "c3", text: "House / Car Keys", points: 19, rank: 3 },
      { id: "c4", text: "Cash / Change", points: 9, rank: 4 },
      { id: "c5", text: "Power bank", points: 4, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
  {
    id: "feud-q-4",
    prompt: "Name a reason someone might be late to work in Lagos.",
    category: "City Life",
    difficulty: "easy",
    explanation: "Lagos commuter survey on transport challenges.",
    answers: [
      { id: "d1", text: "Heavy Traffic (Go-slow)", points: 45, rank: 1 },
      { id: "d2", text: "Overslept / Alarm didn't ring", points: 25, rank: 2 },
      { id: "d3", text: "Rain / Bad weather", points: 15, rank: 3 },
      { id: "d4", text: "Bus breakdown / No transport", points: 10, rank: 4 },
      { id: "d5", text: "Family / Child emergency", points: 5, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
  {
    id: "feud-q-5",
    prompt: "Name something people love to do at a Nigerian wedding.",
    category: "Culture & Celebration",
    difficulty: "medium",
    explanation: "Celebration habits survey.",
    answers: [
      { id: "e1", text: "Eat Jollof Rice & small chops", points: 39, rank: 1 },
      { id: "e2", text: "Spray money on the couple", points: 31, rank: 2 },
      { id: "e3", text: "Dance & show off outfits (Aso Ebi)", points: 18, rank: 3 },
      { id: "e4", text: "Take photos / selfies", points: 8, rank: 4 },
      { id: "e5", text: "Collect souvenirs", points: 4, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
  {
    id: "feud-q-6",
    prompt: "Name something you look for when buying a new smartphone.",
    category: "Technology",
    difficulty: "medium",
    explanation: "Consumer electronics survey.",
    answers: [
      { id: "f1", text: "Battery life / Capacity", points: 36, rank: 1 },
      { id: "f2", text: "Camera quality", points: 32, rank: 2 },
      { id: "f3", text: "Storage space (GB)", points: 18, rank: 3 },
      { id: "f4", text: "Price / Value for money", points: 10, rank: 4 },
      { id: "f5", text: "Processor / Fast speed", points: 4, rank: 5 },
    ],
    status: "active",
    createdAt: 1726000000000,
  },
];


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
    feudQuestions: [...DEFAULT_FEUD_QUESTIONS],
    feudSessions: [],
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
      feud: DEFAULT_FEUD_CONFIG,
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