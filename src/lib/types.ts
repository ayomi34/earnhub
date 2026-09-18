/* EarnHub entity model — mirrors supabase/schema.sql exactly */

export type Role = "user" | "admin";
export type UserStatus = "active" | "suspended";
export type TxType =
  | "task_reward"
  | "referral_bonus"
  | "withdrawal"
  | "refund"
  | "adjustment";
export type TxStatus = "pending" | "approved" | "rejected";
export type PaymentStatus = "pending" | "success" | "failed" | "abandoned";
export type WithdrawalStatus = "pending" | "processing" | "paid" | "rejected";
export type SubmissionStatus =
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected"
  | "expired";
export type TaskStatus = "draft" | "active" | "paused" | "archived";
export type TaskCategory =
  | "Data Entry"
  | "Surveys"
  | "Content"
  | "Research"
  | "Social Media"
  | "Website Testing"
  | "Digital Services"
  | "Other";

export interface Profile {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: UserStatus;
  emailVerified: boolean;
  verifyCode: string | null;
  resetCode: string | null;
  referralCode: string;
  referredBy: string | null; // profile id of referrer
  membershipId: string | null; // active membership
  bank: { bank: string; accountNumber: string; accountName: string } | null;
  createdAt: number;
}

export interface MembershipLevel {
  id: string;
  name: string;
  price: number; // naira
  description: string;
  features: string[];
  taskLimitPerDay: number;
  referralCommission: number; // percent of task reward
  enabled: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface Membership {
  id: string;
  userId: string;
  levelId: string;
  paymentId: string;
  status: "active" | "expired";
  activatedAt: number;
}

export interface Payment {
  id: string;
  userId: string;
  levelId: string;
  amount: number;
  reference: string;
  gateway: "paystack";
  gatewayStatus: "initialized" | "success" | "failed";
  status: PaymentStatus; // platform status after server-side verification
  verifiedAt: number | null;
  createdAt: number;
}

export interface WalletTx {
  id: string;
  userId: string;
  type: TxType;
  direction: "credit" | "debit";
  amount: number;
  status: TxStatus;
  description: string;
  reference: string;
  sourceId: string; // idempotency key (submission id / withdrawal id / admin note)
  createdAt: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  instructions: string;
  category: TaskCategory;
  reward: number;
  estMinutes: number;
  maxSubmissions: number; // total slots
  dailyLimit: number; // per user per day (normally 1)
  levelIds: string[]; // allowed membership levels
  verification: "manual_review" | "link_check" | "code_check";
  startsAt: number;
  endsAt: number;
  status: TaskStatus;
  createdAt: number;
}

export interface TaskSubmission {
  id: string;
  taskId: string;
  userId: string;
  status: SubmissionStatus;
  proof: string;
  reviewNote: string | null;
  startedAt: number;
  submittedAt: number | null;
  reviewedAt: number | null;
  reviewedBy: string | null;
}

export interface Withdrawal {
  id: string;
  userId: string;
  bank: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  fee: number;
  status: WithdrawalStatus;
  reference: string;
  payoutRef: string | null;
  note: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Referral {
  id: string;
  referrerId: string;
  referredId: string;
  status: "pending" | "active"; // active once referred user activates membership
  earned: number; // total commission paid out for this referral
  createdAt: number;
}

export interface Notification {
  id: string;
  userId: string;
  type:
    | "account"
    | "payment"
    | "membership"
    | "task"
    | "referral"
    | "withdrawal"
    | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: number;
}

export interface SupportTicket {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: "open" | "closed";
  createdAt: number;
}

export interface Settings {
  platformName: string;
  supportEmail: string;
  supportPhone: string;
  minWithdrawal: number;
  withdrawalFee: number;
  referralPercentDefault: number;
  paystackPublicKey: string;
  paymentMode: "live";
}

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  action: string;
  detail: string;
  createdAt: number;
}

export interface DB {
  profiles: Profile[];
  levels: MembershipLevel[];
  memberships: Membership[];
  payments: Payment[];
  walletTx: WalletTx[];
  tasks: Task[];
  submissions: TaskSubmission[];
  withdrawals: Withdrawal[];
  referrals: Referral[];
  notifications: Notification[];
  tickets: SupportTicket[];
  audit: AuditLog[];
  settings: Settings;
  session: { userId: string } | null;
}

export interface Balances {
  available: number;
  pending: number;
  totalEarned: number;
  totalWithdrawn: number;
  todayEarned: number;
  referralEarnings: number;
  referralPending: number;
  tasksCompleted: number;
}
