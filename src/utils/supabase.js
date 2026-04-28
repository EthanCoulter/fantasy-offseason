import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.REACT_APP_SUPABASE_URL || 'https://liooorggqkavoqrlodea.supabase.co';
const SUPABASE_KEY = process.env.REACT_APP_SUPABASE_ANON_KEY || 'sb_publishable_M2LerfqlN6l0rl2u6KLtyw_AAD6sZkZ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  realtime: { params: { eventsPerSecond: 10 } },
});

export const TABLES = {
  rankings: 'rankings',
  keepers: 'keepers',
  slotsBurned: 'slots_burned',
  teamAssets: 'team_assets',
  trades: 'trades',
  mockDrafts: 'mock_drafts',
  savedMockDrafts: 'saved_mock_drafts',
  draftState: 'draft_state',
  draftQueues: 'draft_queues',
};

// One-time setup for the draft table (run in Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS draft_state (
//     id                     INT PRIMARY KEY DEFAULT 1,
//     is_active              BOOLEAN DEFAULT FALSE,
//     is_trial               BOOLEAN DEFAULT FALSE,
//     current_pick_start_time TIMESTAMPTZ,
//     picks                  JSONB DEFAULT '[]'::jsonb,
//     started_at             TIMESTAMPTZ,
//     ended_at               TIMESTAMPTZ,
//     updated_at             TIMESTAMPTZ DEFAULT NOW(),
//     CONSTRAINT draft_state_singleton CHECK (id = 1)
//   );
//   INSERT INTO draft_state (id) VALUES (1) ON CONFLICT DO NOTHING;
//   ALTER PUBLICATION supabase_realtime ADD TABLE draft_state;
//   ALTER TABLE draft_state ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "draft_state read"  ON draft_state FOR SELECT USING (true);
//   CREATE POLICY "draft_state write" ON draft_state FOR UPDATE USING (true);
//
// One-time setup for the draft-queue table (run in Supabase SQL editor):
//
//   CREATE TABLE IF NOT EXISTS draft_queues (
//     roster_id   INT PRIMARY KEY,
//     player_ids  JSONB DEFAULT '[]'::jsonb,
//     updated_at  TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER PUBLICATION supabase_realtime ADD TABLE draft_queues;
//   ALTER TABLE draft_queues ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "draft_queues read"   ON draft_queues FOR SELECT USING (true);
//   CREATE POLICY "draft_queues insert" ON draft_queues FOR INSERT WITH CHECK (true);
//   CREATE POLICY "draft_queues update" ON draft_queues FOR UPDATE USING (true);
//   CREATE POLICY "draft_queues delete" ON draft_queues FOR DELETE USING (true);
//
// One-time setup for named-saved mock drafts (run in Supabase SQL editor).
// Each row is one saved snapshot of a manager's working mock board, named
// by the manager (e.g. "Best-case", "If Bijan slides"). The working board
// itself still lives in `mock_drafts` (one-row-per-roster, holds the PIN).
//
//   CREATE TABLE IF NOT EXISTS saved_mock_drafts (
//     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//     roster_id   INT NOT NULL,
//     name        TEXT NOT NULL,
//     picks       JSONB DEFAULT '[]'::jsonb,
//     created_at  TIMESTAMPTZ DEFAULT NOW(),
//     updated_at  TIMESTAMPTZ DEFAULT NOW()
//   );
//   CREATE INDEX IF NOT EXISTS saved_mock_drafts_roster_idx
//     ON saved_mock_drafts(roster_id);
//   ALTER PUBLICATION supabase_realtime ADD TABLE saved_mock_drafts;
//   ALTER TABLE saved_mock_drafts ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "saved_mock_drafts read"   ON saved_mock_drafts FOR SELECT USING (true);
//   CREATE POLICY "saved_mock_drafts insert" ON saved_mock_drafts FOR INSERT WITH CHECK (true);
//   CREATE POLICY "saved_mock_drafts update" ON saved_mock_drafts FOR UPDATE USING (true);
//   CREATE POLICY "saved_mock_drafts delete" ON saved_mock_drafts FOR DELETE USING (true);
