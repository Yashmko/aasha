/* ============================================================
   AASHA Backend — main entry point.
   Zero-dependency Node server: REST API + serves the frontend.
   Run:  node server/index.js
   Then open http://localhost:8000 (static index.html at project root).
   ============================================================ */
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const store = require('./store');
const agent = require('./agent');
const assembly = require('./assembly');
const alerts = require('./alerts');

store.init();

const ROOT = path.join(__dirname, '..');
const PUBLIC_INDEX = path.join(ROOT, 'index.html');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon',
};

/* ---------- helper: read request body ---------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(b ? JSON.parse(b) : {}));
    req.on('error', reject);
  });
}

/* ---------- helper: read raw binary body (for uploads) ---------- */
function readBodyRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let len = 0;
    req.on('data', c => { chunks.push(c); len += c.length; if (len > 20e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/* ---------- json helper ---------- */
function json(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(obj));
}

/* ---------- routeing ---------- */
let gen = 0; // monotonic id for SSE/demo

async function handle(req, res) {
  const url = new URL(req.url, config.baseUrl);
  const p = url.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'content-type' }); return res.end(); }

  /* ================= STATIC: serve frontend ================= */
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    if (fs.existsSync(PUBLIC_INDEX)) {
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(fs.readFileSync(PUBLIC_INDEX));
    }
    return json(res, 404, { error: 'index.html not found (build it separately)' });
  }
  if (req.method === 'GET' && p === '/admin') {
    const f = path.join(ROOT, 'admin.html');
    if (fs.existsSync(f)) { res.writeHead(200, { 'Content-Type': MIME['.html'] }); return res.end(fs.readFileSync(f)); }
    return json(res, 404, { error: 'admin.html not found' });
  }
  // static assets (images, favicon, etc.) — path-traversal guarded
  if (req.method === 'GET' && p.startsWith('/assets/')) {
    const rel = decodeURIComponent(p.slice('/assets/'.length));
    const f = path.join(ROOT, 'assets', path.normalize(rel));
    if (f.startsWith(path.join(ROOT, 'assets')) && fs.existsSync(f) && fs.statSync(f).isFile()) {
      // cache immutable assets (images/audio) 7d; revalidate HTML
      const cache = /\.(html)$/.test(f) ? 'no-cache' : 'public, max-age=604800';
      res.writeHead(200, { 'Content-Type': (MIME[path.extname(f)] || 'application/octet-stream'), 'Cache-Control': cache, 'X-Content-Type-Options': 'nosniff' });
      return res.end(fs.readFileSync(f));
    }
    return json(res, 404, { error: 'asset not found' });
  }

  /* ================= HEALTH ================= */
  if (req.method === 'GET' && p === '/health') {
    return json(res, 200, {
      service: 'aasha',
      env: config.env,
      ai: {
        gemini: !!config.ai.geminiKey, openai: !!config.ai.openaiKey,
        brain: config.assembly.key ? 'assembly' : (config.ai.geminiKey ? 'gemini' : (config.ai.openaiKey ? 'openai' : 'fallback')),
        llmModel: config.assembly.llmModel,
      },
      assembly: { configured: !!config.assembly.key, llm: !!config.assembly.key },
      phone: { provider: config.phone.provider || 'none' },
      storage: path.basename(config.dataDir) + '/aasha.json',
      seniors: store.listSeniors().length,
      sessions: store.listSessions().length,
      time: new Date().toISOString(),
    });
  }

  /* ================= SENIORS ================= */
  if (req.method === 'GET' && p === '/api/seniors') return json(res, 200, store.listSeniors());

  if (req.method === 'POST' && p === '/api/seniors') {
    const body = await readBody(req);
    const s = store.createSenior({ ...config.defaultSenior, ...body });
    return json(res, 201, s);
  }

  // matches ONLY /api/seniors/:id (not sub-paths like /memory, /meds, /report)
  if (req.method === 'GET' && p.startsWith('/api/seniors/') && !p.slice('/api/seniors/'.length).includes('/')) {
    const senior = store.getSenior(p.split('/')[3]);
    return senior ? json(res, 200, senior) : json(res, 404, { error: 'not found' });
  }

  /* ================= SESSIONS ================= */
  if (req.method === 'POST' && p === '/api/sessions') {
    const body = await readBody(req);
    try {
      const target = body.seniorId || store.listSeniors()[0]?.id;
      const sess = store.createSession(target, { lang: body.lang || 'en', channel: body.channel || 'app' });
      // AASHA auto-schedules a daily check-in for this senior (if one isn't already pending)
      if (target) store.scheduleCheckin(target, 'Daily wellness check-in');
      return json(res, 201, sess);
    } catch (e) { return json(res, 400, { error: e.message }); }
  }

  /* ================= CHECK-IN: schedule / list (outbound daily call) ================= */
  if (req.method === 'POST' && p.startsWith('/api/seniors/') && p.endsWith('/checkin')) {
    const id = p.split('/')[3];
    const s = store.scheduleCheckin(id, 'Daily wellness check-in');
    return s ? json(res, 200, s) : json(res, 404, { error: 'not found' });
  }

  if (req.method === 'GET' && p === '/api/sessions') {
    return json(res, 200, store.listSessions());
  }

  if (req.method === 'POST' && p === '/api/sessions/:id/end') {
    const sess = store.endSession(p.split('/')[3]);
    return sess ? json(res, 200, sess) : json(res, 404, { error: 'not found' });
  }

  /* ================= MESSAGE (the core agent loop) ================= */
  if (req.method === 'POST' && p.startsWith('/api/sessions/') && p.endsWith('/message')) {
    const sessionId = p.split('/')[3];
    const sess = store.getSession(sessionId);
    if (!sess) return json(res, 404, { error: 'session not found' });
    const body = await readBody(req);
    const senior = store.getSenior(sess.seniorId);
    const userText = (body.text || '').trim();
    if (!userText) return json(res, 400, { error: 'empty text' });
    // auto-detect language if not supplied
    const lang = body.lang || agent.detectLang(userText) || sess.lang || 'en';

    store.appendMessage(sessionId, { role: 'user', text: userText });
    const t0 = Date.now();
    let answer;
    try {
      answer = await agent.respond({ senior, lang, text: userText, history: sess.messages });
    } catch (e) {
      store.log('[message] agent.respond error: ' + e.message);
      answer = agent.fallback ? agent.fallback(userText, senior, lang) : { reply: 'Sorry, something went wrong.', mood: 7, meds: 'unknown', flags: [], alert: false };
    }
    store.appendMessage(sessionId, { role: 'assistant', text: answer.reply });

    // update senior care-state + remember facts about them
    store.applyCareState(sess.seniorId, { mood: answer.mood, meds: { today: answer.meds }, flags: answer.flags });
    answer.flags.forEach(f => store.setFlag(sessionId, f));
    agent.extractFacts(userText, senior).forEach(f => store.learn(sess.seniorId, f));
    // log medication adherence for today
    if (answer.meds && answer.meds !== 'unknown') store.logMed(sess.seniorId, 'today', answer.meds);
    // this counts as today's scheduled check-in being done
    store.completeCheckin(sess.seniorId, new Date().toISOString().slice(0, 10));

    // summarize (doctor-ready) — we can do a lightweight summary by the same agent for now
    const summary = {
      mood: answer.mood,
      meds_taken: answer.meds,
      flags: answer.flags.length ? answer.flags : 'none',
      doctor_notes: `Daily check-in with ${senior.name}. Mood ${answer.mood}/10, medication ${answer.meds}. ${answer.flags.length ? 'Noted concerns: ' + answer.flags.join(', ') + '.' : 'No acute concerns.'} Follow up re: any flagged symptoms.`,
      generatedAt: new Date().toISOString(),
    };
    store.setSummary(sessionId, summary);

    // family alert
    let alertPayload = null;
    if (answer.alert) {
      alertPayload = await alerts.send({
        seniorId: sess.seniorId,
        sessionId,
        reason: answer.alertReason || (answer.flags[0] || 'Health concern detected'),
        seniorName: senior.name,
        detail: { summary: summary.doctor_notes },
      });
    }

    return json(res, 200, {
      reply: answer.reply,
      source: answer.source,
      lang,
      mood: answer.mood,
      meds: answer.meds,
      flags: answer.flags,
      alert: answer.alert,
      alertReason: answer.alertReason,
      alertDelivery: alertPayload,
      summary,
      elapsedMs: Date.now() - t0,
      careState: store.getSenior(sess.seniorId).careState,
    });
  }

  /* ================= TRANSCRIBE (AssemblyAI) ================= */
  if (req.method === 'POST' && p === '/api/assembly/transcribe') {
    const body = await readBody(req);
    if (!assembly.aai()) { store.log('[assembly] no api key'); return json(res, 503, { error: 'AssemblyAI key not configured', ok: false }); }
    try { const text = await assembly.transcribe(body.audioUrl); return json(res, 200, { text }); }
    catch (e) { return json(res, 500, { error: e.message }); }
  }

  /* ================= STREAMING TOKEN (AssemblyAI) =================
     Mints a short-lived browser token so the API key stays server-side. */
  if (req.method === 'GET' && p === '/api/assembly/token') {
    if (!assembly.aai()) return json(res, 503, { error: 'AssemblyAI key not configured' });
    try { return json(res, 200, await assembly.streamingToken(60)); } catch (e) { return json(res, 500, { error: e.message }); }
  }

  /* ================= SUMMARY (LeMUR) ================= */
  if (req.method === 'POST' && p === '/api/assembly/summarize') {
    const body = await readBody(req);
    if (!assembly.aai()) return json(res, 503, { error: 'AssemblyAI key not configured' });
    try { const out = await assembly.summarizeTranscript(body.transcript, { name: body.seniorName || 'Patient' }); return json(res, 200, { summary: out }); }
    catch (e) { return json(res, 500, { error: e.message }); }
  }

  /* ================= DOCTOR NOTE (LeMUR, real audio) =================
     Accepts raw octet-stream audio bytes, or JSON {demo:true} (bundled clip),
     or {text} (rule-based), or {audioUrl}. Returns transcript + LeMUR summary. */
  if (req.method === 'POST' && p === '/api/assembly/doctor-note') {
    if (!assembly.aai()) return json(res, 503, { error: 'AssemblyAI key not configured' });
    const ctype = (req.headers['content-type'] || '');
    const senior = (body) => ({ name: body.seniorName || 'Patient', age: body.age || '' });
    if (ctype.includes('octet-stream')) {
      const buf = await readBodyRaw(req);
      try { return json(res, 200, await assembly.doctorNoteFromAudio(buf, senior({}))); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    const b = await readBody(req);
    if (b.demo) {
      const f = path.join(ROOT, 'assets', 'demo-patient.mp3');
      if (!fs.existsSync(f)) return json(res, 404, { error: 'demo clip missing' });
      try { return json(res, 200, await assembly.doctorNoteFromAudio(fs.readFileSync(f), senior(b))); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    if (b.text) { try { return json(res, 200, { summary: await assembly.summarizeTranscript(b.text, senior(b)) }); } catch (e) { return json(res, 500, { error: e.message }); } }
    if (b.audioUrl) {
      try { const text = await assembly.transcribe(b.audioUrl); return json(res, 200, { transcript: text, summary: await assembly.summarizeTranscript(text, senior(b)) }); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    return json(res, 400, { error: 'provide octet-stream audio, {demo:true}, {text}, or {audioUrl}' });
  }

  /* ================= POST-CALL ANALYTICS (AssemblyAI) =================
     Accepts {demo:true} (bundled clip) or raw octet-stream audio; returns
     sentiment + entities + topics + duration for the finished call. */
  if (req.method === 'POST' && p === '/api/assembly/analytics') {
    if (!assembly.aai()) return json(res, 503, { error: 'AssemblyAI key not configured' });
    const ctype = (req.headers['content-type'] || '');
    // JSON body with demo flag, or raw audio bytes
    if (ctype.includes('octet-stream')) {
      const buf = await readBodyRaw(req);
      try { return json(res, 200, await assembly.analyseFromAudio(buf)); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    const b = await readBody(req);
    if (b.demo) {
      const f = path.join(ROOT, 'assets', 'demo-patient.mp3');
      if (!fs.existsSync(f)) return json(res, 404, { error: 'demo clip missing' });
      try { return json(res, 200, await assembly.analyseFromAudio(fs.readFileSync(f))); }
      catch (e) { return json(res, 500, { error: e.message }); }
    }
    return json(res, 400, { error: 'provide {demo:true} or raw audio' });
  }

  /* ================= ALERTS ================= */
  if (req.method === 'GET' && p === '/api/alerts') return json(res, 200, store.listAlerts());

  /* ================= SENIOR: update profile ================= */
  if (req.method === 'POST' && p.startsWith('/api/seniors/') ) {
    const senior = store.getSenior(p.split('/')[3]);
    if (!senior) return json(res, 404, { error: 'not found' });
    const body = await readBody(req);
    const updated = store.updateSenior(senior.id, body);
    return json(res, 200, updated);
  }

  /* ================= SENIOR: memory (what AASHA remembers) ================= */
  if (req.method === 'GET' && p.startsWith('/api/seniors/') && p.endsWith('/memory')) {
    const id = p.split('/')[3];
    const s = store.getSenior(id);
    return s ? json(res, 200, s.memory) : json(res, 404, { error: 'not found' });
  }

  /* ================= SENIOR: med adherence log ================= */
  if (req.method === 'GET' && p.startsWith('/api/seniors/') && p.endsWith('/meds')) {
    const id = p.split('/')[3];
    const s = store.getSenior(id);
    return s ? json(res, 200, { schedule: s.meds, log: s.medLog }) : json(res, 404, { error: 'not found' });
  }

  /* ================= SENIOR: care report (doctor-ready) ================= */
  if (req.method === 'GET' && p.startsWith('/api/seniors/') && p.endsWith('/report')) {
    const id = p.split('/')[3];
    const s = store.getSenior(id);
    if (!s) return json(res, 404, { error: 'not found' });
    const sessions = store.listSessions(id);
    const recent = sessions[0] || null;
    return json(res, 200, {
      senior: { name: s.name, age: s.age, city: s.city },
      careState: s.careState,
      memory: s.memory,
      medLog: s.medLog,
      flags: s.careState.flags,
      latestSummary: recent ? recent.summary : null,
      recentSessions: recent ? {
        startedAt: recent.startedAt, messages: recent.messages.length, flags: recent.flags, summary: recent.summary,
      } : null,
      generatedAt: new Date().toISOString(),
    });
  }

  /* ================= CHECK-INS: due today ================= */
  if (req.method === 'GET' && p === '/api/checkins/due') {
    return json(res, 200, store.dueToday());
  }

  /* ================= OVERVIEW / dashboard ================= */
  if (req.method === 'GET' && p === '/api/overview') {
    const seniors = store.listSeniors();
    const all = seniors.map(s => ({
      name: s.name, age: s.age, city: s.city, langs: s.languages,
      careState: s.careState, memory: s.memory.length, pendingAlerts: store.listAlerts().filter(a => !a.delivered && a.seniorId === s.id).length,
    }));
    return json(res, 200, {
      seniors: all,
      total: seniors.length,
      sessions: store.listSessions().length,
      alerts: store.listAlerts().length,
      dueToday: store.dueToday().length,
      time: new Date().toISOString(),
    });
  }

  return json(res, 404, { error: 'route not found', hint: 'see README' });
}

/* ---------- server ---------- */
const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    store.log('[server] unhandled error: ' + e.stack || e.message);
    try { json(res, 500, { error: e.message || 'error' }); } catch (_) {}
  });
});

server.listen(config.port, () => {
  const hasAI = config.ai.geminiKey || config.ai.openaiKey;
  console.log(`\n  AASHA backend  🚀`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  Local:   http://localhost:${config.port}`);
  console.log(`  Health:  http://localhost:${config.port}/health`);
  console.log(`  API:     /api/seniors · /api/sessions · POST /api/sessions/:id/message`);
  console.log(`  ─────────────────────────────────────────`);
  console.log(`  AI brain: ${hasAI ? 'LLM configured' : 'OFFLINE fallback (add AASHA_GEMINI_KEY)'}`);
  console.log(`  AssemblyAI: ${config.assembly.key ? 'key set' : 'not set (optional for STT/LeMUR)'}`);
  console.log(`  Alerts: ${config.alerts.webhookUrl ? 'webhook' : 'demo-simulated'}`);
  console.log(`  Data:   ${config.dataDir}\n`);
});

module.exports = server;
