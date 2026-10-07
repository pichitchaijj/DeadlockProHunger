import Link from 'next/link'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { cardClasses } from '@/components/ui/Card'
import { Table, type TableColumn } from '@/components/ui/Table'
import { cx } from '@/lib/cx'
import { formatInteger } from '@/lib/format'
import type { HeroMovement, ItemMovement } from '../loaders'
import type { Mark } from '../model'
import { DirectionBadge, PointDelta, RateChange, VerdictBadge } from './indicators'

type Row = HeroMovement | ItemMovement

const isHero = (r: Row): r is HeroMovement => 'iconUrl' in r

function Subject({ row }: { row: Row }) {
  return (
    <Link href={isHero(row) ? `/heroes/${row.slug}` : `/items/${row.slug}`} className="group flex min-w-0 items-center gap-3 pointer-coarse:min-h-11">
      {isHero(row) ? (
        <HeroPortrait name={row.name} src={row.iconUrl ?? undefined} size="sm" decorative />
      ) : (
        <ItemIcon name={row.name} src={row.icon} slot={row.slot} tier={row.tier} size={32} decorative />
      )}
      <span className="truncate font-semibold text-text group-hover:text-highlight">{row.name}</span>
    </Link>
  )
}

/** Top clear risers and fallers (verdict higher / lower only), with what the patch did to each. */
export function MostImpacted({ up, down, marks, labels }: { up: Row[]; down: Row[]; marks: Map<number, Mark>; labels: { a: string; b: string } }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {(
        [
          ['Win rate up', up, 'No hero’s win rate rose beyond normal variation.'],
          ['Win rate down', down, 'No hero’s win rate fell beyond normal variation.'],
        ] as const
      ).map(([title, rows, empty]) => (
        <section key={title} className={cx(cardClasses({}), 'flex flex-col gap-3 p-4')}>
          <h3 className="text-eyebrow">{title}</h3>
          {rows.length === 0 ? (
            <p className="text-sm text-text-muted">{empty}</p>
          ) : (
            <ol className="flex flex-col gap-2">
              {rows.map((r, i) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm bg-surface-sunken px-2 py-1.5">
                  <span className="w-4 text-caption text-text-muted tabular">{i + 1}</span>
                  <Subject row={r} />
                  {marks.has(r.id) && <DirectionBadge mark={marks.get(r.id)!} />}
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-2 text-sm">
                    <RateChange before={r.before?.winRate ?? null} after={r.after?.winRate ?? null} />
                    <PointDelta delta={r.winDelta} />
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-caption text-text-muted">
            {labels.a} → {labels.b}. Changed-in-patch markers come from the game data.
          </p>
        </section>
      ))}
    </div>
  )
}

/** Win rate and pick / buy rate in two periods, per hero or item. Table on desktop, cards on phones. */
export function MovementTable({ rows, rateLabel, marks, caption }: { rows: Row[]; rateLabel: string; marks: Map<number, Mark>; caption: string }) {
  const columns: TableColumn<Row>[] = [
    { key: 'name', header: 'Name', cell: (r) => <Subject row={r} /> },
    { key: 'patch', header: 'In patch', cell: (r) => (marks.has(r.id) ? <DirectionBadge mark={marks.get(r.id)!} /> : <span className="text-text-muted">—</span>) },
    { key: 'wr', header: 'Win rate', numeric: true, cell: (r) => <RateChange before={r.before?.winRate ?? null} after={r.after?.winRate ?? null} /> },
    { key: 'delta', header: 'Change', numeric: true, cell: (r) => <PointDelta delta={r.winDelta} muted={r.verdict !== 'higher' && r.verdict !== 'lower'} /> },
    { key: 'verdict', header: 'Clear change?', align: 'end', cell: (r) => <VerdictBadge verdict={r.verdict} /> },
    { key: 'rate', header: rateLabel, numeric: true, cell: (r) => <RateChange before={r.rateBefore} after={r.rateAfter} /> },
    { key: 'n', header: 'Matches (after)', numeric: true, cell: (r) => (r.after ? <ConfidenceBadge sampleSize={r.after.matches} /> : '—') },
  ]
  return (
    <>
      <Table caption={caption} captionHidden columns={columns} rows={rows} rowKey={(r) => String(r.id)} mobile="none" />
      <ol className="flex flex-col gap-2.5 md:hidden">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-border bg-surface p-3 shadow-card">
            <div className="flex items-center gap-3">
              <Subject row={r} />
              {marks.has(r.id) && <DirectionBadge mark={marks.get(r.id)!} className="ml-auto" />}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm">
              <div>
                <dt className="text-caption text-text-muted">Win rate</dt>
                <dd className="flex flex-wrap items-center gap-2">
                  <RateChange before={r.before?.winRate ?? null} after={r.after?.winRate ?? null} />
                  <PointDelta delta={r.winDelta} muted={r.verdict !== 'higher' && r.verdict !== 'lower'} />
                </dd>
              </div>
              <div>
                <dt className="text-caption text-text-muted">{rateLabel}</dt>
                <dd>
                  <RateChange before={r.rateBefore} after={r.rateAfter} />
                </dd>
              </div>
            </dl>
            <p className="mt-2 flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={r.verdict} />
              {r.after && <span className="text-caption text-text-muted">{formatInteger(r.after.matches)} matches after</span>}
            </p>
          </li>
        ))}
      </ol>
    </>
  )
}
