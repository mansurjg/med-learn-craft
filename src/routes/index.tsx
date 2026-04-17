import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import {
  Brain,
  ScanLine,
  Image as ImageIcon,
  Timer,
  ShieldCheck,
  BarChart3,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "MedAI Smart Exam Engine — AI-powered Medical MCQ Platform" },
      {
        name: "description",
        content:
          "Upload MCQ images, let AI format them and embed labeled anatomy diagrams, then take secure timed exams with full review.",
      },
      { property: "og:title", content: "MedAI Smart Exam Engine" },
      {
        property: "og:description",
        content:
          "Turn any medical MCQ image into a professional, AI-enriched exam.",
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: ScanLine,
    title: "Vision OCR + AI formatting",
    body: "Upload a photo or scan of MCQs. Gemini Vision extracts text, corrects OCR errors, and rebuilds each question in clean exam format.",
  },
  {
    icon: ImageIcon,
    title: "Auto-embedded anatomy images",
    body: "Whenever a diagram, dermatome, reflex arc, or pathology specimen is needed, MedAI fetches a labeled image from open medical sources or generates one.",
  },
  {
    icon: Timer,
    title: "Secure exam mode",
    body: "One question per page, configurable timer, anti-copy protection, and a full post-submission review with answers, explanations, and images.",
  },
  {
    icon: BarChart3,
    title: "Performance analytics",
    body: "Track every attempt, see per-topic accuracy, identify weak areas, and watch your exam readiness improve over time.",
  },
  {
    icon: ShieldCheck,
    title: "Privacy & security first",
    body: "Per-user question banks, row-level security, and signed-in only access. Your study material stays yours.",
  },
  {
    icon: Brain,
    title: "High-yield by design",
    body: "Concise, exam-style explanations and references — built by clinicians for clinicians-in-training.",
  },
];

const steps = [
  "Upload a photo or PDF of MCQs",
  "AI extracts and reformats every question",
  "Diagrams are auto-embedded where needed",
  "Take a secure timed exam, review with images",
];

function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: "var(--gradient-subtle)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute -top-32 left-1/2 h-[480px] w-[820px] -translate-x-1/2 rounded-full opacity-40 blur-3xl"
          style={{ background: "var(--gradient-primary)" }}
        />
        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              AI-powered medical exam engine
            </span>
            <h1 className="mt-6 text-balance text-4xl font-bold tracking-tight text-foreground sm:text-6xl">
              Turn MCQ photos into a{" "}
              <span
                className="bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-primary)" }}
              >
                professional exam
              </span>{" "}
              in seconds.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
              MedAI Smart Exam Engine reads your uploaded medical MCQ images,
              formats them like a textbook, embeds labeled anatomical
              diagrams where they're needed, and turns them into a secure
              timed exam — with full review.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link to="/auth">
                  Start free
                  <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Link to="/features">See how it works</Link>
              </Button>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              No credit card required · For medical education only
            </p>
          </div>

          {/* Hero card mock */}
          <div className="relative mx-auto mt-14 max-w-3xl">
            <div
              className="overflow-hidden rounded-2xl border border-border bg-card p-1 shadow-elegant"
              style={{ boxShadow: "var(--shadow-elegant)" }}
            >
              <div className="rounded-xl border border-border/60 bg-background p-6 sm:p-8">
                <div className="mb-4 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Question 12 of 40 · Anatomy</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">
                    ⏱ 18:42
                  </span>
                </div>
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  Which cranial nerve is responsible for innervating the
                  muscles of facial expression?
                </h3>
                <ul className="mt-5 space-y-2 text-sm">
                  {[
                    "a) Trigeminal nerve (CN V)",
                    "b) Facial nerve (CN VII)",
                    "c) Glossopharyngeal nerve (CN IX)",
                    "d) Vagus nerve (CN X)",
                  ].map((opt, i) => (
                    <li
                      key={opt}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        i === 1
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-border text-foreground/80"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                          i === 1
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {i === 1 ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : null}
                      </span>
                      {opt}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From paper MCQs to a polished exam — automatically
          </h2>
          <p className="mt-4 text-muted-foreground">
            A four-step pipeline powered by vision OCR and an AI that knows
            when a diagram is worth a thousand words.
          </p>
        </div>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li
              key={step}
              className="rounded-xl border border-border bg-card p-5 shadow-card"
            >
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold text-primary-foreground"
                style={{ background: "var(--gradient-primary)" }}
              >
                {i + 1}
              </div>
              <p className="mt-4 text-sm font-medium text-foreground">
                {step}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features grid */}
      <section className="bg-secondary/40 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Built for serious medical study
            </h2>
            <p className="mt-4 text-muted-foreground">
              Everything you need to convert raw question banks into
              high-yield, image-rich practice — without the manual work.
            </p>
          </div>
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="rounded-xl border border-border bg-card p-6 shadow-card transition-shadow hover:shadow-elegant"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
                    style={{ background: "var(--gradient-primary)" }}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {f.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {f.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div
          className="overflow-hidden rounded-2xl px-6 py-12 text-center sm:px-12 sm:py-16"
          style={{
            background: "var(--gradient-hero)",
            color: "var(--color-primary-foreground)",
          }}
        >
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            Study smarter. Let AI do the formatting.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-balance text-base opacity-90">
            Create your free account and turn your next stack of MCQ photos
            into an exam-ready study session.
          </p>
          <div className="mt-8">
            <Button asChild size="lg" variant="secondary">
              <Link to="/auth">
                Get started free
                <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
