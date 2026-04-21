import React, { useState } from 'react';
import useStore from '../store';
import MyTeamPage from '../pages/MyTeamPage';
import KeepersPage from '../pages/KeepersPage';
import TradePage from '../pages/TradePage';
import LeaguePage from '../pages/LeaguePage';
import CommissionerPage from '../pages/CommissionerPage';
import DraftBoardPage from '../pages/DraftBoardPage';
import MockDraftPage from '../pages/MockDraftPage';
import DraftRoomPage from '../pages/DraftRoomPage';
import DraftPickPage from '../pages/DraftPickPage';
import DraftQueuePage from '../pages/DraftQueuePage';

const NAV_MANAGER_BASE = [
  { id: 'team', label: 'My Team', icon: '🏟️' },
  { id: 'keepers', label: 'Keepers', icon: '⭐' },
  { id: 'trades', label: 'Trades', icon: '🔄' },
  { id: 'draftboard', label: 'Draft Board', icon: '📊' },
  { id: 'mockdraft', label: 'Mock Draft', icon: '🎯' },
  { id: 'queue', label: 'Draft Queue', icon: '📜' },
  { id: 'league', label: 'League', icon: '📋' },
];

const NAV_COMMISSIONER = [
  { id: 'commissioner', label: 'Commissioner', icon: '👑' },
  { id: 'draftroom', label: 'Draft Room', icon: '🏈' },
  { id: 'draftboard', label: 'Draft Board', icon: '📊' },
  { id: 'league', label: 'League', icon: '📋' },
  { id: 'trades', label: 'Trades', icon: '🔄' },
];

// Manager draft-pick tab is only surfaced while the draft is live.
const DRAFT_PICK_NAV_ITEM = { id: 'draftpick', label: 'Make Pick', icon: '🏈' };

