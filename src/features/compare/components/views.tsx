import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { TierBadge } from '@/components/data/TierBadge'
import { TrendBadge } from '@/components/data/TrendBadge'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { Avatar } from '@/components/ui/Avatar'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import { BuildLabels, buildLabelText, PatchNote, patchLabels } from '@/features/builds/components/BuildListCard'
import { ItemRow } from '@/features/builds/components/detail'
import { BuildStatsLine, PairingList } from '@/features/hero/components/parts'
import { capitalize } from '@/features/meta/model'
import type { getBuildCompare, getHeroCompare, getPlayerCompare } from '../loaders'
import { ratioDifference, type Rate } from '../model'
import { Block, DualSparkline, KeyDifferences, PairedBars, RateRow, SIDE_TEXT, ValueRow } from './parts'
import { useScopeWording } from '@/components/data/scopeWording'

type HeroData = NonNullable<Awaited<ReturnType<typeof getHeroCompare>>>
type BuildData = NonNullable<Awaited<ReturnType<typeof getBuildCompare>>>
type PlayerData = NonNullable<Awaited<ReturnType<typeof getPlayerCompare>>>

/*
 * Compare views, worded from the Compare catalog (compare.*), reusing the Heroes and Builds catalogs for
 * the parts those pages share (length groups, build stats, build labels, patch notes, phases). Names,
 * ranks, roles and every number are data.
 */

function VsHeader({ sides }: { sides: [ReactNode, ReactNode] }) {
  const t = useTranslations('compare.parts')
  return (
    <div className="grid animate-awaken grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-surface p-(--spacing-card)">
      <div className="min-w-0">{sides[0]}</div>
      <span className="font-display text-title font-bold text-text-muted sm:text-display-m">{t('vs')}</span>
      <div className="flex min-w-0 justify-end text-right">{sides[1]}</div>
    </div>
  )
}

function TwoColumns({ children }: { children: [ReactNode, ReactNode] }) {
  return <div className="grid gap-4 md:grid-cols-2">{children}</div>
}

// ── Heroes ───────────────────────────────────────────────────────────

export function HeroCompareView({ data }: { data: HeroData }) {
  const t = useTranslations('compare.heroes')
  const scopeText = useScopeWording().scope(data.scope)
  const heroes = useTranslations('heroes.parts')
  const locale = useLocale()
  const [A, B] = data.sides
  const names: [string, string] = [A.ctx.hero.name, B.ctx.hero.name]
  const sA = A.ctx.stats
  const sB = B.ctx.stats
  const pick = sA && sB ? ratioDifference('pickRate', sA.pickRate, sB.pickRate) : null
  // Match-length groups are keyed short/standard/long; rank-band labels are rank names (data).
  const lengthGroups = data.lengthGroups.map((g) => ({ ...g, label: heroes(`lengths.${g.key}` as 'lengths.short') }))
  const buildStats = { noMatches: heroes('buildNoMatches'), winRate: heroes('buildWinRate') }
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
      <KeyDifferences differences={data.differences} names={names} scope={scopeText} />

      <Block title={t('atGlance')} description={scopeText}>
        <div className="flex flex-col gap-3">
          <RateRow label={t('winRate')} a={sA} b={sB} />
          <ValueRow label={t('pickRate')} a={sA ? formatPercent(sA.pickRate) : '—'} b={sB ? formatPercent(sB.pickRate) : '—'} highlight={pick?.side ?? null} />
          <ValueRow
            label={t('trend')}
            a={sA?.trend ? <TrendBadge direction={sA.trend.direction} delta={sA.trend.delta} /> : t('notEnoughData')}
            b={sB?.trend ? <TrendBadge direction={sB.trend.direction} delta={sB.trend.delta} /> : t('notEnoughData')}
          />
          <ValueRow
            label={t('lane')}
            a={data.lane ? t('laneWins', { rate: formatPercent(data.lane.winRate) }) : t('noLane')}
            b={data.lane ? t('laneWins', { rate: formatPercent(1 - data.lane.winRate) }) : t('noLane')}
            highlight={data.lane && data.lane.sample !== 'low' ? (data.lane.interval.low > 0.5 ? 'a' : data.lane.interval.high < 0.5 ? 'b' : null) : null}
          />
          <p className="text-caption text-text-muted">
            {data.lane ? t('laneMatchups', { count: formatInteger(data.lane.matches, locale) }) : ''}{' '}
            {data.together ? t('together', { rate: formatPercent(data.together.winRate), count: formatInteger(data.together.matches, locale) }) : t('notTogether')}
          </p>
        </div>
      </Block>

      <TwoColumns>
        <Block title={t('daily')}><DualSparkline a={sA?.history ?? []} b={sB?.history ?? []} names={names} /></Block>
        <Block title={t('phase')} description={t('phaseDescription')}><PairedBars groups={lengthGroups} names={names} /></Block>
      </TwoColumns>

      <TwoColumns>
        <Block title={t('rank')} description={t('rankDescription')}><PairedBars groups={data.rankGroups} names={names} /></Block>
        <Block title={t('build')} description={t('buildDescription')}>
          <div className="flex flex-col gap-3">
            {[A, B].map((side, i) => (
              <div key={side.ctx.hero.id} className="rounded-sm border border-border bg-surface-sunken p-3">
                <p className={cx('text-caption font-semibold', i === 0 ? SIDE_TEXT.a : SIDE_TEXT.b)}>{side.ctx.hero.name}</p>
                {side.overview.topBuild ? (
                  <>
                    <p className="font-ui text-sm font-semibold text-text">{side.overview.topBuild.name}</p>
                    <BuildStatsLine build={side.overview.topBuild} labels={buildStats} />
                  </>
                ) : (
                  <p className="text-sm text-text-muted">{t('noBuild')}</p>
                )}
              </div>
            ))}
          </div>
        </Block>
      </TwoColumns>

      <TwoColumns>
        {[A, B].map((side) => (
          <Block key={side.ctx.hero.id} title={t('matchups', { hero: side.ctx.hero.name })} description={t('matchupsDescription')}>
            <PairingList items={side.overview.best} empty={t('noLaneData')} />
            <PairingList items={side.overview.worst} empty={t('noLaneData')} />
          </Block>
        )) as [ReactNode, ReactNode]}
      </TwoColumns>

      <TwoColumns>
        {[A, B].map((side) => (
          <Block key={side.ctx.hero.id} title={t('synergy', { hero: side.ctx.hero.name })} description={t('synergyDescription')}>
            <PairingList items={side.overview.synergies} empty={t('noSynergyData')} />
          </Block>
        )) as [ReactNode, ReactNode]}
      </TwoColumns>
    </div>
  )
}

