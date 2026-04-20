// Single source of truth for position-colored UI.
//
// Two flavors:
//   - POS_PILL: the small colored badge that says "RB", "WR" etc. — strong
//     tint so it pops inside a dark row.
//   - POS_BOX:  softer tint for the CONTAINER holding a player (a keeper
//     slot, a trade asset row, a list row). Subtle enough that a column
//     of mixed positions still reads cleanly, clear enough that RB vs WR
//     is obvious at a glance.
//
// Any UI surface that shows a player (KeepersPage slots/list, TradePage
// AssetBadge/AssetSelector, DraftPickPage available list, MyTeam roster,
// LeaguePage expansion) should route through the helpers below so the
// color coding stays consistent app-wide.
//
// Tailwind needs to see the full class strings at build time, so keep
// the maps as literal strings — do NOT interpolate the color/variant.

export const POS_PILL = {
  QB: 'bg-red-500/15 text-red-400 border-red-500/30',
  RB: 'bg-green-500/15 text-green-400 border-green-500/30',
  WR: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  TE: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  K:  'bg-purple-500/15 text-purple-400 border-purple-500/30',
  DEF: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DL: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DE: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  DT: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  NT: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  LB: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  ILB: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  OLB: 'bg-teal-500/15 text-teal-400 border-teal-500/30',
  DB: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  CB: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  S:  'bg-pink-500/15 text-pink-400 border-pink-500/30',
  FS: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
  SS: 'bg-pink-500/15 text-pink-400 border-pink-500/30',
};

// Soft container tint. The two extra classes `text-{color}` and the hover
// state let wrapping elements pick up position color on their label/hover
// without needing to re-derive it.
export const POS_BOX = {
  QB: 'bg-red-500/5 border-red-500/30',
  RB: 'bg-green-500/5 border-green-500/30',
  WR: 'bg-blue-500/5 border-blue-500/30',
  TE: 'bg-orange-500/5 border-orange-500/30',
  K:  'bg-purple-500/5 border-purple-500/30',
  DEF: 'bg-yellow-500/5 border-yellow-500/30',
  DL: 'bg-yellow-500/5 border-yellow-500/30',
  DE: 'bg-yellow-500/5 border-yellow-500/30',
  DT: 'bg-yellow-500/5 border-yellow-500/30',
  NT: 'bg-yellow-500/5 border-yellow-500/30',
  LB: 'bg-teal-500/5 border-teal-500/30',
  ILB: 'bg-teal-500/5 border-teal-500/30',
  OLB: 'bg-teal-500/5 border-teal-500/30',
  DB: 'bg-pink-500/5 border-pink-500/30',
  CB: 'bg-pink-500/5 border-pink-500/30',
  S:  'bg-pink-500/5 border-pink-500/30',
  FS: 'bg-pink-500/5 border-pink-500/30',
  SS: 'bg-pink-500/5 border-pink-500/30',
};

// Slightly punchier variant for a SELECTED / toggled-on player tile —
// same hue, heavier bg and border so the toggle state is obvious.
export const POS_BOX_ON = {
  QB: 'bg-red-500/15 border-red-500/60',
  RB: 'bg-green-500/15 border-green-500/60',
  WR: 'bg-blue-500/15 border-blue-500/60',
  TE: 'bg-orange-500/15 border-orange-500/60',
  K:  'bg-purple-500/15 border-purple-500/60',
  DEF: 'bg-yellow-500/15 border-yellow-500/60',
  DL: 'bg-yellow-500/15 border-yellow-500/60',
  DE: 'bg-yellow-500/15 border-yellow-500/60',
  DT: 'bg-yellow-500/15 border-yellow-500/60',
  NT: 'bg-yellow-500/15 border-yellow-500/60',
  LB: 'bg-teal-500/15 border-teal-500/60',
  ILB: 'bg-teal-500/15 border-teal-500/60',
  OLB: 'bg-teal-500/15 border-teal-500/60',
  DB: 'bg-pink-500/15 border-pink-500/60',
  CB: 'bg-pink-500/15 border-pink-500/60',
  S:  'bg-pink-500/15 border-pink-500/60',
  FS: 'bg-pink-500/15 border-pink-500/60',
  SS: 'bg-pink-500/15 border-pink-500/60',
};

const NEUTRAL_PILL = 'bg-[#1a1f27] text-[#8a95a8] border-[#2a3040]';
const NEUTRAL_BOX = 'bg-[#0a0c10] border-[#2a3040]';
const NEUTRAL_BOX_ON = 'bg-[#1a1f27] border-[#3a4455]';

export function posPill(pos) {
  return POS_PILL[pos] || NEUTRAL_PILL;
}

export function posBox(pos) {
  return POS_BOX[pos] || NEUTRAL_BOX;
}

export function posBoxOn(pos) {
  return POS_BOX_ON[pos] || NEUTRAL_BOX_ON;
}
