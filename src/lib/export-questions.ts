import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;
const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

interface OptionShape {
  id?: string;
  label?: string;
  text?: string;
}

function stripHtml(input: unknown): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptions(raw: unknown): { id: string; text: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((opt, idx) => {
    if (opt && typeof opt === "object") {
      const o = opt as OptionShape;
      return {
        id: String(o.id ?? o.label ?? LETTERS[idx] ?? idx + 1).toUpperCase(),
        text: stripHtml(o.text ?? ""),
      };
    }
    return { id: LETTERS[idx] ?? String(idx + 1), text: stripHtml(opt) };
  });
}

function correctAsLetters(
  correct: string[] | null | undefined,
  options: { id: string }[]
): string {
  if (!correct || correct.length === 0) return "Answer Not Provided";
  const idIndex = new Map(options.map((o, i) => [o.id.toUpperCase(), i]));
  const letters = correct
    .map((c) => {
      const key = String(c).toUpperCase();
      const idx = idIndex.get(key);
      if (idx !== undefined) return LETTERS[idx] ?? key;
      // already a letter?
      if (/^[A-H]$/.test(key)) return key;
      return key;
    })
    .filter(Boolean);
  return letters.join(", ");
}

interface QuestionRow {
  id: string;
  bank_id: string;
  stem: string;
  options: unknown;
  correct_answers: string[];
  explanation: string | null;
  reference: string | null;
  tags: string[] | null;
  difficulty: string | null;
  type: string | null;
  created_at: string;
}

interface BankRow {
  id: string;
  title: string;
  subject: string | null;
}

