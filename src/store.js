import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const LEAGUE_ID = '1250556742954135552';
export const ROUNDS = 8;
export const BASE_OFFENSE_KEEPERS = 5;
export const BASE_DEFENSE_KEEPERS = 1;
export const OFFENSE_POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'FB'];
export const COMMISSIONER_PASSWORD = 'commish2024';

export function isOffensive(position) {
  return OFFENSE_POSITIONS.includes(position);
}

export function generatePicksForTeam(position, years) {
  const picks = [];
  years.forEach(year => {
    for (let round = 1; round <= ROUNDS; round++) {
      picks.push({
        id: `pick_${year}_${round}_${position}`,
        year, round, position,
        label: `${year} ${round}.${String(position).padStart(2, '0')}`,
        type: 'pick',
        originalPosition: position,
      });
    }
  });
  return picks;
}

export function validateTrade(sideA, sideB) {
  const yearCounts = (assets) => {
    const counts = {};
    assets.forEach(a => {
      const key = a.type === 'pick' ? String(a.year) : 'player';
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  };
  const aC = yearCounts(sideA);
  const bC = yearCounts(sideB);
  const allKeys = new Set([...Object.keys(aC), ...Object.keys(bC)]);
  const errors = [];
  allKeys.forEach(key => {
    const a = aC[key] || 0;
    const b = bC[key] || 0;
    if (a !== b) {
      const label = key === 'player' ? 'players' : `${key} picks`;
      errors.push(`${label}: Side A has ${a}, Side B has ${b} — must be equal`);
    }
  });
  return { valid: errors.length === 0, errors };
}

// Slot impact: how many keeper slots burn for side A when sending/receiving
// Burned = max(0, sent_of_type - received_of_type)
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

const useStore = create(
  persist(
    (set, get) => ({
      teams: [],
      playerDB: {},
      leagueLoaded: false,

      currentUser: null,
      draftPositions: {},
      keepers: {},
      teamAssets: {},
      trades: [],
      slotsBurned: {},

      setLeagueData: (teams, playerDB) => {
        set({ teams, playerDB, leagueLoaded: true });
        setTimeout(() => {
          teams.forEach(t => get().rebuildTeamAssets(t.rosterId));
        }, 0);
      },

      setCurrentUser: (rosterId, isCommissioner = false) =>
        set({ currentUser: { rosterId, isCommissioner } }),
      logout: () => set({ currentUser: null }),

      setDraftPosition: (rosterId, position) => {
        const pos = { ...get().draftPositions, [rosterId]: position };
        set({ draftPositions: pos });
        get().rebuildTeamAssets(rosterId);
      },
      setAllDraftPositions: (positions) => {
        set({ draftPositions: positions });
        Object.keys(positions).forEach(rid => get().rebuildTeamAssets(Number(rid)));
      },

      setKeepers: (rosterId, playerIds) => {
        set(s => ({ keepers: { ...s.keepers, [rosterId]: playerIds } }));
        get().rebuildTeamAssets(rosterId);
      },

      getMaxKeeperSlots: (rosterId) => {
        const burned = get().slotsBurned[rosterId] || { offense: 0, defense: 0 };
        return {
          offense: Math.max(0, BASE_OFFENSE_KEEPERS - burned.offense),
          defense: Math.max(0, BASE_DEFENSE_KEEPERS - burned.defense),
        };
      },

      rebuildTeamAssets: (rosterId) => {
        const { draftPositions, keepers, playerDB, teams, teamAssets } = get();
        const team = teams.find(t => t.rosterId === rosterId);
        if (!team) return;

        // Don't overwrite players that came via trades - only refresh keepers from keeper list
        // and regenerate picks based on draft position (initial pick distribution)
        const existingAssets = teamAssets[rosterId];
        const hasExistingData = existingAssets && (existingAssets.players?.length > 0 || existingAssets.picks?.length > 0);

        const keeperIds = keepers[rosterId] || [];
        const currentYear = new Date().getFullYear();
        const position = draftPositions[rosterId];

        // If we already have trade-modified assets, only rebuild if this is a fresh setup
        // Otherwise keeper changes should update the players list and picks regenerated
        const players = keeperIds.map(id => {
          const p = playerDB[id];
          return p ? {
            id, name: `${p.first_name} ${p.last_name}`,
            position: p.position, nflTeam: p.team, type: 'player',
          } : { id, name: `Unknown (${id})`, position: 'UNK', type: 'player' };
        });

        // Preserve existing picks if they exist and no new draft position change, else regenerate
        let picks;
        const hasPicks = existingAssets?.picks?.length > 0;
        const picksAreFromAssignedPos = hasPicks && position && existingAssets.picks.every(p => p.originalPosition === position);
        
        if (hasPicks && !picksAreFromAssignedPos && position) {
          // Position changed - regenerate
          picks = generatePicksForTeam(position, [currentYear, currentYear + 1]);
        } else if (hasPicks) {
          // Keep existing picks (may have been modified by trades)
          picks = existingAssets.picks;
        } else if (position) {
          picks = generatePicksForTeam(position, [currentYear, currentYear + 1]);
        } else {
          picks = [];
        }

        set(s => ({
          teamAssets: { ...s.teamAssets, [rosterId]: { players, picks } },
        }));
      },

      proposeTrade: (fromRosterId, toRosterId, fromAssets, toAssets) => {
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
          id: `trade_${Date.now()}`,
          fromRosterId, toRosterId, fromAssets, toAssets,
          status: 'pending', timestamp: Date.now(),
          fromSlotImpact: calculateSlotImpact(fromAssets, toAssets),
          toSlotImpact: calculateSlotImpact(toAssets, fromAssets),
        };
        set(s => ({ trades: [trade, ...s.trades] }));
        return { success: true, trade };
      },

      executeTrade: (tradeId) => {
        const state = get();
        const trade = state.trades.find(t => t.id === tradeId);
        if (!trade) return;

        const newAssets = { ...state.teamAssets };
        const from = {
          players: [...(newAssets[trade.fromRosterId]?.players || [])],
          picks: [...(newAssets[trade.fromRosterId]?.picks || [])],
        };
        const to = {
          players: [...(newAssets[trade.toRosterId]?.players || [])],
          picks: [...(newAssets[trade.toRosterId]?.picks || [])],
        };

        const fromAssetIds = trade.fromAssets.map(a => a.id);
        const toAssetIds = trade.toAssets.map(a => a.id);

        from.players = from.players.filter(p => !fromAssetIds.includes(p.id));
        from.picks = from.picks.filter(p => !fromAssetIds.includes(p.id));
        to.players = to.players.filter(p => !toAssetIds.includes(p.id));
        to.picks = to.picks.filter(p => !toAssetIds.includes(p.id));

        trade.toAssets.forEach(a => {
          if (a.type === 'player') from.players.push(a);
          else from.picks.push(a);
        });
        trade.fromAssets.forEach(a => {
          if (a.type === 'player') to.players.push(a);
          else to.picks.push(a);
        });

        newAssets[trade.fromRosterId] = from;
        newAssets[trade.toRosterId] = to;

        const newKeepers = { ...state.keepers };
        newKeepers[trade.fromRosterId] = from.players.map(p => p.id);
        newKeepers[trade.toRosterId] = to.players.map(p => p.id);

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
          teamAssets: newAssets,
          keepers: newKeepers,
          slotsBurned: newSlotsBurned,
          trades: s.trades.map(t => t.id === tradeId ? { ...t, status: 'accepted' } : t),
        }));
      },

      updateTradeStatus: (tradeId, status) => {
        if (status === 'accepted') {
          get().executeTrade(tradeId);
        } else {
          set(s => ({ trades: s.trades.map(t => t.id === tradeId ? { ...t, status } : t) }));
        }
      },

      getTeam: (rosterId) => get().teams.find(t => t.rosterId === rosterId),
      getAssets: (rosterId) => get().teamAssets[rosterId] || { players: [], picks: [] },

      resetAll: () => set({
        draftPositions: {}, keepers: {}, teamAssets: {}, trades: [], slotsBurned: {}, currentUser: null,
      }),
    }),
    {
      name: 'fantasy-offseason-v2',
      partialize: s => ({
        currentUser: s.currentUser,
        draftPositions: s.draftPositions,
        keepers: s.keepers,
        teamAssets: s.teamAssets,
        trades: s.trades,
        slotsBurned: s.slotsBurned,
      }),
    }
  )
);

export default useStore;
