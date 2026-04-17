import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BookOpen, Upload, Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard/banks")({
  head: () => ({
    meta: [{ title: "Question banks — MedAI" }],
  }),
  component: BanksPage,
});

interface Bank {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  created_at: string;
}

function BanksPage() {
  const { user } = useAuth();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("question_banks")
        .select("id,title,description,subject,created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      setBanks(data ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <div className="space-y-6">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Question banks
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your saved MCQ collections.
          </p>
        </div>
        <Button asChild>
          <Link to="/dashboard/upload">
            <Upload className="mr-2 h-4 w-4" />
            New upload
          </Link>
        </Button>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : banks.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {banks.map((b) => (
            <li
              key={b.id}
              className="rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {b.title}
                  </p>
                  {b.subject && (
                    <p className="text-xs text-muted-foreground">{b.subject}</p>
                  )}
                  {b.description && (
                    <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">
                      {b.description}
                    </p>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
      <div
        className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground"
        style={{ background: "var(--gradient-primary)" }}
      >
        <BookOpen className="h-6 w-6" />
      </div>
      <h3 className="mt-4 text-base font-semibold text-foreground">
        No question banks yet
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Upload a photo or scan of MCQs to create your first bank. MedAI will
        format every question and embed diagrams automatically.
      </p>
      <Button asChild className="mt-5">
        <Link to="/dashboard/upload">
          <Upload className="mr-2 h-4 w-4" />
          Upload MCQs
        </Link>
      </Button>
    </div>
  );
}