async function fetchAllQuestions(): Promise<QuestionRow[]> {
  const all: QuestionRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("questions")
      .select(
        "id,bank_id,stem,options,correct_answers,explanation,reference,tags,difficulty,type,created_at"
      )
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as QuestionRow[];
    all.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

async function fetchAllBanks(): Promise<Map<string, BankRow>> {
  const map = new Map<string, BankRow>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("question_banks")
      .select("id,title,subject")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as BankRow[];
    for (const b of batch) map.set(b.id, b);
    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return map;
}

export async function downloadFullQuestionBank(userId: string): Promise<{
  count: number;
  fileName: string;
}> {
  const [questions, banks] = await Promise.all([
    fetchAllQuestions(),
    fetchAllBanks(),
  ]);

  // Enrich + sort: subject A–Z, topic A–Z, created_at oldest first
  const enriched = questions.map((q) => {
    const bank = banks.get(q.bank_id);
    const subject = bank?.subject?.trim() || bank?.title?.trim() || "Uncategorized";
    const topic = (q.tags ?? []).join(", ").trim() || "General";
    return { q, subject, topic };
  });

  enriched.sort((a, b) => {
    const s = a.subject.localeCompare(b.subject, undefined, { sensitivity: "base" });
    if (s !== 0) return s;
    const t = a.topic.localeCompare(b.topic, undefined, { sensitivity: "base" });
    if (t !== 0) return t;
    return new Date(a.q.created_at).getTime() - new Date(b.q.created_at).getTime();
  });

  const wb = new ExcelJS.Workbook();
  wb.creator = "MedAI Exam Engine";
  wb.created = new Date();
  const ws = wb.addWorksheet("Question Bank");

  ws.columns = [
    { header: "Serial_Number", key: "sn", width: 8 },
    { header: "Subject", key: "subject", width: 22 },
    { header: "Topic", key: "topic", width: 22 },
    { header: "Question", key: "question", width: 60 },
    { header: "Option_A", key: "a", width: 30 },
    { header: "Option_B", key: "b", width: 30 },
    { header: "Option_C", key: "c", width: 30 },
    { header: "Option_D", key: "d", width: 30 },
    { header: "Option_E", key: "e", width: 30 },
    { header: "Correct_Answer", key: "correct", width: 16 },
    { header: "Explanation", key: "explanation", width: 50 },
    { header: "Reference", key: "reference", width: 30 },
  ];

  // Header style
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1F2937" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;
  ws.views = [{ state: "frozen", ySplit: 1 }];

  enriched.forEach(({ q, subject, topic }, idx) => {
    const opts = normalizeOptions(q.options);
    const byLetter: Record<string, string> = {};
    opts.slice(0, 5).forEach((o, i) => {
      byLetter[LETTERS[i] as string] = o.text;
    });
    const row = ws.addRow({
      sn: idx + 1,
      subject,
      topic,
      question: stripHtml(q.stem),
      a: byLetter.A ?? "",
      b: byLetter.B ?? "",
      c: byLetter.C ?? "",
      d: byLetter.D ?? "",
      e: byLetter.E ?? "",
      correct: correctAsLetters(q.correct_answers, opts),
      explanation: stripHtml(q.explanation),
      reference: stripHtml(q.reference),
    });
    row.alignment = { vertical: "top", wrapText: true };
  });

  // Footer credit row
  ws.addRow({});
  const footerRow = ws.addRow({
    sn: "",
    subject: "AI Engine developed by Dr. Mansur Bin Anowar",
  });
  ws.mergeCells(`B${footerRow.number}:L${footerRow.number}`);
  footerRow.font = { italic: true, bold: true, color: { argb: "FF374151" } };
  footerRow.alignment = { vertical: "middle", horizontal: "center" };

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `question-bank-${stamp}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Best-effort log (don't fail the download if logging fails)
  await supabase
    .from("download_logs")
    .insert({
      user_id: userId,
      download_type: "full_question_bank",
      question_count: enriched.length,
      file_name: fileName,
    })
    .then((res) => {
      if (res.error) console.error("Download log failed", res.error);
    });

  return { count: enriched.length, fileName };
}

// ---------- CSV EXPORT ----------
// Strict spec output, one row per question:
//   type,difficulty,question,option_a,option_b,option_c,option_d,option_e,correct,explanation,reference,tags
// Quoting rules:
//   - Always quote: question, option_a..e, correct, explanation
//   - tags / reference / type / difficulty quoted only when needed
//   - Empty values stay as ""

const TF_TOKENS = new Set(["true", "false", "t", "f"]);

function csvQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function csvCellMaybe(value: string): string {
  if (value === "") return '""';
  if (/[",\n\r]/.test(value)) return csvQuote(value);
  return value;
}

interface CleanedRow {
  type: "SBA" | "TRUE_FALSE";
  difficulty: "easy" | "medium" | "hard";
  question: string;
  options: string[]; // length 5 (empty strings for unused)
  correct: string;
  explanation: string;
  reference: string;
  tags: string;
}

function buildCleanedRow(q: QuestionRow): CleanedRow {
  const opts = normalizeOptions(q.options).slice(0, 5);
  // Pad to 5
  const filled: string[] = [0, 1, 2, 3, 4].map((i) => stripHtml(opts[i]?.text ?? ""));

  // Detect TRUE_FALSE
  const dbType = (q.type ?? "").toString().trim().toUpperCase();
  const looksTF =
    opts.length >= 2 &&
    opts.every((o) => TF_TOKENS.has(stripHtml(o.text).toLowerCase()));
  const correctHasTF = (q.correct_answers ?? []).some((a) =>
    /:(true|false|t|f)\b/i.test(String(a))
  );
  const type: "SBA" | "TRUE_FALSE" =
    dbType === "TRUE_FALSE" || looksTF || correctHasTF ? "TRUE_FALSE" : "SBA";

  // Build correct string
  const validIds = new Set(opts.map((o) => o.id.toLowerCase()));
  let correct = "";
  const raw = (q.correct_answers ?? []).map((a) => String(a).trim()).filter(Boolean);
  if (type === "SBA") {
    for (const a of raw) {
      const m = a.toLowerCase().match(/^[a-e]/);
      if (m && validIds.has(m[0])) {
        correct = m[0];
        break;
      }
    }
  } else {
    const map = new Map<string, "true" | "false">();
    for (const a of raw) {
      const m = a.toLowerCase().match(/^([a-e])\s*[:=\-]\s*(true|false|t|f)/);
      if (m && validIds.has(m[1])) {
        map.set(m[1], m[2].startsWith("t") ? "true" : "false");
      }
    }
    correct = opts
      .filter((o) => map.has(o.id.toLowerCase()))
      .map((o) => `${o.id.toLowerCase()}:${map.get(o.id.toLowerCase())}`)
      .join(",");
  }

  // Difficulty
  const allowedDiff = new Set(["easy", "medium", "hard"]);
  const dbDiff = (q.difficulty ?? "").toString().trim().toLowerCase();
  const difficulty = (allowedDiff.has(dbDiff)
    ? dbDiff
    : opts.length <= 2
      ? "easy"
      : opts.length >= 5
        ? "hard"
        : "medium") as "easy" | "medium" | "hard";

  return {
    type,
    difficulty,
    question: stripHtml(q.stem),
    options: filled,
    correct,
    explanation: stripHtml(q.explanation),
    reference: stripHtml(q.reference),
    tags: (q.tags ?? []).map((t) => stripHtml(t)).filter(Boolean).join(","),
  };
}

function rowToCsv(r: CleanedRow): string {
  // Always-quoted fields: question, option_a..e, correct, explanation
  // type / difficulty / reference / tags quoted only when needed
  return [
    csvCellMaybe(r.type),
    csvCellMaybe(r.difficulty),
    csvQuote(r.question),
    csvQuote(r.options[0] ?? ""),
    csvQuote(r.options[1] ?? ""),
    csvQuote(r.options[2] ?? ""),
    csvQuote(r.options[3] ?? ""),
    csvQuote(r.options[4] ?? ""),
    csvQuote(r.correct),
    csvQuote(r.explanation),
    csvCellMaybe(r.reference),
    csvCellMaybe(r.tags),
  ].join(",");
}

export async function downloadFullQuestionBankCsv(userId: string): Promise<{
  count: number;
  fileName: string;
}> {
  const questions = await fetchAllQuestions();

  const header =
    "type,difficulty,question,option_a,option_b,option_c,option_d,option_e,correct,explanation,reference,tags";
  const lines: string[] = [header];
  for (const q of questions) {
    lines.push(rowToCsv(buildCleanedRow(q)));
  }
  // Footer credit
  lines.push("");
  lines.push(csvQuote("AI Engine developed by Dr. Mansur Bin Anowar"));

  // Prepend BOM for Excel UTF-8 compatibility
  const csv = "\uFEFF" + lines.join("\r\n") + "\r\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `question-bank-${stamp}.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  await supabase
    .from("download_logs")
    .insert({
      user_id: userId,
      download_type: "full_question_bank_csv",
      question_count: questions.length,
      file_name: fileName,
    })
    .then((res) => {
      if (res.error) console.error("Download log failed", res.error);
    });

  return { count: questions.length, fileName };
}
