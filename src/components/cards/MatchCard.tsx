import Link from 'next/link'
import { cx } from '@/lib/cx'
import { cardClasses } from '@/components/ui/Card'
import { formatDuration, formatRelativeTime } from '@/lib/format'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'

type TeamSummary = {
  /** Neutral team label, e.g. "Team 1". */
  label: string
  won: boolean
  heroes: Array<{ name: string; imageSrc?: string }>
}

export type MatchCardProps = {
  matchId: number
  href: string
  /** Unix ms. */
  startedAt: number
  durationS: number
  /** Average rank label, e.g. "Oracle IV"; omit for unranked modes. */
  averageRank?: string
  teams: [TeamSummary, TeamSummary]
  /** Player perspective (match history): their result and line. */
  perspective?: { won: boolean; heroName: string; kda: string }
  className?: string
}

export function MatchCard({
  matchId,
  href,
  startedAt,
  durationS,
  averageRank,
  teams,
  perspective,
  className,
}: MatchCardProps) {
  return (
    <article
      className={cx(
        cardClasses({ interactive: true }),
        'relative flex flex-col gap-3 p-(--spacing-card)',
        perspective ? (perspective.won ? 'border-l-4 border-l-positive' : 'border-l-4 border-l-negative') : '',
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-ui text-sm font-semibold text-text">
          <Link href={href} className="after:absolute after:inset-0 after:rounded-md hover:text-highlight">
            Match {matchId}
          </Link>
        </h3>
        <p className="text-caption text-text-muted tabular">
          {formatRelativeTime(startedAt)} · {formatDuration(durationS)}
          {averageRank && <> · Avg {averageRank}</>}
        </p>
      </header>

      {perspective && (
        <p className="font-ui text-sm">
          <span className={cx('font-semibold', perspective.won ? 'text-positive' : 'text-negative')}>
            {perspective.won ? 'Win' : 'Loss'}
          </span>
          <span className="text-text-muted">
            {' '}· {perspective.heroName} · <span className="tabular">{perspective.kda}</span>
          </span>
        </p>
      )}

      <div className="grid gap-2">
        {teams.map((team) => (
          <div key={team.label} className="flex items-center gap-3">
            <span className="w-16 shrink-0 text-caption">
              <span className="block text-text-muted">{team.label}</span>
              <span className={cx('font-semibold', team.won ? 'text-positive' : 'text-text-muted')}>
                {team.won ? 'Won' : 'Lost'}
              </span>
            </span>
            <ul className="flex flex-wrap gap-1" aria-label={`${team.label} heroes`}>
              {team.heroes.map((hero) => (
                <li key={hero.name}>
                  <HeroPortrait name={hero.name} src={hero.imageSrc} size="sm" />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </article>
  )
}
