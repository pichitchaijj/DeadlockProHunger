'use client'

import { createContext, useContext, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { InView } from '@/components/motion/InView'
import { cx } from '@/lib/cx'
import { formatCompact, formatDuration } from '@/lib/format'
import type { EventKind, MatchEvent, Side } from '../model'

/* ── Shared state: selected event + scrubber time ───────────────────── */

type TimelineState = {
  selectedId: string | null
  scrubT: number
  select: (event: MatchEvent) => void
  setScrubT: (t: number) => void
}
const TimelineContext = createContext<TimelineState | null>(null)

function useTimeline() {
  const value = useContext(TimelineContext)
  if (!value) throw new Error('Timeline components need <MatchTimeProvider>')
  return value
}

export function MatchTimeProvider({ durationS, children }: { durationS: number; children: ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [scrubT, setScrubT] = useState(durationS)
  const value = useMemo<TimelineState>(
    () => ({
      selectedId,
      scrubT,
      setScrubT,
      select: (event) => {
        setSelectedId(event.id)
        setScrubT(event.t)
      },
    }),
    [selectedId, scrubT],
  )
  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>
}

/* ── Timeline ──────────────────────────────────────────────────────── */

export type TimelinePlayer = {
  slot: number
  side: Side
  label: string
  purchases: Array<{ t: number; name: string | null; tier: number | null; slot: string | null; icon: string | null; soldAt: number | null }>
  ticks: Array<{ t: number; netWorth: number }>
}

type TimelineProps = {
  durationS: number
  times: number[]
  lead: number[]
  events: MatchEvent[]
  players: TimelinePlayer[]
}

const W = 1000
const PAD_X = 16
const LEAD_TOP = 8
const LEAD_H = 110
const ROWS = { objective: 152, midboss: 182, kills: 216, purchases: 256 }
const AXIS_Y = 290
const H = 304
const TEAM_FILL: Record<Side, string> = { 0: 'fill-primary', 1: 'fill-text-muted' }

export function MatchTimeline({ durationS, times, lead, events, players }: TimelineProps) {
  const { selectedId, scrubT, select, setScrubT } = useTimeline()
  const [hover, setHover] = useState<{ x: number; text: string } | null>(null)
  const [playerSlot, setPlayerSlot] = useState(players[0]?.slot ?? null)
  const sliderId = useId()
  const player = players.find((p) => p.slot === playerSlot) ?? null
  const svgRef = useRef<SVGSVGElement>(null)
  // Roving focus: the chart is one Tab stop; arrow keys move between events in time order (docs/ACCESSIBILITY.md § Charts).
  const [focusId, setFocusId] = useState<string | null>(null)

  const x = (t: number) => PAD_X + (Math.min(t, durationS) / durationS) * (W - PAD_X * 2)
  const maxAbs = Math.max(1, ...lead.map(Math.abs))
  const midY = LEAD_TOP + LEAD_H / 2
  const y = (v: number) => midY - (v / maxAbs) * (LEAD_H / 2 - 4)
  const leadPath = times.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(t).toFixed(1)},${y(lead[i]).toFixed(1)}`).join(' ')
  const leadArea = `${leadPath} L${x(times.at(-1)!).toFixed(1)},${midY} L${x(0)},${midY} Z`

  const playerMax = Math.max(1, ...(player?.ticks.map((k) => k.netWorth) ?? [1]))
  const playerPath = player ? [{ t: 0, netWorth: 0 }, ...player.ticks].map((k, i) => `${i === 0 ? 'M' : 'L'}${x(k.t).toFixed(1)},${(LEAD_TOP + LEAD_H - (k.netWorth / playerMax) * (LEAD_H - 8)).toFixed(1)}`).join(' ') : ''

  const minuteMarks = Array.from({ length: Math.floor(durationS / 300) + 1 }, (_, i) => i * 300)
  const show = (t: number, text: string) => setHover({ x: (x(t) / W) * 100, text: `${formatDuration(t)} · ${text}` })

  // State at the scrubber position (souls lead only exists at samples: use the last one at or before).
  const killsSoFar: [number, number] = [0, 1].map((s) => events.filter((e) => e.kind === 'kill' && e.side === s && e.t <= scrubT).length) as [number, number]
  const objectivesSoFar: [number, number] = [0, 1].map((s) => events.filter((e) => e.kind === 'objective' && e.side === s && e.t <= scrubT).length) as [number, number]
  let sample = 0
  for (const [i, t] of times.entries()) if (t <= scrubT) sample = i
  const selected = events.find((e) => e.id === selectedId) ?? null

  const rowY = (kind: EventKind, side: Side | null) =>
    kind === 'kill' ? ROWS.kills + (side === 0 ? -7 : 7) : kind === 'objective' ? ROWS.objective : kind === 'midboss' ? ROWS.midboss : ROWS.purchases

  const buys = (player?.purchases ?? []).map((b, i) => ({
    b,
    e: { id: `buy-${player!.slot}-${i}`, t: b.t, kind: 'purchase', side: player!.side, text: `${player!.label} bought ${b.name ?? 'an item'}${b.soldAt ? ` (sold ${formatDuration(b.soldAt)})` : ''}`, slots: [player!.slot] } as MatchEvent,
  }))
  const ordered = [...events.filter((e) => e.kind !== 'purchase'), ...buys.map((x) => x.e)].sort((a, b) => a.t - b.t || a.id.localeCompare(b.id))
  const tabStop = [focusId, selectedId].find((id) => id && ordered.some((e) => e.id === id)) ?? ordered[0]?.id ?? null
  const moveFocus = (from: string, key: string) => {
    const i = ordered.findIndex((e) => e.id === from)
    const next = key === 'Home' ? 0 : key === 'End' ? ordered.length - 1 : Math.min(ordered.length - 1, Math.max(0, i + (key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1)))
    const id = ordered[next]?.id
    if (!id) return
    setFocusId(id)
    svgRef.current?.querySelector<SVGGElement>(`[data-marker-id="${id}"]`)?.focus()
  }

  const marker = (e: MatchEvent, shape: ReactNode) => (
    // SVG markers are keyboard-operable buttons with roving focus: Tab reaches one, arrows move along the timeline.
    <g
      key={e.id}
      data-marker-id={e.id}
      role="button"
      tabIndex={e.id === tabStop ? 0 : -1}
      aria-label={`${formatDuration(e.t)}: ${e.text}`}
      aria-pressed={selectedId === e.id}
      className="cursor-pointer outline-none [&:focus-visible>*:first-child]:stroke-highlight"
      onMouseEnter={() => show(e.t, e.text)}
      onMouseLeave={() => setHover(null)}
      onFocus={() => show(e.t, e.text)}
      onBlur={() => setHover(null)}
      onClick={() => select(e)}
      onKeyDown={(k) => {
        if (k.key === 'Enter' || k.key === ' ') {
          k.preventDefault()
          select(e)
        } else if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(k.key)) {
          k.preventDefault()
          moveFocus(e.id, k.key)
        }
      }}
    >
      <g className="animate-scale-in [transform-box:fill-box] [transform-origin:center]" style={{ animationDelay: `${150 + Math.round((e.t / Math.max(1, durationS)) * 650)}ms` }}>
        {shape}
      </g>
      {selectedId === e.id && <circle cx={x(e.t)} cy={rowY(e.kind, e.side)} r={10} className="fill-none stroke-highlight" strokeWidth={2} />}
    </g>
  )

  return (
    <InView className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-eyebrow">Player focus (purchases and souls curve)</span>
          <select
            value={playerSlot ?? ''}
            onChange={(e) => setPlayerSlot(Number(e.target.value))}
            className="h-11 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text"
          >
            {players.map((p) => (
              <option key={p.slot} value={p.slot}>
                {p.side === 0 ? 'Team 1' : 'Team 2'} · {p.label}
              </option>
            ))}
          </select>
        </label>
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-muted" aria-label="Legend">
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-primary" /> Team 1</li>
          <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-xs bg-text-muted" /> Team 2</li>
          <li className="flex items-center gap-1.5"><span className="h-0.5 w-4 border-t-2 border-dashed border-highlight" /> Focused player’s souls</li>
        </ul>
      </div>

      <div className="relative overflow-x-auto rounded-md border border-border bg-surface-sunken">
        <div className="relative min-w-[40rem]">
          <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label="Match timeline. Arrow keys move between events; Enter selects one.">
            {/* Time grid */}
            {minuteMarks.map((t) => (
              <g key={t}>
                <line x1={x(t)} x2={x(t)} y1={LEAD_TOP} y2={AXIS_Y - 6} className="stroke-border" strokeWidth={1} />
                <text x={x(t)} y={AXIS_Y + 8} textAnchor="middle" className="fill-text-muted text-[11px]">{formatDuration(t)}</text>
              </g>
            ))}
            {/* Souls lead */}
            <text x={PAD_X} y={LEAD_TOP + 10} className="fill-text-muted text-[11px]">Souls lead: Team 1 above, Team 2 below</text>
            <line x1={PAD_X} x2={W - PAD_X} y1={midY} y2={midY} className="stroke-steel" strokeWidth={1} />
            <path d={leadArea} className="fill-primary/10" />
            {/* Neutral color: the lead is a difference between teams, not one team's line. */}
            <path d={leadPath} data-draw pathLength={1} fill="none" className="stroke-text" strokeWidth={2} strokeLinejoin="round" />
            {times.slice(1).map((t, i) => (
              <circle
                key={t}
                cx={x(t)}
                cy={y(lead[i + 1])}
                r={3}
                className={lead[i + 1] >= 0 ? 'fill-primary' : 'fill-text-muted'}
                onMouseEnter={() => show(t, `souls lead ${lead[i + 1] === 0 ? 'even' : `${lead[i + 1] > 0 ? 'Team 1' : 'Team 2'} +${formatCompact(Math.abs(lead[i + 1]))}`}`)}
                onMouseLeave={() => setHover(null)}
              />
            ))}
            {/* Dashed, so it fades in rather than using the draw animation (which owns stroke-dasharray). */}
            {playerPath && <path key={playerSlot} d={playerPath} fill="none" className="animate-awaken stroke-highlight" strokeDasharray="5 4" strokeWidth={1.5} />}

            {/* Event rows */}
            {(['objective', 'midboss', 'kills', 'purchases'] as const).map((row) => (
              <text key={row} x={PAD_X} y={ROWS[row] - 12} className="fill-text-muted text-[10px] uppercase">
                {row === 'objective' ? 'Objectives' : row === 'midboss' ? 'Mid-Boss' : row === 'kills' ? 'Kills (Team 1 above, Team 2 below)' : `Purchases · ${player?.label ?? ''}`}
              </text>
            ))}
            {events.filter((e) => e.kind === 'objective').map((e) =>
              marker(e, <rect x={x(e.t) - 5} y={ROWS.objective - 5} width={10} height={10} transform={`rotate(45 ${x(e.t)} ${ROWS.objective})`} className={cx(TEAM_FILL[e.side ?? 0], 'stroke-bg')} strokeWidth={1} />),
            )}
            {events.filter((e) => e.kind === 'midboss').map((e) => marker(e, <circle cx={x(e.t)} cy={ROWS.midboss} r={7} className={cx(TEAM_FILL[e.side ?? 0], 'stroke-bg')} strokeWidth={1} />))}
            {events.filter((e) => e.kind === 'kill').map((e) =>
              marker(e, <circle cx={x(e.t)} cy={ROWS.kills + (e.side === 0 ? -7 : 7)} r={3.5} className={cx(TEAM_FILL[e.side ?? 0], 'stroke-bg')} strokeWidth={0.5} />),
            )}
            {player && buys.map(({ b, e }) => marker(e, <rect x={x(b.t) - 4} y={ROWS.purchases - 4 - ((b.tier ?? 1) - 1) * 3} width={8} height={8} rx={1.5} className={cx('stroke-bg', b.soldAt ? 'fill-steel' : TEAM_FILL[player.side])} strokeWidth={0.5} />))}

            {/* Scrubber */}
            <g style={{ transform: `translateX(${x(scrubT) - x(0)}px)` }} className="transition-transform duration-(--dur-medium) ease-awaken motion-reduce:transition-none" aria-hidden="true">
              <line x1={x(0)} x2={x(0)} y1={LEAD_TOP} y2={AXIS_Y - 4} className="stroke-highlight" strokeWidth={1.5} />
              <circle cx={x(0)} cy={LEAD_TOP} r={4} className="fill-highlight" />
            </g>
          </svg>

          {hover && (
            <div role="tooltip" className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-sm border border-border-strong bg-surface-raised px-2.5 py-1.5 font-ui text-caption whitespace-nowrap text-text shadow-overlay animate-scale-in" style={{ left: `${hover.x}%` }}>
              {hover.text}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor={sliderId} className="text-eyebrow">Scrub through the match</label>
        <input
          id={sliderId}
          type="range"
          min={0}
          max={durationS}
          step={5}
          value={scrubT}
          onChange={(e) => setScrubT(Number(e.target.value))}
          aria-valuetext={formatDuration(scrubT)}
          className="w-full accent-[var(--color-primary)]"
        />
        <p role="status" aria-live="polite" className="text-sm text-text">
          <span className="font-semibold tabular">{formatDuration(scrubT)}</span>
          <span className="text-text-muted"> · Kills </span>
          <span className="tabular">Team 1 {killsSoFar[0]} – {killsSoFar[1]} Team 2</span>
          <span className="text-text-muted"> · Objectives </span>
          <span className="tabular">{objectivesSoFar[0]} – {objectivesSoFar[1]}</span>
          <span className="text-text-muted"> · Souls lead at {formatDuration(times[sample])}: </span>
          <span className="tabular">{lead[sample] === 0 ? 'even' : `${lead[sample] > 0 ? 'Team 1' : 'Team 2'} +${formatCompact(Math.abs(lead[sample]))}`}</span>
        </p>
        {selected && (
          <p className="animate-awaken rounded-sm border border-highlight/40 bg-highlight/5 px-3 py-2 text-sm text-text">
            Selected: <span className="font-semibold">{formatDuration(selected.t)}</span> · {selected.text}
          </p>
        )}
      </div>
    </InView>
  )
}

/* ── Events list ───────────────────────────────────────────────────── */

const KIND_LABEL: Record<EventKind, string> = { kill: 'Kills', objective: 'Objectives', midboss: 'Mid-Boss', purchase: 'Tier 3+ purchases' }

export function EventsList({ events }: { events: MatchEvent[] }) {
  const { selectedId, select } = useTimeline()
  const [kinds, setKinds] = useState<Set<EventKind>>(new Set(['objective', 'midboss', 'kill']))
  const visible = events.filter((e) => kinds.has(e.kind))
  const toggle = (kind: EventKind) =>
    setKinds((current) => {
      const next = new Set(current)
      if (next.has(kind)) next.delete(kind)
      else next.add(kind)
      return next
    })

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Event types" className="flex flex-wrap gap-1.5">
        {(Object.keys(KIND_LABEL) as EventKind[]).map((kind) => (
          <button
            key={kind}
            type="button"
            aria-pressed={kinds.has(kind)}
            onClick={() => toggle(kind)}
            className={cx(
              'inline-flex h-9 items-center rounded-pill border px-3.5 font-ui text-sm transition-colors duration-(--dur-fast) pointer-coarse:h-11',
              kinds.has(kind) ? 'border-primary bg-primary font-medium text-on-primary' : 'border-border-control text-text-muted hover:text-text',
            )}
          >
            {KIND_LABEL[kind]} <span className={cx('ml-1.5 text-caption tabular', kinds.has(kind) ? 'text-on-primary/75' : 'text-text-muted')}>{events.filter((e) => e.kind === kind).length}</span>
          </button>
        ))}
      </div>
      <ol className="max-h-[28rem] overflow-y-auto rounded-md border border-border bg-surface" aria-label="Match events">
        {visible.length === 0 && <li className="px-4 py-6 text-sm text-text-muted">No events of the selected types.</li>}
        {visible.map((e) => (
          <li key={e.id} className="border-b border-border/70 last:border-b-0">
            <button
              type="button"
              aria-pressed={selectedId === e.id}
              onClick={() => select(e)}
              className={cx(
                'flex w-full items-center gap-3 px-4 py-2 text-left text-sm transition-colors duration-(--dur-fast)',
                selectedId === e.id ? 'bg-surface-raised shadow-[inset_3px_0_0_var(--color-highlight)]' : 'hover:bg-surface-raised/50',
              )}
            >
              <span className="w-12 shrink-0 text-text-muted tabular">{formatDuration(e.t)}</span>
              <span aria-hidden="true" className={cx('size-2 shrink-0', e.kind === 'objective' ? 'rotate-45' : 'rounded-pill', e.side === 0 ? 'bg-primary' : 'bg-text-muted')} />
              {e.itemIcon && <ItemIcon name={e.itemIcon.name ?? 'Item'} src={e.itemIcon.icon} slot={e.itemIcon.slot} tier={e.itemIcon.tier} size={22} />}
              <span className="text-text">{e.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
