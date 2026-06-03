/**
 * Vercel Serverless Function — Meta Conversions API
 * /api/meta-conversions.js
 * Env vars configuradas no Vercel:
 *   META_PIXEL_ID              = 973466768729401
 *   META_CONVERSIONS_API_TOKEN = <encrypted>
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.tocaconcierge.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const PIXEL_ID     = process.env.META_PIXEL_ID;
  const ACCESS_TOKEN = process.env.META_CONVERSIONS_API_TOKEN;

  if (!PIXEL_ID || !ACCESS_TOKEN) {
    console.error('[metaConversionsAPI] Env vars ausentes:', { PIXEL_ID: !!PIXEL_ID, ACCESS_TOKEN: !!ACCESS_TOKEN });
    return res.status(500).json({ error: 'Configuracao incompleta no servidor' });
  }

  const {
    event_name       = 'PageView',
    event_time       = Math.floor(Date.now() / 1000),
    event_source_url = 'https://www.tocaconcierge.app',
    user_data        = {},
    custom_data      = {}
  } = req.body || {};

  async function sha256(str) {
    if (!str) return undefined;
    const data    = new TextEncoder().encode(str.toLowerCase().trim());
    const hashBuf = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const hashedUserData = {
    ...(user_data.em  ? { em:  await sha256(user_data.em)  } : {}),
    ...(user_data.ph  ? { ph:  await sha256(user_data.ph)  } : {}),
    ...(user_data.fbc ? { fbc: user_data.fbc               } : {}),
    ...(user_data.fbp ? { fbp: user_data.fbp               } : {}),
    client_ip_address: req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress,
    client_user_agent: req.headers['user-agent'],
  };

  const payload = {
    data: [{
      event_name,
      event_time,
      event_source_url,
      action_source: 'website',
      user_data:    hashedUserData,
      custom_data,
    }],
  };

  try {
    const metaUrl  = `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`;
    const response = await fetch(metaUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    const json = await response.json();
    if (!response.ok) {
      console.error('[metaConversionsAPI] Erro da Meta API:', json);
      return res.status(response.status).json({ error: json });
    }
    console.log(`[metaConversionsAPI] OK | PixelID: ${PIXEL_ID} | Evento: ${event_name}`);
    return res.status(200).json({ success: true, events_received: json.events_received });
  } catch (err) {
    console.error('[metaConversionsAPI] Erro interno:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
