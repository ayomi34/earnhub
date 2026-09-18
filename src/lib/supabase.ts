import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
export const paystackPublicKey = (import.meta.env.VITE_PAYSTACK_PUBLIC_KEY as string | undefined) || "";

/* Email confirmation is disabled until a sending domain is set up (see
 * docs/email-setup.md). Set to true — together with "Confirm email" ON in
 * Supabase and custom SMTP — before production launch. */
export const REQUIRE_EMAIL_CONFIRMATION = false;

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