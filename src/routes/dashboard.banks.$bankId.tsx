import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Play,
  Loader2,
  ImageIcon,
  Eye,
  RotateCcw,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/banks/$bankId")({
  head: () => ({
    meta: [{ title: "Bank — MedAI" }],
  }),
  component: BankDetail,
});

interface Bank {
  id: string;
  title: string;
  subject: string | null;
  description: string | null;
}

interface OptionShape {
  id: string;
  text: string;
}

interface QuestionRow {
  id: string;
  position: number;
  stem: string;
  difficulty: string | null;
  image_url: string | null;
  image_caption: string | null;
  type: "SBA" | "TRUE_FALSE";
  options: OptionShape[];
  correct_answers: string[];
  explanation: string | null;
  needs_review: boolean;
  marker_type: string | null;
  confidence_score: number | null;
}

interface QState {
  selected: string | null;
  revealed: boolean;
}

const TF_OPTIONS: OptionShape[] = [
  { id: "T", text: "True" },
  { id: "F", text: "False" },
];

function BankDetail() {
  const { bankId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bank, setBank] = useState<Bank | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [state, setState] = useState<Record<string, QState>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [b, q] = await Promise.all([
        supabase
          .from("question_banks")
          .select("id,title,subject,description")
          .eq("id", bankId)
          .maybeSingle(),
        supabase
          .from("questions")
          .select(
            "id,position,stem,difficulty,image_url,image_caption,type,options,correct_answers,explanation,needs_review,marker_type,confidence_score"
          )
          .eq("bank_id", bankId)
          .order("position", { ascending: true }),
      ]);
      if (cancelled) return;
      setBank(b.data);
      setQuestions((q.data ?? []) as unknown as QuestionRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [bankId]);

  const startExam = async () => {
    if (!user || questions.length === 0) return;
    setStarting(true);
    const { data, error } = await supabase
      .from("exam_attempts")
      .insert({
        user_id: user.id,
        bank_id: bankId,
        total_questions: questions.length,
        time_limit_seconds: questions.length * 90,
      })
      .select("id")
      .single();
    if (error) {
      toast.error(error.message);
      setStarting(false);
      return;
    }
    void navigate({
      to: "/dashboard/exam/$attemptId",
      params: { attemptId: data.id },
    });
  };

  const select = (qid: string, oid: string) => {
    setState((prev) => {
      const cur = prev[qid];
      if (cur?.revealed) return prev; // Lock after reveal
      return { ...prev, [qid]: { selected: oid, revealed: false } };
    });
  };

  const reveal = (qid: string) => {
    setState((prev) => {
      const cur = prev[qid];
      if (!cur?.selected) return prev;
      return { ...prev, [qid]: { ...cur, revealed: true } };
    });
  };

  const reset = (qid: string) => {
    setState((prev) => {
      const next = { ...prev };
      delete next[qid];
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!bank) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/banks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to banks
          </Link>
        </Button>
        <p className="text-sm text-muted-foreground">Bank not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/dashboard/banks">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Banks
          </Link>
        </Button>
      </div>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {bank.title}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {questions.length} questions
            {bank.subject ? ` · ${bank.subject}` : ""}
          </p>
        </div>
        <Button
          onClick={startExam}
          disabled={starting || questions.length === 0}
          size="lg"
        >
          {starting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Start timed exam
        </Button>
      </header>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          No questions in this bank yet.
        </p>
      ) : (
        <ul className="space-y-4">
          {questions.map((q) => (
            <QuestionCard
              key={q.id}
              question={q}
              state={state[q.id]}
              onSelect={(oid) => select(q.id, oid)}
              onReveal={() => reveal(q.id)}
              onReset={() => reset(q.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionCard({
  question: q,
  state,
  onSelect,
  onReveal,
  onReset,
}: {
  question: QuestionRow;
  state: QState | undefined;
  onSelect: (oid: string) => void;
  onReveal: () => void;
  onReset: () => void;
}) {
  const isTF = q.type === "TRUE_FALSE";
  const options = isTF ? TF_OPTIONS : q.options ?? [];
  const selected = state?.selected ?? null;
  const revealed = state?.revealed ?? false;
  const correctSet = new Set(q.correct_answers);
  const isCorrect = selected !== null && correctSet.has(selected);

  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
          {q.position}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary-foreground">
              {isTF ? "True / False" : "SBA"}
            </span>
            {q.difficulty && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {q.difficulty}
              </span>
            )}
            {q.image_url && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <ImageIcon className="h-3 w-3" /> diagram
              </span>
            )}
          </div>
          <p className="mt-2 text-base leading-relaxed text-foreground">
            {q.stem}
          </p>
        </div>
      </div>

      {q.image_url && (
        <figure className="mt-4">
          <img
            src={q.image_url}
            alt={q.image_caption ?? "Question diagram"}
            className="max-h-72 w-full rounded-lg border border-border bg-muted object-contain"
          />
          {q.image_caption && (
            <figcaption className="mt-1 text-xs text-muted-foreground">
              {q.image_caption}
            </figcaption>
          )}
        </figure>
      )}

      {/* Options */}
      <div
        className={cn(
          "mt-4",
          isTF ? "grid grid-cols-2 gap-2" : "space-y-2"
        )}
      >
        {options.map((o) => {
          const isSel = selected === o.id;
          const isRight = correctSet.has(o.id);
          let tone =
            "border-border bg-card hover:border-primary/40 hover:bg-accent/30";
          if (revealed) {
            if (isRight) {
              tone =
                "border-success bg-success/10 text-foreground";
            } else if (isSel) {
              tone = "border-destructive bg-destructive/10 text-foreground";
            } else {
              tone = "border-border bg-card opacity-70";
            }
          } else if (isSel) {
            tone = "border-primary bg-primary/5 shadow-card";
          }

          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onSelect(o.id)}
              disabled={revealed}
              className={cn(
                "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition-all disabled:cursor-not-allowed",
                tone
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  revealed && isRight
                    ? "bg-success text-success-foreground"
                    : revealed && isSel
                      ? "bg-destructive text-destructive-foreground"
                      : isSel
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                )}
              >
                {isTF ? (o.id === "T" ? "✓" : "✗") : o.id}
              </span>
              <span className="flex-1 pt-1">{o.text}</span>
              {revealed && isRight && (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
              )}
              {revealed && isSel && !isRight && (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
            </button>
          );
        })}
      </div>

      {/* Action row */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {!selected && "Select an answer to continue."}
          {selected && !revealed && "Ready when you are."}
          {revealed && (
            <span
              className={cn(
                "inline-flex items-center gap-1 text-sm font-semibold",
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
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {revealed ? (
            <Button variant="outline" size="sm" onClick={onReset}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Try again
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={onReveal}
              disabled={!selected}
              className={cn(!selected && "opacity-60")}
            >
              <Eye className="mr-1.5 h-3.5 w-3.5" />
              Reveal answer
            </Button>
          )}
        </div>
      </div>

      {/* Explanation */}
      {revealed && q.explanation && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Explanation
          </p>
          <p className="mt-1 text-sm leading-relaxed text-foreground">
            {q.explanation}
          </p>
        </div>
      )}
    </li>
  );
}
