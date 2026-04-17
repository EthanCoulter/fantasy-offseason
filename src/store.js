import { create } from 'zustand';
import { supabase, TABLES } from './utils/supabase';

export const LEAGUE_ID = '1250556742954135552';
export const DISCORD_TRADE_WEBHOOK =
  'https://discord.com/api/webhooks/1494742521149132941/nEYQX-UdHNjFUBxoqixYigP66JhvxUymZTdjORxNqWsI0Lrt9qyfEm9f2TSh4voBuafQ';
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
// Failures are swallowed — a down webhook should never block the trade itself.
export async function notifyDiscordTrade(trade, teams) {
  try {
    if (!trade || !teams || !DISCORD_TRADE_WEBHOOK) return;
    const fromTeam = teams.find(t => t.rosterId === trade.fromRosterId);
    const toTeam = teams.find(t => t.rosterId === trade.toRosterId);
    const fromName = fromTeam?.teamName || fromTeam?.displayName || 'Unknown';
    const toName = toTeam?.teamName || toTeam?.displayName || 'Unknown';
    const fmt = (assets) =>
      (assets || [])
        .map(a => (a.type === 'pick' ? a.label : `${a.name} (${a.position})`))
        .join(', ') || '—';

    const content = [
      '@everyone',
      '🚨🚨🚨 **NEW TRADE ALERT** 🚨🚨🚨',
      '',
      `**Sources:** The ${fromName} have traded **${fmt(trade.fromAssets)}** to the ${toName} in exchange for **${fmt(trade.toAssets)}**.`,
      '',
      `More details as they become available.`,
    ].join('\n');

    await fetch(DISCORD_TRADE_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content,
        allowed_mentions: { parse: ['everyone'] },
      }),
    });
  } catch (e) {
    console.warn('Discord trade notification failed:', e);
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

const useStore = create((set, get) => ({
  teams: [],
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

  setLeagueData: (teams, playerDB, tradedPicks) => {
    set({ teams, playerDB, tradedPicks: tradedPicks || [], leagueLoaded: true });
    get().rebuildAssets();
  },

  rebuildAssets: () => {
    const { teams, playerDB, tradedPicks, draftPositions, keepers, trades } = get();
    if (!teams.length) return;
    const ownership = buildOwnership(teams, tradedPicks, trades);
    const bonusPlayers = deriveBonusPlayers(teams, trades);

    // Auto-include bonus players in each roster's keepers list (they are locked).
    const mergedKeepers = { ...keepers };
    Object.entries(bonusPlayers).forEach(([rid, ids]) => {
      const current = new Set(mergedKeepers[rid] || []);
      (ids || []).forEach(id => current.add(id));
      mergedKeepers[rid] = Array.from(current);
    });

    const teamAssets = computeTeamAssets(teams, draftPositions, mergedKeepers, playerDB, ownership);
    set({ bonusPlayers, teamAssets });
  },

  hydrateFromSupabase: async () => {
    try {
      const [r, k, sb, tr, md] = await Promise.all([
        supabase.from(TABLES.rankings).select('*'),
        supabase.from(TABLES.keepers).select('*'),
        supabase.from(TABLES.slotsBurned).select('*'),
        supabase.from(TABLES.trades).select('*').order('created_at', { ascending: false }),
        supabase.from(TABLES.mockDrafts).select('*'),
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

      set({ draftPositions, keepers, slotsBurned, trades, mockDrafts, supabaseLoaded: true });
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

  resetAll: async () => {
    await Promise.all([
      supabase.from(TABLES.rankings).delete().gte('roster_id', 0),
      supabase.from(TABLES.keepers).delete().gte('roster_id', 0),
      supabase.from(TABLES.slotsBurned).delete().gte('roster_id', 0),
      supabase.from(TABLES.trades).delete().neq('id', ''),
      supabase.from(TABLES.mockDrafts).delete().gte('roster_id', 0),
    ]);
    set({
      draftPositions: {}, keepers: {}, slotsBurned: {}, trades: [], mockDrafts: {},
      currentUser: null,
    });
    saveUser(null);
    get().rebuildAssets();
  },
}));

export default useStore;
