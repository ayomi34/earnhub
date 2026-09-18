import { useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload } from "lucide-react";
import { Badge, Button, Modal, fmtN } from "./ui";
import { adminImportTasks, type ImportResult } from "../lib/services";
import { useAction, useToast, useUser } from "../lib/store";
import type { MembershipLevel } from "../lib/types";

/* ================= CSV / XLSX task importer =================
 * Admins download the template, fill it in, and upload CSV or Excel.
 * Rows are validated here for instant feedback, then sent to the
 * `admin-action` edge function which re-validates and inserts them with
 * the service role. Valid rows import even when others fail. */

const CATEGORIES = [
  "Data Entry", "Surveys", "Content", "Research", "Social Media",
  "Website Testing", "Digital Services", "Other",
];

const VERIFICATIONS = ["manual_review", "link_check", "code_check"];
const STATUSES = ["draft", "active", "paused", "archived"];

/* Accepted header spellings -> canonical field name */
const HEADER_ALIASES: Record<string, string> = {
  title: "title", task: "title", task_title: "title", name: "title",
  description: "description", desc: "description", details: "description",
  instructions: "instructions", steps: "instructions", how_to: "instructions",
  category: "category", type: "category",
  reward: "reward", amount: "reward", pay: "reward", price: "reward",
  est_minutes: "est_minutes", minutes: "est_minutes", est_min: "est_minutes", duration: "est_minutes",
  max_submissions: "max_submissions", slots: "max_submissions", max_slots: "max_submissions", submissions: "max_submissions",
  daily_limit: "daily_limit", daily: "daily_limit", per_day: "daily_limit",
  levels: "levels", level: "levels", membership: "levels",
  membership_levels: "levels", membership_level: "levels", tier: "levels", levels_allowed: "levels",
  verification: "verification", verify: "verification",
  starts_at: "starts_at", start: "starts_at", start_date: "starts_at",
  ends_at: "ends_at", end: "ends_at", end_date: "ends_at", deadline: "ends_at",
  status: "status",
};

const TEMPLATE_HEADERS = [
  "title", "description", "instructions", "category", "reward",
  "est_minutes", "max_submissions", "daily_limit", "levels",
  "verification", "starts_at", "ends_at", "status",
];

const normalizeKey = (key: string) =>
  HEADER_ALIASES[key.trim().toLowerCase().replace(/[\s\-.]+/g, "_")] || "";

const escapeCsv = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function buildTemplateCsv(levels: MembershipLevel[]) {
  const exampleLevels = levels.length ? levels.slice(0, 2).map((l) => l.name).join("; ") : "Starter; Bronze";
  const rows = [
    TEMPLATE_HEADERS,
    [
      "Verify 20 product records",
      "Cross-check 20 product names, prices and SKUs against the provided source sheet and flag mismatches.",
      "1. Open the worksheet link.\n2. Compare each row with the source sheet.\n3. Submit the completed worksheet link.",
      "Data Entry",
      "450", "25", "200", "1", exampleLevels, "manual_review", "", "", "active",
    ],
    [
      "Consumer habits survey (Lagos)",
      "Complete a 12-question survey about mobile shopping habits. Honest, complete answers only.",
      "1. Open the survey.\n2. Answer all questions honestly.\n3. Submit the completion code.",
      "Surveys",
      "300", "10", "500", "1", "all", "manual_review", "", "", "active",
    ],
  ];
  return rows.map((row) => row.map((cell) => escapeCsv(String(cell))).join(",")).join("\r\n");
}

