import React, { useState } from 'react';
import useStore from '../store';

export default function LoginPage() {
  const { teams, setCurrentUser } = useStore();
  const [selected, setSelected] = useState('');
  const [commishMode, setCommishMode] = useState(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = () => {
    if (commishMode) {
      if (password === 'commish2024') {
        setCurrentUser('commissioner', true);
      } else {
        setError('Incorrect commissioner password');
      }
      return;
    }
    if (!selected) { setError('Please select your team'); return; }
    setCurrentUser(Number(selected), false);
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#00e5a0]/10 border border-[#00e5a0]/20 mb-4">
            <span className="text-3xl">🏈</span>
          </div>
          <h1 className="text-4xl font-black tracking-tight text-white mb-1" style={{fontFamily:'Bebas Neue, sans-serif', letterSpacing:'0.05em'}}>
            OFFSEASON HQ
          </h1>
          <p className="text-[#8a95a8] text-sm">Fantasy League Offseason Manager</p>
        </div>

        {/* Card */}
        <div className="bg-[#111418] border border-[#2a3040] rounded-2xl p-6 shadow-2xl">
          <div className="flex gap-2 mb-6 p-1 bg-[#0a0c10] rounded-xl">
            <button
              onClick={() => { setCommishMode(false); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                !commishMode
                  ? 'bg-[#1a1f27] text-white shadow'
                  : 'text-[#8a95a8] hover:text-white'
              }`}
            >
              Manager Login
            </button>
            <button
              onClick={() => { setCommishMode(true); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                commishMode
                  ? 'bg-[#1a1f27] text-white shadow'
                  : 'text-[#8a95a8] hover:text-white'
              }`}
            >
              Commissioner
            </button>
          </div>

          {!commishMode ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#8a95a8] mb-2">
                Select Your Team
              </label>
              {teams.length === 0 ? (
                <div className="text-center py-6 text-[#8a95a8] text-sm">
                  <div className="animate-spin inline-block w-5 h-5 border-2 border-[#00e5a0] border-t-transparent rounded-full mb-2" />
                  <div>Loading teams...</div>
                </div>
              ) : (
                <select
                  value={selected}
                  onChange={e => { setSelected(e.target.value); setError(''); }}
                  className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0] transition-colors appearance-none cursor-pointer"
                >
                  <option value="">-- Choose your team --</option>
                  {teams.map(t => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.teamName} ({t.displayName})
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-[#8a95a8] mb-2">
                Commissioner Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                placeholder="Enter password"
                className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0] transition-colors"
              />
              <p className="text-xs text-[#4a5568] mt-2">Default: commish2024</p>
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={!commishMode && !selected}
            className="w-full mt-5 py-3 rounded-xl bg-[#00e5a0] text-black font-semibold text-sm hover:bg-[#00ffb3] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Enter Offseason HQ →
          </button>
        </div>

        <p className="text-center text-xs text-[#4a5568] mt-4">
          League ID: 1250556742954135552
        </p>
      </div>
    </div>
  );
}
