# 📋 Hackathon Submission — AASHA

**Hackathon:** AssemblyAI Voice Agent Hackathon (lablab.ai) · Sep 1–30, 2026 · Online
**Team:** The Strategist (you) 🤝 The AI Builder (me)
**Category:** Healthcare / accessibility voice agent with real business + social value

---

## 1. Project name & tagline
**AASHA (आशा)** — *"Care that calls your parents — in their own language."*

AASHA (literally "hope") is an **agentic, multilingual AI voice companion** that phones ageing parents, checks in on their mood and medication, catches health red flags, alerts the family, and writes doctor-ready notes.

## 2. What it does (the flow)
AASHA runs a real **care workflow**, not a chatbot:
1. **Greets** warmly and asks how the person feels (mood, sleep, appetite, pain, dizziness).
2. **Verifies** today's medication against a known schedule.
3. **Detects red flags** — dizziness, falls, chest pain, breathlessness, confusion, signs of loneliness/dementia.
4. **Comforts** them (remembers a grandchild or favourite thing → **persistent memory**).
5. **Escalates** — if something's serious it triggers a **family alert** and drafts a **doctor-ready summary**.
6. **Speaks their language** — English, Hindi, or Punjabi, auto-detected.

## 3. Why it's different / the upgrade
Built on a **proven winner** (AssemblyAI's past winner "Check on Loved Ones" + healthcare-track winner CareSetu), upgraded with differentiators this round won't have:
- 🌏 **Auto-multilingual voice** (Hindi/Punjabi/English) — reaches the real millions who can't use an English-first app.
- 🧠 **Agentic + persistent memory** — AASHA remembers context across calls instead of treating each as fresh.
- 🛡️ **Real sponsor-stack depth** — v3 real-time streaming STT, the **LLM Gateway** brain + clinical notes, and sentiment/entity/topic analytics, all on the same AssemblyAI key.
- 🔁 **Graceful escalation + doctor notes** that never fail (offline caregiver step-in).

## 4. Tech stack
- **AssemblyAI** — v3 **real-time streaming STT** (browser temp token) + **LLM Gateway** (`llm-gateway.assemblyai.com/v1/chat/completions`) as the agent brain & clinical-note engine + **sentiment/entity/IAB-topic analytics** on the finished call. *(LeMUR `/v2/lemur/task` is deprecated; the LLM Gateway is AssemblyAI's current AI layer and uses the same key.)*
- **Web Speech API** — free in-browser voice I/O for the demo (zero-cost, no app install).
- **Zero-dependency Node** backend — runs anywhere; graceful offline fallback so the demo can never fail.

## 5. Social & business value
- 👵 **Problem:** over **1 in 6** elderly Indians live alone; daily medication non-adherence is a leading cause of avoidable ER visits.
- 💰 **Business model:** sold to families / NRIs (their parents in India) and to eldercare + insurance providers as a monitoring layer. ~₹299/mo per parent, near-zero marginal cost per call.
- 🞓 **Accessibility:** voice-first, no app, works on any phone — ideal for seniors, low-literacy users, and the vision-impaired.

## 6. Demo (3 minutes)
1. Open AASHA, click **🎬 Auto-demo** (clean, no-mic, reproducible) — or tap the orb and speak.
2. AASHA greets Aunty Kamla; she admits she missed BP + thyroid meds and mentions hand tremors.
3. Dashboard flips to a red **family alert**, care score drops, the **doctor-ready summary** auto-drafts via AssemblyAI's LLM.
4. The **post-call analytics** card shows sentiment, detected entities (drug/people) and topics.
5. Switch to हिन्दी and watch AASHA reply in हिन्दी.
6. Close: *"आशा = hope. AASHA calls them, so you don't have to worry."*

## 7. Links
- Live: `/` (serve `node server/index.js` → http://localhost:8000)
- Admin: `/admin`
- API: `/api/...` (see README)

---

*Made by a 2-person team: the strategist + the builder.* 🚀
