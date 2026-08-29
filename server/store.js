/* ============================================================
   store.js — lightweight JSON persistence (zero dependencies).
   Stores seniors, sessions, messages, care-state, alerts.
   Data lives in ./data (configurable via AASHA_DATA_DIR).
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

const DB_FILE = path.join(config.dataDir, 'aasha.json');
const LOG_FILE = path.join(config.dataDir, 'aasha.log');

let db = null;

function ensureDirs() {
  if (!fs.existsSync(config.dataDir)) fs.mkdirSync(config.dataDir, { recursive: true });
}

function load() {
  ensureDirs();
  if (fs.existsSync(DB_FILE)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    } catch (e) {
      console.warn('[store] corrupted db, starting fresh:', e.message);
      db = null;
    }
  }
  if (!db) {
    db = {
      seniors: {},    // id -> senior
      sessions: {},   // id -> session
      alerts: [],     // list of alert records
      meta: { createdAt: now() },
    };
    // seed a demo senior so the API is instantly usable
    seedSenior(config.defaultSenior);
    persist();
  }
  normalize();
}

function seedSenior(s) {
  const id = slug(s.name) + '-' + crypto.randomBytes(2).toString('hex');
  db.seniors[id] = normalizeSenior({
    id, createdAt: now(),
    memory: [], medLog: [], checkins: [],
    careState: { mood: null, lastMoods: [], meds: {}, flags: [], score: 100 },
    ...s,
  });
  return db.seniors[id];
}

function persist() {
  ensureDirs();
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
  catch (e) { console.warn('[store] persist failed:', e.message); }
}

// Ensure every senior has the full shape (guards old/normalized records).
function normalizeSenior(s) {
  if (!s) return s;
  s.careState = s.careState || { mood: null, lastMoods: [], meds: {}, flags: [], score: 100 };
  s.memory = s.memory || [];
  s.medLog = s.medLog || [];
  s.checkins = s.checkins || [];
  return s;
}
function normalize() {
  Object.values(db.seniors || {}).forEach(normalizeSenior);
}

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try { fs.appendFileSync(LOG_FILE, line); } catch (e) {}
  if (config.env === 'development') process.stdout.write(line);
}

// --- helpers ---
function now() { return new Date().toISOString(); }
function slug(s) { return (s || 'aasha').toLowerCase().replace(/[^a-z0-9]+/g, '-'); }
function uid(prefix) { return (prefix || 'x') + '-' + crypto.randomBytes(6).toString('hex'); }

// --- public API ---
module.exports = {
  init: load,
  persist,
  log,

  createSenior(senior) {
    const rec = { id: uid('sen'), createdAt: now(), ...senior,
      careState: { mood: null, lastMoods: [], meds: {}, flags: [], score: 100 },
      memory: senior.memory || [],   // persistent learnings (AASHA remembers)
      medLog: senior.medLog || [],   // daily adherence log [{day, med, status}]
      checkins: senior.checkins || [] }; // scheduled check-in records
    db.seniors[rec.id] = rec; persist(); return rec;
  },
  getSenior(id) { return normalizeSenior(db.seniors[id] || null); },
  listSeniors() { return Object.values(db.seniors).map(normalizeSenior); },
  updateSenior(id, patch) {
    const s = db.seniors[id]; if (!s) return null;
    Object.assign(s, patch, { id, createdAt: s.createdAt }); persist(); return s;
  },
  // AASHA learns a fact about the senior and remembers it across calls.
  learn(id, fact) {
    const s = db.seniors[id]; if (!s) return null;
    const tr = (fact || '').trim();
    if (!tr) return s;
    if (!s.memory.some(m => m.text === tr)) s.memory.push({ text: tr, at: now() });
    if (s.memory.length > 40) s.memory = s.memory.slice(-40);
    persist(); return s;
  },
  // record a med-adherence event for a given day
  logMed(id, med, status) {
    const s = db.seniors[id]; if (!s) return null;
    const day = new Date().toISOString().slice(0, 10);
    s.medLog = (s.medLog || []).filter(m => !(m.day === day && m.med === med));
    s.medLog.push({ day, med, status, at: now() });
    persist(); return s;
  },
  // A scheduled check-in for today (daily "call AASHA makes")
  scheduleCheckin(id, note = 'Daily wellness check-in') {
    const s = db.seniors[id]; if (!s) return null;
    const day = new Date().toISOString().slice(0, 10);
    if ((s.checkins || []).some(c => c.day === day && c.status === 'pending')) return s; // no dup for today
    s.checkins.push({ day, note, status: 'pending', at: now() });
    persist(); return s;
  },
  completeCheckin(id, day) {
    const s = db.seniors[id]; if (!s) return null;
    (s.checkins || []).forEach(c => { if (c.day === day) c.status = 'done'; });
    persist(); return s;
  },
  // due (pending) check-ins across seniors, for the today list
  dueToday() {
    const day = new Date().toISOString().slice(0, 10);
    return Object.values(db.seniors).map(s => ({
      seniorId: s.id, name: s.name, lang: s.languages?.[0] || 'en',
      checkin: (s.checkins || []).find(c => c.day === day),
    })).filter(x => x.checkin && x.checkin.status === 'pending');
  },

  createSession(seniorId, meta = {}) {
    const senior = db.seniors[seniorId];
    if (!senior) throw new Error('unknown senior: ' + seniorId);
    const sess = {
      id: uid('sess'),
      seniorId,
      channel: meta.channel || 'app',
      lang: meta.lang || 'en',
      startedAt: now(),
      endedAt: null,
      messages: [],      // [{role, text, ts}]
      lastReply: null,
      flags: [],
      summary: null,     // doctor-ready summary
    };
    db.sessions[sess.id] = sess; persist(); return sess;
  },
  getSession(id) { return db.sessions[id] || null; },
  listSessions(seniorId) {
    return Object.values(db.sessions)
      .filter(s => !seniorId || s.seniorId === seniorId)
      .sort((a, b) => a.startedAt < b.startedAt ? 1 : -1);
  },
  appendMessage(sessionId, msg) {
    const s = db.sessions[sessionId]; if (!s) return null;
    s.messages.push({ ...msg, ts: now() });
    if (msg.role === 'assistant') s.lastReply = msg.text;
    persist(); return s;
  },
  setFlag(sessionId, flag) {
    const s = db.sessions[sessionId]; if (!s) return null;
    if (!s.flags.includes(flag)) { s.flags.push(flag); persist(); }
    return s;
  },
  setSummary(sessionId, summary) {
    const s = db.sessions[sessionId]; if (!s) return null;
    s.summary = summary; persist(); return s;
  },
  endSession(sessionId) {
    const s = db.sessions[sessionId]; if (!s) return null;
    s.endedAt = now(); persist(); return s;
  },

  // update a senior's rolling care-state from a session
  applyCareState(seniorId, careDelta) {
    const senior = db.seniors[seniorId]; if (!senior) return;
    const cs = senior.careState;
    if (typeof careDelta.mood === 'number') {
      cs.mood = careDelta.mood;
      cs.lastMoods.push(careDelta.mood);
      if (cs.lastMoods.length > 10) cs.lastMoods = cs.lastMoods.slice(-10);
    }
    if (careDelta.meds && typeof careDelta.meds === 'object') {
      cs.meds = { ...cs.meds, ...careDelta.meds };
    } else if (typeof careDelta.meds === 'string') {
      cs.meds = { ...cs.meds, today: careDelta.meds };
    }
    if (Array.isArray(careDelta.flags)) {
      careDelta.flags.forEach(f => { if (!cs.flags.includes(f)) cs.flags.push(f); });
    }
    // simple score: mood*0.6 + meds bonus, minus flag penalties
    cs.score = scoreFrom(cs);
    persist();
    return senior;
  },

  recordAlert(seniorId, sessionId, reason, detail = {}) {
    const rec = { id: uid('alert'), seniorId, sessionId, reason, detail, at: now(), delivered: false };
    db.alerts.push(rec); persist(); return rec;
  },
  listAlerts() { return db.alerts.slice().reverse(); },
};

function scoreFrom(cs) {
  let sc = 60;
  if (typeof cs.mood === 'number') sc += (cs.mood / 10) * 30;
  const medsVals = Object.values(cs.meds);
  const okMeds = medsVals.filter(v => v === 'yes').length;
  sc += (medsVals.length ? (okMeds / medsVals.length) * 10 : 10);
  sc -= (Array.isArray(cs.flags) ? cs.flags.length : 0) * 8;
  return Math.max(0, Math.min(100, Math.round(sc)));
}
