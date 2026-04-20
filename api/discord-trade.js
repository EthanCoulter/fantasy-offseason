// Vercel serverless function — proxies trade notifications to Discord.
// The webhook URL lives ONLY as a Vercel env var (DISCORD_TRADE_WEBHOOK),
// never in the client bundle or source control. See README for setup.
//
// POST body: { fromTeam, toTeam, fromAssets, toAssets } or { test: true }
// Response always JSON; on failure it includes { error, detail } so the
// client can surface what went wrong to the commissioner.

async function parseBody(req) {
  // Vercel auto-parses JSON when Content-Type is application/json, but be
  // defensive: some runtimes leave req.body as a raw string.
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const webhook = process.env.DISCORD_TRADE_WEBHOOK;
  if (!webhook) {
    res.status(500).json({
      error: 'DISCORD_TRADE_WEBHOOK env var not set on Vercel',
      detail: 'Add it under Project → Settings → Environment Variables (Production/Preview/Development) and redeploy.',
    });
    return;
  }

  try {
    const body = await parseBody(req);
    const { fromTeam, toTeam, fromAssets, toAssets, test } = body;

    let content;
    if (test) {
      // Test ping for the commissioner — proves the chain end-to-end
      content = '🧪 **Fantasy League webhook test** — if you see this, alerts are wired up correctly.';
    } else {
      if (!fromTeam || !toTeam) {
        res.status(400).json({ error: 'missing team names', detail: 'Expected fromTeam and toTeam in the POST body.' });
        return;
      }
      const fmt = (assets) =>
        (assets || [])
          .map(a => (a && a.type === 'pick' ? a.label : `${a?.name} (${a?.position})`))
          .join(', ') || '—';
      content = [
        '@everyone',
        '🚨🚨🚨 **NEW TRADE ALERT** 🚨🚨🚨',
        '',
        `**Sources:** The ${fromTeam} have traded **${fmt(fromAssets)}** to the ${toTeam} in exchange for **${fmt(toAssets)}**.`,
        '',
        'More details as they become available.',
      ].join('\n');
    }

    const discordResp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: test ? [] : ['everyone'] },
      }),
    });

    if (!discordResp.ok) {
      const text = await discordResp.text();
      console.error('Discord webhook failed:', discordResp.status, text);
      res.status(502).json({
        error: `discord rejected the webhook (${discordResp.status})`,
        detail: text.slice(0, 400),
      });
      return;
    }

    res.status(200).json({ ok: true, test: !!test });
  } catch (e) {
    console.error('discord-trade handler error:', e);
    res.status(500).json({ error: 'internal error', detail: String(e?.message || e) });
  }
}
