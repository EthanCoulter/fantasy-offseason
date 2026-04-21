import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../store';
import { posPill, posBox } from '../utils/posColors';

// Per-manager ordered draft queue. If the clock runs out on this manager's
// pick, the auto-picker walks this list in order and takes the first
// player who is still available (not yet drafted, not somebody's keeper).
//
// Two liveness rules enforced on this page:
//   1. Anyone who is already a keeper OR has already been drafted is
//      completely hidden from the "add to queue" search pool — they're
//      not valid options, period.
//   2. If a player currently sitting in this manager's queue gets
//      drafted or kept elsewhere, they're pruned from the stored queue
//      automatically (the realtime subscription re-hydrates the store,
//      the effect below detects the stale entries, and upserts a cleaned
//      list to Supabase). No manual refresh needed.
export default function DraftQueuePage() {
  const {
    currentUser,
    teams,
    playerDB,
    keepers,
    draftState,
    draftQueues,
    addToQueue,
    removeFromQueue,
    moveInQueue,
    setDraftQueue,
  } = useStore();

  const myRosterId = currentUser?.rosterId;
  const myTeam = teams.find(t => t.rosterId === myRosterId);
  const myQueue = useMemo(
    () => draftQueues?.[myRosterId] || [],
    [draftQueues, myRosterId]
  );

  const [search, setSearch] = useState('');
  const [posFilter, setPosFilter] = useState('ALL');

  // Anyone already drafted (live picks) or already a keeper is "taken"
  // and must never be a valid queue target. This set drives both the
  // search pool filter and the auto-prune effect below.
  const takenIds = useMemo(() => {
    const s = new Set();
    (draftState?.picks || []).forEach(p => s.add(p.playerId));
    Object.values(keepers || {}).forEach(arr => (arr || []).forEach(id => s.add(id)));
    return s;
  }, [draftState?.picks, keepers]);

  // When a player who was in the queue gets drafted or kept (via any
  // device — this page re-renders off the realtime-hydrated store), the
  // effect drops them from storage so the queue stays a live view of
  // reachable targets. A ref guards against re-firing the same upsert
  // for the same cleaned list, which would thrash Supabase.
  const lastPrunedRef = useRef('');
  useEffect(() => {
    if (!myRosterId || myQueue.length === 0) return;
    const cleaned = myQueue.filter(id => !takenIds.has(id));
    if (cleaned.length === myQueue.length) return; // nothing to prune
    const signature = cleaned.join(',');
    if (lastPrunedRef.current === signature) return;
    lastPrunedRef.current = signature;
    setDraftQueue(myRosterId, cleaned);
  }, [myQueue, takenIds, myRosterId, setDraftQueue]);

  const queueSet = useMemo(() => new Set(myQueue), [myQueue]);

  // The on-clock "next target" preview: first queue entry still available.
  // This is exactly what autoPickBPA would pick right now if the manager
  // timed out (before falling back to raw ADP).
  const nextAutoPick = useMemo(() => {
    for (const pid of myQueue) {
      if (takenIds.has(pid)) continue;
      const p = playerDB?.[pid];
      if (!p || !p.position || p.status === 'Retired') continue;
      return { id: pid, player: p };
    }
    return null;
  }, [myQueue, takenIds, playerDB]);

  // Search pool = every playable player who is (a) not already in this
  // manager's queue, (b) not already a keeper on any roster, and
  // (c) not already drafted. Kept + drafted players are filtered out
  // entirely — they're not valid options so we don't show them as
  // disabled rows either. Sorted by Sleeper ADP.
  const searchResults = useMemo(() => {
    const q = search.toLowerCase().trim();
    return Object.entries(playerDB || {})
      .filter(([id, p]) =>
        p &&
        p.position &&
        p.status !== 'Retired' &&
        !queueSet.has(id) &&
        !takenIds.has(id)
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
      .slice(0, 200);
  }, [playerDB, queueSet, search, posFilter, takenIds]);

  const handleAdd = (id) => addToQueue(myRosterId, id);
  const handleRemove = (id) => removeFromQueue(myRosterId, id);
  const handleUp = (i) => moveInQueue(myRosterId, i, i - 1);
  const handleDown = (i) => moveInQueue(myRosterId, i, i + 1);
  const handleClear = () => {
    if (window.confirm('Clear your entire draft queue? This cannot be undone.')) {
      setDraftQueue(myRosterId, []);
    }
  };

  if (!myRosterId) {
    return (
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center text-[#8a95a8]">
        Log in as a manager to build your draft queue.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1
          className="text-xl sm:text-2xl font-black text-white"
          style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}
        >
          DRAFT QUEUE
        </h1>
        <p className="text-[#8a95a8] text-xs sm:text-sm">
          {myTeam?.teamName} · Rank the players you want. If the clock runs out on your pick,
          we'll grab the first one still available.
        </p>
      </div>

      {/* How-it-works card */}
      <div className="bg-[#4da6ff]/10 border border-[#4da6ff]/30 rounded-2xl px-4 py-3 text-xs text-[#4da6ff]">
        <div className="font-semibold mb-1">🤖 Auto-pick fallback</div>
        <div className="text-[#4da6ff]/80">
          Your queue is private to your team. When your pick clock hits zero we walk the
          list top-to-bottom and take the first available player. Players who get drafted
          or kept by anyone are removed from your queue automatically, so your top entry
          is always the one you'd actually get.
        </div>
      </div>

      {/* Next auto-pick preview */}
      <div
        className={`rounded-2xl border p-4 ${
          nextAutoPick
            ? 'bg-[#00e5a0]/10 border-[#00e5a0]/40'
            : 'bg-[#1a1f27] border-[#2a3040]'
        }`}
      >
        <div className="text-[10px] uppercase tracking-widest text-[#8a95a8] mb-1">
          If your clock hit zero right now we'd pick
        </div>
        {nextAutoPick ? (
          <div className="flex items-center gap-3">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded border ${posPill(
                nextAutoPick.player.position
              )}`}
            >
              {nextAutoPick.player.position}
            </span>
            <span
              className="text-lg font-black text-white"
              style={{ fontFamily: 'Bebas Neue, sans-serif' }}
            >
              {nextAutoPick.player.full_name ||
                `${nextAutoPick.player.first_name || ''} ${nextAutoPick.player.last_name || ''}`.trim()}
            </span>
            <span className="text-xs text-[#8a95a8]">
              {nextAutoPick.player.team || 'FA'}
            </span>
          </div>
        ) : (
          <div className="text-sm text-[#8a95a8]">
            {myQueue.length === 0
              ? 'Your queue is empty — we\'d fall back to Best Player Available by ADP.'
              : 'Every player in your queue is already taken — we\'d fall back to Best Player Available by ADP.'}
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a3040] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Your Queue</h2>
            <div className="text-[10px] text-[#4a5568]">
              {myQueue.length} player{myQueue.length === 1 ? '' : 's'} queued
            </div>
          </div>
          {myQueue.length > 0 && (
            <button
              onClick={handleClear}
              className="px-3 py-1.5 text-[11px] font-semibold text-[#8a95a8] border border-[#2a3040] rounded-lg hover:text-red-400 hover:border-red-400/40"
            >
              Clear All
            </button>
          )}
        </div>
        <div className="divide-y divide-[#2a3040] max-h-[420px] overflow-y-auto">
          {myQueue.length === 0 ? (
            <div className="px-5 py-10 text-center text-[#4a5568] text-sm">
              Your queue is empty. Add players below to set your auto-pick priority.
            </div>
          ) : (
            myQueue.map((pid, i) => {
              const p = playerDB?.[pid];
              const name = p
                ? p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim()
                : `Unknown (${pid})`;
              const position = p?.position || 'UNK';
              const team = p?.team || 'FA';

              return (
                <div
                  key={pid}
                  className={`flex items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2.5 ${posBox(position)}`}
                >
                  <span
                    className="text-xs font-bold text-[#00e5a0] w-6 text-center shrink-0"
                    style={{ fontFamily: 'Bebas Neue, sans-serif' }}
                  >
                    #{i + 1}
                  </span>
                  <div className="flex flex-col gap-0.5 shrink-0">
                    <button
                      onClick={() => handleUp(i)}
                      disabled={i === 0}
                      className="px-1.5 py-0.5 text-[10px] bg-[#1a1f27] border border-[#2a3040] rounded text-[#8a95a8] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="Move up"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => handleDown(i)}
                      disabled={i === myQueue.length - 1}
                      className="px-1.5 py-0.5 text-[10px] bg-[#1a1f27] border border-[#2a3040] rounded text-[#8a95a8] hover:text-white disabled:opacity-20 disabled:cursor-not-allowed"
                      aria-label="Move down"
                    >
                      ▼
                    </button>
                  </div>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-10 text-center shrink-0 ${posPill(
                      position
                    )}`}
                  >
                    {position}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white truncate">{name}</div>
                    <div className="text-[10px] text-[#8a95a8]">{team}</div>
                  </div>
                  <button
                    onClick={() => handleRemove(pid)}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#8a95a8] border border-[#2a3040] rounded-lg hover:text-red-400 hover:border-red-400/40 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Search + add */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a3040] space-y-2">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search players to add..."
              className="flex-1 bg-[#0a0c10] border border-[#2a3040] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a0] transition-colors"
            />
            <span className="text-xs text-[#8a95a8] whitespace-nowrap">
              {searchResults.length} result{searchResults.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {['ALL', 'QB', 'RB', 'WR', 'TE', 'K', 'DL', 'LB', 'DB'].map(p => (
              <button
                key={p}
                onClick={() => setPosFilter(p)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold ${
                  posFilter === p ? 'bg-[#00e5a0] text-black' : 'bg-[#1a1f27] text-[#8a95a8]'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-[480px] overflow-y-auto divide-y divide-[#2a3040]">
          {searchResults.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#4a5568] text-sm">
              {Object.keys(playerDB || {}).length === 0
                ? 'Loading player data…'
                : 'No players match your search.'}
            </div>
          ) : (
            searchResults.map(p => (
              <button
                key={p.id}
                onClick={() => handleAdd(p.id)}
                className={`w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors border ${posBox(p.position)} hover:brightness-125 cursor-pointer`}
              >
                <span className="text-[10px] font-bold text-[#4a5568] w-10 text-right shrink-0">
                  #{p.adp || '—'}
                </span>
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded border w-10 text-center shrink-0 ${posPill(
                    p.position
                  )}`}
                >
                  {p.position}
                </span>
                <span className="flex-1 text-sm text-white truncate">{p.name}</span>
                <span className="text-xs text-[#8a95a8] w-10 text-right shrink-0">
                  {p.team || 'FA'}
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded shrink-0 bg-[#00e5a0]/20 text-[#00e5a0]">
                  + ADD
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
