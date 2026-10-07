# Mobile

Audited at 320, 375, 390, 430, 768, 1024 and 1440px on every page (headless Chrome, touch
emulation). Phones are designed for, not shrunk: each page puts identity, the primary stat, the
top insight, the primary CTA/filter and the essential chart first, and moves depth behind tabs,
disclosures or a second line.

## Global rules

| Rule | How |
|---|---|
| No horizontal page scroll | `:where(.grid) > * { min-width: 0 }` (grid items shrink instead of widening the page) and `:where(.overflow-x-auto, .overflow-auto) { position: relative }` (absolutely positioned `.sr-only` text inside scrollers can't escape and widen the mobile layout viewport). Both in `globals.css` base layer. |
| Touch targets | Controls ≥ 44px. Small text links keep their desktop look and get `pointer-coarse:min-h-11` on touch; whole-card links use an `after:absolute after:inset-0` overlay. |
| Tables | Phones (< `sm`) get cards; the table starts at `sm`. Kept as tables: 2D grids (ability upgrade order, purchase timing) and the 3-column draft role table, which fit and read as grids. |
| Chart labels | Axis labels are HTML next to the SVG, so they stay 12px on phones (SVG text scaled down to ~6px). |
| Safe areas | `viewport-fit=cover`; page gutters use `env(safe-area-inset-left/right)`; footer and the mobile drawer pad `env(safe-area-inset-bottom)`. No fixed bottom bars. |
| 320px header | Below 360px the header tightens its gaps and steps the wordmark down one size so brand + search + menu fit. |
| Navigation | Hamburger drawer (focus-trapped dialog) holds all primary + secondary items; search is an icon button opening the Ctrl/⌘+K palette. Long pages have a sticky section nav (hero, match, profile). |

Known exceptions: match timeline markers (dense chart points, < 24px) — the full events list
below the chart is the accessible, touch-sized equivalent. The timeline itself scrolls inside its
frame at ≥ 640px so its markers stay distinguishable.

## Per page

Columns: **Essential** (first screen) · **Collapses** · **Tabs** · **Cards** · **Below the fold**.

| Page | Essential | Collapses | Tabs | Cards | Below the fold |
|---|---|---|---|---|---|
| Home | Headline, CTA (“explore meta”), summary stats | “Why?” on pulse cards | — | Pulse, heroes, builds (swipe row), matches | Patch snapshot onward |
| Meta | Summary stats, patch/rank/role filters | Advanced filters; hero list shows the first 12, “Show all 39” | Sort chips | Hero cards (tier, win/pick rate, trend, confidence) | At a glance → tiers → full list |
| Heroes | Search, sort, role filter | More filters | — | Hero cards, 2 columns | — |
| Hero detail | Portrait, name, role, tier, win/pick rate, scope filters | Data tables (“Show data”) | Overview / Matchups / Items / Abilities / Builds / Matches (sticky) | Matchup and synergy rows | “Why is X strong?” then sections |
| Builds | Category tabs, scope filters | “How builds are labeled” | Meta / Pro / Community | Build cards | — |
| Build detail | Build name, hero, labels, win rate + confidence | Author’s layout, phase details | — | Item rows | Ability plan grid (scrolls in its frame) |
| Matches | Search + hero/player filter (now above the fold) | Players per match | — | Match cards; live matches as a swipe row (one card tall) | Results list |
| Match detail | Score, result, duration, mode, patch | Graph values, per-player souls | Story / Teams / Players / Lineup / Timeline / … (sticky) | Player cards (K/D/A + souls first; LH/DN, damage, level second line) | Builds, performance, graphs, events |
| Players | Search field, rank filter | — | Search / Leaderboard (link) | Result cards | — |
| Player profile | Avatar, name, rank, win rate / last 20 / ranked | — | Recent / Trend / Hero pool / Teammates / Opponents / History (sticky) | Recent matches, hero pool, teammates, opponents, history | Trend charts onward |
| Leaderboard | View tabs, scope filter, top 3 | — | Ranked / Performance | Player cards (whole card links) | Full list, pages |
| Compare | Type tabs, pickers, VS header | “N other pairings” | Hero / Build / Player | Side-by-side rows stack as two cells | Key differences first, then charts |
| Draft Lab | Teams (6 slots each), add-to toggle | “Other pairings not clear” | — | Recommendations | Picker, map, recommendations, weak points, balance |
| Search (Ctrl/⌘+K) | Input, grouped results | — | — | Result rows ≥ 48px | — |

## Open items

- `Analyze` is in the primary nav but `/analyze` isn’t built, so it resolves to the 404 page.
- Profile and match detail got taller on phones (cards instead of sideways-scrolling tables). If
  that becomes a problem, collapse match history after 10 rows.

## Re-running the audit

The audit scripts (overflow, target sizes, tables, tiny text, fold positions per route × width)
live outside the repo; the checks they ran are listed above. Mobile emulation must include touch
(`pointer: coarse`) and measure `innerWidth` against the device width: phones widen the layout
viewport instead of showing a horizontal scrollbar, so `scrollWidth > innerWidth` alone misses it.
