-- Extend questions with phase-2 metadata
ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS page_number integer,
  ADD COLUMN IF NOT EXISTS marker_type text,
  ADD COLUMN IF NOT EXISTS confidence_score numeric(3,2),
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_questions_needs_review
  ON public.questions (bank_id) WHERE needs_review = true;

CREATE INDEX IF NOT EXISTS idx_questions_marker_type
  ON public.questions (marker_type);

-- Upload logs
CREATE TABLE IF NOT EXISTS public.upload_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  uploader_id uuid NOT NULL,
  bank_id uuid REFERENCES public.question_banks(id) ON DELETE SET NULL,
  file_name text NOT NULL,
  file_type text NOT NULL,
  page_count integer,
  question_count integer NOT NULL DEFAULT 0,
  flagged_count integer NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.upload_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Uploaders and admins view upload logs"
  ON public.upload_logs FOR SELECT
  USING (
    auth.uid() = uploader_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Uploaders insert their own upload logs"
  ON public.upload_logs FOR INSERT
  WITH CHECK (auth.uid() = uploader_id);

CREATE POLICY "Uploaders and admins update upload logs"
  ON public.upload_logs FOR UPDATE
  USING (
    auth.uid() = uploader_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.is_super_admin(auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_upload_logs_uploader ON public.upload_logs (uploader_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_logs_bank ON public.upload_logs (bank_id);

CREATE TRIGGER trg_upload_logs_updated_at
  BEFORE UPDATE ON public.upload_logs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();