import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* Paystack server-side verification — the ONLY path that can activate a
 * membership. The paid amount is checked against the membership level's
 * price stored in the database (never a client-supplied value), and the
 * whole flow is idempotent per payment reference. */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Authentication required" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const paystackSecret = Deno.env.get("PAYSTACK_SECRET_KEY");
  if (!paystackSecret) return json({ error: "Payment verification is not configured" }, 500);

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const reference = typeof body?.reference === "string" ? body.reference.trim() : "";
  if (!reference || reference.length > 128) return json({ error: "Payment reference is required" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .select("*")
    .eq("reference", reference)
    .eq("user_id", user.id)
    .single();
  if (paymentError || !payment) return json({ error: "Payment record not found" }, 404);

  if (payment.status === "success") {
    const { data: existingMembership } = await admin
      .from("memberships").select("*").eq("payment_id", payment.id).maybeSingle();
    if (existingMembership) {
      const { data: fulfillment, error: fulfillmentError } = await admin.rpc("fulfill_verified_payment", {
        p_payment_id: payment.id,
        p_user_id: user.id,
      });
      if (fulfillmentError) return json({ error: "Could not restore the membership link. Please retry." }, 500);
      if (fulfillment?.error) return json({ error: fulfillment.error }, Number(fulfillment.status) || 400);
      return json({ payment: fulfillment.payment, membership: fulfillment.membership });
    }
  }

  // Server-side price: compare the gateway charge against the level price
  // stored in the database — never against the client-inserted amount.
  const { data: level } = await admin
    .from("membership_levels").select("price, name").eq("id", payment.level_id).single();
  if (!level) return json({ error: "Membership level not found" }, 404);

  const gatewayResponse = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    { headers: { Authorization: `Bearer ${paystackSecret}` } }
  );
  const gateway = await gatewayResponse.json();
  const transaction = gateway?.data;
  const amountMatches = Number(transaction?.amount) === Number(level.price) * 100;
  const currencyMatches = transaction?.currency === "NGN";
  if (!gatewayResponse.ok || !gateway?.status || transaction?.status !== "success" || !amountMatches || !currencyMatches) {
    const { data: failedPayment } = await admin.from("payments").update({
      status: "failed",
      gateway_status: transaction?.status || "failed",
    }).eq("id", payment.id).select().single();
    return json({ error: "Paystack could not verify this payment", payment: failedPayment || payment }, 400);
  }

  // Complete payment state, membership replacement, referral ledger credit and
  // notifications in one database transaction; retries return the same membership.
  const { data: fulfillment, error: fulfillmentError } = await admin.rpc("fulfill_verified_payment", {
    p_payment_id: payment.id,
    p_user_id: user.id,
  });
  if (fulfillmentError) {
    console.error("[paystack-verify] atomic fulfillment failed:", fulfillmentError.message);
    return json({ error: "Payment was verified but activation is temporarily delayed. Please retry or contact support." }, 500);
  }
  if (fulfillment?.error) return json({ error: fulfillment.error }, Number(fulfillment.status) || 400);
  if (!fulfillment?.payment || !fulfillment?.membership)
    return json({ error: "Payment fulfillment returned an incomplete result." }, 500);
  return json({ payment: fulfillment.payment, membership: fulfillment.membership });
});