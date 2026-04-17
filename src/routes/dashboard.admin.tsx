import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { ShieldCheck, Lock } from "lucide-react";

export const Route = createFileRoute("/dashboard/admin")({
  head: () => ({
    meta: [{ title: "Admin — MedAI" }],
  }),
  component: AdminPage,
});

function AdminPage() {
  const { isAdmin, isLoading } = useAuth();

  if (isLoading) return null;

  if (!isAdmin) {
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
      <header className="flex items-center gap-3">
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
            User management and platform analytics.
          </p>
        </div>
      </header>

      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <h3 className="text-base font-semibold text-foreground">
          Admin dashboard arrives in Phase 4
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          User management, platform-wide analytics (pass rates, question
          difficulty, time-per-question) and content moderation will be built
          once the upload pipeline and exam mode are in place.
        </p>
      </div>
    </div>
  );
}
