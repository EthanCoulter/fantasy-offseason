// Vercel serverless function — proxies trade notifications to Discord.
// The webhook URL lives ONLY as a Vercel env var (DISCORD_TRADE_WEBHOOK),
// never in the client bundle or source control. See README for setup.
//
// POST body: { fromTeam, toTeam, fromAssets, toAssets } or { test: true }
// Response always JSON; on failure it includes { error, detail } so the
// client can surface what went wrong to the commissioner.
//
// Two safety guarantees the Discord message body always enforces:
//   1. URL stripping — sanitize() removes anything URL-shaped from every
//      user-supplied field before it's rendered into the message. Even if
//      a team/player name somehow contained http:// or discord.com/..., it
//      would be neutered before hitting Discord.
//   2. Embed suppression — the 1 << 2 (SUPPRESS_EMBEDS) flag tells Discord
//      not to unfurl any link preview, so even an accidental bare URL in
//      a player name can't render as a clickable card.
//
// The webhook URL itself is never in req.body, never echoed in responses,
// never sent to Discord. It only exists in process.env on the Vercel box.

async function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body); } catch { return {}; }
}

// Strip anything URL-shaped from a user-supplied string before putting it
// into a Discord message. Belt and suspenders: even if someone's team name
// was "Evil Team http://..." the message body stays clean.
function sanitize(s) {
  if (s == null) return '';
  return String(s)
    .replace(/https?:\/\/\S+/gi, '[link removed]')
    .replace(/discord(app)?\.com\/api\/webhooks\/\S+/gi, '[link removed]')
    // collapse markdown that could escape into a URL: backticks, pipes, etc. don't
    // need stripping — but bare @ mentions could ping other users, so tame them.
    .replace(/@(everyone|here)/gi, '@\u200b$1'); // keep only the explicit payload mention
}

function fmtAssets(assets) {
  return (assets || [])
    .map(a => (a && a.type === 'pick'
      ? sanitize(a.label)
      : `${sanitize(a?.name)} (${sanitize(a?.position)})`))
    .join(', ') || '—';
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
    let mention = [];
    if (test) {
      content = '🧪 **Fantasy League webhook test** — if you see this, alerts are wired up correctly.';
    } else {
      if (!fromTeam || !toTeam) {
        res.status(400).json({ error: 'missing team names', detail: 'Expected fromTeam and toTeam in the POST body.' });
        return;
      }
      const fromClean = sanitize(fromTeam);
      const toClean = sanitize(toTeam);
      content = [
        '@everyone',
        '🚨🚨🚨 **NEW TRADE ALERT** 🚨🚨🚨',
        '',
        `**Sources:** The ${fromClean} have traded **${fmtAssets(fromAssets)}** to the ${toClean} in exchange for **${fmtAssets(toAssets)}**.`,
        '',
        'More details as they become available.',
      ].join('\n');
      mention = ['everyone'];
    }

    const discordResp = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        // Consistent bot identity — users see "Jay Scheftinderjeet",
        // not the raw webhook default name.
        username: 'Jay Scheftinderjeet',
        // SUPPRESS_EMBEDS = 1 << 2. Blocks Discord from unfurling any URL
        // that might slip through (though sanitize() already stripped them).
        flags: 1 << 2,
        allowed_mentions: { parse: mention },
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
