# 🚀 Deploy AASHA in ~5 minutes

AASHA is **zero-dependency Node** — there is no build step and **no npm install**. It reads `PORT` from the environment and binds all interfaces, so any free host works. Pick ONE path below.

> **The only secret you need** on the host is **`AASHA_AAI_KEY`** — one AssemblyAI key powers the agent brain (LLM Gateway), real-time streaming STT, clinical notes, and post-call analytics. Set it as a host **secret**, never in a committed file. `.env` is gitignored.

---

## Option A — Render (easiest, use the blueprint)

1. Push this folder to GitHub (`.env` must stay untracked — it's gitignored).
2. In Render: **New → Blueprint**, connect the repo. It reads [`render.yaml`](render.yaml) automatically.
3. Render will prompt you for `AASHA_AAI_KEY` (declared as a `sync: false` secret). Paste the key.
4. Deploy. Render injects `PORT`; the health check hits `/health`.
5. After deploy, set `BASE_URL` to your live URL in the dashboard (e.g. `https://aasha.onrender.com`).

## Option B — Fly.io

```bash
fly launch --no-deploy          # generates/applies fly.toml
fly secrets set AASHA_AAI_KEY=your_key
fly deploy
```
`fly.toml` is included (region `bom` near our users; internal port 8080). Set `BASE_URL=https://aasha.fly.dev` after first deploy.

## Option C — Railway

```bash
railway init && railway up      # or connect the repo in the Railway dashboard
railway variables set AASHA_AAI_KEY=your_key
# Start command: node server/index.js   (no build, no deps)
```

## Option D — Generic VPS / sandbox
```bash
node server/index.js            # listens on $PORT or 8000
```

---

## ✅ Post-deploy smoke test
```bash
BASE="https://your-app"
curl -s "$BASE/health"                         # → service:"aasha", assembly.configured true
curl -s -o /dev/null -w "%{http_code}\n" "$BASE"      # → 200
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/admin" # → 200
curl -s -X POST "$BASE/api/assembly/doctor-note" \
  -H 'Content-Type: application/json' -d '{"demo":true,"seniorName":"Suman","age":72}' \
  # → transcript + real clinical summary (verifies STT + LLM Gateway + secrets)
```

---

## 🔐 Secrets checklist
| Var | Needed for | Set on host |
|---|---|---|
| `AASHA_AAI_KEY` | **Brain + real-time STT + clinical notes + analytics** | ✅ required |
| `BASE_URL` | correct callbacks / links | after deploy |
| `AASHA_ALERT_WEBHOOK` | real family notifications (optional) | optional |
| `AASHA_TWILIO_*` | outbound WhatsApp/voice (optional) | optional |

> Never commit `.env`. Always set the key via the host's secret store.
