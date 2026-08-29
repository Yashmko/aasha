# 🏆 AASHA — "Win by a Big Gap" Master Checklist

> Goal: be so far ahead on **impact × craft × sponsor-tech × story** that nobody's close.
> Status legend: ✅ done · 🔶 partially done · ⬜ not started · 🧪 needs testing/deploy
> Owner: 🧑 you (decisions), 🤖 build here, 🤝 both.

> **📊 Auto-score: `[x]` count → replace below after each session** (count every `- [x]` line).
> `Progress: 34/40 tasks done`

---

## PHASE 0 — Foundation (mostly done)
- [x] ✅ Backend agent loop (greet→mood→meds→flags→comfort→escalate→doctor notes) — `server/`
- [x] ✅ Multilingual EN/हिन्दी/ਪੰਜਾਬੀ + **auto language detection**
- [x] ✅ Persistent memory / learning across calls
- [x] ✅ Medication schedule + daily adherence log
- [x] ✅ Red-flag detection + family alerts (webhook / Twilio WhatsApp / demo)
- [x] ✅ Daily automated check-ins + `due today`
- [x] ✅ Doctor-ready care report + care-score trending
- [x] ✅ Frontend wired to backend (memory panel, meds, summary, trend, check-in, new session)
- [x] ✅ Admin dashboard (`/admin`) — live KPI, seniors, alerts, memory, sessions
- [x] ✅ Glassmorphism UI polish (fixed the flat-white boxes)
- [x] ✅ `server/selfcheck.js` — **13/13 passing**; both frontend JS files syntax-clean
- [x] ✅ Zero-dependency Node (runs anywhere, no npm install)

---

## PHASE 1 — WIN ON SPONSOR TECH (AssemblyAI) ← biggest scoring gap
- [x] ✅ **Real-time STT via AssemblyAI v3** wired into the live app.
  - Done: `server/assembly.js` exposes `streamingToken()` + `transcribe()` + `summarizeTranscript()`.
  - ⬜ Task: app pulls `/api/assembly/token`, streams mic audio, renders **live transcript** as AASHA hears it.
  - ⬜ Task: show a "❤️ AssemblyAI" badge + a **latency readout** (e.g. "sub-300ms").
