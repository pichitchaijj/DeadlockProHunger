import { useLocale, useTranslations } from 'next-intl'
import { Link } from '@/i18n/navigation'
import type { ReactNode } from 'react'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { ItemIcon } from '@/components/game-assets/ItemIcon'
import { RankBadge } from '@/components/game-assets/RankBadge'
import { CountUp } from '@/components/motion/CountUp'
import { Reveal } from '@/components/motion/Reveal'
import { Badge } from '@/components/ui/Badge'
import { cx } from '@/lib/cx'
import type { RankDisplay } from '@/lib/deadlock/rankAssets'
import { dateFormat, formatCompact, formatDuration, formatInteger } from '@/lib/format'
import type { MatchView, PlayerView, Side, TeamTotals } from '../model'
import { storyFacts, teamName } from '../text'
import { ScrollRegion } from '@/components/ui/ScrollRegion'

/*
 * Match Detail sections (this page only), worded from the Matches catalog (matches.*). Hero, item and
 * player names, ranks and every number are match data and render unchanged.
 */

/** Team colors: restrained and always paired with the team name. */
export const TEAM_TEXT: Record<Side, string> = { 0: 'text-primary', 1: 'text-text-muted' }
export const TEAM_BG: Record<Side, string> = { 0: 'bg-primary', 1: 'bg-text-muted' }
export const TEAM_STROKE: Record<Side, string> = { 0: 'stroke-primary', 1: 'stroke-text-muted' }

const DATE: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', timeZoneName: 'short' }

