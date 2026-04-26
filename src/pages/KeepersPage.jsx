import React, { useState, useMemo } from 'react';
import useStore, { isOffensiveForTeam, BASE_OFFENSE_KEEPERS, BASE_DEFENSE_KEEPERS } from '../store';
import { posPill, posBox, posBoxOn } from '../utils/posColors';

export default function KeepersPage() {
  const { currentUser, teams, playerDB, keepers, setKeepers, draftPositions, slotsBurned, getMaxKeeperSlots, bonusPlayers, trades } = useStore();
  const [search, setSearch] = useState('');
  const [saved, setSaved] = useState(false);

  const myRosterId = currentUser?.rosterId;
  const myTeam = teams.find(t => t.rosterId === myRosterId);
  const myKeepers = keepers[myRosterId] || [];
  const myDraftPos = draftPositions[myRosterId];

  const burned = slotsBurned[myRosterId] || { offense: 0, defense: 0 };
  const maxSlots = getMaxKeeperSlots(myRosterId);
  const maxOffense = maxSlots.offense;
  const maxDefense = maxSlots.defense;
  const bonusOffense = maxSlots.bonusOffense || 0;
  const bonusDefense = maxSlots.bonusDefense || 0;

  const myBonusIds = useMemo(
    () => bonusPlayers?.[myRosterId] || [],
    [bonusPlayers, myRosterId]
  );
  const bonusIdSet = useMemo(() => new Set(myBonusIds), [myBonusIds]);

  // Regular keepers = kept players that are NOT bonus-locked
  const regularOffenseKeepers = myKeepers.filter(id => {
    const p = playerDB[id];
    return p && isOffensiveForTeam(p, myTeam) && !bonusIdSet.has(id);
  });
  const regularDefenseKeepers = myKeepers.filter(id => {
    const p = playerDB[id];
    return p && !isOffensiveForTeam(p, myTeam) && !bonusIdSet.has(id);
  });
  const bonusOffensePlayers = myBonusIds.filter(id => {
    const p = playerDB[id];
    return p && isOffensiveForTeam(p, myTeam);
  });
  const bonusDefensePlayers = myBonusIds.filter(id => {
    const p = playerDB[id];
    return p && !isOffensiveForTeam(p, myTeam);
  });

  // Back-compat vars used further down
  const offenseKeepers = regularOffenseKeepers;
  const defenseKeepers = regularDefenseKeepers;

  // Track current player ownership across all rosters by walking accepted
  // trades in chronological order. `myTeam.players` is the Sleeper raw
  // roster (plus drafted players) and is NEVER updated by trades — so a
  // player traded away (e.g. Josh Jacobs after a Kirk → Ben swap) would
  // otherwise still appear as a selectable keeper option for the original
  // owner. Walk every accepted trade and flip ownership: fromAssets
  // players move from fromRosterId → toRosterId, and vice versa.
  // Whatever roster owns the player at the end is the only one allowed
  // to keep them.
  const playerOwnership = useMemo(() => {
    const ownership = {};
    (teams || []).forEach(t => {
      (t.players || []).forEach(pid => { ownership[pid] = t.rosterId; });
    });
    (trades || [])
      .filter(t => t && t.status === 'accepted')
      .slice()
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
      .forEach(trade => {
        (trade.fromAssets || []).filter(a => a.type === 'player').forEach(p => {
          ownership[p.id] = trade.toRosterId;
        });
        (trade.toAssets || []).filter(a => a.type === 'player').forEach(p => {
          ownership[p.id] = trade.fromRosterId;
        });
      });
    return ownership;
  }, [teams, trades]);

  const myPlayers = useMemo(() => {
    if (!myTeam) return [];
    return (myTeam.players || [])
      // Drop players who no longer belong to this manager because they were
      // traded away in an accepted trade. Without this filter the original
      // Sleeper roster keeps surfacing them as legal keeper picks even
      // though they're now another team's asset.
      .filter(id => playerOwnership[id] === myRosterId)
      .map(id => {
        const p = playerDB[id];
        if (!p) return null;
        return { id, name: `${p.first_name} ${p.last_name}`, position: p.position, nflTeam: p.team };
      })
      .filter(Boolean)
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.position.toLowerCase().includes(search.toLowerCase()) ||
        (p.nflTeam || '').toLowerCase().includes(search.toLowerCase())
      )
      .sort((a, b) => {
        const order = ['QB','RB','WR','TE','K','DEF'];
        return (order.indexOf(a.position) - order.indexOf(b.position)) || a.name.localeCompare(b.name);
      });
  }, [myTeam, playerDB, search, playerOwnership, myRosterId]);

  const toggleKeeper = (player) => {
    // Bonus-locked players cannot be toggled off — they're forced keepers.
    if (bonusIdSet.has(player.id)) return;
    const isSelected = myKeepers.includes(player.id);
    if (isSelected) {
      setKeepers(myRosterId, myKeepers.filter(id => id !== player.id));
      setSaved(false);
      return;
    }
    const off = isOffensiveForTeam({ ...player, full_name: player.name }, myTeam);
    if (off && regularOffenseKeepers.length >= maxOffense) return;
    if (!off && regularDefenseKeepers.length >= maxDefense) return;
    setKeepers(myRosterId, [...myKeepers, player.id]);
    setSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const offSlots = maxOffense - offenseKeepers.length;
  const defSlots = maxDefense - defenseKeepers.length;
  const hasBurnedSlots = burned.offense > 0 || burned.defense > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
          SELECT KEEPERS
        </h1>
        <p className="text-[#8a95a8] text-xs sm:text-sm">
          Choose up to {maxOffense} offensive and {maxDefense} defensive player{maxDefense !== 1 ? 's' : ''} to keep
          {(bonusOffense > 0 || bonusDefense > 0) && (
            <span className="text-[#4da6ff]">
              {' '}· + {bonusOffense + bonusDefense} locked bonus slot{(bonusOffense + bonusDefense) > 1 ? 's' : ''} from trades
            </span>
          )}
        </p>
      </div>

      {!myDraftPos && (
        <div className="bg-yellow-400/10 border border-yellow-400/20 rounded-xl px-4 py-3 text-yellow-400 text-sm">
          ⚠️ The commissioner hasn't assigned your draft position yet. You can still select keepers.
        </div>
      )}

      {hasBurnedSlots && (
        <div className="bg-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-xl px-4 py-3 text-[#ff6b35] text-sm">
          <div className="font-semibold mb-1">🔥 Burned slots from trades:</div>
          <div className="text-xs text-[#ff6b35]/80">
            {burned.offense > 0 && <span>You've lost {burned.offense} offensive keeper slot{burned.offense > 1 ? 's' : ''}. </span>}
            {burned.defense > 0 && <span>You've lost {burned.defense} defensive keeper slot{burned.defense > 1 ? 's' : ''}. </span>}
            Max now: {maxOffense} offense, {maxDefense} defense.
          </div>
        </div>
      )}

      {/* Slots display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">Offensive Keepers</span>
            <span className="text-xs text-[#4a5568]">
              {regularOffenseKeepers.length}/{maxOffense}
              {bonusOffense > 0 && (
                <span className="text-[#4da6ff]"> + {bonusOffensePlayers.length}/{bonusOffense} bonus</span>
              )}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: BASE_OFFENSE_KEEPERS }).map((_, i) => {
              const keeperId = regularOffenseKeepers[i];
              const p = keeperId ? playerDB[keeperId] : null;
              const isBurned = i >= maxOffense;
              return (
                <div
                  key={i}
                  className={`flex-1 basis-16 min-w-[56px] sm:min-w-[80px] h-14 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                    isBurned
                      ? 'border-[#ff6b35]/40 bg-[#ff6b35]/5 border-dashed'
                      : p
                        ? `${posBoxOn(p.position)} border-solid`
                        : 'border-[#2a3040] bg-[#0a0c10] border-dashed'
                  }`}
                >
                  {isBurned ? (
                    <>
                      <span className="text-xs text-[#ff6b35]">🔥 BURNED</span>
                      <span className="text-[10px] text-[#ff6b35]/60">traded away</span>
                    </>
                  ) : p ? (
                    <>
                      <span className="text-xs font-bold text-white leading-tight">{p.first_name[0]}. {p.last_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 border ${posPill(p.position)}`}>{p.position}</span>
                    </>
                  ) : (
                    <span className="text-[#4a5568] text-xs">Empty</span>
                  )}
                </div>
              );
            })}
            {bonusOffensePlayers.map(id => {
              const p = playerDB[id];
              return (
                <div
                  key={`bonus-off-${id}`}
                  className={`flex-1 basis-16 min-w-[56px] sm:min-w-[80px] h-14 rounded-xl border-2 flex flex-col items-center justify-center text-center ${p ? posBoxOn(p.position) : 'border-[#4da6ff]/50 bg-[#4da6ff]/5'}`}
                  title="Bonus keeper — locked from trade"
                >
                  {p ? (
                    <>
                      <span className="text-xs font-bold text-white leading-tight">🔒 {p.first_name[0]}. {p.last_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 border ${posPill(p.position)}`}>{p.position}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-[#4da6ff]">🔒 Bonus</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">Defensive Keeper</span>
            <span className="text-xs text-[#4a5568]">
              {regularDefenseKeepers.length}/{maxDefense}
              {bonusDefense > 0 && (
                <span className="text-[#4da6ff]"> + {bonusDefensePlayers.length}/{bonusDefense} bonus</span>
              )}
            </span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {Array.from({ length: BASE_DEFENSE_KEEPERS }).map((_, i) => {
              const keeperId = regularDefenseKeepers[i];
              const p = keeperId ? playerDB[keeperId] : null;
              const isBurned = i >= maxDefense;
              return (
                <div
                  key={i}
                  className={`flex-1 h-14 rounded-xl border-2 flex flex-col items-center justify-center text-center transition-all ${
                    isBurned
                      ? 'border-[#ff6b35]/40 bg-[#ff6b35]/5 border-dashed'
                      : p
                        ? `${posBoxOn(p.position)} border-solid`
                        : 'border-[#2a3040] bg-[#0a0c10] border-dashed'
                  }`}
                >
                  {isBurned ? (
                    <>
                      <span className="text-xs text-[#ff6b35]">🔥 BURNED</span>
                      <span className="text-[10px] text-[#ff6b35]/60">traded away</span>
                    </>
                  ) : p ? (
                    <>
                      <span className="text-xs font-bold text-white">{p.first_name[0]}. {p.last_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 border ${posPill(p.position)}`}>{p.position}</span>
                    </>
                  ) : (
                    <span className="text-[#4a5568] text-xs">Empty</span>
                  )}
                </div>
              );
            })}
            {bonusDefensePlayers.map(id => {
              const p = playerDB[id];
              return (
                <div
                  key={`bonus-def-${id}`}
                  className={`flex-1 h-14 rounded-xl border-2 flex flex-col items-center justify-center text-center ${p ? posBoxOn(p.position) : 'border-[#4da6ff]/50 bg-[#4da6ff]/5'}`}
                  title="Bonus keeper — locked from trade"
                >
                  {p ? (
                    <>
                      <span className="text-xs font-bold text-white">🔒 {p.first_name[0]}. {p.last_name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded mt-0.5 border ${posPill(p.position)}`}>{p.position}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-[#4da6ff]">🔒 Bonus</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Search + Player list */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2a3040] flex items-center gap-3">
          <input
            type="text"
            placeholder="Search players..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 bg-[#0a0c10] border border-[#2a3040] rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-[#00e5a0] transition-colors"
          />
          <span className="text-xs text-[#8a95a8] whitespace-nowrap">{myPlayers.length} players</span>
        </div>

        <div className="divide-y divide-[#2a3040] max-h-[420px] overflow-y-auto">
          {myPlayers.length === 0 ? (
            <div className="text-center py-10 text-[#4a5568] text-sm">
              {Object.keys(playerDB).length === 0 ? 'Loading player data...' : 'No players found'}
            </div>
          ) : (
            myPlayers.map(player => {
              const isSelected = myKeepers.includes(player.id);
              const isBonus = bonusIdSet.has(player.id);
              const off = isOffensiveForTeam({ ...player, full_name: player.name }, myTeam);
              const canAdd = isBonus
                ? false
                : isSelected || (off ? regularOffenseKeepers.length < maxOffense : regularDefenseKeepers.length < maxDefense);

              return (
                <div
                  key={player.id}
                  onClick={() => !isBonus && canAdd && toggleKeeper(player)}
                  className={`flex items-center gap-4 px-4 py-3 transition-all ${
                    isBonus
                      ? 'bg-[#4da6ff]/5 cursor-not-allowed'
                      : isSelected
                        ? posBoxOn(player.position)
                        : canAdd
                          ? `${posBox(player.position)} hover:brightness-125 cursor-pointer`
                          : `${posBox(player.position)} opacity-40 cursor-not-allowed`
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all ${
                    isBonus
                      ? 'border-[#4da6ff] bg-[#4da6ff]'
                      : isSelected
                        ? 'border-[#00e5a0] bg-[#00e5a0]'
                        : 'border-[#2a3040]'
                  }`}>
                    {isBonus ? <span className="text-black text-xs font-bold">🔒</span>
                      : isSelected && <span className="text-black text-xs font-bold">✓</span>}
                  </div>

                  <span className={`text-xs px-2 py-0.5 rounded border font-semibold w-10 text-center ${posPill(player.position)}`}>
                    {player.position}
                  </span>

                  <div className="flex-1">
                    <div className="text-sm font-medium text-white">{player.name}</div>
                    {player.nflTeam && <div className="text-xs text-[#4a5568]">{player.nflTeam}</div>}
                  </div>

                  {isBonus ? (
                    <span className="text-[10px] text-[#4da6ff] font-semibold">🔒 BONUS LOCKED</span>
                  ) : isSelected ? (
                    <span className="text-[10px] text-[#00e5a0] font-semibold">KEEPER</span>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-[#4a5568]">
          {offSlots} offensive · {defSlots} defensive slot{defSlots !== 1 ? 's' : ''} remaining
        </p>
        <button
          onClick={handleSave}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            saved
              ? 'bg-[#00e5a0]/20 text-[#00e5a0] border border-[#00e5a0]/30'
              : 'bg-[#00e5a0] text-black hover:bg-[#00ffb3]'
          }`}
        >
          {saved ? '✓ Saved!' : 'Save Keepers'}
        </button>
      </div>
    </div>
  );
}