/* Excel stores dates either as Date objects (cellDates) or serial numbers */
function toIsoDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  /* Excel serial dates (days since 1899-12-30) when a numeric cell slips through */
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const serial = new Date(Math.round((value - 25569) * 86400000));
    return Number.isNaN(serial.getTime()) ? null : serial.toISOString();
  }
  const text = String(value).trim();
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseLevels(raw: unknown, levels: MembershipLevel[]) {
  const text = String(raw ?? "").trim();
  if (!text) return { ids: [] as string[], label: "" };
  const ids: string[] = [];
  const labels: string[] = [];
  for (const token of text.split(/[;|,]/).map((t) => t.trim()).filter(Boolean)) {
    if (token === "*" || /^all(\s+levels?)?$/i.test(token)) {
      levels.forEach((l) => {
        if (!ids.includes(l.id)) { ids.push(l.id); labels.push(l.name); }
      });
      continue;
    }
    const match = levels.find(
      (l) => l.id === token || l.name.toLowerCase() === token.toLowerCase()
    );
    if (match) {
      if (!ids.includes(match.id)) { ids.push(match.id); labels.push(match.name); }
    } else {
      labels.push(`?${token}`);
    }
  }
  return { ids, label: labels.join(", ") };
}

export interface ParsedRow {
  rowNo: number;
  title: string;
  description: string;
  instructions: string;
  category: string;
  reward: number;
  estMinutes: number;
  maxSubmissions: number;
  dailyLimit: number;
  levelIds: string[];
  levelLabel: string;
  verification: string;
  startsAt: string | null;
  endsAt: string | null;
  status: string;
  errors: string[];
  warnings: string[];
}

/** Turn raw spreadsheet records into validated task rows. Spreadsheet
 *  dates are collected up-front so Excel serial numbers in any column
 *  are normalised before validation. */
function buildRows(records: Record<string, unknown>[], levels: MembershipLevel[]): ParsedRow[] {
  return records.map((record, index) => {
    const rowNo = index + 2; // +1 header row, +1 one-based rows
    const cell: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(record)) {
      const field = normalizeKey(key);
      if (field && cell[field] === undefined) cell[field] = value;
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    const title = String(cell.title ?? "").trim();
    const description = String(cell.description ?? "").trim();
    if (!title) errors.push("Title is required");
    if (!description) errors.push("Description is required");

    const reward = Math.floor(Number(cell.reward));
    if (!Number.isFinite(reward) || reward <= 0) errors.push("Reward is required and must be a number");
    else if (reward < 50) errors.push("Reward must be at least ₦50");

    const { ids: levelIds, label: levelLabel } = parseLevels(cell.levels, levels);
    if (!levelIds.length) errors.push("Levels: no matching membership level");

    let category = String(cell.category ?? "").trim() || "Other";
    if (!CATEGORIES.includes(category)) {
      warnings.push(`Unknown category "${category}" — importing as-is`);
    }

    let verification = String(cell.verification ?? "").trim().toLowerCase() || "manual_review";
    if (!VERIFICATIONS.includes(verification)) {
      warnings.push(`Unknown verification "${verification}" — using manual_review`);
      verification = "manual_review";
    }

    let status = String(cell.status ?? "").trim().toLowerCase() || "active";
    if (!STATUSES.includes(status)) {
      warnings.push(`Unknown status "${status}" — using active`);
      status = "active";
    }

    const rawStart = cell.starts_at;
    const rawEnd = cell.ends_at;
    const startsAt = toIsoDate(rawStart);
    const endsAt = toIsoDate(rawEnd);
    if (rawStart !== undefined && String(rawStart).trim() !== "" && !startsAt) {
      errors.push(`Invalid start date "${rawStart}"`);
    }
    if (rawEnd !== undefined && String(rawEnd).trim() !== "" && !endsAt) {
      errors.push(`Invalid end date "${rawEnd}"`);
    }
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      errors.push("End date must be after the start date");
    }

    const estMinutes = Math.floor(Number(cell.est_minutes));
    const maxSubmissions = Math.floor(Number(cell.max_submissions));
    const dailyLimit = Math.floor(Number(cell.daily_limit));

    return {
      rowNo, title, description,
      instructions: String(cell.instructions ?? "").trim(),
      category, reward,
      estMinutes: Number.isFinite(estMinutes) && estMinutes > 0 ? estMinutes : 15,
      maxSubmissions: Number.isFinite(maxSubmissions) && maxSubmissions > 0 ? maxSubmissions : 100,
      dailyLimit: Number.isFinite(dailyLimit) && dailyLimit > 0 ? dailyLimit : 1,
      levelIds, levelLabel, verification, startsAt, endsAt, status,
      errors, warnings,
    };
  });
}