export default function Layout() {
  const { currentUser, logout, trades, teams, draftState, draftOrder } = useStore();
  const [activePage, setActivePage] = useState(currentUser?.isCommissioner ? 'commissioner' : 'team');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isCommissioner = currentUser?.isCommissioner;
  const draftLive = !!draftState?.isActive;

  // Inject "Make Pick" between Trades and Draft Board while the draft is live.
  const navItems = isCommissioner
    ? NAV_COMMISSIONER
    : draftLive
      ? [...NAV_MANAGER_BASE.slice(0, 3), DRAFT_PICK_NAV_ITEM, ...NAV_MANAGER_BASE.slice(3)]
      : NAV_MANAGER_BASE;

  // On-the-clock badge for the manager pick tab
  const picksMade = (draftState?.picks || []).length;
  const onTheClockRoster = draftOrder?.[picksMade]?.currentRosterId;
  const isMyTurn = draftLive && onTheClockRoster === currentUser?.rosterId;

  const myTeam = !isCommissioner ? teams.find(t => t.rosterId === currentUser?.rosterId) : null;
  const pendingForMe = trades.filter(t => t.toRosterId === currentUser?.rosterId && t.status === 'pending').length;
  const pendingAll = trades.filter(t => t.status === 'pending').length;

  const renderPage = () => {
    switch (activePage) {
      case 'team': return <MyTeamPage />;
      case 'keepers': return <KeepersPage />;
      case 'trades': return <TradePage />;
      case 'league': return <LeaguePage />;
      case 'commissioner': return <CommissionerPage />;
      case 'draftboard': return <DraftBoardPage />;
      case 'mockdraft': return <MockDraftPage />;
      case 'draftroom': return <DraftRoomPage />;
      case 'draftpick': return <DraftPickPage />;
      case 'queue': return <DraftQueuePage />;
      default: return <MyTeamPage />;
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] flex">
      <aside className="hidden md:flex flex-col w-64 bg-[#111418] border-r border-[#2a3040] shrink-0">
        <div className="px-5 py-5 border-b border-[#2a3040]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#00e5a0]/10 border border-[#00e5a0]/20 flex items-center justify-center">
              <span className="text-base">🏈</span>
            </div>
            <div>
              <div className="text-sm font-black text-white tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                OFFSEASON HQ
              </div>
              <div className="text-[10px] text-[#4a5568] uppercase tracking-wider">Fantasy Manager</div>
            </div>
          </div>
        </div>

        <div className="px-4 py-3 border-b border-[#2a3040]">
          <div className="flex items-center gap-2.5">
            {myTeam?.avatar ? (
              <img src={myTeam.avatar} alt="" className="w-8 h-8 rounded-lg object-cover border border-[#2a3040]" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-[#1a1f27] border border-[#2a3040] flex items-center justify-center">
                <span className="text-xs font-bold text-[#00e5a0]">
                  {isCommissioner ? '👑' : myTeam?.displayName?.[0]?.toUpperCase()}
                </span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white truncate">
                {isCommissioner ? 'Commissioner' : myTeam?.teamName}
              </div>
              {!isCommissioner && myTeam && (
                <div className="text-[10px] text-[#4a5568] truncate">{myTeam.displayName}</div>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-3 space-y-0.5">
          {navItems.map(item => {
            const badge = item.id === 'trades'
              ? (isCommissioner ? pendingAll : pendingForMe)
              : 0;
            const showLive = (item.id === 'draftroom' || item.id === 'draftpick') && draftLive;
            const showOnClock = item.id === 'draftpick' && isMyTurn;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left ${
                  activePage === item.id
                    ? 'bg-[#00e5a0]/10 text-[#00e5a0] border border-[#00e5a0]/20'
                    : showOnClock
                      ? 'bg-yellow-400/10 text-yellow-400 border border-yellow-400/30 animate-pulse'
                      : 'text-[#8a95a8] hover:text-white hover:bg-[#1a1f27]'
                }`}
              >
                <span>{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {showLive && !showOnClock && (
                  <span className="text-[9px] font-bold text-[#00e5a0] bg-[#00e5a0]/15 px-1.5 py-0.5 rounded-full">
                    LIVE
                  </span>
                )}
                {showOnClock && (
                  <span className="text-[9px] font-bold text-black bg-yellow-400 px-1.5 py-0.5 rounded-full">
                    CLOCK
                  </span>
                )}
                {badge > 0 && (
                  <span className="w-5 h-5 bg-yellow-400 text-black text-[10px] font-bold rounded-full flex items-center justify-center">
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="px-3 py-3 border-t border-[#2a3040]">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[#4a5568] hover:text-red-400 hover:bg-red-400/5 transition-all"
          >
            <span>↩</span>
            <span>Switch Team</span>
          </button>
        </div>
      </aside>

      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-[#111418] border-b border-[#2a3040] px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">🏈</span>
          <span className="text-sm font-black text-white tracking-wide" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>OFFSEASON HQ</span>
        </div>
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="text-[#8a95a8] text-xl">
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
      </div>

      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#0a0c10]/90 pt-14" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-[#111418] border-b border-[#2a3040] px-4 py-4 space-y-1" onClick={e => e.stopPropagation()}>
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => { setActivePage(item.id); setMobileMenuOpen(false); }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium transition-all text-left ${
                  activePage === item.id ? 'bg-[#00e5a0]/10 text-[#00e5a0]' : 'text-[#8a95a8]'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
            <button onClick={logout} className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-red-400">
              <span>↩</span><span>Switch Team</span>
            </button>
          </div>
        </div>
      )}

      {/* `min-w-0` is load-bearing here: without it, a flex child refuses to
          shrink below its intrinsic content width, which is what causes the
          whole page to overflow horizontally on mobile when one card is
          a pixel too wide. */}
      <main className="flex-1 min-w-0 overflow-x-hidden overflow-y-auto">
        <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-8 py-5 md:py-8 mt-14 md:mt-0">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}
