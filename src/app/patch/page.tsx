import type { Metadata } from 'next'
import Link from 'next/link'
import { DataNotice } from '@/components/data/DataState'
import { PageContainer } from '@/components/layout/PageContainer'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { cardClasses } from '@/components/ui/Card'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { EmptyState } from '@/components/ui/States'
import { cx } from '@/lib/cx'
import { attempt } from '@/lib/deadlock/errors'
import { DirectionBadge } from '@/features/patches/components/indicators'
import { patchList, patchNotes } from '@/features/patches/loaders'
import { noteCounts, type ChangeCounts, type PatchSummary } from '@/features/patches/model'
import { patchHref, patchListHref } from '@/features/patches/query'

export const metadata: Metadata = {
  title: 'Patch',
  description: 'Deadlock patches: what changed in the game data, the official notes, and hero and item statistics before and after each patch.',
}

const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default async function PatchListPage() {
  const load = await attempt('[patch] list failed', patchList())

  return (
    <PageContainer className="flex flex-col gap-(--spacing-section)">
      <SectionHeader
        as="h1"
        eyebrow="Patch"
        title="Patch notes & what changed"
        description="Every patch with its game-data changes, official notes, and what hero and item statistics did around it."
      />
      {!load.ok ? (
        <DataNotice error={load.kind} what="Patches" action={<ButtonLink href={patchListHref()} variant="secondary" size="sm">Try again</ButtonLink>} />
      ) : load.value.length === 0 ? (
        <EmptyState title="No patches found" description="The patch feed returned no dated patches." />
      ) : (
        <PatchListContent patches={load.value} />
      )}
    </PageContainer>
  )
}

async function PatchListContent({ patches }: { patches: PatchSummary[] }) {
  // Notes are already in the (cached) feed; parsing is local, so counts cost no extra requests.
  const counts = await Promise.all(patches.map((p) => patchNotes(p).then((n) => (n ? noteCounts(n) : null)).catch(() => null)))
  const [latest, ...rest] = patches

  return (
    <>
      <section aria-labelledby="latest-title" className={cx(cardClasses({ accent: 'featured' }), 'flex flex-col gap-4 p-(--spacing-card)')}>
        <p className="text-eyebrow">Latest patch · {DATE.format(latest.day * 1000)}</p>
        <h2 id="latest-title" className="font-display text-display-m font-bold text-text uppercase">
          {latest.title}
        </h2>
        <Counts counts={counts[0]} />
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={patchHref(latest.id)} size="sm">
            What changed
          </ButtonLink>
          {rest[0] && (
            <ButtonLink href={`/patch/compare?a=${rest[0].id}&b=${latest.id}`} variant="secondary" size="sm">
              Compare with previous patch
            </ButtonLink>
          )}
        </div>
      </section>

      <section aria-labelledby="compare-title" className="flex flex-col gap-4 rounded-md border border-border bg-surface/60 p-(--spacing-card)">
        <h2 id="compare-title" className="font-ui text-title font-semibold text-text">
          Compare two patches
        </h2>
        {/* A plain GET form: works without JavaScript. */}
        <form action="/patch/compare" method="get" className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          {(
            [
              ['a', 'Patch A (older)', rest[0]?.id ?? latest.id],
              ['b', 'Patch B (newer)', latest.id],
            ] as const
          ).map(([name, label, value]) => (
            <label key={name} className="flex min-w-0 flex-col gap-2">
              <span className="text-eyebrow">{label}</span>
              <select
                name={name}
                defaultValue={value}
                className="h-11 min-w-0 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary"
              >
                {patches.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.id} · {p.title}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <Button type="submit">Compare</Button>
        </form>
      </section>

      <section aria-labelledby="all-title" className="flex flex-col gap-4">
        <h2 id="all-title" className="font-display text-display-m font-bold text-text uppercase">
          All patches
        </h2>
        <ol className="flex flex-col gap-2.5">
          {patches.map((p, i) => (
            <Reveal as="li" key={p.id} index={Math.min(i, 8)}>
              <Link href={patchHref(p.id)} className={cx(cardClasses({ interactive: true }), 'group flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:gap-6')}>
                <time dateTime={p.id} className="w-28 shrink-0 font-ui text-sm text-text-muted tabular">
                  {DATE.format(p.day * 1000)}
                </time>
                <span className="min-w-0 flex-1">
                  <span className="block font-ui font-semibold text-text group-hover:text-highlight">{p.title}</span>
                  <Counts counts={counts[i]} compact />
                </span>
                <Badge tone={p.notesHtml ? 'primary' : 'neutral'}>{p.notesHtml ? 'Notes included' : 'Link to notes'}</Badge>
              </Link>
            </Reveal>
          ))}
        </ol>
        <p className="text-caption text-text-muted">
          Patches come from the official changelog and Steam update posts in the data feed ({patches.length} patches). Every patch page compares the game data of the builds around
          its date.
        </p>
      </section>
    </>
  )
}

function Counts({ counts, compact = false }: { counts: ChangeCounts | null; compact?: boolean }) {
  if (!counts) return <span className="block text-caption text-text-muted">Open for game-data changes and statistics.</span>
  return (
    <span className={cx('flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted', compact && 'mt-1 text-caption')}>
      <span>
        {counts.heroes} heroes · {counts.abilities} abilities · {counts.items} items (official notes)
      </span>
      {!compact && (
        <span className="flex flex-wrap items-center gap-2">
          <DirectionBadge mark="buff" /> {counts.buffs}
          <DirectionBadge mark="nerf" /> {counts.nerfs}
          <DirectionBadge mark="changed" /> {counts.changed}
        </span>
      )}
    </span>
  )
}
