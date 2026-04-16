import React from "react";
import useStore from "../store";

const POSITIONS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function CommissionerPage() {
  const {
    teams,
    draftPositions,
    setDraftPosition,
    trades,
    updateTradeStatus,
    getTeam,
    keepers,
    teamAssets,
  } = useStore();

  // Check if position is already taken by another team
  const takenPositions = Object.entries(draftPositions).reduce(
    (acc, [rid, pos]) => {
      acc[pos] = Number(rid);
      return acc;
    },
    {},
  );

  const handlePositionChange = (rosterId, position) => {
    const pos = Number(position);
    // If another team has this position, swap them
    const conflictRosterId = takenPositions[pos];
    if (conflictRosterId && conflictRosterId !== rosterId) {
      const oldPos = draftPositions[rosterId];
      if (oldPos) setDraftPosition(conflictRosterId, oldPos);
    }
    setDraftPosition(rosterId, pos);
  };

  const allAssigned = teams.every((t) => draftPositions[t.rosterId]);
  const pendingTrades = trades.filter((t) => t.status === "pending");

  const keeperCount = (rosterId) => (keepers[rosterId] || []).length;
  const assetCount = (rosterId) => {
    const a = teamAssets[rosterId];
    if (!a) return { players: 0, picks: 0 };
    return { players: a.players?.length || 0, picks: a.picks?.length || 0 };
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-black text-white"
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            COMMISSIONER PANEL
          </h1>
          <p className="text-[#8a95a8] text-sm mt-0.5">
            Assign draft positions & manage the league
          </p>
        </div>
        {allAssigned && (
          <span className="px-3 py-1 bg-[#00e5a0]/10 text-[#00e5a0] text-xs font-semibold rounded-full border border-[#00e5a0]/20">
            ✓ All positions assigned
          </span>
        )}
      </div>

      {/* Draft Position Assignment */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
          <h2 className="font-semibold text-white">
            Draft Position Assignment
          </h2>
          <p className="text-xs text-[#8a95a8]">
            Position determines all 8 rounds (e.g. pos 3 = 1.03, 2.03...)
          </p>
        </div>
        <div className="divide-y divide-[#2a3040]">
          {teams.map((team, idx) => {
            const assigned = draftPositions[team.rosterId];
            const counts = assetCount(team.rosterId);
            return (
              <div
                key={team.rosterId}
                className="flex items-center gap-4 px-5 py-3 hover:bg-[#1a1f27] transition-colors"
              >
                {/* Avatar */}
                <div className="w-9 h-9 rounded-full bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center overflow-hidden shrink-0">
                  {team.avatar ? (
                    <img
                      src={team.avatar}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold text-[#00e5a0]">
                      {team.displayName[0]?.toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Team info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-white text-sm truncate">
                    {team.teamName}
                  </div>
                  <div className="text-xs text-[#8a95a8]">
                    {team.displayName} · {team.wins}W–{team.losses}L
                  </div>
                </div>

                {/* Keeper status */}
                <div className="text-xs text-center hidden sm:block">
                  <div
                    className={`font-semibold ${keeperCount(team.rosterId) > 0 ? "text-[#00e5a0]" : "text-[#4a5568]"}`}
                  >
                    {keeperCount(team.rosterId)}/6
                  </div>
                  <div className="text-[#4a5568]">keepers</div>
                </div>

                {/* Asset count */}
                <div className="text-xs text-center hidden sm:block">
                  <div
                    className={`font-semibold ${counts.picks > 0 ? "text-[#4da6ff]" : "text-[#4a5568]"}`}
                  >
                    {counts.picks}
                  </div>
                  <div className="text-[#4a5568]">picks</div>
                </div>

                {/* Draft position selector */}
                <div className="shrink-0">
                  <select
                    value={assigned || ""}
                    onChange={(e) =>
                      handlePositionChange(team.rosterId, e.target.value)
                    }
                    className={`bg-[#1a1f27] border rounded-lg px-3 py-1.5 text-sm focus:outline-none transition-colors appearance-none cursor-pointer ${
                      assigned
                        ? "border-[#00e5a0]/40 text-[#00e5a0]"
                        : "border-[#2a3040] text-[#8a95a8]"
                    }`}
                  >
                    <option value="">-- Pick --</option>
                    {POSITIONS.map((p) => (
                      <option key={p} value={p}>
                        Position {p}
                        {takenPositions[p] &&
                        takenPositions[p] !== team.rosterId
                          ? " ⚠"
                          : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview */}
                {assigned && (
                  <div className="text-xs text-[#8a95a8] w-28 hidden md:block">
                    1.{String(assigned).padStart(2, "0")}, 2.
                    {String(assigned).padStart(2, "0")}...
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Pending Trades */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2a3040] flex items-center justify-between">
          <h2 className="font-semibold text-white">Pending Trades</h2>
          {pendingTrades.length > 0 && (
            <span className="px-2 py-0.5 bg-yellow-400/10 text-yellow-400 text-xs font-bold rounded-full border border-yellow-400/20">
              {pendingTrades.length} pending
            </span>
          )}
        </div>
        {pendingTrades.length === 0 ? (
          <div className="px-5 py-8 text-center text-[#4a5568] text-sm">
            No pending trades
          </div>
        ) : (
          <div className="divide-y divide-[#2a3040]">
            {pendingTrades.map((trade) => {
              const fromTeam = getTeam(trade.fromRosterId);
              const toTeam = getTeam(trade.toRosterId);
              return (
                <div key={trade.id} className="px-5 py-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs font-semibold text-[#8a95a8] uppercase tracking-wider">
                          Trade Proposal
                        </span>
                        <span className="text-xs text-[#4a5568]">
                          {new Date(trade.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs font-semibold text-[#00e5a0] mb-1">
                            {fromTeam?.teamName} sends:
                          </div>
                          <div className="space-y-0.5">
                            {trade.fromAssets.map((a) => (
                              <div
                                key={a.id}
                                className="text-xs text-[#8a95a8] flex items-center gap-1.5"
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${a.type === "pick" ? "bg-[#4da6ff]" : "bg-[#00e5a0]"}`}
                                />
                                {a.type === "pick"
                                  ? a.label
                                  : `${a.name} (${a.position})`}
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-[#ff6b35] mb-1">
                            {toTeam?.teamName} sends:
                          </div>
                          <div className="space-y-0.5">
                            {trade.toAssets.map((a) => (
                              <div
                                key={a.id}
                                className="text-xs text-[#8a95a8] flex items-center gap-1.5"
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${a.type === "pick" ? "bg-[#4da6ff]" : "bg-[#00e5a0]"}`}
                                />
                                {a.type === "pick"
                                  ? a.label
                                  : `${a.name} (${a.position})`}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                      <button
                        onClick={() => updateTradeStatus(trade.id, "accepted")}
                        className="px-4 py-1.5 bg-[#00e5a0] text-black text-xs font-semibold rounded-lg hover:bg-[#00ffb3] transition-colors"
                      >
                        Force Accept
                      </button>
                      <button
                        onClick={() => updateTradeStatus(trade.id, "rejected")}
                        className="px-4 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 text-xs font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* League Summary */}
      <div className="bg-[#111418] border border-[#2a3040] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#2a3040]">
          <h2 className="font-semibold text-white">League Asset Summary</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#2a3040]">
                <th className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">
                  Team
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">
                  Draft Pos
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">
                  Keepers
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">
                  Picks
                </th>
                <th className="text-center px-3 py-3 text-xs font-semibold uppercase tracking-wider text-[#8a95a8]">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#2a3040]">
              {teams.map((team) => {
                const pos = draftPositions[team.rosterId];
                const kCount = keeperCount(team.rosterId);
                const counts = assetCount(team.rosterId);
                const ready = pos && kCount > 0;
                return (
                  <tr
                    key={team.rosterId}
                    className="hover:bg-[#1a1f27] transition-colors"
                  >
                    <td className="px-5 py-3 font-medium text-white">
                      {team.teamName}
                    </td>
                    <td className="px-3 py-3 text-center">
                      {pos ? (
                        <span className="text-[#00e5a0] font-bold">{pos}</span>
                      ) : (
                        <span className="text-[#4a5568]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={kCount > 0 ? "text-white" : "text-[#4a5568]"}
                      >
                        {kCount}/6
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={
                          counts.picks > 0 ? "text-[#4da6ff]" : "text-[#4a5568]"
                        }
                      >
                        {counts.picks}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                          ready
                            ? "bg-[#00e5a0]/10 text-[#00e5a0] border border-[#00e5a0]/20"
                            : "bg-[#2a3040] text-[#8a95a8]"
                        }`}
                      >
                        {ready ? "Ready" : "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

