/**
 * Original cinematic backdrop for the Home hero. Purely decorative (aria-hidden).
 * Layers, back to front: radial light, a warm dusk horizon, drifting tactical grid, broken
 * reticle rings around a faint copy of the logo's "D" mark, the "data city" skyline, vignette,
 * and a one-time boot-up scan line. No game artwork.
 */
const BARS = [22, 34, 28, 46, 38, 58, 50, 66, 54, 72, 62, 80, 70, 88, 76, 94, 82, 74, 90, 68]

/**
 * "Data city": towers whose heights are a rising bar series, so the skyline reads as a chart.
 * Deterministic (no randomness), so server and client render the same markup.
 */
const W = 1440
const H = 320
const TOWERS = BARS.map((bar, i) => {
  const slot = W / BARS.length
  const width = slot * (0.62 + ((i * 37) % 5) * 0.06)
  const height = H * (0.18 + bar / 125)
  return { x: i * slot + (slot - width) / 2, width, height, spire: i % 4 === 1, notch: i % 3 === 0 }
})
// Far layer: a lower, wider skyline offset by half a slot, for depth.
const FAR = TOWERS.map((t, i) => ({ x: t.x - W / BARS.length / 2, width: t.width * 1.15, height: t.height * (0.55 + ((i * 13) % 4) * 0.08) }))
// Sparse lit windows: a fixed pattern, mostly cyan, a few warm.
const WINDOWS = TOWERS.flatMap((t, i) =>
  [0.28, 0.46, 0.64].flatMap((fy, row) =>
    (i + row) % 3 === 0 ? [{ x: t.x + t.width * (0.25 + (row % 2) * 0.35), y: H - t.height * fy, warm: (i + row) % 7 === 0 }] : [],
  ),
)

export function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Warm dusk horizon low on the right: the one warm note, kept faint */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(70rem 22rem at 72% 100%, color-mix(in srgb, var(--color-orange) 20%, transparent), color-mix(in srgb, var(--color-pink) 11%, transparent) 45%, transparent 75%)',
        }}
      />

      {/* Radial light behind the headline */}
      <div className="absolute inset-0 bg-[radial-gradient(60rem_32rem_at_22%_38%,color-mix(in_srgb,var(--color-primary)_13%,transparent),transparent_65%),radial-gradient(40rem_28rem_at_85%_70%,color-mix(in_srgb,var(--color-steel)_35%,transparent),transparent_70%)]" />

      {/* Drifting tactical grid (subtle background drift) */}
      <div className="bg-tactical-grid absolute -inset-[6%] animate-drift opacity-70 [mask-image:radial-gradient(ellipse_at_40%_45%,black_30%,transparent_75%)]" />

      {/* Reticle + logo mark composition, right side */}
      <svg
        viewBox="0 0 600 600"
        className="absolute top-1/2 right-[-18rem] h-[44rem] w-[44rem] -translate-y-1/2 animate-boot-frame opacity-80 sm:right-[-12rem] lg:right-[-6rem] xl:right-0"
        fill="none"
      >
        <g className="stroke-steel/50">
          <circle cx="300" cy="300" r="270" strokeWidth="1" strokeDasharray="2 10" />
          <path d="M300 60a240 240 0 0 1 236 196M536 344A240 240 0 0 1 300 540M300 540A240 240 0 0 1 64 344M64 256A240 240 0 0 1 300 60" strokeWidth="2" />
          <circle cx="300" cy="300" r="170" strokeWidth="1" />
          <path d="M300 20v60M300 520v60M20 300h60M520 300h60" strokeWidth="1.5" />
        </g>
        {/* One restrained cyan arc: the "current" segment */}
        <path d="M536 344A240 240 0 0 1 432 500" className="stroke-primary/70" strokeWidth="2.5" pathLength={1} data-draw />
        {/* The logo's mark, faint: brand presence behind the data, never competing with the headline. */}
        <image href="/brand/logo-mark-lg.webp" x="150" y="150" width="300" height="300" opacity="0.14" />
      </svg>

      {/* "Data city" skyline along the bottom edge */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMax slice"
        className="absolute inset-x-0 bottom-0 h-48 w-full animate-fade-in sm:h-64 lg:h-80 [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
      >
        <g className="fill-steel/[0.18]">
          {FAR.map((t, i) => (
            <rect key={i} x={t.x} y={H - t.height} width={t.width} height={t.height} />
          ))}
        </g>
        <g className="fill-surface-sunken stroke-steel/40" strokeWidth="1">
          {TOWERS.map((t, i) => (
            <path
              key={i}
              d={
                t.notch
                  ? `M${t.x} ${H}V${H - t.height}h${t.width * 0.35}v${-t.height * 0.06}h${t.width * 0.3}v${t.height * 0.06}H${t.x + t.width}V${H}`
                  : `M${t.x} ${H}V${H - t.height}H${t.x + t.width}V${H}`
              }
            />
          ))}
        </g>
        <g className="stroke-primary/50" strokeWidth="1.5">
          {TOWERS.filter((t) => t.spire).map((t, i) => (
            <path key={i} d={`M${t.x + t.width / 2} ${H - t.height}v-${t.height * 0.16}`} />
          ))}
        </g>
        {WINDOWS.map((w, i) => (
          <rect key={i} x={w.x} y={w.y} width="5" height="7" className={w.warm ? 'fill-orange/45' : 'fill-primary/40'} />
        ))}
      </svg>

      {/* Vignette into the page */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_55%,var(--color-bg))]" />

      {/* Boot-up: a single scan pass on load */}
      <div className="absolute inset-x-0 top-0 h-[10%] animate-boot-scan bg-linear-to-b from-transparent via-primary/10 to-transparent">
        <div className="absolute inset-x-0 bottom-1/2 h-px bg-primary/40" />
      </div>
    </div>
  )
}
