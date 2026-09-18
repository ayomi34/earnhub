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

  const { reference } = await req.json();
  if (!reference) return json({ error: "Payment reference is required" }, 400);

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
    return json({ payment, membership: existingMembership });
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
  if (!gatewayResponse.ok || !gateway?.status || transaction?.status !== "success" || !amountMatches) {
    const { data: failedPayment } = await admin.from("payments").update({
      status: "failed",
      gateway_status: transaction?.status || "failed",
    }).eq("id", payment.id).select().single();
    return json({ error: "Paystack could not verify this payment", payment: failedPayment || payment }, 400);
  }

  const { data: verifiedPayment, error: updateError } = await admin.from("payments").update({
    status: "success",
    gateway_status: "success",
    verified_at: new Date().toISOString(),
  }).eq("id", payment.id).select().single();
  if (updateError) return json({ error: updateError.message }, 500);

  await admin.from("memberships").update({ status: "expired" })
    .eq("user_id", user.id).eq("status", "active");
  const { data: membership, error: membershipError } = await admin.from("memberships").insert({
    user_id: user.id,
    level_id: payment.level_id,
    payment_id: payment.id,
    status: "active",
  }).select().single();
  if (membershipError) return json({ error: membershipError.message }, 500);

  await admin.from("profiles").update({ membership_id: membership.id }).eq("id", user.id);

  await admin.from("notifications").insert({
    user_id: user.id, type: "payment",
    title: "Payment successful",
    body: `Your payment of ₦${Number(payment.amount).toLocaleString()} for the ${level.name} level was verified. Reference: ${reference}.`,
  });
  await admin.from("notifications").insert({
    user_id: user.id, type: "membership",
    title: `${level.name} membership activated`,
    body: `You now have access to ${level.name} tasks. Complete approved tasks to earn — membership itself does not generate income.`,
  });

  // Activate the referral relationship (commissions flow from real task work)
  const { data: profileRow } = await admin.from("profiles")
    .select("referred_by, full_name").eq("id", user.id).maybeSingle();
  if (profileRow?.referred_by) {
    const { data: ref } = await admin.from("referrals")
      .select("id, status").eq("referred_id", user.id).maybeSingle();
    if (ref && ref.status === "pending") {
      await admin.from("referrals").update({ status: "active" }).eq("id", ref.id);
      await admin.from("notifications").insert({
        user_id: profileRow.referred_by, type: "referral",
        title: "Referral activated",
        body: `${profileRow.full_name} activated a membership. You'll now earn commission on their approved task rewards.`,
      });
    }
  }

  return json({ payment: verifiedPayment, membership });
});