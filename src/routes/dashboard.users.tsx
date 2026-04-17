import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback, type FormEvent } from "react";
import { z } from "zod";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Lock, Loader2, Plus, Users as UsersIcon } from "lucide-react";

export const Route = createFileRoute("/dashboard/users")({
  head: () => ({ meta: [{ title: "User Management — MedAI" }] }),
  component: UsersPage,
});

const schema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128),
  role: z.enum(["super_admin", "admin", "doctor", "student"]),
});

interface UserRow {
  user_id: string;
  display_name: string | null;
  institution: string | null;
  created_at: string;
  roles: AppRole[];
}

const PAGE_SIZE = 20;

function UsersPage() {
  const { isStaff, isSuperAdmin, isLoading } = useAuth();
  const [rows, setRows] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("user_id, display_name, institution, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const ids = (profiles ?? []).map((p) => p.user_id);
    const { data: rolesData } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as { user_id: string; role: AppRole }[] };
    const rolesByUser = new Map<string, AppRole[]>();
    for (const r of rolesData ?? []) {
      const list = rolesByUser.get(r.user_id) ?? [];
      list.push(r.role as AppRole);
      rolesByUser.set(r.user_id, list);
    }
    setRows(
      (profiles ?? []).map((p) => ({
        ...p,
        roles: rolesByUser.get(p.user_id) ?? [],
      }))
    );
    setLoading(false);
  }, [page]);

  useEffect(() => {
    if (!isStaff) return;
    void load();
  }, [isStaff, load]);

  if (isLoading) return null;
  if (!isStaff) {
    return (
      <div className="rounded-2xl border border-border bg-card p-10 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">Staff access required</h2>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-primary-foreground"
            style={{ background: "var(--gradient-primary)" }}
          >
            <UsersIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">User Management</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Create accounts and assign roles.
            </p>
          </div>
        </div>
        <CreateUserDialog
          open={open}
          onOpenChange={setOpen}
          isSuperAdmin={isSuperAdmin}
          onCreated={() => {
            setOpen(false);
            void load();
          }}
        />
      </header>

      <div className="rounded-2xl border border-border bg-card shadow-card">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            No users on this page.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((u) => (
              <li
                key={u.user_id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {u.display_name ?? "Unnamed"}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {u.institution ?? "—"} · joined{" "}
                    {new Date(u.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.roles.length === 0 ? (
                    <Badge variant="outline" className="text-xs">no role</Badge>
                  ) : (
                    u.roles.map((r) => (
                      <Badge
                        key={r}
                        variant={
                          r === "super_admin"
                            ? "default"
                            : r === "admin"
                              ? "secondary"
                              : "outline"
                        }
                        className="text-xs"
                      >
                        {r}
                      </Badge>
                    ))
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">Page {page + 1}</p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || rows.length < PAGE_SIZE}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

function CreateUserDialog({
  open,
  onOpenChange,
  isSuperAdmin,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isSuperAdmin: boolean;
  onCreated: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AppRole>("student");
  const [submitting, setSubmitting] = useState(false);

  // Admin can only create doctor/student. Super admin can create anything.
  const allowedRoles: AppRole[] = isSuperAdmin
    ? ["super_admin", "admin", "doctor", "student"]
    : ["doctor", "student"];

  const reset = () => {
    setDisplayName("");
    setEmail("");
    setPassword("");
    setRole("student");
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const parsed = schema.parse({ displayName, email, password, role });
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Not signed in");

      const { error } = await supabase.functions.invoke("admin-create-user", {
        body: { ...parsed, forcePasswordChange: true },
      });
      if (error) throw error;
      toast.success("User created");
      reset();
      onCreated();
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.issues[0]?.message ?? "Invalid input");
      } else if (err instanceof Error) {
        toast.error(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-1.5 h-4 w-4" />
          Create user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create user account</DialogTitle>
          <DialogDescription>
            New users will be required to change their password on first login.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1.5">
            <Label htmlFor="cu-name">Display name</Label>
            <Input
              id="cu-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={80}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-email">Email</Label>
            <Input
              id="cu-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cu-password">Temporary password</Label>
            <Input
              id="cu-password"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
            <p className="text-xs text-muted-foreground">
              Min 8 characters. User changes it on first login.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedRoles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r.replace("_", " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!isSuperAdmin && (
              <p className="text-xs text-muted-foreground">
                Admins can create only doctor and student accounts.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create user
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
