'use client'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import { useRef, useState, type KeyboardEvent } from 'react'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Reveal } from '@/components/motion/Reveal'
import { ChevronDownIcon } from '@/components/ui/icons'
import { cx } from '@/lib/cx'
import { dateFormat, formatCompact, formatDuration, formatRelativeTime } from '@/lib/format'
import type { MatchRow, MatchTeam } from '../model'

const DATE_TIME: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }
const PATCH_DATE: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', timeZone: 'UTC' }

/*
 * Matches page only. Its words come from matches.explorer / matches.common, which the page sends to the
 * client (WithClientMessages). Teams are worded by position ("Team 1/2" is the model's English label).
 */

/** Words shared by the parts below. */
function useWords() {
  const t = useTranslations('matches')
  const locale = useLocale()
  const team = (index: number) => t('common.team', { n: index + 1 })
  const mode = (row: MatchRow) => (row.mode === 'Ranked' ? t('common.ranked') : t('common.unranked'))
  const patchDate = (row: MatchRow) => (row.patchAt === null ? null : dateFormat(locale, PATCH_DATE).format(row.patchAt))
  return { t, locale, team, mode, patchDate }
}

/**
 * Desktop (≥ lg): table + sticky preview panel. Click a row or use ↑/↓ to preview.
 * Mobile: stacked cards with expandable player lists. Table rows never animate.
 */
/**
 * `now` comes from the server render: relative times ("5 min ago") computed with the client's own
 * clock can differ by a minute at hydration and cause a text mismatch (React #418).
 */
export function MatchesExplorer({ rows, now }: { rows: MatchRow[]; now: number }) {
  const { t, locale, patchDate } = useWords()
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? null)
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const bodyRef = useRef<HTMLTableSectionElement>(null)
  const summary = useResultSummary()

  function onKeyDown(event: KeyboardEvent<HTMLTableSectionElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    const index = rows.findIndex((r) => r.id === selected?.id)
    const next = rows[Math.min(rows.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))]
    if (!next) return
    event.preventDefault()
    setSelectedId(next.id)
    bodyRef.current?.querySelector<HTMLButtonElement>(`[data-match="${next.id}"]`)?.focus()
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full font-ui text-sm">
            <caption className="sr-only">{t('explorer.caption')}</caption>
            <thead className="bg-surface text-eyebrow">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2.5 text-left">{t('explorer.when')}</th>
                <th scope="col" className="px-3 py-2.5 text-left">{t('explorer.result')}</th>
                <th scope="col" className="px-3 py-2.5 text-left">{t('explorer.teams')}</th>
                <th scope="col" className="px-3 py-2.5 text-right">{t('explorer.length')}</th>
                <th scope="col" className="px-3 py-2.5 text-left">{t('explorer.avgRank')}</th>
                <th scope="col" className="px-3 py-2.5 text-left">{t('explorer.patch')}</th>
              </tr>
            </thead>
            {/* ↑/↓ arrive from the focused row button and bubble here; the buttons are the interactive elements. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <tbody ref={bodyRef} onKeyDown={onKeyDown}>
              {rows.map((row) => {
                const active = row.id === selected?.id
                const when = formatRelativeTime(row.startedAt, now, locale)
                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={cx(
                      'cursor-pointer border-b border-border/70 transition-colors duration-(--dur-fast) last:border-b-0',
                      active ? 'bg-surface-raised shadow-[inset_3px_0_0_var(--color-primary)]' : 'hover:bg-surface-raised/50',
                    )}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <button
                        type="button"
                        data-match={row.id}
                        aria-pressed={active}
                        aria-label={t('explorer.previewMatch', { id: row.id, time: when })}
                        onClick={() => setSelectedId(row.id)}
                        className="text-left text-text"
                      >
                        {when}
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><ResultText row={row} /></td>
                    <td className="px-3 py-2.5"><TeamStrips teams={row.teams} /></td>
                    <td className="px-3 py-2.5 text-right text-text tabular">{formatDuration(row.durationS)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{row.rank ? <RankBadge rank={row.rank} /> : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{patchDate(row) ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Announce a one-line summary, not the whole preview (both team tables) on every arrow press. */}
        <p role="status" className="sr-only">{selected ? t('explorer.previewing', { id: selected.id, summary: summary(selected), duration: formatDuration(selected.durationS) }) : ''}</p>
        <aside aria-label={t('explorer.preview')} className="sticky top-24 self-start">
          {selected && <MatchPreview key={selected.id} row={selected} />}
        </aside>
      </div>

      {/* Mobile */}
      <ol className="flex flex-col gap-3 lg:hidden">
        {rows.map((row, i) => (
          <Reveal as="li" key={row.id} index={i}>
            <MobileMatchCard row={row} now={now} />
          </Reveal>
        ))}
      </ol>
    </>
  )
}

