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
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

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

interface QuestionRow {
  id: string;
  position: number;
  stem: string;
  difficulty: string | null;
  image_url: string | null;
}

function BankDetail() {
  const { bankId } = Route.useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [bank, setBank] = useState<Bank | null>(null);
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
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
          .select("id,position,stem,difficulty,image_url")
          .eq("bank_id", bankId)
          .order("position", { ascending: true }),
      ]);
      if (cancelled) return;
      setBank(b.data);
      setQuestions(q.data ?? []);
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
          Start exam
        </Button>
      </header>

      <ul className="space-y-2">
        {questions.map((q) => (
          <li
            key={q.id}
            className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
              {q.position}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{q.stem}</p>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                {q.difficulty && (
                  <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">
                    {q.difficulty}
                  </span>
                )}
                {q.image_url && (
                  <span className="inline-flex items-center gap-1">
                    <ImageIcon className="h-3 w-3" /> diagram
                  </span>
                )}
              </div>
            </div>
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
          </li>
        ))}
      </ul>
    </div>
  );
}
