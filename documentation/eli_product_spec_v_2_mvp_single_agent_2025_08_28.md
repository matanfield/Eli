# Eli — Product Spec v2 (MVP, Single‑Agent)

**Focus:** a shippable 1‑day MVP. Two‑agent (Conversational + Curating) is **future work**; MVP uses **one Conversational Agent** that also selects the next sentence.

---

## 1) TL;DR — What changed vs v1
- **Onboarding trimmed:** ask only **name → target language → level → purpose**. Defer gender until grammar needs it; allow later capture or voice‑inference (opt‑in) with user override.
- **Minimal UI kept:** single fullscreen card shows **only the current sentence**.
- **Two pragmatic toggles** → **future work:**
  - **Push‑to‑Talk (PTT)** for noisy environments.
  - **Show/Hide current sentence** (default **Show** for accessibility).
- **Seed pack:** tiny curated starter (~30 sentences) per top target language; also a **universal micro‑seed (≈10)** for long‑tail languages. Use until early wins, then synthesize.
- **Voice & persona:** start with **one male voice** (strong identity). Voice switcher + female option → **future**.
- **Architecture:** MVP = **single agent** handling conversation + next‑sentence selection. The split **(Conversational vs Curating)** and a persistent **Sentence Queue** are mentioned under **Future Work**.

---

## 2) Product goals & non‑goals (MVP)
**Goals**
- Get users speaking **within 20s** of opening the app.
- Deliver one ultra‑focused **sentence‑learning loop** with great correction feedback.
- Ensure continuity via a **seed pack** and simple difficulty ramp.

**Non‑goals (defer)**
- Multi‑voice persona library, rich settings, analytics dashboards.
- PTT, Hide‑text toggle, progress visualizations beyond a minimal “streak/last mastered”.
- Two‑agent orchestration and advanced queueing.

---

## 3) Core principles
- **Voice‑first, friction‑free:** the app speaks first; user responds; no walls of text.
- **One sentence at a time:** introduce → break into blocks → repeat with feedback → full sentence → next.
- **Neutral until needed:** keep gender/pronouns neutral unless grammar requires; confirm inline when it does.
- **Early wins:** seed pack ensures success even with flaky generation or cold start.

---

## 4) User flows (MVP)
### A) First‑time onboarding (<20s)
1) Greet neutrally.
2) Ask: **Name → Target language → Level (three bands) → Purpose** (travel/work/family/etc.).
3) Note: “If grammar needs gender later, I’ll ask.” (Manual override exists in Settings stub.)
4) Start immediately with a **warm‑up sentence** from seed aligned to level/purpose.

### B) Daily session open
1) Greet by name (short, friendly).
2) Quick recap of last mastered sentence.
3) Pull **next** sentence (seed or generated); enter learning loop.

### C) Sentence learning loop
- **Introduce** sentence (slow).  
- **Break into blocks** (2–5 chunks).  
- User repeats each block → **ASR check** → feedback (phoneme/word‑level hints kept simple).  
- **Full sentence** repetition (slow → natural pace).  
- **Mastery check** (pass threshold).  
- **Mark progress** → fetch **next**.

**Micro‑commands (spoken):** “slower”, “again”, “next”, “translate” (optional; can disable for immersion).

---

## 5) Content: seed → synthesize
- **Seed packs (~30)** per top languages; tagged by **level band** and **purpose** (travel/work/family).
- **Universal micro‑seed (~10)** for all other languages.
- After **3–5 mastered sentences**, begin mixing **generated** sentences (still aligned to purpose + difficulty).
- **Fallback:** if generation fails or network is slow, keep serving seed sentences.

---

## 6) Voice, persona, turn‑taking
- **Output:** one **male** voice, warm and calm.
- **Turn‑taking:** agent supports user barge‑in; short TTS; VAD tuned to avoid cutting users off.
- **Gender usage:** only when grammar demands; confirm or let user correct quickly (“use feminine for me”).

---

## 7) Data model (MVP)
**users**
- `id`, `name`, `base_lang`, `target_lang`, `level`, `purpose`
- `gender_pref` (nullable), `allow_voice_inference` (bool, default false)

**sentences**
- `id`, `target_lang`, `text_target`, `text_base`, `blocks[]`, `tags[]` (topic/grammar), `source` (seed|generated|user)
- `difficulty` (1–5), `purpose_fit[]`

**progress**
- `user_id`, `sentence_id`, `status` (`new`|`practicing`|`mastered`|`parked`), `last_score`, `reps`, `last_heard_at`

