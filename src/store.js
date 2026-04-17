import { create } from 'zustand';
import { supabase, TABLES } from './utils/supabase';

export const LEAGUE_ID = '1250556742954135552';
export const ROUNDS = 8;
export const YEARS = [2026, 2027];
export const BASE_OFFENSE_KEEPERS = 5;
export const BASE_DEFENSE_KEEPERS = 1;
export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'FB'];
export const COMMISSIONER_PASSWORD = 'commish2024';

export function isOffensive(position) {
  return OFFENSE_POSITIONS.includes(position);
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

export function calculateSlotImpact(sent, received) {
  const sentPlayers = sent.filter(a => a.type === 'player');
  const receivedPlayers = received.filter(a => a.type === 'player');
  const sentOff = sentPlayers.filter(p => isOffensive(p.position)).length;
  const sentDef = sentPlayers.filter(p => !isOffensive(p.position)).length;
  const recvOff = receivedPlayers.filter(p => isOffensive(p.position)).length;
  const recvDef = receivedPlayers.filter(p => !isOffensive(p.position)).length;
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

  Object.entries(ownership).forEach(([key, currentOwner]) => {
    const [yearStr, roundStr, origStr] = key.split('_');
    const year = Number(yearStr);
    const round = Number(roundStr);
    const originalRosterId = Number(origStr);
    const rank = rankings[originalRosterId];
    if (!teamAssets[currentOwner]) return;
    const slot = rank || null;
    teamAssets[currentOwner].picks.push({
      id: `pick_${year}_${round}_${originalRosterId}`,
      year, round,
      originalRosterId,
      currentRosterId: currentOwner,
      position: slot,
      originalPosition: slot,
      label: slot ? `${year} ${round}.${String(slot).padStart(2, '0')}` : `${year} R${round} (TBD)`,
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
        mockDrafts[row.roster_id] = { pinHash: row.pin_hash, picks: row.picks || [] };
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
    let bonusOffense = 0;
    let bonusDefense = 0;
    bonusIds.forEach(id => {
      const p = playerDB[id];
      if (!p) return;
      if (isOffensive(p.position)) bonusOffense += 1;
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

    const trade = {
      id: `trade_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fromRosterId, toRosterId, fromAssets, toAssets,
      status: 'pending', timestamp: Date.now(),
      fromSlotImpact: calculateSlotImpact(fromAssets, toAssets),
      toSlotImpact: calculateSlotImpact(toAssets, fromAssets),
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
    const fromImpact = trade.fromSlotImpact || calculateSlotImpact(trade.fromAssets, trade.toAssets);
    const toImpact = trade.toSlotImpact || calculateSlotImpact(trade.toAssets, trade.fromAssets);

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
  },

  saveMockDraft: async (rosterId, pinHash, picks) => {
    set(s => ({ mockDrafts: { ...s.mockDrafts, [rosterId]: { pinHash, picks } } }));
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
