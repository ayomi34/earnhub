import { useEffect, useState } from "react";
import {
  AlertCircle, CheckCircle2, Coins, Pencil, Plus, RefreshCw,
  Save, Trash2, X,
} from "lucide-react";
import { useData, useSettings, useUser } from "../lib/store";
import { read } from "../lib/db";
import {
  adminGetAllConversions, adminGetAllGoldMineCycles,
  adminApproveConversion, adminRejectConversion,
  adminSaveSettings,
} from "../lib/services";
import { Badge, Button, Modal, fmtN } from "../components/ui";
import type { GoldMineConversion, GoldMineCycle, GoldMineLevelConfig } from "../lib/types";
import { DEFAULT_GOLD_MINE_CONFIG } from "../lib/db";

/* ── helpers ──────────────────────────────────────────────────────────── */

function statusBadge(status: string) {
  if (status === "approved") return <Badge tone="green">Approved</Badge>;
  if (status === "rejected") return <Badge tone="red">Rejected</Badge>;
  return <Badge tone="amber">Pending</Badge>;
}

/* ── Admin Gold Mine page ─────────────────────────────────────────────── */

type AdminTab = "conversions" | "cycles" | "settings";

export function AdminGoldMine() {
  const user = useUser();
  const db = useData(read);
  const s = useSettings();

  const [tab, setTab] = useState<AdminTab>("conversions");
  const [conversions, setConversions] = useState<GoldMineConversion[]>([]);
  const [cycles, setCycles] = useState<GoldMineCycle[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<GoldMineConversion | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Settings state
  const [cfg, setCfg] = useState(s.goldMine ?? DEFAULT_GOLD_MINE_CONFIG);
  const [editLevel, setEditLevel] = useState<GoldMineLevelConfig | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!user || user.role !== "admin") return;
    setLoading(true);
    Promise.all([
      adminGetAllConversions(user.id),
      adminGetAllGoldMineCycles(user.id),
    ]).then(([convs, cycs]) => {
      setConversions(convs);
      setCycles(cycs);
    }).finally(() => setLoading(false));
  }, [user?.id]);

  // Keep settings in sync
  useEffect(() => {
    setCfg(s.goldMine ?? DEFAULT_GOLD_MINE_CONFIG);
  }, [s.goldMine]);

  const handleApprove = async (conv: GoldMineConversion) => {
    if (!user) return;
    setError(""); setSuccess("");
    setActionId(conv.id);
    try {
      await adminApproveConversion(user.id, conv.id);
      setConversions((prev) => prev.map((c) => c.id === conv.id ? { ...c, status: "approved" as const } : c));
      setSuccess(`Approved ${conv.goldAmount} gold → ${fmtN(conv.cashAmount)} for user.`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  const handleReject = async () => {
    if (!user || !rejectModal) return;
    setError("");
    setActionId(rejectModal.id);
    try {
      await adminRejectConversion(user.id, rejectModal.id, rejectNote.trim());
      setConversions((prev) => prev.map((c) => c.id === rejectModal.id ? { ...c, status: "rejected" as const, note: rejectNote } : c));
      setRejectModal(null);
      setRejectNote("");
      setSuccess("Conversion rejected.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setActionId(null);
    }
  };

  const handleSaveSettings = async () => {
    if (!user) return;
    setError(""); setSuccess("");
    setSavingSettings(true);
    try {
      await adminSaveSettings(user.id, { ...s, goldMine: cfg });
      setSuccess("Gold Mine settings saved.");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingSettings(false);
    }
  };

  const saveLevelConfig = (lc: GoldMineLevelConfig) => {
    setCfg((prev) => {
      const existing = prev.levelConfigs.findIndex((x) => x.levelId === lc.levelId);
      const updated = [...prev.levelConfigs];
      if (existing >= 0) updated[existing] = lc;
      else updated.push(lc);
      return { ...prev, levelConfigs: updated };
    });
    setEditLevel(null);
  };

  const removeLevelConfig = (levelId: string) => {
    setCfg((prev) => ({ ...prev, levelConfigs: prev.levelConfigs.filter((lc) => lc.levelId !== levelId) }));
  };

  const pendingConversions = conversions.filter((c) => c.status === "pending");
  const levels = db.levels.filter((l) => l.enabled);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-[20px] font-bold text-slate-900">Gold Mine Admin</h1>
          <p className="mt-0.5 text-sm text-slate-500">Manage cycles, conversions, and configuration</p>
        </div>
        {pendingConversions.length > 0 && (
          <Badge tone="amber">{pendingConversions.length} pending</Badge>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />{success}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
        {(["conversions", "cycles", "settings"] as AdminTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "conversions" && pendingConversions.length > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-white">
                {pendingConversions.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Conversions tab ── */}
      {tab === "conversions" && (
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          )}
          {!loading && conversions.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No conversion requests yet.</p>
          )}
          {conversions.map((conv) => (
            <div key={conv.id} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Coins className="h-4 w-4 text-yellow-500" />
                    <p className="text-sm font-semibold text-slate-800">
                      {conv.goldAmount} gold → {fmtN(conv.cashAmount)}
                    </p>
                    {statusBadge(conv.status)}
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    User: {conv.userId.slice(0, 8)}… · Ref: {conv.reference}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(conv.createdAt).toLocaleString("en-NG")}
                    {conv.feeAmount > 0 && ` · Fee: ${fmtN(conv.feeAmount)}`}
                  </p>
                  {conv.note && <p className="mt-1 text-xs text-red-500">{conv.note}</p>}
                </div>
                {conv.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleApprove(conv)}
                      disabled={actionId === conv.id}
                    >
                      {actionId === conv.id ? <RefreshCw className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50"
                      onClick={() => { setRejectModal(conv); setRejectNote(""); }}
                    >
                      <X className="h-3 w-3" /> Reject
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cycles tab ── */}
      {tab === "cycles" && (
        <div className="space-y-3">
          {loading && (
            <div className="flex justify-center py-10">
              <RefreshCw className="h-6 w-6 animate-spin text-slate-300" />
            </div>
          )}
          {!loading && cycles.length === 0 && (
            <p className="py-10 text-center text-sm text-slate-400">No cycles yet.</p>
          )}
          {cycles.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  User: {c.userId.slice(0, 8)}… · {c.goldReward} gold
                </p>
                <p className="text-xs text-slate-400">
                  {new Date(c.startedAt).toLocaleDateString("en-NG")} → {new Date(c.endsAt).toLocaleDateString("en-NG")}
                  {c.joinCost > 0 && ` · Cost: ${fmtN(c.joinCost)}`}
                </p>
              </div>
              {c.status === "active" ? (
                <Badge tone="green">Active</Badge>
              ) : c.status === "completed" ? (
                <Badge tone="brand">Completed</Badge>
              ) : (
                <Badge tone="amber">Cancelled</Badge>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === "settings" && (
        <div className="space-y-6">
          {/* Global settings */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <h3 className="text-sm font-semibold text-slate-800">Global Configuration</h3>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">Gold Mine Enabled</p>
                <p className="text-xs text-slate-400">Allow users to join cycles and convert gold</p>
              </div>
              <button
                onClick={() => setCfg((p) => ({ ...p, enabled: !p.enabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${cfg.enabled ? "bg-brand" : "bg-slate-200"}`}
              >
                <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${cfg.enabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gold → Cash Rate (₦/coin)</label>
                <input
                  type="number" min={1}
                  value={cfg.goldToCashRate}
                  onChange={(e) => setCfg((p) => ({ ...p, goldToCashRate: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Min Conversion (gold coins)</label>
                <input
                  type="number" min={1}
                  value={cfg.minConversionGold}
                  onChange={(e) => setCfg((p) => ({ ...p, minConversionGold: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Conversion Fee (%)</label>
                <input
                  type="number" min={0} max={50}
                  value={cfg.conversionFeePercent}
                  onChange={(e) => setCfg((p) => ({ ...p, conversionFeePercent: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Daily Conversions (0 = unlimited)</label>
                <input
                  type="number" min={0}
                  value={cfg.maxDailyConversions}
                  onChange={(e) => setCfg((p) => ({ ...p, maxDailyConversions: Number(e.target.value) }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
                />
              </div>
            </div>
          </div>

          {/* Per-level configs */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">Membership Level Cycles</h3>
              {levels.length > 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditLevel({
                    levelId: levels.find((l) => !cfg.levelConfigs.find((x) => x.levelId === l.id))?.id ?? levels[0].id,
                    cycleDays: 7,
                    goldReward: 50,
                    joinCost: 0,
                    maxActiveCycles: 1,
                  })}
                >
                  <Plus className="h-3.5 w-3.5" /> Add Level
                </Button>
              )}
            </div>

            {cfg.levelConfigs.length === 0 && (
              <p className="text-center text-sm text-slate-400 py-4">
                No level configurations yet. Add one to let users join cycles.
              </p>
            )}

            {cfg.levelConfigs.map((lc) => {
              const levelName = db.levels.find((l) => l.id === lc.levelId)?.name ?? lc.levelId.slice(0, 8) + "…";
              return (
                <div key={lc.levelId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{levelName}</p>
                    <p className="text-xs text-slate-500">
                      {lc.cycleDays}d · {lc.goldReward} gold · {lc.joinCost > 0 ? fmtN(lc.joinCost) + " cost" : "free"} · max {lc.maxActiveCycles}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditLevel(lc)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => removeLevelConfig(lc.levelId)}
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <Button onClick={handleSaveSettings} disabled={savingSettings}>
            {savingSettings ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Settings
          </Button>
        </div>
      )}

      {/* Reject modal */}
      <Modal open={!!rejectModal} onClose={() => setRejectModal(null)} title="Reject Conversion">
        {rejectModal && (
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Reject conversion of <strong>{rejectModal.goldAmount} gold</strong> (≈ {fmtN(rejectModal.cashAmount)}) — the user's gold will be returned.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Reason (optional)</label>
              <textarea
                rows={3}
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                placeholder="e.g. Daily limit exceeded"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-1 focus:ring-brand"
              />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1 bg-red-500 hover:bg-red-600" onClick={handleReject} disabled={!!actionId}>
                {actionId ? <RefreshCw className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                Reject
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setRejectModal(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Edit level modal */}
      <Modal open={!!editLevel} onClose={() => setEditLevel(null)} title="Configure Level Cycle">
        {editLevel && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Membership Level</label>
              <select
                value={editLevel.levelId}
                onChange={(e) => setEditLevel((p) => p ? { ...p, levelId: e.target.value } : p)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              >
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Cycle Duration (days)</label>
                <select
                  value={editLevel.cycleDays}
                  onChange={(e) => setEditLevel((p) => p ? { ...p, cycleDays: Number(e.target.value) } : p)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                >
                  {[3, 7, 14, 21, 30].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Gold Reward</label>
                <input
                  type="number" min={1}
                  value={editLevel.goldReward}
                  onChange={(e) => setEditLevel((p) => p ? { ...p, goldReward: Number(e.target.value) } : p)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Join Cost (₦, 0 = free)</label>
                <input
                  type="number" min={0}
                  value={editLevel.joinCost}
                  onChange={(e) => setEditLevel((p) => p ? { ...p, joinCost: Number(e.target.value) } : p)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Max Active Cycles</label>
                <input
                  type="number" min={1}
                  value={editLevel.maxActiveCycles}
                  onChange={(e) => setEditLevel((p) => p ? { ...p, maxActiveCycles: Number(e.target.value) } : p)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => editLevel && saveLevelConfig(editLevel)}>
                <Save className="h-4 w-4" /> Save
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditLevel(null)}>Cancel</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
