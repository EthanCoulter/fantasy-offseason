import React from 'react';
import useStore, { BASE_OFFENSE_KEEPERS, BASE_DEFENSE_KEEPERS } from '../store';

const POS_COLORS = {
  QB: 'bg-red-500/20 text-red-400 border-red-500/30',
  RB: 'bg-green-500/20 text-green-400 border-green-500/30',
  WR: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  TE: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  K:  'bg-purple-500/20 text-purple-400 border-purple-500/30',
  DEF:'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  default: 'bg-[#2a3040] text-[#8a95a8] border-[#3a4455]',
};
function posColor(pos) { return POS_COLORS[pos] || POS_COLORS.default; }

const YEAR = new Date().getFullYear();

export default function MyTeamPage() {
  const { currentUser, teams, getAssets, draftPositions, trades, slotsBurned, getMaxKeeperSlots } = useStore();
  const myRosterId = currentUser?.rosterId;
  const myTeam = teams.find(t => t.rosterId === myRosterId);
  const assets = getAssets(myRosterId);
  const draftPos = draftPositions[myRosterId];
  const burned = slotsBurned[myRosterId] || { offense: 0, defense: 0 };
  const maxSlots = getMaxKeeperSlots(myRosterId);

  const thisYearPicks = assets.picks?.filter(p => p.year === YEAR) || [];
  const nextYearPicks = assets.picks?.filter(p => p.year === YEAR + 1) || [];
  const completedTrades = trades.filter(
    t => (t.fromRosterId === myRosterId || t.toRosterId === myRosterId) && t.status === 'accepted'
  );

  if (!myTeam) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        {myTeam.avatar ? (
          <img src={myTeam.avatar} alt="" className="w-14 h-14 rounded-2xl object-cover border border-[#2a3040]" />
        ) : (
          <div className="w-14 h-14 rounded-2xl bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center">
            <span className="text-2xl font-black text-[#00e5a0]">{myTeam.displayName[0]?.toUpperCase()}</span>
          </div>
        )}
        <div>
          <h1 className="text-2xl font-black text-white" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
            {myTeam.teamName}
          </h1>
          <p className="text-[#8a95a8] text-sm">{myTeam.displayName} · {myTeam.wins}W–{myTeam.losses}L</p>
        </div>
        {draftPos && (
          <div className="ml-auto text-center">
            <div className="text-3xl font-black text-[#00e5a0]" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>{draftPos}</div>
            <div className="text-xs text-[#8a95a8] uppercase tracking-wider">Draft Pos</div>
          </div>
        )}
      </div>

      {(burned.offense > 0 || burned.defense > 0) && (
        <div className="bg-[#ff6b35]/10 border border-[#ff6b35]/30 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🔥</span>
            <span className="text-sm font-semibold text-[#ff6b35]">Burned Keeper Slots</span>
          </div>
          <div className="text-xs text-[#ff6b35]/80 ml-7">
            {burned.offense > 0 && <span>−{burned.offense} offense (max now {maxSlots.offense}/{BASE_OFFENSE_KEEPERS})</span>}
            {burned.offense > 0 && burned.defense > 0 && <span> · </span>}
            {burned.defense > 0 && <span>−{burned.defense} defense (max now {maxSlots.defense}/{BASE_DEFENSE_KEEPERS})</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-white">{assets.players?.length || 0}</div>
          <div className="text-xs text-[#8a95a8] uppercase tracking-wider mt-1">Keepers</div>
        </div>
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-[#4da6ff]">{thisYearPicks.length}</div>
          <div className="text-xs text-[#8a95a8] uppercase tracking-wider mt-1">{YEAR} Picks</div>
        </div>
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-[#4da6ff]">{nextYearPicks.length}</div>
          <div className="text-xs text-[#8a95a8] uppercase tracking-wider mt-1">{YEAR + 1} Picks</div>
        </div>
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-4 text-center">
          <div className="text-2xl font-black text-[#ff6b35]">{completedTrades.length}</div>
          <div className="text-xs text-[#8a95a8] uppercase tracking-wider mt-1">Trades</div>
        </div>
      </div>

      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2a3040]">
          <h2 className="font-semibold text-white">Keeper Players</h2>
        </div>
        {!assets.players || assets.players.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#4a5568] text-sm">
            No keepers selected yet — go to the Keepers tab
          </div>
        ) : (
          <div className="divide-y divide-[#2a3040]">
            {assets.players.map(player => (
              <div key={player.id} className="flex items-center gap-4 px-5 py-3">
                <span className={`text-xs px-2 py-0.5 rounded border font-semibold w-10 text-center ${posColor(player.position)}`}>
                  {player.position}
                </span>
                <div>
                  <div className="text-sm font-medium text-white">{player.name}</div>
                  {player.nflTeam && <div className="text-xs text-[#4a5568]">{player.nflTeam}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
            <h2 className="font-semibold text-white">{YEAR} Draft Picks</h2>
            <span className="text-xs text-[#4da6ff] font-semibold">{thisYearPicks.length} picks</span>
          </div>
          {thisYearPicks.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#4a5568] text-sm">
              {draftPos ? 'No picks (all traded away)' : 'Awaiting draft position assignment'}
            </div>
          ) : (
            <div className="divide-y divide-[#2a3040]">
              {thisYearPicks.sort((a, b) => a.round - b.round).map(pick => (
                <div key={pick.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-[#4da6ff]/10 text-[#4da6ff] border border-[#4da6ff]/20 font-semibold">
                    R{pick.round}
                  </span>
                  <span className="text-sm text-white font-medium">{pick.label}</span>
                  {pick.originalRosterId !== myRosterId && (
                    <span className="text-xs text-[#ff6b35] ml-auto">via trade</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
            <h2 className="font-semibold text-white">{YEAR + 1} Draft Picks</h2>
            <span className="text-xs text-[#4da6ff] font-semibold">{nextYearPicks.length} picks</span>
          </div>
          {nextYearPicks.length === 0 ? (
            <div className="px-5 py-6 text-center text-[#4a5568] text-sm">
              {draftPos ? 'No picks (all traded away)' : 'Awaiting draft position assignment'}
            </div>
          ) : (
            <div className="divide-y divide-[#2a3040]">
              {nextYearPicks.sort((a, b) => a.round - b.round).map(pick => (
                <div key={pick.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="text-xs px-2 py-0.5 rounded bg-[#4da6ff]/10 text-[#4da6ff] border border-[#4da6ff]/20 font-semibold">
                    R{pick.round}
                  </span>
                  <span className="text-sm text-white font-medium">{pick.label}</span>
                  {pick.originalRosterId !== myRosterId && (
                    <span className="text-xs text-[#ff6b35] ml-auto">via trade</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {completedTrades.length > 0 && (
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[#2a3040]">
            <h2 className="font-semibold text-white">Trade History</h2>
          </div>
          <div className="divide-y divide-[#2a3040]">
            {completedTrades.map(trade => {
              const other = teams.find(t =>
                t.rosterId === (trade.fromRosterId === myRosterId ? trade.toRosterId : trade.fromRosterId)
              );
              const sentAssets = trade.fromRosterId === myRosterId ? trade.fromAssets : trade.toAssets;
              const receivedAssets = trade.fromRosterId === myRosterId ? trade.toAssets : trade.fromAssets;
              return (
                <div key={trade.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-semibold text-[#00e5a0]">w/ {other?.teamName}</span>
                    <span className="text-xs text-[#4a5568]">{new Date(trade.timestamp).toLocaleDateString()}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <div className="text-[#8a95a8] mb-1">You sent:</div>
                      {sentAssets.map(a => (
                        <div key={a.id} className="text-red-400">{a.type === 'pick' ? a.label : `${a.name} (${a.position})`}</div>
                      ))}
                    </div>
                    <div>
                      <div className="text-[#8a95a8] mb-1">You received:</div>
                      {receivedAssets.map(a => (
                        <div key={a.id} className="text-[#00e5a0]">{a.type === 'pick' ? a.label : `${a.name} (${a.position})`}</div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
