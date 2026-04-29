const BASE = 'https://api.sleeper.app/v1';

async function sleeperGet(path) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`Sleeper API error ${res.status} on ${path}`);
  return res.json();
}

export async function fetchAllLeagueData(leagueId) {
  const [league, rosters, users] = await Promise.all([
    sleeperGet(`/league/${leagueId}`),
    sleeperGet(`/league/${leagueId}/rosters`),
    sleeperGet(`/league/${leagueId}/users`),
  ]);

  const userMap = {};
  users.forEach(u => { userMap[u.user_id] = u; });

  const teams = rosters.map(roster => {
    const user = userMap[roster.owner_id] || {};
    return {
      rosterId: roster.roster_id,
      ownerId: roster.owner_id,
      teamName: user.metadata?.team_name || user.display_name || `Team ${roster.roster_id}`,
      avatar: user.avatar ? `https://sleepercdn.com/avatars/thumbs/${user.avatar}` : null,
      displayName: user.display_name || `Manager ${roster.roster_id}`,
      players: roster.players || [],
      wins: roster.settings?.wins || 0,
      losses: roster.settings?.losses || 0,
      fpts: (roster.settings?.fpts || 0) + ((roster.settings?.fpts_decimal || 0) / 100),
    };
  });

  teams.sort((a, b) => b.wins - a.wins || b.fpts - a.fpts);
  return { league, teams };
}

// `/players/nfl` is several MB and Sleeper's docs ask callers to keep the
// fetch to "once per day at most." Sleeper updates ADP (the `search_rank`
// field every page in this app sorts by) at most a few times per day,
// so a 24h cache picks up their changes "at least once per day" without
// thrashing their servers.
//
// localStorage (not sessionStorage) so the cache survives tab restarts —
// otherwise a user who keeps a draft room open across days would never
// re-fetch, and a user who closes/reopens their tab mid-day would pay
// the multi-MB download every time. Storing `fetchedAt` alongside the
// payload lets us bust the cache deterministically once 24h elapse.
const PLAYERS_CACHE_KEY = 'sleeperPlayers_v4';
const PLAYER_DB_TTL_MS = 24 * 60 * 60 * 1000;

export async function fetchPlayerDB() {
  try {
    const cached = localStorage.getItem(PLAYERS_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      const fresh = parsed?.fetchedAt &&
        Date.now() - parsed.fetchedAt < PLAYER_DB_TTL_MS;
      if (fresh && parsed.data) return parsed.data;
    }
  } catch (e) { /* fall through to network fetch */ }

  const data = await sleeperGet('/players/nfl');
  try {
    localStorage.setItem(
      PLAYERS_CACHE_KEY,
      JSON.stringify({ data, fetchedAt: Date.now() })
    );
  } catch (e) {
    // Quota exceeded is the only realistic failure here. The fetch
    // succeeded so we still return live data — we just lose the cache.
  }
  return data;
}

// Fetches traded picks from Sleeper for a league.
// Returns an array of { season, round, originalRosterId, currentRosterId, previousRosterId }
export async function fetchTradedPicks(leagueId) {
  const data = await sleeperGet(`/league/${leagueId}/traded_picks`);
  return (data || []).map(p => ({
    season: String(p.season),
    round: p.round,
    originalRosterId: p.roster_id,
    currentRosterId: p.owner_id,
    previousRosterId: p.previous_owner_id,
  }));
}
