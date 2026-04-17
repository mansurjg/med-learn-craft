import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2, ImagePlus, X, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/upload")({
  head: () => ({
    meta: [{ title: "Upload MCQs — MedAI" }],
  }),
  component: UploadPage,
});

interface FileItem {
  file: File;
  preview: string;
}

function UploadPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [files, setFiles] = useState<FileItem[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    if (!list) return;
    const next: FileItem[] = [];
    for (const f of Array.from(list)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 8 * 1024 * 1024) {
        toast.error(`${f.name} is larger than 8MB`);
        continue;
      }
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setFiles((prev) => [...prev, ...next]);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removeFile = (i: number) => {
    setFiles((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  };

  const toDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const submit = async () => {
    if (!title.trim()) {
      toast.error("Please enter a bank title");
      return;
    }
    if (files.length === 0) {
      toast.error("Please add at least one image");
      return;
    }
    setBusy(true);
    try {
      const images = await Promise.all(files.map((f) => toDataUrl(f.file)));
      const { data, error } = await supabase.functions.invoke(
        "extract-mcqs",
        {
          body: {
            images,
            bankTitle: title.trim(),
            subject: subject.trim() || null,
          },
        }
      );
      if (error) throw error;
      toast.success(`Extracted ${data.count} questions`);
      void navigate({
        to: "/dashboard/banks/$bankId",
        params: { bankId: data.bankId },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          Upload MCQs
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos or scans — MedAI extracts every question and embeds diagrams.
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
          <Label>Images</Label>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="mt-1.5 flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/40 px-6 py-10 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/5 disabled:opacity-50"
          >
            <ImagePlus className="h-6 w-6 text-primary" />
            <span className="font-medium text-foreground">
              Click to add MCQ images
            </span>
            <span className="text-xs">PNG, JPG up to 8MB each</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={onPick}
          />
        </div>

        {files.length > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {files.map((f, i) => (
              <div
                key={i}
                className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
              >
                <img
                  src={f.preview}
                  alt={`Upload ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  disabled={busy}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by Gemini Vision + Wikimedia
          </div>
          <Button onClick={submit} disabled={busy || files.length === 0}>
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Extracting…
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Extract & save
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
