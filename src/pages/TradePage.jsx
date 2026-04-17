import React, { useState, useMemo } from "react";
import useStore, { validateTrade, calculateSlotImpact } from "../store";

function AssetBadge({ asset, onRemove }) {
  const isPick = asset.type === "pick";
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border ${
        isPick
          ? "bg-[#4da6ff]/10 border-[#4da6ff]/30 text-[#4da6ff]"
          : "bg-[#00e5a0]/10 border-[#00e5a0]/30 text-[#00e5a0]"
      }`}
    >
      <span>{isPick ? asset.label : `${asset.name} (${asset.position})`}</span>
      {onRemove && (
        <button
          onClick={onRemove}
          className="opacity-60 hover:opacity-100 ml-1 font-bold"
        >
          ×
        </button>
      )}
    </div>
  );
}

function AssetSelector({ assets, selected, onToggle, label, color }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wider text-[#8a95a8] mb-2">
        {label}
      </div>
      <div className="space-y-1 max-h-56 overflow-y-auto">
        {assets.length === 0 && (
          <div className="text-xs text-[#4a5568] py-2">No assets available</div>
        )}
        {assets.map((asset) => {
          const isSelected = selected.some((s) => s.id === asset.id);
          const isPick = asset.type === "pick";
          return (
            <div
              key={asset.id}
              onClick={() => onToggle(asset)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all border ${
                isSelected
                  ? color === "green"
                    ? "bg-[#00e5a0]/10 border-[#00e5a0]/40"
                    : "bg-[#4da6ff]/10 border-[#4da6ff]/40"
                  : "bg-[#0a0c10] border-[#2a3040] hover:border-[#3a4455]"
              }`}
            >
              <div
                className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                  isSelected
                    ? color === "green"
                      ? "border-[#00e5a0] bg-[#00e5a0]"
                      : "border-[#4da6ff] bg-[#4da6ff]"
                    : "border-[#2a3040]"
                }`}
              >
                {isSelected && (
                  <span className="text-black text-[10px] font-bold">✓</span>
                )}
              </div>
              <span
                className={`text-xs px-1.5 py-0.5 rounded font-semibold border ${
                  isPick
                    ? "bg-[#4da6ff]/10 text-[#4da6ff] border-[#4da6ff]/20"
                    : "bg-[#00e5a0]/10 text-[#00e5a0] border-[#00e5a0]/20"
                }`}
              >
                {isPick ? "PICK" : asset.position}
              </span>
              <span className="text-sm text-white truncate">
                {isPick ? asset.label : asset.name}
              </span>
              {isPick && (
                <span className="text-xs text-[#4a5568] ml-auto">
                  {asset.year}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotImpactPanel({ myImpact, theirImpact, myTeamName, theirTeamName }) {
  const hasMyImpact = myImpact.offenseBurned > 0 || myImpact.defenseBurned > 0;
  const hasTheirImpact =
    theirImpact.offenseBurned > 0 || theirImpact.defenseBurned > 0;
  if (!hasMyImpact && !hasTheirImpact) return null;

  return (
    <div className="bg-[#ff6b35]/5 border border-[#ff6b35]/20 rounded-xl px-4 py-3 space-y-2">
      <div className="text-xs font-semibold text-[#ff6b35] uppercase tracking-wider">
        🔥 Keeper Slots Burned
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[#8a95a8] mb-1">{myTeamName || "You"}:</div>
          {hasMyImpact ? (
            <>
              {myImpact.offenseBurned > 0 && (
                <div className="text-[#ff6b35]">
                  −{myImpact.offenseBurned} offense slot
                  {myImpact.offenseBurned > 1 ? "s" : ""}
                </div>
              )}
              {myImpact.defenseBurned > 0 && (
                <div className="text-[#ff6b35]">
                  −{myImpact.defenseBurned} defense slot
                  {myImpact.defenseBurned > 1 ? "s" : ""}
                </div>
              )}
            </>
          ) : (
            <div className="text-[#00e5a0]">No slots burned</div>
          )}
        </div>
        <div>
          <div className="text-[#8a95a8] mb-1">{theirTeamName || "Them"}:</div>
          {hasTheirImpact ? (
            <>
              {theirImpact.offenseBurned > 0 && (
                <div className="text-[#ff6b35]">
                  −{theirImpact.offenseBurned} offense slot
                  {theirImpact.offenseBurned > 1 ? "s" : ""}
                </div>
              )}
              {theirImpact.defenseBurned > 0 && (
                <div className="text-[#ff6b35]">
                  −{theirImpact.defenseBurned} defense slot
                  {theirImpact.defenseBurned > 1 ? "s" : ""}
                </div>
              )}
            </>
          ) : (
            <div className="text-[#00e5a0]">No slots burned</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TradePage() {
  const {
    currentUser,
    teams,
    proposeTrade,
    trades,
    updateTradeStatus,
    getAssets,
  } = useStore();
  const [targetTeamId, setTargetTeamId] = useState("");
  const [mySelected, setMySelected] = useState([]);
  const [theirSelected, setTheirSelected] = useState([]);
  const [tradeResult, setTradeResult] = useState(null);
  const [activeTab, setActiveTab] = useState("propose");

  const myRosterId = currentUser?.rosterId;
  const myAssets = getAssets(myRosterId);
  const targetAssets = useMemo(
    () =>
      targetTeamId
        ? getAssets(Number(targetTeamId))
        : { players: [], picks: [] },
    [targetTeamId, getAssets],
  );
  const targetTeam = teams.find((t) => t.rosterId === Number(targetTeamId));
  const myTeam = teams.find((t) => t.rosterId === myRosterId);

  const allMyAssets = useMemo(
    () => [...myAssets.players, ...myAssets.picks],
    [myAssets],
  );
  const allTheirAssets = useMemo(
    () => [...(targetAssets.players || []), ...(targetAssets.picks || [])],
    [targetAssets],
  );

  const toggleMy = (asset) => {
    setMySelected((prev) =>
      prev.some((a) => a.id === asset.id)
        ? prev.filter((a) => a.id !== asset.id)
        : [...prev, asset],
    );
    setTradeResult(null);
  };
  const toggleTheir = (asset) => {
    setTheirSelected((prev) =>
      prev.some((a) => a.id === asset.id)
        ? prev.filter((a) => a.id !== asset.id)
        : [...prev, asset],
    );
    setTradeResult(null);
  };

  const liveValidation = useMemo(() => {
    if (mySelected.length === 0 && theirSelected.length === 0) return null;
    return validateTrade(mySelected, theirSelected);
  }, [mySelected, theirSelected]);

  const slotImpact = useMemo(() => {
    return {
      mine: calculateSlotImpact(mySelected, theirSelected),
      theirs: calculateSlotImpact(theirSelected, mySelected),
    };
  }, [mySelected, theirSelected]);

  const handlePropose = () => {
    if (!targetTeamId || mySelected.length === 0 || theirSelected.length === 0)
      return;
    const result = proposeTrade(
      myRosterId,
      Number(targetTeamId),
      mySelected,
      theirSelected,
    );
    setTradeResult(result);
    if (result.success) {
      setMySelected([]);
      setTheirSelected([]);
      setTargetTeamId("");
    }
  };

  const otherTeams = teams.filter((t) => t.rosterId !== myRosterId);
  const myTrades = trades.filter(
    (t) => t.fromRosterId === myRosterId || t.toRosterId === myRosterId,
  );
  const incomingPending = myTrades.filter(
    (t) => t.toRosterId === myRosterId && t.status === "pending",
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1
            className="text-2xl font-black text-white"
            style={{
              fontFamily: "Bebas Neue, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            TRADE CENTER
          </h1>
          <p className="text-[#8a95a8] text-sm">
            Only keepers tradable · Players must return a player or 2026 pick ·
            Trading players for picks burns keeper slots
          </p>
        </div>
        {incomingPending.length > 0 && (
          <span className="px-3 py-1 bg-yellow-400/10 border border-yellow-400/20 text-yellow-400 text-xs font-bold rounded-full animate-pulse">
            {incomingPending.length} incoming
          </span>
        )}
      </div>

      <div className="flex gap-1 p-1 bg-[#111418] rounded-xl border border-[#2a3040] w-fit">
        {["propose", "board"].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              activeTab === tab
                ? "bg-[#1a1f27] text-white shadow"
                : "text-[#8a95a8] hover:text-white"
            }`}
          >
            {tab === "propose"
              ? "Propose Trade"
              : `Trade Board${trades.length > 0 ? ` (${trades.length})` : ""}`}
          </button>
        ))}
      </div>

      {activeTab === "propose" ? (
        <div className="space-y-4">
          <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#8a95a8] mb-2">
              Trade With
            </label>
            <select
              value={targetTeamId}
              onChange={(e) => {
                setTargetTeamId(e.target.value);
                setTheirSelected([]);
                setTradeResult(null);
              }}
              className="w-full bg-[#0a0c10] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0] transition-colors"
            >
              <option value="">-- Select a team --</option>
              {otherTeams.map((t) => (
                <option key={t.rosterId} value={t.rosterId}>
                  {t.teamName} ({t.displayName})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-sm">You Send</h3>
                <span className="text-xs text-[#00e5a0]">
                  {myTeam?.teamName}
                </span>
              </div>
              <AssetSelector
                assets={allMyAssets}
                selected={mySelected}
                onToggle={toggleMy}
                label="Your keepers & picks"
                color="green"
              />
              {mySelected.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 pt-3 border-t border-[#2a3040]">
                  {mySelected.map((a) => (
                    <AssetBadge
                      key={a.id}
                      asset={a}
                      onRemove={() => toggleMy(a)}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-white text-sm">
                  You Receive
                </h3>
                <span className="text-xs text-[#ff6b35]">
                  {targetTeam?.teamName || "Select a team"}
                </span>
              </div>
              {!targetTeamId ? (
                <div className="text-center py-8 text-[#4a5568] text-sm">
                  Select a team first
                </div>
              ) : (
                <AssetSelector
                  assets={allTheirAssets}
                  selected={theirSelected}
                  onToggle={toggleTheir}
                  label="Their keepers & picks"
                  color="blue"
                />
              )}
              {theirSelected.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5 pt-3 border-t border-[#2a3040]">
                  {theirSelected.map((a) => (
                    <AssetBadge
                      key={a.id}
                      asset={a}
                      onRemove={() => toggleTheir(a)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {(mySelected.length > 0 || theirSelected.length > 0) && (
            <SlotImpactPanel
              myImpact={slotImpact.mine}
              theirImpact={slotImpact.theirs}
              myTeamName={myTeam?.teamName}
              theirTeamName={targetTeam?.teamName}
            />
          )}

          {liveValidation && (
            <div
              className={`rounded-xl px-4 py-3 border text-sm ${
                liveValidation.valid
                  ? "bg-[#00e5a0]/5 border-[#00e5a0]/20 text-[#00e5a0]"
                  : "bg-red-500/5 border-red-500/20 text-red-400"
              }`}
            >
              {liveValidation.valid ? (
                <span>✓ Trade is valid — ready to propose</span>
              ) : (
                <div>
                  <div className="font-semibold mb-1">Trade is invalid:</div>
                  {liveValidation.errors.map((e, i) => (
                    <div key={i} className="text-xs opacity-80">
                      • {e}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tradeResult && !tradeResult.success && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
              <div className="font-semibold">Trade blocked:</div>
              {tradeResult.errors?.map((e, i) => (
                <div key={i} className="text-xs mt-0.5">
                  • {e}
                </div>
              ))}
            </div>
          )}

          {tradeResult?.success && (
            <div className="bg-[#00e5a0]/10 border border-[#00e5a0]/20 rounded-xl px-4 py-3 text-[#00e5a0] text-sm">
              ✓ Trade proposed! The other team can accept or reject on the Trade
              Board.
            </div>
          )}

          <button
            onClick={handlePropose}
            disabled={
              !targetTeamId ||
              mySelected.length === 0 ||
              theirSelected.length === 0 ||
              (liveValidation && !liveValidation.valid)
            }
            className="w-full py-3 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb3] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Propose Trade →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {trades.length === 0 ? (
            <div className="bg-[#111418] border border-[#2a3040] rounded-2xl px-5 py-12 text-center text-[#4a5568] text-sm">
              No trades yet — be the first to propose one!
            </div>
          ) : (
            trades.map((trade) => {
              const fromTeam = teams.find(
                (t) => t.rosterId === trade.fromRosterId,
              );
              const toTeam = teams.find((t) => t.rosterId === trade.toRosterId);
              const isIncoming =
                trade.toRosterId === myRosterId && trade.status === "pending";
              const isOutgoing =
                trade.fromRosterId === myRosterId && trade.status === "pending";

              const statusColors = {
                pending:
                  "bg-yellow-400/10 text-yellow-400 border-yellow-400/20",
                accepted: "bg-[#00e5a0]/10 text-[#00e5a0] border-[#00e5a0]/20",
                rejected: "bg-red-500/10 text-red-400 border-red-500/20",
                cancelled: "bg-[#2a3040] text-[#8a95a8] border-[#2a3040]",
              };

              const hasImpact =
                trade.fromSlotImpact &&
                (trade.fromSlotImpact.offenseBurned > 0 ||
                  trade.fromSlotImpact.defenseBurned > 0 ||
                  trade.toSlotImpact.offenseBurned > 0 ||
                  trade.toSlotImpact.defenseBurned > 0);

              return (
                <div
                  key={trade.id}
                  className={`bg-[#111418] border rounded-2xl p-5 ${isIncoming ? "border-yellow-400/30" : "border-[#2a3040]"}`}
                >
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-white">
                        {fromTeam?.teamName}
                      </span>
                      <span className="text-[#4a5568]">⇄</span>
                      <span className="text-sm font-semibold text-white">
                        {toTeam?.teamName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusColors[trade.status]}`}
                      >
                        {trade.status}
                      </span>
                      <span className="text-xs text-[#4a5568]">
                        {new Date(trade.timestamp).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-[#8a95a8] mb-1.5">
                        {fromTeam?.teamName} sends:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {trade.fromAssets.map((a) => (
                          <AssetBadge key={a.id} asset={a} />
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-[#8a95a8] mb-1.5">
                        {toTeam?.teamName} sends:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {trade.toAssets.map((a) => (
                          <AssetBadge key={a.id} asset={a} />
                        ))}
                      </div>
                    </div>
                  </div>

                  {hasImpact && (
                    <div className="grid grid-cols-2 gap-4 mb-4 text-[11px]">
                      <div className="text-[#ff6b35]">
                        {trade.fromSlotImpact.offenseBurned > 0 && (
                          <span>
                            🔥 {fromTeam?.teamName}: −
                            {trade.fromSlotImpact.offenseBurned} off
                          </span>
                        )}
                        {trade.fromSlotImpact.defenseBurned > 0 && (
                          <span className="ml-1">
                            −{trade.fromSlotImpact.defenseBurned} def
                          </span>
                        )}
                      </div>
                      <div className="text-[#ff6b35]">
                        {trade.toSlotImpact.offenseBurned > 0 && (
                          <span>
                            🔥 {toTeam?.teamName}: −
                            {trade.toSlotImpact.offenseBurned} off
                          </span>
                        )}
                        {trade.toSlotImpact.defenseBurned > 0 && (
                          <span className="ml-1">
                            −{trade.toSlotImpact.defenseBurned} def
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {isIncoming && (
                    <div className="flex gap-2 pt-3 border-t border-[#2a3040]">
                      <button
                        onClick={() => updateTradeStatus(trade.id, "accepted")}
                        className="px-5 py-2 bg-[#00e5a0] text-black text-sm font-semibold rounded-lg hover:bg-[#00ffb3] transition-colors"
                      >
                        Accept Trade
                      </button>
                      <button
                        onClick={() => updateTradeStatus(trade.id, "rejected")}
                        className="px-5 py-2 bg-red-500/10 text-red-400 border border-red-500/20 text-sm font-semibold rounded-lg hover:bg-red-500/20 transition-colors"
                      >
                        Reject
                      </button>
                    </div>
                  )}

                  {isOutgoing && (
                    <div className="flex gap-2 pt-3 border-t border-[#2a3040]">
                      <button
                        onClick={() => updateTradeStatus(trade.id, "cancelled")}
                        className="px-5 py-2 bg-[#2a3040] text-[#8a95a8] text-sm font-semibold rounded-lg hover:bg-[#3a4455] transition-colors"
                      >
                        Cancel Proposal
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

