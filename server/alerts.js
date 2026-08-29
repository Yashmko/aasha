/* ============================================================
   alerts.js — deliver family alerts across channels.
   Extensible: webhook (generic), Twilio WhatsApp (optional).
   Records delivery into the store. Returns delivery info.
   ============================================================ */
const config = require('./config');
const store = require('./store');

/**
 * Send an alert and record it.
 * @param {object} params { seniorId, sessionId, reason, summary, detail }
 */
async function send({ seniorId, sessionId, reason, seniorName, detail = {} }) {
  let record;
  try { record = store.recordAlert(seniorId, sessionId, reason, detail); }
  catch (e) { record = { id: 'alert-' + Date.now() }; }
  store.log(`[alert] ${record.id} · ${seniorName || seniorId} · ${reason}`);

  const deliveries = [];

  // Channel 1: generic webhook (e.g. Slack, Waypoint, a phone app)
  if (config.alerts.webhookUrl) {
    try {
      await fetch(config.alerts.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'aasha.family_alert',
          senior: seniorName || seniorId,
          reason,
          summary: detail.summary || '',
          at: new Date().toISOString(),
        }),
      });
      deliveries.push({ channel: 'webhook', ok: true });
    } catch (e) {
      store.log('[alert] webhook failed: ' + e.message);
      deliveries.push({ channel: 'webhook', ok: false, error: e.message });
    }
  }

  // Channel 2: Twilio WhatsApp (optional) to the configured family number
  if (config.phone.provider === 'twilio' && config.alerts.twilioWhatsappFrom && config.alerts.familyNumber) {
    try {
      const tw = require('https');
      const payload = new URLSearchParams({
        To: config.alerts.familyNumber,
        From: config.alerts.twilioWhatsappFrom,
        Body: `🚨 AASHA: ${seniorName || 'your parent'} · ${reason}\n\n${detail.summary || ''}`,
      });
      const sid = config.phone.twilioAccountSid;
      const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
      const auth = Buffer.from(sid + ':' + config.phone.twilioAuthToken).toString('base64');
      const res = await fetch(url, { method: 'POST', headers: { Authorization: 'Basic ' + auth, 'Content-Type': 'application/x-www-form-urlencoded' }, body: payload.toString() });
      deliveries.push({ channel: 'twilio-whatsapp', ok: res.ok, status: res.status });
    } catch (e) {
      store.log('[alert] twilio failed: ' + e.message);
      deliveries.push({ channel: 'twilio-whatsapp', ok: false, error: e.message });
    }
  }

  if (deliveries.length === 0) {
    // No channel configured — still mark it as "would be sent" for the demo UI.
    deliveries.push({ channel: 'demo-ui', ok: true, simulated: true });
  }

  return { id: record.id, deliveries };
}

module.exports = { send };
