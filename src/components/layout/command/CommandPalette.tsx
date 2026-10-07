'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react'
import { primaryNav, secondaryNav, type NavItem } from '@/config/navigation'
import { cx } from '@/lib/cx'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { Avatar } from '@/components/ui/Avatar'
import { useModalDialog } from '@/components/ui/Dialog'
import { ArrowRightIcon, SearchIcon } from '@/components/ui/icons'
import { MIN_QUERY, matchScore, type SearchGroup, type SearchResult } from '@/features/search/model'

type Row = SearchResult & { later?: boolean }
type Group = { id: string; label: string; rows: Row[] }

const toRow = (item: NavItem): Row => ({
  id: `nav-${item.href}`,
  label: item.label,
  description: item.description,
  kind: 'internal',
  href: item.href,
  later: item.phase === 'later',
})
const NAV_ROWS = [...primaryNav, ...secondaryNav].map(toRow)

/** Pages and tools match on label first, then description. Instant and client-side. */
function pageRows(q: string): Row[] {
  if (!q) return NAV_ROWS
  return NAV_ROWS.map((r) => ({ r, s: matchScore(r.label, q) >= 0 ? matchScore(r.label, q) : matchScore(r.description, q) >= 0 ? 9 : -1 }))
    .filter(({ s }) => s >= 0)
    .sort((a, b) => a.s - b.s)
    .map(({ r }) => r)
}

type Remote = { status: 'idle' | 'loading' | 'done' | 'error' | 'limited'; groups: SearchGroup[]; partial: boolean }
type Answer = { groups: SearchGroup[]; partial: boolean; error?: boolean; limited?: boolean }

/**
 * Debounced, cancellable fetch of /api/search with a per-session cache (typing back is instant).
 * Status is derived during render; the effect only talks to the network.
 */
