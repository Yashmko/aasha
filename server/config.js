/* ============================================================
   config.js — central, env-driven configuration
   All secrets come from the environment; nothing hard-coded.
   Loads a gitignored .env into process.env (zero-dependency).
   NOTE: never log an api key — only a "configured" boolean.
   ============================================================ */
const path = require('path');
const fs = require('fs');

// Tiny .env loader — reads a gitignored .env into process.env if present.
(function loadDotEnv() {
  const f = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    if (k && process.env[k] === undefined) process.env[k] = v;
  }
})();

module.exports = {
  env: (process.env.NODE_ENV || 'development'),
  port: parseInt(process.env.PORT || '8000', 10),

  // Host/public URL used to build callbacks (define if deploying).
  baseUrl: (process.env.BASE_URL || 'http://localhost:' + (process.env.PORT || '8000')),

  // App data directory (JSON persistence).
  dataDir: (process.env.AASHA_DATA_DIR || path.join(__dirname, '..', 'data')),

  // --- AI provider (agent brain) ---
  ai: {
    // Gemini free tier (aistudio.google.com/apikey)
    geminiKey: process.env.AASHA_GEMINI_KEY || '',
    geminiModel: (process.env.AASHA_GEMINI_MODEL || 'gemini-2.0-flash'),
    // Optional OpenAI-compatible fallback (e.g. llm.hackclub, groq, openai)
    openaiKey: process.env.AASHA_OPENAI_KEY || '',
    openaiBase: (process.env.AASHA_OPENAI_BASE || 'https://api.openai.com/v1'),
    openaiModel: (process.env.AASHA_OPENAI_MODEL || 'gpt-4o-mini'),
  },

  // --- AssemblyAI (speech-to-text + LLM Gateway for the agent brain) ---
  assembly: {
    key: process.env.AASHA_AAI_KEY || '',
    // Real-time / streaming transcription token (Universal-Streaming)
    streamingKey: process.env.AASHA_AAI_STREAM_KEY || '',
    // LLM Gateway model used for the agent brain + clinical summaries
    llmModel: process.env.AASHA_AAI_MODEL || 'qwen3.5-4b-32k-fast',
  },

  // --- Outbound voice / phone (optional — Twilio or similar) ---
  phone: {
    provider: (process.env.AASHA_PHONE_PROVIDER || ''), // 'twilio'
    twilioAccountSid: process.env.AASHA_TWILIO_SID || '',
    twilioAuthToken: process.env.AASHA_TWILIO_TOKEN || '',
    twilioFromNumber: process.env.AASHA_TWILIO_FROM || '',
  },

  // --- Family alerts ---
  alerts: {
    // Channels to deliver family alerts to. Add more as needed.
    webhookUrl: process.env.AASHA_ALERT_WEBHOOK || '',   // generic push/waypoint URL
    twilioWhatsappFrom: process.env.AASHA_WA_FROM || '', // 'whatsapp:+1415...'
    familyNumber: process.env.AASHA_FAMILY_NUMBER || '', // '+9198XXXXXXXX'
  },

  // --- default senior profile (seeded for demo) ---
  defaultSenior: {
    name: 'Aunty Kamla',
    age: 72,
    city: 'Ludhiana',
    meds: ['BP tablet @ 7pm', 'Thyroid @ 8am'],
    grandchild: 'Rohan',
    familyContact: process.env.AASHA_FAMILY_NUMBER || '+91 98XXXXXX',
    languages: ['en', 'hi', 'pa'],
  },
};
