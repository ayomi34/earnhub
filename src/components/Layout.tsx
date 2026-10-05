import { useState, type ReactNode } from "react";
import {
  Bell, Briefcase, ClipboardList, CreditCard, Gauge, Headset, LayoutDashboard,
  LogOut, Menu, MessageSquare, Settings2, ShieldCheck, Users, Wallet, X, Zap, Coins, Receipt,
  ListChecks, FileText, User, Share2, Layers, Disc3,
} from "lucide-react";
import { Link, NavItem } from "./nav";
import { navigate, useRoute, useSettings, useUser } from "../lib/store";
import { logout, unreadCount } from "../lib/services";
import { Badge } from "./ui";

export function Logo({ dark = false }: { dark?: boolean }) {
  const s = useSettings();
  return (
    <a href="#/" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand">
        <Zap className="h-4.5 w-4.5 fill-white text-white" />
      </span>
      <span className={`text-[17px] font-bold tracking-tight ${dark ? "text-white" : "text-slate-900"}`}>
        {s.platformName}
      </span>
    </a>
  );
}

/* =============== PUBLIC =============== */

export function PublicLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const user = useUser();
  const links = [
    { to: "/how-it-works", label: "How It Works" },
    { to: "/levels", label: "Membership" },
    { to: "/faq", label: "FAQ" },
    { to: "/contact", label: "Contact" },
  ];
  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 md:px-6">
          <Logo />
          <nav className="hidden items-center gap-7 md:flex">
            {links.map((l) => (
              <Link key={l.to} to={l.to} className="text-sm font-medium text-slate-600 hover:text-brand">
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="hidden items-center gap-2.5 md:flex">
            {user ? (
              <Link
                to={user.role === "admin" ? "/admin" : "/app"}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-brand">
                  Log in
                </Link>
                <Link to="/register" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
                  Get Started
                </Link>
              </>
            )}
          </div>
          <button className="rounded-lg p-2 text-slate-600 md:hidden" onClick={() => setOpen(!open)}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
        {open && (
          <div className="border-t border-slate-100 bg-white px-4 py-3 md:hidden">
            {links.map((l) => (
              <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {l.label}
              </Link>
            ))}
            <Link
              to={user ? (user.role === "admin" ? "/admin" : "/app") : "/register"}
              onClick={() => setOpen(false)}
              className="mt-2 block rounded-lg bg-brand px-3 py-2.5 text-center text-sm font-semibold text-white"
            >
              {user ? "Open Dashboard" : "Get Started"}
            </Link>
          </div>
        )}
      </header>
      <main>{children}</main>
      <PublicFooter />
    </div>
  );
}

function PublicFooter() {
  const s = useSettings();
  return (
    <footer className="border-t border-slate-100 bg-slate-50">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 md:grid-cols-4 md:px-6">
        <div className="md:col-span-2">
          <Logo />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-500">
            {s.platformName} connects Nigerians with legitimate digital tasks from
            verified partners. Earnings come from completed, approved work — never
            from membership fees.
          </p>
          <p className="mt-4 flex items-center gap-2 text-xs text-slate-400">
            <ShieldCheck className="h-4 w-4 text-brand" /> Payments secured by Paystack
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Platform</p>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            <li><Link to="/how-it-works" className="hover:text-brand">How It Works</Link></li>
            <li><Link to="/levels" className="hover:text-brand">Membership Levels</Link></li>
            <li><Link to="/faq" className="hover:text-brand">FAQ</Link></li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Legal & Support</p>
          <ul className="mt-4 space-y-2.5 text-sm text-slate-600">
            <li><Link to="/terms" className="hover:text-brand">Terms & Conditions</Link></li>
            <li><Link to="/privacy" className="hover:text-brand">Privacy Policy</Link></li>
            <li><Link to="/contact" className="hover:text-brand">Contact Support</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-slate-200/70 py-5 text-center text-xs text-slate-400">
        © {new Date().getFullYear()} {s.platformName} Technologies Ltd. Lagos, Nigeria. All rights reserved.
      </div>
    </footer>
  );
}

/* =============== DASHBOARD SHELL =============== */

export const userNav = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/app/spin", label: "Daily Spin", icon: Disc3 },
  { to: "/app/feud", label: "Family Feud", icon: MessageSquare },
  { to: "/app/earn", label: "Earn", icon: Briefcase },
  { to: "/app/tasks", label: "My Tasks", icon: ClipboardList },
  { to: "/app/wallet", label: "Wallet", icon: Wallet },
  { to: "/app/transactions", label: "Transactions", icon: Receipt },
  { to: "/app/referrals", label: "Referrals", icon: Share2 },
  { to: "/app/membership", label: "Membership", icon: CreditCard },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/profile", label: "Profile", icon: User },
  { to: "/app/support", label: "Support", icon: Headset },
];

