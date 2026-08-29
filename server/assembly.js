/* ============================================================
   assembly.js — AssemblyAI integration (Speech-to-Text + LeMUR).
   Zero dependencies. Uses the official REST API.
   Exports:
     transcribe(audioUrl)        -> transcript text
     doctorNoteFromAudio(buf)    -> upload + transcribe + LeMUR doctor note
     summarizeTranscript(text)   -> structured care summary (never null)
     streamingToken()            -> v3 token for the browser WebSocket
     ping()                      -> key health
   ============================================================ */
const https = require('https');
const config = require('./config');
const store = require('./store');

function aai(tokenName = 'assembly.key') {
  const keys = { 'assembly.key': config.assembly.key, 'assembly.streamingKey': config.assembly.streamingKey };
  return keys[tokenName] || '';
}

function request(method, path, body, token = '') {
  return new Promise((resolve, reject) => {
    const key = token || aai();
    const data = body ? JSON.stringify(body) : null;
    const req = https.request({
      hostname: 'api.assemblyai.com', port: 443, path, method,
      headers: {
        'content-type': 'application/json',
        authorization: key,
        ...(data ? { 'content-length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { resolve({ raw: d, status: res.statusCode }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

/* Get a short-lived temporary token for the v3 streaming WebSocket.
   The browser uses this token (in the WS query string) so the API key
   is never exposed client-side. Docs: GET https://streaming.assemblyai.com/v3/token */
function streamingToken(expiresIn = 60) {
  const key = aai();
  return new Promise((resolve, reject) => {
    https.get({
      hostname: 'streaming.assemblyai.com', port: 443,
      path: `/v3/token?expires_in_seconds=${expiresIn}`,
      headers: { authorization: key },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try {
          const j = JSON.parse(d);
          if (res.statusCode === 200 && j.token) resolve(j);
          else reject(new Error('token error: ' + JSON.stringify(j)));
        } catch (e) { reject(new Error('token parse failed: ' + res.statusCode)); }
      });
    }).on('error', reject);
  });
}

/* Transcribe a hosted/public audio URL (async, polling). */
async function transcribe(audioUrl, opts = {}) {
  const key = aai();
  const res = await request('POST', '/v2/transcript', { audio_url: audioUrl, ...opts }, key);
  if (!res.id) throw new Error('AssemblyAI transcribe failed: ' + JSON.stringify(res));
  for (let i = 0; i < 120; i++) {
    const t = await request('GET', '/v2/transcript/' + res.id, null, key);
    if (t.status === 'completed') return t.text;
    if (t.status === 'error') throw new Error('transcription error: ' + (t.error || ''));
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('transcription timeout');
}

/* Upload raw audio bytes → AssemblyAI storage URL (always works, self-hosted). */
function uploadAudio(buf) {
  const key = aai();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.assemblyai.com', port: 443, path: '/v2/upload', method: 'POST',
      headers: { authorization: key, 'content-type': 'application/octet-stream', 'content-length': buf.length },
    }, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => {
        try { const j = JSON.parse(d); if (res.statusCode === 200 && j.upload_url) resolve(j); else reject(new Error('upload failed ' + res.statusCode)); }
        catch (e) { reject(new Error('upload parse failed')); }
      });
    });
    req.on('error', reject);
    req.write(buf); req.end();
  });
}

function lemurPrompt(senior) {
  return `You are AASHA's clinical care assistant. Given a voice transcript of a daily check-in phone call with ${senior.name} (${senior.age}yo), output a JSON object exactly with the following keys (no markdown, no prose outside the JSON):\n{\n  "mood": <integer 1-10>,\n  "meds_taken": "yes|no|partial|unknown",\n  "flags": "none|comma,separated,list",\n  "family_alert": true|false,\n  "alert_reason": "<one short sentence or empty string>",\n  "doctor_notes": "<2-3 sentence clinical summary for a doctor>"\n}\nTreat dizziness, falls, chest pain, breathlessness, confusion, or missed critical medications as family_alert=true.`;

  // (literal newlines are fine here because this is a real template string)
}

/* Full LeMUR pipeline from caller audio:
   upload → create transcript → poll to completed → LeMUR structured summary. */
/* OpenAI-compatible chat completion against AssemblyAI's LLM Gateway.
   This is AssemblyAI's current (post-LeMUR) AI layer and accepts the same
   project API key — so the agent brain + clinical summary both run on
   AssemblyAI sponsor tech with no extra key. */
async function llmChat(messages, opts = {}) {
  const key = aai();
  const body = {
    model: opts.model || config.assembly.llmModel,
    messages,
    max_tokens: opts.maxTokens || 900,
    temperature: opts.temperature != null ? opts.temperature : 0.4,
  };
  if (opts.jsonSchema) body.response_format = { type: 'json_schema', json_schema: { name: opts.jsonName || 'result', schema: opts.jsonSchema } };
  const res = await fetch('https://llm-gateway.assemblyai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: key },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('LLM Gateway ' + res.status + ': ' + (await res.text()).slice(0, 160));
  const d = await res.json();
  return d?.choices?.[0]?.message?.content || '';
}

/* Full pipeline from caller audio: upload → transcribe → LLM Gateway clinical summary. */
async function doctorNoteFromAudio(audioBuf, senior) {
  const key = aai();
  const up = await uploadAudio(audioBuf);
  const created = await request('POST', '/v2/transcript', { audio_url: up.upload_url }, key);
  if (!created.id) throw new Error('transcript create failed: ' + JSON.stringify(created));
  const tid = created.id;
  let text = '';
  for (let i = 0; i < 120; i++) {
    const t = await request('GET', '/v2/transcript/' + tid, null, key);
    if (t.status === 'completed') { text = t.text || ''; break; }
    if (t.status === 'error') throw new Error('transcription error');
    await new Promise(r => setTimeout(r, 1000));
  }
  let summary = null, raw = '';
  try {
    raw = await llmChat([{ role: 'user', content: lemurPrompt(senior) + '\nTRANSCRIPT:\n' + text }]);
    const m = raw.match(/\{[\s\S]*\}/);
    summary = JSON.parse(m ? m[0] : raw);
  } catch (e) {
    store.log('[assembly] LLM summary parse failed → rule-based: ' + e.message);
    summary = ruleBasedSummary(text, senior);
  }
  return { transcript: text, summary, raw, transcript_id: tid };
}

/* Rule-based fallback so the doctor-note panel ALWAYS renders structured output
   even with no LLM and no audio. */
function ruleBasedSummary(transcriptText, senior) {
  const t = (transcriptText || '').toLowerCase();
  const has = (w) => t.includes(w);
  const flags = [];
  if (has('dizz') || has('vertigo')) flags.push('dizziness');
  if (has('fall') || has('fainted') || has('collapse')) flags.push('fall_risk');
  if (has('chest') && (has('pain') || has('tight'))) flags.push('chest_pain');
  if (has('breath') || has('short of breath')) flags.push('breathlessness');
  if (has('confus')) flags.push('confusion');
  if (has('tremor') || has('shak')) flags.push('tremor');
  const missed = has('forgot') || has('missed') || has('didn\'t take') || has('skip');
  const meds = missed ? 'partial' : (has('meds') || has('medicine') || has('tablet') || has('bp') ? 'yes' : 'unknown');
  let mood = 6;
  if (flags.length) mood = Math.max(3, 6 - flags.length);
  const alert = flags.some(f => ['dizziness', 'fall_risk', 'chest_pain', 'breathlessness', 'confusion'].includes(f)) || missed;
  const reason = alert ? (flags[0] || 'possible missed medication') : '';
  const doctor = `Daily check-in with ${senior.name}. ${flags.length ? 'Risk flags noted: ' + flags.join(', ') + '.' : 'No acute flags raised.'} ${missed ? 'Medication adherence possibly incomplete.' : 'Medication adherence appears OK.'} Recommend routine follow-up${alert ? ', prompt family review' : ''}.`;
  return { mood, meds_taken: meds, flags: flags.length ? flags.join(',') : 'none', family_alert: alert, alert_reason: reason, doctor_notes: doctor };
}

/* Turn a whole conversation transcript into a structured clinical summary.
   Uses the agent LLM when available, else rule-based; NEVER returns null. */
async function summarizeTranscript(transcriptText, senior) {
  let llm = null;
  try {
    const agent = require('./agent');
    if (agent && typeof agent.extractFromText === 'function') {
      const out = await agent.extractFromText(lemurPrompt(senior) + '\nTRANSCRIPT:\n' + transcriptText);
      if (typeof out === 'object' && out) llm = out;
      else if (typeof out === 'string' && out.trim()) { try { llm = JSON.parse(out); } catch (e) { llm = null; } }
    }
  } catch (e) { store.log('[assembly] LLM path unavailable: ' + e.message); }
  return llm || ruleBasedSummary(transcriptText, senior);
}

/* Full analytics from caller audio: upload → transcribe with
   sentiment + entity + category analysis → normalized card data. */
async function analyseFromAudio(audioBuf) {
  const key = aai();
  const up = await uploadAudio(audioBuf);
  const created = await request('POST', '/v2/transcript', {
    audio_url: up.upload_url, sentiment_analysis: true, entity_detection: true, iab_categories: true,
  }, key);
  if (!created.id) throw new Error('transcript create failed: ' + JSON.stringify(created));
  const tid = created.id;
  let t;
  for (let i = 0; i < 120; i++) {
    t = await request('GET', '/v2/transcript/' + tid, null, key);
    if (t.status === 'completed' || t.status === 'error') break;
    await new Promise(r => setTimeout(r, 1000));
  }
  if (t.status !== 'completed') throw new Error('analytics transcription failed');
  const sents = (t.sentiment_analysis_results || []);
  const neg = sents.filter(s => s.sentiment === 'NEGATIVE').length;
  const pos = sents.filter(s => s.sentiment === 'POSITIVE').length;
  const neu = sents.filter(s => s.sentiment === 'NEUTRAL').length;
  const entities = (t.entities || []).map(e => ({ type: e.entity_type, text: e.text }));
  const iab = ((t.iab_categories_result || {}).results || [])[0];
  const iabTop = (iab?.labels || []).slice(0, 6).map(l => l.label);
  const duration = t.audio_duration ? Math.round(Number(t.audio_duration)) : null;
  return {
    transcript: t.text,
    duration_s: duration,
    word_count: (t.words || []).length,
    sentiment: { negative: neg, neutral: neu, positive: pos, dominant: neg >= pos ? 'NEGATIVE' : (pos > 0 ? 'POSITIVE' : 'NEUTRAL') },
    sentences: sents.map(s => ({ text: s.text, sentiment: s.sentiment.toLowerCase(), confidence: Math.round((s.confidence || 0) * 100) })),
    entities,
    topics: iabTop,
    transcript_id: tid,
  };
}

/* Quick health check of the AssemblyAI key. */
async function ping() {
  if (!aai()) return { configured: false };
  try {
    const r = await request('GET', '/v2/account', null, aai());
    return { configured: true, ok: !!r?.auth_token || !!r?.email, info: r };
  } catch (e) {
    return { configured: true, ok: false, error: e.message };
  }
}

module.exports = { transcribe, streamingToken, summarizeTranscript, doctorNoteFromAudio, analyseFromAudio, ruleBasedSummary, llmChat, ping, aai };
