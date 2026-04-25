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
