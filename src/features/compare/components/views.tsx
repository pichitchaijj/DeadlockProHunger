import Link from 'next/link'
import type { ReactNode } from 'react'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { Avatar } from '@/components/ui/Avatar'
import { cx } from '@/lib/cx'
import { formatCompact, formatInteger, formatPercent } from '@/lib/format'
import { BuildLabels, PatchNote } from '@/features/builds/components/BuildListCard'
import { ItemRow } from '@/features/builds/components/detail'
import { BuildStatsLine, PairingList } from '@/features/hero/components/parts'
import { capitalize } from '@/features/meta/model'
import type { getBuildCompare, getHeroCompare, getPlayerCompare } from '../loaders'
import { ratioDifference, type Rate } from '../model'
import { Block, DualSparkline, KeyDifferences, PairedBars, RateRow, SIDE_TEXT, ValueRow } from './parts'

type HeroData = NonNullable<Awaited<ReturnType<typeof getHeroCompare>>>
type BuildData = NonNullable<Awaited<ReturnType<typeof getBuildCompare>>>
type PlayerData = NonNullable<Awaited<ReturnType<typeof getPlayerCompare>>>

function VsHeader({ sides }: { sides: [ReactNode, ReactNode] }) {
  return (
    <div className="grid animate-awaken grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-surface p-(--spacing-card)">
      <div className="min-w-0">{sides[0]}</div>
      <span className="font-display text-title font-bold text-text-muted sm:text-display-m">VS</span>
      <div className="flex min-w-0 justify-end text-right">{sides[1]}</div>
    </div>
  )
}

function TwoColumns({ children }: { children: [ReactNode, ReactNode] }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>
}

// ── Heroes ───────────────────────────────────────────────────────────

