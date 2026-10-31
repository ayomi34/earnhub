import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const paystackPublicKey = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined) || "";

/* Enforce email verification before users can access the dashboard.
 * Requires "Confirm email" to be ON in Supabase Auth settings and
 * a working SMTP / custom sender configured. */
export const REQUIRE_EMAIL_CONFIRMATION = true;

export const supabase = createClient(
  supabaseUrl ?? "https://placeholder.supabase.co",
  supabaseAnonKey ?? "public-anon-key-placeholder",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);