/** Plain-text result for announcements (same facts as ResultText). */
function useResultSummary() {
  const { t, team } = useWords()
  return (row: MatchRow): string => {
    if (row.focus) return t('explorer.focusSummary', { result: row.focus.won ? 'win' : 'loss', label: row.focus.label, kda: row.focus.kda })
    const winner = row.teams.findIndex((x) => x.won)
    return winner >= 0 ? t('explorer.teamWon', { team: team(winner) }) : t('explorer.noResult')
  }
}

function ResultText({ row }: { row: MatchRow }) {
  const { t, team } = useWords()
  if (row.focus) {
    return (
      <span className="whitespace-nowrap">
        <span className={cx('font-semibold', row.focus.won ? 'text-positive' : 'text-negative')}>{row.focus.won ? t('common.win') : t('common.loss')}</span>
        <span className="text-text-muted"> · {row.focus.label} · <span className="tabular">{row.focus.kda}</span></span>
      </span>
    )
  }
  const winner = row.teams.findIndex((x) => x.won)
  return <span className="whitespace-nowrap text-text">{winner >= 0 ? t('explorer.teamWon', { team: team(winner) }) : t('explorer.noResult')}</span>
}

function TeamStrips({ teams, size = 'sm' }: { teams: [MatchTeam, MatchTeam]; size?: 'sm' }) {
  const { t, team } = useWords()
  return (
    <span className="flex flex-col gap-1">
      {teams.map((x, i) => (
        <span key={x.label} className="flex items-center gap-1.5">
          <span className={cx('w-3 text-caption font-semibold', x.won ? 'text-positive' : 'text-text-muted')} aria-hidden="true">
            {x.won ? t('explorer.winShort') : t('explorer.lossShort')}
          </span>
          <span className="sr-only">{t('explorer.teamState', { team: team(i), result: x.won ? 'won' : 'lost' })}:</span>
          <span className="flex gap-0.5">
            {x.players.map((p) => (
              <HeroPortrait key={p.accountId} name={p.hero.name} src={p.hero.iconUrl ?? undefined} size={size} className={cx('size-6!', p.focus && 'ring-2 ring-highlight')} />
            ))}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Desktop preview: everything readable, nothing raw. Fades in when the selection changes. */
function MatchPreview({ row }: { row: MatchRow }) {
  const { t, locale, mode, patchDate } = useWords()
  const patch = patchDate(row)
  return (
    <article className="flex animate-awaken flex-col gap-4 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-title font-bold text-text uppercase">{t('explorer.match', { id: row.id })}</h3>
        <p className="text-caption text-text-muted">
          {dateFormat(locale, DATE_TIME).format(row.startedAt)} · {formatDuration(row.durationS)} · {mode(row)}
        </p>
        <p className="text-caption text-text-muted">
          {row.rank ? <>{t('explorer.averageRank')} <RankBadge rank={row.rank} size="xs" /></> : t('explorer.noAverageRank')} · {patch ? t('common.patch', { date: patch }) : t('common.patchUnknown')}
        </p>
        <p className="mt-1 text-sm"><ResultText row={row} /></p>
        <Link href={`/matches/${row.id}`} className="mt-1 self-start font-ui text-sm font-semibold text-primary hover:text-highlight">{t('explorer.openFull')}</Link>
      </header>
      <SoulsBar teams={row.teams} />
      {row.teams.map((x, i) => (
        <TeamTable key={x.label} team={x} index={i} />
      ))}
    </article>
  )
}

function SoulsBar({ teams }: { teams: [MatchTeam, MatchTeam] }) {
  const { t, locale, team } = useWords()
  const [a, b] = teams
  if (a.netWorth === null || b.netWorth === null || a.netWorth + b.netWorth === 0) return null
  const share = a.netWorth / (a.netWorth + b.netWorth)
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="flex h-2 overflow-hidden rounded-pill bg-steel">
        <span className="origin-left animate-grow bg-primary" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="flex justify-between text-caption text-text-muted tabular">
        <span>{team(0)} {t('common.souls', { value: formatCompact(a.netWorth, locale) })}</span>
        <span>{team(1)} {t('common.souls', { value: formatCompact(b.netWorth, locale) })}</span>
      </span>
    </div>
  )
}

function TeamTable({ team: x, index }: { team: MatchTeam; index: number }) {
  const { t, locale, team } = useWords()
  return (
    <section aria-label={t('explorer.teamState', { team: team(index), result: x.won ? 'won' : 'lost' })}>
      <h4 className="mb-1.5 flex items-center gap-2 text-eyebrow">
        {team(index)}
        <span className={cx('rounded-xs border px-1 text-caption', x.won ? 'border-positive/40 text-positive' : 'border-border-strong text-text-muted')}>{x.won ? t('common.won') : t('common.lost')}</span>
      </h4>
      <ul className="flex flex-col gap-1">
        {x.players.map((p) => (
          <li key={p.accountId} className={cx('flex items-center gap-2 rounded-xs px-1.5 py-1 text-sm pointer-coarse:min-h-11', p.focus && 'bg-primary/10')}>
            <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="sm" />
            {p.hero.slug ? (
              <Link href={`/heroes/${p.hero.slug}`} className="min-w-0 flex-1 truncate text-text hover:text-highlight pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center">{p.hero.name}</Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-text">{p.hero.name}</span>
            )}
            <span className="text-text-muted tabular">{p.kills}/{p.deaths}/{p.assists}</span>
            {p.netWorth !== null && <span className="w-12 text-right text-caption text-text-muted tabular">{formatCompact(p.netWorth, locale)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function MobileMatchCard({ row, now }: { row: MatchRow; now: number }) {
  const { t, locale, mode, patchDate } = useWords()
  const patch = patchDate(row)
  return (
    <article className="rounded-md border border-border bg-surface p-4 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm"><ResultText row={row} /></p>
        <p className="text-caption text-text-muted tabular">
          {formatRelativeTime(row.startedAt, now, locale)} · {formatDuration(row.durationS)}
        </p>
      </header>
      <div className="mt-3"><TeamStrips teams={row.teams} /></div>
      <p className="mt-3 text-caption text-text-muted">
        {mode(row)}
        {row.rank && <> · <RankBadge rank={row.rank} size="xs" /></>}
        {patch && ` · ${t('common.patch', { date: patch })}`}
      </p>
      <PlayersDetails row={row} />
    </article>
  )
}

/**
 * The two team tables render only once opened: closed, they were 24 portraits and ~100 nodes per
 * card, in the DOM on every viewport (docs/PERFORMANCE.md § DOM size). The match link always renders.
 */
function PlayersDetails({ row }: { row: MatchRow }) {
  const { t } = useWords()
  const [open, setOpen] = useState(false)
  return (
    <details className="group mt-3 border-t border-border pt-3" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
        {t('explorer.players')}
        <ChevronDownIcon size={16} className="transition-transform duration-(--dur-fast) group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {open && (
          <>
            <SoulsBar teams={row.teams} />
            {row.teams.map((x, i) => (
              <TeamTable key={x.label} team={x} index={i} />
            ))}
          </>
        )}
        <Link href={`/matches/${row.id}`} className="inline-flex min-h-11 items-center font-ui text-sm font-semibold text-primary hover:text-highlight">{t('explorer.openMatch', { id: row.id })}</Link>
      </div>
    </details>
  )
}
