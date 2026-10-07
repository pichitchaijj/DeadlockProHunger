# Deadlockprohunger — Performance

Full audit, 2026-10-07. Rule followed: **measure first, change only what the numbers justify.** Every fix below has a before/after number; everything left unchanged says why.

Related: [ARCHITECTURE](./ARCHITECTURE.md) · [API](./API.md) · [DESIGN](./DESIGN.md) (motion) · [MOBILE](./MOBILE.md)

---

## 1. Summary

| Area | Finding | Action | Result |
|---|---|---|---|
| Hydration | `/matches` threw React #418 (text mismatch): relative times ("5 min ago") were computed with each side's own clock | Server passes one `now` to the client | 0 hydration errors |
| Wasted requests | Every page prefetched 5 routes that don't exist (`/analyze`, Items, Patch, Tools, Community); each prefetch rendered the 404 page on the server | `built` flag in `config/navigation.ts`; unbuilt links use `prefetch={false}`; a test ties the flag to `src/app` | 10–11 failed requests per page → **0** |
| DOM size | `/matches`: closed "Players" panels in the mobile cards held 24 portraits + ~100 nodes each, on every viewport | Team tables render when the panel opens | 9,309 → **5,387** nodes; HTML 55 → **40 KB** gz; 1,500 → 1,020 `<img>` |
| Images | Hero icons were 128×128 **PNG** (~19 KB avg) shown at 24–40 px; the API also publishes WebP | `heroIconUrl()` picks `icon_image_small_webp` | All 39 icons: 751 → **360 KB** (−53%) |
| Fonts | Adding the italic display face created an italic file for every weight (600/700/800), only 800 is used | Separate `Barlow_Condensed` instance: 800 italic only | 7 → **5** preloaded files, 141 → **109 KB** |
| Animation | `live-pulse` (infinite) and `trend-pulse` animated `box-shadow`; skeleton `shimmer` (infinite) animated `background-position`: a repaint every frame | All three run on `::after` and animate `transform`/`opacity` only | No looping paint-property animations left |
| Measurability | No way to count upstream calls per page | `DEADLOCK_API_TRACE=1` logs every call (path, status, ms) | Used for § 6 |

Unchanged after measuring (details in each section): client JS composition, re-render patterns, table virtualization, CLS, LCP, route rendering modes, caching.

---

## 2. Method

- **Build:** production (`npm run build` + `next start`), Next 16.3 / Turbopack, local machine.
- **Browser:** system Chrome via `playwright-core`; harness in [`scripts/perf-audit.mjs`](../scripts/perf-audit.mjs) (usage in its header).
- **Per route, three loads:** desktop 1440×900 with a **cold** data cache (`.next/cache/fetch-cache` deleted before the run), desktop warm, and mobile 390×844 (DPR 3, touch, **4× CPU slowdown**).
- **Metrics:** JS/CSS/font bytes (resource timing; transfer = gzip, decoded = parsed), HTML size, DOM nodes, `<img>` count, CLS and LCP (PerformanceObserver; LCP read **before** scrolling), long tasks over 50 ms (TBT-like), console and page errors, first byte, and upstream API calls from the server trace (a call over 50 ms = a real network request; faster = Next data-cache hit).
- **Not visible to resource timing:** cross-origin image bytes (the asset CDN sends no `Timing-Allow-Origin`), so image weight was measured with direct downloads.
- **Noise:** mobile TBT varies by roughly ±100 ms between identical runs (e.g. `/heroes` 116 / 275 / 70 ms). Treat single TBT values as indicative; the DOM, byte, error and request counts are exact.
- Harness pitfall found on the way: reading LCP after a scripted scroll reported 3.7 s on Home (a below-the-fold element). The real Home LCP is **424 ms** at 4× CPU (144 ms unthrottled): the wordmark, then the headline as it fades in.

## 3. Results (before → after)

JS = gzip KB transferred (warm). "Upstream calls" = calls on the first, cold visit, with real network requests in brackets.

