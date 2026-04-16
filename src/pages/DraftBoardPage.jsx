import React, { useState } from 'react';
import useStore, { ROUNDS } from '../store';

const YEAR = new Date().getFullYear();

export default function DraftBoardPage() {
  const { teams, teamAssets, draftPositions } = useStore();
  const [selectedYear, setSelectedYear] = useState(YEAR);

  // Build a matrix: [round][position] = { originalTeam, currentOwner, pickLabel }
  // For each slot (round, position), find who currently owns that pick
  const pickMatrix = {};
  for (let round = 1; round <= ROUNDS; round++) {
    pickMatrix[round] = {};
    for (let pos = 1; pos <= 12; pos++) {
      pickMatrix[round][pos] = null;
    }
  }

  // Original owners mapping (position -> team)
  const posToTeam = {};
  Object.entries(draftPositions).forEach(([rosterId, pos]) => {
    posToTeam[pos] = Number(rosterId);
  });

  // Current ownership from teamAssets
  teams.forEach(team => {
    const assets = teamAssets[team.rosterId];
    if (!assets?.picks) return;
    assets.picks.forEach(pick => {
      if (pick.year !== selectedYear) return;
      const slot = pickMatrix[pick.round]?.[pick.position];
      pickMatrix[pick.round][pick.position] = {
        currentOwner: team.rosterId,
        originalPosition: pick.position,
        originalOwner: posToTeam[pick.position],
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

  // Team colors (12 teams)
  const teamColors = {};
  teams.forEach((t, i) => {
    const hues = [180, 30, 280, 120, 0, 210, 50, 330, 160, 90, 260, 20];
    teamColors[t.rosterId] = `hsl(${hues[i % 12]}, 60%, 55%)`;
  });

  const anyAssigned = Object.keys(draftPositions).length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
            DRAFT BOARD
          </h1>
          <p className="text-[#8a95a8] text-sm">Every pick · every round · {anyAssigned ? 'traded picks highlighted' : 'awaiting draft positions'}</p>
        </div>
        <div className="flex gap-1 p-1 bg-[#111418] rounded-xl border border-[#2a3040]">
          {[YEAR, YEAR + 1].map(y => (
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

      {!anyAssigned ? (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center">
          <div className="text-3xl mb-2">📋</div>
          <div className="text-sm text-[#8a95a8]">The commissioner needs to assign draft positions first.</div>
        </div>
      ) : (
        <>
          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="flex items-center gap-1.5 text-[#8a95a8]">
              <span className="w-3 h-3 rounded bg-[#00e5a0]"></span>
              Original owner
            </span>
            <span className="flex items-center gap-1.5 text-[#8a95a8]">
              <span className="w-3 h-3 rounded bg-[#ff6b35]"></span>
              Traded pick
            </span>
          </div>

          {/* Draft grid */}
          <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#2a3040] bg-[#0a0c10]">
                    <th className="sticky left-0 bg-[#0a0c10] px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] border-r border-[#2a3040] w-12">
                      Rd
                    </th>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(pos => (
                      <th key={pos} className="px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-[#8a95a8] min-w-[100px]">
                        <div>Pos {pos}</div>
                        <div className="text-[#4a5568] font-normal truncate" style={{fontSize:'9px'}}>
                          {posToTeam[pos] ? getTeamShort(posToTeam[pos]) : '—'}
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
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(pos => {
                        const slot = pickMatrix[round][pos];
                        const originalOwner = posToTeam[pos];
                        if (!slot) {
                          // No team has this pick → nobody assigned position yet, OR it's been traded but no new owner
                          return (
                            <td key={pos} className="px-2 py-2 text-center">
                              <div className="text-xs text-[#4a5568]">—</div>
                            </td>
                          );
                        }
                        const wasTraded = slot.currentOwner !== originalOwner;
                        const color = teamColors[slot.currentOwner];
                        return (
                          <td key={pos} className="px-2 py-2">
                            <div
                              className={`rounded-lg px-2 py-1.5 text-center border transition-all ${
                                wasTraded ? 'border-[#ff6b35]/30 bg-[#ff6b35]/5' : 'border-[#00e5a0]/20 bg-[#00e5a0]/5'
                              }`}
                              title={`${round}.${String(pos).padStart(2, '0')} → ${getTeamName(slot.currentOwner)}`}
                            >
                              <div
                                className="text-[10px] font-bold text-white truncate"
                                style={{ color }}
                              >
                                {getTeamShort(slot.currentOwner)}
                              </div>
                              <div className="text-[9px] text-[#8a95a8]">
                                {round}.{String(pos).padStart(2, '0')}
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

          {/* Per-team pick counts */}
          <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[#2a3040]">
              <h2 className="font-semibold text-white text-sm">{selectedYear} Picks by Team</h2>
            </div>
            <div className="divide-y divide-[#2a3040]">
              {teams.map(team => {
                const assets = teamAssets[team.rosterId];
                const picks = (assets?.picks || []).filter(p => p.year === selectedYear).sort((a, b) => a.round - b.round);
                return (
                  <div key={team.rosterId} className="flex items-center gap-3 px-5 py-3">
                    <div className="w-8 h-8 rounded-lg bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center shrink-0">
                      {team.avatar
                        ? <img src={team.avatar} alt="" className="w-full h-full object-cover rounded-lg" />
                        : <span className="text-xs font-bold text-[#00e5a0]">{team.displayName[0]?.toUpperCase()}</span>
                      }
                    </div>
                    <div className="w-40 shrink-0">
                      <div className="text-sm font-medium text-white truncate">{team.teamName}</div>
                      <div className="text-[10px] text-[#4a5568]">Pos {draftPositions[team.rosterId] || '—'}</div>
                    </div>
                    <div className="flex-1 flex flex-wrap gap-1">
                      {picks.length === 0 ? (
                        <span className="text-xs text-[#4a5568]">No picks</span>
                      ) : (
                        picks.map(pick => {
                          const isTraded = pick.position !== draftPositions[team.rosterId];
                          return (
                            <span
                              key={pick.id}
                              className={`text-[11px] px-2 py-0.5 rounded border font-medium ${
                                isTraded
                                  ? 'bg-[#ff6b35]/10 text-[#ff6b35] border-[#ff6b35]/20'
                                  : 'bg-[#4da6ff]/10 text-[#4da6ff] border-[#4da6ff]/20'
                              }`}
                              title={isTraded ? 'Acquired via trade' : 'Original pick'}
                            >
                              {pick.label}
                            </span>
                          );
                        })
                      )}
                    </div>
                    <span className="text-xs text-[#8a95a8] w-10 text-right shrink-0">{picks.length}</span>
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
