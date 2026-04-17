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
  draftState: 'draft_state',
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
