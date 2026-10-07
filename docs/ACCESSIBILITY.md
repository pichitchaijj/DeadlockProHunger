# Deadlockprohunger — Accessibility

Full audit, 2026-10-07. Target: **WCAG 2.2 AA** (strategy and rules: [DESIGN § 12](./DESIGN.md#12-accessibility-strategy)). Everything below was measured on the production build; each fix has a before/after result.

Related: [DESIGN](./DESIGN.md) · [MOBILE](./MOBILE.md) · [PERFORMANCE](./PERFORMANCE.md)

---

## 1. Summary

| Check | Before | After |
|---|---|---|
| axe-core violations (16 routes × desktop + mobile, WCAG 2.0–2.2 A/AA + best practice) | 1 serious rule on 3 pages, 1 minor rule on 4 pages | **0** |
| Text contrast over gradients/images (pixel-measured, 260 text nodes) | 7 real failures (hero cards on phones, missing-art monogram) | **0** (lowest 5.46:1) |
| Keyboard and dialog checks | Timeline: every event a Tab stop | **40 / 40** pass |
| Touch targets under 44 × 44 px (phones, real targets) | 9–91 per page | **0**, except timeline markers (§ 13, equivalent control) |
| Color as the only signal | 3 places | **0** found |
| One `h1` per page / skipped heading levels | ✓ / 0 | ✓ / 0 |
| Charts without a text alternative | 0 | 0 |
| Animation loops still running under reduced motion | 0 | 0 |

## 2. Method

Three harnesses in `scripts/` (usage in each file's header) drive system Chrome via `playwright-core` against `next start`:

| Script | What it checks |
|---|---|
| [`a11y-audit.mjs`](../scripts/a11y-audit.mjs) | axe-core 4 (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`) after scrolling the whole page (reveals start hidden); headings, landmarks, tables, chart alternatives, touch targets (mobile 390 × 844, touch, `pointer: coarse`), looping animations under `prefers-reduced-motion` |
| [`a11y-contrast.mjs`](../scripts/a11y-contrast.mjs) | Every text node axe marks "incomplete" for contrast (gradient or image behind it): the text is made transparent, its box screenshotted, and the 90th-percentile background luminance compared with the text color (SVG text by `fill`). Thresholds 4.5:1, or 3:1 for large text |
| [`a11y-keyboard.mjs`](../scripts/a11y-keyboard.mjs) | Tab walks with a visible focus check on each stop; skip link; command palette (shortcut and button), mobile drawer and More menu (focus in, never reaching the page behind, Esc, focus return); matches list arrows; timeline roving focus; tabs |

**Routes:** `/`, `/meta`, `/heroes`, `/heroes/[hero]` (overview, matchups, trends), `/builds`, `/builds/[hero]/[id]`, `/matches`, `/matches/[id]`, `/players`, `/players/[id]`, `/leaderboard`, `/compare`, `/draft`, and a 404.

**Harness lessons** (recorded so they aren't re-learned):
- SVG text is painted with `fill`, not `color`. Hiding only `color` left chart labels in the "background" and produced 26 false contrast failures.
- Stretched links (`after:absolute after:inset-0`) are as large as their card. The touch-target check measures the positioned ancestor for them.
- With a native `<dialog>` opened by `showModal()`, Tab can leave the page for the browser's own UI. That's allowed. The check fails only if focus reaches a page element behind the dialog.
- One run reported 6 header-less tables on `/heroes/haze`. Re-runs (with and without axe, scrolled, reduced motion) show the single, correct table. Not reproducible.

**Not covered by automation:** a manual screen-reader pass (NVDA on Windows, VoiceOver on iOS). § 15 lists it as the next step.

---

## 3. Semantic HTML

- Landmarks on every page: `header`, `nav` (labelled: Primary, Mobile, Footer, per-filter navs), one `main#content`, `footer`. `<html lang="en">`.
- Lists are `ul`/`ol` (heroes, matches, builds, nav); data is in `table`s; disclosures are `<details>/<summary>` (work without JavaScript).
- Buttons act, links navigate (`Button` vs `ButtonLink`). Icon-only controls require a `label` (`IconButton` makes it a required prop).

## 4. Heading hierarchy

Every route: exactly **one `h1`**, **no skipped levels** (h1 → h2 → h3 only), across 16 routes × 2 viewports. Card titles are `h3` under their section's `h2`. Eyebrow labels are styled text, not headings.

## 5. Keyboard navigation

| Behavior | Result |
|---|---|
| First Tab = "Skip to content"; Enter moves focus to `main#content` | ✓ desktop and mobile |
| Tab order follows visual order; no focus on invisible elements (7 walks, 25–60 stops each) | ✓ |
| Matches list: ↑/↓ move focus and selection | ✓ |
| Tabs (`role=tablist`): ←/→ move between tabs | ✓ |
| More menu: Enter opens (`aria-expanded`), ↓ enters the items, Esc closes and returns focus | ✓ |
| **Fixed:** match timeline. Each event marker was its own Tab stop (dozens per match) | The chart is **one** Tab stop (the selected event, else the first); ←/→/Home/End move in time order; Enter/Space selects |
| **Fixed:** horizontally scrolling regions with nothing focusable inside (ability-order grid, build ability plan, item timing table, souls-per-player table, live-matches strip) couldn't be scrolled by keyboard (axe `scrollable-region-focusable`, serious) | New primitive `components/ui/ScrollRegion`: `role="region"`, a name, `tabIndex=0`, visible focus |

## 6. Focus states

- `:focus-visible` gives every focusable element a 2 px `--color-focus` (#66FFE8) outline with a 2 px offset. Checked on every Tab stop of 7 walks: **all visible**.
- The timeline marker's focus ring is drawn on the SVG shape (`stroke-highlight`). `ScrollRegion` uses the global outline.
- The skip link becomes visible on focus at 44 px tall (**fixed**; it was 36 px).

## 7. Color contrast

Measured pairs (WCAG 2.x; the full token table lives in [DESIGN](./DESIGN.md#measured-contrast-wcag-2x)):

| Pair | Ratio | Need |
|---|---|---|
| Text #F5F7FA on bg / surface | 17.45 / 14.18 : 1 | 4.5 |
| Muted text #A9B4C5 on surface / surface-raised | 7.26 / 6.25 : 1 | 4.5 |
| Dark text on cyan (primary button, active chip) | 8.75 : 1 | 4.5 |
| Dark text at 75% on cyan (counts inside active chips) | 5.35 : 1 | 4.5 |
| Orange #F58220 on bg / surface | 7.22 / 5.87 : 1 | 4.5 |
| Secondary button border (cyan 70% on surface) | 4.23 : 1 | 3 (non-text) |

Text over gradients and art, measured per element (§ 2):
- **Fixed:** hero-directory cards on phones. Name and role over bright art measured 3.75–4.38:1. The legibility gradient now has a solid lower band (`from-bg from-15% via-bg/75 via-40%`). Worst case is now ≥ 5.46:1.
- **Fixed:** the original fallback monogram (shown when a hero image is missing) used muted text on the grid texture, 4.33:1. It's now primary text.
- Chart axis and row labels: all pass once measured by `fill`.

## 8. Accessible labels

- **Fixed (`image-redundant-alt`):** icons next to their own printed name were announced twice ("Fixation Fixation"). `HeroImage` / `HeroPortrait` / `ItemIcon` / `AbilityIcon` take `decorative`, which renders `alt=""` (or an `aria-hidden` fallback). Applied to:
  - ability rows, item timing rows, item transitions
  - draft picker tiles (they have an `sr-only` name), draft recommendations, and the remove-hero link (named by `aria-label`)

  Standalone icons keep the name as `alt`.
- **Rule:** if the name is printed in the same row/control, `decorative`; if the image is the only identifier, the name is the `alt`. About 30 other call sites (name in an adjacent cell or link, which this axe rule doesn't flag) should get the same treatment as they're touched.
- Form controls have visible labels; selects carry `<label>`; the timeline slider has `aria-valuetext`.

## 9. Screen-reader behavior

- Live regions (`role=status`, polite) announce: hero-directory result counts, command-palette search status, the timeline scrubber state, and loading states (`aria-busy`). Errors use `role=alert`.
- **Fixed:** the matches preview panel was itself `aria-live`, so every arrow-key move read the whole preview (both team tables). Now a one-line status is announced ("Previewing match 112020510: Team 1 won, 32:14"), and the panel is no longer live.
- Visually hidden text completes meaning where the visual is compact: team strips ("Team 1, won:"), ability-order captions (the full sequence), sort state (`aria-sort`).
- **Fixed:** when a player's rank never changed, the rank chart rendered two identical stacked labels (duplicate React key). Now one.

## 10. Dialog accessibility

| Dialog | Labelled modal | Focus moves in | Tab never reaches the page | Esc closes | Focus returns |
|---|---|---|---|---|---|
| Command palette (Ctrl/⌘+K) | ✓ | ✓ | ✓ | ✓ | (opened by shortcut) |
| Command palette (Search button) | ✓ | ✓ | ✓ | ✓ | ✓ to the button |
| Mobile menu drawer | ✓ | ✓ | ✓ | ✓ | ✓ to the menu button |
| More menu (disclosure, not modal) | `aria-expanded` | ↓ enters | n/a | ✓ | ✓ |

Native `<dialog>` with `showModal()` makes the page behind inert, which is why focus can't reach it.

## 11. Table semantics

- Every data table has `th` with `scope` and a name: a visible `caption` (scoreboards) or an `sr-only` caption. **Fixed:** three tables had headers but no name. Trend "Show data", the team-graph "Show values" and souls-per-player now have captions.
- Grid-like tables (ability order, ability plan) use row headers (`th scope="row"`) plus a caption that spells out the full sequence.
- Sortable tables expose `aria-sort`. On phones, wide tables become cards (`docs/MOBILE.md`); the card lists keep the same information as text.

## 12. Chart alternatives

Every chart has a text alternative, and none relies on hover:

| Chart | Alternative |
|---|---|
| Sparklines (Home, Meta) | `role="img"` + `aria-label` summary sentence |
| Trend charts (Hero → Trends) | `figcaption` summary + "Show data" table |
| Team graphs (match souls/kills) | `role="img"` + summary `aria-label` + "Show values" table |
| Match timeline | named group; every marker is a labelled button; the full **events list** below is the equivalent text view |
| Rank history (player) | `role="img"` summary + `figcaption` |
| Draft relation map | `aria-hidden`; every drawn relationship is listed as text right below it (pair, win rate vs expected, side it favors, sample) |

## 13. Touch target sizes

Rule: ≥ 44 × 44 px on coarse pointers (stricter than WCAG 2.5.8's 24 px).

**Fixed:**
- **Height raised to 44 px on touch:** Meta tier and trend rows (were 34 px) and Meta mobile-card hero links (41 px).
- **Width raised to 44 px:** footer links (were 32–43 px wide), "Why?" toggles (38 px), draft hero-picker tiles (34 × 39 px) and match-detail hero-name links (16–39 px wide).
- **More padding:** the "How builds are labeled", "Show data", "Show values" and draft pairing toggles (were 37–41 px tall).
- **Skip link:** 44 px tall when it appears.

**Accepted:** match-timeline event markers (4–10 px SVG shapes, 19 on the audited match). WCAG 2.5.8's *equivalent* exception applies: every event is also a full-size row in the events list below the chart, with the same select action. Keyboard users reach them as one Tab stop (§ 5).

## 14. Reduced motion and color

- `prefers-reduced-motion: reduce` zeroes animation and transition durations and delays, and stops every loop (drift, live pulse, shimmer, boot scan, including the `::after` rings). Measured: **0** running infinite animations on all routes. Reveals render in place.
- **Not color alone. Fixed:**
  - **Build item timing:** an item above the hero's baseline was marked only by cyan. It now shows "▲" and screen-reader text ("above the hero's average").
  - **Draft relation map:** "favors your team" vs "favors the enemy" differed only by line color. Enemy-favoring lines are now dashed, with a dashed legend swatch labelled "(dashed)".
  - **Draft relationship list:** the same distinction was only text color (cyan vs orange). Each row now says "Favors your team" or "Favors the enemy".
- **Already paired with text or shape:** trend badges (arrow + "Rising/Falling" + pp), win/loss ("Win"/"Loss", "won/lost", W/L + `sr-only`), sample tiers (dot count + "n=" + tier name), tiers (letter), win-rate bars (centered on 50% + the number), team charts ("Team 1 above, Team 2 below"), patch markers (labelled "Patch").

## 15. Open items

1. **Manual screen-reader pass** with NVDA (Windows) and VoiceOver (iOS) on Home, Hero Detail, Matches and the command palette. Automation can't judge reading order or verbosity end to end.
2. **Redundant alt, remaining ~30 call sites** (§ 8): apply `decorative` where the name is printed in the same row.
3. **CI:** run `scripts/a11y-audit.mjs` and `a11y-keyboard.mjs` against a preview deployment and fail on any axe violation or failed keyboard check. DESIGN § 12 calls for this; it's not wired yet.
