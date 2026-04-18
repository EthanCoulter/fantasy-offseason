// Vercel serverless function — proxies trade notifications to Discord.
// The webhook URL lives ONLY as a Vercel env var (DISCORD_TRADE_WEBHOOK),
// never in the client bundle or source control. See README for setup.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const webhook = process.env.DISCORD_TRADE_WEBHOOK;
  if (!webhook) {
    // Fail soft — the trade itself still succeeds, we just skip the alert.
    res.status(500).json({ error: 'DISCORD_TRADE_WEBHOOK not configured' });
    return;
  }

  try {
    const { fromTeam, toTeam, fromAssets, toAssets } = req.body || {};
    if (!fromTeam || !toTeam) {
      res.status(400).json({ error: 'missing team names' });
      return;
    }

    const fmt = (assets) =>
      (assets || [])
        .map(a => (a && a.type === 'pick' ? a.label : `${a?.name} (${a?.position})`))
        .join(', ') || '—';

    const content = [
      '@everyone',
      '🚨🚨🚨 **NEW TRADE ALERT** 🚨🚨🚨',
      '',
      `**Sources:** The ${fromTeam} have traded **${fmt(fromAssets)}** to the ${toTeam} in exchange for **${fmt(toAssets)}**.`,
      '',
      'More details as they become available.',
    ].join('\n');

    const discordResp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: ['everyone'] },
      }),
    });

    if (!discordResp.ok) {
      const text = await discordResp.text();
      console.error('Discord webhook failed:', discordResp.status, text);
      res.status(502).json({ error: 'discord rejected the webhook' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (e) {
    console.error('discord-trade handler error:', e);
    res.status(500).json({ error: 'internal error' });
  }
}
