import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="border-t border-border/60 bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Logo />
        <p className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} MedAI Smart Exam Engine. For medical
          education only — not a diagnostic tool.
        </p>
      </div>
    </footer>
  );
}