export function Section({ id, title, description, children }: { id: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="flex scroll-mt-32 flex-col gap-4">
      <div>
        <h2 id={`${id}-title`} className="font-display text-display-m font-bold text-text uppercase">{title}</h2>
        {description && <p className="mt-1 max-w-3xl text-sm text-text-muted">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** The match result as a phrase ("Team 2 won", "Draw", …). */
export function useResultText(view: MatchView): string {
  const t = useTranslations('matches')
  return view.outcome === 'win' && view.winner !== null ? t('explorer.teamWon', { team: teamName(t, view.winner) }) : view.outcome === 'draw' ? t('detail.draw') : t('detail.noResult')
}

// ── 1. Summary ───────────────────────────────────────────────────────

export function MatchSummary({ view, patchAt, rank }: { view: MatchView; patchAt: number | null; rank: [RankDisplay | null, RankDisplay | null] }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  const result = useResultText(view)
  const patchDate = dateFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return (
    <section aria-labelledby="match-title" className="flex animate-awaken flex-col gap-5">
      <p className="text-eyebrow">
        <Link href="/matches" className="hover:text-text pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center">{t('list.title')}</Link> <span aria-hidden="true">/</span> {view.id}
      </p>
      <h1 id="match-title" className="sr-only">{t('detail.heading', { id: view.id, result })}</h1>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-surface p-(--spacing-card) shadow-card sm:gap-6">
        {([0, 1] as const).map((side) => (
          <div key={side} className={cx('flex flex-col gap-1', side === 0 ? 'items-start text-left' : 'order-3 items-end text-right')}>
            <span className={cx('font-display text-title font-bold uppercase', TEAM_TEXT[side])}>{teamName(t, side)}</span>
            <span className="font-display text-display-xl leading-none font-extrabold text-text tabular">
              <CountUp value={view.teams[side].kills} format="integer" />
            </span>
            <span className="text-caption text-text-muted">{t('detail.kills')}{rank[side] && <> · {t('detail.avg')} <RankBadge rank={rank[side]} size="xs" /></>}</span>
            {view.winner === side && <Badge tone="positive">{t('detail.winner')}</Badge>}
          </div>
        ))}
        <span className="order-2 font-display text-display-m font-bold text-text-muted">{t('detail.vs')}</span>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3 lg:grid-cols-6">
        <Meta label={t('detail.result')}>{result}</Meta>
        <Meta label={t('detail.duration')}>{formatDuration(view.durationS)}</Meta>
        <Meta label={t('detail.mode')}>{view.mode === 'Ranked' ? t('common.ranked') : t('common.unranked')}</Meta>
        <Meta label={t('detail.patch')}>{patchAt !== null ? patchDate.format(patchAt) : t('detail.unknown')}</Meta>
        <Meta label={t('detail.date')} className="col-span-2">{dateFormat(locale, DATE).format(view.startedAt)}</Meta>
      </dl>
      {(view.flags.highSkill || view.flags.lowPriority || view.flags.newPlayer || view.flags.notScored) && (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('detail.conditions')}>
          {view.flags.highSkill && <li><Badge>{t('detail.flags.highSkill')}</Badge></li>}
          {view.flags.lowPriority && <li><Badge tone="warning">{t('detail.flags.lowPriority')}</Badge></li>}
          {view.flags.newPlayer && <li><Badge>{t('detail.flags.newPlayer')}</Badge></li>}
          {view.flags.notScored && <li><Badge tone="warning">{t('detail.flags.notScored')}</Badge></li>}
        </ul>
      )}
    </section>
  )
}

function Meta({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5 bg-surface px-4 py-3', className)}>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="font-ui text-sm font-semibold text-text">{children}</dd>
    </div>
  )
}

// ── Match story ──────────────────────────────────────────────────────

export function MatchStory({ view }: { view: MatchView }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  return (
    <Section id="story" title={t('story.title')} description={t('story.description')}>
      <ol className="grid gap-4 lg:grid-cols-3">
        {view.story.map((phase, i) => (
          <Reveal as="li" key={phase.key} index={i} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4 shadow-card">
            <header className="flex items-baseline justify-between gap-2">
              <h3 className="font-display text-title font-bold text-text uppercase">{t(`story.phases.${phase.key}`)}</h3>
              <span className="text-caption text-text-muted tabular">
                {formatDuration(phase.from)}–{formatDuration(phase.to)}
              </span>
            </header>
            <ul className="flex flex-col gap-2 text-sm text-text">
              {storyFacts(t, phase, locale).map((fact) => (
                <li key={fact} className="flex gap-2">
                  <span aria-hidden="true" className="mt-1.5 size-1.5 shrink-0 rotate-45 bg-steel" />
                  {fact}
                </li>
              ))}
            </ul>
          </Reveal>
        ))}
      </ol>
      {(view.leadChanges.length > 0 || view.biggestSwing) && (
        <p className="text-sm text-text-muted">
          {view.leadChanges.length === 0
            ? t('story.neverChanged')
            : t('story.changed', { count: view.leadChanges.length, list: view.leadChanges.map((c) => t('story.changeAt', { team: teamName(t, c.to), time: formatDuration(c.t) })).join(', ') })}{' '}
          {view.biggestSwing &&
            t('story.swing', {
              team: teamName(t, view.biggestSwing.side),
              value: formatCompact(view.biggestSwing.amount, locale),
              from: formatDuration(view.biggestSwing.from),
              to: formatDuration(view.biggestSwing.to),
            })}
        </p>
      )}
    </Section>
  )
}

// ── 2. Team comparison ───────────────────────────────────────────────

const COMPARE: Array<keyof Omit<TeamTotals, 'side'>> = ['kills', 'deaths', 'assists', 'netWorth', 'lastHits', 'denies', 'damage', 'healing', 'objectives', 'midBoss']

export function TeamComparison({ view }: { view: MatchView }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  const [a, b] = view.teams
  const value = (key: (typeof COMPARE)[number], v: number) => (key === 'netWorth' || key === 'damage' || key === 'healing' ? formatCompact(v, locale) : formatInteger(v, locale))
  return (
    <Section id="teams" title={t('teams.title')} description={t('teams.description')}>
      <div className="rounded-md border border-border bg-surface p-(--spacing-card)">
        <div className="mb-3 grid grid-cols-[1fr_8rem_1fr] text-eyebrow max-sm:grid-cols-[1fr_6rem_1fr]">
          <span className={TEAM_TEXT[0]}>{teamName(t, 0)}</span>
          <span className="text-center">{t('teams.metric')}</span>
          <span className={cx('text-right', TEAM_TEXT[1])}>{teamName(t, 1)}</span>
        </div>
        <ul className="flex flex-col gap-2.5">
          {COMPARE.map((key, i) => {
            const total = a[key] + b[key]
            const share = total > 0 ? a[key] / total : 0.5
            return (
              <li key={key} className="grid grid-cols-[1fr_8rem_1fr] items-center gap-2 max-sm:grid-cols-[1fr_6rem_1fr]">
                <span className="flex items-center justify-end gap-2">
                  <span className="font-ui text-sm text-text tabular">{value(key, a[key])}</span>
                  <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-pill bg-surface-sunken max-sm:w-12">
                    <span className={cx('ml-auto block h-full origin-right animate-grow rounded-pill', TEAM_BG[0])} style={{ width: `${share * 100}%`, animationDelay: `${i * 40}ms` }} />
                  </span>
                </span>
                <span className="text-center text-caption text-text-muted">{t(`teams.metrics.${key}`)}</span>
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-2 w-24 overflow-hidden rounded-pill bg-surface-sunken max-sm:w-12">
                    <span className={cx('block h-full origin-left animate-grow rounded-pill', TEAM_BG[1])} style={{ width: `${(1 - share) * 100}%`, animationDelay: `${i * 40}ms` }} />
                  </span>
                  <span className="font-ui text-sm text-text tabular">{value(key, b[key])}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </Section>
  )
}

// ── 3. Players ───────────────────────────────────────────────────────

export function PlayersSection({ view }: { view: MatchView }) {
  const t = useTranslations('matches')
  const locale = useLocale()
  const caption = (side: Side) => t('players.teamResult', { team: teamName(t, side), result: view.winner === side ? 'won' : view.winner !== null ? 'lost' : 'none' })
  return (
    <Section id="players" title={t('players.title')} description={t('players.description')}>
      <div className="grid gap-4 xl:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <div key={side}>
          {/* Phones: one card per player (identity, K/D/A, souls first). The table starts at sm. */}
          <ul aria-label={t('players.teamPlayers', { team: teamName(t, side) })} className="flex flex-col divide-y divide-border rounded-md border border-border sm:hidden">
            <li className={cx('px-3 py-2 text-eyebrow', TEAM_TEXT[side])}>{caption(side)}</li>
            {view.players.filter((p) => p.side === side).map((p) => (
              <li key={p.slot} className="flex flex-col gap-1 px-3 py-2.5">
                <span className="flex items-center gap-3">
                  <span className="min-w-0 flex-1"><PlayerCell p={p} /></span>
                  <span className="text-right font-ui text-sm text-text tabular">{p.kills}/{p.deaths}/{p.assists}<span className="block text-caption text-text-muted">{t('common.souls', { value: formatCompact(p.netWorth, locale) })}</span></span>
                </span>
                <span className="text-caption text-text-muted tabular">{t('players.line', { lh: p.lastHits, dn: p.denies, damage: formatCompact(p.damage, locale), level: p.level })}</span>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-md border border-border sm:block">
            <table className="w-full font-ui text-sm">
              <caption className={cx('px-3 py-2 text-left text-eyebrow', TEAM_TEXT[side])}>{caption(side)}</caption>
              <thead className="bg-surface text-eyebrow">
                <tr className="border-y border-border">
                  <th scope="col" className="px-3 py-2 text-left">{t('players.player')}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t('players.kda')}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t('players.souls')}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t('players.lhdn')}</th>
                  <th scope="col" className="px-2 py-2 text-right">{t('players.damage')}</th>
                  <th scope="col" className="px-3 py-2 text-right">{t('players.level')}</th>
                </tr>
              </thead>
              <tbody>
                {view.players.filter((p) => p.side === side).map((p) => (
                  <tr key={p.slot} className="border-b border-border/70 last:border-b-0 hover:bg-surface-raised/50">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <PlayerCell p={p} />
                    </th>
                    <td className="px-2 py-2 text-right text-text tabular">{p.kills}/{p.deaths}/{p.assists}</td>
                    <td className="px-2 py-2 text-right text-text tabular">{formatCompact(p.netWorth, locale)}</td>
                    <td className="px-2 py-2 text-right text-text-muted tabular">{p.lastHits}/{p.denies}</td>
                    <td className="px-2 py-2 text-right text-text-muted tabular">{formatCompact(p.damage, locale)}</td>
                    <td className="px-3 py-2 text-right text-text-muted tabular">{p.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

/** Player name (public Steam name, data) over hero name (data); the fallback "Player {id}" is UI text. */
export function PlayerCell({ p }: { p: PlayerView }) {
  const t = useTranslations('matches.common')
  return (
    <span className="flex items-center gap-2">
      <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-text">{p.name ?? t('player', { id: p.accountId })}</span>
        <span className="block truncate text-caption text-text-muted">{p.hero.name}</span>
      </span>
    </span>
  )
}

// ── 4. Hero lineup ───────────────────────────────────────────────────

export function HeroLineup({ view }: { view: MatchView }) {
  const t = useTranslations('matches')
  return (
    <Section id="lineup" title={t('lineup.title')} description={t('lineup.description')}>
      <div className="grid gap-4 lg:grid-cols-2">
        {([0, 1] as const).map((side) => (
          <ul key={side} aria-label={t('lineup.teamHeroes', { team: teamName(t, side) })} className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {view.players.filter((p) => p.side === side).sort((x, y) => (x.lane ?? 9) - (y.lane ?? 9)).map((p, i) => (
              <Reveal as="li" key={p.slot} index={i} className="flex flex-col items-center gap-1 rounded-sm border border-border bg-surface p-2 text-center">
                <HeroPortrait name={p.hero.name} src={p.hero.iconUrl ?? undefined} size="md" />
                {p.hero.slug ? (
                  <Link href={`/heroes/${p.hero.slug}`} className="text-caption font-semibold text-text hover:text-highlight pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center">{p.hero.name}</Link>
                ) : (
                  <span className="text-caption font-semibold text-text">{p.hero.name}</span>
                )}
                <span className={cx('text-caption', TEAM_TEXT[side])}>{p.lane ? t('lineup.lane', { n: p.lane }) : t('lineup.noLane')}</span>
                {p.pregameHero && <span className="text-caption text-text-muted">{t('lineup.swapped', { hero: p.pregameHero.name })}</span>}
              </Reveal>
            ))}
          </ul>
        ))}
      </div>
      {view.banned.length > 0 && (
        <p className="flex flex-wrap items-center gap-2 text-sm text-text-muted">
          {t('lineup.banned')} {view.banned.map((h) => <HeroPortrait key={h.id} name={h.name} src={h.iconUrl ?? undefined} size="sm" />)}
        </p>
      )}
    </Section>
  )
}

// ── 6. Builds ────────────────────────────────────────────────────────

export function BuildsSection({ view }: { view: MatchView }) {
  const t = useTranslations('matches')
  return (
    <Section id="builds" title={t('builds.title')} description={t('builds.description')}>
      <div className="grid gap-3 xl:grid-cols-2">
        {view.players.map((p) => (
          <div key={p.slot} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <div className="flex items-center justify-between gap-2">
              <PlayerCell p={p} />
              {p.buildId && p.hero.slug && (
                <Link href={`/builds/${p.hero.slug}/${p.buildId}`} className="shrink-0 text-caption font-semibold text-primary hover:text-highlight">
                  {t('builds.selected')}
                </Link>
              )}
            </div>
            <ul className="flex flex-wrap gap-1" aria-label={t('builds.purchases', { hero: p.hero.name })}>
              {p.purchases.map((b, i) => {
                const item = b.item.name ?? t('events.anItem')
                return (
                  <li
                    key={`${b.item.id}-${i}`}
                    className={cx('animate-scale-in', b.soldAt !== null && 'opacity-40')}
                    style={{ animationDelay: `${Math.min(i, 24) * 30}ms` }}
                    title={b.soldAt !== null ? t('builds.boughtSold', { item, time: formatDuration(b.t), sold: formatDuration(b.soldAt) }) : t('builds.boughtAt', { item, time: formatDuration(b.t) })}
                  >
                    <ItemIcon name={b.item.name ?? 'Item'} src={b.item.icon} slot={b.item.slot} tier={b.item.tier} size={28} />
                    {b.soldAt !== null && <span className="sr-only">{t('builds.sold')}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  )
}

// ── 7. Performance ───────────────────────────────────────────────────

const PERF: Array<keyof Pick<PlayerView, 'damage' | 'netWorth' | 'healing' | 'objectiveDamage' | 'damageTaken'>> = ['damage', 'netWorth', 'objectiveDamage', 'healing', 'damageTaken']

export function PerformanceSection({ view }: { view: MatchView }) {
  const t = useTranslations('matches.performance')
  const locale = useLocale()
  return (
    <Section id="performance" title={t('title')} description={t('description')}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {PERF.map((key) => {
          const ranked = [...view.players].sort((x, y) => y[key] - x[key])
          const max = ranked[0]?.[key] || 1
          return (
            <div key={key} className="rounded-md border border-border bg-surface p-4">
              <h3 className="mb-3 text-eyebrow">{t(`metrics.${key}`)}</h3>
              <ol className="flex flex-col gap-1.5">
                {ranked.map((p, i) => (
                  <li key={p.slot} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-2 text-caption">
                    <span className="truncate text-text">{p.hero.name}</span>
                    <span aria-hidden="true" className="h-1.5 rounded-pill bg-surface-sunken">
                      <span className={cx('block h-full origin-left animate-grow rounded-pill', TEAM_BG[p.side])} style={{ width: `${(p[key] / max) * 100}%`, animationDelay: `${i * 25}ms` }} />
                    </span>
                    <span className="text-right text-text-muted tabular">{formatCompact(p[key], locale)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// ── 10. Advanced data ────────────────────────────────────────────────

export function AdvancedData({ view }: { view: MatchView }) {
  const t = useTranslations('matches.advanced')
  const locale = useLocale()
  return (
    <Section id="advanced" title={t('title')} description={t('description')}>
      <details className="rounded-md border border-border bg-surface px-(--spacing-card) py-4">
        <summary className="cursor-pointer py-3 font-ui text-sm font-semibold text-primary hover:text-highlight">{t('soulsPerSample')}</summary>
        <ScrollRegion label={t('soulsPerSample')} className="mt-3">
          <table className="w-full font-ui text-caption">
            <caption className="sr-only">{t('caption')}</caption>
            <thead className="text-eyebrow">
              <tr>
                <th scope="col" className="px-2 py-1.5 text-left">{t('player')}</th>
                {view.times.slice(1).map((time) => (
                  <th key={time} scope="col" className="px-2 py-1.5 text-right tabular">{formatDuration(time)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {view.players.map((p) => (
                <tr key={p.slot} className="border-t border-border">
                  <th scope="row" className={cx('px-2 py-1.5 text-left font-normal', TEAM_TEXT[p.side])}>{p.hero.name}</th>
                  {view.times.slice(1).map((time) => (
                    <td key={time} className="px-2 py-1.5 text-right text-text tabular">{formatInteger(p.ticks.find((k) => k.t === time)?.netWorth ?? 0, locale)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </details>
      <p className="text-caption text-text-muted">
        {t.rich('source', {
          link: (chunks) => (
            <a className="text-text underline decoration-steel hover:decoration-primary" href={`https://api.deadlock-api.com/v1/matches/${view.id}/metadata?disable_steam=true`} rel="noopener noreferrer">
              {chunks}
            </a>
          ),
        })}
      </p>
    </Section>
  )
}
