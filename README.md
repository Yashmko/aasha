# AASHA · आशा — AI Voice Companion for Ageing Parents

> *"Care that calls your parents — in their own language."*
> Team: You 🧑 + your AI builder 🤖 · Built for the **AssemblyAI Voice Agent Hackathon**

---

## 🧠 The idea in one line
**AASHA** is an **agentic, multilingual AI voice companion** that phones ageing parents, gently checks mood & medication, catches health red flags, alerts the family, and writes doctor-ready notes.

---

## 🏗️ Architecture (full-stack, zero-dependency)

```
┌────────────────────────────── Browser (frontend) ─────────────────────────────┐
│  index.html — live voice agent + care dashboard (Web Speech STT/TTS, free)    │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                        REST over HTTP │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│  server/index.js — HTTP server (static + REST API)                             │
│    ├── server/config.js    env-driven config & secrets                         │
│    ├── server/agent.js     agent brain: AssemblyAI LLM Gateway → Gemini → ...  │
│    ├── server/assembly.js  AssemblyAI: v3 STT + streaming token + LLM Gateway  │
│    │                       (upload→transcribe→structured clinical summary)     │
│    ├── server/store.js     JSON persistence (seniors, sessions, messages,      │
│    │                       care-state, alerts)                                 │
│    └── server/alerts.js    family alert delivery (webhook / Twilio WhatsApp)   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**No `npm install` needed** — uses only Node built-ins. Runs anywhere: local, free Render/Railway/Fly, or a sandbox.

---

## 🚀 Run it

```bash
# 1. Start the backend
node server/index.js
# → http://localhost:8000

