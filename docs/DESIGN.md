# Deadlockprohunger — Design System

Covers **5. Design system architecture**, **12. Accessibility strategy**, and the motion spec. Re-verified 2026-10-07 against `src/app/globals.css` and `src/components/`: the tokens below are implemented with these values. The live reference for every component is the internal `/design` route. Status labels (**Implemented**, **Partial**, **Planned**, **Deprecated**, **Blocked**) are defined in [ARCHITECTURE](./ARCHITECTURE.md). Everything here is Implemented unless labelled.

Personality: dark, editorial, underground, tactical, cinematic, data-driven, modern, characterful, premium, restrained. Inspired by comic/editorial gaming culture, with an original design language.

## Brand reference: extracted design language

The primary visual reference is the brand board `Visual brand direction.png`, kept **outside the repo** (`../REFเว็บ/`). It is never shipped, embedded or traced; its illustrated artwork and page compositions are not reproduced, and its logo is never traced from it (the site uses the owner's own logo file, § Brand). Only its design language is used, translated into the original system below. Re-compared against the live site on 2026-10-07 (§ Brand alignment).

| Aspect | What the reference does | How our system expresses it |
|---|---|---|
| Color hierarchy | Deep navy ground, navy surfaces, steel borders; teal as the single interactive/brand accent, bright cyan for highlights; orange and pink appear only as small accents and in warm light | Existing tokens (same palette). Cyan = interactive/positive/current; orange = trend down/warning; pink = special. Warm tones appear only as faint atmosphere (the hero's dusk horizon), never in UI controls |
| Typography | Heavy, **forward-leaning condensed caps** for the wordmark and brand statements; condensed bold for headings; clean sans for UI and body | `.type-slant` (Barlow Condensed 800 italic, caps): wordmark and one hero statement per view. Upright display for page titles; Inter for UI; system sans for body |
| Tagline | Wide-tracked caps line: "Community · Data · Builds · Strategy" | `.text-tagline` (0.32em tracking; 0.18em on phones so it stays on fewer lines) |
| Spacing / density | Generous outer margins, dense but orderly data inside cards; consistent 16–24px card padding | 4px scale, `--spacing-card`, gutters 16/24/32px |
| Card composition | Thin 1px borders, small radius, a header label in small caps, big number + small label, optional sparkline at the right | One `Card` surface (`rounded-md`, `border-border`, `shadow-card`) under `StatCard`, `InsightCard`, `DataCard` and the domain cards; eyebrow labels |
| Borders and shadows | Hairline steel/teal borders; almost no drop shadow; glow only on the focal element | `--shadow-card` (near-flat), `--shadow-glow` once per page |
| Buttons | Primary = solid teal with dark text and an arrow; secondary = navy fill with a teal outline; ghost = quiet | `Button` primary / secondary (`border-primary/70` on `bg-surface`) / ghost |
| Chips and filters | Pills; the active one is **solid teal with dark text** | `Filter` and every hand-rolled chip use `bg-primary text-on-primary` when active; content inside (counts, complexity diamonds) switches to the chip's text color |
| Navigation | Condensed caps nav, active item marked with a teal underline; search field with a shortcut hint; one solid CTA | `PrimaryNav` underline, `SearchTrigger` with Ctrl K. Sign-in stays outlined while it is a disabled placeholder (a solid button would suggest it works) |
| Iconography | Original line icons, ~1.75px stroke, teal on dark, slightly angular; one icon per section | `components/ui/icons.tsx` (24×24, 1.75 stroke), including section icons Home / Meta (reticle) / Heroes / Builds (item slots) / Matches (crossed blades) / Analyze / Players / Leaderboard (podium) / Compare / Trends / Settings (hex nut) |
| Chart style | Thin teal (and orange) lines with point markers, slim teal bars, a ring gauge with the value in the center, dot legends | `Sparkline`, win-rate bars, timeline charts, `RadialMetric` (ring gauge); `chart-*` tokens; orange only for the comparison/falling series |
| Visual rhythm | Sections introduced by small tracked caps labels and a rule; alternating dense data blocks with breathing room | `SectionHeader` (`01 —— LABEL` + display title) |
| Image treatment | Game art only as framed data identifiers (hero portraits in cards), never as brand identity | `components/game-assets/` only; pages look complete with art off |
| Atmosphere | Cinematic dusk city: cool sky, warm horizon, neon accents | Original "data city" skyline in the Home hero: towers are a rising bar series, faint lit windows, a restrained warm horizon. No game artwork |
| Responsive | Phone view stacks the slanted statement, a full-width search and a list-style nav with icons and chevrons | Mobile drawer: full-width search, rows with section icon + label + chevron; `docs/MOBILE.md` |

---

## Brand alignment (2026-10-07)

The live site was screenshotted (Home, Heroes, Hero Detail, Match Detail, Meta, Builds, mobile Home) and compared with the brand board. Most of the language was already in place; this pass added the missing tokens and primitives without changing page layouts.

| Already matching | Added in this pass | Left as is (see § Remaining inconsistencies) |
|---|---|---|
| Palette and roles; slanted condensed statement on Home; tracked tagline; solid-cyan primary and outlined secondary buttons; pill filters with solid active state; search field with shortcut hint; navy cards with hairline steel borders; condensed caps nav with cyan underline; original "data city" instead of game art; mobile drawer with section icons | Named type scale (`display-lg`, `heading-xl/lg/md`, `body-lg/md/sm`); chart tokens; depth gradients; primary button depth; `Card` primitive; `RadialMetric`; Players / Leaderboard / Compare / Trends / Settings / Meta icons; logo variants | Page compositions and the brand board's illustrations (the logo was later added from the owner's own file) |

The 19 topics below are the system's reference. Details live in the sections after this one.

### 1. Brand personality
Premium, dark, editorial, underground, tactical, cinematic, data-driven, modern, confident, player-focused, distinctive, slightly gritty. "Deep like an analyst tool, simple like a modern consumer product." Never a generic SaaS dashboard, an esports template, over-futuristic cyberpunk, or a copy of another Deadlock or Dota site.

### 2. Visual principles
- **Hierarchy:** primary = editorial headlines, key statistics, insights, hero areas, primary actions. Secondary = cards, charts, filters, tabs, supporting metrics, badges. Tertiary = metadata, timestamps, labels (`caption`, `text-eyebrow`, muted text). The most important number on a screen is always the largest.
- **Density:** high information density with strong hierarchy and controlled whitespace. No walls of text, no empty hero bands, no competing focal points.
- **Restraint:** one featured card or glow per screen; orange and pink once or twice per screen.
- **Progressive disclosure:** insight first, "Why?" on demand, tables in tabs or below the fold.

### 3. Color tokens
Palette, semantic roles, chart tokens, gradients and measured contrast: § Color tokens below. Layering: page `bg` → `surface` (cards) → `surface-raised` (hover, elevated) / `surface-sunken` (inputs, charts, footer) → `border` hairlines → restrained cyan. No pure black. Gradients only for hero depth (`--gradient-hero-depth`), image overlays (`--gradient-image-fade`) and a focused data state (`--gradient-focus`).

### 4. Typography
Three voices: editorial display (Barlow Condensed; `.type-slant` italic caps for one brand statement per view), UI headings (Inter, bold, compact), body (system sans). Scale: § Typography below.

### 5. Spacing
4px scale; gutters 16 / 24 / 32px by breakpoint (`--spacing-gutter`); card padding `--spacing-card` (20px); section rhythm `--spacing-section` (48px); content max width 1280px.

### 6. Radius
`xs` 2px (bars, small marks), `sm` 4px (buttons, inputs, tiles), `md` 8px (cards), `lg` 16px (dialogs, sheets), `pill` (filters, badges, tags). Sharp-ish corners keep the editorial feel.

### 7. Borders
1px hairlines everywhere. `border` (#2C405A) decorates; `border-strong` (steel) divides; `border-control` (#64809B, ≥ 3:1) is the only boundary allowed to identify an interactive control. Accents: `primary/40` positive, `orange/40` attention, `primary/50` featured.

### 8. Shadows
Near-flat by design: `--shadow-card`, `--shadow-raised` (hover), `--shadow-overlay` (dialogs), `--shadow-button` (primary depth), `--shadow-glow` (selected or featured, at most one per screen).

### 9. Buttons
`Button` / `ButtonLink`: **primary** bright cyan fill, dark text, bold, 4px radius, subtle depth, optional trailing arrow; **secondary** navy surface with a cyan outline and light text; **ghost** transparent, muted text, surface on hover. Hover changes color only (plus 1px press). ≥ 44px touch targets on coarse pointers.

### 10. Cards
One surface (`Card` / `cardClasses()`): navy, hairline steel border, 8px radius, near-flat shadow. Types are content on that surface: HeroCard, BuildCard, MatchCard, PlayerCard, StatCard, InsightCard, DataCard (analytics panels). A **trend card** is a StatCard with a `TrendBadge` and `Sparkline` footer, not a new style. Interactive cards lift on hover (`elevate`). Pages don't invent card styles.

### 11. Navigation
Primary: Home, Meta, Heroes, Builds, Matches, Analyze. More: Players, Leaderboard, Compare, Draft Lab, Items, Patch, Tools, Community. Global search (Ctrl/⌘+K) and a sign-in placeholder in the header. Condensed caps, cyan underline for the current section, compact height. Phones: header with search and a drawer (section icon + label + chevron rows). Single source: `src/config/navigation.ts`.

### 12. Filters
`Filter` pills (active = solid cyan with dark text), segmented groups for window and rank, native selects for sort, `SearchInput` for text. Labelled groups ("Patch / time", "Rank (match average)"). Progressive disclosure: the common filters show; the rest sit behind a toggle or inside a tab.

### 13. Tables
`Table`: semantic `table` with `th scope`, `aria-sort`, hairline row separators, row hover tint, numeric columns right-aligned with tabular figures, the key metric emphasized, trend and sample indicators inline. Below `sm`, rows become cards (primary columns visible, secondary collapsed). Tables never animate.

### 14. Data visualization
Cyan (`chart-1`) = primary series, orange (`chart-2`) = comparison or trend, pink (`chart-3`) = special, steel (`chart-muted`) = Low sample or inactive. Charts sit on `chart-bg` (sunken navy) with a quiet `chart-grid` and HTML axis labels. Types: lines and sparklines, bars (win-rate bars centered on 50%), comparison bars, the match timeline, radial metric (`RadialMetric`, one share only), matchup maps. Every chart has a text equivalent; color is never the only signal; readability beats decoration.

### 15. Icons
Original line icons in `components/ui/icons.tsx`: 24×24, 1.75 stroke, round caps, geometric and slightly angular, `currentColor` (cyan when active, steel or muted at rest). Section set: Home, Meta, Heroes, Builds, Matches, Analyze, Players, Leaderboard, Compare, Trends, Settings, plus Search, Filter, Menu and arrows. No mixed icon libraries.

### 16. Hero image rules
Game art is a **data identifier**, rendered only by `components/game-assets/`:
- `HeroImage variant="icon"`: square identifier in rows and lists.
- `HeroImage variant="card"`: portrait tile filling a card (directory, Hero Detail header), faded into the card with a gradient overlay (`--gradient-image-fade` is the token for new uses).
- `HeroPortrait size="sm" | "md" | "lg"`: framed square (lineups, match players, compact headers).
- `decorative` when the name is printed beside the image (alt="").
- Original monogram fallback with the same box when assets are off (`NEXT_PUBLIC_GAME_ASSETS=off`), missing, or failing. Pages must look complete without art. Art may scale slightly on hover, nothing else.

### 17. Responsive behavior
Mobile is designed, not shrunk ([MOBILE](./MOBILE.md)): drawer navigation, cards instead of tables below `sm`, secondary information collapsed, key statistics kept, primary actions full width where useful, ≥ 44px touch targets, no horizontal page scroll (verified at 360 / 390 / 768 / 1024 px).

### 18. Accessibility rules
WCAG 2.2 AA: § Accessibility strategy below and [ACCESSIBILITY](./ACCESSIBILITY.md). Zero axe violations is the bar; never color alone; visible focus (`--color-focus`); reduced motion respected.

### 19. IP-safe visual rules
- The brand board is a **design reference**: never shipped, embedded, traced or used as an asset. No reproduction of its layouts, illustrations or compositions; the logo comes only from the owner's master file.
- Branding, UI, charts, icons, illustrations and decoration are original. No Valve or Deadlock logos, official fonts or character art in the brand, favicon or share images; never imply affiliation; unofficial notice on every page.
- Game imagery only identifies game data and stays isolated behind the kill switch. An API asset URL does not grant commercial rights ([ARCHITECTURE § 14](./ARCHITECTURE.md#14-ipasset-isolation-strategy)).

### Remaining inconsistencies (not changed in this pass)
- **Card classes in feature components:** about 50 hand-written `rounded-md border border-border bg-surface…` strings in `features/*` render the same surface but don't use `Card` yet. Migrate when those files are next touched.
- **Type-scale names:** existing components still use the alias names (`display-l`, `display-m`, `title`, `body`). They render identically; rename when touched.
- **Charts:** existing charts (`Sparkline`, timeline, team graph, compare bars) use `stroke-primary` / `stroke-orange` directly rather than the `chart-*` tokens. Same colors today; move to the tokens when touched.
- **Mobile drawer icons:** only the primary sections show icons; the secondary rows (Players, Leaderboard, Compare…) don't yet use the new icons.
- **Ring gauge:** `RadialMetric` is in the system (`/design`) but no page uses it yet. Placing it is page work, outside this pass.
- **Home hero:** the board pairs the headline with large illustrated art; the site uses the original data-city graphic on purpose (no game art as identity).


## 5. Design system architecture

### Where it lives

| Layer | Location |
|---|---|
| Tokens | `src/app/globals.css` — Tailwind v4 `@theme` block (colors, fonts, radii, shadows, durations, easings) |
| Primitives | `src/components/ui/` |
| Data display | `src/components/data/` |
| Cards / motion / layout | `src/components/cards/`, `motion/`, `layout/` |
| Game assets | `src/components/game-assets/` |
| Brand assets | The owner's logo as WebP in `public/brand/` (built by `scripts/brand-assets.mjs`), rendered only by `components/layout/BrandMark.tsx`; favicons `app/icon.png`, `app/apple-icon.png`; the Home "data city" (`features/home/components/HeroBackdrop.tsx`) is original SVG |

Components use semantic tokens (`bg-surface`, `text-muted`), never raw hex values. No inline colors outside `globals.css`.

### Color tokens

Base palette (from CLAUDE.md — do not change without updating CLAUDE.md):

| Token | Hex | Role |
|---|---|---|
| `--color-bg` | `#0B1220` | Page background |
| `--color-surface` | `#1A253F` | Cards, panels, sheets |
| `--color-steel` | `#3B556F` | Dividers, decorative borders, inactive chart marks |
| `--color-primary` | `#4FC2C0` | Interactive, positive, current state |
| `--color-highlight` | `#66FFE8` | Focus ring, key emphasis, restrained glow |
| `--color-orange` | `#F58220` | Warnings, trending/falling (sparingly) |
| `--color-pink` | `#ED438B` | Special states (sparingly) |
| `--color-text` | `#F5F7FA` | Primary text |
| `--color-text-muted` | `#A9B4C5` | Secondary text, labels |

Implemented in `src/app/globals.css` (`@theme`), so each token is also a Tailwind utility (`bg-surface`, `text-primary`, `border-border-control`, …). The `/design` route shows every token and component.

Derived semantic tokens:

| Token | Value | Use |
|---|---|---|
| `--color-positive` | = primary | Win, rising, above average |
| `--color-negative` | `#F2777A` | Loss, below average. Desaturated red so it reads as "negative" without competing with orange/pink. |
| `--color-warning` / `--color-special` | = orange / pink | Semantic aliases |
| `--color-focus` | = highlight | Focus ring |
| `--color-on-primary` | `#0B1220` | Text on primary-filled buttons |
| `--color-surface-raised` | `#22304F` | Hover / elevated card |
| `--color-surface-sunken` | `#111A2E` | Inputs, footer, inset rows |
| `--color-border` | `#2C405A` | Decorative card borders |
| `--color-border-strong` | `#3B556F` (steel) | Decorative dividers |
| `--color-border-control` | `#64809B` | **Interactive boundaries.** 4.55 on bg, 3.70 on surface, 3.18 on surface-raised (meets the 3:1 non-text minimum). |

Chart tokens (utilities `stroke-chart-1`, `bg-chart-bg`, …):

| Token | Value | Use |
|---|---|---|
| `--color-chart-1` | = primary | Primary series |
| `--color-chart-2` | = orange | Comparison or trend series |
| `--color-chart-3` | = pink | Special series (rare) |
| `--color-chart-muted` | = steel | Low sample, inactive marks |
| `--color-chart-bg` | = surface-sunken | Chart panels |
| `--color-chart-grid` | steel at 35% | Grid lines, ring tracks |
| `--color-chart-axis` | = text-muted | Axis and legend text |

Gradients (`:root`, used with `background-image: var(…)`): `--gradient-hero-depth` (radial cyan haze for hero areas), `--gradient-image-fade` (bottom fade over hero art), `--gradient-focus` (top tint for a focused data state).

Other tokens in `globals.css`:
- **Spacing:** Tailwind's 4px scale, plus `--spacing-gutter` (16, 24 or 32px by breakpoint), `--spacing-card`, `--spacing-section`.
- **Radius:** `xs` 2, `sm` 4, `md` 8, `lg` 16, `pill`.
- **Borders:** `--border-hairline` 1px, `--border-thick` 2px, and a 2px focus ring.
- **Shadows:** `card`, `raised`, `overlay`, `button`, `glow`.
- **Breakpoints:** `sm` 640, `md` 768, `lg` 1024, `xl` 1280, `2xl` 1536 px.

Usage rules:
- Cyan is the only "active" color. Orange and pink each appear at most once or twice per screen.
- No neon glow on every component — glow is reserved for the current selection and one hero element per page.
- Positive/negative are never color-only: always pair with an arrow, sign (`+`/`−`), or label.

### Measured contrast (WCAG 2.x)

| Foreground | on `bg` #0B1220 | on `surface` #1A253F | Allowed for |
|---|---|---|---|
| text #F5F7FA | 17.45 | 14.18 | All text |
| text-muted #A9B4C5 | 8.94 | 7.26 | All text |
| primary #4FC2C0 | 8.75 | 7.11 | All text, UI |
| highlight #66FFE8 | 15.19 | 12.34 | All text, focus ring |
| orange #F58220 | 7.22 | 5.87 | All text |
| negative #F2777A | 6.86 | 5.57 | All text |
| pink #ED438B | 5.15 | **4.18** | On `bg`: all text. On `surface`: large text (≥ 24px / 18.66px bold) and non-text UI only. The `special` Badge therefore uses light text on a pink tint. |
| steel #3B556F | **2.42** | **1.97** | Decorative only. Never text, never the only boundary of an interactive control. |
| border-control #64809B | 4.55 | 3.70 | Interactive boundaries (non-text, ≥ 3:1) |
| bg #0B1220 on primary | 8.75 | — | Text on primary-filled buttons |

### Typography

All fonts self-hosted via `next/font`, open-license.

| Role | Font | Use |
|---|---|---|
| Display | **Barlow Condensed** (600–800; 800 italic for `.type-slant`) | Page titles, hero names, big numbers on insight cards |
| UI | **Inter** (400–600) | Navigation, buttons, labels, tables |
| Body | System stack: `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` | Paragraphs, "Why?" text |
| Numeric | Inter with `font-variant-numeric: tabular-nums` (`.tabular`) | All stats and tables |
| Mono | System monospace | IDs (match, account) |

Type scale (rem, mobile → desktop via `clamp`):

| Token | Size | Font | Use |
|---|---|---|---|
| `display-xl` | 2.5 → 4.5 | Display, uppercase, tight tracking | Home / page hero statement |
| `display-lg` | 2 → 3 | Display | Page `h1` |
| `heading-xl` | 1.5 → 2 | Display | Section `h2`, big stat |
| `heading-lg` | 1.25 → 1.5 | UI 700 | Panel and card-group headings |
| `heading-md` | 1.125 → 1.25 | UI 600 | Card titles, `h3`, the value in a ring gauge |
| `body-lg` | 1.125 | Body | Lead paragraphs |
| `body-md` | 1 | Body | Paragraphs, "Why?" text |
| `body-sm` | 0.875 | Body / UI | Dense UI copy, table cells |
| `label` | 0.8125 | UI 500, uppercase, +0.06em tracking | Eyebrows, column headers |
| `caption` | 0.75 | UI | Scope lines, timestamps, sample sizes |

Earlier names stay as aliases of the same values, so existing pages render unchanged: `display-l` = `display-lg`, `display-m` = `heading-xl`, `title` = `heading-md`, `body` = `body-md`. New code uses the names above.

### Space, shape, elevation

- Spacing: Tailwind's 4px scale. Page gutter 16px mobile, 24px tablet, 32px desktop. Max content width 1280px.
- Radius: `--radius-sm` 4px (chips), `--radius-md` 8px (cards), `--radius-lg` 16px (sheets). Editorial look favors sharp-ish corners.
- Elevation: borders + slight surface lightening rather than heavy shadows. `--shadow-card` (near-flat), `--shadow-raised` (hover), `--shadow-overlay` (dialogs), `--shadow-button` (primary button depth: lit top edge + short drop).
- Glow: `--shadow-glow` — selected states and one focal element per page only.
- Texture: an original "tactical grid" pattern (`.bg-tactical-grid` in `globals.css`), used at low opacity in page headers.

### Component inventory (as built)

| Component | Location | Variants / behavior |
|---|---|---|
| `Button`, `ButtonLink`, `IconButton` | `ui/` | primary (teal fill, dark text, subtle depth, optional trailing arrow), secondary (navy fill, teal outline), ghost; sizes; focus-visible, disabled, loading |
| `Card`, `cardClasses()` | `ui/` | the one card surface; `interactive` (hover lift), `accent` = none / primary / warning / featured |
| `Tabs` | `ui/` | keyboard arrows, `aria-selected`, URL-synced |
| `Filter` | `ui/` | pill chips; active = solid teal with dark text |
| `Dialog` | `ui/` | modal and drawer (mobile nav); focus trapped, Esc, focus returned |
| `Tooltip` | `ui/` | hover + focus, Esc; never the only way to get information |
| `Badge`, `Tag` | `ui/` | neutral, primary, positive, negative, warning, special |
| `Table`, `ScrollRegion` | `ui/` | semantic tables; named, focusable horizontal scrollers |
| `Skeleton`, `States` (Empty / Error / Loading) | `ui/` | skeletons match final dimensions; `aria-busy` |
| `SectionHeader`, `SearchInput`, `Avatar`, icons | `ui/` | `01 —— LABEL` + display title; original 24×24 line icons at 1.75 stroke (sections: Home, Meta, Heroes, Builds, Matches, Analyze, Players, Leaderboard, Compare, Trends, Settings) |
| `StatCard`, `DataCard` | `data/` | value, label, scope; tabular numbers |
| `InsightCard` | `data/` | insight sentence, metrics, native `<details>` "Why?" with the rule, context and caveat |
| `ScopeLine` | `data/` | window · rank · sample size on every statistic |
| `ConfidenceBadge` | `data/` | sample tier (dot count + `n =` + tier name; Low is muted) |
| `TrendBadge` | `data/` | rising (cyan ▲), falling (orange ▼), stable (muted —) |
| `TierBadge` | `data/` | S/A/B/C letter |
| `Sparkline` | `data/` | SVG line, draws on reveal, text summary for screen readers |
| `RadialMetric` | `data/` | ring gauge for one share (value as text in the center, optional reference tick, muted for Low sample) |
| `DataNotice`, `Freshness` | `data/DataState.tsx` | classified failure message; data age and **Stale** badge |
| `WinRate` bars | `cards/` + `lib/scale.ts` | centered on 50%, widened so nothing clips; number always shown |
| `HeroCard`, `BuildCard`, `MatchCard`, `PlayerCard` | `cards/` | one entity each |
| `HeroImage`, `HeroPortrait`, `ItemIcon`, `RankBadge` | `game-assets/` | the only game imagery; original fallbacks; `decorative` when the name is printed beside them |
| `Reveal`, `CountUp`, `InView` | `motion/` | see Motion |
| Footer notice | `layout/Footer.tsx` | unofficial-project notice on every page |
| DEMO DATA label | `/design` only | marks fictional data from `src/mocks/` |

### Brand

- **Logo (Implemented, 2026-10-07):** the owner's master logo (`../REFเว็บ/LOGO.png`, outside the repo): a cyan/white "D" mark, the wordmark "DEADLOCK" (white) + "PROHUNGER" (cyan), and the tagline "Deadlock analytics for serious players". Not redrawn or altered beyond cropping.
- `scripts/brand-assets.mjs` builds every web file from the master: it keys out the black background (the master's background is only partly transparent and would show as a dark box on navy), crops the variants, and writes `public/brand/*.webp` plus `app/icon.png` (favicon) and `app/apple-icon.png` (on `--color-bg`). A new master = re-run the script (crop boxes assume 2172×724).
- Variants (`BrandMark variant=`): `primary` (full logo with tagline; brand moments), `horizontal` (mark + wordmark; header and footer; the tagline is left out because it would be about 2px tall at header size), `icon` (the mark). All are `<img alt="Deadlockprohunger">` with fixed width/height and 1x/2x sources.
- `.type-slant` (Barlow Condensed 800 italic) stays the brand-statement type on pages; it echoes the logo's slanted caps but is not the logo.
- No Valve or Deadlock logos, official fonts, or character art in the brand, favicon, or OG images.

---

## Motion — "data awakening"

Animation communicates information (data arriving, values changing, structure assembling). It does not decorate.

### Tokens

| Token | Value | CLAUDE.md range |
|---|---|---|
| `--dur-fast` | 200ms | FAST 150–250ms |
| `--dur-medium` | 380ms | MEDIUM 300–450ms |
| `--dur-slow` | 650ms | SLOW 500–800ms |
| `--dur-cinematic` | 8s (individual uses may set 2–12s) | CINEMATIC 2–12s |
| `--ease-awaken` | `cubic-bezier(0.16, 1, 0.3, 1)` | entrances |
| `--ease-move` | `cubic-bezier(0.65, 0, 0.35, 1)` | moves, morphs |

### Patterns

| Pattern | Spec | Used for |
|---|---|---|
| Logo reveal | scale 0.96 → 1, **no opacity change**, `--dur-slow` | Home hero logo. It is the page's largest paint; a fade would delay LCP until hydration (measured 0.9–1.2 s at 4× CPU vs 0.33–0.48 s) |
| Reveal | opacity 0 → 1, translateY 8px → 0 (sections 20px), `--dur-medium`, `--ease-awaken` | Cards, sections entering view |
| Stagger | 40ms between items, max 12 items | Insight card rows, hero grid |
| Scale-in | scale 0.97 → 1 + fade, `--dur-fast` | Popovers, sheets |
| Graph draw | SVG `stroke-dashoffset`, `--dur-slow` | Sparklines, interval bars |
| Counter | number tween 0 → value, `--dur-slow`, final value rendered in HTML first (no layout shift, no SR noise) | Big stats on insight cards |
| Build assembly | items slot in by group, 60ms stagger | Build detail |
| Hover elevation | translateY −2px + surface-raised, `--dur-fast` | Interactive cards |
| Background drift | very slow (≥ 60s) transform on header texture | Page headers only |
| Timeline playback | `--dur-cinematic` | Match timeline |

### Rules

- Implemented with CSS transitions/keyframes and three components in `components/motion/`: `Reveal` (scroll reveal), `CountUp` (once on entry, reserving the final width so nothing shifts) and `InView` (holds CSS animations inside at frame 0 until scrolled into view). No animation library.
- Only `transform` and `opacity` are animated (plus `stroke-dashoffset` for SVG).
- Never animate tables, table rows, or content that causes layout shift.
- No constant flashing, particles, aggressive parallax, or bouncy easing.
- `@media (prefers-reduced-motion: reduce)`: durations → 0.01ms and **delays → 0**, and loops (drift, live pulse, shimmer, boot scan) turn off entirely; counters show final values. Implemented globally in `globals.css` so components don't need to remember.
- Hero art may scale slightly on hover but is never otherwise animated. Stretched SVG charts (`preserveAspectRatio=none`) fade in instead of drawing.

---

## 12. Accessibility strategy

Target: **WCAG 2.2 AA**.

### Structure

- Semantic landmarks: `header`, `nav` (labeled "Primary" / "Secondary"), `main#content`, `footer`.
- Skip link as the first focusable element: "Skip to content" → `#content`.
- Exactly one `h1` per page; headings never skip levels.
- Lists of heroes, matches, and builds are real `ul`/`ol`; tables are real `table` with `th scope`.

### Interaction

- Everything operable by keyboard; focus order follows visual order.
- Visible focus: 2px `--color-focus` outline with 2px offset on every interactive element (`:focus-visible`).
- Tabs, segmented controls, menus, and sheets follow WAI-ARIA Authoring Practices (arrow keys, Esc, focus trap in modal sheets, focus restore on close).
- Touch targets ≥ 44 × 44px.
- Tooltips open on hover and focus, dismiss on Esc, and their content is also available elsewhere (e.g. in the "Why?" panel).

### Content

- Icon-only buttons have `aria-label`.
- Game-asset images: `alt` = hero/item/rank name; decorative brand imagery has `alt=""`.
- Color is never the only signal (sign, arrow, or text label always accompanies positive/negative).
- Charts and sparklines include a text summary (`<figcaption>` or visually-hidden text), e.g. "Win rate rose from 49.8% to 52.1% over 7 days."
- Sort state via `aria-sort`; live search results announce count via a polite live region.
- Numbers formatted with `Intl.NumberFormat`; percentages always include the `%` sign.

### Verification

- Audit harnesses `scripts/a11y-audit.mjs`, `a11y-contrast.mjs`, `a11y-keyboard.mjs` (axe-core, pixel contrast, keyboard/dialogs); results and open items in [ACCESSIBILITY](./ACCESSIBILITY.md). Target in CI: zero axe violations, all keyboard checks passing.
- Manual keyboard pass and screen-reader spot check (NVDA on Windows) at the end of each phase that adds UI.
- Contrast pairs above are the allowed set; new color pairs must be measured and added to this table.
