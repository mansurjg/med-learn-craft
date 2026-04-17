import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Upload,
  BookOpen,
  History,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [{ title: "Dashboard — MedAI Smart Exam Engine" }],
  }),
  component: DashboardOverview,
});

interface Stats {
  banks: number;
  questions: number;
  attempts: number;
  averageScore: number | null;
}

function DashboardOverview() {
  const { user } = useAuth();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const load = async () => {
      const [profileRes, banksRes, questionsRes, attemptsRes] =
        await Promise.all([
          supabase
            .from("profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("question_banks")
            .select("id", { count: "exact", head: true })
            .eq("owner_id", user.id),
          supabase
            .from("questions")
            .select("id, question_banks!inner(owner_id)", {
              count: "exact",
              head: true,
            })
            .eq("question_banks.owner_id", user.id),
          supabase
            .from("exam_attempts")
            .select("score_percent, status")
            .eq("user_id", user.id)
            .eq("status", "completed"),
        ]);

      if (cancelled) return;

      setDisplayName(profileRes.data?.display_name ?? null);

      const completed = attemptsRes.data ?? [];
      const avg =
        completed.length > 0
          ? completed.reduce(
              (sum, a) => sum + Number(a.score_percent ?? 0),
              0
            ) / completed.length
          : null;

      setStats({
        banks: banksRes.count ?? 0,
        questions: questionsRes.count ?? 0,
        attempts: completed.length,
        averageScore: avg,
      });
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Welcome{displayName ? `, ${displayName}` : ""} 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Here's your study overview.
        </p>
      </header>

      {/* Stats grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Question banks" value={stats?.banks ?? 0} loading={loading} />
        <StatCard label="Questions" value={stats?.questions ?? 0} loading={loading} />
        <StatCard label="Exams taken" value={stats?.attempts ?? 0} loading={loading} />
        <StatCard
          label="Average score"
          value={
            stats?.averageScore !== null && stats?.averageScore !== undefined
              ? `${Math.round(stats.averageScore)}%`
              : "—"
          }
          loading={loading}
        />
      </div>

      {/* Get started panel */}
      <section
        className="overflow-hidden rounded-2xl border border-border p-6 sm:p-8"
        style={{ background: "var(--gradient-subtle)" }}
      >
        <div className="flex items-start gap-4">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-foreground">
              Ready to build your first exam?
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a photo or scan of MCQs and let MedAI extract, format, and
              embed labeled diagrams automatically.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button asChild>
                <Link to="/dashboard/upload">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload MCQs
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/dashboard/banks">
                  <BookOpen className="mr-2 h-4 w-4" />
                  Browse banks
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Quick links */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <QuickLink
            to="/dashboard/banks"
            icon={BookOpen}
            title="Question banks"
            description="View and organize your saved MCQ collections."
          />
          <QuickLink
            to="/dashboard/history"
            icon={History}
            title="Exam history"
            description="Review past attempts, scores, and explanations."
          />
        </div>
      </section>
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number | string;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
      </p>
    </div>
  );
}

function QuickLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string;
  icon: typeof BookOpen;
  title: string;
  description: string;
}) {
  return (
    <Link
      to={to}
      className="group flex items-center justify-between rounded-xl border border-border bg-card p-5 shadow-card transition-shadow hover:shadow-elegant"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
    </Link>
  );
}
