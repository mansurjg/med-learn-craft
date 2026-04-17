import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "super_admin" | "admin" | "doctor" | "student" | "user";

export interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  isAuthenticated: boolean;
  isLoading: boolean;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean; // admin or super_admin
  forcePasswordChange: boolean;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    displayName: string
  ) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserContext = async (userId: string) => {
    const [rolesRes, profileRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase
        .from("profiles")
        .select("force_password_change")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);
    if (rolesRes.error) {
      console.error("Failed to load roles", rolesRes.error);
      setRoles([]);
    } else {
      setRoles((rolesRes.data ?? []).map((r) => r.role as AppRole));
    }
    setForcePasswordChange(
      Boolean((profileRes.data as { force_password_change?: boolean } | null)?.force_password_change)
    );
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => {
          void fetchUserContext(newSession.user.id);
        }, 0);
      } else {
        setRoles([]);
        setForcePasswordChange(false);
      }
    });

    void supabase.auth.getSession().then(({ data: { session: existing } }) => {
      setSession(existing);
      setUser(existing?.user ?? null);
      if (existing?.user) {
        void fetchUserContext(existing.user.id);
      }
      setIsLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  };

  const signUp = async (
    email: string,
    password: string,
    displayName: string
  ) => {
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { display_name: displayName },
      },
    });
    if (error) throw error;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setRoles([]);
    setForcePasswordChange(false);
  };

  const refreshProfile = async () => {
    if (user) await fetchUserContext(user.id);
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const hasAnyRole = (rs: AppRole[]) => rs.some((r) => roles.includes(r));

  const value: AuthState = {
    user,
    session,
    roles,
    isAuthenticated: !!user,
    isLoading,
    isSuperAdmin: roles.includes("super_admin"),
    isAdmin: roles.includes("admin"),
    isStaff: roles.includes("admin") || roles.includes("super_admin"),
    forcePasswordChange,
    hasRole,
    hasAnyRole,
    refreshProfile,
    signIn,
    signUp,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