**session_state** (simple, for MVP)
- `user_id`, `current_sentence_id`, `next_candidate_id` (nullable), `last_action_at`

> Note: A full **sentence_queue** table with positions **{-2, -1, 0}** is **future work**. If helpful, we can keep a minimal queue now (single `next_candidate_id`) to ease migration.

---

## 8) Single‑Agent responsibilities (MVP)
The **Conversational Agent** handles **both**:
1) **Dialogue**: turn‑taking, corrections, pacing, micro‑commands.
2) **Next sentence selection**:
   - Prefer **seed** until early wins; then mix generated.
   - Heuristics: if last two sentences were hard (≥N corrections), lower difficulty; if easy, bump difficulty one notch within the same purpose/topic.
   - Avoid immediate topic repetition unless user shows interest (time‑gap heuristic).

---

## 9) Minimal UI (MVP)
- Fullscreen, clean background.
- Centered **current sentence** (large type); subtle speaking/listening indicator.
- Tiny header: app name + tap for Settings stub (profile, language, sign‑out, **no** knobs yet).

**Future toggles** (design only in MVP doc):
- **PTT** (hold‑to‑speak or tap‑to‑arm) for noisy places.
- **Show/Hide text** (default **Show**).

---

## 10) Metrics (MVP)
- **Time‑to‑first‑sentence** (target <20s).
- **Per‑sentence**: reps, correction count, time‑to‑master.
- **Retention proxy**: next‑day return, sentences mastered/day.
- **Seed handoff point**: # mastered before first generated sentence.

---

## 11) Risks & mitigations
- **ASR false turns (noise):** conservative VAD; allow quick “again”; plan PTT.
- **Over/under difficulty:** simple rule‑based tuning; clamp changes to ±1 step.
- **Gender/pronoun errors:** stay neutral; confirm only when needed; easy override.
- **Cold start flakiness:** seed ensures continuity; offline‑ish resilience if generation stalls.

---

## 12) Acceptance criteria (MVP)
- User can onboard and speak the **first sentence within 20s**.
- Learning loop runs end‑to‑end with block feedback and mastery marking.
- Seed → synthesize handoff after **3–5 mastered** works reliably.
- Single agent can pick reasonable next sentences using the heuristics above.
- Minimal UI shows only current sentence; Settings stub exists.

---

## 13) 1‑Day MVP build plan (lean)
**Backend (stub‑level)**
- Seed data for two target languages (e.g., Spanish, French) with ~30 sentences each; universal micro‑seed ~10.
- Tables: `users`, `sentences`, `progress`, `session_state`.
- Functions:
  - `start_session(user_id)` → returns first sentence id.
  - `evaluate_utterance(user_id, audio)` → returns score + hint + whether block mastered.
  - `next_sentence(user_id)` → returns next id (seed or generated via simple heuristics).
  - `mark_mastered(user_id, sentence_id)`.

**Agent logic**
- Orchestrate loop states: `INTRO → BLOCKS → FULL → MASTERED → NEXT`.
- Heuristics for `next_sentence` (seed‑first, difficulty adjust ±1, purpose‑aware).
- Micro‑commands: recognize “slower”, “again”, “next”.

**Client (mobile)**
- Single screen; TTS + ASR streaming; show current sentence; speak/listen indicators.
- Settings stub: name, target language, level, purpose; gender optional.

**QA checklist**
- Cold start → first sentence <20s.
- 5 consecutive sentences learned with mixed difficulty.
- Handoff to generated after 4 mastered works.

---

## 14) Future work (post‑MVP)
- **Two‑agent split:**
  - **Conversational AI** (real‑time loop) vs **Curating AI** (selects and stages upcoming items).
  - Introduce **sentence_queue** with positions **-2 (next‑next), -1 (next), 0 (current)**.
  - Conversational Agent fetches from queue via a tool call; Curating Agent keeps **-1/-2** filled.
- **PTT** mode and **Show/Hide text** toggle.
- **Voice options:** add female voice; simple voice switcher.
- **Progress UI** and spaced repetition; reminders.
- **Richer interest tagging** and topical arcs (travel, work, family) guided by user signals.

---

## 15) Open decisions (you can pick defaults now)
- Seed → synthesize threshold: **3, 4, or 5 mastered?** (default: **4**)
- Difficulty bands count: **5** is enough? (default: **5**)
- Enable on‑device caching of last 10 seed sentences? (default: **yes**)
- Allow **voice‑inference of gender** by default? (default: **off**, manual confirm if ever inferred)

