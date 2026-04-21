import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore, { clockSecondsForRound, YEARS, ROUNDS, testDiscordWebhook, sendTestTradeAlert } from '../store';
import { downloadCsv, buildDraftRecapCsv, buildLeagueRosterCsv } from '../utils/csv';
import { posPill, posBoxOn } from '../utils/posColors';

const DRAFT_SOUND_URL = '/draft-pick.mp3';
// Sound only plays for picks in these rounds — later rounds are quick-fire
// and the alert would get annoying fast.
const SOUND_ROUNDS = new Set([1, 2, 3]);

export default function DraftRoomPage() {
  const {
    currentUser,
    teams,
    draftPositions,
    playerDB,
    keepers,
    teamAssets,
    draftState,
    draftOrder,
    setDraftMode,
    makeDraftPick,
    autoPickBPA,
    undoLastDraftPick,
    resetDraft,
    resetPickClock,
  } = useStore();

  const isCommish = !!currentUser?.isCommissioner;
  const [now, setNow] = useState(Date.now());
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');
  const lastPickIdxRef = useRef(-1);
  const audioRef = useRef(null);
  // flash has two phases: 'big' = full-screen overlay (~5s), then 'small' =
  // inline card that lives below the timer until the next pick lands.
  const [flash, setFlash] = useState(null);

  // 1s ticker for clock readouts
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Fire sound + trigger big-phase animation when a new pick lands.
  // NOTE: the 5s→small transition lives in a separate effect so that any
  // re-render during the big phase (realtime updates, teams ref churn) can't
  // wipe the pending timer and strand the overlay.
  useEffect(() => {
    const picks = draftState.picks || [];
    if (picks.length === 0) { lastPickIdxRef.current = -1; return; }
    const lastIdx = picks.length - 1;
    if (lastIdx <= lastPickIdxRef.current) return;
    lastPickIdxRef.current = lastIdx;
    const p = picks[lastIdx];
    const team = teams.find(t => t.rosterId === p.rosterId);
    setFlash({
      phase: 'big',
      pickIndex: p.pickIndex,
      round: p.round,
      slot: p.slot,
      team: team?.teamName || 'Unknown',
      player: p.playerName,
      playerId: p.playerId,
      pos: p.position,
      nflTeam: p.nflTeam,
    });
    if (audioRef.current && SOUND_ROUNDS.has(p.round)) {
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(() => {});
    }
  }, [draftState.picks, teams]);

  // Shrink the big overlay to the inline card after 5s. Keyed on the pick
  // index so only a genuinely new big-phase pick resets the timer.
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

  const picksCount = (draftState.picks || []).length;
  const totalPicks = draftOrder.length;
  const currentSlot = draftOrder[picksCount] || null;
  const currentTeam = currentSlot ? teams.find(t => t.rosterId === currentSlot.currentRosterId) : null;
  const originalTeam = currentSlot && currentSlot.originalRosterId !== currentSlot.currentRosterId
    ? teams.find(t => t.rosterId === currentSlot.originalRosterId)
    : null;

  const clockSecs = currentSlot ? clockSecondsForRound(currentSlot.round) : 0;
  const elapsed = draftState.currentPickStartTime
    ? Math.floor((now - draftState.currentPickStartTime) / 1000)
    : 0;
  const remaining = Math.max(0, clockSecs - elapsed);
  const timerDanger = remaining <= 15 && remaining > 0;
  const timerExpired = draftState.isActive && remaining === 0 && !!currentSlot;

  // Players already off the board (drafted or kept) — excluded from picker
  const takenIds = useMemo(() => {
    const s = new Set();
    (draftState.picks || []).forEach(p => s.add(p.playerId));
    Object.values(keepers).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [draftState.picks, keepers]);

  const availablePlayers = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(playerDB || {})
      .filter(([id, p]) =>
        p && p.position && p.status !== 'Retired' && !takenIds.has(id)
      )
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
      .slice(0, 300);
  }, [playerDB, takenIds, search, posFilter]);

  const handleCommishPick = async (playerId) => {
    if (!currentSlot) return;
    await makeDraftPick({ rosterId: currentSlot.currentRosterId, playerId });
  };

  const handleStart = async () => {
    if (totalPicks === 0) {
      alert('Cannot start — draft order is empty. Make sure every team has a draft position assigned.');
      return;
    }
    await setDraftMode(true, draftState.isTrial);
  };

  const handleStop = async () => {
    await setDraftMode(false, draftState.isTrial);
  };

  const handleToggleTrial = async () => {
    // Flip the trial flag. If draft is mid-progress, warn.
    if ((draftState.picks || []).length > 0 && !window.confirm('Switching trial mode will re-label existing picks. Continue?')) return;
    await setDraftMode(draftState.isActive, !draftState.isTrial);
  };

  const handleTestWebhook = async () => {
    const r = await testDiscordWebhook();
    if (r.ok) {
      alert('✅ Discord webhook is working — check the #trade-alerts channel.');
    } else {
      const msg = [
        '❌ Discord webhook failed.',
        r.status ? `HTTP ${r.status}` : null,
        r.error,
        r.detail,
      ].filter(Boolean).join('\n\n');
      alert(msg);
    }
  };

  // Fires the full Schefter-style trade alert (identical formatting to a
  // real accepted trade) using entirely fake team/player/pick data —
  // nothing in the league state is mutated. Confirm first because this
  // still pings @everyone in the channel.
  const handlePreviewTradeAlert = async () => {
    const ok = window.confirm(
      'Send a TEST trade alert to the #trade-alerts channel?\n\n' +
      '• Uses fake team/player/pick names (no real league data)\n' +
      '• Will still ping @everyone in the channel\n' +
      '• Lets you preview the exact formatting real trades will use'
    );
    if (!ok) return;
    const r = await sendTestTradeAlert();
    if (r.ok) {
      alert('✅ Test trade alert sent — check the #trade-alerts channel.');
    } else {
      const msg = [
        '❌ Test trade alert failed.',
        r.status ? `HTTP ${r.status}` : null,
        r.error,
        r.detail,
      ].filter(Boolean).join('\n\n');
      alert(msg);
    }
  };

  const handleDownloadCsv = () => {
    const rows = buildDraftRecapCsv({ teams, draftState, draftOrder });
    if (rows.length <= 1) {
      alert('No picks yet — nothing to export.');
      return;
    }
    const suffix = draftState.isTrial ? '-TRIAL' : '';
    downloadCsv(`${YEARS[0]}-draft-recap${suffix}.csv`, rows);
  };

  // Full final-roster export — keepers + drafted players + remaining
  // current-year picks + every future-year pick, one column per year.
  // This is what the commissioner wants the instant the draft ends so
  // the league sheet can be updated in one paste.
  const handleDownloadRostersCsv = () => {
    const rows = buildLeagueRosterCsv({
      teams, teamAssets, playerDB, draftState,
      currentYear: YEARS[0],
      years: YEARS,
    });
    const suffix = draftState.isTrial ? '-TRIAL' : '';
    downloadCsv(`league-rosters-${YEARS[0]}${suffix}.csv`, rows);
  };

  const handleResetConfirmed = async () => {
    setConfirmingReset(false);
    await resetDraft();
  };

  if (!isCommish) {
    return (
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center text-[#8a95a8]">
        The Draft Room is commissioner-only. Managers see their pick tab when the draft is live.
      </div>
    );
  }

  // --- Draft board grid: teams × rounds, filled as picks land ---
  const teamsBySlot = [...teams].filter(t => draftPositions[t.rosterId]).sort(
    (a, b) => draftPositions[a.rosterId] - draftPositions[b.rosterId]
  );
  const pickByCell = {};
  (draftState.picks || []).forEach(p => {
    pickByCell[`${p.round}_${p.slot}`] = p;
  });
  // Who actually owns the pick at (round, slot) right now — honors trades.
  const orderByCell = {};
  draftOrder.forEach(o => { orderByCell[`${o.round}_${o.slot}`] = o; });

  return (
    <div className="space-y-6">
      <audio ref={audioRef} src={DRAFT_SOUND_URL} preload="auto" />

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-black text-white"
            style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
          >
            DRAFT ROOM · {YEARS[0]}
          </h1>
          <p className="text-[#8a95a8] text-sm">
            {draftState.isActive ? (
              <span className="text-[#00e5a0] font-semibold">● LIVE</span>
            ) : draftState.endedAt ? (
              <span className="text-[#4a5568]">Complete</span>
            ) : (
              <span className="text-[#8a95a8]">Not started</span>
            )}
            {draftState.isTrial && (
              <span className="ml-3 text-yellow-400 font-semibold">🧪 TRIAL MODE</span>
            )}
            {' · '}
            {picksCount}/{totalPicks} picks made
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleToggleTrial}
            className={`px-3 py-1.5 text-xs font-semibold rounded-xl border transition-colors ${
              draftState.isTrial
                ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/40'
                : 'bg-[#1a1f27] text-[#8a95a8] border-[#2a3040] hover:text-white'
            }`}
          >
            🧪 Trial Mode {draftState.isTrial ? 'ON' : 'OFF'}
          </button>
          {!draftState.isActive ? (
            <button
              onClick={handleStart}
              className="px-4 py-1.5 text-xs font-semibold bg-[#00e5a0] text-black rounded-xl hover:bg-[#00ffb3] transition-colors"
            >▶ Start Draft</button>
          ) : (
            <button
              onClick={handleStop}
              className="px-4 py-1.5 text-xs font-semibold bg-[#ff6b35]/20 text-[#ff6b35] border border-[#ff6b35]/40 rounded-xl hover:bg-[#ff6b35]/30 transition-colors"
            >⏸ Pause</button>
          )}
          <button
            onClick={handleDownloadCsv}
            className="px-3 py-1.5 text-xs font-semibold bg-[#4da6ff]/20 text-[#4da6ff] border border-[#4da6ff]/40 rounded-xl hover:bg-[#4da6ff]/30 transition-colors"
            title="Pick-by-pick draft recap — one row per team, one column per round"
          >⬇ Draft Recap CSV</button>
          <button
            onClick={handleDownloadRostersCsv}
            className="px-3 py-1.5 text-xs font-semibold bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/40 rounded-xl hover:bg-[#00e5a0]/30 transition-colors"
            title="Final roster export — keepers + drafted players + remaining current-year picks + future-year picks (e.g. 2027), one column per year. Ready to paste end-of-draft."
          >⬇ Rosters CSV</button>
          <button
            onClick={handleTestWebhook}
            className="px-3 py-1.5 text-xs font-semibold bg-purple-500/15 text-purple-400 border border-purple-500/40 rounded-xl hover:bg-purple-500/25 transition-colors"
          >🧪 Test Discord</button>
          <button
            onClick={handlePreviewTradeAlert}
            className="px-3 py-1.5 text-xs font-semibold bg-[#ff6b35]/15 text-[#ff6b35] border border-[#ff6b35]/40 rounded-xl hover:bg-[#ff6b35]/25 transition-colors"
            title="Sends a fake trade alert with the real formatting so you can preview exactly how Discord will render it. Uses test names — no real rosters touched."
          >🚨 Preview Trade Alert</button>
          <button
            onClick={() => setConfirmingReset(true)}
            className="px-3 py-1.5 text-xs font-semibold bg-red-500/10 text-red-400 border border-red-500/30 rounded-xl hover:bg-red-500/20 transition-colors"
          >Reset</button>
        </div>
      </div>

      {confirmingReset && (
        <div className="bg-red-500/10 border border-red-500/40 rounded-2xl p-4 flex items-center justify-between gap-4">
          <div className="text-sm text-red-400">
            Wipe every draft pick? {draftState.isTrial ? 'Trial picks will be cleared.' : 'Real picks will be permanently removed.'}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setConfirmingReset(false)} className="px-3 py-1.5 text-xs text-[#8a95a8] border border-[#2a3040] rounded-lg">Cancel</button>
            <button onClick={handleResetConfirmed} className="px-3 py-1.5 text-xs font-semibold bg-red-500 text-white rounded-lg">Yes, Wipe</button>
          </div>
        </div>
      )}

      {/* On-the-Clock banner */}
      {currentSlot ? (
        <div className={`relative overflow-hidden rounded-2xl border-2 ${
          timerExpired
            ? 'bg-red-500/10 border-red-500/60'
            : timerDanger
              ? 'bg-yellow-500/10 border-yellow-500/60 animate-pulse'
              : 'bg-[#00e5a0]/5 border-[#00e5a0]/40'
        }`}>
          <div className="px-5 py-4 flex items-center gap-5 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-[#8a95a8]">On the Clock</div>
              <div
                className="text-3xl md:text-4xl font-black text-white"
                style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.03em' }}
              >
                {currentTeam?.teamName || '—'}
              </div>
              <div className="text-xs text-[#8a95a8]">
                Round {currentSlot.round}, Pick {currentSlot.slot} (overall #{currentSlot.pickIndex + 1})
                {originalTeam && (
                  <span className="text-[#ff6b35] ml-2">via trade from {originalTeam.teamName}</span>
                )}
              </div>
            </div>
            <div className="ml-auto text-center">
              <div
                className={`text-5xl font-black tabular-nums ${
                  timerExpired ? 'text-red-400' : timerDanger ? 'text-yellow-400' : 'text-[#00e5a0]'
                }`}
                style={{ fontFamily: 'Bebas Neue, sans-serif' }}
              >
                {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
              </div>
              <div className="text-[10px] uppercase tracking-widest text-[#8a95a8]">
                {clockSecs}s on the clock
              </div>
            </div>
          </div>

          <div className="px-5 pb-4 flex flex-wrap gap-2">
            <button
              onClick={autoPickBPA}
              className="px-3 py-1.5 text-xs font-semibold bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/40 rounded-lg hover:bg-[#00e5a0]/30"
            >⚡ Auto-pick (BPA)</button>
            <button
              onClick={resetPickClock}
              className="px-3 py-1.5 text-xs font-semibold bg-[#1a1f27] text-[#8a95a8] border border-[#2a3040] rounded-lg hover:text-white"
            >↻ Reset Clock</button>
            <button
              onClick={undoLastDraftPick}
              disabled={picksCount === 0}
              className="px-3 py-1.5 text-xs font-semibold bg-[#1a1f27] text-[#8a95a8] border border-[#2a3040] rounded-lg hover:text-white disabled:opacity-30"
            >↶ Undo Last</button>
          </div>
        </div>
      ) : draftState.endedAt ? (
        <div className="bg-[#00e5a0]/10 border border-[#00e5a0]/30 rounded-2xl p-6 text-center">
          <div className="text-3xl mb-1">🏆</div>
          <div className="text-xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>DRAFT COMPLETE</div>
          <div className="text-xs text-[#8a95a8] mt-1">Download the CSV to share with the league.</div>
        </div>
      ) : (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-6 text-center text-[#8a95a8] text-sm">
          {totalPicks === 0
            ? 'Assign every team a draft position on the Commissioner page first.'
            : 'Ready — click Start Draft to go live.'}
        </div>
      )}

      {/* Big full-screen pick overlay — 5s slam, then shrinks to the card below.
          Tap anywhere (or the X) to dismiss early — protects against any stuck-
          overlay scenarios on mobile. */}
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
              {/* Shine sweep */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                <div className="absolute top-0 bottom-0 w-1/3 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-pick-shine" />
              </div>

              <div className="relative flex flex-col md:flex-row items-center gap-6 p-8 md:p-12">
                {/* Headshot */}
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
                  <div className={`absolute -bottom-2 -right-2 px-3 py-1 rounded-lg border-2 font-black text-sm ${posPill(flash.pos)}`}>
                    {flash.pos}
                  </div>
                </div>

                {/* Info */}
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

      {/* Inline last-pick card — shows below timer after the big animation */}
      {flash && flash.phase === 'small' && (
        <div className="bg-[#4da6ff]/10 border border-[#4da6ff]/40 rounded-2xl p-5 flex items-center gap-4 animate-fade-in">
          {flash.playerId && (
            <img
              src={`https://sleepercdn.com/content/nfl/players/${flash.playerId}.jpg`}
              alt={flash.player}
              className="w-14 h-14 rounded-full object-cover border-2 border-[#4da6ff]/60 bg-[#1a1f27] shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-widest text-[#4da6ff]">Pick #{flash.pickIndex + 1}</div>
            <div className="text-lg font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
              {flash.team} selects {flash.player}
            </div>
            <div className="flex items-center gap-2 text-xs mt-1">
              <span className={`px-1.5 py-0.5 rounded border font-semibold ${posPill(flash.pos)}`}>{flash.pos}</span>
              {flash.nflTeam && <span className="text-[#8a95a8]">{flash.nflTeam}</span>}
            </div>
          </div>
        </div>
      )}

      {/* Commissioner can pick on behalf (useful for in-person draft when a
          manager is away from a device). */}
      {currentSlot && draftState.isActive && (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
          <div className="px-5 py-3 border-b border-[#2a3040] flex items-center justify-between flex-wrap gap-2">
            <h2 className="font-semibold text-white text-sm">Make pick for {currentTeam?.teamName}</h2>
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
          <div className="max-h-80 overflow-y-auto divide-y divide-[#2a3040]">
            {availablePlayers.length === 0 ? (
              <div className="px-5 py-6 text-center text-[#4a5568] text-sm">No players found</div>
            ) : availablePlayers.map(p => (
              <button
                key={p.id}
                onClick={() => handleCommishPick(p.id)}
                className="w-full px-5 py-2 flex items-center gap-3 hover:bg-[#1a1f27] text-left"
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
      )}

      {/* Full draft board: teams × rounds */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-[#2a3040] flex items-center justify-between">
          <h2 className="font-semibold text-white text-sm">Draft Board</h2>
          <div className="text-[10px] text-[#4a5568] uppercase tracking-wider">
            Linear · Rounds 1-4 get 120s · 5-{ROUNDS} get 60s
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-[10px]">
            <thead>
              <tr className="border-b border-[#2a3040]">
                <th className="px-2 py-2 text-left text-[#8a95a8] sticky left-0 bg-[#111418] z-10">Round</th>
                {teamsBySlot.map(t => (
                  <th key={t.rosterId} className="px-2 py-2 text-left text-[#8a95a8] truncate max-w-[120px]">
                    {draftPositions[t.rosterId]}. {t.teamName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: ROUNDS }, (_, i) => i + 1).map(round => (
                <tr key={round} className="border-b border-[#2a3040]">
                  <td className="px-2 py-2 font-bold text-[#8a95a8] sticky left-0 bg-[#111418] z-10">R{round}</td>
                  {teamsBySlot.map(team => {
                    const slot = draftPositions[team.rosterId];
                    const pick = pickByCell[`${round}_${slot}`];
                    const isOnTheClock =
                      currentSlot && currentSlot.round === round && currentSlot.slot === slot;
                    if (pick) {
                      // Who actually made the pick. Usually the column's team,
                      // but after a trade the drafter may differ — show the
                      // true drafter so it's obvious who selected the player.
                      const drafter = teams.find(t => t.rosterId === pick.rosterId);
                      return (
                        <td key={team.rosterId} className={`px-2 py-1.5 align-top ${posBoxOn(pick.position)} border-l border-[#2a3040]`}>
                          <div className="text-[10px] font-bold text-white truncate max-w-[120px]">
                            {pick.playerName}
                          </div>
                          <div className="text-[9px] opacity-80 truncate max-w-[120px]">
                            {pick.position}{pick.nflTeam ? ` · ${pick.nflTeam}` : ''}
                          </div>
                          {drafter && (
                            <div className="text-[9px] font-semibold text-[#00e5a0] truncate max-w-[120px] mt-0.5">
                              by {drafter.teamName}
                            </div>
                          )}
                          {drafter?.displayName && (
                            <div className="text-[9px] text-[#8a95a8] truncate max-w-[120px]">
                              {drafter.displayName}
                            </div>
                          )}
                        </td>
                      );
                    }
                    // No pick yet — show the manager's team name so the board
                    // reads like a standard draft board. If the pick's been
                    // traded, show the current owner (with a tiny "via" tag).
                    const entry = orderByCell[`${round}_${slot}`];
                    const currentOwner = entry
                      ? teams.find(t => t.rosterId === entry.currentRosterId)
                      : null;
                    const owner = currentOwner || team;
                    const tradedFrom = entry && entry.currentRosterId !== entry.originalRosterId
                      ? teams.find(t => t.rosterId === entry.originalRosterId)
                      : null;
                    return (
                      <td
                        key={team.rosterId}
                        className={`px-2 py-1.5 border-l border-[#2a3040] align-top ${
                          isOnTheClock ? 'bg-[#00e5a0]/15 animate-pulse' : ''
                        }`}
                      >
                        <div className="text-[10px] font-semibold text-white truncate max-w-[120px]">
                          {owner?.teamName || '—'}
                        </div>
                        {tradedFrom && (
                          <div className="text-[9px] text-[#ff6b35] truncate max-w-[120px]">
                            via {tradedFrom.teamName}
                          </div>
                        )}
                        {isOnTheClock && (
                          <div className="text-[9px] text-[#00e5a0] font-bold mt-0.5">ON THE CLOCK</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
