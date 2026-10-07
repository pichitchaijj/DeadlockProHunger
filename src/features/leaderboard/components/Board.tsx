import Link from 'next/link'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Reveal } from '@/components/motion/Reveal'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent, formatRelativeTime } from '@/lib/format'
import { SCOREBOARD_METRICS, type ScoreboardMetric } from '@/lib/deadlock/constants'
import type { BoardRow, RankChange } from '../model'

type Mode = { kind: 'regional' } | { kind: 'global' } | { kind: 'performance'; metric: ScoreboardMetric }

export function formatMetric(value: number, metric: ScoreboardMetric): string {
  const f = SCOREBOARD_METRICS[metric].format
  return f === 'percent' ? formatPercent(value) : f === 'decimal' ? value.toFixed(1) : formatInteger(Math.round(value))
}


/** Measured rank movement from the latest ranked match. Static: no animation. */
export function ChangeBadge({ change }: { change: RankChange | null }) {
  if (!change || change.delta === 0) return <span className="text-caption text-text-muted">—</span>
  const up = change.delta > 0
  return (
    <span
      title={`Latest ranked match ${formatRelativeTime(change.at)}: ${up ? '+' : '−'}${formatInteger(Math.abs(change.delta))} rank progress${change.badgeMove ? (change.badgeMove === 'up' ? ', promoted' : ', demoted') : ''}`}
      className={cx('inline-flex items-center gap-1 rounded-xs px-1.5 py-0.5 font-ui text-caption font-semibold tabular', up ? 'bg-positive/10 text-positive' : 'bg-orange/10 text-orange')}
    >
      {up ? '▲' : '▼'} {formatInteger(Math.abs(change.delta))}
      {change.badgeMove && <span className="font-normal">· {change.badgeMove === 'up' ? 'promoted' : 'demoted'}</span>}
      <span className="sr-only"> rank progress in latest ranked match</span>
    </span>
  )
}

function PlayerName({ row }: { row: BoardRow }) {
  if (row.accountId !== null) {
    return (
      <Link href={`/players/${row.accountId}`} className="font-semibold text-text hover:text-highlight after:absolute after:inset-0 md:after:hidden">
        {row.name}
      </Link>
    )
  }
  return (
    <span>
      <span className="font-semibold text-text">{row.name}</span>
      <span className="block text-caption text-text-muted">{row.possibleAccounts > 1 ? `${row.possibleAccounts} possible accounts, not linked` : 'Account unknown'}</span>
    </span>
  )
}

/** Highlight for a measured change: a faint row tint, never motion. */
const changeTint = (row: BoardRow) => (row.change?.badgeMove === 'up' ? 'bg-positive/[0.06]' : row.change?.badgeMove === 'down' ? 'bg-orange/[0.06]' : '')

/** Top three, revealed one after another (once, on mount). */
export function Podium({ rows, mode }: { rows: BoardRow[]; mode: Mode }) {
  if (rows.length === 0) return null
  return (
    <ol className="grid gap-3 sm:grid-cols-3" aria-label="Top three">
      {rows.slice(0, 3).map((row, i) => (
        <Reveal as="li" key={`${row.position}-${row.name}`} index={i * 2} className={cx('relative flex items-center gap-3 rounded-md border bg-surface p-3 shadow-card', i === 0 ? 'border-primary/50 shadow-glow' : 'border-border')}>
          <span className={cx('font-display text-display-m font-extrabold tabular', i === 0 ? 'text-primary' : 'text-text-muted')}>{row.position}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate"><PlayerName row={row} /></span>
            <span className="mt-0.5 flex flex-wrap items-center gap-2">
              {row.rank ? <RankBadge rank={row.rank} className="font-ui text-sm text-text" /> : null}
              {mode.kind === 'performance' && row.value !== null && <span className="font-ui text-sm font-semibold text-text tabular">{formatMetric(row.value, mode.metric)}</span>}
            </span>
          </span>
          {row.topHeroes[0] && <HeroPortrait name={row.topHeroes[0].name} src={row.topHeroes[0].iconUrl ?? undefined} size="md" />}
        </Reveal>
      ))}
    </ol>
  )
}

