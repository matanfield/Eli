# Eli — 1‑Day MVP Build Plan (Single Agent, Expo RN)

> **Outcome by EOD:** install on phone → tap → live voice conversation with Eli in a fixed sentence‑learning loop; one big on‑screen sentence; progress rows written to Supabase with RLS. Primary agent: **OpenAI Realtime** via WebRTC; provider‑adapter ready for **ElevenLabs Agents**.

---

## 0) Scope & Acceptance

**Must‑haves**

- First spoken sentence heard by user **< 20s** after opening.
- Fixed loop runs: **introduce → blocks → user repeats (feedback) → full sentence → mastery → next**.
- UI shows **only the current sentence** (streamed) in large text.
- On mastery, a tool‑call (or explicit event) **upserts** to `learned_sentences` (enum status). `last_score ∈ [0,1]`.

**Nice‑to‑haves (only if time)**

- Read‑only Settings stub (profile preview).

---

## 1) Architecture Snapshot (MVP)

- **Client:** **Expo React Native** (TypeScript). Mic in, audio out, single screen.
- **Backend:** Vercel serverless (Node/TS) with three routes: `/realtime` (SDP proxy), `/profile`, `/progress`.
- **DB/Auth:** Supabase (Postgres + Auth + RLS); **anonymous auth** for day‑1 login (fallback: Magic Link for dev if anon unavailable).
- **Agent provider:** OpenAI Realtime (primary) via WebRTC, behind an `Agent` adapter interface; stub `ElevenLabsAgent` class (unwired today).
- **Fallback path (flagged):** modular STT→LLM→TTS (Deepgram + OpenAI text + 11L Flash) kept behind a feature flag, not used by default.

---

## 2) Repo Layout

```
eli/
  apps/
    mobile/                  # Expo RN app
      app.tsx
      src/
        ui/Screen.tsx
        agent/Agent.ts       # adapter interface
        agent/OpenAIRealtimeAgent.ts
        agent/ElevenLabsAgent.ts      # stub only
        state/session.ts
        lib/instructions.ts
        lib/supabase.ts
      app.json
      package.json
    api/                     # Vercel serverless functions (Node/TS)
      realtime.ts            # SDP proxy to OpenAI Realtime
      profile.ts             # GET/POST profile
      progress.ts            # POST progress upsert
  supabase/
    migrations/20250828T1209_eli_core.sql  # v2 DDL + RLS
  .env.example
  README.md
```

---

## 3) Data Model (use v2 as‑is)

- **profiles**: `user_id (PK)`, `name`, `gender ∈ {'male','female','neutral'} | null` (default `neutral`), `base_languages JSONB`, `target_languages TEXT[]`, timestamps.
- **learned_sentences**: `id`, `user_id`, `language_code`, `sentence_text`, `status ∈ {'new','attempted','mastered','easy'}`, `attempt_count INT`, `last_score NUMERIC`, `first_seen_at`, `last_attempted_at`, `updated_at`, `UNIQUE(user_id, language_code, sentence_text)`.
- **memories**: `id`, `user_id`, `content TEXT`, `topic TEXT?`, `updated_at`.

RLS policies: per‑user `SELECT/INSERT/UPDATE` on all three tables.

---

## 4) ENV & Secrets

```
# mobile (Expo)
EXPO_PUBLIC_API_BASE=https://<your-vercel>.vercel.app
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...

# api (Vercel)
OPENAI_API_KEY=...
REALTIME_MODEL=gpt-4o-realtime-preview
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
```

---

## 5) Backend Functions (Vercel)

### `/api/realtime` — SDP proxy (Edge)

- **POST** `{ sdp, model? }` → forwards to OpenAI Realtime; returns answer SDP as `text/plain`.
- Keeps OpenAI key server‑side; client never sees it.

**Pseudo‑impl**

```ts
export const config = { runtime: 'edge' };
export default async (req: Request) => {
  if (req.method !== 'POST') return new Response('405', { status: 405 });
  const { sdp, model = process.env.REALTIME_MODEL! } = await req.json();
  const r = await fetch(`https://api.openai.com/v1/realtime?model=${model}` ,{
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY!}`,
      'Content-Type': 'application/sdp',
      'OpenAI-Beta': 'realtime=v1'
    },
    body: sdp
  });
  const answer = await r.text();
  return new Response(answer, { headers: { 'Content-Type': 'application/sdp' } });
};
```

### `/api/profile` — GET/POST

- `GET`: read or create default profile `{ name:'friend', gender:'neutral', base_languages:[], target_languages:[] }` bound to `auth.uid()`.
- `POST`: upsert `{ name, target_lang, level, purpose, gender? }` (server validates soft enum).

### `/api/progress` — POST

- Body: `{ language_code, sentence_text, status, last_score?, delta_attempt? }`.
- Server validates enum and writes via service role with RLS `user_id = auth.uid()` assertion.

---

## 6) Agent Adapter Interface (client)

```ts
export type AgentEvents = {
  audio: (evt: { stream: MediaStream }) => void;
  text:  (evt: { delta: string }) => void;
  ready: () => void;
  error: (e: Error) => void;
};

export interface Agent {
  connect(opts: { instructions: string }): Promise<void>;
  endTurn(): void;
  updateInstructions(delta: string): void;
  on<K extends keyof AgentEvents>(event: K, cb: AgentEvents[K]): void;
  disconnect(): Promise<void>;
}
```

