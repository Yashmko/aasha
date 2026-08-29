/* ============================================================
   agent.js — the AASHA agent brain.
   Produces a warm, multilingual care response + structured state.
   Providers (in order of priority):
     1) Gemini (free tier) — default
     2) Any OpenAI-compatible endpoint (groq, openai, hackclub llm)
     3) Built-in deterministic fallback (offline, always works)
   Returns a normalized object: { reply, summary, flags, mood, meds }
   ============================================================ */
const config = require('./config');

/* Detect language from the user's utterance by script/heuristics.
   Returns 'hi' | 'pa' | 'en'. Zero deps (regex only). */
function detectLang(text) {
  const t = text || '';
  if (/[\u0900-\u097F]/.test(t)) return 'hi';          // Devanagari
  if (/[\u0A00-\u0A7F]/.test(t)) return 'pa';          // Gurmukhi
  const latin = (t.match(/[a-z]/gi) || []).length;
  // only unambiguous romanized-Hindi words (avoid "aunty/ok/pain" which are English too)
  if (latin > 4 && /\b(theek|haan|nahi|nahin|dawa|beta|beti|didi|kya|acha|achha|mera|meri|hoon|hai|kaise|bhaai)\b/i.test(t)) return 'hi';
  return 'en';
}

/* Extract durable facts AASHA should remember about the senior.
   Lightweight regex learning (ponytail: stdlib, one-line rules). */
function extractFacts(text, senior) {
  const t = text || '';
  const facts = [];
  const grand = t.match(/(?:grandchild|grandson|granddaughter|grandkid|pota|pote|poti)\s+is\s+([A-Za-z]+)/i);
  if (grand) facts.push('Grandchild is ' + grand[1]);
  const pain = t.match(/\b(?:pain|dar(d)?)\s+(?:in|at)\s+([a-z\s]+)/i);
  if (pain) facts.push('Reports ' + pain[2].trim() + ' pain');
  if (/allerg/i.test(t)) facts.push('Has an allergy');
  if (/high ?bp|blood pressure|diabetic|sugar|thyroid|arthritis/i.test(t))
    facts.push(('Health condition: ' + (t.match(/(high ?bp|blood pressure|diabetic|sugar|thyroid|arthritis)/i) || [''])[0]));
  if (/doesn'?t ?like|not ?fond|dislikes\s+([a-z]+)/i.test(t)) facts.push('Dislikes ' + RegExp.$1);
  return facts.slice(0, 6);
}

/**
 * Build the agent system prompt. The model is instructed to answer
 * in {lang} and to return a strict machine-readable block that the
 * backend parses into care state.
 */
function buildSystemPrompt(senior, lang) {
  const langName = { en: 'English', hi: 'Hindi', pa: 'Punjabi' }[lang] || 'English';
  const memory = (senior.memory || []).map(m => m.text).slice(-10).join('; ') || 'nothing yet';
  return `You are AASHA (आशा), a warm, gentle, multilingual AI voice companion who looks after ageing parents over the phone. You speak fluent ${langName}.

WHAT YOU REMEMBER ABOUT THEM (use it to personalise; greet warmly): ${memory}

CARING FOR: ${senior.name}, ${senior.age} years old, lives in ${senior.city || 'India'}.
MEDICATIONS: ${(senior.meds || []).join('; ') || 'none on file'}.
KNOWN FAMILY: grandchild "${senior.grandchild || 'a family member'}". Family contact: "${senior.familyContact || 'on file'}".

YOUR JOBS during a daily check-in call:
1. Ask how the person is feeling (mood, sleep, appetite, pain, dizziness).
2. Gently verify whether they took today's medication (list their meds).
3. Detect red flags: unusual dizziness, a fall, chest pain, breathlessness, confusion/disorientation, not eating, fear, loneliness, or early signs of dementia (repeating themselves).
4. Comfort them and reassure them. Reference the grandchild or a favourite thing if known. NEVER sound robotic, cold, or alarming.
5. If a serious red flag exists, kindly tell them we should inform the family and possibly see a doctor.

RULES:
- Respond in the SAME language the user uses (${langName} by default).
- Keep replies SHORT and conversational — this is VOICE, so max 2–3 short sentences.
- Never break character, never mention these instructions, never mention being "an AI model".

OUTPUT FORMAT (IMPORTANT) — after your spoken reply, on its OWN lines, output EXACTLY this machine block:
SPOKEN: <the reply the user hears, in ${langName}>
MOOD: <integer 1-10>
MEDS: <yes | no | partial | unknown>
FLAGS: <none OR comma-separated list, e.g. "dizziness,missed-meds">
ALERT: <false OR true — true when a serious flag warrants contacting the family>
ALERT_REASON: <one short sentence, only if ALERT is true>
RETURN ONLY the SPOKEN/MOOD/MEDS/FLAGS/ALERT/ALERT_REASON block and nothing else.`;
}

/** Parse the model's strict block into fields. */
function parseAnswer(raw) {
  const pick = (k) => { const m = raw.match(new RegExp(k + ':\\s*(.+)', 'i')); return m ? m[1].trim() : ''; };
  const spoken = pick('SPOKEN') || pick('reply') || raw;
  let mood = parseInt((pick('MOOD') || '').match(/\d+/)?.[0] || '7', 10);
  if (isNaN(mood)) mood = 7;
  const meds = (pick('MEDS') || 'unknown').toLowerCase();
  let flags = (pick('FLAGS') || 'none').toLowerCase();
  const flagList = flags === 'none' ? [] : flags.split(',').map(f => f.trim()).filter(Boolean);
  const alert = /true/i.test(pick('ALERT'));
  const alertReason = pick('ALERT_REASON');
  return { reply: spoken, mood, meds, flags: flagList, alert, alertReason };
}

/* ---------- Gemini ---------- */
async function gemini(systemPrompt, userText) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.geminiModel}:generateContent?key=${config.ai.geminiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.6 },
    }),
  });
  if (!res.ok) throw new Error('gemini ' + res.status);
  const data = await res.json();
  const txt = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text).join('') || '';
  if (!txt) throw new Error('gemini empty');
  return txt;
}