| Route | JS gz (KB) | HTML gz (KB) | DOM nodes | Mobile LCP (ms) | Mobile TBT (ms) | CLS (mobile) | Console errors | Upstream calls cold (network) | First byte cold → warm (ms) |
|---|---|---|---|---|---|---|---|---|---|
| `/` | 146.2 | 30.9 → 30.1 | 1,453 → 1,451 | 424 | 442 → 282 | 0.0023 | 10 → 0 | 0 (0) | 22 → 5 |
| `/meta` | 150.9 | 54.4 → 54.5 | 4,159 → 4,157 | 360 | 122 → 73 | 0.0044 | 10 → 0 | 5 (4) | 241 → 63 |
| `/heroes` | 152.8 | 20.2 → 20.2 | 2,073 → 2,071 | 424 | 116 → 70 | 0 | 10 → 0 | 6 (0) | 40 → 25 |
| `/heroes/haze` | 148 | 25.4 → 25.2 | 1,170 → 1,168 | 520 | 233 → 252 | 0.0018 | 10 → 0 | 22 (14) | 55 → 51 |
| `/heroes/haze?tab=builds` | 148 | 32 → 31.7 | 1,717 → 1,715 | 476 | 473 → 347 | 0.0026 | 10 → 0 | 24 (0) | 55 → 53 |
| `/heroes/haze?tab=trends` | 148 | 26.1 → 25.8 | 1,158 → 1,156 | 464 | 224 → 202 | 0.0017 | 10 → 0 | 26 (0) | 54 → 49 |
| `/builds` | 147.3 | 24.2 → 24 | 1,464 → 1,462 | 368 | 290 → 257 | 0 | 10 → 0 | 94 (43) | 30 → 52 |
| `/matches` | 150.1 | **55.1 → 40.2** | **9,309 → 5,387** | 300 | 423 → 256 | 0 | **11 → 0** | 9 (2) | 340 → 51 |
| `/leaderboard` | 147.3 | 24 → 23.9 | 1,777 → 1,775 | 400 | 320 → 299 | 0 | 10 → 0 | 6 (2) | 15 → 23 |
| `/players` | 146.2 | 12.3 → 12.2 | 451 → 449 | 220 | 259 → 116 | 0 | 10 → 0 | 3 (0) | 11 → 12 |
| `/compare` | 147.1 | 13.2 → 13.2 | 543 → 541 | 208 | 210 → 136 | 0 | 10 → 0 | 3 (0) | 17 → 16 |
| `/draft?…` | 147.3 | 21.5 → 21.5 | 939 → 937 | 304 | 101 → 199 | 0 | 10 → 0 | 6 (2) | 364 → 18 |

"First byte" is the start of the streamed response; Suspense sections keep streaming after it.

---

## 4. Findings by area

### Bundle size and client JS

Every page loads ~146–153 KB gzip (~480–500 KB parsed). Composition on Home:

| Chunk | gzip | Content |
|---|---|---|
| React DOM + runtime | 69 KB | framework |
| Next router/runtime | 44 KB | framework |
| App layout | 11 KB | header, nav, command palette, `HeroImage`, motion helpers |
| Smaller app/runtime chunks | ~22 KB | |
| Polyfills (38 KB) | 0 | `nomodule`: modern browsers don't download it |

About 113 KB is framework and fixed. Our code is ~25–35 KB per page. Page-specific client components (`MatchesExplorer`, `MatchTimeline`, `HeroDirectory`, `WhyPanel`) load only on their own routes.

- **Command palette (lazy-load candidate):** its source is ~12 KB, roughly 3–4 KB gzip. Lazy loading it would delay the first Ctrl/⌘+K by a request to save ~2% of JS. **Not done:** the gain is below the measurement noise.
- **Guardrail:** a new client component must justify itself. Interactivity only, never data formatting. Server components cost nothing here.

### Unnecessary re-renders

- `CountUp` sets state every animation frame (~48 renders over 800 ms). There are ≤ 6 per page and each renders one text node, which is negligible. **Not changed.** If it is ever used in a list, write `textContent` through a ref instead.
- `Reveal` uses one IntersectionObserver per item (≤ ~40 per page), and `InView` one per group. Both disconnect after firing. Acceptable.
- No `setInterval`, scroll or resize listeners anywhere in `src`.
- `MatchesExplorer` re-renders only on selection (click or arrow key); the new `PlayersDetails` re-renders only its own card.

### Hydration

- **Fixed:** `/matches` React #418. Relative times were formatted with `Date.now()` on the server and again at hydration; a minute boundary between the two changed the text, most often under CPU slowdown. The loader now returns `now`, and `MatchesExplorer` formats with it.
- **Rule:** client components never read the clock, locale or timezone during render. Take `now` from the server, and give date formatters an explicit `timeZone`.
- `HeroImage` re-checks images that failed before hydration (`complete && naturalWidth === 0`) in an effect, so there's no mismatch.

### Image loading

