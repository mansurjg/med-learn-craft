import { createFileRoute } from "@tanstack/react-router";
import { Upload, Sparkles } from "lucide-react";

export const Route = createFileRoute("/dashboard/upload")({
  head: () => ({
    meta: [{ title: "Upload MCQs — MedAI" }],
  }),
  component: UploadPage,
});

function UploadPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Upload MCQs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos, scans, or PDFs — MedAI will extract and format everything.
        </p>
      </header>

      <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
        <div
          className="mx-auto flex h-12 w-12 items-center justify-center rounded-full text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <Upload className="h-6 w-6" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">
          Coming in Phase 2
        </h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          The Phase 1 foundation is ready: auth, profiles, database schema, and
          a clean dashboard. The Gemini Vision OCR pipeline and Wikimedia/AI
          image embedding will land in the next phase.
        </p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
          <Sparkles className="h-3.5 w-3.5" />
          Ready for upload pipeline
        </div>
      </div>
    </div>
  );
}
