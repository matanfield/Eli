# Eli — Technical Spec (v2)

## 0) Goals & guardrails

- **Feel:** sub‑second, interruption‑friendly, human‑like voice convo.
- **Simplicity:** by default the app opens **one** streaming connection (Realtime speech↔speech). The modular STT→LLM→TTS pipeline stays behind a feature flag.
- **Memory‑aware:** clean server‑side injection points for user profile/progress when picking the next sentence or shaping feedback.
- **Privacy:** prompts + memory assembled server‑side; no client leaks.

---

## 1) Two runtime modes

### A) Primary — Realtime speech↔speech (single pipe)

- **API:** OpenAI Realtime (WebRTC or WebSocket).
- **Capabilities:** bidirectional audio streaming, turn detection, barge‑in, conversation state.
- **Instructions:** system prompt at session init **and** updatable via `session.update`.
- **Tools:** function/tool calls over a data channel when needed.
- **Use:** all normal talk, fixed sentence‑learning loop, quick corrections.
- **UI hook:** stream the model’s text transcript to render the **single large line**.

> **Prompting:** Keep Realtime instructions short (tutor persona + sentence‑learning procedure). For sensitive or frequently‑changing context (user memory), prefer short `session.update` deltas or route selective steps to B‑mode. Set/refresh instructions from the **server** only.

### B) Fallback/Targeted — Modular STT → LLM → TTS

- **STT:** Deepgram streaming (Nova‑2/3) or equivalent.
- **LLM:** OpenAI text model with full system prompt + **server‑side** memory injection.
- **TTS:** ElevenLabs Streaming/Flash for minimal TTFB.
- **Use:** when we must (a) select the next sentence using long‑term memory, (b) synthesize variations/curiosities from memory, or (c) run heavier prompt logic.
- **Trade‑off:** maximal control; more buffering/moving parts.

---

## 2) Data model — v2 (SQL on Supabase)

**Principles**

- Keep it tiny: still **3 tables**. No session/event/bank tables yet.
- Everything else is computable or handled in‑model by the AI.
- Only add fields/tables when a concrete need appears.

### Tables

#### A) `profiles` — 1:1 with `auth.users`

- `user_id` — FK to `auth.users`.
- `name` — **required** display name.
- `gender` — **nullable** + **soft enum** `'male' | 'female' | 'neutral'`, **default **``. Used **only** when a target language requires gendered address. (No UX friction for users/languages where irrelevant.)
- `base_languages` — JSON array of `{ code, level }` where `level ∈ { native | fluent | conversational | basic | words }`.
- `target_languages` — array of language codes (multi‑target MVP).

#### B) `learned_sentences` — user‑specific history (not a global bank)

One row per **(user\_id, language\_code, sentence\_text)**.

- `id` (PK)
- `user_id`
- `language_code`
- `sentence_text`
- `status` — **enum** `'new' | 'attempted' | 'mastered' | 'easy'` (replaces prior floats)
- `attempt_count` — **INT**, default `0`
- `last_score` — **NUMERIC**, e.g. `NUMERIC(3,2)` (0–1 or 0–100 scaled; choose one and stick to it)
- **Timestamps:**
  - `first_seen_at` — first time we introduced the sentence
  - `last_attempted_at` — last time user attempted/was quizzed
  - `updated_at` — generic update time (for sync)

**Uniqueness:** `UNIQUE (user_id, language_code, sentence_text)` to avoid duplicates.

**Notes:**

- `status` captures coarse learning state. Precision lives in `attempt_count` + `last_score` + timestamps.
- Keep grading semantics **server‑side** to avoid client magic numbers.

#### C) `memories` — free text with a **soft topic**

- `id` (PK)
- `user_id`
- `content` (TEXT) — short life points / biographical facts / free text
- `topic` (TEXT, nullable) — **soft tag** for retrieval (e.g., `'family' | 'travel' | 'work' | 'other'`); not enforced by DB enum yet, but validated app‑side
- `updated_at`

**Notes:**

- Tens per user max; the agent can read them all.
- The single `topic` helps “bring up life points” **now**, even before embeddings.

### Indexes (minimal)

- `learned_sentences`: `UNIQUE (user_id, language_code, sentence_text)`.
- Optional (if needed later): `(user_id, language_code, status)`; `memories (user_id, topic)`.

---

## 2.1) DDL (Supabase/Postgres)