export const adminNav = [
  { to: "/admin", label: "Overview", icon: Gauge, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/levels", label: "Levels", icon: Layers },
  { to: "/admin/tasks", label: "Tasks", icon: ListChecks },
  { to: "/admin/spin", label: "Daily Spin", icon: Disc3 },
  { to: "/admin/feud", label: "Family Feud", icon: MessageSquare },
  { to: "/admin/submissions", label: "Submissions", icon: ClipboardList },
  { to: "/admin/withdrawals", label: "Withdrawals", icon: Coins },
  { to: "/admin/payments", label: "Payments", icon: CreditCard },
  { to: "/admin/transactions", label: "Transactions", icon: FileText },
  { to: "/admin/settings", label: "Settings", icon: Settings2 },
  { to: "/admin/audit", label: "Audit Logs", icon: ShieldCheck },
];

export function DashShell({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const user = useUser();
  const { path } = useRoute();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const nav = admin ? adminNav : userNav;
  const unread = unreadCount(user.id);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <Logo />
        <button className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(false)}>
          <X className="h-5 w-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
        {nav.map((item) => {
          const active = item.end ? path === item.to : path.startsWith(item.to);
          return (
            <NavItem
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <item.icon className="h-[18px] w-[18px]" />
              <span className="flex-1">{item.label}</span>
              {item.label === "Notifications" && unread > 0 && (
                <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">{unread}</span>
              )}
            </NavItem>
          );
        })}
      </nav>
      <div className="border-t border-slate-100 p-3">
        {!admin && user.role === "admin" && (
          <NavItem to="/admin" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-accent hover:bg-accent-50">
            <ShieldCheck className="h-[18px] w-[18px]" /> Admin Panel
          </NavItem>
        )}
        {admin && (
          <NavItem to="/app" className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50">
            <LayoutDashboard className="h-[18px] w-[18px]" /> User Dashboard
          </NavItem>
        )}
        <button
          onClick={() => {
            logout();
            navigate("/login");
          }}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          <LogOut className="h-[18px] w-[18px]" /> Log out
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-[120] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-slate-200 bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* topbar */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            {admin && <Badge tone="amber">Admin Console</Badge>}
          </div>
          <div className="flex items-center gap-2">
            {!admin && (
              <NavItem
                to="/app/notifications"
                className="relative rounded-lg p-2.5 text-slate-500 hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" />
                {unread > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[9px] font-bold text-white">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </NavItem>
            )}
            <NavItem to={admin ? "/admin/settings" : "/app/profile"} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-slate-100">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {user.fullName.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
              </span>
              <span className="hidden text-left sm:block">
                <span className="block max-w-[140px] truncate text-[13px] font-semibold leading-tight text-slate-800">
                  {user.fullName}
                </span>
                <span className="block max-w-[140px] truncate text-[11px] leading-tight text-slate-400">{user.email}</span>
              </span>
            </NavItem>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 pb-24 md:px-8 md:py-8 lg:pb-10">{children}</main>
      </div>

      {/* mobile bottom nav */}
      {!admin && (
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white lg:hidden">
          {[
            { to: "/app", label: "Home", icon: LayoutDashboard, end: true },
            { to: "/app/earn", label: "Earn", icon: Briefcase },
            { to: "/app/wallet", label: "Wallet", icon: Wallet },
            { to: "/app/referrals", label: "Refer", icon: Share2 },
            { to: "/app/profile", label: "Account", icon: User },
          ].map((item) => {
            const active = item.end ? path === item.to : path.startsWith(item.to);
            return (
              <NavItem
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${
                  active ? "text-brand" : "text-slate-500"
                }`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavItem>
            );
          })}
        </nav>
      )}
    </div>
  );
}
