-- Helper for super admin check
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = 'super_admin'
  )
$$;

-- Trigger: prevent removing the last super_admin
CREATE OR REPLACE FUNCTION public.protect_last_super_admin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_count int;
BEGIN
  IF (TG_OP = 'DELETE' AND OLD.role = 'super_admin')
     OR (TG_OP = 'UPDATE' AND OLD.role = 'super_admin' AND NEW.role <> 'super_admin') THEN
    SELECT count(*) INTO remaining_count
    FROM public.user_roles
    WHERE role = 'super_admin' AND id <> OLD.id;

    IF remaining_count = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last super admin';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_last_super_admin ON public.user_roles;
CREATE TRIGGER trg_protect_last_super_admin
BEFORE DELETE OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_last_super_admin();

-- Trigger: only super_admin can grant super_admin (allow seed if none exists)
CREATE OR REPLACE FUNCTION public.guard_super_admin_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'super_admin' THEN
    IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'super_admin')
       AND NOT public.is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only a super admin can grant the super_admin role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_super_admin_grant ON public.user_roles;
CREATE TRIGGER trg_guard_super_admin_grant
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.guard_super_admin_grant();

-- Update RLS policies
DROP POLICY IF EXISTS "Admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Super admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins view roles" ON public.user_roles;

CREATE POLICY "Super admins manage roles"
ON public.user_roles FOR ALL
USING (public.is_super_admin(auth.uid()))
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "Admins and super admins view roles"
ON public.user_roles FOR SELECT
USING (
  auth.uid() = user_id
  OR public.has_role(auth.uid(), 'admin')
  OR public.is_super_admin(auth.uid())
);