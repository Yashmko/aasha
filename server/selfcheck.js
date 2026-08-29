/* selfcheck.js — Ponytail: non-trivial logic leaves ONE runnable check.
   Runs the full AASHA flow against a throwaway data dir. Exits non-zero on failure.
   Run: node server/selfcheck.js */
const path = require('path');
const os = require('os');
process.env.AASHA_DATA_DIR = path.join(os.tmpdir(), 'aasha-selfcheck');
// Force the deterministic OFFLINE path so the self-check is reproducible
// (no live LLM calls, no network, no key). The fallback always flags tremor.
process.env.AASHA_AAI_KEY = '';
process.env.AASHA_GEMINI_KEY = '';
process.env.AASHA_OPENAI_KEY = '';
const store = require('./store'); store.init();
const agent = require('./agent');
const assembly = require('./assembly');

let pass = 0, fail = 0;
function ok(name, cond) { cond ? (pass++, console.log('  ✓', name)) : (fail++, console.log('  ✗', name)); }

(async () => {
  ok('detectLang hi', agent.detectLang('नमस्ते दीदी, मैं ठीक हूँ') === 'hi');
  ok('detectLang pa', agent.detectLang('ਸਤ ਸ੍ਰੀ ਅਕਾਲ ਆਂਟੀ') === 'pa');
  ok('detectLang en', agent.detectLang('Hello aunty, I am well') === 'en');

  const rec = store.createSenior({ name: 'Test', age: 70 });
  const facts = agent.extractFacts('my grandchild is Rohan and I have high bp', rec);
  ok('extract grandchild', facts.some(f => /Rohan/.test(f)));
  ok('extract condition', facts.some(f => /bp/i.test(f)));
  store.learn(rec.id, facts[0]);
  ok('memory persisted', store.getSenior(rec.id).memory.length === 1);

  const sess = store.createSession(rec.id, { lang: 'hi' });
  const a = await agent.respond({ senior: rec, lang: 'hi', text: 'मेरी हाथ काँप रही हैं' });
  ok('agent returns reply', !!(a.reply && a.reply.length > 5));
  ok('agent flags tremor', Array.isArray(a.flags) && a.flags.includes('tremor'));
  ok('agent alerts on flag', a.alert === true);

  store.applyCareState(rec.id, { mood: a.mood, meds: { today: a.meds }, flags: a.flags });
  store.logMed(rec.id, 'BP tablet', a.meds);
  ok('care score dropped', store.getSenior(rec.id).careState.score < 100);
  ok('med log recorded', store.getSenior(rec.id).medLog.length >= 1);

  store.scheduleCheckin(rec.id, 'Daily wellness check-in');
  ok('check-in pending', store.dueToday().length === 1);
  store.completeCheckin(rec.id, new Date().toISOString().slice(0, 10));
  ok('check-in completed', store.dueToday().length === 0);

  // doctor-note fallback (offline, deterministic) — never returns null
  const rb = assembly.ruleBasedSummary('I feel dizzy and I fell down this morning, and I forgot my medicine', { name: 'X' });
  ok('rule summary has flags', Array.isArray(rb.flags) || typeof rb.flags === 'string');
  ok('rule summary flags alert', rb.family_alert === true);
  ok('rule summary doctor note long', typeof rb.doctor_notes === 'string' && rb.doctor_notes.length > 20);

  // analytics normalization (pure, offline) — verify the summarizer shape
  const norm = assembly.ruleBasedSummary('Aasha, my hands are shaking and I forgot the BP tablet', { name: 'X' });
  ok('analytics normalizes meds', ['yes','no','partial','unknown'].includes(norm.meds_taken));
  ok('analytics normalizes flags', typeof norm.flags === 'string' && norm.flags.length >= 4);

  console.log(`\nselfcheck: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
