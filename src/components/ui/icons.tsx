import type { SVGProps } from 'react'

/**
 * Original line icons (24×24, 1.75 stroke, currentColor).
 * Decorative by default: pass `aria-label` via the parent control, not the icon.
 */
type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
)

export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
)

export const ArrowUpIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </Icon>
)

export const ArrowDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Icon>
)

export const MinusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const SortIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />
  </Icon>
)

export const FilterIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </Icon>
)

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
)

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.8 19.5h18.4L12 4Z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
)

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </Icon>
)

/** Empty-state glyph: an open targeting reticle */
export const ReticleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="7" />
    <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
  </Icon>
)

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
)

/** Hamburger with a shorter middle bar */
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h10M4 17h16" />
  </Icon>
)

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.2-3.2 3.8-5 7-5s5.8 1.8 7 5" />
  </Icon>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icon>
)

// ── Section icons (navigation). Original drawings in the same 24×24 line style. ──

export const HomeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />
  </Icon>
)

export const HeroesIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.5" />
    <path d="M5 20c.8-4 3.6-6 7-6s6.2 2 7 6" />
  </Icon>
)

/** Item slots: a build is a grid of modules, one still open. */
export const BuildsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM16.5 14v5M14 16.5h5" />
  </Icon>
)

/** Crossed blades: two sides meeting. */
export const MatchesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 4 9.5 9.5M20 4l-9.5 9.5M7 14l3 3M17 14l-3 3M5 19l3-3M19 19l-3-3" />
  </Icon>
)

export const AnalyzeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 19 5-6 4 3 7-9M15 7h5v5" />
  </Icon>
)

/** Meta: the targeting reticle (same drawing as ReticleIcon, named for the section). */
export const MetaIcon = (p: IconProps) => <ReticleIcon {...p} />

/** Two players, the front one complete, the back one cut off: a roster, not a single profile. */
export const PlayersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M15 5.8a3 3 0 0 1 0 5.4M17 14.3c1.8.6 3 2.2 3.5 4.7" />
  </Icon>
)

/** Podium: three ranked steps. */
export const LeaderboardIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 20V8h6v12M3 20v-7h6M15 20v-9h6v9M2 20h20M12 4v1.5" />
  </Icon>
)

/** Side by side: two columns of unequal height with a divider. */
export const CompareIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3v18M4 20V10h5v10M15 20V6h5v14" />
  </Icon>
)

/** A rising line over a baseline, with its last point marked. */
export const TrendsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 20h18M4 16l4.5-4.5 3.5 3 6-7" />
    <circle cx="19" cy="6.5" r="1.5" />
  </Icon>
)

/** Settings: an angular hex nut around a dial (original, no gear teeth). */
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4z" />
    <circle cx="12" cy="12" r="3" />
  </Icon>
)
