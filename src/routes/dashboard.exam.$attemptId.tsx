import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Clock, ChevronLeft, ChevronRight, Flag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/exam/$attemptId")({
  head: () => ({
    meta: [{ title: "Exam — MedAI" }],
  }),
  component: ExamRunner,
});

interface Option {
  id: string;
  text: string;
}

interface Question {
  id: string;
  position: number;
  stem: string;
  options: Option[];
  correct_answers: string[];
  image_url: string | null;
  image_caption: string | null;
}

interface Attempt {
  id: string;
  bank_id: string;
  status: string;
  started_at: string;
  time_limit_seconds: number | null;
  total_questions: number;
}

function ExamRunner() {
  const { attemptId } = Route.useParams();
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [now, setNow] = useState(Date.now());

  // Anti-copy: disable right-click, text selection, copy, and devtool shortcuts
  useEffect(() => {
    const prevent = (e: Event) => e.preventDefault();
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (
        (e.ctrlKey || e.metaKey) &&
        ["c", "x", "a", "s", "p", "u"].includes(k)
      ) {
        e.preventDefault();
      }
      if (e.key === "F12") e.preventDefault();
    };
    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("keydown", onKey);
    document.body.style.userSelect = "none";
    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("keydown", onKey);
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await supabase
        .from("exam_attempts")
        .select("id,bank_id,status,started_at,time_limit_seconds,total_questions")
        .eq("id", attemptId)
        .maybeSingle();
      if (cancelled || !a.data) {
        setLoading(false);
        return;
      }
      const q = await supabase
        .from("questions")
        .select(
          "id,position,stem,options,correct_answers,image_url,image_caption"
        )
        .eq("bank_id", a.data.bank_id)
        .order("position", { ascending: true });
      if (cancelled) return;
      setAttempt(a.data);
      setQuestions((q.data ?? []) as unknown as Question[]);
      setLoading(false);

      if (a.data.status !== "in_progress") {
        void navigate({
          to: "/dashboard/exam/$attemptId/review",
          params: { attemptId },
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId, navigate]);

  // Tick clock
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = useMemo(() => {
    if (!attempt?.time_limit_seconds) return null;
    const elapsed = Math.floor(
      (now - new Date(attempt.started_at).getTime()) / 1000
    );
    return Math.max(0, attempt.time_limit_seconds - elapsed);
  }, [attempt, now]);

  const submit = async () => {
    if (!attempt) return;
    setSubmitting(true);
    try {
      const rows = questions.map((q) => {
        const sel = answers[q.id] ?? [];
        const isCorrect =
          sel.length === q.correct_answers.length &&
          sel.every((s) => q.correct_answers.includes(s));
        return {
          attempt_id: attempt.id,
          question_id: q.id,
          selected_answers: sel,
          is_correct: isCorrect,
        };
      });
      const correctCount = rows.filter((r) => r.is_correct).length;
      const score = (correctCount / questions.length) * 100;

      const { error: insErr } = await supabase
        .from("attempt_answers")
        .insert(rows);
      if (insErr) throw insErr;

      const { error: updErr } = await supabase
        .from("exam_attempts")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          correct_count: correctCount,
          score_percent: Math.round(score * 100) / 100,
        })
        .eq("id", attempt.id);
      if (updErr) throw updErr;

      void navigate({
        to: "/dashboard/exam/$attemptId/review",
        params: { attemptId: attempt.id },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
      setSubmitting(false);
    }
  };

  // Auto-submit on time-up
  useEffect(() => {
    if (remaining === 0 && attempt?.status === "in_progress" && !submitting) {
      toast.warning("Time's up — submitting your exam");
      void submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!attempt || questions.length === 0) {
    return <p className="text-sm text-muted-foreground">Exam not available.</p>;
  }

  const q = questions[idx];
  const selected = answers[q.id] ?? [];
  const multi = q.correct_answers.length > 1;

  const toggle = (oid: string) => {
    setAnswers((prev) => {
      const cur = prev[q.id] ?? [];
      if (multi) {
        return {
          ...prev,
          [q.id]: cur.includes(oid)
            ? cur.filter((x) => x !== oid)
            : [...cur, oid],
        };
      }
      return { ...prev, [q.id]: [oid] };
    });
  };

  const answeredCount = Object.values(answers).filter((a) => a.length).length;

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5 select-none">
      {/* Sticky timer + progress */}
      <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="text-sm">
          <span className="font-semibold text-foreground">
            Q {idx + 1}/{questions.length}
          </span>
          <span className="ml-3 text-muted-foreground">
            Answered {answeredCount}/{questions.length}
          </span>
        </div>
        {remaining !== null && (
          <div
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums ${
              remaining < 60
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            {fmt(remaining)}
          </div>
        )}
      </div>

      {/* Question */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <p className="text-base leading-relaxed text-foreground sm:text-lg">
          {q.stem}
        </p>

        {q.image_url && (
          <figure className="mt-4">
            <img
              src={q.image_url}
              alt={q.image_caption ?? "Question diagram"}
              className="max-h-80 w-full rounded-lg border border-border object-contain bg-muted"
              draggable={false}
              onContextMenu={(e) => e.preventDefault()}
            />
            {q.image_caption && (
              <figcaption className="mt-1 text-xs text-muted-foreground">
                {q.image_caption}
              </figcaption>
            )}
          </figure>
        )}

        <ul className="mt-5 space-y-2">
          {q.options.map((o) => {
            const isSel = selected.includes(o.id);
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => toggle(o.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left text-sm transition-all ${
                    isSel
                      ? "border-primary bg-primary/5 shadow-card"
                      : "border-border bg-card hover:border-primary/40 hover:bg-accent/30"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSel
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {o.id}
                  </span>
                  <span className="flex-1 pt-1 text-foreground">{o.text}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {multi && (
          <p className="mt-3 text-xs text-muted-foreground">
            Multiple correct answers — select all that apply.
          </p>
        )}
      </div>

      {/* Nav controls */}
      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Previous
        </Button>
        {idx === questions.length - 1 ? (
          <Button onClick={submit} disabled={submitting}>
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Flag className="mr-2 h-4 w-4" />
            )}
            Submit exam
          </Button>
        ) : (
          <Button onClick={() => setIdx((i) => Math.min(questions.length - 1, i + 1))}>
            Next
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Question palette */}
      <div className="flex flex-wrap gap-1.5 pt-2">
        {questions.map((qq, i) => {
          const ans = (answers[qq.id] ?? []).length > 0;
          return (
            <button
              key={qq.id}
              onClick={() => setIdx(i)}
              className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold transition-colors ${
                i === idx
                  ? "bg-primary text-primary-foreground"
                  : ans
                    ? "bg-success/15 text-success"
                    : "bg-muted text-muted-foreground hover:bg-secondary"
              }`}
            >
              {i + 1}
            </button>
          );
        })}
      </div>

      {/* Engine credit */}
      <p className="pt-4 text-center text-xs italic text-muted-foreground">
        AI Engine developed by Dr. Mansur Bin Anowar
      </p>
    </div>
  );
}
