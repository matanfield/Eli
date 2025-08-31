# Supabase Migration — Eli v2 (DDL + RLS only)

Place as `supabase/migrations/20250828T1209_eli_core.sql`.

```sql
-- Supabase Migration — Eli v2 (core DDL + RLS)
SET check_function_bodies = off;
SET search_path = public;

-- 0) Types ---------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.learned_status AS ENUM ('new','attempted','mastered','easy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 1) Utility triggers ---------------------------------------------
CREATE OR REPLACE FUNCTION public.tg__set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

-- 2) Tables --------------------------------------------------------
-- profiles ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text DEFAULT 'neutral',               -- nullable, soft enum
  base_languages jsonb DEFAULT '[]'::jsonb,
  target_languages text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_gender_soft CHECK (
    gender IS NULL OR gender IN ('male','female','neutral')
  )
);

DROP TRIGGER IF EXISTS tg_profiles_updated_at ON public.profiles;
CREATE TRIGGER tg_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg__set_updated_at();

-- learned_sentences -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.learned_sentences (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  sentence_text text NOT NULL,
  status public.learned_status NOT NULL DEFAULT 'new',
  attempt_count int NOT NULL DEFAULT 0,
  last_score numeric(5,2),                     -- choose 0–1 or 0–100 consistently
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language_code, sentence_text)
);

CREATE INDEX IF NOT EXISTS idx_learned_user_lang_status
  ON public.learned_sentences(user_id, language_code, status);

DROP TRIGGER IF EXISTS tg_learned_updated_at ON public.learned_sentences;
CREATE TRIGGER tg_learned_updated_at
BEFORE UPDATE ON public.learned_sentences
FOR EACH ROW EXECUTE FUNCTION public.tg__set_updated_at();

-- memories ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.memories (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  topic text,                                   -- soft tag: 'family'|'travel'|'work'|...
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_user_topic
  ON public.memories(user_id, topic);

DROP TRIGGER IF EXISTS tg_memories_updated_at ON public.memories;
CREATE TRIGGER tg_memories_updated_at
BEFORE UPDATE ON public.memories
FOR EACH ROW EXECUTE FUNCTION public.tg__set_updated_at();

-- 3) Row Level Security -------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_sentences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memories ENABLE ROW LEVEL SECURITY;

-- profiles policies
DO $$ BEGIN
  CREATE POLICY profiles_select_own ON public.profiles
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY profiles_insert_own ON public.profiles
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY profiles_update_own ON public.profiles
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- learned_sentences policies
DO $$ BEGIN
  CREATE POLICY learned_select_own ON public.learned_sentences
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY learned_insert_own ON public.learned_sentences
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY learned_update_own ON public.learned_sentences
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- memories policies
DO $$ BEGIN
  CREATE POLICY memories_select_own ON public.memories
    FOR SELECT USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY memories_insert_own ON public.memories
    FOR INSERT WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY memories_update_own ON public.memories
    FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Notes ---------------------------------------------------------
-- • Seeds removed. This migration only sets up types, tables, indexes, triggers, and RLS.
-- • Adjust numeric scale for last_score if you decide 0–1 (NUMERIC(3,2)) vs 0–100 (NUMERIC(5,2)).
```

