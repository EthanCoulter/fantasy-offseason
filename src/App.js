import React, { useEffect, useState } from 'react';
import useStore, { LEAGUE_ID } from './store';
import { fetchAllLeagueData, fetchPlayerDB } from './utils/sleeper';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';

function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-[#00e5a0]/10 border border-[#00e5a0]/20 flex items-center justify-center mb-2">
        <span className="text-2xl">🏈</span>
      </div>
      <h1 className="text-white font-black text-xl tracking-widest" style={{ fontFamily: 'Bebas Neue, sans-serif' }}>
        OFFSEASON HQ
      </h1>
      <div className="flex items-center gap-2 text-[#8a95a8] text-sm">
        <div className="w-4 h-4 border-2 border-[#00e5a0] border-t-transparent rounded-full animate-spin" />
        {message}
      </div>
    </div>
  );
}

function ErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen bg-[#0a0c10] flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-4xl">⚠️</div>
      <div className="text-white font-semibold text-lg">Failed to load league</div>
      <div className="text-[#8a95a8] text-sm text-center max-w-sm bg-[#111418] border border-[#2a3040] rounded-xl px-4 py-3">{error}</div>
      <button onClick={onRetry} className="px-6 py-2.5 bg-[#00e5a0] text-black font-semibold rounded-xl hover:bg-[#00ffb3] transition-colors">
        Retry
      </button>
    </div>
  );
}

export default function App() {
  const { currentUser, setLeagueData, leagueLoaded } = useStore();
  const [loadState, setLoadState] = useState('loading');
  const [loadMsg, setLoadMsg] = useState('Connecting to Sleeper...');
  const [error, setError] = useState('');

  const loadData = async () => {
    setLoadState('loading');
    setError('');
    try {
      setLoadMsg('Connecting to Sleeper...');
      const { teams } = await fetchAllLeagueData(LEAGUE_ID);
      setLoadMsg('Loading player database (may take a moment)...');
      const playerDB = await fetchPlayerDB();
      setLeagueData(teams, playerDB);
      setLoadState('done');
    } catch (e) {
      setError(e.message || 'Unknown error');
      setLoadState('error');
    }
  };

  useEffect(() => {
    if (leagueLoaded) { setLoadState('done'); return; }
    loadData();
    // eslint-disable-next-line
  }, []);

  if (loadState === 'loading') return <LoadingScreen message={loadMsg} />;
  if (loadState === 'error') return <ErrorScreen error={error} onRetry={loadData} />;
  if (!currentUser) return <LoginPage />;
  return <Layout />;
}
