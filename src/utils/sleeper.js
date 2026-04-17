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

export async function fetchPlayerDB() {
  const CACHE_KEY = 'sleeperPlayers_v3';
  const cached = sessionStorage.getItem(CACHE_KEY);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) {}
  }
  const data = await sleeperGet('/players/nfl');
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) {}
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
