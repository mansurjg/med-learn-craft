import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  downloadFullQuestionBank,
  downloadFullQuestionBankCsv,
} from "@/lib/export-questions";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Lock,
  Loader2,
  Users,
  BookOpen,
  Activity,
  TrendingUp,
  Download,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({
    meta: [{ title: "Admin — MedAI" }],
  }),
  component: AdminPage,
});

interface PlatformStats {
  users: number;
  banks: number;
  questions: number;
  attempts: number;
  avgScore: number | null;
}

interface BankStat {
  id: string;
  title: string;
  attempts: number;
  avgScore: number | null;
}

function AdminPage() {
  const { user, roles, isStaff, isAdmin, isSuperAdmin, isLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [topBanks, setTopBanks] = useState<BankStat[]>([]);
  const [downloading, setDownloading] = useState(false);
  const [downloadingCsv, setDownloadingCsv] = useState(false);

  // Debug: surface auth state so admins can verify role detection
  useEffect(() => {
    console.log("[AdminPage] auth state", {
      userId: user?.id,
      email: user?.email,
      roles,
      isAdmin,
      isSuperAdmin,
      isStaff,
      isLoading,
    });
  }, [user, roles, isAdmin, isSuperAdmin, isStaff, isLoading]);

  const handleDownload = async () => {
    if (!user) return;
    setDownloading(true);
    try {
      const { count, fileName } = await downloadFullQuestionBank(user.id);
      toast.success(`Exported ${count} questions`, { description: fileName });
    } catch (err) {
      console.error(err);
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleDownloadCsv = async () => {
    if (!user) return;
    setDownloadingCsv(true);
    try {
      const { count, fileName } = await downloadFullQuestionBankCsv(user.id);
      toast.success(`Exported ${count} questions (CSV)`, { description: fileName });
    } catch (err) {
      console.error(err);
      toast.error("CSV export failed", {
        description: err instanceof Error ? err.message : "Please try again.",
      });
    } finally {
      setDownloadingCsv(false);
    }
  };

  useEffect(() => {
    if (!isStaff) return;
    let cancelled = false;
    void (async () => {
      const [users, banks, questions, attempts, banksFull] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase
          .from("question_banks")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("questions")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("exam_attempts")
          .select("score_percent,bank_id,status")
          .eq("status", "completed"),
        supabase.from("question_banks").select("id,title"),
      ]);

      if (cancelled) return;

      const completed = attempts.data ?? [];
      const avg =
        completed.length > 0
          ? completed.reduce(
              (s, a) => s + Number(a.score_percent ?? 0),
              0
            ) / completed.length
          : null;

      // Aggregate by bank
      const byBank = new Map<string, { count: number; total: number }>();
      for (const a of completed) {
        const cur = byBank.get(a.bank_id) ?? { count: 0, total: 0 };
        cur.count += 1;
        cur.total += Number(a.score_percent ?? 0);
        byBank.set(a.bank_id, cur);
      }
      const titleMap = new Map(
        (banksFull.data ?? []).map((b) => [b.id, b.title])
      );
      const ranked: BankStat[] = Array.from(byBank.entries())
        .map(([id, v]) => ({
          id,
          title: titleMap.get(id) ?? "Untitled",
          attempts: v.count,
          avgScore: v.count > 0 ? v.total / v.count : null,
        }))
        .sort((a, b) => b.attempts - a.attempts)
        .slice(0, 5);

      setStats({
        users: users.count ?? 0,
        banks: banks.count ?? 0,
        questions: questions.count ?? 0,
        attempts: completed.length,
        avgScore: avg,
      });
      setTopBanks(ranked);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isStaff]);

  // Wait for both session AND roles to load before deciding access
  if (isLoading || (user && roles.length === 0)) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isStaff) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Admin access required
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              Admin
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Platform analytics and content overview.
            </p>
          </div>
        </div>
        <Button
          onClick={handleDownload}
          disabled={downloading}
          className="w-full gap-2 sm:w-auto"
        >
          {downloading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          {downloading ? "Preparing…" : "Download Full Question Bank"}
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat icon={Users} label="Users" value={stats?.users ?? 0} />
            <Stat icon={BookOpen} label="Banks" value={stats?.banks ?? 0} />
            <Stat icon={Activity} label="Questions" value={stats?.questions ?? 0} />
            <Stat
              icon={TrendingUp}
              label="Platform avg"
              value={
                stats?.avgScore !== null && stats?.avgScore !== undefined
                  ? `${Math.round(stats.avgScore)}%`
                  : "—"
              }
            />
          </div>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Top banks by attempts
            </h2>
            {topBanks.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/40 p-8 text-center text-sm text-muted-foreground">
                No completed attempts yet.
              </div>
            ) : (
              <ul className="space-y-2">
                {topBanks.map((b, i) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-card"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {b.title}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {b.attempts} attempts
                        </p>
                      </div>
                    </div>
                    <span className="text-sm font-semibold text-primary">
                      {b.avgScore !== null
                        ? `${Math.round(b.avgScore)}%`
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
        {value}
      </p>
    </div>
  );
}
