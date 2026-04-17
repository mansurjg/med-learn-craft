-- =========================================
-- ENUMS
-- =========================================
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.question_difficulty AS ENUM ('easy', 'medium', 'hard');
CREATE TYPE public.attempt_status AS ENUM ('in_progress', 'completed', 'abandoned');

-- =========================================
-- UTILITY: updated_at trigger function
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- PROFILES
-- =========================================
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  institution TEXT,
  specialty TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- USER ROLES (separate table, secure pattern)
-- =========================================
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- =========================================
-- QUESTION BANKS
-- =========================================
CREATE TABLE public.question_banks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.question_banks ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_question_banks_updated_at
BEFORE UPDATE ON public.question_banks
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_question_banks_owner ON public.question_banks(owner_id);

-- =========================================
-- QUESTIONS
-- =========================================
CREATE TABLE public.questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bank_id UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  position INT NOT NULL DEFAULT 0,
  stem TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{ key: "a", text: "..." }, ...]
  correct_answers TEXT[] NOT NULL DEFAULT '{}', -- ["a"] or ["a","c"]
  explanation TEXT,
  image_url TEXT,
  image_caption TEXT,
  reference TEXT,
  difficulty public.question_difficulty,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_questions_updated_at
BEFORE UPDATE ON public.questions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_questions_bank ON public.questions(bank_id, position);

-- =========================================
-- EXAM ATTEMPTS
-- =========================================
CREATE TABLE public.exam_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bank_id UUID NOT NULL REFERENCES public.question_banks(id) ON DELETE CASCADE,
  status public.attempt_status NOT NULL DEFAULT 'in_progress',
  total_questions INT NOT NULL DEFAULT 0,
  correct_count INT NOT NULL DEFAULT 0,
  score_percent NUMERIC(5,2),
  time_limit_seconds INT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exam_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_exam_attempts_user ON public.exam_attempts(user_id, created_at DESC);
CREATE INDEX idx_exam_attempts_bank ON public.exam_attempts(bank_id);

-- =========================================
-- ATTEMPT ANSWERS
-- =========================================
CREATE TABLE public.attempt_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  selected_answers TEXT[] NOT NULL DEFAULT '{}',
  is_correct BOOLEAN,
  time_spent_seconds INT,
  answered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attempt_id, question_id)
);

ALTER TABLE public.attempt_answers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_attempt_answers_attempt ON public.attempt_answers(attempt_id);

-- =========================================
-- AUTO-CREATE PROFILE ON SIGNUP
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1))
  );
  -- Default role: user
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- RLS POLICIES
-- =========================================

-- Profiles
CREATE POLICY "Users view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- User roles
CREATE POLICY "Users view their own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Question banks
CREATE POLICY "Owners and admins view banks, plus public banks"
ON public.question_banks FOR SELECT
USING (
  auth.uid() = owner_id
  OR is_public = true
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Owners insert banks"
ON public.question_banks FOR INSERT
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owners and admins update banks"
ON public.question_banks FOR UPDATE
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners and admins delete banks"
ON public.question_banks FOR DELETE
USING (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin'));

-- Questions (inherit from bank ownership)
CREATE POLICY "View questions in accessible banks"
ON public.questions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = questions.bank_id
      AND (b.owner_id = auth.uid() OR b.is_public = true OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Owners and admins insert questions"
ON public.questions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = questions.bank_id
      AND (b.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Owners and admins update questions"
ON public.questions FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = questions.bank_id
      AND (b.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Owners and admins delete questions"
ON public.questions FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.question_banks b
    WHERE b.id = questions.bank_id
      AND (b.owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- Exam attempts
CREATE POLICY "Users view their own attempts"
ON public.exam_attempts FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create their own attempts"
ON public.exam_attempts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update their own attempts"
ON public.exam_attempts FOR UPDATE
USING (auth.uid() = user_id);

-- Attempt answers
CREATE POLICY "Users view their own attempt answers"
ON public.attempt_answers FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.id = attempt_answers.attempt_id
      AND (a.user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Users insert their own attempt answers"
ON public.attempt_answers FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.id = attempt_answers.attempt_id
      AND a.user_id = auth.uid()
  )
);

CREATE POLICY "Users update their own attempt answers"
ON public.attempt_answers FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.exam_attempts a
    WHERE a.id = attempt_answers.attempt_id
      AND a.user_id = auth.uid()
  )
);