import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";

export const Route = createFileRoute("/dashboard/change-password")({
  head: () => ({ meta: [{ title: "Change Password — MedAI" }] }),
  component: ChangePasswordPage,
});

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function ChangePasswordPage() {
  const { user, refreshProfile, forcePasswordChange } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = schema.parse({ password, confirm });
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      if (user) {
        await supabase
          .from("profiles")
          .update({ force_password_change: false })
          .eq("user_id", user.id);
      }
      await refreshProfile();
      toast.success("Password updated");
      void navigate({ to: "/dashboard" });
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0]?.message ?? "Invalid input");
      } else if (err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md space-y-6">
      <header className="flex items-center gap-3">
        <div
          className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
          style={{ background: "var(--gradient-primary)" }}
        >
          <KeyRound className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Change password</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {forcePasswordChange
              ? "You must set a new password before continuing."
              : "Update your account password."}
          </p>
        </div>
      </header>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-card"
      >
        <div className="space-y-1.5">
          <Label htmlFor="np">New password</Label>
          <Input
            id="np"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            maxLength={128}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cp">Confirm password</Label>
          <Input
            id="cp"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            minLength={8}
            maxLength={128}
            required
          />
        </div>
        <Button type="submit" disabled={saving} className="w-full">
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update password
        </Button>
      </form>
    </div>
  );
}
