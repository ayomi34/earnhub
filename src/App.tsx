import { useEffect } from "react";
import { ToastProvider, navigate, useRoute, useUser } from "./lib/store";
import { hydrateAll, hydrateContentFromSupabase, hydrateSessionFromSupabase } from "./lib/services";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import { PublicLayout, DashShell } from "./components/Layout";
import {
  Landing, HowItWorks, LevelsPage, FaqPage, TermsPage, PrivacyPage, ContactPage,
} from "./pages/public";
import { Login, Register, VerifyEmail, Forgot, ResetPassword } from "./pages/auth";
import { Dashboard, Earn, MyTasks } from "./pages/user";
import { WalletPage, Transactions, Referrals, MembershipPage } from "./pages/account";
import { SpinPage } from "./pages/spin";
import { Profile, Notifications, Support } from "./pages/misc";
import { AdminOverview, AdminUsers, AdminLevels, AdminTasks } from "./pages/admin";
import {
  AdminSubmissions, AdminWithdrawals, AdminPayments, AdminTransactions, AdminSettings, AdminAudit,
} from "./pages/adminFin";
import { AdminSpin } from "./pages/adminSpin";
import { Button } from "./components/ui";

function useScrollTop(path: string) {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [path]);
}

export default function App() {
  const { path } = useRoute();
  const user = useUser();
  useScrollTop(path);
  useEffect(() => {
    void hydrateSessionFromSupabase();
    void hydrateContentFromSupabase();

    if (!hasSupabaseConfig) return;
    const redirectConfirmedUser = (session: Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"]) => {
      if (!session?.user?.email_confirmed_at) return;
      void hydrateAll().then(() => {
        const currentPath = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
        if (["/", "/login", "/register", "/verify", "/reset"].includes(currentPath)) navigate("/app");
      });
    };

    void supabase.auth.getSession().then(({ data: { session } }) => redirectConfirmedUser(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      redirectConfirmedUser(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  const p = path.replace(/\/+$/, "") || "/";

  /* ---------- public ---------- */
  if (["/", "/how-it-works", "/levels", "/faq", "/terms", "/privacy", "/contact"].includes(p)) {
    return (
      <ToastProvider>
        <PublicLayout>
          {p === "/" && <Landing />}
          {p === "/how-it-works" && <HowItWorks />}
          {p === "/levels" && <LevelsPage />}
          {p === "/faq" && <FaqPage />}
          {p === "/terms" && <TermsPage />}
          {p === "/privacy" && <PrivacyPage />}
          {p === "/contact" && <ContactPage />}
        </PublicLayout>
      </ToastProvider>
    );
  }

  /* ---------- auth ---------- */
  if (["/login", "/register", "/forgot", "/verify", "/reset"].includes(p)) {
    if (user && p !== "/verify" && p !== "/reset") {
      navigate(user.emailVerified ? (user.role === "admin" ? "/admin" : "/app") : "/verify");
      return null;
    }
    return (
      <ToastProvider>
        {p === "/login" && <Login />}
        {p === "/register" && <Register />}
        {p === "/forgot" && <Forgot />}
        {p === "/verify" && <VerifyEmail />}
        {p === "/reset" && <ResetPassword />}
      </ToastProvider>
    );
  }

  /* ---------- guard ---------- */
  if (!user) {
    navigate(`/login?next=${encodeURIComponent(p)}`);
    return null;
  }
  if (!user.emailVerified) {
    navigate("/verify");
    return null;
  }

  /* ---------- user app ---------- */
  const userPages: Record<string, React.ReactNode> = {
    "/app": <Dashboard />,
    "/app/spin": <SpinPage />,
    "/app/earn": <Earn />,
    "/app/tasks": <MyTasks />,
    "/app/wallet": <WalletPage />,
    "/app/transactions": <Transactions />,
    "/app/referrals": <Referrals />,
    "/app/membership": <MembershipPage />,
    "/app/notifications": <Notifications />,
    "/app/profile": <Profile />,
    "/app/support": <Support />,
  };
  if (p in userPages) {
    return (
      <ToastProvider>
        <DashShell>{userPages[p]}</DashShell>
      </ToastProvider>
    );
  }

  /* ---------- admin ---------- */
  const adminPages: Record<string, React.ReactNode> = {
    "/admin": <AdminOverview />,
    "/admin/users": <AdminUsers />,
    "/admin/levels": <AdminLevels />,
    "/admin/tasks": <AdminTasks />,
    "/admin/submissions": <AdminSubmissions />,
    "/admin/withdrawals": <AdminWithdrawals />,
    "/admin/payments": <AdminPayments />,
    "/admin/transactions": <AdminTransactions />,
    "/admin/settings": <AdminSettings />,
    "/admin/spin": <AdminSpin />,
    "/admin/audit": <AdminAudit />,
  };
  if (p in adminPages) {
    if (user.role !== "admin") {
      return (
        <ToastProvider>
          <DashShell>
            <div className="flex flex-col items-center py-24 text-center">
              <p className="text-lg font-bold text-slate-900">Administrator access required</p>
              <p className="mt-2 max-w-sm text-sm text-slate-500">
                This area is protected by role-based access control. Your account does not have admin privileges.
              </p>
              <Button className="mt-6" onClick={() => navigate("/app")}>Back to dashboard</Button>
            </div>
          </DashShell>
        </ToastProvider>
      );
    }
    return (
      <ToastProvider>
        <DashShell admin>{adminPages[p]}</DashShell>
      </ToastProvider>
    );
  }

  /* ---------- 404 ---------- */
  return (
    <ToastProvider>
      <PublicLayout>
        <div className="flex flex-col items-center px-4 py-28 text-center">
          <p className="font-mono text-sm font-semibold text-brand">404</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">Page not found</h1>
          <p className="mt-2 text-sm text-slate-500">The page you're looking for doesn't exist.</p>
          <Button className="mt-6" onClick={() => navigate("/")}>Go home</Button>
        </div>
      </PublicLayout>
    </ToastProvider>
  );
}