function useRemoteSearch(query: string): Remote {
  const [answers, setAnswers] = useState<Map<string, Answer>>(() => new Map())
  const key = query.trim().toLowerCase()
  const short = key.length < MIN_QUERY
  const answer = short ? undefined : answers.get(key)

  useEffect(() => {
    if (short || answer) return
    const controller = new AbortController()
    const save = (value: Answer) => {
      setAnswers((prev) => new Map(prev).set(key, value))
      // Partial or failed answers expire after 10s so the same query retries, without hammering a dead source.
      if (value.partial || value.error) {
        window.setTimeout(() => setAnswers((prev) => {
          const next = new Map(prev)
          next.delete(key)
          return next
        }), 10_000)
      }
    }
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(key)}`, { signal: controller.signal })
        if (res.status === 429) return save({ groups: [], partial: true, error: true, limited: true })
        if (!res.ok) throw new Error(String(res.status))
        save((await res.json()) as Answer)
      } catch {
        if (!controller.signal.aborted) save({ groups: [], partial: true, error: true })
      }
    }, 200)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [key, short, answer])

  if (short) return { status: 'idle', groups: [], partial: false }
  if (!answer) return { status: 'loading', groups: [], partial: false }
  return { status: answer.limited ? 'limited' : answer.error ? 'error' : 'done', groups: answer.groups, partial: answer.partial }
}

const selectable = (r: Row) => r.kind !== 'info'

/**
 * Ctrl/⌘+K global search.
 * Groups: Heroes, Builds, Players, Matches, Items, Patches (server, cached) and Pages & tools (instant).
 * ARIA combobox + listbox: ↑/↓ move, Enter opens, Escape closes, Home/End jump.
 * Opens with a short opacity + scale (FAST); reduced motion shows it immediately.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter()
  const dialogRef = useModalDialog(open)
  const listboxId = useId()
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const remote = useRemoteSearch(query)

  const groups = useMemo<Group[]>(() => {
    const list: Group[] = remote.groups.map((g) => ({ id: g.id, label: g.label, rows: g.results }))
    const pages = pageRows(query.trim())
    if (pages.length) list.push({ id: 'pages', label: query.trim() ? 'Pages & tools' : 'Go to', rows: pages })
    return list
  }, [remote.groups, query])
  const flat = useMemo(() => groups.flatMap((g) => g.rows), [groups])
  const enabled = useMemo(() => flat.filter(selectable), [flat])
  // Keep the highlighted row when results refresh; otherwise fall back to the first selectable one.
  const active = enabled.find((r) => r.id === activeId) ?? enabled[0]

  function close() {
    setQuery('')
    setActiveId(null)
    onClose()
  }

  function run(row: Row | undefined) {
    if (!row || !row.href || !selectable(row)) return
    close()
    if (row.kind === 'external') window.open(row.href, '_blank', 'noopener,noreferrer')
    else router.push(row.href)
  }

  function move(step: 1 | -1) {
    if (!enabled.length) return
    const i = active ? enabled.indexOf(active) : -1
    setActiveId(enabled[(i + step + enabled.length) % enabled.length].id)
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const actions: Record<string, () => void> = {
      ArrowDown: () => move(1),
      ArrowUp: () => move(-1),
      Home: () => setActiveId(enabled[0]?.id ?? null),
      End: () => setActiveId(enabled.at(-1)?.id ?? null),
      Enter: () => run(active),
    }
    const action = actions[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }

  // Keep the active option visible while arrowing through a long list.
  useEffect(() => {
    if (active) document.getElementById(optionId(active.id))?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const q = query.trim()
  const status =
    q.length < MIN_QUERY
      ? ''
      : remote.status === 'loading'
        ? 'Searching…'
        : remote.status === 'error'
          ? 'Data search didn’t respond. Pages and tools still work.'
          : remote.status === 'limited'
            ? 'Too many searches in a short time. Wait a moment; pages and tools still work.'
            :`${flat.length} result${flat.length === 1 ? '' : 's'}${remote.partial ? ' (some sources didn’t respond)' : ''}`

  return (
    // Backdrop click is a pointer convenience; Escape (onCancel) is the keyboard equivalent.
    // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialogRef}
      aria-label="Search"
      onCancel={(event) => {
        event.preventDefault()
        close()
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close()
      }}
      className={cx(
        'mx-auto mt-[10vh] w-[min(42rem,calc(100vw-2rem))] max-h-[min(38rem,80dvh)] flex-col overflow-hidden open:flex',
        'rounded-md border border-border-strong bg-surface p-0 text-text shadow-overlay animate-scale-in',
        'backdrop:bg-bg/80 backdrop:backdrop-blur-[2px]',
      )}
    >
      <div className="flex items-center gap-3 border-b border-border px-4">
        <SearchIcon className="shrink-0 text-text-muted" />
        {/* showModal() focuses this input (the first focusable element) every time the palette opens. */}
        <input
          type="text"
          role="combobox"
          aria-label="Search heroes, builds, players, matches, items, patches and tools"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={active ? optionId(active.id) : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveId(null)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search heroes, builds, players, match IDs…"
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className="h-14 min-w-0 flex-1 bg-transparent font-ui text-body text-text placeholder:text-text-muted/80 focus:outline-none"
        />
        {remote.status === 'loading' && <span aria-hidden="true" className="size-2 shrink-0 rounded-pill bg-primary/70 animate-live-pulse" />}
        <kbd className="hidden rounded-xs border border-border-strong px-1.5 py-0.5 font-ui text-caption text-text-muted sm:inline">Esc</kbd>
      </div>

      <p role="status" className="sr-only">{status}</p>

      <div id={listboxId} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-2">
        {flat.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-text-muted">
            {remote.status === 'loading' || remote.status === 'error' || remote.status === 'limited'
              ? status
              : `Nothing matches “${q}”. Try a hero, item, player name or a match ID.`}
          </p>
        )}
        {groups.map((group) => (
          <div key={group.id} role="group" aria-label={group.label} className="mb-2 last:mb-0">
            <p aria-hidden="true" className="px-3 pt-2 pb-1 text-eyebrow">{group.label}</p>
            {group.rows.map((row) => {
              const selected = row.id === active?.id
              const info = !selectable(row)
              return (
                // Combobox pattern: focus stays on the input and options are driven via aria-activedescendant,
                // so options are intentionally not focusable; click is the pointer path.
                // oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/interactive-supports-focus
                <div
                  key={row.id}
                  id={optionId(row.id)}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={info || undefined}
                  onPointerMove={() => !info && setActiveId(row.id)}
                  onClick={() => run(row)}
                  className={cx(
                    'flex min-h-12 items-center gap-3 rounded-sm px-3 py-1.5',
                    info ? 'cursor-default' : 'cursor-pointer',
                    selected && 'bg-surface-raised shadow-[inset_2px_0_0_var(--color-primary)]',
                  )}
                >
                  <RowIcon row={row} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className={cx('truncate font-ui text-sm font-semibold', selected ? 'text-highlight' : 'text-text')}>{row.label}</span>
                      {row.later && <Marker>Later</Marker>}
                      {row.kind === 'external' && <Marker>Forum ↗</Marker>}
                    </span>
                    <span className="block truncate text-caption text-text-muted">{row.description}</span>
                  </span>
                  {selected && <ArrowRightIcon size={16} className="shrink-0 text-primary" />}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2.5 text-caption text-text-muted">
        <span><Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate</span>
        <span><Kbd>Enter</Kbd> open</span>
        <span><Kbd>Esc</Kbd> close</span>
      </footer>
    </dialog>
  )
}

/** Result ids can contain characters that aren't valid in an id reference; keep them simple. */
function optionId(id: string) {
  return `search-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

function RowIcon({ row }: { row: Row }) {
  const icon = row.icon
  if (!icon) return <span aria-hidden="true" className="size-8 shrink-0 rounded-sm border border-border bg-surface-sunken" />
  if (icon.type === 'hero') return <HeroPortrait name={icon.name} src={icon.src ?? undefined} size="sm" />
  if (icon.type === 'item') return <ItemIcon name={icon.name} src={icon.src} slot={icon.slot ?? null} tier={icon.tier ?? null} size={32} />
  return <Avatar name={icon.name} src={icon.src ?? undefined} size="sm" />
}

function Marker({ children }: { children: string }) {
  return <span className="shrink-0 rounded-xs border border-border-strong px-1 text-[0.625rem] font-semibold tracking-wide text-text-muted uppercase">{children}</span>
}

function Kbd({ children }: { children: string }) {
  return <kbd className="rounded-xs border border-border-strong px-1 py-px font-ui text-[0.6875rem] text-text">{children}</kbd>
}