> Run in a migration. Types created *if not exists* so re‑runs are idempotent.

```sql
-- 1) Profiles -------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  gender text DEFAULT 'neutral', -- nullable by design
  base_languages jsonb DEFAULT '[]'::jsonb,
  target_languages text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Optional app‑side validation: gender ∈ ('male','female','neutral')
CREATE OR REPLACE FUNCTION public.enforce_gender_soft()
RETURNS trigger AS $$
BEGIN
  IF NEW.gender IS NOT NULL AND NEW.gender NOT IN ('male','female','neutral') THEN
    RAISE EXCEPTION 'Invalid gender value: %', NEW.gender;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_gender ON public.profiles;
CREATE TRIGGER trg_profiles_gender
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_gender_soft();

-- 2) Learned sentences ----------------
DO $$ BEGIN
  CREATE TYPE public.learned_status AS ENUM ('new','attempted','mastered','easy');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.learned_sentences (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  language_code text NOT NULL,
  sentence_text text NOT NULL,
  status public.learned_status NOT NULL DEFAULT 'new',
  attempt_count int NOT NULL DEFAULT 0,
  last_score numeric(3,2),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, language_code, sentence_text)
);

CREATE INDEX IF NOT EXISTS idx_learned_user_lang_status
  ON public.learned_sentences(user_id, language_code, status);

-- 3) Memories -------------------------
CREATE TABLE IF NOT EXISTS public.memories (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  topic text, -- soft tag (e.g., 'family','travel','work','other')
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_memories_user_topic
  ON public.memories(user_id, topic);
```

---

## 2.2) State semantics (server‑side)

- **Status transitions (suggestion):**
  - `new` → first attempt stores `attempt_count=1`, update `last_attempted_at`.
  - `attempted` → user gets partial credit or struggles; increment `attempt_count`, set `last_score`.
  - `mastered` → user reaches target threshold (e.g., last two `last_score ≥ 0.9` with correct cadence).
  - `easy` → repeated mastery across spaced attempts (e.g., `attempt_count ≥ X` and last N scores high with low latency/hesitation).
- Keep thresholds/timing in code; DB stores facts.

---

## 3) Tech stack (v0 MVP)

- **Client:** Expo React Native; mic in + playback out; single big transcript line.
- **Backend:** Vercel serverless (Node/TS). Option to move to Supabase Edge Functions later.
- **Jobs (roles):**
  1. Mint ephemeral keys (OpenAI/11L).
  2. Attach profile/memory at session start.
  3. Proxy provider calls if needed (e.g., `/next-sentence`).
  4. (Later) background jobs: cleanup, progress updates.
- **DB/Auth:** Supabase (Postgres, Auth, RLS).
- **Security:** Ephemeral keys; RLS per‑user on all tables; never embed secrets client‑side.

---

## 4) Realtime agent choice (MVP)

- Start with a **single** speech↔speech API behind a thin adapter so we can test OpenAI Realtime and ElevenLabs Agents without rewrites.

**Adapter (unchanged):**

```ts
type Agent = {
  connect(opts): Promise<void>;
  sendAudio(chunk: Float32Array): void;
  updateInstructions(delta: string): void; // if provider supports
  endTurn(): void;                          // force turn break
  on(event, cb): void;                      // 'audio','text','error','state'
  disconnect(): Promise<void>;
};
```

**Decision path:** build a test harness (TTFB, barge‑in latency, overtalk, instruction‑update latency) → pick a primary; keep both behind a config flag. Likely OpenAI first (live updates), add ElevenLabs for their signature voices.

---

## 5) Migration notes (from v0/v1)

- Replace prior float `status` with `learned_status` enum + counters.
- If legacy rows exist, a simple safe mapping is:
  - `0` → `new`
  - `0.5` → `attempted`
  - `1` or `1.5` → `mastered`
  - `2` → `easy`
- Add `attempt_count` starting at observed attempts (fallback `1` if unknown).
- Preserve `first_seen_at`; rename/repurpose legacy `last_seen_at` → `last_attempted_at`.

---

## 6) RLS (sketch)

- `profiles`: `user_id = auth.uid()` for `SELECT/UPDATE`.
- `learned_sentences`: `user_id = auth.uid()` for `SELECT/INSERT/UPDATE`.
- `memories`: `user_id = auth.uid()` for `SELECT/INSERT/UPDATE`.

(Write policies explicitly in migrations; keep inserts server‑mediated.)

