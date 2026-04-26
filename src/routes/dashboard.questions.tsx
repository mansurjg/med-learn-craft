import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Search,
  Eye,
  Pencil,
  Trash2,
  PlayCircle,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Plus,
  Minus,
  AlertTriangle,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { z } from "zod";
import { downloadFullQuestionBank } from "@/lib/export-questions";

export const Route = createFileRoute("/dashboard/questions")({
  head: () => ({ meta: [{ title: "All questions — MedAI" }] }),
  component: QuestionsPage,
});

type QType = "SBA" | "TRUE_FALSE";

interface OptionShape {
  id: string;
  text: string;
}

interface QuestionRow {
  id: string;
  bank_id: string;
  position: number;
  stem: string;
  type: QType;
  options: OptionShape[];
  correct_answers: string[];
  explanation: string | null;
  created_at: string;
  updated_at: string;
  needs_review: boolean;
  marker_type: string | null;
  confidence_score: number | null;
  bank?: { id: string; title: string; owner_id: string } | null;
  owner_email?: string | null;
}

const PAGE_SIZE = 10;

function QuestionsPage() {
  const { user, isSuperAdmin, isStaff } = useAuth();
  const [rows, setRows] = useState<QuestionRow[]>([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | QType>("all");
  const [reviewFilter, setReviewFilter] = useState<"all" | "needs_review">("all");

  const [viewing, setViewing] = useState<QuestionRow | null>(null);
  const [editing, setEditing] = useState<QuestionRow | null>(null);
  const [testing, setTesting] = useState<QuestionRow | null>(null);
  const [deleting, setDeleting] = useState<QuestionRow | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const { count, fileName } = await downloadFullQuestionBank(user.id);
      toast.success(`Exported ${count} questions`, { description: fileName });
      setConfirmDownload(false);
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [debounced, typeFilter, reviewFilter]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from("questions")
      .select(
        "id,bank_id,position,stem,type,options,correct_answers,explanation,created_at,updated_at,needs_review,marker_type,confidence_score,question_banks!inner(id,title,owner_id)",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(from, to);

    if (typeFilter !== "all") query = query.eq("type", typeFilter);
    if (reviewFilter === "needs_review") query = query.eq("needs_review", true);
    if (debounced) query = query.ilike("stem", `%${debounced}%`);

    if (!isSuperAdmin) {
      query = query.eq("question_banks.owner_id", user.id);
    }

    const { data, error, count: total } = await query;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const mapped = (data ?? []).map((r) => ({
      id: r.id,
      bank_id: r.bank_id,
      position: r.position,
      stem: r.stem,
      type: r.type as QType,
      options: (r.options as unknown as OptionShape[]) ?? [],
      correct_answers: r.correct_answers ?? [],
      explanation: r.explanation,
      created_at: r.created_at,
      updated_at: r.updated_at,
      needs_review: (r as { needs_review?: boolean }).needs_review ?? false,
      marker_type: (r as { marker_type?: string | null }).marker_type ?? null,
      confidence_score:
        (r as { confidence_score?: number | null }).confidence_score ?? null,
      bank: r.question_banks
        ? {
            id: (r.question_banks as { id: string }).id,
            title: (r.question_banks as { title: string }).title,
            owner_id: (r.question_banks as { owner_id: string }).owner_id,
          }
        : null,
    })) as QuestionRow[];

    setRows(mapped);
    setCount(total ?? 0);
    setLoading(false);
  }, [user, page, debounced, typeFilter, reviewFilter, isSuperAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  const canMutate = (q: QuestionRow) =>
    isSuperAdmin || (isStaff && q.bank?.owner_id === user?.id) || q.bank?.owner_id === user?.id;

  const handleDelete = async () => {
    if (!deleting) return;
    const { error } = await supabase
      .from("questions")
      .delete()
      .eq("id", deleting.id);
    if (error) return toast.error(error.message);
    toast.success("Question deleted");
    setDeleting(null);
    void load();
  };

  const handleDeleteAll = async () => {
    if (!user) return;
    setDeletingAll(true);
    try {
      // Find banks the user can mutate. Super admins see all banks; others only their own.
      let banksQuery = supabase.from("question_banks").select("id");
      if (!isSuperAdmin) banksQuery = banksQuery.eq("owner_id", user.id);
      const { data: banks, error: banksErr } = await banksQuery;
      if (banksErr) throw banksErr;
      const bankIds = (banks ?? []).map((b) => b.id);
      if (bankIds.length === 0) {
        toast.info("No questions to delete");
        setConfirmDeleteAll(false);
        return;
      }
      const { error } = await supabase
        .from("questions")
        .delete()
        .in("bank_id", bankIds);
      if (error) throw error;
      toast.success("All questions deleted");
      setConfirmDeleteAll(false);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            All questions
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSuperAdmin
              ? "All questions across the platform."
              : "Questions from banks you own."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isStaff && (
            <Button
              onClick={() => setConfirmDownload(true)}
              disabled={downloading}
              className="gap-2"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Preparing…" : "Download Full Question Bank"}
            </Button>
          )}
          <Button
            variant="destructive"
            onClick={() => setConfirmDeleteAll(true)}
            disabled={deletingAll || count === 0}
            className="gap-2"
          >
            {deletingAll ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete all
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search question text…"
            className="pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            <SelectItem value="SBA">SBA</SelectItem>
            <SelectItem value="TRUE_FALSE">True / False</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={reviewFilter}
          onValueChange={(v) => setReviewFilter(v as typeof reviewFilter)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All status</SelectItem>
            <SelectItem value="needs_review">Needs review</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No questions found.
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map((q) => (
            <li
              key={q.id}
              className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
                      {q.type === "TRUE_FALSE" ? "True / False" : "SBA"}
                    </span>
                    {q.needs_review && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                        <AlertTriangle className="h-3 w-3 text-warning" />
                        Needs review
                      </span>
                    )}
                    {q.bank && (
                      <span className="text-xs text-muted-foreground">
                        · {q.bank.title}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      · {new Date(q.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm font-medium text-foreground">
                    {q.stem}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setViewing(q)}
                  >
                    <Eye className="mr-1.5 h-3.5 w-3.5" />
                    View
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setTesting(q)}
                  >
                    <PlayCircle className="mr-1.5 h-3.5 w-3.5" />
                    Test
                  </Button>
                  {canMutate(q) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(q)}
                      >
                        <Pencil className="mr-1.5 h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeleting(q)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {!loading && count > 0 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-xs text-muted-foreground">
            Page {page + 1} of {totalPages} · {count} total
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ViewDialog question={viewing} onClose={() => setViewing(null)} />
      <TestDialog question={testing} onClose={() => setTesting(null)} />
      <EditDialog
        question={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          void load();
        }}
      />

      <AlertDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this question?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the question. Existing exam attempts are
              not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDelete()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={confirmDownload}
        onOpenChange={(o) => !downloading && setConfirmDownload(o)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Download entire question bank as Excel?</AlertDialogTitle>
            <AlertDialogDescription>
              This exports every question across all banks into a single .xlsx
              file. The activity will be logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={downloading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDownload();
              }}
              disabled={downloading}
              className="gap-2"
            >
              {downloading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              {downloading ? "Preparing…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ViewDialog({
  question: q,
  onClose,
}: {
  question: QuestionRow | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!q} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        {q && (
          <>
            <DialogHeader>
              <DialogTitle>Question details</DialogTitle>
              <DialogDescription>
                {q.type === "TRUE_FALSE" ? "True / False" : "SBA"} ·{" "}
                {q.bank?.title}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-foreground">{q.stem}</p>
              <ul className="space-y-1.5">
                {q.options.map((o) => {
                  const correct = q.correct_answers.includes(o.id);
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-start gap-2 rounded-md border p-2.5 text-sm",
                        correct
                          ? "border-success bg-success/10"
                          : "border-border bg-card"
                      )}
                    >
                      <span className="font-semibold">{o.id}.</span>
                      <span className="flex-1">{o.text}</span>
                      {correct && (
                        <CheckCircle2 className="h-4 w-4 text-success" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {q.explanation && (
                <div className="rounded-md border border-border bg-muted/40 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Explanation
                  </p>
                  <p className="mt-1 text-sm">{q.explanation}</p>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TestDialog({
  question: q,
  onClose,
}: {
  question: QuestionRow | null;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    setSelected(null);
    setRevealed(false);
  }, [q?.id]);

  if (!q) return null;
  const isTF = q.type === "TRUE_FALSE";
  const options = isTF
    ? [
        { id: "T", text: "True" },
        { id: "F", text: "False" },
      ]
    : q.options;
  const correctSet = new Set(q.correct_answers);
  const isCorrect = selected !== null && correctSet.has(selected);

  return (
    <Dialog open={!!q} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Test mode</DialogTitle>
          <DialogDescription>
            Standalone preview — does not record an attempt.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-foreground">{q.stem}</p>
          <div className={cn(isTF ? "grid grid-cols-2 gap-2" : "space-y-2")}>
            {options.map((o) => {
              const isSel = selected === o.id;
              const isRight = correctSet.has(o.id);
              let tone = "border-border bg-card hover:border-primary/40";
              if (revealed) {
                if (isRight) tone = "border-success bg-success/10";
                else if (isSel) tone = "border-destructive bg-destructive/10";
                else tone = "border-border bg-card opacity-70";
              } else if (isSel) tone = "border-primary bg-primary/5";

              return (
                <button
                  key={o.id}
                  type="button"
                  disabled={revealed}
                  onClick={() => setSelected(o.id)}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg border p-3 text-left text-sm transition-all disabled:cursor-not-allowed",
                    tone
                  )}
                >
                  <span className="font-semibold">{o.id}.</span>
                  <span className="flex-1">{o.text}</span>
                  {revealed && isRight && (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                  {revealed && isSel && !isRight && (
                    <XCircle className="h-4 w-4 text-destructive" />
                  )}
                </button>
              );
            })}
          </div>

          {revealed && (
            <div
              className={cn(
                "flex items-center gap-2 text-sm font-semibold",
                isCorrect ? "text-success" : "text-destructive"
              )}
            >
              {isCorrect ? (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Correct
                </>
              ) : (
                <>
                  <XCircle className="h-4 w-4" /> Incorrect
                </>
              )}
            </div>
          )}

          {revealed && q.explanation && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Explanation
              </p>
              <p className="mt-1 text-sm">{q.explanation}</p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          {revealed ? (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setRevealed(false);
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          ) : (
            <Button disabled={!selected} onClick={() => setRevealed(true)}>
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Reveal answer
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const optionSchema = z.object({
  id: z.string().min(1).max(4),
  text: z.string().trim().min(1, "Option text required").max(500),
});

const editSchema = z.object({
  stem: z.string().trim().min(3, "Question text is required").max(2000),
  type: z.enum(["SBA", "TRUE_FALSE"]),
  options: z.array(optionSchema).min(2).max(6),
  correct_answers: z.array(z.string()).min(1, "Select a correct answer"),
  explanation: z.string().trim().max(2000).optional().nullable(),
});

function EditDialog({
  question: q,
  onClose,
  onSaved,
}: {
  question: QuestionRow | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [stem, setStem] = useState("");
  const [type, setType] = useState<QType>("SBA");
  const [options, setOptions] = useState<OptionShape[]>([]);
  const [correct, setCorrect] = useState<string[]>([]);
  const [explanation, setExplanation] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!q) return;
    setStem(q.stem);
    setType(q.type);
    setOptions(
      q.type === "TRUE_FALSE"
        ? [
            { id: "T", text: "True" },
            { id: "F", text: "False" },
          ]
        : q.options.length
          ? q.options
          : [
              { id: "A", text: "" },
              { id: "B", text: "" },
            ]
    );
    setCorrect(q.correct_answers ?? []);
    setExplanation(q.explanation ?? "");
  }, [q]);

  const switchType = (newType: QType) => {
    setType(newType);
    if (newType === "TRUE_FALSE") {
      setOptions([
        { id: "T", text: "True" },
        { id: "F", text: "False" },
      ]);
      setCorrect([]);
    } else if (options.every((o) => o.id === "T" || o.id === "F")) {
      setOptions([
        { id: "A", text: "" },
        { id: "B", text: "" },
      ]);
      setCorrect([]);
    }
  };

  const updateOption = (id: string, text: string) => {
    setOptions((prev) => prev.map((o) => (o.id === id ? { ...o, text } : o)));
  };

  const addOption = () => {
    if (type === "TRUE_FALSE" || options.length >= 6) return;
    const next = String.fromCharCode(65 + options.length);
    setOptions((prev) => [...prev, { id: next, text: "" }]);
  };

  const removeOption = (id: string) => {
    if (type === "TRUE_FALSE" || options.length <= 2) return;
    setOptions((prev) => prev.filter((o) => o.id !== id));
    setCorrect((prev) => prev.filter((c) => c !== id));
  };

  const save = async () => {
    if (!q) return;
    const parsed = editSchema.safeParse({
      stem,
      type,
      options,
      correct_answers: correct,
      explanation: explanation || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("questions")
      .update({
        stem: parsed.data.stem,
        type: parsed.data.type,
        options: parsed.data.options,
        correct_answers: parsed.data.correct_answers,
        explanation: parsed.data.explanation,
        needs_review: false,
      })
      .eq("id", q.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Question updated");
    onSaved();
  };

  return (
    <Dialog open={!!q} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit question</DialogTitle>
          <DialogDescription>Changes are saved to the bank.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select
              value={type}
              onValueChange={(v) => switchType(v as QType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SBA">Single Best Answer (SBA)</SelectItem>
                <SelectItem value="TRUE_FALSE">True / False</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stem">Question text</Label>
            <Textarea
              id="stem"
              rows={4}
              value={stem}
              onChange={(e) => setStem(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>Options</Label>
              {type === "SBA" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={addOption}
                  disabled={options.length >= 6}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {options.map((o) => {
                const isCorrect = correct.includes(o.id);
                return (
                  <div key={o.id} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrect([o.id])}
                      className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-xs font-bold transition-colors",
                        isCorrect
                          ? "border-success bg-success text-success-foreground"
                          : "border-border bg-card text-muted-foreground hover:border-success"
                      )}
                      title="Mark as correct"
                    >
                      {o.id}
                    </button>
                    <Input
                      value={o.text}
                      onChange={(e) => updateOption(o.id, e.target.value)}
                      disabled={type === "TRUE_FALSE"}
                      placeholder={`Option ${o.id}`}
                    />
                    {type === "SBA" && options.length > 2 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeOption(o.id)}
                      >
                        <Minus className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Click the letter badge to mark the correct answer.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="explanation">Explanation (optional)</Label>
            <Textarea
              id="explanation"
              rows={3}
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
