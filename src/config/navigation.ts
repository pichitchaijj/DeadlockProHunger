/**
 * Site navigation (docs/PRODUCT.md § Information architecture).
 * Single source for the header, More menu, mobile drawer, footer and command palette.
 */
export type NavItem = {
  /** Stable key for translated labels (`Nav.links.<id>` in src/i18n/messages). */
  id: NavId
  /** English label, the source text (the header and footer show the active locale's translation). */
  label: string
  href: string
  /** One line used in the More menu, mobile drawer and command palette. */
  description: string
  /** `later` = post-MVP section (docs/ROADMAP.md); shown with a "Later" marker. */
  phase: 'mvp' | 'later'
  /**
   * Whether the route exists yet. Links to unbuilt sections are not prefetched: each prefetch
   * renders the not-found page on the server, on every page view (docs/PERFORMANCE.md).
   */
  built: boolean
}

export type NavId = 'home' | 'meta' | 'heroes' | 'builds' | 'matches' | 'analyze' | 'players' | 'leaderboard' | 'compare' | 'draft' | 'items' | 'patch' | 'tools' | 'community'

export const primaryNav: NavItem[] = [
  { id: 'home', label: 'Home', href: '/', description: 'What matters in Deadlock right now', phase: 'mvp', built: true },
  { id: 'meta', label: 'Meta', href: '/meta', description: 'Strongest heroes by rank and window', phase: 'mvp', built: true },
  { id: 'heroes', label: 'Heroes', href: '/heroes', description: 'Matchups, items and ability orders', phase: 'mvp', built: true },
  { id: 'builds', label: 'Builds', href: '/builds', description: 'Community builds with real win rates', phase: 'mvp', built: true },
  { id: 'matches', label: 'Matches', href: '/matches', description: 'Find a match or browse high-rank games', phase: 'mvp', built: true },
  { id: 'analyze', label: 'Analyze', href: '/analyze', description: 'Analyze one hero in depth: trends, peers, builds, matchups', phase: 'mvp', built: true },
]

export const secondaryNav: NavItem[] = [
  { id: 'players', label: 'Players', href: '/players', description: 'Search players, ranks and recent form', phase: 'mvp', built: true },
  { id: 'leaderboard', label: 'Leaderboard', href: '/leaderboard', description: 'Top players by region', phase: 'mvp', built: true },
  { id: 'compare', label: 'Compare', href: '/compare', description: 'Heroes, builds or players side by side', phase: 'mvp', built: true },
  { id: 'draft', label: 'Draft Lab', href: '/draft', description: 'Team synergy, matchups and next picks', phase: 'mvp', built: true },
  { id: 'items', label: 'Items', href: '/items', description: 'Item performance and timings', phase: 'mvp', built: true },
  { id: 'patch', label: 'Patch', href: '/patch', description: 'Patch notes, what changed and before / after stats', phase: 'mvp', built: true },
  { id: 'tools', label: 'Tools', href: '/tools', description: 'Utilities for players', phase: 'later', built: false },
  { id: 'community', label: 'Community', href: '/community', description: 'Projects and contributors', phase: 'later', built: false },
]

/** Home matches exactly; sections also match their sub-routes (/heroes/abrams). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  return pathname === href || pathname.startsWith(`${href}/`)
}
