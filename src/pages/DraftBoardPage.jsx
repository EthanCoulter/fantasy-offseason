import React, { useState } from 'react';
import useStore, { ROUNDS, YEARS } from '../store';

// Round-based view for future draft years (no commissioner slot numbers yet).
// For each round 1..ROUNDS, list every original roster's pick, showing
// current owner (and flagging traded ones).
function FutureYearRoundView({ teams, teamAssets, selectedYear, teamColors, getTeamShort, getTeamName }) {
  // Build: picksByRound[round] = [{ originalRosterId, currentOwner, wasTraded }]
  const picksByRound = {};
  for (let r = 1; r <= ROUNDS; r++) picksByRound[r] = [];

  teams.forEach(team => {
    const assets = teamAssets[team.rosterId];
    (assets?.picks || []).forEach(pick => {
      if (pick.year !== selectedYear) return;
      picksByRound[pick.round]?.push({
        originalRosterId: pick.originalRosterId,
        currentOwner: team.rosterId,
        wasTraded: pick.originalRosterId !== team.rosterId,
      });
    });
  });

  // Stable order within a round: by original roster id
  Object.values(picksByRound).forEach(arr =>
    arr.sort((a, b) => a.originalRosterId - b.originalRosterId)
  );

  return (
    <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
      <div className="divide-y divide-[#2a3040]">
        {Array.from({ length: ROUNDS }, (_, i) => i + 1).map(round => (
          <div key={round} className="px-5 py-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-lg bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center">
                <span className="text-base font-black text-white">{round}</span>
              </div>
              <div className="text-xs font-semibold uppercase tracking-widest text-[#8a95a8]">
                Round {round}
              </div>
              <span className="text-[10px] text-[#4a5568] ml-auto">
                {picksByRound[round].length} picks
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
              {picksByRound[round].map((p, i) => (
                <div
                  key={i}
                  className={`rounded-lg px-2 py-2 text-center border ${
                    p.wasTraded
                      ? 'border-[#ff6b35]/40 bg-[#ff6b35]/10'
                      : 'border-[#00e5a0]/20 bg-[#00e5a0]/5'
                  }`}
                  title={
                    p.wasTraded
                      ? `Originally ${getTeamName(p.originalRosterId)}, now ${getTeamName(p.currentOwner)}`
                      : getTeamName(p.currentOwner)
                  }
                >
                  <div
                    className="text-[10px] font-bold truncate leading-tight"
                    style={{ color: teamColors[p.originalRosterId] }}
                  >
                    {getTeamShort(p.originalRosterId)}
                  </div>
                  {p.wasTraded && (
                    <div
                      className="text-[9px] font-semibold truncate leading-tight"
                      style={{ color: teamColors[p.currentOwner] }}
                    >
                      [→ {getTeamShort(p.currentOwner)}]
                    </div>
                  )}
                  <div className="text-[9px] text-[#8a95a8] mt-0.5">R{round}</div>
                </div>
              ))}
              {picksByRound[round].length === 0 && (
                <div className="col-span-full text-xs text-[#4a5568] italic">No picks</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DraftBoardPage() {
  const { teams, teamAssets, draftPositions } = useStore();
  const [selectedYear, setSelectedYear] = useState(YEARS[0]);
  const isCurrentYear = selectedYear === YEARS[0];

  // rank -> original-owner rosterId
  const rankToTeam = {};
  Object.entries(draftPositions).forEach(([rosterId, rank]) => {
    rankToTeam[rank] = Number(rosterId);
  });

  // Build matrix[round][rank] = pick-with-current-owner (or null)
  const pickMatrix = {};
  for (let round = 1; round <= ROUNDS; round++) {
    pickMatrix[round] = {};
    for (let rank = 1; rank <= 12; rank++) pickMatrix[round][rank] = null;
  }

  teams.forEach(team => {
    const assets = teamAssets[team.rosterId];
    if (!assets?.picks) return;
    assets.picks.forEach(pick => {
      if (pick.year !== selectedYear) return;
      if (!pick.position) return; // original owner has no rank yet
      pickMatrix[pick.round][pick.position] = {
        currentOwner: team.rosterId,
        originalOwner: pick.originalRosterId,
        pick,
      };
    });
  });

  const getTeamName = (rosterId) => teams.find(t => t.rosterId === rosterId)?.teamName || '—';
  const getTeamShort = (rosterId) => {
    const t = teams.find(t => t.rosterId === rosterId);
    if (!t) return '—';
    return t.teamName.substring(0, 14);
  };

  const teamColors = {};
  teams.forEach((t, i) => {
    const hues = [180, 30, 280, 120, 0, 210, 50, 330, 160, 90, 260, 20];
    teamColors[t.rosterId] = `hsl(${hues[i % 12]}, 60%, 55%)`;
  });

  const anyAssigned = Object.keys(draftPositions).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
            DRAFT BOARD
          </h1>
          <p className="text-[#8a95a8] text-xs sm:text-sm">Every pick · every round · {anyAssigned ? 'traded picks highlighted' : 'awaiting draft positions'}</p>
        </div>
        <div className="flex gap-1 p-1 bg-[#111418] rounded-xl border border-[#2a3040]">
          {YEARS.map(y => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedYear === y ? 'bg-[#1a1f27] text-white' : 'text-[#8a95a8] hover:text-white'
              }`}
            >
              {y}
            </button>
          ))}
        </div>
      </div>

      {!anyAssigned && isCurrentYear ? (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-sm text-[#8a95a8]">The commissioner needs to assign draft positions first.</div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-[#8a95a8]">
              <span className="w-3 h-3 rounded bg-[#00e5a0]"></span>
              Original owner
            </span>
            <span className="flex items-center gap-1.5 text-[#8a95a8]">
              <span className="w-3 h-3 rounded bg-[#ff6b35]"></span>
              Traded pick
            </span>
            <span className="text-[#4a5568] italic">Format: <span className="text-white">Original</span> [→ <span className="text-[#ff6b35]">Current</span>]</span>
            {!isCurrentYear && (
              <span className="text-[#4da6ff] italic">
                · {selectedYear} picks show round only (slots assigned after next season)
              </span>
            )}
          </div>

          {isCurrentYear ? (
          <>
          {/* Mobile view (< md): round-grouped grid — no horizontal scroll.
              Much friendlier on phones than a 12-col table. */}
          <div className="md:hidden">
            <FutureYearRoundView
              teams={teams}
              teamAssets={teamAssets}
              selectedYear={selectedYear}
              teamColors={teamColors}
              getTeamShort={getTeamShort}
              getTeamName={getTeamName}
            />
          </div>
          {/* Tablet+ view: full 12-column board. Still horizontally scrollable
              if the window is narrow, but md: users get the proper grid. */}
          <div className="hidden md:block bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3040] bg-[#0a0c10]">
                    <th className="sticky left-0 bg-[#0a0c10] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] border-r border-[#2a3040] w-12">
                      Rd
                    </th>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(pos => (
                      <th key={pos} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] min-w-[88px]">
                        <div>Pick {pos}</div>
                        <div className="text-[#4a5568] font-normal truncate" style={{fontSize:'9px'}}>
                          {rankToTeam[pos] ? getTeamShort(rankToTeam[pos]) : '—'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3040]">
                  {Array.from({ length: ROUNDS }, (_, i) => i + 1).map(round => (
                    <tr key={round} className="hover:bg-[#1a1f27]/50">
                      <td className="sticky left-0 bg-[#111418] px-3 py-2.5 text-center text-xs font-bold text-white border-r border-[#2a3040]">
                        {round}
                      </td>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(rank => {
                        const slot = pickMatrix[round][rank];
                        if (!slot) {
                          return (
                            <td key={rank} className="px-2 py-2 text-center">
                              <div className="text-xs text-[#4a5568]">—</div>
                            </td>
                          );
                        }
                        const wasTraded = slot.currentOwner !== slot.originalOwner;
                        const origColor = teamColors[slot.originalOwner];
                        const newColor = teamColors[slot.currentOwner];
                        return (
                          <td key={rank} className="px-1 py-2">
                            <div
                              className={`rounded-lg px-1.5 py-1.5 text-center border transition-all ${
                                wasTraded ? 'border-[#ff6b35]/40 bg-[#ff6b35]/10' : 'border-[#00e5a0]/20 bg-[#00e5a0]/5'
                              }`}
                              title={wasTraded
                                ? `${round}.${String(rank).padStart(2, '0')} — Originally ${getTeamName(slot.originalOwner)}, now owned by ${getTeamName(slot.currentOwner)}`
                                : `${round}.${String(rank).padStart(2, '0')} — ${getTeamName(slot.currentOwner)}`}
                            >
                              <div
                                className="text-[10px] font-bold truncate leading-tight"
                                style={{ color: origColor }}
                              >
                                {getTeamShort(slot.originalOwner)}
                              </div>
                              {wasTraded && (
                                <div className="text-[9px] font-semibold truncate leading-tight" style={{ color: newColor }}>
                                  [→ {getTeamShort(slot.currentOwner)}]
                                </div>
                              )}
                              <div className="text-[9px] text-[#8a95a8] mt-0.5">
                                {round}.{String(rank).padStart(2, '0')}
                              </div>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </>
          ) : (
            <FutureYearRoundView
              teams={teams}
              teamAssets={teamAssets}
              selectedYear={selectedYear}
              teamColors={teamColors}
              getTeamShort={getTeamShort}
              getTeamName={getTeamName}
            />
          )}

          {/* Per-team pick counts */}
          <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3040]">
              <h2 className="font-semibold text-white text-sm">{selectedYear} Picks by Team</h2>
            </div>
            <div className="divide-y divide-[#2a3040]">
              {teams.map(team => {
                const assets = teamAssets[team.rosterId];
                const picks = (assets?.picks || [])
                  .filter(p => p.year === selectedYear)
                  .sort((a, b) =>
                    a.round - b.round ||
                    (a.position || 99) - (b.position || 99) ||
                    a.originalRosterId - b.originalRosterId
                  );
                return (
                  <div key={team.rosterId} className="px-3 sm:px-5 py-3">
                    {/* Top row: avatar, team, count. Always one line. */}
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center shrink-0">
                        {team.avatar
                          ? <img src={team.avatar} alt="" className="w-full h-full object-cover rounded-lg" />
                          : <span className="text-xs font-bold text-[#00e5a0]">{team.displayName[0]?.toUpperCase()}</span>
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-white truncate">{team.teamName}</div>
                        <div className="text-[10px] text-[#4a5568]">Rank {draftPositions[team.rosterId] || '—'}</div>
                      </div>
                      <span className="text-xs text-[#8a95a8] shrink-0">{picks.length} pick{picks.length === 1 ? '' : 's'}</span>
                    </div>
                    {/* Pick pills wrap underneath — no fixed column width to fight with the viewport. */}
                    <div className="flex flex-wrap gap-1 mt-2 pl-11">
                      {picks.length === 0 ? (
                        <span className="text-xs text-[#4a5568]">No picks</span>
                      ) : (
                        picks.map(pick => {
                          const isTraded = pick.originalRosterId !== team.rosterId;
                          const origTeam = isTraded ? getTeamShort(pick.originalRosterId) : null;
                          return (
                            <span
                              key={pick.id}
                              className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                                isTraded
                                  ? 'bg-[#ff6b35]/10 text-[#ff6b35] border-[#ff6b35]/20'
                                  : 'bg-[#4da6ff]/10 text-[#4da6ff] border-[#4da6ff]/20'
                              }`}
                              title={isTraded
                                ? `Originally ${getTeamName(pick.originalRosterId)}'s pick`
                                : 'Original pick'}
                            >
                              {pick.label}{isTraded && origTeam ? ` [${origTeam}]` : ''}
                            </span>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
