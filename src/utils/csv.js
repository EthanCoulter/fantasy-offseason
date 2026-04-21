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

// League roster CSV — each team's keepers, current-year unused picks,
// drafted players from the live draft, AND every future-year pick they
// own (e.g. 2027). The future-year columns are important even though
// they aren't drafted yet: they can be traded live during the current
// draft, so anyone pasting this sheet mid-draft or end-of-draft wants
// to see the latest ownership. Pass `years` as the full set of draft
// years the league tracks; `currentYear` is the one the live draft is
// running on — we emit one column per future year after it.
export function buildLeagueRosterCsv({
  teams,
  teamAssets,
  playerDB, // eslint-disable-line no-unused-vars
  draftState,
  currentYear,
  years = [currentYear],
}) {
  const picks = draftState?.picks || [];
  const futureYears = (years || [])
    .filter(y => y !== currentYear)
    .sort((a, b) => a - b);

  // Original-owner lookup for pick-provenance labels. A team that holds
  // multiple picks in the same round (via trade) needs each one
  // individually identifiable — for current-year picks the slot does
  // this, for future-year picks we attach the original owner.
  const teamNameByRoster = new Map();
  teams.forEach(t => teamNameByRoster.set(t.rosterId, t.teamName || t.displayName || `Roster ${t.rosterId}`));

  const header = [
    'Team', 'Manager', 'Record',
    'Keepers',
    `${currentYear} Picks (unused)`,
    `${currentYear} Drafted`,
    ...futureYears.map(y => `${y} Picks`),
  ];
  const rows = [header];

  teams.forEach(team => {
    const assets = teamAssets[team.rosterId] || { players: [], picks: [] };
    const keepers = (assets.players || [])
      .map(p => `${p.name} (${p.position})`)
      .join('; ');
    // Current-year picks still sitting on the team (i.e. not yet spent in
    // the live draft). We subtract what's already in the draft log so a
    // pick that's already been used doesn't double-appear in the
    // "unused" column AND the "drafted" column. `assets.picks` has one
    // entry per owned pick, so a team holding two picks in the same
    // round (e.g. 2.03 and 2.09 via trade) gets two separate entries —
    // both show up distinctly thanks to the unique slot in the label.
    const usedPickKeys = new Set(
      picks
        .filter(p => p.rosterId === team.rosterId)
        .map(p => `${currentYear}_${p.round}_${p.slot}`)
    );
    const thisYearPicks = (assets.picks || [])
      .filter(p => p.year === currentYear)
      .filter(p => !usedPickKeys.has(`${currentYear}_${p.round}_${p.position}`))
      .sort((a, b) => a.round - b.round || (a.position || 99) - (b.position || 99))
      .map(p => p.label)
      .join('; ');
    // Every player the team drafted, period — one entry per pick. If a
    // team had multiple picks in a single round (which happens any time
    // they trade into extra picks), every player they selected is
    // listed individually. Sorted by pickIndex so the order mirrors the
    // actual draft sequence.
    const drafted = picks
      .filter(p => p.rosterId === team.rosterId)
      .sort((a, b) => a.pickIndex - b.pickIndex)
      .map(p => `R${p.round}.${String(p.slot).padStart(2, '0')} ${p.playerName} (${p.position})`)
      .join('; ');
    // One cell per future year. Each pick is listed separately so a team
    // owning two 2027 R3 picks gets two distinct entries. Future-year
    // labels don't carry slot info (future draft order hasn't been set
    // yet), so picks that were traded in from elsewhere get a "(from
    // OtherTeam)" suffix to make the pair distinguishable. Picks the
    // team still owns from its own original allotment stay plain.
    const futureCells = futureYears.map(year =>
      (assets.picks || [])
        .filter(p => p.year === year)
        .sort((a, b) => a.round - b.round || (a.originalRosterId ?? 0) - (b.originalRosterId ?? 0))
        .map(p => {
          const isTradedIn = p.originalRosterId != null && p.originalRosterId !== team.rosterId;
          if (!isTradedIn) return p.label;
          const fromName = teamNameByRoster.get(p.originalRosterId) || `Roster ${p.originalRosterId}`;
          return `${p.label} (from ${fromName})`;
        })
        .join('; ')
    );

    rows.push([
      team.teamName,
      team.displayName,
      `${team.wins}-${team.losses}`,
      keepers,
      thisYearPicks,
      drafted,
      ...futureCells,
    ]);
  });
  return rows;
}