- Hero art comes straight from the API's CDN (`assets-bucket.deadlock-api.com`), isolated in `components/game-assets/`. Every `<img>` has `width`/`height` (no CLS), `loading="lazy"` and `decoding="async"`.
- **Fixed:** small icons now use WebP: 360 KB instead of 751 KB for the full set of 39. Cards already used WebP (e.g. 48 KB vs 103 KB PNG for one hero).
- **Still large:** icons are 128×128 for 24–40 px slots (64 px would do at 2× DPR), and the CDN sends no `Cache-Control` (ETag only, so revalidation requests). Resizing would mean serving transformed copies through `next/image` or our own CDN, i.e. re-hosting game assets. That conflicts with the asset rule "don't redistribute extracted game files" and is **a product/IP decision, not a performance one**: see § 7.
- `HeroImage` is a client component (it swaps to the original fallback on load errors). `/matches` still renders ~1,000 instances, 480 of them in the desktop table's team strips. A server-rendered `<img>` plus one shared error listener would remove those hydrations; see § 7.

### API requests and caching

- All upstream calls go through `lib/deadlock/client.ts` with the Next data cache. TTLs (`lib/cache/ttl.ts`): assets 24 h, analytics 6 h (upstream's own cache), distribution 24 h, patches 1 h, builds 1 h, bulk matches 10 min. Identical requests within one render are memoized.
- Warm visits made **0 network requests** on every route in the audit. Cold visits: § 3.
- 610 traced calls across the run: **0 rate-limit responses, 0 retries.**
- **`/builds` makes one `hero-build-stats/{hero_id}` call per hero (39) per window × rank scope.** The spec has no all-heroes form. On a cold cache that's 39 parallel analytics calls (about 20% of the 200/min analytics budget). The slowest took ~840 ms; the page streams, so first byte stays ~30 ms. Acceptable at current traffic; § 7 lists the mitigation.
- Hero Detail: 22–26 calls per tab. Most are matrix endpoints shared by every hero (counters, synergies, by-badge, by-duration, by-day) and are cache hits after the first hero.
- Static vs dynamic: `/` is prerendered with 5-minute ISR. Every other page reads `searchParams` (scope filters), so it renders on demand from cached data. Warm first byte is 5–70 ms, so making more routes static would gain little.

### Data duplication

- **RSC payload:** App Router sends the rendered tree twice, as HTML and as the RSC payload. On `/meta` that's 377 KB markup + 496 KB payload raw. Gzip brings the whole page to 54 KB, but the browser still parses it. The payload is mostly the server tree itself (2,932 `className` entries), not oversized client props. It can only shrink by rendering less markup.
- **Responsive double rendering:** pages render the desktop table and the mobile card list, and CSS hides one. That's the right trade-off for server rendering (no user-agent sniffing, no layout shift). The cost showed on `/matches`, where the card list held hidden detail; fixed by rendering it when opened. `/meta`'s hidden list is ~1,500 nodes: acceptable.
- **Server-side:** shared matrix responses are fetched once and reused across heroes; heavy single-match metadata is cached as a zod projection (`unstable_cache`), never the 2 MB raw response.

### Table rendering

- Largest tables per page: Meta 39 rows, Matches 40, Leaderboard and Players 50, with pagination beyond. Rows are plain server-rendered HTML; only `MatchesExplorer` is interactive.
- **Virtualization: not needed.** It pays off from hundreds of rows. Revisit if a page ever renders > 200 rows at once.
- Tables don't animate (CLAUDE.md). Row hover changes color only.

### Animation performance

Rule: animate `transform` and `opacity` (plus SVG stroke drawing, CLAUDE.md).

| Animation | Property | Status |
|---|---|---|
| awaken, scale-in, slide-in, boot-frame, fade-in, drift | transform / opacity | ✓ |
| grow, grow-y (bars) | `scaleX` / `scaleY` | ✓ |
| draw (lines, sparklines, glyph) | `stroke-dashoffset` | ✓ (allowed) |
| boot-scan | transform / opacity | ✓ |
| live-pulse (infinite), trend-pulse | was `box-shadow` | **fixed**: `::after` ring, `transform: scale` + `opacity` |
| shimmer (infinite, skeletons) | was `background-position` | **fixed**: `::after` band, `translateX` |
| Hover/focus transitions on color, border, `box-shadow` (buttons, chips, `.elevate`) | paint only, user-triggered, 200 ms, one element at a time | kept: no layout, not continuous |

- No layout properties (`width`, `height`, `top`, `left`, margins) are animated anywhere.
- Reduced motion zeroes durations and delays and turns every loop off, including the new `::after` animations.
- Below-the-fold charts hold at frame 0 inside `InView` until visible, so nothing animates off-screen.

### Font loading

- `next/font` self-hosts and preloads the fonts: Inter (variable, 48 KB) and Barlow Condensed 600/700/800 (15 KB each), all `display: swap`.
- **Fixed:** the italic face (only `.type-slant`, weight 800) is now its own instance, one 16 KB file instead of three.
- Every Barlow weight is in use (semibold in 9 files, bold in 32, extrabold in 7). `next/font` adds size-adjusted fallback faces, and CLS stays ≤ 0.0044 with fonts swapping in.

### Layout shift

CLS ≤ 0.0044 on every route, mobile and desktop, while scrolling through the full page. Mechanisms:
- reserved sizes: image `width`/`height`, skeletons sized like the final layout, `CountUp` reserving its final width;
- reveals that use `transform`, never layout;
- Suspense fallbacks with the same dimensions as the content.

No action needed.

---

## 5. Changes made

| File | Change |
|---|---|
| `src/features/matches/loaders.ts`, `components/MatchesExplorer.tsx`, `app/matches/page.tsx` | `now` from the server; `PlayersDetails` renders team tables when opened |
| `src/config/navigation.ts` + header/footer links | `built` flag; `prefetch={false}` for unbuilt sections |
| `tests/unit/navigation.test.ts` | `built` must match `src/app/<route>/page.tsx` |
| `src/lib/deadlock/heroImages.ts` + 11 loaders/jobs | `heroIconUrl()` / `heroCardUrl()`: WebP first |
| `src/lib/deadlock/endpoints.ts` | schema field `icon_image_small_webp` (`api:verify` passes) |
| `src/app/layout.tsx`, `globals.css` | italic display face 800 only (`--font-display-slant`) |
| `src/app/globals.css`, `components/ui/Skeleton.tsx` | pulse rings and shimmer on `::after` with transform/opacity |
| `src/lib/deadlock/client.ts` | `DEADLOCK_API_TRACE=1` call log |
| `scripts/perf-audit.mjs` | the measurement harness |

## 6. How to re-run

```bash
npm i --no-save playwright-core
npm run build
rm -rf .next/cache/fetch-cache                        # cold data cache (local only)
DEADLOCK_API_TRACE=1 npx next start -p 3123 > server.log
CHROME_PATH="<path to chrome>" node scripts/perf-audit.mjs server.log audit.json / /meta /heroes /heroes/haze /builds /matches /leaderboard
```

Compare against § 3. Investigate if a route moves past these budgets:

| Budget | Value |
|---|---|
| Client JS (gzip, per route) | ≤ 170 KB |
| HTML (gzip) | ≤ 60 KB |
| DOM nodes | ≤ 6,000 (aim ≤ 2,000 outside list pages) |
| Mobile LCP (4× CPU, local) | ≤ 1,000 ms |
| CLS | ≤ 0.01 |
| Console/page errors | 0 |
| Warm visit network calls upstream | 0 |

## 7. Open items (need a decision or a larger change)

1. **Resized hero images (largest remaining payload).** 64 px WebP icons would be ~2–3 KB instead of ~9 KB. That requires serving transformed copies (`next/image` remote optimization or our own CDN), i.e. re-hosting game assets. **Product/IP decision**; until then the WebP originals are hot-linked.
2. **`HeroImage` hydration.** ~1,000 client instances on `/matches` (~40 elsewhere). Option: server-rendered `<img>` plus one client listener in the layout that swaps failed images to the fallback. Worth it if `/matches` mobile TBT stays above ~250 ms in repeated runs.
3. **`/builds` fan-out.** 39 calls per scope on a cold cache. Now bounded by the analytics token bucket (burst 40, 160/min): a cold `/builds` alongside other cold pages can drain it, and the overflow shows as "rate limited" sections. Next option: have the daily job warm the default scopes.
4. **Token buckets: done** (`client.ts` + `lib/deadlock/budget.ts`). Only cache misses spend budget. Measured on `/analyze?hero=haze`: cold 19 network requests; warm 0 requests, 18 cache hits, ~33 ms (was ~178 ms, since hits no longer re-parse JSON). With `DEADLOCK_API_TRACE=1`, network calls log status + ms, cache hits log `hit`, and budget waits log `budget:<class>`.