/* ================= file parsing ================= */

/* xlsx is lazily imported so it stays out of the main bundle until an
 * admin actually opens the importer. */
let xlsxModule: Promise<typeof import("xlsx")> | null = null;
const loadXlsx = () => {
  if (!xlsxModule) xlsxModule = import("xlsx");
  return xlsxModule;
};

async function parseSpreadsheet(file: File, levels: MembershipLevel[]): Promise<ParsedRow[]> {
  const XLSX = await loadXlsx();
  const buffer = await file.arrayBuffer();
  /* cellDates: date-formatted Excel cells arrive as Date objects */
  const workbook = XLSX.read(buffer, { cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet) throw new Error("The workbook has no readable sheet.");
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (!records.length) throw new Error("No data rows found under the header row.");
  return buildRows(records, levels);
}

/* ================= import modal ================= */

export default function TaskImportModal({
  open, onClose, levels,
}: {
  open: boolean;
  onClose: () => void;
  levels: MembershipLevel[];
}) {
  const admin = useUser();
  const toast = useToast();
  const { busy, run } = useAction();
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const all = rows ?? [];
  const valid = all.filter((r) => r.errors.length === 0);
  const invalid = all.filter((r) => r.errors.length > 0);
  const warned = all.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length;
  const tooMany = all.length > 500; // server cap: 500 tasks per file

  const close = () => {
    onClose();
    window.setTimeout(() => {
      setRows(null);
      setFileName("");
      setResult(null);
    }, 150);
  };

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplateCsv(levels)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "earnhub-task-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);
    if (!/\.(csv|xlsx|xlsm|xls)$/i.test(file.name)) {
      toast("error", "Please upload a .csv or .xlsx file.");
      setFileName("");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast("error", "File is larger than 2 MB. Split it into smaller batches.");
      setFileName("");
      return;
    }
    setParsing(true);
    setRows(null);
    try {
      const parsed = await parseSpreadsheet(file, levels);
      setRows(parsed);
      const ready = parsed.filter((r) => !r.errors.length).length;
      toast(
        parsed.some((r) => r.errors.length) ? "info" : "success",
        `Parsed ${parsed.length} row${parsed.length === 1 ? "" : "s"} — ${ready} ready to import.`
      );
    } catch (e) {
      toast("error", e instanceof Error ? e.message : "Could not read the file.");
      setFileName("");
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const doImport = async () => {
    if (!admin || tooMany || !valid.length) return;
    const payload = valid.map((r) => ({
      title: r.title,
      description: r.description,
      instructions: r.instructions,
      category: r.category,
      reward: r.reward,
      est_minutes: r.estMinutes,
      max_submissions: r.maxSubmissions,
      daily_limit: r.dailyLimit,
      level_ids: r.levelIds,
      verification: r.verification,
      starts_at: r.startsAt ?? undefined,
      ends_at: r.endsAt ?? undefined,
      status: r.status,
    }));
    const res = await run(() => adminImportTasks(admin.id, payload));
    if (res) {
      setResult(res);
      if (!res.failed.length) {
        toast("success", `${res.insertedCount} task${res.insertedCount === 1 ? "" : "s"} imported.`);
        setRows(null);
        setFileName("");
      }
    }
  };

  return (
    <Modal open={open} onClose={close} title="Import tasks — CSV / Excel" wide>
      {result ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
            <Check className="h-5 w-5 shrink-0 text-green-600" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                {result.insertedCount} task{result.insertedCount === 1 ? "" : "s"} imported
              </p>
              {result.failed.length > 0 && (
                <p className="text-xs text-amber-700">
                  {result.failed.length} row{result.failed.length === 1 ? "" : "s"} were rejected — see below.
                </p>
              )}
            </div>
          </div>
          {result.failed.length > 0 && (
            <div className="space-y-1.5">
              {result.failed.map((f) => (
                <p key={f.row} className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
                  <span className="font-semibold">Row {f.row}:</span> {f.message}
                </p>
              ))}
            </div>
          )}
          <Button className="w-full" onClick={close}>Done</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* step 1 — template */}
          <div className="flex items-start gap-3 rounded-lg bg-slate-50 p-4">
            <FileSpreadsheet className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800">1. Download the template</p>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                One task per row. <span className="font-medium text-slate-600">levels</span> accepts{" "}
                <code className="rounded bg-slate-200 px-1">Starter; Bronze</code>,{" "}
                <code className="rounded bg-slate-200 px-1">all</code> or level UUIDs. Rewards start at ₦50.
              </p>
              <Button type="button" size="sm" variant="outline" className="mt-2.5" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" /> Download CSV template
              </Button>
            </div>
          </div>

          {/* step 2 — upload */}
          <div className="rounded-lg bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">2. Upload your file</p>
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xlsm,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={parsing}
              onClick={() => fileInput.current?.click()}
              className="mt-2.5 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-white px-4 py-6 text-center transition-colors hover:border-brand disabled:opacity-60"
            >
              {parsing ? (
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-brand" />
              ) : (
                <Upload className="h-6 w-6 text-slate-400" />
              )}
              <span className="text-xs font-medium text-slate-600">
                {parsing ? "Reading file…" : fileName || "Click to choose a .csv or .xlsx file (max 2 MB)"}
              </span>
            </button>
          </div>

          {/* step 3 — review & import */}
          {rows && rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-semibold text-slate-700">3. Review before importing</span>
                <Badge tone="green">{valid.length} ready</Badge>
                {invalid.length > 0 && <Badge tone="red">{invalid.length} invalid</Badge>}
                {warned > 0 && <Badge tone="amber">{warned} warnings</Badge>}
              </div>
              {tooMany && (
                <p className="rounded-lg bg-red-50 p-3 text-xs leading-relaxed text-red-700">
                  This file has {rows.length} rows. Import is limited to 500 tasks per file — split it into batches.
                </p>
              )}
              <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-100">
                {rows.map((r) => {
                  const bad = r.errors.length > 0;
                  const warn = !bad && r.warnings.length > 0;
                  return (
                    <div
                      key={r.rowNo}
                      className={`flex items-start justify-between gap-3 border-b border-slate-50 px-3 py-2 last:border-b-0 ${bad ? "bg-red-50/60" : ""}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-slate-700">
                          <span className="mr-1.5 font-mono text-[10px] text-slate-400">{r.rowNo}</span>
                          {r.title || <span className="italic text-slate-400">untitled</span>}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {Number.isFinite(r.reward) ? fmtN(r.reward) : "—"} · {r.category} · {r.levelLabel || "no levels"}
                        </p>
                        {(bad || warn) && (
                          <p className={`mt-0.5 text-[11px] ${bad ? "text-red-600" : "text-amber-600"}`}>
                            {[...r.errors, ...r.warnings].join(" · ")}
                          </p>
                        )}
                      </div>
                      {bad ? (
                        <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-red-500" />
                      ) : warn ? (
                        <AlertTriangle className="mt-1 h-3.5 w-3.5 shrink-0 text-amber-500" />
                      ) : (
                        <Check className="mt-1 h-3.5 w-3.5 shrink-0 text-green-500" />
                      )}
                    </div>
                  );
                })}
              </div>
              <Button
                className="w-full"
                loading={busy}
                disabled={parsing || tooMany || !valid.length}
                onClick={() => void doImport()}
              >
                Import {valid.length} task{valid.length === 1 ? "" : "s"}
              </Button>
              <p className="text-center text-[11px] text-slate-400">
                Valid rows import even if other rows fail. Members are paid only after each submission is reviewed.
              </p>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