/** Compact desktop table. Rows don't animate; rank changes get a faint tint. */
export function BoardTable({ rows, mode }: { rows: BoardRow[]; mode: Mode }) {
  const valueHeader = mode.kind === 'performance' ? SCOREBOARD_METRICS[mode.metric].label : null
  return (
    <div className="hidden overflow-x-auto rounded-md border border-border md:block">
      <table className="w-full font-ui text-sm">
        <caption className="sr-only">Leaderboard</caption>
        <thead className="bg-surface text-eyebrow">
          <tr className="border-b border-border">
            <th scope="col" className="w-14 px-3 py-2 text-right">#</th>
            <th scope="col" className="px-3 py-2 text-left">Player</th>
            {valueHeader && <th scope="col" className="px-3 py-2 text-right">{valueHeader}</th>}
            {mode.kind !== 'regional' && <th scope="col" className="px-3 py-2 text-right">Matches</th>}
            <th scope="col" className="px-3 py-2 text-left">Current rank</th>
            <th scope="col" className="px-3 py-2 text-left">Latest ranked match</th>
            {mode.kind === 'regional' && <th scope="col" className="px-3 py-2 text-left">Top heroes</th>}
            {mode.kind === 'performance' && <th scope="col" className="px-3 py-2 text-right">Sample</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.position}-${row.name}`} className={cx('border-b border-border/60 last:border-b-0 hover:bg-surface-raised/50', changeTint(row))}>
              <td className="px-3 py-1.5 text-right font-display text-title font-bold text-text-muted tabular">{row.position}</td>
              <th scope="row" className="px-3 py-1.5 text-left font-normal"><PlayerName row={row} /></th>
              {mode.kind === 'performance' && <td className="px-3 py-1.5 text-right font-semibold text-text tabular">{row.value !== null ? formatMetric(row.value, mode.metric) : '—'}</td>}
              {mode.kind !== 'regional' && <td className="px-3 py-1.5 text-right text-text-muted tabular">{row.matches !== null ? formatInteger(row.matches) : '—'}</td>}
              <td className="px-3 py-1.5">{row.rank ? <RankBadge rank={row.rank} className="font-ui text-sm text-text" /> : <span className="text-text-muted">—</span>}</td>
              <td className="px-3 py-1.5"><ChangeBadge change={row.change} /></td>
              {mode.kind === 'regional' && (
                <td className="px-3 py-1.5">
                  {row.topHeroes.length ? (
                    <span className="flex gap-1">{row.topHeroes.slice(0, 3).map((h) => <HeroPortrait key={h.id} name={h.name} src={h.iconUrl ?? undefined} size="sm" />)}</span>
                  ) : (
                    <span className="text-text-muted">—</span>
                  )}
                </td>
              )}
              {mode.kind === 'performance' && (
                <td className="px-3 py-1.5 text-right">{row.matches !== null && <ConfidenceBadge sampleSize={row.matches} interval={row.interval ?? undefined} scale="player" />}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Mobile: compact cards; the whole card opens the profile when the player is linked. */
export function BoardCards({ rows, mode }: { rows: BoardRow[]; mode: Mode }) {
  return (
    <ol className="flex flex-col gap-2 md:hidden">
      {rows.map((row) => (
        <li key={`${row.position}-${row.name}`} className={cx('relative flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2.5', changeTint(row))}>
          <span className="w-8 shrink-0 text-right font-display text-title font-bold text-text-muted tabular">{row.position}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate"><PlayerName row={row} /></span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              {row.rank ? <RankBadge rank={row.rank} className="font-ui text-sm text-text" /> : null}
              <ChangeBadge change={row.change} />
            </span>
          </span>
          <span className="text-right">
            {mode.kind === 'performance' && row.value !== null && <span className="block font-ui text-sm font-semibold text-text tabular">{formatMetric(row.value, mode.metric)}</span>}
            {row.matches !== null && <span className="block text-caption text-text-muted tabular">{formatInteger(row.matches)} matches</span>}
            {mode.kind === 'regional' && row.topHeroes[0] && <HeroPortrait name={row.topHeroes[0].name} src={row.topHeroes[0].iconUrl ?? undefined} size="sm" />}
          </span>
        </li>
      ))}
    </ol>
  )
}
