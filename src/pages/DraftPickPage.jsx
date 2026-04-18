import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore, { clockSecondsForRound } from '../store';

const POS_COLORS = {
  QB: 'bg-red-500/15 text-red-400 border-red-500/30',
  RB: 'bg-green-500/15 text-green-400 border-green-500/30',
  WR: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  TE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  K:  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DL: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DE: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DT: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  LB: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  DB: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  CB: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  S:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
};
const posColor = (p) => POS_COLORS[p] || 'bg-[#1a1f27] text-[#8a95a8] border-[#2a3040]';

const DRAFT_SOUND_URL = '/draft-pick.mp3';
const SOUND_ROUNDS = new Set([1, 2, 3]);

export default function DraftPickPage() {
  const {
    currentUser,
    teams,
    playerDB,
    keepers,
    draftState,
    draftOrder,
    makeDraftPick,
  } = useStore();

  const myRosterId = currentUser?.rosterId;
  const [now, setNow] = useState(Date.now());
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const audioRef = useRef(null);
  const lastPickIdxRef = useRef(-1);
  // flash has two phases: 'big' (5s full-screen slam) → 'small' (inline card)
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const picks = useMemo(() => draftState.picks || [], [draftState.picks]);
  const currentSlot = draftOrder[picks.length] || null;
  const isOnTheClock = currentSlot && currentSlot.currentRosterId === myRosterId;
  const clockSecs = currentSlot ? clockSecondsForRound(currentSlot.round) : 0;
  const elapsed = draftState.currentPickStartTime
    ? Math.floor((now - draftState.currentPickStartTime) / 1000)
    : 0;
  const remaining = Math.max(0, clockSecs - elapsed);
  const timerDanger = remaining <= 15 && remaining > 0;

  // Sound + flash animation fire when a new pick lands in the log.
  // Sound is gated to rounds 1-3; animation shows for every pick.
  // NOTE: the 5s→small transition lives in a separate effect below so that
  // any re-render during the big phase can't strand the overlay.
  useEffect(() => {
    if (picks.length === 0) {
      lastPickIdxRef.current = -1;
      return;
    }
    const lastIdx = picks.length - 1;
    if (lastIdx <= lastPickIdxRef.current) return;
    lastPickIdxRef.current = lastIdx;
    const p = picks[lastIdx];
    if (!p) return;
    const pickerTeam = teams.find(t => t.rosterId === p.rosterId);
    setFlash({
      phase: 'big',
      pickIndex: p.pickIndex,
      round: p.round,
      slot: p.slot,
      team: pickerTeam?.teamName || 'Unknown',
      player: p.playerName,
      playerId: p.playerId,
      pos: p.position,
      nflTeam: p.nflTeam,
    });
    if (audioRef.current && SOUND_ROUNDS.has(p.round)) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [picks, teams]);

  const flashBigPickId = flash && flash.phase === 'big' ? flash.pickIndex : null;
  useEffect(() => {
    if (flashBigPickId == null) return;
    const to = setTimeout(() => {
      setFlash(f => (f && f.pickIndex === flashBigPickId ? { ...f, phase: 'small' } : f));
    }, 5000);
    return () => clearTimeout(to);
  }, [flashBigPickId]);

  const dismissFlash = () => {
    setFlash(f => (f && f.phase === 'big' ? { ...f, phase: 'small' } : f));
  };

  const myTeam = teams.find(t => t.rosterId === myRosterId);
  const originalTeam = currentSlot && currentSlot.originalRosterId !== currentSlot.currentRosterId
    ? teams.find(t => t.rosterId === currentSlot.originalRosterId) : null;

  // Find my next pick in the order (including the current one if it's mine)
  const myNextSlot = useMemo(() => {
    for (let i = picks.length; i < draftOrder.length; i++) {
      if (draftOrder[i].currentRosterId === myRosterId) return { ...draftOrder[i], picksUntil: i - picks.length };
    }
    return null;
  }, [draftOrder, picks.length, myRosterId]);

  const takenIds = useMemo(() => {
    const s = new Set();
    picks.forEach(p => s.add(p.playerId));
    Object.values(keepers).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [picks, keepers]);

  const available = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(playerDB || {})
      .filter(([id, p]) => p && p.position && p.status !== 'Retired' && !takenIds.has(id))
      .map(([id, p]) => ({
        id,
        name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim(),
        position: p.position,
        team: p.team,
        adp: p.search_rank && p.search_rank < 9999 ? p.search_rank : null,
      }))
      .filter(p => posFilter === 'ALL' || p.position === posFilter)
      .filter(p => !q || p.name.toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q))
      .sort((a, b) => {
        if (a.adp == null && b.adp == null) return a.name.localeCompare(b.name);
        if (a.adp == null) return 1;
        if (b.adp == null) return -1;
        return a.adp - b.adp;
      })
      .slice(0, 200);
  }, [playerDB, takenIds, search, posFilter]);

  const handleSubmit = async () => {
    if (!selected || submitting) return;
    setSubmitting(true);
    setError('');
    const result = await makeDraftPick({ rosterId: myRosterId, playerId: selected.id });
    setSubmitting(false);
    if (!result.success) {
      setError((result.errors || ['Pick rejected']).join('. '));
      return;
    }
    setSelected(null);
  };

  if (!draftState.isActive) {
    return (
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center text-[#8a95a8]">
        <div className="text-3xl mb-2">⏸️</div>
        <div className="text-sm">The draft is not live yet. Your pick tab will light up when the commissioner starts the draft.</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <audio ref={audioRef} src={DRAFT_SOUND_URL} preload="auto" />

      {/* Big full-screen pick overlay — 5s, then shrinks to inline card.
          Tap anywhere (or the X) to dismiss early. */}
      {flash && flash.phase === 'big' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in cursor-pointer"
          onClick={dismissFlash}
          role="button"
          aria-label="Dismiss pick animation"
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); dismissFlash(); }}
            className="absolute top-4 right-4 z-20 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-600 active:bg-red-700 text-white text-sm font-bold flex items-center gap-2 shadow-lg shadow-red-500/40"
            aria-label="Close"
          >
            ✕ Close
          </button>
          <div className="animate-pick-slam w-full max-w-5xl mx-4">
            <div className="relative overflow-hidden rounded-3xl border-2 border-[#00e5a0]/50 bg-gradient-to-br from-[#0a0c10] via-[#111a2a] to-[#0a0c10] animate-pick-pulse">
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pick-shine" />
              </div>
              <div className="relative flex flex-col md:flex-row items-center gap-6 p-8 md:p-12">
                <div className="shrink-0 relative">
                  <div className="w-48 h-48 md:w-64 md:h-64 rounded-full overflow-hidden border-4 border-[#00e5a0]/60 bg-[#1a1f27] shadow-2xl shadow-[#00e5a0]/30">
                    {flash.playerId ? (
                      <img
                        src={`https://sleepercdn.com/content/nfl/players/${flash.playerId}.jpg`}
                        alt={flash.player}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-6xl">🏈</div>
                    )}
                  </div>
                  <div className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-lg border-2 font-black text-sm ${posColor(flash.pos)}`}>
                    {flash.pos}
                  </div>
                </div>
                <div className="flex-1 text-center md:text-left">
                  <div className="text-sm uppercase tracking-[0.3em] text-[#00e5a0] font-bold mb-1">
                    🚨 THE PICK IS IN · R{flash.round} · Pick {flash.slot} (Overall #{flash.pickIndex + 1})
                  </div>
                  <div
                    className="text-3xl md:text-4xl font-black text-[#8a95a8] mb-2"
                    style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.03em' }}
                  >
                    {flash.team}
                  </div>
                  <div
                    className="text-5xl md:text-7xl font-black text-white leading-tight"
                    style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.02em' }}
                  >
                    {flash.player}
                  </div>
                  {flash.nflTeam && (
                    <div className="mt-3 text-xl text-[#8a95a8] font-semibold">
                      {flash.nflTeam}
                    </div>
                  )}
                </div>
              </div>

              <div className="relative border-t border-white/10 px-6 py-4 flex items-center justify-between gap-3 bg-black/30">
                <span className="text-xs text-[#8a95a8]">Auto-closes in 5 seconds</span>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); dismissFlash(); }}
                  className="px-5 py-2.5 rounded-xl bg-[#00e5a0] hover:bg-[#00ffb3] active:bg-[#00cc8f] text-black text-sm font-bold shadow-lg shadow-[#00e5a0]/30"
                >
                  Dismiss →
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Inline last-pick card */}
      {flash && flash.phase === 'small' && (
        <div className="bg-[#4da6ff]/10 border border-[#4da6ff]/40 rounded-2xl p-4 flex items-center gap-4 animate-fade-in">
          {flash.playerId && (
            <img
              src={`https://sleepercdn.com/content/nfl/players/${flash.playerId}.jpg`}
              alt={flash.player}
              className="w-12 h-12 rounded-full object-cover border-2 border-[#4da6ff]/60 bg-[#1a1f27] shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-[#4da6ff]">Last pick · #{flash.pickIndex + 1}</div>
            <div className="text-sm font-black text-white truncate" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {flash.team} selects {flash.player}
            </div>
            <div className="flex items-center gap-2 text-[10px] mt-0.5">
              <span className={`px-1.5 py-0.5 rounded border font-semibold ${posColor(flash.pos)}`}>{flash.pos}</span>
              {flash.nflTeam && <span className="text-[#8a95a8]">{flash.nflTeam}</span>}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-black text-white"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            MAKE YOUR PICK
          </h1>
          <p className="text-[#8a95a8] text-sm">
            {myTeam?.teamName}
            {draftState.isTrial && <span className="ml-2 text-yellow-400 font-semibold">🧪 TRIAL</span>}
          </p>
        </div>
        {myNextSlot && (
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-widest text-[#8a95a8]">Your next pick</div>
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              R{myNextSlot.round} · Pick {myNextSlot.slot}
            </div>
            {myNextSlot.picksUntil > 0 && (
              <div className="text-xs text-[#8a95a8]">{myNextSlot.picksUntil} pick{myNextSlot.picksUntil === 1 ? '' : 's'} away</div>
            )}
          </div>
        )}
      </div>

      {isOnTheClock ? (
        <div className={`rounded-2xl border-2 p-5 ${
          timerDanger
            ? 'bg-yellow-500/10 border-yellow-500/60 animate-pulse'
            : 'bg-[#00e5a0]/10 border-[#00e5a0]/40'
        }`}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#00e5a0]">You're on the clock!</div>
              <div
                className="text-2xl font-black text-white"
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                R{currentSlot.round} · Pick {currentSlot.slot} (Overall #{currentSlot.pickIndex + 1})
              </div>
              {originalTeam && (
                <div className="text-xs text-[#ff6b35]">via trade from {originalTeam.teamName}</div>
              )}
            </div>
            <div className="text-center">
              <div
                className={`text-5xl font-black tabular-nums ${
                  timerDanger ? 'text-yellow-400' : 'text-[#00e5a0]'
                }`}
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </div>
              <div className="text-[10px] text-[#8a95a8] uppercase tracking-widest">
                {clockSecs}s on the clock
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-5">
          <div className="text-[10px] uppercase tracking-widest text-[#8a95a8] mb-1">Waiting for</div>
          <div className="text-xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
            {currentSlot
              ? teams.find(t => t.rosterId === currentSlot.currentRosterId)?.teamName
              : '—'
            }
          </div>
          <div className="text-xs text-[#8a95a8]">
            {currentSlot && `R${currentSlot.round} · Pick ${currentSlot.slot} · ${remaining}s remaining`}
          </div>
        </div>
      )}

      {/* Player list */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a3040] flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-white text-sm">Available Players</h2>
          <div className="flex gap-1.5 flex-wrap">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="bg-[#1a1f27] border border-[#2a3040] rounded-lg px-3 py-1 text-xs text-white focus:outline-none focus:border-[#00e5a0]"
            />
            {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'].map(p => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                className={`px-2 py-1 rounded text-[10px] font-semibold ${
                  posFilter === p ? 'bg-[#00e5a0] text-black' : 'bg-[#1a1f27] text-[#8a95a8]'
                }`}
              >{p}</button>
            ))}
          </div>
        </div>
        <div className="max-h-96 overflow-y-auto divide-y divide-[#2a3040]">
          {available.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#4a5568] text-sm">No players available</div>
          ) : available.map(p => {
            const isSel = selected?.id === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className={`w-full px-5 py-2 flex items-center gap-3 text-left transition-colors ${
                  isSel ? 'bg-[#00e5a0]/15' : 'hover:bg-[#1a1f27]'
                }`}
              >
                <span className="text-[10px] font-bold text-[#4a5568] w-10 text-right">#{p.adp || '—'}</span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-9 text-center ${posColor(p.position)}`}>
                  {p.position}
                </span>
                <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                <span className="text-xs text-[#8a95a8] w-10 text-right">{p.team || 'FA'}</span>
                {isSel && <span className="text-[#00e5a0] text-sm">✓</span>}
              </button>
            );
          })}
        </div>
      </div>

      {isOnTheClock && (
        <div className="sticky bottom-0 bg-[#111418]/95 backdrop-blur border-t border-[#2a3040] -mx-4 md:-mx-8 px-4 md:px-8 py-3 flex items-center justify-between gap-3">
          <div className="flex-1 min-w-0">
            {selected ? (
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${posColor(selected.position)}`}>{selected.position}</span>
                <span className="text-sm font-semibold text-white truncate">{selected.name}</span>
                <span className="text-xs text-[#8a95a8]">{selected.team || 'FA'}</span>
              </div>
            ) : (
              <span className="text-sm text-[#8a95a8]">Select a player to pick</span>
            )}
            {error && <div className="text-xs text-red-400 mt-1">{error}</div>}
          </div>
          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            className="px-5 py-2 bg-[#00e5a0] text-black text-sm font-semibold rounded-xl hover:bg-[#00ffb3] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {submitting ? 'Submitting...' : 'Submit Pick →'}
          </button>
        </div>
      )}
    </div>
  );
}
