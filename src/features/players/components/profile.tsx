import Link from 'next/link'
import type { ReactNode } from 'react'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { CountUp } from '@/components/motion/CountUp'
import { Reveal } from '@/components/motion/Reveal'
import { cx } from '@/lib/cx'
import { rankFromBadge, type RankCatalog } from '@/lib/deadlock/rankAssets'
import { formatDuration, formatInteger, formatPercent, formatRelativeTime } from '@/lib/format'
import { domainLabel, toPercent, winRateDomain } from '@/lib/scale'
import { capitalize } from '@/features/meta/model'
import { BLOCK_SIZE, rankLabel, type HistoryMatch, type Peer, type PoolHero, type Record_, type TrendBlock } from '../model'

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export function Panel({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-24 flex-col gap-4">
      <div>
        <h2 id={`${id}-title`} className="font-display text-display-m font-bold text-text uppercase">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** Win rate with its sample (player scale). Facts only. */
export function RecordStat({ label, r, note }: { label: string; r: Record_; note?: string }) {
  return (
    <div className="flex flex-col gap-1.5 bg-surface px-4 py-3">
      <dt className="text-eyebrow">{label}</dt>
      <dd className="flex flex-col gap-1.5">
        <span className={cx('font-display text-display-m font-bold tabular', r.sample === 'low' ? 'text-text-muted' : 'text-text')}>
          {r.matches > 0 ? <CountUp value={r.winRate} format="percent" /> : '—'}
        </span>
        <span className="text-caption text-text-muted">
          {formatInteger(r.wins)} wins of {formatInteger(r.matches)}
          {note ? ` · ${note}` : ''}
        </span>
        {r.matches > 0 && <ConfidenceBadge sampleSize={r.matches} interval={r.interval} scale="player" className="self-start" />}
      </dd>
    </div>
  )
}

/** Win rate per consecutive 20-match block, with 95% interval whiskers. Bars grow in once. */
export function TrendBlocks({ blocks, change }: { blocks: TrendBlock[]; change: string | null }) {
  if (blocks.length === 0) return <p className="text-sm text-text-muted">Fewer than {BLOCK_SIZE} counted matches, so there is no trend to show.</p>
  const domain = winRateDomain(blocks.flatMap((b) => [b.interval.low, b.interval.high]))
  return (
    <div className="flex flex-col gap-3">
      <ol className="flex h-48 items-end gap-2 rounded-md border border-border bg-surface-sunken p-3">
        {blocks.map((b, i) => (
          <li key={b.from} className="relative flex h-full flex-1 flex-col justify-end" title={`${DATE.format(b.from)} – ${DATE.format(b.to)}: ${formatPercent(b.winRate)} (${b.wins}/${b.matches})`}>
            <span aria-hidden="true" className="absolute inset-x-0 border-t border-dashed border-text-muted/40" style={{ bottom: `${toPercent(0.5, domain)}%` }} />
            <span aria-hidden="true" className="absolute left-1/2 w-px -translate-x-1/2 bg-text/60" style={{ bottom: `${toPercent(b.interval.low, domain)}%`, height: `${toPercent(b.interval.high, domain) - toPercent(b.interval.low, domain)}%` }} />
            <span
              aria-hidden="true"
              className={cx('origin-bottom rounded-t-xs animate-grow-y', i === blocks.length - 1 ? 'bg-primary' : 'bg-steel')}
              style={{ height: `${toPercent(b.winRate, domain)}%`, animationDelay: `${i * 60}ms` }}
            />
            <span className="sr-only">
              Block {i + 1}, {DATE.format(b.from)} to {DATE.format(b.to)}: {formatPercent(b.winRate)} over {b.matches} matches.
            </span>
          </li>
        ))}
      </ol>
      <p className="text-caption text-text-muted">
        Each bar is {BLOCK_SIZE} consecutive matches (oldest left, newest highlighted). Scale {domainLabel(domain)}; dashed line 50%; whisker = 95% interval.{' '}
        {change && (change === 'no clear change' ? 'The latest block isn’t clearly different from the one before.' : `The latest block is clearly ${change} than the one before (intervals don’t overlap).`)}
      </p>
    </div>
  )
}

/** Rank after each ranked match (as reported by Valve), oldest → newest. */
export function RankHistory({ points, tierNames }: { points: Array<{ t: number; badge: number }>; tierNames: Map<number, string> }) {
  if (points.length < 2) return <p className="text-sm text-text-muted">Not enough ranked matches with a reported rank to chart.</p>
  const W = 640
  const H = 160
  const min = Math.min(...points.map((p) => p.badge)) - 2
  const max = Math.max(...points.map((p) => p.badge)) + 2
  const x = (i: number) => 8 + (i / (points.length - 1)) * (W - 16)
  const y = (b: number) => 10 + (1 - (b - min) / (max - min)) * (H - 30)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.badge).toFixed(1)}`).join(' ')
  const first = rankLabel(points[0].badge, tierNames)
  const last = rankLabel(points.at(-1)!.badge, tierNames)
  return (
    <figure className="flex flex-col gap-2">
      {/* Rank labels are HTML beside the chart so they stay readable on phones. */}
      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2">
        <div aria-hidden="true" className="relative">
          {/* A constant rank gives max − 2 === min + 2: one label, not two stacked copies. */}
          {[...new Set([max - 2, min + 2])].map((b) => (
            <span key={b} className="absolute right-0 -translate-y-1/2 text-right text-caption whitespace-nowrap text-text-muted" style={{ top: `${(y(b) / H) * 100}%` }}>{rankLabel(b, tierNames)}</span>
          ))}
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Rank went from ${first} to ${last} over the last ${points.length} ranked matches.`} className="h-auto w-full rounded-md border border-border bg-surface-sunken">
          {[...new Set([max - 2, min + 2])].map((b) => (
            <line key={b} x1={0} x2={W} y1={y(b)} y2={y(b)} className="stroke-border" strokeDasharray="3 5" />
          ))}
          <path d={path} data-draw pathLength={1} fill="none" className="stroke-primary" strokeWidth={2} strokeLinejoin="round" />
        </svg>
      </div>
      <figcaption className="text-caption text-text-muted">
        {first} → {last} across the last {points.length} ranked matches with a reported rank ({DATE.format(points[0].t)} – {DATE.format(points.at(-1)!.t)}).
      </figcaption>
    </figure>
  )
}

