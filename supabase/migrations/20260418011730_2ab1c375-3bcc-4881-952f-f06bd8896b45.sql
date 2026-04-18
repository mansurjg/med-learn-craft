-- Add question_type enum and column
CREATE TYPE public.question_type AS ENUM ('SBA', 'TRUE_FALSE');

ALTER TABLE public.questions
  ADD COLUMN type public.question_type NOT NULL DEFAULT 'SBA';

-- Backfill existing rows: anything with exactly 2 options labeled True/False becomes TRUE_FALSE, else SBA
UPDATE public.questions q
SET type = 'TRUE_FALSE'
WHERE jsonb_array_length(q.options) = 2
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(q.options) o
    WHERE lower(o->>'text') IN ('true', 'false')
  );

CREATE INDEX IF NOT EXISTS idx_questions_type ON public.questions(type);