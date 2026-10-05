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

    case "update-user-profile": {
      const userId = String(body.userId || "");
      const fullName = String(body.fullName || "").trim();
      const phone = String(body.phone || "").trim();
      if (fullName.length < 3 || fullName.length > 100) return json({ error: "Name must be between 3 and 100 characters." }, 400);
      if (phone.length > 30) return json({ error: "Phone number is too long." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target || target.role === "admin") return json({ error: "User not found." }, 404);
      const { error } = await admin.from("profiles").update({ full_name: fullName, phone }).eq("id", userId);
      if (error) return json({ error: error.message }, 500);
      await audit("user.profile.update", `${userId} ${fullName}`);
      return json({ ok: true });
    }

    case "set-user-role": {
      const userId = String(body.userId || "");
      const role = String(body.role || "");
      if (!["user", "admin"].includes(role)) return json({ error: "Invalid role." }, 400);
      if (userId === user.id) return json({ error: "You cannot change your own administrator role." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target) return json({ error: "User not found." }, 404);
      if (target.role === "admin" && role === "user") {
        const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
        if ((count ?? 0) <= 1) return json({ error: "The last administrator cannot be demoted." }, 400);
      }
      const { error } = await admin.from("profiles").update({ role }).eq("id", userId);
      if (error) return json({ error: error.message }, 500);
      await audit("user.role.update", `${userId} ${target.role} -> ${role}`);
      return json({ ok: true });
    }

    case "set-user-membership": {
      const userId = String(body.userId || "");
      const levelId = String(body.levelId || "");
      const { data: target } = await admin.from("profiles").select("role, membership_id").eq("id", userId).maybeSingle();
      if (!target || target.role === "admin") return json({ error: "User not found." }, 404);
      const { data: activeMemberships, error: activeError } = await admin
        .from("memberships").select("id").eq("user_id", userId).eq("status", "active");
      if (activeError) return json({ error: activeError.message }, 500);

      if (!levelId) {
        const { error: expireError } = await admin.from("memberships").update({ status: "expired" }).eq("user_id", userId).eq("status", "active");
        if (expireError) return json({ error: expireError.message }, 500);
        const { error } = await admin.from("profiles").update({ membership_id: null }).eq("id", userId);
        if (error) {
          for (const membership of activeMemberships ?? []) {
            await admin.from("memberships").update({ status: "active" }).eq("id", membership.id);
          }
          return json({ error: error.message }, 500);
        }
        await audit("user.membership.remove", userId);
        return json({ ok: true });
      }

      const { data: level } = await admin.from("membership_levels").select("id, name, price, enabled").eq("id", levelId).maybeSingle();
      if (!level || !level.enabled) return json({ error: "Choose an enabled membership level." }, 400);
      const paymentId = crypto.randomUUID();
      const { error: paymentError } = await admin.from("payments").insert({
        id: paymentId,
        user_id: userId,
        level_id: levelId,
        amount: level.price,
        reference: `EH-ADMIN-${crypto.randomUUID()}`,
        gateway: "admin",
        gateway_status: "admin_granted",
        status: "pending",
      });
      if (paymentError) return json({ error: paymentError.message }, 500);

      const { error: expireError } = await admin.from("memberships").update({ status: "expired" }).eq("user_id", userId).eq("status", "active");
      if (expireError) {
        await admin.from("payments").delete().eq("id", paymentId);
        return json({ error: expireError.message }, 500);
      }
      const { data: membership, error: membershipError } = await admin.from("memberships").insert({
        user_id: userId,
        level_id: levelId,
        payment_id: paymentId,
        status: "active",
      }).select("id").single();
      if (membershipError || !membership) {
        await admin.from("payments").delete().eq("id", paymentId);
        for (const previous of activeMemberships ?? []) {
          await admin.from("memberships").update({ status: "active" }).eq("id", previous.id);
        }
        return json({ error: membershipError?.message || "Could not assign membership." }, 500);
      }
      const { error: profileError } = await admin.from("profiles").update({ membership_id: membership.id }).eq("id", userId);
      if (profileError) {
        await admin.from("memberships").delete().eq("id", membership.id);
        await admin.from("payments").delete().eq("id", paymentId);
        for (const previous of activeMemberships ?? []) {
          await admin.from("memberships").update({ status: "active" }).eq("id", previous.id);
        }
        return json({ error: profileError.message }, 500);
      }
      await audit("user.membership.assign", `${userId} ${level.name}`);
      return json({ ok: true });
    }

    case "adjust-user-wallet": {
      const userId = String(body.userId || "");
      const direction = String(body.direction || "");
      const amount = Number(body.amount);
      const reason = String(body.reason || "").trim();
      if (!["credit", "debit"].includes(direction)) return json({ error: "Choose credit or debit." }, 400);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000000) return json({ error: "Amount must be between ₦1 and ₦10,000,000." }, 400);
      if (reason.length < 5 || reason.length > 300) return json({ error: "Enter a reason between 5 and 300 characters." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target || target.role === "admin") return json({ error: "User not found." }, 404);
      const [{ data: balance, error: balanceError }, { data: holds, error: holdsError }] = await Promise.all([
        admin.from("wallet_balances").select("ledger_balance").eq("user_id", userId).maybeSingle(),
        admin.from("withdrawals").select("amount, fee").eq("user_id", userId).in("status", ["pending", "processing"]),
      ]);
      if (balanceError || holdsError) return json({ error: balanceError?.message || holdsError?.message || "Could not verify the available balance." }, 500);
      const available = Number(balance?.ledger_balance || 0) - (holds ?? []).reduce((sum: number, row: any) => sum + Number(row.amount || 0) + Number(row.fee || 0), 0);
      if (direction === "debit" && amount > available) return json({ error: `Debit exceeds the available balance of ₦${Math.max(0, available).toLocaleString()}.` }, 400);
      const { error } = await admin.from("wallet_transactions").insert({
        user_id: userId,
        type: "adjustment",
        direction,
        amount,
        status: "approved",
        description: `Admin adjustment: ${reason}`,
        reference: `EH-ADJ-${crypto.randomUUID()}`,
        source_id: crypto.randomUUID(),
      });
      if (error) return json({ error: error.message }, 500);
      await audit("user.wallet.adjust", `${userId} ${direction} ₦${amount} — ${reason}`);
      return json({ ok: true });
    }

    case "remove-user": {
      const userId = String(body.userId || "");
      if (userId === user.id) return json({ error: "You cannot remove your own account." }, 400);
      const { data: target } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
      if (!target || target.role === "admin") return json({ error: "Admin accounts cannot be removed here." }, 400);
      const anonymizedEmail = `removed-${userId}@deleted.invalid`;
      const { error: authUpdateError } = await admin.auth.admin.updateUserById(userId, {
        email: anonymizedEmail,
        ban_duration: "876000h",
        user_metadata: {},
      });
      if (authUpdateError) return json({ error: authUpdateError.message }, 500);
      const { error } = await admin.from("profiles").update({
        full_name: "Removed account",
        email: anonymizedEmail,
        phone: "",
        bank: null,
        status: "suspended",
      }).eq("id", userId);
      if (error) return json({ error: error.message }, 500);
      await audit("user.remove", userId);
      return json({ ok: true, anonymizedEmail });
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

    /* ---------------- daily spin ---------------- */
    case "save-spin-settings": {
      const cfg = body.config ?? {};
      if (typeof cfg.enabled !== "boolean") return json({ error: "Invalid spin toggle." }, 400);
      if (typeof cfg.requireVerified !== "boolean" || typeof cfg.requireMembership !== "boolean")
        return json({ error: "Invalid eligibility settings." }, 400);
      const budget = Math.floor(Number(cfg.dailyBudget));
      if (!Number.isFinite(budget) || budget < 0) return json({ error: "Daily budget must be zero or more." }, 400);
      const segs: any[] = Array.isArray(cfg.segments) ? cfg.segments : [];
      if (segs.length < 2 || segs.length > 12) return json({ error: "The wheel needs between 2 and 12 segments." }, 400);
      for (const seg of segs) {
        if (!String(seg.label ?? "").trim() || String(seg.label).trim().length > 24)
          return json({ error: "Every segment needs a label of at most 24 characters." }, 400);
        if (!["cash", "bonus_task", "none"].includes(seg.type)) return json({ error: "Invalid segment type." }, 400);
        const amount = Math.floor(Number(seg.amount || 0));
        if (!Number.isFinite(amount) || amount < 0 || (seg.type === "cash" && amount < 1))
          return json({ error: `Cash segment "${seg.label}" needs an amount of at least ₦1.` }, 400);
        const weight = Number(seg.weight);
        if (!Number.isFinite(weight) || weight < 1 || weight > 1000)
          return json({ error: `Segment "${seg.label}" needs a probability weight between 1 and 1000.` }, 400);
        if (!/^#[0-9a-fA-F]{6}$/.test(String(seg.color ?? "")))
          return json({ error: `Segment "${seg.label}" needs a valid colour.` }, 400);
      }
      const config = {
        enabled: cfg.enabled,
        requireVerified: cfg.requireVerified,
        requireMembership: cfg.requireMembership,
        dailyBudget: budget,
        segments: segs.map((s) => ({
          label: String(s.label).trim(),
          type: s.type,
          amount: Math.floor(Number(s.amount || 0)),
          weight: Number(s.weight),
          color: String(s.color),
        })),
      };
      const { data: row } = await admin.from("platform_settings").select("payload").eq("id", true).maybeSingle();
      const payload = { ...((row?.payload as any) ?? {}), spin: config };
      const { error } = await admin.from("platform_settings").upsert({
        id: true, payload, updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      await audit("spin.settings", `${config.segments.length} segments · budget ₦${budget.toLocaleString()}`);
      return json({ ok: true, config });
    }

    case "set-spin-reward": {
      const { spinId, decision, note = "" } = body;
      if (!["approve", "reject"].includes(decision)) return json({ error: "Invalid decision." }, 400);
      if (decision === "reject" && String(note).trim().length < 5)
        return json({ error: "Provide a reason for rejecting this reward." }, 400);
      const { data: spin } = await admin.from("spins").select("*").eq("id", spinId).maybeSingle();
      if (!spin) return json({ error: "Spin not found." }, 404);
      if (spin.reward_type !== "cash" || spin.status !== "pending")
        return json({ error: "Only pending cash rewards can be reviewed." }, 400);
      const newStatus = decision === "approve" ? "approved" : "rejected";
      const { error: spinErr } = await admin.from("spins").update({ status: newStatus }).eq("id", spinId);
      if (spinErr) return json({ error: spinErr.message }, 500);
      const { error: txErr } = await admin.from("wallet_transactions")
        .update({ status: newStatus }).eq("source_id", spinId);
      if (txErr) return json({ error: txErr.message }, 500);
      await admin.from("notifications").insert({
        user_id: spin.user_id,
        type: "system",
        title: decision === "approve" ? "Spin reward approved" : "Spin reward declined",
        body: decision === "approve"
          ? `Your daily spin reward of ₦${Number(spin.amount).toLocaleString()} has been approved and credited to your balance.`
          : `Your daily spin reward of ₦${Number(spin.amount).toLocaleString()} was declined: ${String(note).trim()}`,
      });
      await audit(`spin.reward.${decision}`, `${spin.reference} — ₦${Number(spin.amount).toLocaleString()}`);
      return json({ ok: true });
    }

    /* ---------------- survey feud ---------------- */
    case "save-feud-settings": {
      const cfg = body.config ?? {};
      const { data: row } = await admin.from("platform_settings").select("payload").eq("id", true).maybeSingle();
      const payload = { ...((row?.payload as any) ?? {}), feud: cfg };
      const { error } = await admin.from("platform_settings").upsert({
        id: true, payload, updated_at: new Date().toISOString(),
      });
      if (error) return json({ error: error.message }, 500);
      await audit("feud.settings", `Target ${cfg.targetPoints || 200} pts · ${cfg.timeLimitSeconds || 25}s`);
      return json({ ok: true, config: cfg });
    }

    case "save-feud-question": {
      const q = body.question ?? {};
      if (!q.prompt?.trim()) return json({ error: "Prompt is required." }, 400);
      if (!Array.isArray(q.answers) || q.answers.length === 0) return json({ error: "Answers required." }, 400);
      const { error } = await admin.from("feud_questions").upsert({
        id: q.id,
        prompt: q.prompt.trim(),
        category: q.category || "General",
        difficulty: q.difficulty || "easy",
        explanation: q.explanation || null,
        answers: q.answers,
        status: q.status || "active",
      });
      if (error) return json({ error: error.message }, 500);
      await audit("feud.question.save", `Question: ${q.prompt.slice(0, 40)}`);
      return json({ ok: true, question: q });
    }

    case "delete-feud-question": {
      const { questionId } = body;
      const { error } = await admin.from("feud_questions").delete().eq("id", questionId);
      if (error) return json({ error: error.message }, 500);
      await audit("feud.question.delete", `Question ID: ${questionId}`);
      return json({ ok: true });
    }

    case "import-feud-questions": {
      const list: any[] = Array.isArray(body.questions) ? body.questions : [];
      let inserted = 0;
      let failed = 0;
      const errors: { row: number; error: string }[] = [];

      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        if (!item.prompt?.trim() || !Array.isArray(item.answers) || item.answers.length === 0) {
          failed++;
          errors.push({ row: i + 1, error: "Missing prompt or answers" });
          continue;
        }
        const { error } = await admin.from("feud_questions").insert({
          prompt: item.prompt.trim(),
          category: item.category || "General",
          difficulty: item.difficulty || "easy",
          explanation: item.explanation || null,
          answers: item.answers,
          status: item.status || "active",
        });
        if (error) {
          failed++;
          errors.push({ row: i + 1, error: error.message });
        } else {
          inserted++;
        }
      }
      await audit("feud.questions.import", `Imported ${inserted} questions, ${failed} failed`);
      return json({ inserted, failed, errors });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
});