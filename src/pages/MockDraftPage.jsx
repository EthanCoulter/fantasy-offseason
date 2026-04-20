import React, { useMemo, useState } from 'react';
import useStore, { ROUNDS, YEARS, validateTrade } from '../store';
import { hashPin } from '../utils/pinHash';
import { posPill, posBox, posBoxOn } from '../utils/posColors';

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

function HypotheticalTradeModal({ open, onClose, teams, teamAssets, onSubmit }) {
  const [sideAId, setSideAId] = useState('');
  const [sideBId, setSideBId] = useState('');
  const [sideASel, setSideASel] = useState([]);
  const [sideBSel, setSideBSel] = useState([]);

  const reset = () => {
    setSideAId(''); setSideBId('');
    setSideASel([]); setSideBSel([]);
  };

  const assetsA = sideAId ? (teamAssets[Number(sideAId)] || { players: [], picks: [] }) : { players: [], picks: [] };
  const assetsB = sideBId ? (teamAssets[Number(sideBId)] || { players: [], picks: [] }) : { players: [], picks: [] };
  const listA = [...(assetsA.players || []), ...(assetsA.picks || [])];
  const listB = [...(assetsB.players || []), ...(assetsB.picks || [])];

  const toggle = (list, setList) => (asset) => {
    setList(prev => prev.some(a => a.id === asset.id) ? prev.filter(a => a.id !== asset.id) : [...prev, asset]);
  };

  const validation = useMemo(() => {
    if (sideASel.length === 0 && sideBSel.length === 0) return null;
    return validateTrade(sideASel, sideBSel);
  }, [sideASel, sideBSel]);

  const teamA = teams.find(t => t.rosterId === Number(sideAId));
  const teamB = teams.find(t => t.rosterId === Number(sideBId));

  const handleSubmit = () => {
    if (!sideAId || !sideBId || sideAId === sideBId) return;
    if (!validation || !validation.valid) return;
    onSubmit({
      id: `mt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      fromRosterId: Number(sideAId),
      toRosterId: Number(sideBId),
      fromAssets: sideASel,
      toAssets: sideBSel,
      timestamp: Date.now(),
    });
    reset();
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 pt-10 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-3xl bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white">Hypothetical Trade</h3>
            <p className="text-[10px] text-[#4a5568]">
              Mock draft only — does not affect real league keepers or picks
            </p>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="text-[#8a95a8] hover:text-white">✕</button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] mb-1.5">Team A</label>
              <select
                value={sideAId}
                onChange={e => { setSideAId(e.target.value); setSideASel([]); }}
                className="w-full bg-[#0a0c10] border border-[#2a3040] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a0]"
              >
                <option value="">-- Select --</option>
                {teams.filter(t => String(t.rosterId) !== sideBId).map(t => (
                  <option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] mb-1.5">Team B</label>
              <select
                value={sideBId}
                onChange={e => { setSideBId(e.target.value); setSideBSel([]); }}
                className="w-full bg-[#0a0c10] border border-[#2a3040] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#4da6ff]"
              >
                <option value="">-- Select --</option>
                {teams.filter(t => String(t.rosterId) !== sideAId).map(t => (
                  <option key={t.rosterId} value={t.rosterId}>{t.teamName}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-xs font-semibold text-[#00e5a0] mb-2">
                {teamA?.teamName || 'Team A'} sends
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 bg-[#0a0c10] border border-[#2a3040] rounded-lg p-2">
                {!sideAId ? (
                  <div className="text-xs text-[#4a5568] py-2 px-2">Select a team first</div>
                ) : listA.length === 0 ? (
                  <div className="text-xs text-[#4a5568] py-2 px-2">No assets</div>
                ) : listA.map(asset => {
                  const sel = sideASel.some(a => a.id === asset.id);
                  const isPick = asset.type === 'pick';
                  const rowTint = isPick
                    ? sel ? 'bg-[#4da6ff]/10 border-[#4da6ff]/40' : 'bg-transparent border-transparent hover:bg-[#1a1f27]'
                    : sel ? posBoxOn(asset.position) : `${posBox(asset.position)} hover:brightness-125`;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => toggle(sideASel, setSideASel)(asset)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border text-xs ${rowTint}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-[#00e5a0] border-[#00e5a0]' : 'border-[#2a3040]'}`}>
                        {sel && <span className="text-black text-[9px] font-bold">✓</span>}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${isPick ? 'text-[#4da6ff] border-[#4da6ff]/20' : posPill(asset.position)}`}>
                        {isPick ? 'PICK' : asset.position}
                      </span>
                      <span className="text-white truncate">
                        {isPick ? asset.label : asset.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-[#4da6ff] mb-2">
                {teamB?.teamName || 'Team B'} sends
              </div>
              <div className="max-h-64 overflow-y-auto space-y-1 bg-[#0a0c10] border border-[#2a3040] rounded-lg p-2">
                {!sideBId ? (
                  <div className="text-xs text-[#4a5568] py-2 px-2">Select a team first</div>
                ) : listB.length === 0 ? (
                  <div className="text-xs text-[#4a5568] py-2 px-2">No assets</div>
                ) : listB.map(asset => {
                  const sel = sideBSel.some(a => a.id === asset.id);
                  const isPick = asset.type === 'pick';
                  const rowTint = isPick
                    ? sel ? 'bg-[#4da6ff]/10 border-[#4da6ff]/40' : 'bg-transparent border-transparent hover:bg-[#1a1f27]'
                    : sel ? posBoxOn(asset.position) : `${posBox(asset.position)} hover:brightness-125`;
                  return (
                    <div
                      key={asset.id}
                      onClick={() => toggle(sideBSel, setSideBSel)(asset)}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer border text-xs ${rowTint}`}
                    >
                      <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${sel ? 'bg-[#4da6ff] border-[#4da6ff]' : 'border-[#2a3040]'}`}>
                        {sel && <span className="text-black text-[9px] font-bold">✓</span>}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold border ${isPick ? 'text-[#4da6ff] border-[#4da6ff]/20' : posPill(asset.position)}`}>
                        {isPick ? 'PICK' : asset.position}
                      </span>
                      <span className="text-white truncate">
                        {isPick ? asset.label : asset.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {validation && (
            <div className={`rounded-lg px-3 py-2 border text-xs ${
              validation.valid
                ? 'bg-[#00e5a0]/5 border-[#00e5a0]/20 text-[#00e5a0]'
                : 'bg-red-500/5 border-red-500/20 text-red-400'
            }`}>
              {validation.valid ? '✓ Trade is valid' : (
                <div>
                  <div className="font-semibold mb-0.5">Invalid trade:</div>
                  {validation.errors.map((e, i) => <div key={i}>• {e}</div>)}
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 text-xs text-[#8a95a8] hover:text-white border border-[#2a3040] rounded-lg"
            >Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={!sideAId || !sideBId || !validation || !validation.valid}
              className="px-4 py-2 text-xs bg-[#4da6ff] text-black font-semibold rounded-lg hover:bg-[#6db8ff] disabled:opacity-30 disabled:cursor-not-allowed"
            >Apply to Mock Draft</button>
          </div>
        </div>
      </div>
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
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-9 text-center ${posPill(p.position)}`}>
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
  const {
    currentUser, teams, teamAssets, draftPositions, playerDB, keepers,
    mockDrafts, saveMockDraft, updateMockDraftPicks, deleteMockDraft,
    addMockTrade, removeMockTrade, clearMockDraftPicks,
  } = useStore();
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState('');
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState(null);
  const [mockTradeOpen, setMockTradeOpen] = useState(false);

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
      // Keep rookies (no team yet) and active players. Only drop retired
      // players so the pool stays browseable without losing draft-class guys.
      .filter(([id, p]) => p.status !== 'Retired')
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

  // Hypothetical mock trades the user has layered on top of real ownership.
  // Stored as type='mockTrade' entries inside the mockDraft.picks JSONB array.
  const mockTrades = useMemo(
    () => (myBoard?.picks || []).filter(p => p && p.type === 'mockTrade'),
    [myBoard]
  );

  // Build draft order.
  // Current year: slots keyed by round × rank (1..12) using commissioner rankings.
  // Future year: slots keyed by round × original-roster id (no rank yet).
  // Hypothetical mockTrades are applied as an ownership overlay.
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

    // Apply mockTrades as an overlay on currentOwner, in order. Picks are
    // matched by (year, round, originalRosterId) — the stable identity.
    const allSlotsFlat = Object.values(slotsByYear).flat();
    const findSlot = (pickAsset) => allSlotsFlat.find(
      s =>
        s.year === pickAsset.year &&
        s.round === pickAsset.round &&
        s.originalOwner === pickAsset.originalRosterId
    );
    mockTrades
      .slice()
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .forEach(mt => {
        (mt.fromAssets || []).filter(a => a.type === 'pick').forEach(p => {
          const s = findSlot(p);
          if (s) s.currentOwner = mt.toRosterId;
        });
        (mt.toAssets || []).filter(a => a.type === 'pick').forEach(p => {
          const s = findSlot(p);
          if (s) s.currentOwner = mt.fromRosterId;
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
  }, [teams, teamAssets, mockTrades]);

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
    const existingIdx = picks.findIndex(
      p => p && p.type !== 'mockTrade' && p.key === key
    );
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
    // Only drop the matching slot entry — keep mockTrades intact
    const picks = (myBoard?.picks || []).filter(
      p => !(p && p.type !== 'mockTrade' && p.key === slot.slotKey)
    );
    await updateMockDraftPicks(rosterId, picks);
  };

  const handleClearAll = async () => {
    if (!window.confirm('Clear all picks AND hypothetical trades from your mock draft board?')) return;
    await clearMockDraftPicks(rosterId);
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
  (myBoard?.picks || [])
    .filter(p => p && p.type !== 'mockTrade' && p.key)
    .forEach(p => { pickMap[p.key] = p; });
  const filledCount = slots.filter(s => pickMap[s.slotKey]).length;
  const realPickCount = (myBoard?.picks || []).filter(
    p => p && p.type !== 'mockTrade'
  ).length;
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
            onClick={() => setMockTradeOpen(true)}
            className="px-3 py-1.5 text-xs text-[#4da6ff] hover:text-white border border-[#4da6ff]/30 hover:border-[#4da6ff] bg-[#4da6ff]/10 rounded-xl transition-colors"
            title="Simulate a trade in this mock draft only (doesn't affect real league state)"
          >⇄ Hypothetical Trade</button>
          <button
            onClick={handleClearAll}
            disabled={realPickCount === 0}
            className="px-3 py-1.5 text-xs text-[#ff6b35] hover:text-white border border-[#ff6b35]/30 hover:border-[#ff6b35] bg-[#ff6b35]/10 rounded-xl transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >Clear All</button>
          <button
            onClick={() => { setUnlocked(false); setPinError(''); }}
            className="px-3 py-1.5 text-xs text-[#8a95a8] hover:text-white border border-[#2a3040] rounded-xl"
          >🔒 Lock</button>
        </div>
      </div>

      {mockTrades.length > 0 && (
        <div className="bg-[#4da6ff]/5 border border-[#4da6ff]/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-semibold text-[#4da6ff] uppercase tracking-wider">
              🧪 Hypothetical Trades ({mockTrades.length})
            </div>
            <div className="text-[10px] text-[#4a5568]">
              Mock-only — does not affect real league
            </div>
          </div>
          <div className="space-y-1.5">
            {mockTrades.map(mt => {
              const fromTeam = teams.find(t => t.rosterId === mt.fromRosterId);
              const toTeam = teams.find(t => t.rosterId === mt.toRosterId);
              const fmt = (assets) =>
                (assets || [])
                  .map(a => (a.type === 'pick' ? a.label : `${a.name} (${a.position})`))
                  .join(', ');
              return (
                <div
                  key={mt.id}
                  className="flex items-center gap-2 text-xs bg-[#0a0c10] border border-[#2a3040] rounded-lg px-3 py-2"
                >
                  <div className="flex-1">
                    <span className="text-white font-semibold">{fromTeam?.teamName}</span>
                    <span className="text-[#4a5568]"> sends </span>
                    <span className="text-[#00e5a0]">{fmt(mt.fromAssets)}</span>
                    <span className="text-[#4a5568]"> to </span>
                    <span className="text-white font-semibold">{toTeam?.teamName}</span>
                    <span className="text-[#4a5568]"> for </span>
                    <span className="text-[#4da6ff]">{fmt(mt.toAssets)}</span>
                  </div>
                  <button
                    onClick={() => removeMockTrade(rosterId, mt.id)}
                    className="text-[#4a5568] hover:text-red-400 text-sm px-1"
                    title="Undo this hypothetical"
                  >✕</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

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
                    ? posBoxOn(player.position)
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
                              <span className={`text-[9px] font-bold px-1 rounded border ${posPill(player.position)}`}>{player.position}</span>
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

      <HypotheticalTradeModal
        open={mockTradeOpen}
        onClose={() => setMockTradeOpen(false)}
        teams={teams}
        teamAssets={teamAssets}
        onSubmit={(mt) => addMockTrade(rosterId, mt)}
      />

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
