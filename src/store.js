import { create } from 'zustand';
import { supabase, TABLES } from './utils/supabase';

export const LEAGUE_ID = '1250556742954135552';
export const ROUNDS = 11;
export const YEARS = [2026, 2027];
export const BASE_OFFENSE_KEEPERS = 5;
export const BASE_DEFENSE_KEEPERS = 1;
export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'FB'];
export const COMMISSIONER_PASSWORD = 'commish2024';

// Per-team keeper-position overrides. Dual-threat players (e.g. Travis Hunter)
// are Sleeper-coded by their primary offensive slot, but a manager may use
// them as a defensive keeper. Match by team display name + player full name,
// both case-insensitive.
export const KEEPER_POSITION_OVERRIDES = [
  { teamDisplayName: 'BrendanWalsh10', playerName: 'Travis Hunter', treatAs: 'DEF' },
];

export function isOffensive(position) {
  return OFFENSE_POSITIONS.includes(position);
}

// Effective keeper-side classification for a player on a given team.
// Returns true if the player counts as offensive for keeper-slot math.
export function isOffensiveForTeam(player, team) {
  if (!player) return false;
  const overrides = KEEPER_POSITION_OVERRIDES;
  const teamName = (team?.displayName || '').toLowerCase();
  const playerName = (
    player.full_name ||
    `${player.first_name || ''} ${player.last_name || ''}`.trim() ||
    player.name ||
    ''
  ).toLowerCase();
  const override = overrides.find(
    o =>
      teamName === o.teamDisplayName.toLowerCase() &&
      playerName === o.playerName.toLowerCase()
  );
  if (override) return override.treatAs === 'OFF';
  return isOffensive(player.position);
}

export function validateTrade(sideA, sideB) {
  const errors = [];
  const currentYear = YEARS[0];

  if (sideA.length === 0) errors.push('You must send at least one asset');
  if (sideB.length === 0) errors.push('You must receive at least one asset');

  // Players + current-year (2026) picks must balance as a combined total count
  const aCurrentCount =
    sideA.filter(a => a.type === 'player').length +
    sideA.filter(a => a.type === 'pick' && a.year === currentYear).length;
  const bCurrentCount =
    sideB.filter(a => a.type === 'player').length +
    sideB.filter(a => a.type === 'pick' && a.year === currentYear).length;

  if (aCurrentCount !== bCurrentCount) {
    errors.push(
      `Players and ${currentYear} picks must balance in total — Side A has ${aCurrentCount}, Side B has ${bCurrentCount}`
    );
  }

  // Future-year picks must be balanced pick-for-pick per year
  const futureYears = YEARS.filter(y => y !== currentYear);
  futureYears.forEach(year => {
    const aCount = sideA.filter(a => a.type === 'pick' && a.year === year).length;
    const bCount = sideB.filter(a => a.type === 'pick' && a.year === year).length;
    if (aCount !== bCount) {
      errors.push(`${year} picks must be balanced — Side A has ${aCount}, Side B has ${bCount}`);
    }
  });

  return { valid: errors.length === 0, errors };
}

export function calculateSlotImpact(sent, received, myTeam) {
  const sentPlayers = sent.filter(a => a.type === 'player');
  const receivedPlayers = received.filter(a => a.type === 'player');
  // Classify using the evaluating team's overrides so dual-position keepers
  // (e.g. Travis Hunter on a roster that uses him as DEF) count correctly.
  const classify = (p) => {
    if (!myTeam) return isOffensive(p.position);
    const first = (p.name || '').split(' ')[0] || '';
    const last = (p.name || '').split(' ').slice(1).join(' ') || '';
    return isOffensiveForTeam(
      { ...p, full_name: p.name, first_name: first, last_name: last },
      myTeam
    );
  };
  const sentOff = sentPlayers.filter(classify).length;
  const sentDef = sentPlayers.length - sentOff;
  const recvOff = receivedPlayers.filter(classify).length;
  const recvDef = receivedPlayers.length - recvOff;
  return {
    offenseBurned: Math.max(0, sentOff - recvOff),
    defenseBurned: Math.max(0, sentDef - recvDef),
  };
}

// Derive bonus-keeper players per roster from accepted trade history.
// Rule: if a roster RECEIVED more players than it SENT in a trade (i.e. traded
// picks for players), the "excess" received player(s) become bonus-locked
// keepers for that roster. If a bonus player is later traded away, they're
// removed from that roster's bonus list. No new bonus is created by even
// player-for-player swaps.
export function deriveBonusPlayers(teams, trades) {
  const bonus = {};
  (teams || []).forEach(t => { bonus[t.rosterId] = []; });

  (trades || [])
    .filter(t => t && t.status === 'accepted')
    .slice()
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach(trade => {
      const fromSent = (trade.fromAssets || []).filter(a => a.type === 'player');
      const toSent = (trade.toAssets || []).filter(a => a.type === 'player');
      const fromReceived = toSent;
      const toReceived = fromSent;

      // First: sent players leave each roster → drop them from bonus list
      fromSent.forEach(p => {
        bonus[trade.fromRosterId] = (bonus[trade.fromRosterId] || []).filter(id => id !== p.id);
      });
      toSent.forEach(p => {
        bonus[trade.toRosterId] = (bonus[trade.toRosterId] || []).filter(id => id !== p.id);
      });

      // Then: side with net player gain locks the "extra" received player(s)
      const fromNet = fromReceived.length - fromSent.length;
      if (fromNet > 0) {
        const extras = fromReceived.slice(-fromNet).map(p => p.id);
        bonus[trade.fromRosterId] = [
          ...(bonus[trade.fromRosterId] || []),
          ...extras.filter(id => !(bonus[trade.fromRosterId] || []).includes(id)),
        ];
      }
      const toNet = toReceived.length - toSent.length;
      if (toNet > 0) {
        const extras = toReceived.slice(-toNet).map(p => p.id);
        bonus[trade.toRosterId] = [
          ...(bonus[trade.toRosterId] || []),
          ...extras.filter(id => !(bonus[trade.toRosterId] || []).includes(id)),
        ];
      }
    });

  return bonus;
}

