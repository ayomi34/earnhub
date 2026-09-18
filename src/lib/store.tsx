import {
  createContext, useCallback, useContext, useMemo, useRef, useState,
  useSyncExternalStore, type ReactNode,
} from "react";
import { subscribe, getVersion } from "./db";
import { getSessionUser, settings } from "./services";
import type { Profile, Settings } from "./types";

/* Re-render hook: any db write bumps the version */
export function useDBVersion() {
  return useSyncExternalStore(subscribe, getVersion);
}

export function useUser(): Profile | null {
  useDBVersion();
  return getSessionUser();
}

export function useSettings(): Settings {
  useDBVersion();
  return settings();
}

export function useData<T>(fn: () => T): T {
  const version = useDBVersion();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(fn, [version]);
}

/* ---------------- navigation (hash router) ---------------- */

export function navigate(to: string) {
  window.location.hash = to.startsWith("/") ? to : `/${to}`;
}

export function useRoute(): { path: string; query: URLSearchParams } {
  const get = () => window.location.hash;
  const hash = useSyncExternalStore((cb) => {
    window.addEventListener("hashchange", cb);
    return () => window.removeEventListener("hashchange", cb);
  }, get);
  const raw = hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  return { path: path || "/", query: new URLSearchParams(qs || "") };
}

/* ---------------- toasts ---------------- */

export interface Toast {
  id: number;
  kind: "success" | "error" | "info";
  text: string;
}

const ToastCtx = createContext<(kind: Toast["kind"], text: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text }].slice(-4));
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[200] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-in pointer-events-auto rounded-lg border px-4 py-3 text-sm shadow-lg ${
              t.kind === "success"
                ? "border-green-200 bg-green-50 text-green-900"
                : t.kind === "error"
                ? "border-red-200 bg-red-50 text-red-900"
                : "border-slate-200 bg-white text-slate-800"
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

/** Run an async service call with loading + error toast handling */
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async <T,>(fn: () => Promise<T>, okMsg?: string): Promise<T | null> => {
      setBusy(true);
      try {
        const result = await fn();
        if (okMsg) toast("success", okMsg);
        return result;
      } catch (e) {
        toast("error", e instanceof Error ? e.message : "Something went wrong.");
        return null;
      } finally {
        setBusy(false);
      }
    },
    [toast]
  );
  return { busy, run };
}
