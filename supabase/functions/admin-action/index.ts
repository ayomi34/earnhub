import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* EarnHub admin edge function.
 * Every privileged write (levels, tasks, submission review, payouts,
 * user status, settings) is verified here: the caller must hold a valid
 * session AND an admin profile row. Writes use the service role and are
 * paired with an audit_logs entry. Financial writes are idempotent via
 * wallet_transactions.source_id unique constraint. */

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

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
  });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: adminProfile } = await admin
    .from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (!adminProfile || adminProfile.role !== "admin") {
    return json({ error: "Administrator access required" }, 403);
  }

  const body = await req.json();
  const action = body?.action as string;

  const audit = (act: string, detail: string) =>
    admin.from("audit_logs").insert({ admin_id: user.id, action: act, detail });

  switch (action) {
    /* ---------------- membership levels ---------------- */
    case "save-level": {
      const l = body.level ?? {};
      if (!l.name?.trim()) return json({ error: "Level name is required." }, 400);
      if (!l.price || l.price < 500) return json({ error: "Price must be at least ₦500." }, 400);
      const row = {
        name: l.name.trim(),
        price: Math.floor(l.price),
        description: l.description ?? "",
        features: Array.isArray(l.features) ? l.features : [],
        task_limit_per_day: l.taskLimitPerDay ?? 3,
        referral_commission: l.referralCommission ?? 5,
        enabled: l.enabled ?? true,
        sort_order: l.sortOrder ?? 99,
      };
      const { data, error } = l.id
        ? await admin.from("membership_levels").update(row).eq("id", l.id).select().single()
        : await admin.from("membership_levels").insert(row).select().single();
      if (error) return json({ error: error.message }, 500);
      await audit(l.id ? "level.update" : "level.create", `${row.name} — ₦${row.price.toLocaleString()}`);
      return json({ level: data });
    }

    case "delete-level": {
      const { data: active } = await admin
        .from("memberships").select("id").eq("level_id", body.levelId).eq("status", "active").limit(1);
      if (active && active.length) {
        return json({ error: "Cannot delete a level with active members. Disable it instead." }, 400);
      }
      const { error } = await admin.from("membership_levels").delete().eq("id", body.levelId);
      if (error) return json({ error: error.message }, 500);
      await audit("level.delete", body.levelId);
      return json({ ok: true });
    }

    /* ---------------- tasks ---------------- */
    case "save-task": {
      const t = body.task ?? {};
      if (!t.title?.trim() || !t.description?.trim()) return json({ error: "Title and description are required." }, 400);
      if (!t.reward || t.reward < 50) return json({ error: "Reward must be at least ₦50." }, 400);
      if (!Array.isArray(t.levelIds) || !t.levelIds.length) return json({ error: "Select at least one membership level." }, 400);
      const row = {
        title: t.title.trim(),
        description: t.description.trim(),
        instructions: t.instructions || "",
        category: t.category || "Other",
        reward: Math.floor(t.reward),
        est_minutes: t.estMinutes || 15,
        max_submissions: t.maxSubmissions || 100,
        daily_limit: t.dailyLimit || 1,
        level_ids: t.levelIds,
        verification: t.verification || "manual_review",
        starts_at: new Date(t.startsAt || Date.now()).toISOString(),
        ends_at: new Date(t.endsAt || Date.now() + 90 * 86400000).toISOString(),
        status: t.status || "active",
      };
      const { data, error } = t.id
        ? await admin.from("tasks").update(row).eq("id", t.id).select().single()
        : await admin.from("tasks").insert(row).select().single();
      if (error) return json({ error: error.message }, 500);
      await audit(t.id ? "task.update" : "task.create", `${row.title} — ₦${row.reward.toLocaleString()}`);
      return json({ task: data });
    }

    case "delete-task": {
      const { error } = await admin.from("tasks").delete().eq("id", body.taskId);
      if (error) return json({ error: error.message }, 500);
      await audit("task.delete", body.taskId);
      return json({ ok: true });
    }

    /* ---------------- bulk task import (CSV / XLSX) ---------------- */
    case "import-tasks": {
      const rows: any[] = Array.isArray(body.tasks) ? body.tasks : [];
      if (!rows.length) return json({ error: "No rows to import." }, 400);
      if (rows.length > 500) return json({ error: "Import is limited to 500 tasks per file." }, 400);

      const inserted: any[] = [];
      const errors: { row: number; message: string }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNo = i + 2; // +1 header, +1 human numbering
        const title = String(r.title ?? "").trim();
        const description = String(r.description ?? "").trim();
        const reward = Math.floor(Number(r.reward));
        const levelIds: string[] = Array.isArray(r.level_ids) ? r.level_ids : [];

        if (!title) { errors.push({ row: rowNo, message: "Missing title" }); continue; }
        if (!description) { errors.push({ row: rowNo, message: "Missing description" }); continue; }
        if (!reward || reward < 50) { errors.push({ row: rowNo, message: "Reward must be at least ₦50" }); continue; }
        if (!levelIds.length) { errors.push({ row: rowNo, message: "No membership levels selected" }); continue; }

        const start = r.starts_at ? new Date(r.starts_at) : null;
        const end = r.ends_at ? new Date(r.ends_at) : null;
        if (start && isNaN(start.getTime())) { errors.push({ row: rowNo, message: `Invalid starts_at date: ${r.starts_at}` }); continue; }
        if (end && isNaN(end.getTime())) { errors.push({ row: rowNo, message: `Invalid ends_at date: ${r.ends_at}` }); continue; }

        const { data, error } = await admin.from("tasks").insert({
          title,
          description,
          instructions: String(r.instructions ?? "").trim(),
          category: String(r.category ?? "Other").trim() || "Other",
          reward,
          est_minutes: Number(r.est_minutes) > 0 ? Math.floor(Number(r.est_minutes)) : 15,
          max_submissions: Number(r.max_submissions) > 0 ? Math.floor(Number(r.max_submissions)) : 100,
          daily_limit: Number(r.daily_limit) > 0 ? Math.floor(Number(r.daily_limit)) : 1,
          level_ids: levelIds,
          verification: ["manual_review", "link_check", "code_check"].includes(r.verification) ? r.verification : "manual_review",
          starts_at: (start ?? new Date()).toISOString(),
          ends_at: (end ?? new Date(Date.now() + 90 * 86400000)).toISOString(),
          status: ["draft", "active", "paused", "archived"].includes(r.status) ? r.status : "active",
        }).select().single();
        if (error) { errors.push({ row: rowNo, message: error.message }); continue; }
        inserted.push(data);
      }

      await audit("task.import", `${inserted.length} tasks imported, ${errors.length} rows failed`);
      return json({ inserted, failed: errors });
    }

    /* ---------------- submission review (atomic pay) ---------------- */
    case "review-submission": {
      const { submissionId, approve, note = "" } = body;
      if (!approve && note.trim().length < 5) return json({ error: "Provide a reason for rejection." }, 400);

      const { data: sub } = await admin.from("task_submissions").select("*").eq("id", submissionId).maybeSingle();
      if (!sub) return json({ error: "Submission not found." }, 404);
      if (sub.status !== "submitted") return json({ error: "This submission has already been reviewed." }, 400);
      const { data: task } = await admin.from("tasks").select("*").eq("id", sub.task_id).maybeSingle();
      if (!task) return json({ error: "Task no longer exists." }, 404);

      const { data: updated, error: upErr } = await admin.from("task_submissions").update({
        status: approve ? "approved" : "rejected",
        review_note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
      }).eq("id", submissionId).select().single();
      if (upErr) return json({ error: upErr.message }, 500);

      if (approve) {
        // reward credit — guarded by source_id for idempotency
        const { data: existingCredit } = await admin
          .from("wallet_transactions").select("id").eq("source_id", sub.id).maybeSingle();
        if (!existingCredit) {
          const { error: creditErr } = await admin.from("wallet_transactions").insert({
            user_id: sub.user_id, type: "task_reward", direction: "credit",
            amount: task.reward, status: "approved", description: task.title,
            reference: `EH-TSK-${submissionId}`,
            source_id: sub.id,
          });
          if (creditErr) return json({ error: creditErr.message }, 500);

          // single-level referral commission on real approved work
          const { data: ref } = await admin.from("referrals")
            .select("*").eq("referred_id", sub.user_id).eq("status", "active").maybeSingle();
          if (ref) {
            const { data: refProfile } = await admin.from("profiles")
              .select("id, status, membership_id").eq("id", ref.referrer_id).maybeSingle();
            const { data: refMembership } = refProfile?.membership_id
              ? await admin.from("memberships")
                  .select("level_id").eq("id", refProfile.membership_id).eq("status", "active").maybeSingle()
              : { data: null };
            if (refProfile && refProfile.status === "active" && refMembership) {
              const { data: lvl } = await admin.from("membership_levels")
                .select("referral_commission").eq("id", refMembership.level_id).maybeSingle();
              const pct = Number(lvl?.referral_commission ?? 5);
              const commission = Math.round((task.reward * pct) / 100);
              if (commission > 0) {
                const { error: refErr } = await admin.from("wallet_transactions").insert({
                  user_id: ref.referrer_id, type: "referral_bonus", direction: "credit",
                  amount: commission, status: "approved",
                  description: `Commission (${pct}%) — ${task.title}`,
                  reference: `EH-REF-${submissionId}`,
                  source_id: `ref-${sub.id}`,
                });
                if (!refErr) {
                  await admin.from("referrals").update({ earned: ref.earned + commission }).eq("id", ref.id);
                  await admin.from("notifications").insert({
                    user_id: ref.referrer_id, type: "referral",
                    title: "Referral commission earned",
                    body: `You earned ₦${commission.toLocaleString()} (${pct}%) from an approved task by your referral.`,
                  });
                }
              }
            }
          }

          await admin.from("notifications").insert({
            user_id: sub.user_id, type: "task",
            title: "Task approved — reward credited",
            body: `“${task.title}” was approved. ₦${task.reward.toLocaleString()} has been added to your available balance.`,
          });
        }
      } else {
        await admin.from("notifications").insert({
          user_id: sub.user_id, type: "task",
          title: "Task submission rejected",
          body: `“${task.title}” was rejected. Reason: ${note.trim()}`,
        });
      }
      await audit(approve ? "submission.approve" : "submission.reject", `${submissionId}${note ? ` — ${note}` : ""}`);
      return json({ submission: updated });
    }

    /* ---------------- withdrawals (ledger-checked payout) ---------------- */
    case "set-withdrawal": {
      const { withdrawalId, action: wa, payoutRef = "", note = "" } = body;
      if (wa === "rejected" && note.trim().length < 5) return json({ error: "Provide a reason for rejection." }, 400);
      if (wa === "paid" && !payoutRef.trim()) return json({ error: "Enter the bank/payout transaction reference." }, 400);

      const { data: w } = await admin.from("withdrawals").select("*").eq("id", withdrawalId).maybeSingle();
      if (!w) return json({ error: "Withdrawal not found." }, 404);
      const valid: Record<string, string[]> = {
        processing: ["pending"], paid: ["pending", "processing"], rejected: ["pending", "processing"],
      };
      if (!valid[wa]?.includes(w.status)) {
        return json({ error: `Cannot move a ${w.status} withdrawal to ${wa}.` }, 400);
      }

      if (wa === "paid") {
        // re-check the ledger before releasing money
        const [txsRes, holdsRes] = await Promise.all([
          admin.from("wallet_transactions").select("direction, amount, status").eq("user_id", w.user_id),
          admin.from("withdrawals").select("amount, fee").eq("user_id", w.user_id).in("status", ["pending", "processing"]),
        ]);
        const credits = (txsRes.data ?? []).filter((t) => t.status === "approved" && t.direction === "credit").reduce((s, t) => s + Number(t.amount), 0);
        const debits = (txsRes.data ?? []).filter((t) => t.status === "approved" && t.direction === "debit").reduce((s, t) => s + Number(t.amount), 0);
        const held = (holdsRes.data ?? []).reduce((s, h) => s + Number(h.amount) + Number(h.fee), 0);
        if (credits - debits - held < w.amount + w.fee) {
          return json({ error: "Insufficient ledger balance for this payout." }, 400);
        }
        // debit — idempotent via source_id = withdrawal id
        const { data: existingDebit } = await admin
          .from("wallet_transactions").select("id").eq("source_id", w.id).maybeSingle();
        if (!existingDebit) {
          const { error: debitErr } = await admin.from("wallet_transactions").insert({
            user_id: w.user_id, type: "withdrawal", direction: "debit",
            amount: w.amount + w.fee, status: "approved",
            description: `Withdrawal to ${w.bank} ${w.account_number}`,
            reference: w.reference, source_id: w.id,
          });
          if (debitErr) return json({ error: debitErr.message }, 500);
        }
      }

      const { data: updated, error: upErr } = await admin.from("withdrawals").update({
        status: wa,
        payout_ref: wa === "paid" ? payoutRef.trim() : w.payout_ref,
        note: note.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq("id", withdrawalId).select().single();
      if (upErr) return json({ error: upErr.message }, 500);

      const msgs: Record<string, [string, string]> = {
        processing: ["Withdrawal is processing", `Your withdrawal of ₦${Number(w.amount).toLocaleString()} is being processed. Funds remain held until payout.`],
        paid: ["Withdrawal paid", `₦${Number(w.amount).toLocaleString()} was sent to ${w.bank} (${w.account_number}). Payout ref: ${payoutRef}.`],
        rejected: ["Withdrawal rejected", `Your withdrawal of ₦${Number(w.amount).toLocaleString()} was rejected and the hold released. Reason: ${note}.`],
      };
      await admin.from("notifications").insert({
        user_id: w.user_id, type: "withdrawal", title: msgs[wa][0], body: msgs[wa][1],
      });
      await audit(`withdrawal.${wa}`, `${withdrawalId} ${payoutRef || note}`.trim());
      return json({ withdrawal: updated });
    }

    /* ---------------- user status ---------------- */
    case "set-user-status": {
      const { userId, status } = body;
      if (!["active", "suspended"].includes(status)) return json({ error: "Invalid status." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target) return json({ error: "User not found." }, 404);
      if (target.role === "admin") return json({ error: "Admin accounts cannot be suspended here." }, 400);
      const { error } = await admin.from("profiles").update({ status }).eq("id", userId);
      if (error) return json({ error: error.message }, 500);
      await audit(`user.${status}`, userId);
      return json({ ok: true });
    }

    /* ---------------- platform settings ---------------- */
    case "save-settings": {
      const s = body.settings ?? {};
      if (!s.platformName?.trim()) return json({ error: "Platform name is required." }, 400);
      if (Number(s.minWithdrawal) < 100) return json({ error: "Minimum withdrawal must be at least ₦100." }, 400);
      const { error } = await admin.from("platform_settings").upsert({
        id: true, payload: s, updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      await audit("settings.update", JSON.stringify({
        minWithdrawal: s.minWithdrawal, referral: s.referralPercentDefault,
      }));
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
});