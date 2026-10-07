'use client'

import { Link } from '@/i18n/navigation'
import { useRef, useState, type KeyboardEvent } from 'react'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Reveal } from '@/components/motion/Reveal'
import { ChevronDownIcon } from '@/components/ui/icons'
import { cx } from '@/lib/cx'
import { formatCompact, formatDuration, formatRelativeTime } from '@/lib/format'
import type { MatchRow, MatchTeam } from '../model'

const DATE_TIME = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' })

/**
 * Desktop (≥ lg): table + sticky preview panel. Click a row or use ↑/↓ to preview.
 * Mobile: stacked cards with expandable player lists. Table rows never animate.
 */
/**
 * `now` comes from the server render: relative times ("5 min ago") computed with the client's own
 * clock can differ by a minute at hydration and cause a text mismatch (React #418).
 */
export function MatchesExplorer({ rows, now }: { rows: MatchRow[]; now: number }) {
  const [selectedId, setSelectedId] = useState(rows[0]?.id ?? null)
  const selected = rows.find((r) => r.id === selectedId) ?? rows[0] ?? null
  const bodyRef = useRef<HTMLTableSectionElement>(null)

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
            <caption className="sr-only">Recent matches. Select a row to preview it; use the up and down arrow keys to move.</caption>
            <thead className="bg-surface text-eyebrow">
              <tr className="border-b border-border">
                <th scope="col" className="px-3 py-2.5 text-left">When</th>
                <th scope="col" className="px-3 py-2.5 text-left">Result</th>
                <th scope="col" className="px-3 py-2.5 text-left">Teams</th>
                <th scope="col" className="px-3 py-2.5 text-right">Length</th>
                <th scope="col" className="px-3 py-2.5 text-left">Avg. rank</th>
                <th scope="col" className="px-3 py-2.5 text-left">Patch</th>
              </tr>
            </thead>
            {/* ↑/↓ arrive from the focused row button and bubble here; the buttons are the interactive elements. */}
            {/* oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */}
            <tbody ref={bodyRef} onKeyDown={onKeyDown}>
              {rows.map((row) => {
                const active = row.id === selected?.id
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
                        aria-label={`Preview match ${row.id}, ${formatRelativeTime(row.startedAt, now)}`}
                        onClick={() => setSelectedId(row.id)}
                        className="text-left text-text"
                      >
                        {formatRelativeTime(row.startedAt, now)}
                      </button>
                    </td>
                    <td className="px-3 py-2.5"><ResultText row={row} /></td>
                    <td className="px-3 py-2.5"><TeamStrips teams={row.teams} /></td>
                    <td className="px-3 py-2.5 text-right text-text tabular">{formatDuration(row.durationS)}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{row.rank ? <RankBadge rank={row.rank} /> : '—'}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-text-muted">{row.patch ?? '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        {/* Announce a one-line summary, not the whole preview (both team tables) on every arrow press. */}
        <p role="status" className="sr-only">{selected ? `Previewing match ${selected.id}: ${resultSummary(selected)}, ${formatDuration(selected.durationS)}` : ''}</p>
        <aside aria-label="Match preview" className="sticky top-24 self-start">
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
function resultSummary(row: MatchRow): string {
  if (row.focus) return `${row.focus.won ? 'win' : 'loss'} for ${row.focus.label}, ${row.focus.kda}`
  const winner = row.teams.find((t) => t.won)
  return winner ? `${winner.label} won` : 'no result'
}

function ResultText({ row }: { row: MatchRow }) {
  if (row.focus) {
    return (
      <span className="whitespace-nowrap">
        <span className={cx('font-semibold', row.focus.won ? 'text-positive' : 'text-negative')}>{row.focus.won ? 'Win' : 'Loss'}</span>
        <span className="text-text-muted"> · {row.focus.label} · <span className="tabular">{row.focus.kda}</span></span>
      </span>
    )
  }
  const winner = row.teams.find((t) => t.won)
  return <span className="whitespace-nowrap text-text">{winner ? `${winner.label} won` : 'No result'}</span>
}

function TeamStrips({ teams, size = 'sm' }: { teams: [MatchTeam, MatchTeam]; size?: 'sm' }) {
  return (
    <span className="flex flex-col gap-1">
      {teams.map((team) => (
        <span key={team.label} className="flex items-center gap-1.5">
          <span className={cx('w-3 text-caption font-semibold', team.won ? 'text-positive' : 'text-text-muted')} aria-hidden="true">
            {team.won ? 'W' : 'L'}
          </span>
          <span className="sr-only">{team.label}, {team.won ? 'won' : 'lost'}:</span>
          <span className="flex gap-0.5">
            {team.players.map((p) => (
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
  return (
    <article className="flex animate-awaken flex-col gap-4 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card">
      <header className="flex flex-col gap-1">
        <h3 className="font-display text-title font-bold text-text uppercase">Match {row.id}</h3>
        <p className="text-caption text-text-muted">
          {DATE_TIME.format(row.startedAt)} · {formatDuration(row.durationS)} · {row.mode}
        </p>
        <p className="text-caption text-text-muted">
          {row.rank ? <>Average rank <RankBadge rank={row.rank} size="xs" /></> : 'No average rank'} · {row.patch ? `${row.patch} patch` : 'Patch unknown'}
        </p>
        <p className="mt-1 text-sm"><ResultText row={row} /></p>
        <Link href={`/matches/${row.id}`} className="mt-1 self-start font-ui text-sm font-semibold text-primary hover:text-highlight">Open full match →</Link>
      </header>
      <SoulsBar teams={row.teams} />
      {row.teams.map((team) => (
        <TeamTable key={team.label} team={team} />
      ))}
    </article>
  )
}

function SoulsBar({ teams }: { teams: [MatchTeam, MatchTeam] }) {
  const [a, b] = teams
  if (a.netWorth === null || b.netWorth === null || a.netWorth + b.netWorth === 0) return null
  const share = a.netWorth / (a.netWorth + b.netWorth)
  return (
    <div className="flex flex-col gap-1">
      <span aria-hidden="true" className="flex h-2 overflow-hidden rounded-pill bg-steel">
        <span className="origin-left animate-grow bg-primary" style={{ width: `${share * 100}%` }} />
      </span>
      <span className="flex justify-between text-caption text-text-muted tabular">
        <span>Team 1 {formatCompact(a.netWorth)} souls</span>
        <span>Team 2 {formatCompact(b.netWorth)} souls</span>
      </span>
    </div>
  )
}

function TeamTable({ team }: { team: MatchTeam }) {
  return (
    <section aria-label={`${team.label}, ${team.won ? 'won' : 'lost'}`}>
      <h4 className="mb-1.5 flex items-center gap-2 text-eyebrow">
        {team.label}
        <span className={cx('rounded-xs border px-1 text-caption', team.won ? 'border-positive/40 text-positive' : 'border-border-strong text-text-muted')}>{team.won ? 'Won' : 'Lost'}</span>
      </h4>
      <ul className="flex flex-col gap-1">
        {team.players.map((p) => (
          <li key={p.accountId} className={cx('flex items-center gap-2 rounded-xs px-1.5 py-1 text-sm pointer-coarse:min-h-11', p.focus && 'bg-primary/10')}>
            <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="sm" />
            {p.hero.slug ? (
              <Link href={`/heroes/${p.hero.slug}`} className="min-w-0 flex-1 truncate text-text hover:text-highlight pointer-coarse:flex pointer-coarse:min-h-11 pointer-coarse:items-center">{p.hero.name}</Link>
            ) : (
              <span className="min-w-0 flex-1 truncate text-text">{p.hero.name}</span>
            )}
            <span className="text-text-muted tabular">{p.kills}/{p.deaths}/{p.assists}</span>
            {p.netWorth !== null && <span className="w-12 text-right text-caption text-text-muted tabular">{formatCompact(p.netWorth)}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function MobileMatchCard({ row, now }: { row: MatchRow; now: number }) {
  return (
    <article className="rounded-md border border-border bg-surface p-4 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm"><ResultText row={row} /></p>
        <p className="text-caption text-text-muted tabular">
          {formatRelativeTime(row.startedAt, now)} · {formatDuration(row.durationS)}
        </p>
      </header>
      <div className="mt-3"><TeamStrips teams={row.teams} /></div>
      <p className="mt-3 text-caption text-text-muted">
        {row.mode}
        {row.rank && <> · <RankBadge rank={row.rank} size="xs" /></>}
        {row.patch && ` · ${row.patch} patch`}
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
  const [open, setOpen] = useState(false)
  return (
    <details className="group mt-3 border-t border-border pt-3" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 font-ui text-sm font-semibold text-primary [&::-webkit-details-marker]:hidden">
        Players
        <ChevronDownIcon size={16} className="transition-transform duration-(--dur-fast) group-open:rotate-180" />
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        {open && (
          <>
            <SoulsBar teams={row.teams} />
            {row.teams.map((team) => (
              <TeamTable key={team.label} team={team} />
            ))}
          </>
        )}
        <Link href={`/matches/${row.id}`} className="inline-flex min-h-11 items-center font-ui text-sm font-semibold text-primary hover:text-highlight">Open match {row.id} →</Link>
      </div>
    </details>
  )
}
