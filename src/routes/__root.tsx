import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "MedAI Smart Exam Engine — AI-powered Medical MCQ Platform" },
      {
        name: "description",
        content:
          "Upload medical MCQ images and let AI extract, format, and enrich them into a secure interactive exam with labeled anatomical diagrams.",
      },
      { name: "author", content: "MedAI" },
      {
        property: "og:title",
        content: "MedAI Smart Exam Engine",
      },
      {
        property: "og:description",
        content:
          "AI-powered medical MCQ exam platform with automatic anatomical image embedding.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { property: "og:title", content: "MedAI Smart Exam Engine — AI-powered Medical MCQ Platform" },
      { name: "twitter:title", content: "MedAI Smart Exam Engine — AI-powered Medical MCQ Platform" },
      { name: "description", content: "MedAI Smart Exam Engine transforms medical MCQs into interactive, AI-enhanced learning experiences." },
      { property: "og:description", content: "MedAI Smart Exam Engine transforms medical MCQs into interactive, AI-enhanced learning experiences." },
      { name: "twitter:description", content: "MedAI Smart Exam Engine transforms medical MCQs into interactive, AI-enhanced learning experiences." },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  );
}
