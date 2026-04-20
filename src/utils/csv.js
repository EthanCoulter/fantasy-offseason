// CSV export helpers. Keep formatting simple so the file round-trips into
// Excel / Google Sheets cleanly — quote every field, escape embedded quotes.

function escapeCell(val) {
  if (val == null) return '';
  const s = String(val);
  return `"${s.replace(/"/g, '""')}"`;
}

export function rowsToCsv(rows) {
  return rows.map(r => r.map(escapeCell).join(',')).join('\r\n');
}

export function downloadCsv(filename, rows) {
  const csv = rowsToCsv(rows);
  // BOM so Excel opens UTF-8 correctly
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Team × Round grid — one row per team, columns for each round's pick.
// A team may hold MULTIPLE picks in the same round (via trade), so each
// cell joins every pick that team made in that round, ordered by overall
// pick index, with the slot prefix so the exact pick is unambiguous.
// Matches the Schefter/Sleeper style "draft recap by team" view.
export function buildDraftRecapCsv({ teams, draftState, draftOrder }) {
  if (!draftState || !teams) return [];
  const picks = draftState.picks || [];
  // Determine max round actually drafted
  const maxRound = picks.reduce((m, p) => Math.max(m, p.round || 0), 0)
    || (draftOrder[draftOrder.length - 1]?.round || 0);
  const header = ['Team', 'Manager', 'Draft Slot', 'Total Picks'];
  for (let r = 1; r <= maxRound; r++) header.push(`R${r}`);

  // "Draft Slot" for a team = the commissioner-assigned slot of their
  // earliest (lowest-pickIndex) pick. A team that only owns traded-in
  // picks will surface that first actual selection.
  const earliestPickByTeam = new Map();
  [...picks]
    .sort((a, b) => (a.pickIndex ?? 0) - (b.pickIndex ?? 0))
    .forEach(p => {
      if (!earliestPickByTeam.has(p.rosterId)) earliestPickByTeam.set(p.rosterId, p);
    });

  const sortedTeams = [...teams].sort((a, b) => {
    const sa = earliestPickByTeam.get(a.rosterId)?.slot ?? 99;
    const sb = earliestPickByTeam.get(b.rosterId)?.slot ?? 99;
    return sa - sb || a.teamName.localeCompare(b.teamName);
  });

  const formatPick = (p) =>
    `${p.round}.${String(p.slot).padStart(2, '0')} ${p.playerName}` +
    ` (${p.position}${p.nflTeam ? ', ' + p.nflTeam : ''})`;

  const rows = [header];
  sortedTeams.forEach(team => {
    const theirPicks = picks
      .filter(p => p.rosterId === team.rosterId)
      .sort((a, b) => (a.pickIndex ?? 0) - (b.pickIndex ?? 0));
    const firstSlot = earliestPickByTeam.get(team.rosterId)?.slot ?? '';
    const cells = [team.teamName, team.displayName, firstSlot, theirPicks.length];
    for (let r = 1; r <= maxRound; r++) {
      const roundPicks = theirPicks.filter(p => p.round === r);
      // Multiple picks in the same round → join with " | " so they stay
      // in one cell but both are clearly visible in Excel / Sheets.
      cells.push(roundPicks.map(formatPick).join(' | '));
    }
    rows.push(cells);
  });
  return rows;
}

// League roster CSV — each team's keepers, current-year picks, and (if the
// draft has begun) drafted players. Designed to paste into an Excel sheet.
export function buildLeagueRosterCsv({ teams, teamAssets, playerDB, draftState, currentYear }) {
  const picks = draftState?.picks || [];
  const header = [
    'Team', 'Manager', 'Record',
    'Keepers', `${currentYear} Picks`, `${currentYear} Drafted`,
  ];
  const rows = [header];

  teams.forEach(team => {
    const assets = teamAssets[team.rosterId] || { players: [], picks: [] };
    const keepers = (assets.players || [])
      .map(p => `${p.name} (${p.position})`)
      .join('; ');
    const thisYearPicks = (assets.picks || [])
      .filter(p => p.year === currentYear)
      .sort((a, b) => a.round - b.round || (a.position || 99) - (b.position || 99))
      .map(p => p.label)
      .join('; ');
    const drafted = picks
      .filter(p => p.rosterId === team.rosterId)
      .sort((a, b) => a.pickIndex - b.pickIndex)
      .map(p => `R${p.round}.${String(p.slot).padStart(2, '0')} ${p.playerName} (${p.position})`)
      .join('; ');

    rows.push([
      team.teamName,
      team.displayName,
      `${team.wins}-${team.losses}`,
      keepers,
      thisYearPicks,
      drafted,
    ]);
  });
  return rows;
}
