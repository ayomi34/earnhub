import { useRef, useState } from "react";
import { AlertTriangle, Check, Download, FileSpreadsheet, Upload, Edit2 } from "lucide-react";
import { Badge, Button, Modal } from "./ui";
import { adminImportFeudQuestions, type FeudImportResult } from "../lib/feudServices";
import { useAction, useToast, useUser } from "../lib/store";

const TEMPLATE_HEADERS = [
  "Question", "Category",
  "Answer 1", "Points 1",
  "Answer 2", "Points 2",
  "Answer 3", "Points 3",
  "Answer 4", "Points 4",
  "Answer 5", "Points 5",
  "Difficulty", "Status", "Explanation",
];

const escapeCsv = (value: string) =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

function buildTemplateCsv() {
  const rows = [
    TEMPLATE_HEADERS,
    [
      "Name something people do immediately after waking up",
      "Daily Routine",
      "Check their phone", "40",
      "Brush their teeth", "30",
      "Pray", "20",
      "Drink water", "10",
      "Take a bath", "5",
      "easy", "active", "Urban lifestyle survey",
    ],
    [
      "Name a popular street snack in Nigeria",
      "Food & Dining",
      "Suya", "38",
      "Akara / Puff Puff", "28",
      "Roasted Corn & Pear", "18",
      "Boli (Roasted Plantain)", "11",
      "Gala & Sausage", "5",
      "easy", "active", "Street vendor customer survey",
    ],
  ];
  return rows.map((r) => r.map((c) => escapeCsv(String(c))).join(",")).join("\r\n");
}

let xlsxModule: Promise<typeof import("xlsx")> | null = null;
const loadXlsx = () => {
  if (!xlsxModule) xlsxModule = import("xlsx");
  return xlsxModule;
};

export interface ParsedFeudRow {
  rowNo: number;
  prompt: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
  status: "active" | "inactive";
  answers: { text: string; points: number; rank: number }[];
  valid: boolean;
  errors: string[];
}

function parseRecord(rec: Record<string, unknown>, rowNo: number): ParsedFeudRow {
  const normalized: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    normalized[k.trim().toLowerCase().replace(/[\s_.]+/g, "")] = v;
  }

  const prompt = String(normalized.question || normalized.prompt || "").trim();
  const category = String(normalized.category || "General").trim();
  const diffRaw = String(normalized.difficulty || "easy").trim().toLowerCase();
  const difficulty = (["easy", "medium", "hard"].includes(diffRaw) ? diffRaw : "easy") as "easy" | "medium" | "hard";
  const statRaw = String(normalized.status || "active").trim().toLowerCase();
  const status = statRaw === "inactive" ? "inactive" : "active";
  const explanation = String(normalized.explanation || "").trim() || undefined;

  const answers: { text: string; points: number; rank: number }[] = [];
  const errors: string[] = [];

  if (!prompt) errors.push("Missing question prompt");

  for (let i = 1; i <= 8; i++) {
    const ansKey = `answer${i}`;
    const ptsKey = `points${i}`;
    const ansText = String(normalized[ansKey] || "").trim();
    if (ansText) {
      const ptsVal = Number(normalized[ptsKey]);
      const points = Number.isFinite(ptsVal) && ptsVal > 0 ? Math.floor(ptsVal) : 10;
      answers.push({ text: ansText, points, rank: i });
    }
  }

  if (answers.length < 2) {
    errors.push("At least 2 answer options are required");
  }

  return {
    rowNo,
    prompt,
    category,
    difficulty,
    explanation,
    status,
    answers,
    valid: errors.length === 0,
    errors,
  };
}