// ── Builds ───────────────────────────────────────────────────────────

export function BuildCompareView({ data }: { data: BuildData }) {
  const t = useTranslations('compare.builds')
  const scopeWords = useScopeWording()
  const heroes = useTranslations('compare.heroes')
  const builds = useTranslations('builds')
  const locale = useLocale()
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
  const fav = ratioDifference('favorites', A.build.weeklyFavorites ?? 0, B.build.weeklyFavorites ?? 0, 2)
  const vsHero = (d: typeof A) =>
    d.stats && d.heroWinRate !== null ? t('vsHero', { delta: `${d.stats.winRate >= d.heroWinRate ? '+' : '−'}${(Math.abs(d.stats.winRate - d.heroWinRate) * 100).toFixed(1)}pp`, hero: d.hero.name }) : '—'
  const labelText = buildLabelText(builds)
  const patch = patchLabels(builds)

  return (
    <div className="flex flex-col gap-8">
      <VsHeader sides={[ident(A, 'a'), ident(B, 'b')]} />
      <KeyDifferences differences={data.differences} names={names} scope={scopeWords.scope(A.scopeRef)} />
      {!data.sameHero && <p className="text-sm text-text-muted">{t('differentHeroes')}</p>}

      <Block title={heroes('atGlance')} description={scopeWords.scope(A.scopeRef)}>
        <div className="flex flex-col gap-3">
          <RateRow label={heroes('winRate')} a={A.stats as Rate | null} b={B.stats as Rate | null} />
          <ValueRow label={t('vsOwnHero')} a={vsHero(A)} b={vsHero(B)} />
          <ValueRow label={t('favorites')} a={A.build.weeklyFavorites ? formatInteger(A.build.weeklyFavorites, locale) : '—'} b={B.build.weeklyFavorites ? formatInteger(B.build.weeklyFavorites, locale) : '—'} highlight={fav?.side ?? null} />
          <ValueRow label={t('patch')} a={<PatchNote status={A.build.patch} updatedAt={A.build.updatedAt} labels={patch} locale={locale} />} b={<PatchNote status={B.build.patch} updatedAt={B.build.updatedAt} labels={patch} locale={locale} />} />
          <ValueRow label={t('labels')} a={A.labels.length ? <BuildLabels labels={A.labels} text={labelText} ariaLabel={builds('labels.aria')} /> : '—'} b={B.labels.length ? <BuildLabels labels={B.labels} text={labelText} ariaLabel={builds('labels.aria')} /> : '—'} />
        </div>
      </Block>

      <Block title={t('items')} description={t('itemsSummary', { shared: data.shared.length, onlyA: data.onlyA.length, a: A.build.name, onlyB: data.onlyB.length, b: B.build.name })}>
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="flex flex-col gap-2"><span className="text-eyebrow">{t('shared')}</span>{data.shared.length ? <ItemRow items={data.shared} size={32} /> : <span className="text-sm text-text-muted">{t('none')}</span>}</div>
          <div className="flex flex-col gap-2"><span className={cx('text-eyebrow', SIDE_TEXT.a)}>{t('only', { build: A.build.name })}</span>{data.onlyA.length ? <ItemRow items={data.onlyA} size={32} /> : <span className="text-sm text-text-muted">{t('none')}</span>}</div>
          <div className="flex flex-col gap-2"><span className={cx('text-eyebrow', SIDE_TEXT.b)}>{t('only', { build: B.build.name })}</span>{data.onlyB.length ? <ItemRow items={data.onlyB} size={32} /> : <span className="text-sm text-text-muted">{t('none')}</span>}</div>
        </div>
      </Block>

      <Block title={builds('detail.phasesTitle')} description={t('phasesDescription')}>
        <TwoColumns>
          {[A, B].map((d, i) => (
            <div key={d.build.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-3">
              <span className={cx('text-caption font-semibold', i === 0 ? SIDE_TEXT.a : SIDE_TEXT.b)}>{d.build.name}</span>
              {d.phases.phases.map((p) => (
                <div key={p.key} className="flex flex-col gap-1">
                  <span className="text-eyebrow">{builds(`phases.${p.key}`)}</span>
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
  const t = useTranslations('compare.players')
  const heroes = useTranslations('compare.heroes')
  const players = useTranslations('players')
  const locale = useLocale()
  const [A, B] = data.sides
  // A missing name reads "Player <id>" (UI fallback; the id is unchanged).
  const names = data.names.map((name, i) => name ?? players('fallbackName', { id: data.sides[i].accountId })) as [string, string]
  const ident = (p: typeof A, side: 'a' | 'b', name: string) => (
    <div className={cx('flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3', side === 'b' ? 'items-end sm:flex-row-reverse' : 'items-start')}>
      <Avatar name={name} src={p.avatar ?? undefined} />
      <div className="min-w-0">
        <Link href={`/players/${p.accountId}`} className={cx('block truncate font-ui text-title font-semibold hover:text-highlight pointer-coarse:py-2.5', SIDE_TEXT[side])}>{name}</Link>
        <RankBadge rank={p.rank} size="xs" emptyLabel={t('noRank')} className="text-caption text-text-muted" />
      </div>
    </div>
  )
  const rankWinner = A.rank && B.rank && A.rank.badge !== B.rank.badge ? (A.rank.badge > B.rank.badge ? 'a' : 'b') : null

  return (
    <div className="flex flex-col gap-8">
      <VsHeader sides={[ident(A, 'a', names[0]), ident(B, 'b', names[1])]} />
      <KeyDifferences differences={data.differences} names={names} scope={t('scope')} />

      <Block title={heroes('atGlance')} description={t('atGlanceDescription')}>
        <div className="flex flex-col gap-3">
          <RateRow label={heroes('winRate')} a={A.history.overall} b={B.history.overall} scale="player" />
          <RateRow label={t('last20')} a={A.history.recent} b={B.history.recent} scale="player" />
          <RateRow label={t('ranked')} a={A.history.ranked} b={B.history.ranked} scale="player" />
          <ValueRow label={t('currentRank')} a={A.rank?.label ?? '—'} b={B.rank?.label ?? '—'} highlight={rankWinner} />
          <ValueRow label={t('mostPlayed')} a={A.pool[0] ? `${A.pool[0].name} (${formatInteger(A.pool[0].matches, locale)})` : '—'} b={B.pool[0] ? `${B.pool[0].name} (${formatInteger(B.pool[0].matches, locale)})` : '—'} />
        </div>
      </Block>

      <TwoColumns>
        <Block title={t('sharedHeroes')} description={t('sharedHeroesDescription')}>
          {data.sharedHeroes.length ? (
            <PairedBars groups={data.sharedHeroes.map((s) => ({ key: String(s.hero.id), label: s.hero.name, a: s.a, b: s.b }))} names={names} />
          ) : (
            <p className="text-sm text-text-muted">{t('noSharedHero')}</p>
          )}
        </Block>
        <Block title={t('trend')} description={t('trendDescription')}>
          <DualSparkline a={A.history.trend.map((t) => t.winRate)} b={B.history.trend.map((t) => t.winRate)} names={names} />
        </Block>
      </TwoColumns>

      <Block title={t('headToHead')} description={t('headToHeadDescription')}>
        <p className="text-sm text-text">
          {data.asMates ? t('mates', { count: formatInteger(data.asMates.matches, locale), name: names[0], rate: formatPercent(data.asMates.winRate) }) : t('notMates')}{' '}
          {data.asOpponents ? t('opponents', { count: formatInteger(data.asOpponents.matches, locale), name: names[0], rate: formatPercent(data.asOpponents.winRate) }) : t('notOpponents')}
        </p>
      </Block>
    </div>
  )
}
