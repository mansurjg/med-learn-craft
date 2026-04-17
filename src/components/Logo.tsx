import { Link } from "@tanstack/react-router";

export function Logo({ to = "/" }: { to?: string }) {
  return (
    <Link
      to={to}
      className="flex items-center gap-2 group"
      aria-label="MedAI Smart Exam Engine"
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg shadow-card transition-transform group-hover:scale-105"
        style={{ background: "var(--gradient-primary)" }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="h-5 w-5 text-primary-foreground"
        >
          <path
            d="M12 2v6M12 16v6M2 12h6M16 12h6M5.6 5.6l4.2 4.2M14.2 14.2l4.2 4.2M5.6 18.4l4.2-4.2M14.2 9.8l4.2-4.2"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      </div>
      <div className="flex flex-col leading-tight">
        <span className="text-base font-semibold tracking-tight text-foreground">
          MedAI
        </span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Exam Engine
        </span>
      </div>
    </Link>
  );
}
