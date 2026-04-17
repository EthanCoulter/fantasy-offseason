import React, { useMemo, useState } from 'react';
import useStore, { ROUNDS, YEARS } from '../store';
import { hashPin } from '../utils/pinHash';

const POS_COLORS = {
  QB: 'bg-red-500/10 text-red-400 border-red-500/20',
  RB: 'bg-green-500/10 text-green-400 border-green-500/20',
  WR: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  TE: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  K: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  DL: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  DE: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  DT: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  LB: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  DB: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  CB: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  S: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
};

// Strong per-position fill used on the mock-draft slot once a pick is made
const POS_SLOT_FILL = {
  QB: 'bg-red-500/15 border-red-500/50',
  RB: 'bg-green-500/15 border-green-500/50',
  WR: 'bg-blue-500/15 border-blue-500/50',
  TE: 'bg-orange-500/15 border-orange-500/50',
  K: 'bg-purple-500/15 border-purple-500/50',
  DL: 'bg-yellow-500/15 border-yellow-500/50',
  DE: 'bg-yellow-500/15 border-yellow-500/50',
  DT: 'bg-yellow-500/15 border-yellow-500/50',
  LB: 'bg-teal-500/15 border-teal-500/50',
  DB: 'bg-pink-500/15 border-pink-500/50',
  CB: 'bg-pink-500/15 border-pink-500/50',
  S: 'bg-pink-500/15 border-pink-500/50',
};

const OFFENSE_POS = ['QB', 'RB', 'WR', 'TE', 'K'];
const IDP_POS = ['DL', 'DE', 'DT', 'LB', 'DB', 'CB', 'S'];
const MOCK_POOL_POSITIONS = [...OFFENSE_POS, ...IDP_POS];

function PinScreen({ mode, onSubmit, onReset, error }) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handle = async () => {
    if (pin.length < 4) return onSubmit({ error: 'PIN must be at least 4 digits' });
    if (mode === 'create' && pin !== confirmPin) return onSubmit({ error: 'PINs do not match' });
    onSubmit({ pin });
  };

  return (
    <div className="max-w-md mx-auto bg-[#111418] border border-[#2a3040] rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">
          {mode === 'create' ? 'Create Your Mock Draft Board' : 'Unlock Mock Draft Board'}
        </h2>
        <p className="text-sm text-[#8a95a8]">
          {mode === 'create'
            ? 'Set a PIN to keep your board private. You\'ll need it to view or edit later.'
            : 'Enter your PIN to access your private mock draft board.'}
        </p>
      </div>

      <input
        type="password"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        placeholder="Enter PIN (4+ digits)"
        className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0]"
        onKeyDown={e => e.key === 'Enter' && handle()}
      />

      {mode === 'create' && (
        <input
          type="password"
          value={confirmPin}
          onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Confirm PIN"
          className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0]"
          onKeyDown={e => e.key === 'Enter' && handle()}
        />
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <button
        onClick={handle}
        className="w-full py-3 rounded-xl bg-[#00e5a0] text-black font-semibold text-sm hover:bg-[#00ffb3] transition-colors"
      >
        {mode === 'create' ? 'Create Board' : 'Unlock'}
      </button>

      {mode === 'unlock' && onReset && (
        <button
          onClick={onReset}
          className="w-full text-xs text-[#8a95a8] hover:text-red-400 transition-colors pt-2"
        >
          Forgot PIN? Reset board (wipes your picks)
        </button>
      )}
    </div>
  );
}