export default function FeudImportModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}) {
  const admin = useUser();
  const toast = useToast();
  const { busy, run } = useAction();
  const fileInput = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ParsedFeudRow[]>([]);
  const [result, setResult] = useState<FeudImportResult | null>(null);
  const [editingRow, setEditingRow] = useState<ParsedFeudRow | null>(null);

  const reset = () => {
    setFileName("");
    setRows([]);
    setResult(null);
    setEditingRow(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const downloadCsvTemplate = () => {
    const blob = new Blob([buildTemplateCsv()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "survey-feud-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadXlsxTemplate = async () => {
    const XLSX = await loadXlsx();
    const rowsData = [
      TEMPLATE_HEADERS,
      [
        "Name something people do immediately after waking up",
        "Daily Routine",
        "Check their phone", 40,
        "Brush their teeth", 30,
        "Pray", 20,
        "Drink water", 10,
        "Take a bath", 5,
        "easy", "active", "Urban lifestyle survey",
      ],
      [
        "Name a popular street snack in Nigeria",
        "Food & Dining",
        "Suya", 38,
        "Akara / Puff Puff", 28,
        "Roasted Corn & Pear", 18,
        "Boli (Roasted Plantain)", 11,
        "Gala & Sausage", 5,
        "easy", "active", "Street vendor customer survey",
      ],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rowsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Questions");
    XLSX.writeFile(wb, "survey-feud-template.xlsx");
  };

  const handleFile = async (file?: File) => {
    if (!file) return;
    setResult(null);
    setFileName(file.name);

    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      toast("error", "Please upload a .csv or .xlsx file.");
      setFileName("");
      return;
    }

    try {
      setParsing(true);
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("File contains no sheets.");
      const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!records.length) throw new Error("No data found under the header row.");

      const parsed = records.map((r, i) => parseRecord(r, i + 2));
      setRows(parsed);
      toast("info", `Parsed ${parsed.length} questions from ${file.name}`);
    } catch (err: any) {
      toast("error", err.message || "Failed to parse file.");
      reset();
    } finally {
      setParsing(false);
    }
  };

  const validRows = rows.filter((r) => r.valid);
  const invalidRows = rows.filter((r) => !r.valid);

  const doImport = async () => {
    if (!admin || !validRows.length) return;
    const payload = validRows.map((r) => ({
      prompt: r.prompt,
      category: r.category,
      difficulty: r.difficulty,
      explanation: r.explanation,
      status: r.status,
      answers: r.answers.map((a, i) => ({
        id: `ans-${i + 1}`,
        text: a.text,
        points: a.points,
        rank: a.rank,
      })),
    }));

    const res = await run(() => adminImportFeudQuestions(admin.id, payload));
    if (res) {
      setResult(res);
      toast("success", `Successfully imported ${res.inserted} questions.`);
      if (onSuccess) onSuccess();
    }
  };

  const updateEditedRow = (updated: ParsedFeudRow) => {
    setRows((prev) => prev.map((r) => (r.rowNo === updated.rowNo ? updated : r)));
    setEditingRow(null);
  };
  return (
    <Modal open={open} onClose={handleClose} title="Upload Survey Feud Questions" wide>
      <div className="space-y-5">
        {/* Step 1: Download Templates */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Step 1: Download the template</p>
              <p className="text-xs text-slate-500">
                Format your questions with survey answer options and their respective point values.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={downloadCsvTemplate}>
                <Download className="h-4 w-4" /> CSV Template
              </Button>
              <Button size="sm" variant="outline" onClick={downloadXlsxTemplate}>
                <FileSpreadsheet className="h-4 w-4" /> Excel (.xlsx) Template
              </Button>
            </div>
          </div>
        </div>

        {/* Step 2: Upload File */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-900">Step 2: Upload completed file</p>
          <div
            onClick={() => fileInput.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition-colors hover:border-brand hover:bg-brand-50/20"
          >
            <input
              ref={fileInput}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <Upload className={`h-8 w-8 text-slate-400 ${parsing ? "animate-pulse" : ""}`} />
            <p className="mt-2 text-sm font-medium text-slate-700">
              {parsing ? "Parsing spreadsheet…" : fileName || "Click to browse .xlsx or .csv file"}
            </p>
            <p className="text-xs text-slate-400">Up to 500 questions per file</p>
          </div>
        </div>

        {/* Result alert */}
        {result && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <Check className="h-5 w-5 text-emerald-600" />
              <span>Import Completed: {result.inserted} questions imported</span>
            </div>
            {result.failed > 0 && (
              <p className="mt-1 text-xs text-emerald-700">
                {result.failed} rows failed or were skipped as duplicates.
              </p>
            )}
          </div>
        )}
        {/* Preview table */}
        {rows.length > 0 && !result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900">
                Step 3: Preview & Validation ({validRows.length} valid, {invalidRows.length} errors)
              </p>
              <Button size="sm" onClick={doImport} loading={busy} disabled={validRows.length === 0}>
                Import {validRows.length} Valid Questions
              </Button>
            </div>

            <div className="max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-100 text-slate-600">
                  <tr>
                    <th className="p-2.5">Row</th>
                    <th className="p-2.5">Question Prompt</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5">Answers & Points</th>
                    <th className="p-2.5">Status</th>
                    <th className="p-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((r) => (
                    <tr key={r.rowNo} className={r.valid ? "hover:bg-slate-50" : "bg-red-50/50"}>
                      <td className="p-2.5 font-mono text-slate-400">#{r.rowNo}</td>
                      <td className="max-w-[200px] truncate p-2.5 font-medium text-slate-800">
                        {r.prompt || <span className="italic text-red-500">Missing</span>}
                      </td>
                      <td className="p-2.5 text-slate-600">{r.category}</td>
                      <td className="p-2.5 text-slate-600">
                        {r.answers.length ? (
                          <div className="flex flex-wrap gap-1">
                            {r.answers.slice(0, 3).map((a, i) => (
                              <span key={i} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">
                                {a.text} ({a.points}p)
                              </span>
                            ))}
                            {r.answers.length > 3 && (
                              <span className="text-[10px] text-slate-400">+{r.answers.length - 3} more</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-red-500">No answers</span>
                        )}
                      </td>
                      <td className="p-2.5">
                        {r.valid ? (
                          <Badge tone="green">Valid</Badge>
                        ) : (
                          <span className="flex items-center gap-1 text-[11px] font-medium text-red-600">
                            <AlertTriangle className="h-3 w-3" /> {r.errors[0]}
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setEditingRow(r)}
                          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {/* Edit Row Sub-Modal */}
        {editingRow && (
          <Modal open={true} onClose={() => setEditingRow(null)} title={`Edit Row #${editingRow.rowNo}`}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateEditedRow(editingRow);
              }}
              className="space-y-4"
            >
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Question Prompt</label>
                <input
                  type="text"
                  value={editingRow.prompt}
                  onChange={(e) => setEditingRow({ ...editingRow, prompt: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">Category</label>
                <input
                  type="text"
                  value={editingRow.category}
                  onChange={(e) => setEditingRow({ ...editingRow, category: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-slate-700">Answers & Points</p>
                <div className="space-y-2">
                  {editingRow.answers.map((a, idx) => (
                    <div key={idx} className="flex gap-2">
                      <input
                        type="text"
                        value={a.text}
                        onChange={(e) => {
                          const updated = [...editingRow.answers];
                          updated[idx].text = e.target.value;
                          setEditingRow({ ...editingRow, answers: updated });
                        }}
                        placeholder={`Answer ${idx + 1}`}
                        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                      <input
                        type="number"
                        value={a.points}
                        onChange={(e) => {
                          const updated = [...editingRow.answers];
                          updated[idx].points = Number(e.target.value);
                          setEditingRow({ ...editingRow, answers: updated });
                        }}
                        placeholder="Pts"
                        className="w-20 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <Button variant="outline" size="sm" onClick={() => setEditingRow(null)}>
                  Cancel
                </Button>
                <Button size="sm" type="submit">
                  Save Changes
                </Button>
              </div>
            </form>
          </Modal>
        )}


      </div>
    </Modal>
  );
}


