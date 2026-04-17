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
};