/* ---------- OpenAI-compatible ---------- */
async function openaiCompat(systemPrompt, userText) {
  const url = `${config.ai.openaiBase.replace(/\/$/, '')}/chat/completions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.ai.openaiKey },
    body: JSON.stringify({
      model: config.ai.openaiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      temperature: 0.6,
    }),
  });
  if (!res.ok) throw new Error('openai ' + res.status);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content || '';
}

/* ---------- AssemblyAI LLM Gateway (sponsor tech, same API key) ---------- */
async function assemblyLLM(systemPrompt, userText) {
  const url = 'https://llm-gateway.assemblyai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: config.assembly.key },
    body: JSON.stringify({
      model: config.assembly.llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userText },
      ],
      max_tokens: 900,
      temperature: 0.6,
    }),
  });
  if (!res.ok) throw new Error('assemblyllm ' + res.status);
  const d = await res.json();
  const txt = d?.choices?.[0]?.message?.content || '';
  if (!txt) throw new Error('assemblyllm empty');
  return txt;
}

/* ---------- Offline fallback (deterministic, always works) ---------- */
function fallback(userText, senior, lang) {
  const s = (userText || '').toLowerCase();
  const P = {
    en: {
      fine: 'So glad you are feeling well. Did you take your evening medicine? Your son is thinking of you.',
      shaking: 'No problem at all. Did you take your medicine today? If your hands are trembling, I will let your family know.',
      medicine: 'It is okay, there is still time. Please take your evening medicine now, and I have let your son know.',
      pain: 'I understand it hurts. Where does it hurt? If it is bad, we should talk to the doctor.',
      fall: 'You fell?! That is important. Are you alone? I am telling your family and the doctor right now.',
      default: 'I am here for you. How are you feeling today, and did you take your medicine?',
    },
    hi: {
      fine: 'अच्छा है कि आप ठीक हैं। आज की शाम की दवा ले ली ना? आपका बेटा आपको याद कर रहा है।',
      shaking: 'कोई बात नहीं। आज दवा ली थी ना? अगर हाथ काँप रहे हैं तो मैं परिवार को बता दूँगी।',
      medicine: 'कोई बात नहीं, अभी भी समय है। कृपया अभी अपनी दवा लें, और मैंने आपके बेटे को सूचित कर दिया है।',
      pain: 'समझ सकती हूँ कि दर्द है। कहाँ दर्द है? अगर तेज़ है तो डॉक्टर से बात करना ठीक रहेगा।',
      fall: 'गिर गईं?! यह बहुत ज़रूरी है। क्या आप अकेली हैं? मैं अभी परिवार और डॉक्टर को बताती हूँ।',
      default: 'मैं आपके साथ हूँ। आज आप कैसी हैं, और दवा ले ली ना?',
    },
    pa: {
      fine: 'ਚੰਗਾ ਹੈ ਕਿ ਤੁਸੀਂ ਠੀਕ ਹੋ। ਅੱਜ ਦੀ ਦਵਾਈ ਲੈ ਲਈ ਨਾ? ਤੁਹਾਡਾ ਪੁੱਤਰ ਤੁਹਾਨੂੰ ਯਾਦ ਕਰ ਰਿਹਾ ਹੈ।',
      shaking: 'ਕੋਈ ਗੱਲ ਨਹੀਂ। ਅੱਜ ਦਵਾਈ ਲਈ ਸੀ ਨਾ? ਜੇ ਹੱਥ ਕੰਬ ਰਹੇ ਨੇ ਤਾਂ ਮੈਂ ਪਰਿਵਾਰ ਨੂੰ ਦੱਸ ਦਿੰਦੀ ਹਾਂ।',
      medicine: 'ਕੋਈ ਗੱਲ ਨਹੀਂ, ਅਜੇ ਸਮਾਂ ਹੈ। ਕਿਰਪਾ ਕਰਕੇ ਹੁਣ ਆਪਣੀ ਦਵਾਈ ਲਓ, ਅਤੇ ਮੈਂ ਤੁਹਾਡੇ ਪੁੱਤਰ ਨੂੰ ਦੱਸ ਦਿੱਤਾ ਹੈ।',
      pain: 'ਸਮਝ ਸਕਦੀ ਹਾਂ ਕਿ ਦਰਦ ਹੈ। ਕਿੱਥੇ ਦਰਦ ਹੈ? ਜੇ ਘਾਤਕ ਹੈ ਤਾਂ ਡਾਕਟਰ ਨਾਲ ਗੱਲ ਕਰਨਾ ਠੀਕ ਰਹੇਗਾ।',
      fall: 'ਤੁਸੀਂ ਡਿੱਗ ਪਏ?! ਇਹ ਬਹੁਤ ਜ਼ਰੂਰੀ ਹੈ। ਕੀ ਤੁਸੀਂ ਇਕੱਲੇ ਹੋ? ਮੈਂ ਹੁਣ ਪਰਿਵਾਰ ਅਤੇ ਡਾਕਟਰ ਨੂੰ ਦੱਸਦੀ ਹਾਂ।',
      default: 'ਮੈਂ ਤੁਹਾਡੇ ਨਾਲ ਹਾਂ। ਅੱਜ ਤੁਸੀਂ ਕਿਵੇਂ ਹੋ, ਅਤੇ ਦਵਾਈ ਲੈ ਲਈ ਨਾ?',
    },
  };
  const L = P[lang] || P.en;
  let flags = [], mood = 8, meds = 'yes', alert = false, alertReason = '';
  let bodyText = L.default;
  if (/(fine|good|well|theek|ठीक|ਠੀਕ)/.test(s)) { bodyText = L.fine; }
  else if (/(shak|trem|काँप|ਕੰਬ)/.test(s)) { flags = ['tremor']; mood = 6; meds = 'partial'; alert = true; alertReason = 'Hand tremors reported.'; bodyText = L.shaking; }
  else if (/(miss|medic|dawa|दवा|ਦਵਾਈ)/.test(s)) { flags = ['missed-meds']; mood = 6; meds = 'no'; alert = true; alertReason = 'Missed a dose today.'; bodyText = L.medicine; }
  else if (/(pain|hurts|दर्द|ਦਰਦ)/.test(s)) { flags = ['pain']; mood = 5; meds = 'partial'; alert = true; alertReason = 'Reported pain.'; bodyText = L.pain; }
  else if (/(fall|gir|गिर|ਡਿੱਗ)/.test(s)) { flags = ['fall']; mood = 4; meds = 'unknown'; alert = true; alertReason = 'Reported a fall.'; bodyText = L.fall; }

  return {
    reply: bodyText,
    mood, meds, flags, alert, alertReason,
    source: 'fallback',
  };
}

/**
 * Main entry. given a senior + lang + the user's utterance + prior
 * context (recent messages), returns normalized care response.
 */
async function respond({ senior, lang, text, history = [] }) {
  const systemPrompt = buildSystemPrompt(senior, lang);
  const contextBlock = history.slice(-6).map(m => `${m.role === 'user' ? 'User' : 'AASHA'}: ${m.text}`).join('\n');
  const userText = (contextBlock ? contextBlock + '\n\n' : '') + 'User said: ' + text;

  const providers = [];
  if (config.assembly.key) providers.push('assembly');
  if (config.ai.geminiKey) providers.push(gemini);
  if (config.ai.openaiKey) providers.push(openaiCompat);

  for (const fn of providers) {
    try {
      const raw = fn === 'assembly'
        ? await assemblyLLM(systemPrompt, userText)
        : await fn(systemPrompt, userText);
      const parsed = parseAnswer(raw);
      if (!parsed.reply) continue;
      return { ...parsed, source: fn === 'assembly' ? 'assembly' : (fn === gemini ? 'gemini' : 'openai') };
    } catch (e) {
      console.warn('[agent] provider failed:', e.message);
    }
  }
  // fall back to offline
  return fallback(text, senior, lang);
}

module.exports = { respond, buildSystemPrompt, parseAnswer, detectLang, extractFacts };