# 2. Open the frontend (served automatically at /)
open http://localhost:8000
```

For the **real AI brain**, export a key first (without it, an offline caregiver fallback keeps everything working):

```bash
The **AssemblyAI API key** doubles as the agent brain provider — you only need `AASHA_AAI_KEY` to unlock the real LLM brain *and* streaming STT *and* clinical notes (all through AssemblyAI's platform):

```bash
export AASHA_AAI_KEY=your_assemblyai_key     # powers brain + STT + LLM Gateway
# optional free fallbacks:
export AASHA_GEMINI_KEY=your_free_gemini_key # aistudio.google.com/apikey
node server/index.js
```

---

## 🧩 All AASHA features (now in the backend)

| # | Feature | How it's implemented |
|---|---|---|
| 1 | **Agentic caregiver loop** | greeting → mood → meds → red-flags → comfort → escalate → doctor notes |
| 2 | **Multilingual** | Hindi / Punjabi / English replies; **auto language detection** from the utterance |
| 3 | **Persistent memory / learning** | AASHA extracts durable facts (grandchild, conditions, dislikes) and remembers them across calls |
| 4 | **Medication schedule + adherence log** | daily med tracking + a per-day adherence log |
| 5 | **Red-flag safety + family alerts** | flags (tremor/fall/pain/missed-meds) → webhook/Twilio WhatsApp alert (or demo-simulated) |
| 6 | **Daily automated check-ins** | AASHA schedules a check-in; a message marks it done; `/api/checkins/due` lists what's due |
| 7 | **Doctor-ready care report** | per-senior `/report` (care-state, mood history, flags, latest summary) |
| 8 | **Care score / trending** | rolling 0-100 score decodes health over time |
| 9 | **LLM + offline fallback** | AssemblyAI LLM Gateway → Gemini free tier → OpenAI-compatible → deterministic offline (never fails) |
| 10 | **AssemblyAI voice layer** | v3 real-time streaming STT + upload→transcribe→**LLM Gateway** clinical notes (post-LeMUR sponsor stack) |
| 11 | **Dashboard/overview API** | `/api/overview` aggregates everything for a UI |

## 🌐 REST API

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | service status + config detection |
| GET | `/api/seniors` | list seniors being cared for |
| POST | `/api/seniors` | create a senior |
| GET | `/api/seniors/:id` | senior + live care-state |
| POST | `/api/seniors/:id` | update profile (add meds/age/family contact, etc.) |
| GET | `/api/seniors/:id/memory` | what AASHA remembers about them |
| GET | `/api/seniors/:id/meds` | medication schedule + adherence log |
| GET | `/api/seniors/:id/report` | doctor-ready care report |
| POST | `/api/seniors/:id/checkin` | schedule a daily check-in |
| POST | `/api/sessions` | start a call session `{lang}` |
| GET | `/api/sessions` | list sessions |
| **POST** | **`/api/sessions/:id/message`** | **core agent loop** `{text, lang?}` → reply + mood/meds/flags/alert + learned facts + summary + care-state |
| POST | `/api/sessions/:id/end` | close a session |
| GET | `/api/checkins/due` | daily check-ins still pending |
| GET | `/api/overview` | aggregate dashboard data |
| POST | `/api/assembly/transcribe` | AssemblyAI STT of an audio URL |
| GET | `/api/assembly/token` | real-time streaming token |
| POST | `/api/assembly/doctor-note` | **real** clinical note: accepts raw audio bytes, `{demo:true}` (bundled clip), `{text}`, or `{audioUrl}` → transcript + LLM Gateway structured summary |
| POST | `/api/assembly/summarize` | clinical care summary for a text transcript |
| POST | `/api/assembly/analytics` | post-call analytics card: sentiment + entity + topic detection on the finished call (`{demo:true}` or raw audio) |
| GET | `/api/alerts` | alert log |

### Example — the agent loop
```bash
# create a session (seeded senior "Aunty Kamla" exists by default)
SID=$(curl -s -X POST localhost:8000/api/sessions -H 'Content-Type: application/json' -d '{"lang":"hi"}' | jq -r .id)

# talk to AASHA
curl -s -X POST localhost:8000/api/sessions/$SID/message \
  -H 'Content-Type: application/json' \
  -d '{"lang":"hi","text":"Aasha, meri haath kanp rahi hain aur maine shaam ki dawa miss kar di"}'
# → reply in Hindi, flags=["missed-meds"], alert=true → family alert triggered
```

---

## 🔐 Secrets (see `.env.example`)
| Env var | What |
|---|---|
| `AASHA_GEMINI_KEY` | free agent brain (recommended) |
| `AASHA_OPENAI_KEY/BASE/MODEL` | optional OpenAI-compatible fallback |
| `AASHA_AAI_KEY` | AssemblyAI STT + real-time token + LLM Gateway brain/clinical notes |
| `AASHA_AAI_STREAM_KEY` | real-time streaming transcription |
| `AASHA_ALERT_WEBHOOK` | deliver family alerts to your app/Slack |
| `AASHA_TWILIO_*` / `AASHA_WA_FROM` | optional WhatsApp family alerts |

---

## 📁 Files
| Path | Purpose |
|---|---|
| `index.html` | frontend (customize later — restyle freely) |
| `server/index.js` | HTTP server + REST API |
| `server/config.js` | configuration |
| `server/agent.js` | agent brain (LLM + fallback) |
| `server/assembly.js` | AssemblyAI integration |
| `server/store.js` | JSON persistence |
| `server/alerts.js` | family alert delivery |
| `.env.example` | copy to configure |
| `data/aasha.json` | auto-generated runtime data |
| `server/selfcheck.js` | **one runnable self-check** of the full flow (`node server/selfcheck.js`) |
| `submission.md` | hackathon entry |

---

## 💸 Free-tier posture (no credit burn)
- The **live demo** uses **browser Web Speech** for mic I/O by default (zero AssemblyAI cost); AssemblyAI **real-time streaming STT** is the sponsor showcase and only runs while you're actually talking.
- The **auto-demo / doctor note / analytics** each upload a **few-second** clip once per run (the bundled `assets/demo-patient.mp3` is ~27s), so a full recorded demo costs pennies of credit and stays inside the free tier.
- The **agent brain + clinical notes** run on AssemblyAI's **LLM Gateway** (same key) with a small `max_tokens` budget — light enough for a hackathon demo.
- Everything works with **no key at all** (deterministic offline caregiver) — the key only unlocks the smart/streaming layers.

---

## ☁️ Deploy (free host — Render / Railway / Fly)

Zero npm deps, so deployment is trivial. The server reads `PORT` from the env and binds all interfaces.

1. Push the repo to GitHub (`.env` is gitignored — never commit it).
2. Create a service on Render/Railway/Fly pointing at it.
   - **Build:** none (`npm install` is a no-op).
   - **Start:** `node server/index.js` (or `npm start`).
   - **Port:** the host injects `PORT` automatically.
3. Set env vars on the host (see `.env` below). `AASHA_AAI_KEY` powers the brain + real-time STT + clinical notes + analytics.
4. (Optional) set `BASE_URL=https://your-app-url` for correct callbacks.
5. Smoke-test `/`, `/admin`, and one full call.

> 🧭 **Secret note:** `.env` is gitignored and `config.js` only ever reports a `configured` boolean — the raw API key is never logged, committed, or exposed client-side. The browser gets a short-lived `streaming.assemblyai.com/v3/token` (60s, one-use) instead.

> 💡 **Ponytail**: written under the *lazy senior dev* discipline — stdlib over dependencies, reuse over rewrite, fewest files, no boilerplate. A single self-check (`server/selfcheck.js`, 13 assertions) guards the non-trivial logic. To add an LLM, just export keys — nothing else changes.
