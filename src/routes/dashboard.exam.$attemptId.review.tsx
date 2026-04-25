import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { RichExplanation } from "@/components/RichExplanation";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Trophy,
  ArrowLeft,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/exam/$attemptId/review")({
  head: () => ({
    meta: [{ title: "Exam review — MedAI" }],
  }),
  component: ReviewPage,
});

interface Option {
  id: string;
  text: string;
}

interface ReviewQ {
  id: string;
  position: number;
  stem: string;
  options: Option[];
  correct_answers: string[];
  explanation: string | null;
  image_url: string | null;
  image_caption: string | null;
  selected: string[];
  is_correct: boolean;
}

function ReviewPage() {
  const { attemptId } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [questions, setQuestions] = useState<ReviewQ[]>([]);
  const [score, setScore] = useState<{
    correct: number;
    total: number;
    percent: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await supabase
        .from("exam_attempts")
        .select("id,bank_id,correct_count,total_questions,score_percent")
        .eq("id", attemptId)
        .maybeSingle();
      if (cancelled || !a.data) {
        setLoading(false);
        return;
      }
      const [qs, ans] = await Promise.all([
        supabase
          .from("questions")
          .select(
            "id,position,stem,options,correct_answers,explanation,image_url,image_caption"
          )
          .eq("bank_id", a.data.bank_id)
          .order("position", { ascending: true }),
        supabase
          .from("attempt_answers")
          .select("question_id,selected_answers,is_correct")
          .eq("attempt_id", attemptId),
      ]);
      if (cancelled) return;
      const ansMap = new Map<
        string,
        { selected: string[]; is_correct: boolean }
      >();
      for (const r of ans.data ?? []) {
        ansMap.set(r.question_id, {
          selected: r.selected_answers ?? [],
          is_correct: !!r.is_correct,
        });
      }
      const merged = (qs.data ?? []).map((q) => {
        const a2 = ansMap.get(q.id);
        return {
          ...q,
          options: q.options as unknown as Option[],
          selected: a2?.selected ?? [],
          is_correct: a2?.is_correct ?? false,
        } as ReviewQ;
      });
      setQuestions(merged);
      setScore({
        correct: a.data.correct_count,
        total: a.data.total_questions,
        percent: Number(a.data.score_percent ?? 0),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!score) return <p className="text-sm">Attempt not found.</p>;

  const passed = score.percent >= 60;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link to="/dashboard/history">
          <ArrowLeft className="mr-2 h-4 w-4" />
          History
        </Link>
      </Button>

      {/* Score banner */}
      <div
        className="overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{ background: "var(--gradient-subtle)" }}
      >
        <div className="flex items-center gap-4">
          <div
            className={`flex h-12 w-12 items-center justify-center rounded-xl text-primary-foreground ${
              passed ? "" : ""
            }`}
            style={{ background: "var(--gradient-primary)" }}
          >
            <Trophy className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Final score</p>
            <p className="text-3xl font-bold tracking-tight text-foreground">
              {score.percent.toFixed(1)}%
            </p>
            <p className="text-sm text-muted-foreground">
              {score.correct} of {score.total} correct ·{" "}
              <span className={passed ? "text-success" : "text-destructive"}>
                {passed ? "Passed" : "Below pass mark"}
              </span>
            </p>
          </div>
        </div>
      </div>

      <h2 className="text-base font-semibold text-foreground">
        Question review
      </h2>

      <ul className="space-y-3">
        {questions.map((q) => (
          <li
            key={q.id}
            className="rounded-2xl border border-border bg-card p-5 shadow-card"
          >
            <div className="flex items-start gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {q.position}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm text-foreground">{q.stem}</p>
                  {q.is_correct ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <XCircle className="h-5 w-5 shrink-0 text-destructive" />
                  )}
                </div>

                {q.image_url && (
                  <img
                    src={q.image_url}
                    alt={q.image_caption ?? ""}
                    className="mt-3 max-h-64 w-full rounded-lg border border-border object-contain bg-muted"
                  />
                )}

                <ul className="mt-3 space-y-1.5">
                  {q.options.map((o) => {
                    const isCorrect = q.correct_answers.includes(o.id);
                    const isSel = q.selected.includes(o.id);
                    return (
                      <li
                        key={o.id}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
                          isCorrect
                            ? "border-success/40 bg-success/5 text-foreground"
                            : isSel
                              ? "border-destructive/40 bg-destructive/5 text-foreground"
                              : "border-border text-muted-foreground"
                        }`}
                      >
                        <span className="font-bold">{o.id}.</span>
                        <span className="flex-1">{o.text}</span>
                        {isCorrect && (
                          <span className="text-[10px] font-semibold uppercase text-success">
                            Correct
                          </span>
                        )}
                        {isSel && !isCorrect && (
                          <span className="text-[10px] font-semibold uppercase text-destructive">
                            Your answer
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {q.explanation && (
                  <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                    <p className="mb-1 font-semibold text-primary">
                      Explanation
                    </p>
                    {q.explanation}
                  </div>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
