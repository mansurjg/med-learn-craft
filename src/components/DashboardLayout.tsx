import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard,
  BookOpen,
  Upload,
  History,
  ShieldCheck,
  LogOut,
  User as UserIcon,
  Users as UsersIcon,
  ListChecks,
} from "lucide-react";

const navItems = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true },
  { to: "/dashboard/banks", label: "Question Banks", icon: BookOpen, exact: false },
  { to: "/dashboard/questions", label: "All Questions", icon: ListChecks, exact: false },
  { to: "/dashboard/upload", label: "Upload MCQs", icon: Upload, exact: false },
  { to: "/dashboard/history", label: "Exam History", icon: History, exact: false },
  { to: "/dashboard/profile", label: "Profile", icon: UserIcon, exact: false },
] as const;

export function DashboardLayout() {
  const { signOut, user, isAdmin, isStaff, isSuperAdmin } = useAuth();
  const location = useLocation();
  const roleLabel = isSuperAdmin
    ? "Super Admin"
    : isAdmin
      ? "Administrator"
      : "Member";

  return (
    <div className="flex min-h-screen flex-col bg-background md:flex-row">
      {/* Sidebar (desktop) */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border/60 bg-sidebar md:flex">
        <div className="flex h-16 items-center border-b border-border/60 px-5">
          <Logo to="/dashboard" />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
          {isStaff && (
            <>
              <Link
                to="/dashboard/users"
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/dashboard/users")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <UsersIcon className="h-4 w-4" />
                Users
              </Link>
              <Link
                to="/dashboard/admin"
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  location.pathname.startsWith("/dashboard/admin")
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Admin
              </Link>
            </>
          )}
        </nav>
        <div className="border-t border-border/60 p-3">
          <div className="mb-3 px-2 text-xs">
            <p className="truncate font-medium text-foreground">
              {user?.email}
            </p>
            <p className="text-muted-foreground">{roleLabel}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start"
            onClick={() => void signOut()}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-border/60 bg-sidebar px-4 md:hidden">
        <Logo to="/dashboard" />
        <Button variant="ghost" size="sm" onClick={() => void signOut()}>
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main className="flex-1 overflow-x-hidden">
        <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>

        {/* Mobile bottom nav */}
        <nav className="sticky bottom-0 z-30 mt-4 flex justify-around border-t border-border/60 bg-background/95 px-2 py-2 backdrop-blur md:hidden">
          {navItems.slice(0, 4).map((item) => {
            const Icon = item.icon;
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex flex-col items-center gap-0.5 rounded-md px-3 py-1.5 text-[10px] font-medium ${
                  active ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-5 w-5" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </main>
    </div>
  );
}
