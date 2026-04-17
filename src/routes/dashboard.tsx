import { createFileRoute, redirect, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useAuth } from "@/lib/auth-context";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/dashboard")({
  component: DashboardRoute,
});

function DashboardRoute() {
  const { isAuthenticated, isLoading, forcePasswordChange } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (
      !isLoading &&
      isAuthenticated &&
      forcePasswordChange &&
      location.pathname !== "/dashboard/change-password"
    ) {
      void navigate({ to: "/dashboard/change-password", replace: true });
    }
  }, [isLoading, isAuthenticated, forcePasswordChange, location.pathname, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    throw redirect({ to: "/auth" });
  }

  return <DashboardLayout />;
}
