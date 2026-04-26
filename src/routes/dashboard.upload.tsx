import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Upload,
  Loader2,
  X,
  Sparkles,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/dashboard/upload")({
  head: () => ({
    meta: [{ title: "Upload MCQs — MedAI" }],
  }),
  component: UploadPage,
});

interface FileItem {
  file: File;
  preview: string | null; // null for PDFs
  kind: "image" | "pdf";
}

type Stage =
  | "idle"
  | "reading"
  | "extracting"
  | "rewriting"
  | "explanations"
  | "images"
  | "formatting"
  | "saving"
  | "done"
  | "error";

interface ResultSummary {
  bankId: string;
  count: number;
  flagged: number;
}

const STAGE_BASE: { key: Stage; label: string }[] = [
  { key: "reading", label: "Reading files" },
  { key: "extracting", label: "Extracting questions" },
  { key: "rewriting", label: "Rewriting scenarios" },
  { key: "explanations", label: "Generating explanations" },
  { key: "images", label: "Searching open-license images" },
  { key: "formatting", label: "Final formatting" },
  { key: "saving", label: "Saving to database" },
];

const MAX_FILES = 20;
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file

function UploadPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [pastedText, setPastedText] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [result, setResult] = useState<ResultSummary | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [rewriteScenario, setRewriteScenario] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const STAGES = STAGE_BASE.filter(
    (s) => s.key !== "rewriting" || rewriteScenario
  );

  const busy = stage !== "idle" && stage !== "done" && stage !== "error";

  const addFiles = useCallback((list: FileList | File[]) => {
    const next: FileItem[] = [];
    for (const f of Array.from(list)) {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      if (!isImage && !isPdf) {
        toast.error(`${f.name}: only PDF or image files`);
        continue;
      }
      if (f.size > MAX_BYTES) {
        toast.error(`${f.name} is larger than 25MB`);
        continue;
      }
      next.push({
        file: f,
        preview: isImage ? URL.createObjectURL(f) : null,
        kind: isImage ? "image" : "pdf",
      });
    }
    setFiles((prev) => {
      const merged = [...prev, ...next];
      if (merged.length > MAX_FILES) {
        toast.error(`Maximum ${MAX_FILES} files per upload`);
        return merged.slice(0, MAX_FILES);
      }
      return merged;
    });
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(e.target.files);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files) addFiles(e.dataTransfer.files);
  };

  const removeFile = (i: number) => {
    setFiles((prev) => {
      const f = prev[i];
      if (f.preview) URL.revokeObjectURL(f.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const result = r.result as string;
        // strip "data:mime;base64,"
        const idx = result.indexOf(",");
        resolve(idx >= 0 ? result.slice(idx + 1) : result);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const submit = async () => {
    if (!title.trim()) return toast.error("Please enter a bank title");
    const trimmedText = pastedText.trim();
    if (files.length === 0 && !trimmedText)
      return toast.error("Add at least one file or paste MCQ text");

    setResult(null);
    setStage("reading");
    try {
      const payloadFiles = await Promise.all(
        files.map(async (f) => ({
          name: f.file.name,
          mimeType: f.file.type,
          data: await fileToBase64(f.file),
        }))
      );

      // Visual progression — actual processing is one round-trip server-side
      setStage("extracting");
      const cosmetic = (s: Stage, ms: number) =>
        new Promise<void>((res) => {
          setStage(s);
          setTimeout(res, ms);
        });
      // start the network request immediately
      const requestPromise = supabase.functions.invoke("extract-mcqs", {
        body: {
          files: payloadFiles,
          text: trimmedText || undefined,
          bankTitle: title.trim(),
          subject: subject.trim() || null,
          rewriteScenario,
        },
      });

      // Cycle through cosmetic stages while the request runs (in parallel)
      void (async () => {
        if (rewriteScenario) await cosmetic("rewriting", 1200);
        await cosmetic("explanations", 1200);
        await cosmetic("images", 1200);
        await cosmetic("formatting", 800);
        setStage("saving");
      })();

      const { data, error } = await requestPromise;
      if (error) throw error;

      setStage("done");
      setResult({
        bankId: data.bankId,
        count: data.count,
        flagged: data.flagged ?? 0,
      });
      toast.success(`Extracted ${data.count} questions`);
    } catch (e) {
      setStage("error");
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg);
    }
  };

  const reset = () => {
    files.forEach((f) => f.preview && URL.revokeObjectURL(f.preview));
    setFiles([]);
    setTitle("");
    setSubject("");
    setRewriteScenario(false);
    setStage("idle");
    setResult(null);
  };

  // Result screen
  if (stage === "done" && result) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Upload complete
          </h1>
        </header>
        <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/15 text-success">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-foreground">
                {result.count} questions extracted
              </p>
              <p className="text-sm text-muted-foreground">
                {result.count - result.flagged} answers detected automatically
                {result.flagged > 0 && ` · ${result.flagged} flagged for review`}
              </p>
            </div>
          </div>

          {result.flagged > 0 && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <div>
                <p className="font-medium text-foreground">
                  {result.flagged}{" "}
                  {result.flagged === 1 ? "question needs" : "questions need"}{" "}
                  review
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Low-confidence detections — open the bank to verify and edit
                  the correct answers before publishing.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
            <Button
              onClick={() =>
                navigate({
                  to: "/dashboard/banks/$bankId",
                  params: { bankId: result.bankId },
                })
              }
            >
              Open bank
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={reset}>
              Upload more
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Upload MCQs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          PDFs or photos — MedAI extracts questions, detects ticked / starred /
          highlighted answers, and embeds diagrams.
        </p>
      </header>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="title">Bank title *</Label>
            <Input
              id="title"
              placeholder="Cardiology — Block 3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="subject">Subject (optional)</Label>
            <Input
              id="subject"
              placeholder="Cardiology"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={busy}
            />
          </div>
        </div>

        <div className="mt-5">
          <Label>Files</Label>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => !busy && inputRef.current?.click()}
            className={cn(
              "mt-1.5 flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed bg-muted/40 px-6 py-10 text-sm text-muted-foreground transition-colors",
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50 hover:bg-primary/5",
              busy && "cursor-not-allowed opacity-50"
            )}
          >
            <Upload className="h-6 w-6 text-primary" />
            <span className="font-medium text-foreground">
              Drop PDFs or images here
            </span>
            <span className="text-xs">
              Or click to browse · PDF / PNG / JPG · up to 25MB each · max{" "}
              {MAX_FILES} files
            </span>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </div>

        {files.length > 0 && (
          <ul className="mt-4 space-y-2">
            {files.map((f, i) => (
              <li
                key={i}
                className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5"
              >
                {f.kind === "image" && f.preview ? (
                  <img
                    src={f.preview}
                    alt={f.file.name}
                    className="h-12 w-12 rounded object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/10 text-primary">
                    <FileText className="h-5 w-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">
                    {f.file.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {f.kind === "pdf" ? "PDF" : "Image"} ·{" "}
                    {(f.file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {/* Copyright rewrite toggle */}
        <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <Label
                htmlFor="rewrite"
                className="text-sm font-medium text-foreground"
              >
                Rewrite scenarios to avoid copyright
              </Label>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                AI rewrites each clinical vignette with new patient details,
                setting and numbers — concept and correct answer stay identical.
                Pure factual MCQs are kept as-is.
              </p>
            </div>
          </div>
          <Switch
            id="rewrite"
            checked={rewriteScenario}
            onCheckedChange={setRewriteScenario}
            disabled={busy}
          />
        </div>

        {busy && (
          <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Processing
            </p>
            <ul className="mt-3 space-y-2">
              {STAGES.map((s) => {
                const idx = STAGES.findIndex((x) => x.key === s.key);
                const currentIdx = STAGES.findIndex((x) => x.key === stage);
                const status =
                  idx < currentIdx
                    ? "done"
                    : idx === currentIdx
                      ? "active"
                      : "pending";
                return (
                  <li
                    key={s.key}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    {status === "done" ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : status === "active" ? (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />
                    )}
                    <span
                      className={cn(
                        status === "active"
                          ? "font-medium text-foreground"
                          : status === "done"
                            ? "text-muted-foreground"
                            : "text-muted-foreground/60"
                      )}
                    >
                      {s.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Gemini · structured explanations · open-license diagrams · references
          </div>
          <div className="flex gap-2">
            {stage === "error" && (
              <Button variant="outline" onClick={() => setStage("idle")}>
                Try again
              </Button>
            )}
            <Button
              onClick={submit}
              disabled={busy || files.length === 0 || !title.trim()}
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing…
                </>
              ) : (
                <>
                  <ImageIcon className="mr-2 h-4 w-4" />
                  Extract & save
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