export function HeroCompareView({ data }: { data: HeroData }) {
  const [A, B] = data.sides
  const names: [string, string] = [A.ctx.hero.name, B.ctx.hero.name]
  const sA = A.ctx.stats
  const sB = B.ctx.stats
  const pick = sA && sB ? ratioDifference('', sA.pickRate, sB.pickRate, (v) => formatPercent(v)) : null
  const ident = (side: typeof A, align: 'left' | 'right') => (
    <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3', align === 'right' ? 'items-end sm:flex-row-reverse' : 'items-start')}>
      <HeroPortrait name={side.ctx.hero.name} src={side.ctx.hero.iconUrl ?? undefined} size="md" />
      <div className="min-w-0">
        <Link href={`/heroes/${side.ctx.hero.slug}`} className={cx('block font-display text-title font-bold uppercase hover:text-highlight pointer-coarse:min-h-11 pointer-coarse:py-2.5', align === 'left' ? SIDE_TEXT.a : SIDE_TEXT.b)}>{side.ctx.hero.name}</Link>
        <span className="flex items-center gap-2">
          <span className="text-caption text-text-muted">{side.ctx.hero.role ? capitalize(side.ctx.hero.role) : ''}</span>
          {side.ctx.stats && <TierBadge tier={side.ctx.stats.tier} size="sm" />}
        </span>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-8">
      <VsHeader sides={[ident(A, 'left'), ident(B, 'right')]} />
      <KeyDifferences differences={data.differences} names={names} scope={data.scopeText} />

      <Block title="At a glance" description={data.scopeText}>
        <div className="flex flex-col gap-3">
          <RateRow label="Win rate" a={sA} b={sB} />
          <ValueRow label="Pick rate" a={sA ? formatPercent(sA.pickRate) : '—'} b={sB ? formatPercent(sB.pickRate) : '—'} highlight={pick?.side ?? null} />
          <ValueRow
            label="Trend (7 days)"
            a={sA?.trend ? <TrendBadge direction={sA.trend.direction} delta={sA.trend.delta} /> : 'Not enough data'}
            b={sB?.trend ? <TrendBadge direction={sB.trend.direction} delta={sB.trend.delta} /> : 'Not enough data'}
          />
          <ValueRow
            label="Lane vs each other"
            a={data.lane ? `${formatPercent(data.lane.winRate)} wins` : 'No lane data'}
            b={data.lane ? `${formatPercent(1 - data.lane.winRate)} wins` : 'No lane data'}
            highlight={data.lane && data.lane.sample !== 'low' ? (data.lane.interval.low > 0.5 ? 'a' : data.lane.interval.high < 0.5 ? 'b' : null) : null}
          />
          <p className="text-caption text-text-muted">
            {data.lane ? `${formatInteger(data.lane.matches)} lane matchups between them.` : ''}{' '}
            {data.together ? `On the same team: ${formatPercent(data.together.winRate)} over ${formatInteger(data.together.matches)} matches.` : 'Not enough matches together on one team.'}
          </p>
        </div>
      </Block>

      <TwoColumns>
        <Block title="Daily win rate"><DualSparkline a={sA?.history ?? []} b={sB?.history ?? []} names={names} /></Block>
        <Block title="Game phase" description="Win rate by match length."><PairedBars groups={data.lengthGroups} names={names} /></Block>
      </TwoColumns>

      <TwoColumns>
        <Block title="Rank performance" description="By match average rank (matches without one aren’t counted)."><PairedBars groups={data.rankGroups} names={names} /></Block>
        <Block title="Build performance" description="Each hero’s most-played tracked build.">
          <div className="flex flex-col gap-3">
            {[A, B].map((side, i) => (
              <div key={side.ctx.hero.id} className="rounded-sm border border-border bg-surface-sunken p-3">
                <p className={cx('text-caption font-semibold', i === 0 ? SIDE_TEXT.a : SIDE_TEXT.b)}>{side.ctx.hero.name}</p>
                {side.overview.topBuild ? (
                  <>
                    <p className="font-ui text-sm font-semibold text-text">{side.overview.topBuild.name}</p>
                    <BuildStatsLine build={side.overview.topBuild} />
                  </>
                ) : (
                  <p className="text-sm text-text-muted">No tracked build.</p>
                )}
              </div>
            ))}
          </div>
        </Block>
      </TwoColumns>

      <TwoColumns>
        {[A, B].map((side) => (
          <Block key={side.ctx.hero.id} title={`${side.ctx.hero.name}: matchups`} description="Best and worst lane opponents (100+ games).">
            <PairingList items={side.overview.best} empty="Not enough lane data." />
            <PairingList items={side.overview.worst} empty="Not enough lane data." />
          </Block>
        )) as [ReactNode, ReactNode]}
      </TwoColumns>

      <TwoColumns>
        {[A, B].map((side) => (
          <Block key={side.ctx.hero.id} title={`${side.ctx.hero.name}: synergy`} description="Strongest teammates (100+ matches together).">
            <PairingList items={side.overview.synergies} empty="Not enough data." />
          </Block>
        )) as [ReactNode, ReactNode]}
      </TwoColumns>
    </div>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export function BuildCompareView({ data }: { data: BuildData }) {
  const [A, B] = data.sides
  const names: [string, string] = [A.build.name, B.build.name]
  const ident = (d: typeof A, side: 'a' | 'b') => (
    <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3', side === 'b' ? 'items-end sm:flex-row-reverse' : 'items-start')}>
      <HeroPortrait name={d.hero.name} src={d.hero.iconUrl ?? undefined} size="md" />
      <div className="min-w-0">
        <Link href={`/builds/${d.hero.slug}/${d.build.id}`} className={cx('block truncate font-ui text-title font-semibold hover:text-highlight pointer-coarse:py-2.5', SIDE_TEXT[side])}>{d.build.name}</Link>
        <span className="text-caption text-text-muted">{d.hero.name}{d.build.authorName ? ` · ${d.build.authorName}` : ''}</span>
      </div>
    </div>
  )
  const fav = ratioDifference('', A.build.weeklyFavorites ?? 0, B.build.weeklyFavorites ?? 0, (v) => formatCompact(v), 2)

  return (
    <div className="flex flex-col gap-8">
      <VsHeader sides={[ident(A, 'a'), ident(B, 'b')]} />
      <KeyDifferences differences={data.differences} names={names} scope={A.scopeText} />
      {!data.sameHero && <p className="text-sm text-text-muted">These builds are for different heroes, so their win rates also reflect the heroes. Each is compared with its own hero instead.</p>}

      <Block title="At a glance" description={A.scopeText}>
        <div className="flex flex-col gap-3">
          <RateRow label="Win rate" a={A.stats as Rate | null} b={B.stats as Rate | null} />
          <ValueRow
            label="vs own hero"
            a={A.stats && A.heroWinRate !== null ? `${A.stats.winRate >= A.heroWinRate ? '+' : '−'}${(Math.abs(A.stats.winRate - A.heroWinRate) * 100).toFixed(1)}pp vs ${A.hero.name}` : '—'}
            b={B.stats && B.heroWinRate !== null ? `${B.stats.winRate >= B.heroWinRate ? '+' : '−'}${(Math.abs(B.stats.winRate - B.heroWinRate) * 100).toFixed(1)}pp vs ${B.hero.name}` : '—'}
          />
          <ValueRow label="Favorites (week)" a={A.build.weeklyFavorites ? formatInteger(A.build.weeklyFavorites) : '—'} b={B.build.weeklyFavorites ? formatInteger(B.build.weeklyFavorites) : '—'} highlight={fav?.side ?? null} />
          <ValueRow label="Patch" a={<PatchNote status={A.build.patch} updatedAt={A.build.updatedAt} />} b={<PatchNote status={B.build.patch} updatedAt={B.build.updatedAt} />} />
          <ValueRow label="Labels" a={A.labels.length ? <BuildLabels labels={A.labels} /> : '—'} b={B.labels.length ? <BuildLabels labels={B.labels} /> : '—'} />
        </div>
      </Block>

      <Block title="Items" description={`${data.shared.length} shared · ${data.onlyA.length} only in ${A.build.name} · ${data.onlyB.length} only in ${B.build.name}`}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2"><span className="text-eyebrow">Shared</span>{data.shared.length ? <ItemRow items={data.shared} size={32} /> : <span className="text-sm text-text-muted">None</span>}</div>
          <div className="flex flex-col gap-2"><span className={cx('text-eyebrow', SIDE_TEXT.a)}>Only {A.build.name}</span>{data.onlyA.length ? <ItemRow items={data.onlyA} size={32} /> : <span className="text-sm text-text-muted">None</span>}</div>
          <div className="flex flex-col gap-2"><span className={cx('text-eyebrow', SIDE_TEXT.b)}>Only {B.build.name}</span>{data.onlyB.length ? <ItemRow items={data.onlyB} size={32} /> : <span className="text-sm text-text-muted">None</span>}</div>
        </div>
      </Block>

      <Block title="Early · Core · Late" description="By when each hero’s players actually buy these items on average.">
        <TwoColumns>
          {[A, B].map((d, i) => (
            <div key={d.build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
              <span className={cx('text-caption font-semibold', i === 0 ? SIDE_TEXT.a : SIDE_TEXT.b)}>{d.build.name}</span>
              {d.phases.phases.map((p) => (
                <div key={p.key} className="flex flex-col gap-1">
                  <span className="text-eyebrow">{p.label}</span>
                  {p.items.length ? <ItemRow items={p.items} size={28} /> : <span className="text-caption text-text-muted">—</span>}
                </div>
              ))}
            </div>
          )) as [ReactNode, ReactNode]}
        </TwoColumns>
      </Block>
    </div>
  )
}

// ── Players ──────────────────────────────────────────────────────────

export function PlayerCompareView({ data }: { data: PlayerData }) {
  const [A, B] = data.sides
  const names = [...data.names] as [string, string]
  const ident = (p: typeof A, side: 'a' | 'b', name: string) => (
    <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3', side === 'b' ? 'items-end sm:flex-row-reverse' : 'items-start')}>
      <Avatar name={name} src={p.avatar ?? undefined} />
      <div className="min-w-0">
        <Link href={`/players/${p.accountId}`} className={cx('block truncate font-ui text-title font-semibold hover:text-highlight pointer-coarse:py-2.5', SIDE_TEXT[side])}>{name}</Link>
        <span className="text-caption text-text-muted">{p.rank?.label ?? 'No current rank'}</span>
      </div>
    </div>
  )
  const rankWinner = A.rank && B.rank && A.rank.badge !== B.rank.badge ? (A.rank.badge > B.rank.badge ? 'a' : 'b') : null

  return (
    <div className="flex flex-col gap-8">
      <VsHeader sides={[ident(A, 'a', names[0]), ident(B, 'b', names[1])]} />
      <KeyDifferences differences={data.differences} names={names} scope="their stored normal-mode matches" />

      <Block title="At a glance" description="Stored normal-mode matches. Results, not skill ratings.">
        <div className="flex flex-col gap-3">
          <RateRow label="Win rate" a={A.history.overall} b={B.history.overall} scale="player" />
          <RateRow label="Last 20" a={A.history.recent} b={B.history.recent} scale="player" />
          <RateRow label="Ranked" a={A.history.ranked} b={B.history.ranked} scale="player" />
          <ValueRow label="Current rank" a={A.rank?.label ?? '—'} b={B.rank?.label ?? '—'} highlight={rankWinner} />
          <ValueRow label="Most played" a={A.pool[0] ? `${A.pool[0].name} (${formatInteger(A.pool[0].matches)})` : '—'} b={B.pool[0] ? `${B.pool[0].name} (${formatInteger(B.pool[0].matches)})` : '—'} />
        </div>
      </Block>

      <TwoColumns>
        <Block title="Shared heroes" description="Heroes both have played; most-played first.">
          {data.sharedHeroes.length ? (
            <PairedBars groups={data.sharedHeroes.map((s) => ({ key: String(s.hero.id), label: s.hero.name, a: s.a, b: s.b }))} names={names} />
          ) : (
            <p className="text-sm text-text-muted">No hero in common.</p>
          )}
        </Block>
        <Block title="Win rate trend" description="Per block of 20 matches, oldest → newest.">
          <DualSparkline a={A.history.trend.map((t) => t.winRate)} b={B.history.trend.map((t) => t.winRate)} names={names} />
        </Block>
      </TwoColumns>

      <Block title="Head to head" description="From each other’s top-10 teammate and opponent lists.">
        <p className="text-sm text-text">
          {data.asMates
            ? `Teammates in ${formatInteger(data.asMates.matches)} matches; ${names[0]} won ${formatPercent(data.asMates.winRate)} of them.`
            : 'Not among each other’s most frequent teammates.'}{' '}
          {data.asOpponents
            ? `Opponents in ${formatInteger(data.asOpponents.matches)} matches; ${names[0]} won ${formatPercent(data.asOpponents.winRate)}.`
            : 'Not among each other’s most frequent opponents.'}
        </p>
      </Block>
    </div>
  )
}