function PlayerPicker({ open, onClose, availablePlayers, onSelect, title }) {
  const [query, setQuery] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const [sortBy, setSortBy] = useState('adp'); // 'adp' | 'name'

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    const base = availablePlayers
      .filter(p => {
        if (posFilter === 'ALL') return true;
        if (posFilter === 'IDP') return IDP_POS.includes(p.position);
        if (posFilter === 'OFF') return OFFENSE_POS.includes(p.position);
        return p.position === posFilter;
      })
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q));

    const sorted = [...base].sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      // adp — nulls last, then alpha
      if (a.adp == null && b.adp == null) return a.name.localeCompare(b.name);
      if (a.adp == null) return 1;
      if (b.adp == null) return -1;
      return a.adp - b.adp;
    });

    return sorted.slice(0, 300);
  }, [availablePlayers, query, posFilter, sortBy]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-10" onClick={onClose}>
      <div className="w-full max-w-2xl bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
          <h3 className="font-semibold text-white">{title}</h3>
          <button onClick={onClose} className="text-[#8a95a8] hover:text-white">✕</button>
        </div>
        <div className="px-5 py-3 border-b border-[#2a3040] space-y-2">
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search name or team..."
            className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a0]"
          />
          <div className="flex gap-1.5 flex-wrap">
            {['ALL', 'OFF', 'QB', 'RB', 'WR', 'TE', 'K', 'IDP', 'DL', 'LB', 'DB'].map(p => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  posFilter === p
                    ? 'bg-[#00e5a0] text-black'
                    : 'bg-[#1a1f27] text-[#8a95a8] hover:text-white'
                }`}
              >{p}</button>
            ))}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[10px] uppercase tracking-wider text-[#4a5568]">Sort</span>
            {[
              { id: 'adp', label: 'ADP' },
              { id: 'name', label: 'Name' },
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setSortBy(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
                  sortBy === opt.id
                    ? 'bg-[#4da6ff]/20 text-[#4da6ff] border border-[#4da6ff]/40'
                    : 'bg-[#1a1f27] text-[#8a95a8] hover:text-white border border-transparent'
                }`}
              >{opt.label}</button>
            ))}
          </div>
        </div>
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-[#2a3040]">
          {filtered.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#8a95a8]">No players found</div>
          ) : filtered.map(p => (
            <button
              key={p.id}
              onClick={() => { onSelect(p); onClose(); }}
              className="w-full px-5 py-2.5 flex items-center gap-3 hover:bg-[#1a1f27] transition-colors text-left"
            >
              <span className="text-[10px] font-bold text-[#4a5568] w-10 text-right">#{p.adp || '—'}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-9 text-center ${POS_COLORS[p.position] || 'bg-[#1a1f27] text-[#8a95a8] border-[#2a3040]'}`}>
                {p.position}
              </span>
              <span className="flex-1 text-sm text-white truncate">{p.name}</span>
              <span className="text-xs text-[#8a95a8] w-10 text-right">{p.team || 'FA'}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MockDraftPage() {
  const { currentUser, teams, teamAssets, draftPositions, playerDB, keepers, mockDrafts, saveMockDraft, updateMockDraftPicks, deleteMockDraft } = useStore();
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState('');
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);

  const rosterId = currentUser?.rosterId;
  const myBoard = rosterId ? mockDrafts[rosterId] : null;
  const hasBoard = !!myBoard;

  // All kept players across league → exclude from pool
  const keptPlayerIds = useMemo(() => {
    const s = new Set();
    Object.values(keepers).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [keepers]);

  // Build player pool (with ADP = search_rank)
  const players = useMemo(() => {
    if (!playerDB) return [];
    return Object.entries(playerDB)
      .filter(([id, p]) => p && p.position && MOCK_POOL_POSITIONS.includes(p.position))
      .filter(([id, p]) => p.team) // drop unsigned / retired noise from IDP pool
      .filter(([id]) => !keptPlayerIds.has(id))
      .map(([id, p]) => ({
        id,
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || id,
        position: p.position,
        team: p.team,
        adp: p.search_rank && p.search_rank < 9999 ? p.search_rank : null,
      }))
      .sort((a, b) => {
        if (a.adp == null && b.adp == null) return a.name.localeCompare(b.name);
        if (a.adp == null) return 1;
        if (b.adp == null) return -1;
        return a.adp - b.adp;
      });
  }, [playerDB, keptPlayerIds]);

  // Build draft order.
  // Current year: slots keyed by round × rank (1..12) using commissioner rankings.
  // Future year: slots keyed by round × original-roster id (no rank yet).
  const draftSlots = useMemo(() => {
    const slotsByYear = {};
    YEARS.forEach(y => { slotsByYear[y] = []; });
    teams.forEach(team => {
      const assets = teamAssets[team.rosterId];
      (assets?.picks || []).forEach(pick => {
        const isCurrent = pick.year === YEARS[0];
        if (isCurrent && !pick.position) return; // current year needs a rank
        slotsByYear[pick.year]?.push({
          round: pick.round,
          rank: pick.position || null,
          currentOwner: pick.currentRosterId,
          originalOwner: pick.originalRosterId,
          year: pick.year,
          slotKey: isCurrent
            ? `${pick.year}_${pick.round}_${pick.position}`
            : `${pick.year}_${pick.round}_orig${pick.originalRosterId}`,
        });
      });
    });
    Object.values(slotsByYear).forEach(arr =>
      arr.sort((a, b) =>
        a.round - b.round ||
        (a.rank || 0) - (b.rank || 0) ||
        a.originalOwner - b.originalOwner
      )
    );
    return slotsByYear;
  }, [teams, teamAssets]);

  // Picked-player set in my current mock draft (to disable in picker)
  const pickedInMockIds = useMemo(() => {
    const s = new Set();
    (myBoard?.picks || []).forEach(p => p.playerId && s.add(p.playerId));
    return s;
  }, [myBoard]);

  const availableForPicker = useMemo(
    () => players.filter(p => !pickedInMockIds.has(p.id)),
    [players, pickedInMockIds]
  );

  const handleCreatePin = async ({ pin, error }) => {
    if (error) { setPinError(error); return; }
    setPinError('');
    const h = await hashPin(pin);
    await saveMockDraft(rosterId, h, []);
    setUnlocked(true);
  };

  const handleUnlock = async ({ pin, error }) => {
    if (error) { setPinError(error); return; }
    const h = await hashPin(pin);
    if (h !== myBoard.pinHash) { setPinError('Incorrect PIN'); return; }
    setPinError('');
    setUnlocked(true);
  };

  const handleReset = async () => {
    if (!window.confirm('This will permanently delete your mock draft board. Continue?')) return;
    await deleteMockDraft(rosterId);
    setUnlocked(false);
    setPinError('');
  };

  const openPicker = (slot) => {
    setActiveSlot(slot);
    setPickerOpen(true);
  };

  const selectPlayer = async (player) => {
    if (!activeSlot) return;
    const picks = [...(myBoard?.picks || [])];
    const key = activeSlot.slotKey;
    const existingIdx = picks.findIndex(p => p.key === key);
    const entry = {
      key,
      year: activeSlot.year,
      round: activeSlot.round,
      rank: activeSlot.rank,
      originalOwner: activeSlot.originalOwner,
      playerId: player.id,
    };
    if (existingIdx >= 0) picks[existingIdx] = entry;
    else picks.push(entry);
    await updateMockDraftPicks(rosterId, picks);
  };

  const clearPick = async (slot) => {
    const picks = (myBoard?.picks || []).filter(p => p.key !== slot.slotKey);
    await updateMockDraftPicks(rosterId, picks);
  };

  const getTeamName = (rid) => teams.find(t => t.rosterId === rid)?.teamName || '—';
  const getTeamShort = (rid) => teams.find(t => t.rosterId === rid)?.teamName.substring(0, 14) || '—';

  // Early states
  if (!rosterId) {
    return <div className="text-[#8a95a8]">Mock Draft Board is for managers only.</div>;
  }

  const anyAssigned = Object.keys(draftPositions).length > 0;
  if (!anyAssigned) {
    return (
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center">
        <div className="text-3xl mb-2">📋</div>
        <div className="text-sm text-[#8a95a8]">The commissioner must assign draft positions before mock drafts are available.</div>
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
            MOCK DRAFT BOARD
          </h1>
          <p className="text-[#8a95a8] text-sm">Private · PIN-protected</p>
        </div>
        <PinScreen
          mode={hasBoard ? 'unlock' : 'create'}
          onSubmit={hasBoard ? handleUnlock : handleCreatePin}
          onReset={hasBoard ? handleReset : null}
          error={pinError}
        />
      </div>
    );
  }

  const slots = draftSlots[selectedYear] || [];
  const pickMap = {};
  (myBoard?.picks || []).forEach(p => { pickMap[p.key] = p; });
  const filledCount = slots.filter(s => pickMap[s.slotKey]).length;
  const isCurrentMockYear = selectedYear === YEARS[0];

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
            MOCK DRAFT BOARD
          </h1>
          <p className="text-[#8a95a8] text-sm">
            Your private prediction · {filledCount}/{slots.length} picks filled
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-[#111418] rounded-xl border border-[#2a3040]">
            {YEARS.map(y => (
              <button
                key={y}
                onClick={() => setSelectedYear(y)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  selectedYear === y ? 'bg-[#1a1f27] text-white' : 'text-[#8a95a8] hover:text-white'
                }`}
              >{y}</button>
            ))}
          </div>
          <button
            onClick={() => { setUnlocked(false); setPinError(''); }}
            className="px-3 py-1.5 text-xs text-[#8a95a8] hover:text-white border border-[#2a3040] rounded-xl"
          >🔒 Lock</button>
        </div>
      </div>

      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a3040] flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">
            {selectedYear} Draft Predictions
            {!isCurrentMockYear && (
              <span className="ml-2 text-[11px] text-[#4da6ff] font-normal">
                round-only · no slot numbers yet
              </span>
            )}
          </h2>
          <span className="text-xs text-[#8a95a8]">Click any slot to pick a player</span>
        </div>
        <div className="divide-y divide-[#2a3040]">
          {Array.from({ length: ROUNDS }, (_, i) => i + 1).map(round => {
            const roundSlots = isCurrentMockYear
              ? Array.from({ length: 12 }, (_, i) => i + 1).map(rank =>
                  slots.find(s => s.round === round && s.rank === rank) || null
                )
              : slots.filter(s => s.round === round);

            return (
            <div key={round} className="px-5 py-3">
              <div className="text-[10px] font-bold uppercase tracking-widest text-[#8a95a8] mb-2">Round {round}</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                {roundSlots.map((slot, idx) => {
                  if (!slot) {
                    return (
                      <div
                        key={`empty-${round}-${idx}`}
                        className="rounded-lg border border-dashed border-[#2a3040] p-2 text-center text-[10px] text-[#4a5568]"
                      >
                        {round}.{String(idx + 1).padStart(2, '0')} —
                      </div>
                    );
                  }
                  const pick = pickMap[slot.slotKey];
                  const player = pick ? playerDB[pick.playerId] : null;
                  const isTraded = slot.currentOwner !== slot.originalOwner;
                  const playerName = player ? (player.full_name || `${player.first_name || ''} ${player.last_name || ''}`.trim()) : null;

                  const slotFill = pick && player
                    ? (POS_SLOT_FILL[player.position] || 'bg-[#00e5a0]/5 border-[#00e5a0]/30')
                    : 'bg-[#1a1f27] border-[#2a3040]';

                  const slotLabel = isCurrentMockYear
                    ? `${round}.${String(slot.rank).padStart(2, '0')}`
                    : `R${round}`;

                  return (
                    <button
                      key={slot.slotKey}
                      onClick={() => openPicker(slot)}
                      className={`group rounded-lg border p-2 text-left transition-all hover:border-white/40 ${slotFill}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-[#8a95a8]">
                          {slotLabel}
                        </span>
                        {pick && (
                          <span
                            onClick={(e) => { e.stopPropagation(); clearPick(slot); }}
                            className="text-[10px] text-[#4a5568] hover:text-red-400"
                            title="Clear pick"
                          >✕</span>
                        )}
                      </div>
                      <div className={`text-[9px] truncate ${isTraded ? 'text-[#ff6b35]' : 'text-[#4a5568]'}`}>
                        {isCurrentMockYear
                          ? (<>
                              {getTeamShort(slot.currentOwner)}
                              {isTraded && ` [orig ${getTeamShort(slot.originalOwner)}]`}
                            </>)
                          : (<>
                              {getTeamShort(slot.originalOwner)}
                              {isTraded && ` → ${getTeamShort(slot.currentOwner)}`}
                            </>)
                        }
                      </div>
                      <div className="mt-1">
                        {pick && player ? (
                          <>
                            <div className="text-xs font-semibold text-white truncate">{playerName}</div>
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className={`text-[9px] font-bold px-1 rounded border ${POS_COLORS[player.position] || ''}`}>{player.position}</span>
                              <span className="text-[9px] text-[#8a95a8]">{player.team || 'FA'}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-[11px] text-[#4a5568] italic">+ pick player</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      </div>

      <PlayerPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        availablePlayers={availableForPicker}
        onSelect={selectPlayer}
        title={activeSlot
          ? `Pick for ${
              activeSlot.rank
                ? `${activeSlot.round}.${String(activeSlot.rank).padStart(2, '0')}`
                : `${activeSlot.year} R${activeSlot.round}`
            } — ${getTeamName(activeSlot.currentOwner)}${
              activeSlot.currentOwner !== activeSlot.originalOwner
                ? ` (orig ${getTeamName(activeSlot.originalOwner)})`
                : ''
            }`
          : 'Select player'}
      />
    </div>
  );
}
