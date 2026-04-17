// Edge function: create a user with a role.
// Only super_admin or admin (with limited roles) may call this.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Role = "super_admin" | "admin" | "doctor" | "student";

interface Body {
  email: string;
  password: string;
  displayName: string;
  role: Role;
  forcePasswordChange?: boolean;
}

const ROLE_VALUES: Role[] = ["super_admin", "admin", "doctor", "student"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json(401, { error: "Missing authorization" });

    // Identify caller using their JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json(401, { error: "Unauthorized" });
    const callerId = userData.user.id;

    // Check caller roles via service client
    const admin = createClient(supabaseUrl, serviceKey);
    const { data: callerRolesData, error: rolesErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    if (rolesErr) return json(500, { error: rolesErr.message });
    const callerRoles = new Set((callerRolesData ?? []).map((r) => r.role as Role));
    const isSuper = callerRoles.has("super_admin");
    const isAdmin = callerRoles.has("admin");
    if (!isSuper && !isAdmin) return json(403, { error: "Forbidden" });

    // Validate body
    const body = (await req.json()) as Body;
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const displayName = (body.displayName ?? "").trim();
    const role = body.role;
    const force = body.forcePasswordChange ?? true;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return json(400, { error: "Invalid email" });
    if (!password || password.length < 8)
      return json(400, { error: "Password must be at least 8 characters" });
    if (!displayName || displayName.length < 2)
      return json(400, { error: "Display name required" });
    if (!ROLE_VALUES.includes(role))
      return json(400, { error: "Invalid role" });

    // Authorization rules
    if (role === "super_admin" && !isSuper)
      return json(403, { error: "Only super admin can create super admins" });
    if (role === "admin" && !isSuper)
      return json(403, { error: "Only super admin can create admins" });
    // Admin can create doctor/student. Super admin can create anything.

    // Create the user (auto-confirm so they can login immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { display_name: displayName },
    });
    if (createErr || !created.user)
      return json(400, { error: createErr?.message ?? "Failed to create user" });

    const newUserId = created.user.id;

    // Profile may have been created by trigger; upsert defensively + set force flag
    await admin
      .from("profiles")
      .upsert(
        {
          user_id: newUserId,
          display_name: displayName,
          force_password_change: force,
        },
        { onConflict: "user_id" }
      );

    // Trigger may have inserted default 'user' role; ensure desired role present
    const { error: roleErr } = await admin
      .from("user_roles")
      .insert({ user_id: newUserId, role });
    if (roleErr && !roleErr.message.includes("duplicate")) {
      return json(400, { error: roleErr.message });
    }

    return json(200, { ok: true, userId: newUserId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return json(500, { error: msg });
  }
});
