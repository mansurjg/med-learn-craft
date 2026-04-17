import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/features")({
  head: () => ({
    meta: [
      { title: "Features — MedAI Smart Exam Engine" },
      {
        name: "description",
        content:
          "Vision OCR, auto-embedded anatomy diagrams, secure exam mode and analytics — discover what MedAI can do.",
      },
      { property: "og:title", content: "Features — MedAI Smart Exam Engine" },
      {
        property: "og:description",
        content:
          "Discover the AI features that turn medical MCQ photos into professional exams.",
      },
    ],
  }),
  component: FeaturesPage,
});

const sections = [
  {
    title: "Vision-based OCR",
    body: "Upload phone photos, scans, or PDFs of MCQs. Gemini Vision reads the text directly from the image — no separate OCR pass — and corrects common errors while keeping the original wording intact.",
  },
  {
    title: "Exam-grade formatting",
    body: "Each question is rebuilt with a clean stem, options a–e, the correct answer(s) bolded, and a concise high-yield explanation suitable for board prep.",
  },
  {
    title: "Hybrid image embedding",
    body: "Whenever a diagram is helpful — anatomy, dermatomes, reflex arcs, pathology specimens — MedAI first searches Wikimedia Commons. If nothing suitable is found, an AI-generated labeled diagram is created instead.",
  },
  {
    title: "Secure exam mode",
    body: "One question per page, a configurable timer, anti-copy and right-click protection, and a structured post-submission review with score, correct answers, explanations, and embedded images.",
  },
  {
    title: "Personal question banks",
    body: "Organize your uploads into themed banks — anatomy, pharmacology, pathology, USMLE — and reuse them across study sessions.",
  },
  {
    title: "Analytics & history",
    body: "Every attempt is saved with score, time, and per-question correctness. Spot weak topics and track readiness over time.",
  },
];

function FeaturesPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-4xl px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          Features
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Everything MedAI does, in one place.
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2">
          {sections.map((s) => (
            <article
              key={s.title}
              className="rounded-xl border border-border bg-card p-6 shadow-card"
            >
              <h2 className="text-lg font-semibold text-foreground">
                {s.title}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
            </article>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
