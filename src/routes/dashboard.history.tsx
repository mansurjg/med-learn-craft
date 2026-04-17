import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { History, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/history")({
  head: () => ({
    meta: [{ title: "Exam history — MedAI" }],
  }),
  component: HistoryPage,
});

interface Attempt {
  id: string;
  status: string;
  total_questions: number;
  correct_count: number;
  score_percent: number | null;
  completed_at: string | null;
  created_at: string;
}

function HistoryPage() {
  const { user } = useAuth();
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("exam_attempts")
        .select(
          "id,status,total_questions,correct_count,score_percent,completed_at,created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setAttempts(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Exam history
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          All your past attempts in one place.
        </p>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : attempts.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <History className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            No exams yet
          </h3>
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
            Once you take an exam, your attempts will appear here with full
            score history.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {attempts.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-card"
            >
              <div>
                <p className="text-sm font-medium text-foreground">
                  {a.correct_count}/{a.total_questions} correct
                </p>
                <p className="text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString()} · {a.status}
                </p>
              </div>
              <p className="text-lg font-semibold text-primary">
                {a.score_percent !== null ? `${a.score_percent}%` : "—"}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
