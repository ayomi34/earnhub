import { useState } from "react";
import { AlertTriangle, Lock, ShieldCheck } from "lucide-react";
import { Button, fmtN, Modal } from "./ui";
import { paystackPublicKey } from "../lib/supabase";
import { verifyPayment } from "../lib/services";
import type { MembershipLevel, Payment } from "../lib/types";

declare global {
  interface Window {
    PaystackPop?: {
      new (): {
        newTransaction: (options: {
          key: string;
          email: string;
          amount: number;
          ref: string;
          currency: string;
          onCancel: () => void;
          onSuccess: (response: { reference: string; status?: string }) => void;
        }) => void;
      };
    };
  }
}

interface Props {
  payment: Payment | null;
  level: MembershipLevel | null;
  email: string;
  onDone: (ok: boolean) => void;
  onClose: () => void;
}

let paystackScript: Promise<void> | null = null;

function loadPaystack() {
  if (window.PaystackPop) return Promise.resolve();
  if (paystackScript) return paystackScript;
  paystackScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.paystack.co/v2/inline.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Paystack checkout."));
    document.head.appendChild(script);
  });
  return paystackScript;
}

export default function PaystackCheckout({ payment, level, email, onDone, onClose }: Props) {
  const [phase, setPhase] = useState<"ready" | "gateway" | "verify" | "fail">("ready");
  const [error, setError] = useState("");

  if (!payment || !level) return null;

  const startCheckout = async () => {
    if (!paystackPublicKey) {
      setError("Paystack is not configured. Add VITE_PAYSTACK_PUBLIC_KEY to .env.local and restart the app.");
      return;
    }
    setError("");
    setPhase("gateway");
    try {
      await loadPaystack();
      if (!window.PaystackPop) throw new Error("Paystack checkout is unavailable.");
      new window.PaystackPop().newTransaction({
        key: paystackPublicKey,
        email,
        amount: payment.amount * 100,
        ref: payment.reference,
        currency: "NGN",
        onCancel: () => setPhase("ready"),
        onSuccess: async (response) => {
          setPhase("verify");
          try {
            await verifyPayment(response.reference, payment.userId);
            onDone(true);
          } catch (verificationError) {
            setError(verificationError instanceof Error ? verificationError.message : "Payment verification failed.");
            setPhase("fail");
          }
        },
      });
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Could not start payment.");
      setPhase("fail");
    }
  };

  return (
    <Modal open onClose={phase === "ready" || phase === "fail" ? onClose : () => {}} title="Secure Checkout">
      <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
        <div>
          <p className="text-xs text-slate-500">{level.name} Membership</p>
          <p className="text-lg font-bold text-slate-900">{fmtN(payment.amount)}</p>
        </div>
        <span className="rounded-full bg-green-100 px-3 py-1 text-[11px] font-semibold text-green-800">LIVE PAYSTACK</span>
      </div>

      {(phase === "ready" || phase === "fail") && (
        <div className="space-y-4">
          <div>
            <p className="text-xs text-slate-500">Paying as</p>
            <p className="text-sm font-medium text-slate-800">{email}</p>
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-relaxed text-red-700">{error}</p>}
          {phase === "fail" && <p className="text-xs leading-relaxed text-slate-500">No membership was activated. You can retry after checking the payment configuration or gateway response.</p>}
          <Button className="w-full" onClick={startCheckout}>
            <Lock className="h-4 w-4" /> Pay {fmtN(payment.amount)} securely
          </Button>
          <p className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            Payment is processed by Paystack. Membership activates only after server-side verification.
          </p>
        </div>
      )}

      {(phase === "gateway" || phase === "verify") && (
        <div className="flex flex-col items-center py-10 text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-brand" />
          <p className="mt-5 text-sm font-semibold text-slate-800">{phase === "gateway" ? "Opening Paystack…" : "Verifying payment…"}</p>
          <p className="mt-1 font-mono text-xs text-slate-400">{payment.reference}</p>
        </div>
      )}

      {phase === "fail" && <AlertTriangle className="mx-auto mt-4 h-5 w-5 text-red-500" />}
    </Modal>
  );
}