export function HeroPoolGrid({ pool }: { pool: PoolHero[] }) {
  if (pool.length === 0) return <p className="text-sm text-text-muted">No hero statistics for this player.</p>
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {pool.slice(0, 12).map((h, i) => (
        <Reveal as="li" key={h.id} index={i} className="relative flex items-center gap-3 rounded-md border border-border bg-surface p-3">
          <HeroPortrait name={h.name} src={h.iconUrl ?? undefined} size="md" />
          <span className="min-w-0 flex-1">
            <Link href={`/heroes/${h.slug}`} className="block truncate font-ui text-sm font-semibold text-text after:absolute after:inset-0 hover:text-highlight">{h.name}</Link>
            <span className="block text-caption text-text-muted">
              {formatInteger(h.matches)} matches{h.role ? ` · ${capitalize(h.role)}` : ''}
              {h.lastPlayed && ` · last ${formatRelativeTime(h.lastPlayed)}`}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-2">
              <span className={cx('font-ui text-sm font-semibold tabular', h.sample === 'low' ? 'text-text-muted' : 'text-text')}>{formatPercent(h.winRate)}</span>
              <ConfidenceBadge sampleSize={h.matches} interval={h.interval} scale="player" />
            </span>
            <span className="block text-caption text-text-muted tabular">K/D/A {h.kda.map((v) => v.toFixed(1)).join(' / ')}</span>
          </span>
        </Reveal>
      ))}
    </ul>
  )
}