// Fire-and-forget Schefter-style Discord notification for an accepted trade.
// The actual webhook URL is held server-side as a Vercel env var and POSTed
// from /api/discord-trade — never exposed to the client bundle or git.
// Failures are swallowed; a down webhook never blocks the trade itself.
export async function notifyDiscordTrade(trade, teams) {
  try {
    if (!trade || !teams) return { ok: false, error: 'missing trade or teams' };
    const fromTeam = teams.find(t => t.rosterId === trade.fromRosterId);
    const toTeam = teams.find(t => t.rosterId === trade.toRosterId);
    const fromName = fromTeam?.teamName || fromTeam?.displayName || 'Unknown';
    const toName = toTeam?.teamName || toTeam?.displayName || 'Unknown';

    const resp = await fetch('/api/discord-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fromTeam: fromName,
        toTeam: toName,
        fromAssets: trade.fromAssets,
        toAssets: trade.toAssets,
      }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.warn('Discord trade notification failed:', resp.status, data);
      return { ok: false, status: resp.status, error: data.error, detail: data.detail };
    }
    return { ok: true };
  } catch (e) {
    console.warn('Discord trade notification failed:', e);
    return { ok: false, error: String(e?.message || e) };
  }
}

// Commissioner-facing sanity check — hits the serverless endpoint with a
// test payload and returns what actually happened so the UI can show a
// diagnostic message instead of silently failing.
export async function testDiscordWebhook() {
  try {
    const resp = await fetch('/api/discord-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
    const data = await resp.json().catch(() => ({}));
    return {
      ok: resp.ok,
      status: resp.status,
      error: data.error,
      detail: data.detail,
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Commissioner-facing preview — fires the FULL trade-alert rendering (same
// Schefter-style @everyone message real trades send) but with entirely fake
// team/player/pick data. No real rosters, picks, trades, or keepers are
// touched — this hits /api/discord-trade directly with a synthetic payload
// so the commish can see exactly how the channel message will look before
// the real thing goes out. Team names are prefixed "TEST —" so nobody
// reading the channel mistakes it for an actual trade.
export async function sendTestTradeAlert() {
  try {
    const payload = {
      fromTeam: 'TEST — Example Team A',
      toTeam: 'TEST — Example Team B',
      fromAssets: [
        { type: 'player', name: 'Test RB (fake)', position: 'RB' },
        { type: 'pick', label: '2026 R2.05' },
      ],
      toAssets: [
        { type: 'player', name: 'Test WR (fake)', position: 'WR' },
        { type: 'pick', label: '2026 R1.08' },
      ],
    };
    const resp = await fetch('/api/discord-trade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    return {
      ok: resp.ok,
      status: resp.status,
      error: data.error,
      detail: data.detail,
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

// Compute pick ownership for every (year, round, originalRoster) slot
// by applying Sleeper's traded_picks first, then in-app accepted trades in order.
function buildOwnership(teams, tradedPicks, inAppTrades) {
  const ownership = {};
  teams.forEach(t => {
    YEARS.forEach(y => {
      for (let r = 1; r <= ROUNDS; r++) {
        ownership[`${y}_${r}_${t.rosterId}`] = t.rosterId;
      }
    });
  });

  (tradedPicks || []).forEach(tp => {
    const key = `${tp.season}_${tp.round}_${tp.originalRosterId}`;
    if (key in ownership) ownership[key] = tp.currentRosterId;
  });

  (inAppTrades || [])
    .filter(t => t.status === 'accepted')
    .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
    .forEach(trade => {
      trade.fromAssets.filter(a => a.type === 'pick').forEach(pick => {
        const key = `${pick.year}_${pick.round}_${pick.originalRosterId ?? pick.originalPosition}`;
        if (key in ownership) ownership[key] = trade.toRosterId;
      });
      trade.toAssets.filter(a => a.type === 'pick').forEach(pick => {
        const key = `${pick.year}_${pick.round}_${pick.originalRosterId ?? pick.originalPosition}`;
        if (key in ownership) ownership[key] = trade.fromRosterId;
      });
    });

  return ownership;
}

// Given ownership map + rankings, produce teamAssets (players come from keepers).
function computeTeamAssets(teams, rankings, keepers, playerDB, ownership) {
  const teamAssets = {};
  teams.forEach(t => { teamAssets[t.rosterId] = { players: [], picks: [] }; });

  teams.forEach(t => {
    const keeperIds = keepers[t.rosterId] || [];
    teamAssets[t.rosterId].players = keeperIds.map(id => {
      const p = playerDB[id];
      return p ? {
        id, name: `${p.first_name} ${p.last_name}`,
        position: p.position, nflTeam: p.team, type: 'player',
      } : { id, name: `Unknown (${id})`, position: 'UNK', type: 'player' };
    });
  });

  const currentYear = YEARS[0];
  Object.entries(ownership).forEach(([key, currentOwner]) => {
    const [yearStr, roundStr, origStr] = key.split('_');
    const year = Number(yearStr);
    const round = Number(roundStr);
    const originalRosterId = Number(origStr);
    const isCurrentYear = year === currentYear;
    // Only the current draft year uses commissioner-assigned slot numbers.
    // Future-year picks carry only round + original-owner identity.
    const rank = isCurrentYear ? rankings[originalRosterId] : null;
    if (!teamAssets[currentOwner]) return;
    const slot = rank || null;
    const label = isCurrentYear
      ? (slot ? `${year} ${round}.${String(slot).padStart(2, '0')}` : `${year} R${round} (TBD)`)
      : `${year} R${round}`;
    teamAssets[currentOwner].picks.push({
      id: `pick_${year}_${round}_${originalRosterId}`,
      year, round,
      originalRosterId,
      currentRosterId: currentOwner,
      position: slot,
      originalPosition: slot,
      label,
      type: 'pick',
    });
  });

  teams.forEach(t => {
    teamAssets[t.rosterId].picks.sort((a, b) =>
      a.year - b.year || a.round - b.round || (a.position || 99) - (b.position || 99)
    );
  });

  return teamAssets;
}

const loadUser = () => {
  try {
    const s = localStorage.getItem('fantasy_currentUser');
    return s ? JSON.parse(s) : null;
  } catch { return null; }
};

const saveUser = (u) => {
  try {
    if (u) localStorage.setItem('fantasy_currentUser', JSON.stringify(u));
    else localStorage.removeItem('fantasy_currentUser');
  } catch {}
};

// Seconds on the clock per round. Rounds 1-4 get 120s; rounds 5+ get 60s.
export function clockSecondsForRound(round) {
  return round <= 4 ? 120 : 60;
}

// Expand current-year picks out of teamAssets into a linear draft board.
// Each entry: { pickIndex, round, slot, originalRosterId, currentRosterId }.
// Linear (non-snake): slot 1 picks first every round, slot N picks last
// every round. Only picks with a commissioner-assigned slot
// (pick.position != null) are included — slotless picks are skipped so the
// draft doesn't try to run them before the commissioner finishes assigning
// positions.
export function computeDraftOrder(teams, teamAssets, draftPositions) {
  const currentYear = YEARS[0];
  const picksFlat = [];
  Object.values(teamAssets || {}).forEach(ta => {
    (ta?.picks || []).forEach(p => {
      if (p.year === currentYear && p.position != null) picksFlat.push(p);
    });
  });
  const numSlots = teams.length || 12;
  const order = [];
  for (let round = 1; round <= ROUNDS; round++) {
    for (let slot = 1; slot <= numSlots; slot++) {
      const pick = picksFlat.find(p => p.round === round && p.position === slot);
      if (!pick) continue;
      order.push({
        round,
        slot,
        originalRosterId: pick.originalRosterId,
        currentRosterId: pick.currentRosterId,
        pickIndex: order.length,
      });
    }
  }
  return order;
}

const EMPTY_DRAFT_STATE = {
  isActive: false,
  isTrial: false,
  currentPickStartTime: null,
  picks: [], // [{ pickIndex, round, slot, rosterId, playerId, timestamp, wasAuto }]
  startedAt: null,
  endedAt: null,
};

// For a real (non-trial) draft, drafted players are added to the picking
// team's active roster so the rest of the app (Keepers list, LeaguePage,
// CSV roster export) reflects what the team actually holds post-draft.
// Trial-mode picks stay out — they're simulation-only.
function applyDraftPicksToTeams(baseTeams, draftState) {
  if (!draftState || draftState.isTrial || !(draftState.picks?.length)) return baseTeams;
  const byRoster = new Map();
  draftState.picks.forEach(p => {
    if (!p?.rosterId || !p?.playerId) return;
    if (!byRoster.has(p.rosterId)) byRoster.set(p.rosterId, []);
    byRoster.get(p.rosterId).push(p.playerId);
  });
  return baseTeams.map(t => {
    const extras = byRoster.get(t.rosterId);
    if (!extras || extras.length === 0) return t;
    const merged = new Set(t.players || []);
    extras.forEach(id => merged.add(id));
    return { ...t, players: Array.from(merged) };
  });
}

const useStore = create((set, get) => ({
  teams: [],
  // Sleeper-sourced raw roster snapshot. Never mutated after load; `teams`
  // is derived from `_baseTeams` plus any in-app augmentation (currently
  // just drafted players for non-trial drafts).
  _baseTeams: [],
  playerDB: {},
  tradedPicks: [],
  leagueLoaded: false,
  supabaseLoaded: false,

  currentUser: loadUser(),
  draftPositions: {},
  keepers: {},
  slotsBurned: {},
  bonusPlayers: {},
  trades: [],
  mockDrafts: {},
  teamAssets: {},
  draftState: EMPTY_DRAFT_STATE,
  draftOrder: [],
  // Per-manager ordered queue of player IDs. Used as the auto-pick fallback
  // when a manager times out on the clock — we walk their queue in order
  // and pick the first player who hasn't already been drafted or kept.
  // Map of rosterId (number) → ordered array of player ID strings.
  draftQueues: {},

  setLeagueData: (teams, playerDB, tradedPicks) => {
    set({
      _baseTeams: teams,
      teams,
      playerDB,
      tradedPicks: tradedPicks || [],
      leagueLoaded: true,
    });
    get().rebuildAssets();
  },

  rebuildAssets: () => {
    const state = get();
    const baseTeams = state._baseTeams.length ? state._baseTeams : state.teams;
    if (!baseTeams.length) return;
    // Fold any drafted players into rosters up front so ownership, assets,
    // and keepers UI all see the same post-draft team shapes.
    const teams = applyDraftPicksToTeams(baseTeams, state.draftState);

    const ownership = buildOwnership(teams, state.tradedPicks, state.trades);
    const bonusPlayers = deriveBonusPlayers(teams, state.trades);

    // Auto-include bonus players in each roster's keepers list (they are locked).
    const mergedKeepers = { ...state.keepers };
    Object.entries(bonusPlayers).forEach(([rid, ids]) => {
      const current = new Set(mergedKeepers[rid] || []);
      (ids || []).forEach(id => current.add(id));
      mergedKeepers[rid] = Array.from(current);
    });

    const teamAssets = computeTeamAssets(teams, state.draftPositions, mergedKeepers, state.playerDB, ownership);
    const draftOrder = computeDraftOrder(teams, teamAssets, state.draftPositions);
    set({ teams, bonusPlayers, teamAssets, draftOrder });
  },

  hydrateFromSupabase: async () => {
    try {
      const [r, k, sb, tr, md, ds, dq] = await Promise.all([
        supabase.from(TABLES.rankings).select('*'),
        supabase.from(TABLES.keepers).select('*'),
        supabase.from(TABLES.slotsBurned).select('*'),
        supabase.from(TABLES.trades).select('*').order('created_at', { ascending: false }),
        supabase.from(TABLES.mockDrafts).select('*'),
        supabase.from(TABLES.draftState).select('*').eq('id', 1).maybeSingle(),
        supabase.from(TABLES.draftQueues).select('*'),
      ]);

      const draftPositions = {};
      (r.data || []).forEach(row => { draftPositions[row.roster_id] = row.rank; });

      const keepers = {};
      (k.data || []).forEach(row => { keepers[row.roster_id] = row.player_ids || []; });

      const slotsBurned = {};
      (sb.data || []).forEach(row => {
        slotsBurned[row.roster_id] = { offense: row.offense || 0, defense: row.defense || 0 };
      });

      const trades = (tr.data || []).map(row => ({
        id: row.id,
        fromRosterId: row.from_roster_id,
        toRosterId: row.to_roster_id,
        fromAssets: row.from_assets,
        toAssets: row.to_assets,
        status: row.status,
        timestamp: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        fromSlotImpact: row.from_slot_impact,
        toSlotImpact: row.to_slot_impact,
      }));

      const mockDrafts = {};
      (md.data || []).forEach(row => {
        const all = row.picks || [];
        // mockTrade entries and pick entries share the JSONB array
        const mockTrades = all.filter(p => p && p.type === 'mockTrade');
        mockDrafts[row.roster_id] = {
          pinHash: row.pin_hash,
          picks: all, // keep raw for round-trip writes
          mockTrades,
        };
      });

      const draftState = ds?.data
        ? {
            isActive: !!ds.data.is_active,
            isTrial: !!ds.data.is_trial,
            currentPickStartTime: ds.data.current_pick_start_time
              ? new Date(ds.data.current_pick_start_time).getTime()
              : null,
            picks: ds.data.picks || [],
            startedAt: ds.data.started_at ? new Date(ds.data.started_at).getTime() : null,
            endedAt: ds.data.ended_at ? new Date(ds.data.ended_at).getTime() : null,
          }
        : EMPTY_DRAFT_STATE;

      const draftQueues = {};
      (dq?.data || []).forEach(row => {
        draftQueues[row.roster_id] = row.player_ids || [];
      });

      set({ draftPositions, keepers, slotsBurned, trades, mockDrafts, draftState, draftQueues, supabaseLoaded: true });
      get().rebuildAssets();
    } catch (e) {
      console.error('Supabase hydration failed:', e);
      set({ supabaseLoaded: true });
    }
  },

  subscribeToSupabase: () => {
    const channel = supabase
      .channel('fantasy-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.rankings }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.keepers }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.slotsBurned }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.trades }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.mockDrafts }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.draftState }, () => get().hydrateFromSupabase())
      .on('postgres_changes', { event: '*', schema: 'public', table: TABLES.draftQueues }, () => get().hydrateFromSupabase())
      .subscribe();
    return () => supabase.removeChannel(channel);
  },

  setCurrentUser: (rosterId, isCommissioner = false) => {
    const u = { rosterId, isCommissioner };
    saveUser(u);
    set({ currentUser: u });
  },
  logout: () => { saveUser(null); set({ currentUser: null }); },

  setDraftPosition: async (rosterId, position) => {
    const pos = Number(position);
    const existing = get().draftPositions;
    const conflictEntry = Object.entries(existing).find(
      ([rid, p]) => p === pos && Number(rid) !== rosterId
    );

    const newPositions = { ...existing, [rosterId]: pos };
    const writes = [{ roster_id: rosterId, rank: pos }];

    if (conflictEntry) {
      const conflictId = Number(conflictEntry[0]);
      const oldPos = existing[rosterId];
      if (oldPos) {
        newPositions[conflictId] = oldPos;
        writes.push({ roster_id: conflictId, rank: oldPos });
      } else {
        delete newPositions[conflictId];
        await supabase.from(TABLES.rankings).delete().eq('roster_id', conflictId);
      }
    }

    set({ draftPositions: newPositions });
    get().rebuildAssets();
    await supabase.from(TABLES.rankings).upsert(writes);
  },

  setAllDraftPositions: async (positions) => {
    set({ draftPositions: positions });
    get().rebuildAssets();
    const rows = Object.entries(positions).map(([rid, rank]) => ({
      roster_id: Number(rid), rank: Number(rank),
    }));
    await supabase.from(TABLES.rankings).upsert(rows);
  },

  setKeepers: async (rosterId, playerIds) => {
    // Bonus-locked players must always remain in the keepers list.
    const bonusIds = get().bonusPlayers[rosterId] || [];
    const merged = Array.from(new Set([...(playerIds || []), ...bonusIds]));
    set(s => ({ keepers: { ...s.keepers, [rosterId]: merged } }));
    get().rebuildAssets();
    await supabase.from(TABLES.keepers).upsert({ roster_id: rosterId, player_ids: merged });
  },

  getMaxKeeperSlots: (rosterId) => {
    const burned = get().slotsBurned[rosterId] || { offense: 0, defense: 0 };
    const bonusIds = get().bonusPlayers[rosterId] || [];
    const playerDB = get().playerDB;
    const team = get().teams.find(t => t.rosterId === rosterId);
    let bonusOffense = 0;
    let bonusDefense = 0;
    bonusIds.forEach(id => {
      const p = playerDB[id];
      if (!p) return;
      if (isOffensiveForTeam(p, team)) bonusOffense += 1;
      else bonusDefense += 1;
    });
    return {
      offense: Math.max(0, BASE_OFFENSE_KEEPERS - burned.offense),
      defense: Math.max(0, BASE_DEFENSE_KEEPERS - burned.defense),
      bonusOffense,
      bonusDefense,
    };
  },

  // Player IDs that are bonus-locked for this roster (cannot be toggled off).
  getBonusPlayerIds: (rosterId) => get().bonusPlayers[rosterId] || [],

  proposeTrade: async (fromRosterId, toRosterId, fromAssets, toAssets) => {
    const validation = validateTrade(fromAssets, toAssets);
    if (!validation.valid) return { success: false, errors: validation.errors };

    const { keepers } = get();
    const fromKeepers = keepers[fromRosterId] || [];
    const toKeepers = keepers[toRosterId] || [];
    const fromPlayers = fromAssets.filter(a => a.type === 'player');
    const toPlayers = toAssets.filter(a => a.type === 'player');

    for (const p of fromPlayers) {
      if (!fromKeepers.includes(p.id)) {
        return { success: false, errors: [`${p.name} is not in your keeper list`] };
      }
    }
    for (const p of toPlayers) {
      if (!toKeepers.includes(p.id)) {
        return { success: false, errors: [`${p.name} is not in their keeper list`] };
      }
    }

    const fromTeam = get().teams.find(t => t.rosterId === fromRosterId);
    const toTeam = get().teams.find(t => t.rosterId === toRosterId);
    const trade = {
      id: `trade_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fromRosterId, toRosterId, fromAssets, toAssets,
      status: 'pending', timestamp: Date.now(),
      fromSlotImpact: calculateSlotImpact(fromAssets, toAssets, fromTeam),
      toSlotImpact: calculateSlotImpact(toAssets, fromAssets, toTeam),
    };
    set(s => ({ trades: [trade, ...s.trades] }));

    await supabase.from(TABLES.trades).insert({
      id: trade.id,
      from_roster_id: trade.fromRosterId,
      to_roster_id: trade.toRosterId,
      from_assets: trade.fromAssets,
      to_assets: trade.toAssets,
      status: trade.status,
      from_slot_impact: trade.fromSlotImpact,
      to_slot_impact: trade.toSlotImpact,
    });

    return { success: true, trade };
  },

  updateTradeStatus: async (tradeId, status) => {
    const trade = get().trades.find(t => t.id === tradeId);
    if (!trade) return;

    if (status === 'accepted') {
      await get().executeTrade(tradeId);
      return;
    }

    set(s => ({
      trades: s.trades.map(t => t.id === tradeId ? { ...t, status } : t),
    }));
    await supabase.from(TABLES.trades).update({ status, updated_at: new Date().toISOString() }).eq('id', tradeId);
  },

  executeTrade: async (tradeId) => {
    const state = get();
    const trade = state.trades.find(t => t.id === tradeId);
    if (!trade) return;

    // Update keepers: transfer players
    const newKeepers = { ...state.keepers };
    const fromKeepers = [...(newKeepers[trade.fromRosterId] || [])];
    const toKeepers = [...(newKeepers[trade.toRosterId] || [])];

    trade.fromAssets.filter(a => a.type === 'player').forEach(p => {
      const i = fromKeepers.indexOf(p.id);
      if (i >= 0) fromKeepers.splice(i, 1);
      if (!toKeepers.includes(p.id)) toKeepers.push(p.id);
    });
    trade.toAssets.filter(a => a.type === 'player').forEach(p => {
      const i = toKeepers.indexOf(p.id);
      if (i >= 0) toKeepers.splice(i, 1);
      if (!fromKeepers.includes(p.id)) fromKeepers.push(p.id);
    });

    newKeepers[trade.fromRosterId] = fromKeepers;
    newKeepers[trade.toRosterId] = toKeepers;

    // Update slots burned
    const fromBurned = state.slotsBurned[trade.fromRosterId] || { offense: 0, defense: 0 };
    const toBurned = state.slotsBurned[trade.toRosterId] || { offense: 0, defense: 0 };
    const fromTeamForImpact = state.teams.find(t => t.rosterId === trade.fromRosterId);
    const toTeamForImpact = state.teams.find(t => t.rosterId === trade.toRosterId);
    const fromImpact = trade.fromSlotImpact || calculateSlotImpact(trade.fromAssets, trade.toAssets, fromTeamForImpact);
    const toImpact = trade.toSlotImpact || calculateSlotImpact(trade.toAssets, trade.fromAssets, toTeamForImpact);

    const newSlotsBurned = {
      ...state.slotsBurned,
      [trade.fromRosterId]: {
        offense: fromBurned.offense + fromImpact.offenseBurned,
        defense: fromBurned.defense + fromImpact.defenseBurned,
      },
      [trade.toRosterId]: {
        offense: toBurned.offense + toImpact.offenseBurned,
        defense: toBurned.defense + toImpact.defenseBurned,
      },
    };

    set(s => ({
      keepers: newKeepers,
      slotsBurned: newSlotsBurned,
      trades: s.trades.map(t => t.id === tradeId ? { ...t, status: 'accepted' } : t),
    }));
    get().rebuildAssets();

    await Promise.all([
      supabase.from(TABLES.trades).update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('id', tradeId),
      supabase.from(TABLES.keepers).upsert([
        { roster_id: trade.fromRosterId, player_ids: newKeepers[trade.fromRosterId] },
        { roster_id: trade.toRosterId, player_ids: newKeepers[trade.toRosterId] },
      ]),
      supabase.from(TABLES.slotsBurned).upsert([
        { roster_id: trade.fromRosterId, ...newSlotsBurned[trade.fromRosterId] },
        { roster_id: trade.toRosterId, ...newSlotsBurned[trade.toRosterId] },
      ]),
    ]);

    // Schefter-style Discord alert (fire-and-forget)
    notifyDiscordTrade(trade, state.teams);
  },

  saveMockDraft: async (rosterId, pinHash, picks) => {
    set(s => ({
      mockDrafts: {
        ...s.mockDrafts,
        [rosterId]: { pinHash, picks, mockTrades: [] },
      },
    }));
    await supabase.from(TABLES.mockDrafts).upsert({
      roster_id: rosterId, pin_hash: pinHash, picks,
    });
  },

  updateMockDraftPicks: async (rosterId, picks) => {
    const mock = get().mockDrafts[rosterId];
    if (!mock) return;
    set(s => ({ mockDrafts: { ...s.mockDrafts, [rosterId]: { ...mock, picks } } }));
    await supabase.from(TABLES.mockDrafts).update({
      picks, updated_at: new Date().toISOString(),
    }).eq('roster_id', rosterId);
  },

  // Hypothetical trades live only inside a user's mock draft board. They do
  // NOT change real keepers / pick ownership — they just re-shade the mock
  // draft slots so the user can see "what if A traded B's pick to C?"
  // Persisted by stuffing mockTrade-typed entries into the mockDrafts.picks
  // JSONB column (no schema change).
  addMockTrade: async (rosterId, mockTrade) => {
    const mock = get().mockDrafts[rosterId];
    if (!mock) return;
    const entry = { ...mockTrade, type: 'mockTrade' };
    const picks = [...(mock.picks || []), entry];
    set(s => ({ mockDrafts: { ...s.mockDrafts, [rosterId]: { ...mock, picks } } }));
    await supabase.from(TABLES.mockDrafts).update({
      picks, updated_at: new Date().toISOString(),
    }).eq('roster_id', rosterId);
  },

  removeMockTrade: async (rosterId, mockTradeId) => {
    const mock = get().mockDrafts[rosterId];
    if (!mock) return;
    const picks = (mock.picks || []).filter(
      p => !(p && p.type === 'mockTrade' && p.id === mockTradeId)
    );
    set(s => ({ mockDrafts: { ...s.mockDrafts, [rosterId]: { ...mock, picks } } }));
    await supabase.from(TABLES.mockDrafts).update({
      picks, updated_at: new Date().toISOString(),
    }).eq('roster_id', rosterId);
  },

  clearMockDraftPicks: async (rosterId) => {
    const mock = get().mockDrafts[rosterId];
    if (!mock) return;
    set(s => ({ mockDrafts: { ...s.mockDrafts, [rosterId]: { ...mock, picks: [] } } }));
    await supabase.from(TABLES.mockDrafts).update({
      picks: [], updated_at: new Date().toISOString(),
    }).eq('roster_id', rosterId);
  },

  deleteMockDraft: async (rosterId) => {
    const newMocks = { ...get().mockDrafts };
    delete newMocks[rosterId];
    set({ mockDrafts: newMocks });
    await supabase.from(TABLES.mockDrafts).delete().eq('roster_id', rosterId);
  },

  getTeam: (rosterId) => get().teams.find(t => t.rosterId === rosterId),
  getAssets: (rosterId) => get().teamAssets[rosterId] || { players: [], picks: [] },

  // ---------- DRAFT QUEUE ----------
  //
  // The queue is a manager's private ordered wishlist of players. If the
  // clock runs out (or the commissioner triggers auto-pick) we walk this
  // list in order and grab the first player who is still actually
  // available — not yet drafted, not already somebody's keeper. The raw
  // list is preserved across picks/keepers so the manager can reorder it
  // once up-front and not have to re-rank between picks; filtering is
  // done at pick time, not at storage time.

  // Replace the full queue for a roster (used for drag-and-reorder UI).
  setDraftQueue: async (rosterId, playerIds) => {
    const ids = Array.from(new Set((playerIds || []).filter(Boolean)));
    set(s => ({ draftQueues: { ...s.draftQueues, [rosterId]: ids } }));
    await supabase.from(TABLES.draftQueues).upsert({
      roster_id: rosterId,
      player_ids: ids,
      updated_at: new Date().toISOString(),
    });
  },

  // Append a player to the end of a roster's queue (no-op if already in).
  addToQueue: async (rosterId, playerId) => {
    const current = get().draftQueues[rosterId] || [];
    if (current.includes(playerId)) return;
    const next = [...current, playerId];
    await get().setDraftQueue(rosterId, next);
  },

  // Remove a player from a roster's queue.
  removeFromQueue: async (rosterId, playerId) => {
    const current = get().draftQueues[rosterId] || [];
    if (!current.includes(playerId)) return;
    const next = current.filter(id => id !== playerId);
    await get().setDraftQueue(rosterId, next);
  },

  // Swap two entries in the queue — used by the up/down buttons.
  moveInQueue: async (rosterId, fromIndex, toIndex) => {
    const current = get().draftQueues[rosterId] || [];
    if (
      fromIndex < 0 || toIndex < 0 ||
      fromIndex >= current.length || toIndex >= current.length ||
      fromIndex === toIndex
    ) return;
    const next = current.slice();
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    await get().setDraftQueue(rosterId, next);
  },

  // ---------- DRAFT ----------

  _persistDraftState: async (patch) => {
    const next = { ...get().draftState, ...patch };
    set({ draftState: next });
    // Picks / isTrial affect derived team rosters — refresh so drafted
    // players appear on (or rewind off of) their team's active roster.
    get().rebuildAssets();
    const dbRow = {
      id: 1,
      is_active: next.isActive,
      is_trial: next.isTrial,
      current_pick_start_time: next.currentPickStartTime
        ? new Date(next.currentPickStartTime).toISOString()
        : null,
      picks: next.picks || [],
      started_at: next.startedAt ? new Date(next.startedAt).toISOString() : null,
      ended_at: next.endedAt ? new Date(next.endedAt).toISOString() : null,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from(TABLES.draftState).upsert(dbRow);
    if (error) console.error('draft_state upsert failed:', error);
  },

  // Commissioner toggles. `isActive` arms the draft and exposes the manager
  // pick tab. `isTrial` marks every pick as non-committal so the simulation
  // can be wiped before the real draft.
  setDraftMode: async (isActive, isTrial) => {
    const patch = { isActive: !!isActive, isTrial: !!isTrial };
    if (isActive && !get().draftState.startedAt) {
      patch.startedAt = Date.now();
      patch.currentPickStartTime = Date.now();
      patch.endedAt = null;
    }
    if (!isActive) {
      patch.currentPickStartTime = null;
    }
    await get()._persistDraftState(patch);
  },

  // Kick the clock fresh for the current pick (used on undo / resume).
  resetPickClock: async () => {
    await get()._persistDraftState({ currentPickStartTime: Date.now() });
  },

  // Who is on the clock right now, derived from picks.length.
  getCurrentPickSlot: () => {
    const { draftOrder, draftState } = get();
    const idx = (draftState.picks || []).length;
    return draftOrder[idx] || null;
  },

  makeDraftPick: async ({ rosterId, playerId, wasAuto = false }) => {
    const { draftOrder, draftState, playerDB } = get();
    const idx = (draftState.picks || []).length;
    const slot = draftOrder[idx];
    if (!slot) return { success: false, errors: ['Draft is over'] };
    if (slot.currentRosterId !== rosterId) {
      return { success: false, errors: ['It is not your turn to pick'] };
    }
    const alreadyPicked = new Set((draftState.picks || []).map(p => p.playerId));
    if (alreadyPicked.has(playerId)) {
      return { success: false, errors: ['Player already drafted'] };
    }
    const p = playerDB[playerId];
    if (!p) return { success: false, errors: ['Unknown player'] };

    const pickEntry = {
      pickIndex: idx,
      round: slot.round,
      slot: slot.slot,
      rosterId,
      playerId,
      playerName: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
      position: p.position,
      nflTeam: p.team || null,
      timestamp: Date.now(),
      wasAuto: !!wasAuto,
    };
    const nextPicks = [...(draftState.picks || []), pickEntry];
    const isDone = nextPicks.length >= draftOrder.length;
    await get()._persistDraftState({
      picks: nextPicks,
      currentPickStartTime: isDone ? null : Date.now(),
      endedAt: isDone ? Date.now() : null,
      isActive: isDone ? false : true,
    });
    return { success: true, pick: pickEntry, isDone };
  },

  // Auto-pick for the team currently on the clock. First tries the
  // manager's own draft queue, walking it in order and picking the first
  // player who is still available. If the queue is empty or every queued
  // player is already gone, falls back to Best Player Available by
  // Sleeper's search_rank ADP. Either way the pick is tagged wasAuto so
  // the draft log shows it wasn't a manual selection.
  autoPickBPA: async () => {
    const { draftOrder, draftState, playerDB, keepers, draftQueues } = get();
    const idx = (draftState.picks || []).length;
    const slot = draftOrder[idx];
    if (!slot) return { success: false, errors: ['Draft is over'] };
    const takenIds = new Set([
      ...(draftState.picks || []).map(p => p.playerId),
      ...Object.values(keepers).flat(),
    ]);

    // 1) Try the on-the-clock manager's queue in order.
    const queue = draftQueues?.[slot.currentRosterId] || [];
    for (const pid of queue) {
      if (takenIds.has(pid)) continue;
      const p = playerDB?.[pid];
      if (!p || !p.position || p.status === 'Retired') continue;
      return get().makeDraftPick({
        rosterId: slot.currentRosterId,
        playerId: pid,
        wasAuto: true,
      });
    }

    // 2) Fall back to ADP-best undrafted player.
    const candidates = Object.entries(playerDB || {})
      .filter(([id, p]) =>
        p &&
        p.position &&
        p.status !== 'Retired' &&
        !takenIds.has(id) &&
        p.search_rank &&
        p.search_rank < 9999
      )
      .sort((a, b) => (a[1].search_rank || 99999) - (b[1].search_rank || 99999));
    const best = candidates[0];
    if (!best) return { success: false, errors: ['No available players found'] };
    return get().makeDraftPick({
      rosterId: slot.currentRosterId,
      playerId: best[0],
      wasAuto: true,
    });
  },

  undoLastDraftPick: async () => {
    const { draftState } = get();
    const picks = draftState.picks || [];
    if (picks.length === 0) return;
    const nextPicks = picks.slice(0, -1);
    await get()._persistDraftState({
      picks: nextPicks,
      currentPickStartTime: Date.now(),
      endedAt: null,
      isActive: true,
    });
  },

  // Wipe the entire draft log. Commissioner-only; intended for trial mode
  // resets, but also the "start over" button on the real draft.
  resetDraft: async () => {
    await get()._persistDraftState({
      ...EMPTY_DRAFT_STATE,
    });
  },

  // End draft — marks complete, stops the clock. Does NOT wipe picks (the
  // log is the record). For trial mode, pair this with resetDraft.
  endDraft: async () => {
    await get()._persistDraftState({
      isActive: false,
      endedAt: Date.now(),
      currentPickStartTime: null,
    });
  },

  resetAll: async () => {
    await Promise.all([
      supabase.from(TABLES.rankings).delete().gte('roster_id', 0),
      supabase.from(TABLES.keepers).delete().gte('roster_id', 0),
      supabase.from(TABLES.slotsBurned).delete().gte('roster_id', 0),
      supabase.from(TABLES.trades).delete().neq('id', ''),
      supabase.from(TABLES.mockDrafts).delete().gte('roster_id', 0),
      supabase.from(TABLES.draftQueues).delete().gte('roster_id', 0),
    ]);
    set({
      draftPositions: {}, keepers: {}, slotsBurned: {}, trades: [], mockDrafts: {},
      draftQueues: {},
      currentUser: null,
    });
    saveUser(null);
    get().rebuildAssets();
  },
}));

export default useStore;