**OpenAIRealtimeAgent (RN + react‑native‑webrtc)**

- Create `RTCPeerConnection`, add mic track; create data channel (`oai-events`).
- POST local offer SDP to `/api/realtime`; apply remote SDP.
- On `ontrack`, pipe remote audio to speaker (rn‑webrtc handles audio track playback automatically).
- Parse text delta events: `response.output_text.delta`.
- On `dc.open`, send `session.update` with `{ instructions, voice:'alloy' }`.

**ElevenLabsAgent (stub)**

- Same interface; leave `connect()` TODO. Keep to prove adapter baselining.

---

## 7) RN App (Single Screen)

**Install**

```
expo install react-native-webrtc
expo install @react-native-async-storage/async-storage
npm i @supabase/supabase-js
```

**Permissions**

- iOS: `NSMicrophoneUsageDescription`.
- Android: `RECORD_AUDIO`.

**Flow**

1. Anonymous sign‑in to Supabase → fetch/create profile via `/api/profile`.
2. Build **instructions** with `{ baseCode, targetCode, name, level }`.
3. `agent.connect()` → `ready` → Eli speaks first.
4. Render streamed **current sentence** big and centered; subtle listening/speaking indicator.
5. **End turn** button calls `agent.endTurn()` to avoid stuck turns.

**UI skeleton**

```tsx
// Screen.tsx (essentials)
const [line, setLine] = useState('');
const agent = useRef<Agent>(new OpenAIRealtimeAgent());
useEffect(() => {
  agent.current.on('text', ({ delta }) => setLine(p => p + delta));
  agent.current.connect({ instructions: buildInstructions(/* profile */) });
  return () => agent.current.disconnect();
}, []);
```

---

## 8) System Instructions (concise, updatable)

```ts
export function buildInstructions(p:{
  userName:string; baseCode:string; targetCode:string;
  level:'words'|'basic'|'conversational'|'fluent';
}){
  return `
You are Eli, a warm, confident speaking tutor.
Base language: ${p.baseCode}. Target: ${p.targetCode}. Learner: ${p.userName}.
Teach through SENTENCES only. Keep replies short and natural.

Strict loop:
1) Introduce one short sentence (<=7 words). Give meaning in ${p.baseCode}.
2) Repeat slowly. Break into 2–5 spoken blocks.
3) Prompt user to repeat each block. Correct gently if needed.
4) Have user say the full sentence slowly, then natural pace.
5) If mastered, say “Ready for the next one?” and proceed.

Rules:
- Speak first. Prefer voice. Output only the CURRENT sentence as text.
- Use similarities to ${p.baseCode} when helpful. If user goes off-track, answer briefly then return to the loop.
- After two clean full-sentence repetitions, call tool: progress.upsert_sentence(language_code:'${p.targetCode}', sentence_text:'<the sentence>', status:'mastered', last_score:1.0).
`;}
```

---

## 9) Tool Call → Progress Upsert

- Listen on data channel for `response.function_call` with `name='progress.upsert_sentence'`.
- POST to `/api/progress` with `{ language_code, sentence_text, status:'mastered', last_score }`.
- Send back `response.function_call_result` `{ ok:true }`.

---

## 10) Hour‑by‑Hour Plan

**H0–1: Project & DB**

- Init monorepo, Expo app, Vercel project.
- Apply migration `20250828T1209_eli_core.sql` to Supabase; verify RLS.
- Enable anonymous auth (or set up Magic Link for dev).

**H1–2: Backend routes**

- Implement `/api/realtime`, `/api/profile`, `/api/progress`; local smoke tests.

**H2–4: RN realtime skeleton**

- Permissions; wire `react-native-webrtc`.
- Implement `OpenAIRealtimeAgent.connect()` → SDP exchange → remote audio → text deltas → `endTurn()`.

**H4–5: Instructions & loop plumbing**

- Implement `buildInstructions()`; send `session.update` on `dc.open`.
- Render current sentence line (append deltas, reset appropriately per turn).

**H5–6: Progress tool‑call**

- Handle `response.function_call` → `/api/progress` write → `function_call_result`.
- Verify rows in `learned_sentences` (`status='mastered'`, `attempt_count++`, `last_score`).

**H6–7: Onboarding**

- First‑run flow: **name → target → level → purpose** → start. Keep under 20s. Save to `profiles`.

**H7–8: Polish**

- Add **End turn** button; tiny read‑only Settings stub (profile preview).

---

## 11) Defaults & Guardrails

- **Provider:** `OpenAIRealtimeAgent` primary. `ElevenLabsAgent` stub retained for later A/B.
- **Voice:** single warm male voice; switcher later.
- **Score scale:** `last_score ∈ [0,1]` (NUMERIC(3,2) acceptable).

---

## 12) Brand/Feel Guardrails While Coding

- Eli speaks first; short turns; **no walls of text**.
- Only current sentence on screen, large and friendly; minimal chrome.
- Warm, confident persona; neutral gender until grammar demands otherwise.

