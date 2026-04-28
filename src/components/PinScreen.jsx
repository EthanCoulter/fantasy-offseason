import React, { useState } from 'react';

// Shared PIN gate used by both MockDraftPage and DraftQueuePage. The same
// PIN protects both — it lives on the manager's `mock_drafts` row. This
// keeps the UX consistent: one private PIN per manager, two private
// surfaces unlocked with it.
//
// `mode` is 'create' (no PIN yet — confirm-pin field is shown) or
// 'unlock' (existing PIN — single field). `onSubmit` is called with
// either { pin } on success or { error } if the local validation fails.
// `onReset` (optional, unlock-only) lets the user nuke their PIN /
// board if they've forgotten it.
//
// `title` and `description` let each surface customize the copy without
// duplicating the input/validation/keyboard wiring.
export default function PinScreen({
  mode,
  onSubmit,
  onReset,
  error,
  title,
  description,
  resetLabel,
}) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const handle = async () => {
    if (pin.length < 4) return onSubmit({ error: 'PIN must be at least 4 digits' });
    if (mode === 'create' && pin !== confirmPin) {
      return onSubmit({ error: 'PINs do not match' });
    }
    onSubmit({ pin });
  };

  return (
    <div className="max-w-md mx-auto bg-[#111418] border border-[#2a3040] rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">
          {title || (mode === 'create' ? 'Create Your PIN' : 'Unlock')}
        </h2>
        <p className="text-sm text-[#8a95a8]">
          {description || (mode === 'create'
            ? 'Set a PIN to keep this view private. You\'ll need it to view or edit later.'
            : 'Enter your PIN to access your private view.')}
        </p>
      </div>

      <input
        type="password"
        value={pin}
        onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
        placeholder="Enter PIN (4+ digits)"
        className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0]"
        onKeyDown={e => e.key === 'Enter' && handle()}
      />

      {mode === 'create' && (
        <input
          type="password"
          value={confirmPin}
          onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
          placeholder="Confirm PIN"
          className="w-full bg-[#1a1f27] border border-[#2a3040] rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-[#00e5a0]"
          onKeyDown={e => e.key === 'Enter' && handle()}
        />
      )}

      {error && (
        <div className="text-sm text-red-400 bg-red-400/10 rounded-lg px-3 py-2">{error}</div>
      )}

      <button
        onClick={handle}
        className="w-full py-3 rounded-xl bg-[#00e5a0] text-black font-semibold text-sm hover:bg-[#00ffb3] transition-colors"
      >
        {mode === 'create' ? 'Create PIN' : 'Unlock'}
      </button>

      {mode === 'unlock' && onReset && (
        <button
          onClick={onReset}
          className="w-full text-xs text-[#8a95a8] hover:text-red-400 transition-colors pt-2"
        >
          {resetLabel || 'Forgot PIN? Reset (wipes saved data)'}
        </button>
      )}
    </div>
  );
}