export function PeerTable({ peers, label, empty }: { peers: Peer[]; label: string; empty: string }) {
  if (peers.length === 0) return <p className="text-sm text-text-muted">{empty}</p>
  return (
    <>
    {/* Phones: cards. Name (the whole row is the link), then matches, win rate and confidence. */}
    <ul aria-label={label} className="flex flex-col divide-y divide-border rounded-md border border-border sm:hidden">
      {peers.map((p) => (
        <li key={p.accountId} className="relative flex items-center gap-3 px-3 py-2.5">
          <span className="min-w-0 flex-1">
            <Link href={`/players/${p.accountId}`} className="block truncate font-semibold text-text after:absolute after:inset-0 hover:text-highlight">{p.name ?? `Player ${p.accountId}`}</Link>
            <span className="text-caption text-text-muted tabular">{formatInteger(p.matches)} matches</span>
          </span>
          <span className="flex flex-col items-end gap-1">
            <span className={cx('font-ui text-sm font-semibold tabular', p.sample === 'low' ? 'text-text-muted' : 'text-text')}>{formatPercent(p.winRate)}</span>
            <ConfidenceBadge sampleSize={p.matches} interval={p.interval} scale="player" />
          </span>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
      <table className="w-full font-ui text-sm">
        <caption className="sr-only">{label}</caption>
        <thead className="bg-surface text-eyebrow">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Player</th>
            <th scope="col" className="px-3 py-2 text-right">Matches</th>
            <th scope="col" className="px-3 py-2 text-right">Win rate</th>
            <th scope="col" className="px-3 py-2 text-right">Confidence</th>
          </tr>
        </thead>
        <tbody>
          {peers.map((p) => (
            <tr key={p.accountId} className="border-t border-border hover:bg-surface-raised/50">
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <Link href={`/players/${p.accountId}`} className="text-text hover:text-highlight">{p.name ?? `Player ${p.accountId}`}</Link>
              </th>
              <td className="px-3 py-2 text-right text-text tabular">{formatInteger(p.matches)}</td>
              <td className={cx('px-3 py-2 text-right tabular', p.sample === 'low' ? 'text-text-muted' : 'text-text')}>{formatPercent(p.winRate)}</td>
              <td className="px-3 py-2 text-right"><ConfidenceBadge sampleSize={p.matches} interval={p.interval} scale="player" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}

export function RecentMatches({ matches }: { matches: HistoryMatch[] }) {
  return (
    <ul className="grid gap-2 md:grid-cols-2">
      {matches.map((m, i) => (
        <Reveal as="li" key={m.id} index={i}>
          <Link
            href={`/matches/${m.id}`}
            className={cx(
              'elevate flex items-center gap-3 rounded-md border border-l-4 border-border bg-surface p-3',
              m.result === 'win' ? 'border-l-positive' : m.result === 'loss' ? 'border-l-negative' : 'border-l-border-strong',
            )}
          >
            <HeroPortrait name={m.hero.name} src={m.hero.iconUrl ?? undefined} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block font-ui text-sm">
                <span className={cx('font-semibold', m.result === 'win' ? 'text-positive' : m.result === 'loss' ? 'text-negative' : 'text-text-muted')}>
                  {m.result === 'win' ? 'Win' : m.result === 'loss' ? 'Loss' : 'Not counted'}
                </span>
                <span className="text-text-muted"> · {m.hero.name} · <span className="tabular">{m.kda.join(' / ')}</span></span>
              </span>
              <span className="block text-caption text-text-muted">
                {formatRelativeTime(m.startedAt)} · {formatDuration(m.durationS)} · {m.ranked ? 'Ranked' : 'Unranked'}
              </span>
            </span>
          </Link>
        </Reveal>
      ))}
    </ul>
  )
}

export function HistoryTable({ matches, ranks }: { matches: HistoryMatch[]; ranks: RankCatalog }) {
  return (
    <>
    {/* Phones: cards (result, hero, K/D/A first; date, length, souls, mode and rank on the second line). */}
    <ul aria-label="Match history" className="flex flex-col divide-y divide-border rounded-md border border-border sm:hidden">
      {matches.map((m) => (
        <li key={m.id} className="relative flex flex-col gap-0.5 px-3 py-2.5">
          <span className="flex items-baseline gap-2 font-ui text-sm">
            <Link href={`/matches/${m.id}`} className={cx('font-semibold after:absolute after:inset-0', m.result === 'win' ? 'text-positive' : m.result === 'loss' ? 'text-negative' : 'text-text-muted')}>
              {m.result === 'win' ? 'Win' : m.result === 'loss' ? 'Loss' : 'Not counted'}
            </Link>
            <span className="min-w-0 flex-1 truncate text-text">{m.hero.name}</span>
            <span className="text-text tabular">{m.kda.join('/')}</span>
          </span>
          <span className="text-caption text-text-muted tabular">
            {DATE.format(m.startedAt)} · {formatDuration(m.durationS)} · {formatInteger(m.netWorth)} souls · {m.ranked ? 'Ranked' : 'Unranked'}
            {m.badgeAfter ? <> · <RankBadge rank={rankFromBadge(ranks, m.badgeAfter)} size="xs" /></> : ''}
          </span>
        </li>
      ))}
    </ul>
    <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
      <table className="w-full font-ui text-sm">
        <caption className="sr-only">Match history</caption>
        <thead className="bg-surface text-eyebrow">
          <tr>
            <th scope="col" className="px-3 py-2 text-left">Date</th>
            <th scope="col" className="px-3 py-2 text-left">Hero</th>
            <th scope="col" className="px-3 py-2 text-left">Result</th>
            <th scope="col" className="px-3 py-2 text-right">K/D/A</th>
            <th scope="col" className="px-3 py-2 text-right">Souls</th>
            <th scope="col" className="px-3 py-2 text-right">Length</th>
            <th scope="col" className="px-3 py-2 text-left">Mode</th>
            <th scope="col" className="px-3 py-2 text-left">Rank after</th>
          </tr>
        </thead>
        <tbody>
          {matches.map((m) => (
            <tr key={m.id} className="border-t border-border hover:bg-surface-raised/50">
              <td className="px-3 py-2 whitespace-nowrap">
                <Link href={`/matches/${m.id}`} className="text-text hover:text-highlight">{DATE.format(m.startedAt)}</Link>
              </td>
              <td className="px-3 py-2 whitespace-nowrap text-text">{m.hero.name}</td>
              <td className={cx('px-3 py-2', m.result === 'win' ? 'text-positive' : m.result === 'loss' ? 'text-negative' : 'text-text-muted')}>
                {m.result === 'win' ? 'Win' : m.result === 'loss' ? 'Loss' : 'Not counted'}
              </td>
              <td className="px-3 py-2 text-right text-text tabular">{m.kda.join('/')}</td>
              <td className="px-3 py-2 text-right text-text-muted tabular">{formatInteger(m.netWorth)}</td>
              <td className="px-3 py-2 text-right text-text-muted tabular">{formatDuration(m.durationS)}</td>
              <td className="px-3 py-2 text-text-muted">{m.ranked ? 'Ranked' : 'Unranked'}</td>
              <td className="px-3 py-2 whitespace-nowrap text-text-muted">{m.badgeAfter ? <RankBadge rank={rankFromBadge(ranks, m.badgeAfter)} /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  )
}