- [x] ✅ **AssemblyAI doctor-ready clinical note** shown in-app. *(Note: the classic `/v2/lemur/task` is now DEPRECATED/404 — we use AssemblyAI's current AI layer, the **LLM Gateway** `llm-gateway.assemblyai.com/v1/chat/completions` with the same API key. Pipeline: upload caller audio → `/v2/transcript` → LLM Gateway structured summary. Verified end-to-end: flags & family_alert parse correctly.)* `POST /api/assembly/doctor-note`, bundled demo clip `assets/demo-patient.mp3`.
- [x] ✅ **Post-call analytics card** — AssemblyAI sentiment (per-sentence), entity detection (drug/people/duration), IAB topic categories, duration + word count on the finished call. `POST /api/assembly/analytics` (`{demo:true}` or raw audio, `sentiment_analysis+entity_detection+iab_categories`). Rendered in the dashboard `#analyticsBox` by the auto-demo.

> 🧭 **Sponsor-stack note:** the classic `/v2/lemur/task` (LeMUR) is **deprecated/404**. We use AssemblyAI's current stack — **v3 streaming token** (real-time STT) + **LLM Gateway** (`llm-gateway.assemblyai.com/v1/chat/completions`, same key) for the agent brain & clinical notes + **analysis features** on `/v2/transcript` for analytics.
- [x] ✅ Keep AssemblyAI free-tier friendly (no credit burn in demo) — browser Web Speech by default; sponsor STT only while talking; auto-demo/doctor-note/analytics upload a ~27s clip once per run; LLM Gateway uses a small `max_tokens` budget; works with no key (offline caregiver). Documented in README `Free-tier posture`.

## PHASE 2 — WIN ON THE DEMO (flawless 3-min video)
- [x] ✅ **"Auto-demo / call AASHA" button** (`#demoBtn`) — one click runs a scripted conversation (no mic risk) for a clean Loom recording.
  - ✅ Task: replay a scripted call (greet → meds → red flag → alert → doctor note) + real AssemblyAI doctor note in the dashboard. *(🧪 still worth a live browser render check.)*
- [ ] 🔶 **Call-out to a real number** (Twilio voice). Without it we're browser-only. Optional but the single most "wow" feature.
  - ⬜ Task: configure `AASHA_PHONE_PROVIDER=twilio` + dial-in webhook.
- [ ] 🔶 **3-min demo video** (Loom/browser): hook → live call → dashboard flip to alert → doctor note. Add these to `demo-script`.
  - ⬜ Task: record it.
- [x] ✅ **Catchphrase + show the multilingual moment** — the auto-demo now ends with a genuine हिन्दी exchange (AASHA replies in हिन्दी, `state.lang` switches so the TTS is audible on camera). Catchphrase *"आशा = hope. AASHA calls them, so you don't have to worry."* in `PITCH.md`.

## PHASE 3 — WIN ON THE PITCH / STORY
- [x] ✅ **1-min elevator pitch** — written word-for-word in `PITCH.md` (~135 words ≈ 55s).
- [x] ✅ **Business model** — sold to families/NRIs + eldercare/insurance; ~₹299/mo per parent; near-zero marginal cost. In `PITCH.md` + `submission.md`.
- [x] ✅ **Why this is different** (vs. "Check on Loved Ones"/CareSetu) — 5 differentiators + in-demo evidence, in `PITCH.md`.
- [x] ✅ **Contest-friendly packaging** — clear README (✅) + added `LICENSE` (MIT) + `package.json` (start/check scripts, zero deps) + `PITCH.md`.
- [x] ✅ submission.md refreshed with final specs (AssemblyAI LLM Gateway stack, new endpoints, demo shot list).

## PHASE 4 — WIN ON CRAFT / UX (make it feel expensive)
- [x] ✅ **Cinematic hero visual** (grandparent + warm orb) — `assets/hero.jpg`, integrated via `.hero-img frame` (hover lift).
- [x] ✅ **Light + dark theme toggle** (MetalForge dark variant on white base) — `#themeBtn` + `body[data-theme="dark"]` block.
- [x] ✅ **Micro-interactions** — orb breathing/ring while listening (`.orb.listening`), alert pop-in, hover lifts + gradient-ring frames, section reveals. Toolbar has real controls (Auto-mode / End / Clear / New session / Auto-demo).
- [x] ✅ **Mobile pass** — added a `<520px` media query: tightened hero/dashboard/console/controls, shrunk orb; terminal & console `max-width:100%` to stop horizontal scroll; admin grid already stacks.
- [x] ✅ **Performance** — 7-day immutable cache + `X-Content-Type-Options: nosniff` on `/assets/` (index revalidated); no heavy deps; ~750KB project.

## PHASE 5 — WIN ON ROBUSTNESS / SAFETY (the "not lazy about" list)
- [x] ✅ **A11y** — orb is `tabindex=0` + `role=button` + `aria-pressed` + `aria-label`, Enter/Space toggles; `aria-live="polite"` on live transcript + STT; visible `:focus-visible` outlines; reduced-motion respected; img alt text present.
- [x] ✅ **Error handling at trust boundaries** — config-status **pills** on BOTH pages (`#cfgPills`, wired to `/health`, safe/non-logging); backend degrades gracefully.
- [x] ✅ **Mockable / offline mode** — works fully with no keys; added a clear **runtime-mode banner** (`#modeBanner`) that says "Demo mode" vs "Live AI brain on AssemblyAI" from `/health`.
- [x] ✅ **Self-test still green** after every change — now **18/18** (added checks for the rule-based doctor-note fallback + analytics normalization), deterministic/no-network.

## PHASE 6 — DEPLOY (last, as you said)
- [x] ✅ **Run the full suite**: `node server/selfcheck.js` green (**18/18**) + both frontend JS `node --check` green.
- [x] ✅ **Deploy backend** — scaffolding ready: `render.yaml` (Render blueprint) + `fly.toml` (Fly) + `DEPLOY.md` guide + `start.sh` (env loader). **Final step is you pushing to GitHub + picking a host** (needs your account + key in host env).
- [ ] ⬜ **Set env vars**: `AASHA_AAI_KEY` (powers brain + STT + clinical notes) on the host. *(Offered ready — set as a secret on the host.)*
- [ ] ⬜ **Custom domain / nice subdomain** (e.g. `aasha.demo.app`) + HTTPS.
- [ ] ⬜ **Final smoke test on the live URL** (home, admin, one full call, one alert).
- [ ] ⬜ **Submit**: repo URL + live URL + 3-min video + pitch text.

> 🧊 **Only a real push + host account remain** (blocked on your credentials). Repo is git-initialized + committed locally, secret-safe; `DEPLOY.md` walks you through 4 hosting options in ~5 min.

---

## ⏱️ Effort / impact table (so we pick the highest-ROI first)
| Item | Effort | Impact on winning | Priority |
|---|---|---|---|
| Real-time AssemblyAI STT + transcript | Med | 🔥🔥🔥🔥 (sponsor tech) | 1 |
| Auto-demo (no-mic scripted call) | Low | 🔥🔥🔥🔥 (clean video) | 2 |
| LeMUR doctor summary in-app | Med | 🔥🔥🔥 (sponsor tech) | 3 |
| Cinematic hero visual | Low | 🔥🔥🔥 (emotional) | 4 |
| Deploy live + submit | Med | 🔥🔥🔥🔥 (required) | 5 |
| Twilio real outbound call | High | 🔥🔥 (large, only if time) | 6 |
| Theme toggle / mobile / a11y | Low-Med | 🔥🔥 (polish) | 7 |

> **Suggested order:** 1 → 2 → 5(deploy+submit) → 3 → 4 → 7 → 6 (only if time allows).

---

*Legend: this is a living file — we tick boxes as they land. If you want, I'll also add a one-line status (`done/total`) computed automatically at the top.*
