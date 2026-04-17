import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — MedAI Smart Exam Engine" },
      {
        name: "description",
        content:
          "Simple, student-friendly pricing for MedAI Smart Exam Engine.",
      },
      { property: "og:title", content: "Pricing — MedAI Smart Exam Engine" },
      {
        property: "og:description",
        content: "Free to start, fair pricing as you grow.",
      },
    ],
  }),
  component: PricingPage,
});

const tiers = [
  {
    name: "Free",
    price: "$0",
    blurb: "Perfect for trying it out",
    features: [
      "Up to 50 questions",
      "Basic exam mode",
      "Personal question banks",
      "Email support",
    ],
    cta: "Start free",
    highlight: false,
  },
  {
    name: "Student",
    price: "$9",
    suffix: "/mo",
    blurb: "For serious exam prep",
    features: [
      "Unlimited questions",
      "AI image embedding",
      "Full analytics & history",
      "Priority support",
    ],
    cta: "Coming soon",
    highlight: true,
  },
  {
    name: "Institution",
    price: "Custom",
    blurb: "For colleges and programs",
    features: [
      "Team accounts & roles",
      "Shared question banks",
      "Admin analytics dashboard",
      "Dedicated onboarding",
    ],
    cta: "Contact us",
    highlight: false,
  },
];

function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Simple pricing
          </h1>
          <p className="mt-4 text-muted-foreground">
            Free to start. Upgrade when you're ready for serious prep.
          </p>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {tiers.map((t) => (
            <div
              key={t.name}
              className={`flex flex-col rounded-2xl border p-6 ${
                t.highlight
                  ? "border-primary bg-card shadow-elegant"
                  : "border-border bg-card shadow-card"
              }`}
            >
              {t.highlight && (
                <span className="mb-3 inline-flex w-fit rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold text-foreground">
                {t.name}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">{t.blurb}</p>
              <p className="mt-4 text-4xl font-bold tracking-tight text-foreground">
                {t.price}
                {t.suffix && (
                  <span className="text-base font-medium text-muted-foreground">
                    {t.suffix}
                  </span>
                )}
              </p>
              <ul className="mt-6 flex-1 space-y-2 text-sm">
                {t.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2 text-foreground/85"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    {f}
                  </li>
                ))}
              </ul>
              <Button
                asChild
                className="mt-6"
                variant={t.highlight ? "default" : "outline"}
              >
                <Link to="/auth">{t.cta}</Link>
              </Button>
            </div>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
