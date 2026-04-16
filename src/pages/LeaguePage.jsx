import React, { useState } from 'react';
import useStore from '../store';

const YEAR = new Date().getFullYear();

export default function LeaguePage() {
  const { teams, getAssets, draftPositions, keepers } = useStore();
  const [expanded, setExpanded] = useState(null);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
          LEAGUE OVERVIEW
        </h1>
        <p className="text-[#8a95a8] text-sm">All 12 teams — keepers, picks, and draft positions</p>
      </div>

      <div className="space-y-3">
        {teams.map(team => {
          const assets = getAssets(team.rosterId);
          const pos = draftPositions[team.rosterId];
          const isExpanded = expanded === team.rosterId;
          const keeperCount = (keepers[team.rosterId] || []).length;
          const thisYearPicks = assets.picks?.filter(p => p.year === YEAR) || [];
          const nextYearPicks = assets.picks?.filter(p => p.year === YEAR + 1) || [];

          return (
            <div
              key={team.rosterId}
              className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden"
            >
              {/* Row header */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-[#1a1f27] transition-colors"
                onClick={() => setExpanded(isExpanded ? null : team.rosterId)}
              >
                {team.avatar ? (
                  <img src={team.avatar} alt="" className="w-10 h-10 rounded-xl object-cover border border-[#2a3040] shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center shrink-0">
                    <span className="text-sm font-black text-[#00e5a0]">{team.displayName[0]?.toUpperCase()}</span>
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white text-sm">{team.teamName}</div>
                  <div className="text-xs text-[#8a95a8]">{team.displayName} · {team.wins}W–{team.losses}L</div>
                </div>

                {/* Draft pos badge */}
                <div className="text-center shrink-0">
                  {pos ? (
                    <span className="text-lg font-black text-[#00e5a0]" style={{ fontFamily: 'Bebas Neue' }}>{pos}</span>
                  ) : (
                    <span className="text-xs text-[#4a5568]">—</span>
                  )}
                  <div className="text-[10px] text-[#4a5568] uppercase tracking-wider">pos</div>
                </div>

                {/* Keepers count */}
                <div className="text-center shrink-0 hidden sm:block">
                  <span className={`text-sm font-bold ${keeperCount > 0 ? 'text-white' : 'text-[#4a5568]'}`}>{keeperCount}/6</span>
                  <div className="text-[10px] text-[#4a5568] uppercase tracking-wider">keepers</div>
                </div>

                {/* Picks count */}
                <div className="text-center shrink-0 hidden sm:block">
                  <span className={`text-sm font-bold ${thisYearPicks.length > 0 ? 'text-[#4da6ff]' : 'text-[#4a5568]'}`}>
                    {thisYearPicks.length}
                  </span>
                  <div className="text-[10px] text-[#4a5568] uppercase tracking-wider">{YEAR} picks</div>
                </div>

                <span className={`text-[#8a95a8] text-sm transition-transform ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
              </div>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="border-t border-[#2a3040] px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-6 bg-[#0a0c10]/50">
                  {/* Players */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8] mb-2">Keepers ({assets.players?.length || 0})</div>
                    {assets.players?.length > 0 ? (
                      <div className="space-y-1">
                        {assets.players.map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-sm">
                            <span className="text-xs text-[#00e5a0] font-semibold w-8 shrink-0">{p.position}</span>
                            <span className="text-white">{p.name}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[#4a5568]">None selected</div>
                    )}
                  </div>

                  {/* This year picks */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8] mb-2">{YEAR} Picks ({thisYearPicks.length})</div>
                    {thisYearPicks.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {thisYearPicks.sort((a,b) => a.round - b.round).map(pick => (
                          <span key={pick.id} className="text-xs px-2 py-0.5 rounded bg-[#4da6ff]/10 text-[#4da6ff] border border-[#4da6ff]/20 font-medium">
                            {pick.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[#4a5568]">{pos ? 'All traded away' : 'No position assigned'}</div>
                    )}
                  </div>

                  {/* Next year picks */}
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8] mb-2">{YEAR + 1} Picks ({nextYearPicks.length})</div>
                    {nextYearPicks.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {nextYearPicks.sort((a,b) => a.round - b.round).map(pick => (
                          <span key={pick.id} className="text-xs px-2 py-0.5 rounded bg-[#4da6ff]/10 text-[#4da6ff] border border-[#4da6ff]/20 font-medium">
                            {pick.label}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-[#4a5568]">{pos ? 'All traded away' : 'No position assigned'}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
