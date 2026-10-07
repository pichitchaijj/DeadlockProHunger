/** Plain API constants, safe to import from client components and tests (no server-only code). */

export const REGIONS = [
  ['Europe', 'Europe'],
  ['NAmerica', 'North America'],
  ['SAmerica', 'South America'],
  ['Asia', 'Asia'],
  ['Oceania', 'Oceania'],
] as const
export type Region = (typeof REGIONS)[number][0]

/** Scoreboard sort keys we expose (subset of the API's `sort_by` values). */
export const SCOREBOARD_METRICS = {
  winrate: { label: 'Win rate', format: 'percent' },
  avg_kills_per_match: { label: 'Kills per match', format: 'decimal' },
  avg_assists_per_match: { label: 'Assists per match', format: 'decimal' },
  avg_net_worth_per_match: { label: 'Souls per match', format: 'integer' },
  avg_player_damage_per_match: { label: 'Hero damage per match', format: 'integer' },
  avg_last_hits_per_match: { label: 'Last hits per match', format: 'decimal' },
  matches: { label: 'Matches played', format: 'integer' },
  rank: { label: 'Rank progress', format: 'integer' },
} as const
export type ScoreboardMetric = keyof typeof SCOREBOARD_METRICS

/** Minimum purchases per item row we request from item-stats / item-flow (equal to Hero Detail's, so hero-filtered calls share its cache entry). */
export const ITEM_MIN_MATCHES = 200
