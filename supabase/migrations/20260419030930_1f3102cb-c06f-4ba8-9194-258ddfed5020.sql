CREATE TABLE IF NOT EXISTS public.download_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  download_type text NOT NULL,
  question_count integer NOT NULL DEFAULT 0,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.download_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view download logs"
  ON public.download_logs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Staff insert download logs"
  ON public.download_logs FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.is_super_admin(auth.uid())
    )
  );

CREATE INDEX IF NOT EXISTS idx_download_logs_user ON public.download_logs (user_id, created_at DESC);