import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { BuildCard } from '@/components/cards/BuildCard'
import { HeroCard } from '@/components/cards/HeroCard'
import { MatchCard } from '@/components/cards/MatchCard'
import { PlayerCard } from '@/components/cards/PlayerCard'
import { WinRate } from '@/components/cards/WinRate'
import { ConfidenceBadge } from '@/components/data/ConfidenceBadge'
import { DataCard } from '@/components/data/DataCard'
import { RadialMetric } from '@/components/data/RadialMetric'
import { ScopeLine } from '@/components/data/ScopeLine'
import { Sparkline } from '@/components/data/Sparkline'
import { StatCard } from '@/components/data/StatCard'
import { TrendBadge } from '@/components/data/TrendBadge'
import { BrandMark } from '@/components/layout/BrandMark'
import { Reveal } from '@/components/motion/Reveal'
import { Badge, DemoDataBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Filter } from '@/components/ui/Filter'
import { IconButton } from '@/components/ui/IconButton'
import {
  AnalyzeIcon,
  ArrowRightIcon,
  BuildsIcon,
  CloseIcon,
  CompareIcon,
  FilterIcon,
  HeroesIcon,
  HomeIcon,
  LeaderboardIcon,
  MatchesIcon,
  MenuIcon,
  MetaIcon,
  PlayersIcon,
  RefreshIcon,
  SearchIcon,
  SettingsIcon,
  TrendsIcon,
} from '@/components/ui/icons'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/States'
import { Table, type SortDirection, type TableColumn } from '@/components/ui/Table'
import { Tag } from '@/components/ui/Tag'
import { wilsonInterval } from '@/lib/analytics/wilson'
import { formatPercent } from '@/lib/format'
import { demoHeroRows, demoLowScope, demoScope, demoTimes, demoTrend, type DemoHeroRow } from '@/mocks/designSystem'
import { InteractiveDemos } from './InteractiveDemos'

export const metadata: Metadata = {
  title: 'Design system',
  robots: { index: false, follow: false },
}

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const RANK_OPTIONS = [
  ['all', 'All ranks'],
  ['low', 'Low'],
  ['mid', 'Mid'],
  ['high', 'High'],
  ['top', 'Top'],
] as const

const SORT_KEYS = ['winRate', 'pickRate', 'matches', 'kda'] as const
type SortKey = (typeof SORT_KEYS)[number]

const ICONS = [
  ['Home', HomeIcon],
  ['Meta', MetaIcon],
  ['Heroes', HeroesIcon],
  ['Builds', BuildsIcon],
  ['Matches', MatchesIcon],
  ['Analyze', AnalyzeIcon],
  ['Players', PlayersIcon],
  ['Leaderboard', LeaderboardIcon],
  ['Compare', CompareIcon],
  ['Trends', TrendsIcon],
  ['Settings', SettingsIcon],
  ['Search', SearchIcon],
  ['Filter', FilterIcon],
  ['Menu', MenuIcon],
] as const

const CHART_TOKENS = [
  ['chart-1', 'bg-chart-1', 'Primary series'],
  ['chart-2', 'bg-chart-2', 'Comparison / trend'],
  ['chart-3', 'bg-chart-3', 'Special'],
  ['chart-muted', 'bg-chart-muted', 'Low sample, inactive'],
  ['chart-grid', 'bg-chart-grid', 'Grid, ring track'],
] as const

const COLORS = [
  ['bg', '#0B1220', 'Page background'],
  ['surface', '#1A253F', 'Cards, panels'],
  ['steel', '#3B556F', 'Decorative only'],
  ['primary', '#4FC2C0', 'Interactive, positive, current'],
  ['highlight', '#66FFE8', 'Focus, key emphasis'],
  ['orange', '#F58220', 'Warnings, falling (sparingly)'],
  ['pink', '#ED438B', 'Special states (sparingly)'],
  ['text', '#F5F7FA', 'Primary text'],
  ['text-muted', '#A9B4C5', 'Secondary text'],
  ['border-control', '#64809B', 'Interactive boundaries (≥3:1)'],
] as const

export default async function DesignSystemPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const rank = typeof params.rank === 'string' ? params.rank : 'all'
  const sortKey: SortKey = SORT_KEYS.find((k) => k === params.sort) ?? 'winRate'
  const direction: SortDirection = params.dir === 'asc' ? 'asc' : 'desc'
  const rows = [...demoHeroRows].sort((a, b) =>
    direction === 'asc' ? a[sortKey] - b[sortKey] : b[sortKey] - a[sortKey],
  )
  const sortHref = (key: SortKey) => (dir: SortDirection) => `/design?sort=${key}&dir=${dir}#table`

  const columns: TableColumn<DemoHeroRow>[] = [
    { key: 'name', header: 'Hero', cell: (r) => r.name, priority: 'primary' },
    {
      key: 'winRate',
      header: 'Win rate',
      numeric: true,
      priority: 'primary',
      sortHref: sortHref('winRate'),
      cell: (r) => formatPercent(r.winRate),
    },
    { key: 'pickRate', header: 'Pick rate', numeric: true, priority: 'secondary', sortHref: sortHref('pickRate'), cell: (r) => formatPercent(r.pickRate) },
    { key: 'matches', header: 'Matches', numeric: true, priority: 'secondary', sortHref: sortHref('matches'), cell: (r) => r.matches.toLocaleString('en-US') },
    { key: 'kda', header: 'KDA', numeric: true, priority: 'secondary', sortHref: sortHref('kda'), cell: (r) => r.kda.toFixed(1) },
    { key: 'sample', header: 'Sample', align: 'end', priority: 'secondary', cell: (r) => <ConfidenceBadge sampleSize={r.matches} /> },
  ]

  const featured = demoHeroRows[0]
  const featuredInterval = wilsonInterval(Math.round(featured.winRate * featured.matches), featured.matches)

  return (
    <div className="page-container flex flex-col gap-(--spacing-section) py-12">
      <SectionHeader
        as="h1"
        eyebrow="Internal reference"
        title="Design system"
        description="Tokens and reusable components for Deadlockprohunger. Every number on this page is fictional demo data."
        actions={<DemoDataBadge />}
      />

      <Showcase title="Color tokens" id="color">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {COLORS.map(([name, hex, use]) => (
            <li key={name} className="overflow-hidden rounded-md border border-border">
              <span className="block h-14" style={{ backgroundColor: hex }} />
              <span className="block p-3">
                <span className="block font-ui text-sm font-semibold text-text">--color-{name}</span>
                <span className="block font-mono text-caption text-text-muted">{hex}</span>
                <span className="mt-1 block text-caption text-text-muted">{use}</span>
              </span>
            </li>
          ))}
        </ul>
      </Showcase>

      <Showcase title="Typography" id="type">
        <div className="flex flex-col gap-4">
          <p className="type-slant text-display-xl">Brand statement</p>
          <p className="font-display text-display-xl font-extrabold uppercase">display-xl — page hero</p>
          <p className="font-display text-display-lg font-bold uppercase">display-lg — page title</p>
          <p className="font-display text-heading-xl font-bold uppercase">heading-xl — section, big stat</p>
          <p className="font-ui text-heading-lg font-bold">heading-lg — panel heading</p>
          <p className="font-ui text-heading-md font-semibold">heading-md — card heading</p>
          <p className="max-w-2xl text-body-lg text-text-muted">body-lg — lead paragraphs that introduce a page.</p>
          <p className="max-w-2xl text-body-md text-text-muted">
            body-md — readable system sans for explanations and “Why?” text. Numbers use tabular figures: <span className="tabular text-text">52.1% · 18,420</span>
          </p>
          <p className="max-w-2xl text-body-sm text-text-muted">body-sm — dense UI copy and table cells.</p>
          <p className="text-eyebrow">Label / eyebrow</p>
          <p className="text-caption text-text-muted">caption — scope lines, timestamps and sample sizes</p>
        </div>
      </Showcase>

      <Showcase title="Logo" id="logo">
        <div className="flex flex-wrap items-center gap-10">
          <BrandMark variant="primary" />
          <BrandMark variant="horizontal" />
          <BrandMark variant="icon" />
        </div>
        <p className="max-w-2xl text-body-sm text-text-muted">Primary, horizontal and icon, from the owner’s master logo (scripts/brand-assets.mjs). Every logo renders through BrandMark.</p>
      </Showcase>

      <Showcase title="Icons" id="icons">
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7">
          {ICONS.map(([name, Glyph]) => (
            <li key={name} className="flex flex-col items-center gap-2 rounded-md border border-border bg-surface-sunken p-3 text-caption text-text-muted">
              <Glyph size={24} className="text-primary" />
              {name}
            </li>
          ))}
        </ul>
      </Showcase>

      <Showcase title="Buttons" id="buttons">
        <div className="flex flex-wrap items-center gap-3">
          <Button trailingIcon={<ArrowRightIcon size={16} />}>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button size="sm">Small</Button>
          <Button loading>Loading</Button>
          <Button disabled>Disabled</Button>
          <ButtonLink href="/design#cards" variant="secondary">
            Link as button
          </ButtonLink>
          <IconButton label="Search" icon={<SearchIcon />} />
          <IconButton label="Refresh" icon={<RefreshIcon />} variant="outline" />
          <IconButton label="Close" icon={<CloseIcon />} size="sm" />
        </div>
      </Showcase>

      <Showcase title="Badges, tags and indicators" id="badges">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Neutral</Badge>
            <Badge tone="primary">Current</Badge>
            <Badge tone="positive">Win</Badge>
            <Badge tone="negative">Loss</Badge>
            <Badge tone="warning">New patch</Badge>
            <Badge tone="special">Special</Badge>
            <DemoDataBadge />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Tag>Spirit</Tag>
            <Tag href="/design#badges">Linked tag</Tag>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TrendBadge direction="rising" delta={0.031} comparison="vs previous 7 days" />
            <TrendBadge direction="falling" delta={-0.018} comparison="vs previous 7 days" />
            <TrendBadge direction="stable" />
            <ConfidenceBadge sampleSize={140} />
            <ConfidenceBadge sampleSize={640} />
            <ConfidenceBadge sampleSize={18_420} interval={featuredInterval} />
            <WinRate value={0.538} />
            <WinRate value={0.472} />
          </div>
        </div>
      </Showcase>

      <Showcase title="Stat cards (insight layer)" id="stats">
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal index={0}>
            <StatCard
              featured
              label="Highest win rate"
              subject={featured.name}
              value={featured.winRate}
              format="percent"
              interval={featuredInterval}
              delta={<TrendBadge direction="rising" delta={0.031} comparison="vs previous 7 days" />}
              scope={demoScope}
              footer={<Sparkline values={demoTrend} baseline={0.5} summary="Demo win rate rose from 48.6% to 52.1% over 7 days." />}
              why={
                <>
                  {featured.name} won {formatPercent(featured.winRate)} of {featured.matches.toLocaleString('en-US')} matches. The 95%
                  interval ({formatPercent(featuredInterval.low)}–{formatPercent(featuredInterval.high)}) stays above 50%.
                </>
              }
            />
          </Reveal>
          <Reveal index={1}>
            <StatCard label="Matches analyzed" value={406_192} format="compact" scope={{ ...demoScope, sampleSize: undefined }} />
          </Reveal>
          <Reveal index={2}>
            <StatCard
              label="Top-band win rate"
              subject="Sample Echo"
              value={0.583}
              format="percent"
              scope={demoLowScope}
              why="Only 140 matches: too few to treat as a strong conclusion, so this never appears as a headline insight."
            />
          </Reveal>
        </div>
      </Showcase>

      <Showcase title="Card surface" id="card-surface">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="p-(--spacing-card) text-body-sm text-text-muted">Default: navy surface, steel hairline</Card>
          <Card interactive className="p-(--spacing-card) text-body-sm text-text-muted">Interactive: hover lifts</Card>
          <Card accent="primary" className="p-(--spacing-card) text-body-sm text-text-muted">Accent primary: positive or current</Card>
          <Card accent="warning" className="p-(--spacing-card) text-body-sm text-text-muted">Accent warning: attention</Card>
        </div>
        <p className="max-w-2xl text-body-sm text-text-muted">Every card type (hero, build, match, player, stat, insight, trend, analytics) is this one surface plus its content. Featured (cyan border and glow) is limited to one card per screen.</p>
      </Showcase>

      <Showcase title="Data visualization" id="dataviz">
        <div className="grid gap-6 md:grid-cols-[auto_1fr]">
          <div className="flex flex-wrap gap-6">
            <RadialMetric value={0.523} label="Win rate" reference={0.5} />
            <RadialMetric value={0.184} label="Pick rate" tone="orange" />
            <RadialMetric value={0.583} label="Low sample" muted />
          </div>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-6 rounded-md bg-chart-bg p-4">
              <Sparkline values={demoTrend} baseline={0.5} summary="Demo win rate rose from 48.6% to 52.1% over 7 days." width={200} height={48} />
              <Sparkline values={[...demoTrend].reverse()} tone="orange" summary="Demo comparison series fell from 52.1% to 48.6%." width={200} height={48} />
            </div>
            <ul className="flex flex-wrap gap-4">
              {CHART_TOKENS.map(([name, swatch, use]) => (
                <li key={name} className="flex items-center gap-2 text-caption text-text-muted">
                  <span aria-hidden="true" className={`size-3 rounded-pill ${swatch}`} />
                  <span className="font-mono text-text">--color-{name}</span> {use}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Showcase>

      <Showcase title="Domain cards" id="cards">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex flex-col gap-3">
            <ScopeLine scope={demoScope} />
            {demoHeroRows.slice(0, 3).map((hero, i) => (
              <Reveal key={hero.slug} index={i}>
                <HeroCard
                  name={hero.name}
                  href="/design#cards"
                  subtitle="Demo hero"
                  stats={{
                    winRate: hero.winRate,
                    matches: hero.matches,
                    trend: i === 0 ? { direction: 'rising', delta: 0.031 } : { direction: 'stable' },
                  }}
                />
              </Reveal>
            ))}
            <HeroCard name="Sample Echo" href="/design#cards" subtitle="Low sample (muted)" stats={{ winRate: 0.583, matches: 140 }} />
          </div>
          <div className="flex flex-col gap-3">
            <PlayerCard
              position={1}
              name="DemoPlayer"
              href="/design#cards"
              rank={{ tierName: 'Demo Tier', subrank: 6 }}
              recent={{ matches: 20, winRate: 0.65 }}
              topHeroes={[{ name: 'Sample Alpha' }, { name: 'Sample Bravo' }, { name: 'Sample Delta' }]}
            />
            <PlayerCard name="Unranked Demo" href="/design#cards" rank={{ tierName: null }} />
            <BuildCard
              name="Demo spirit burst build"
              href="/design#cards"
              heroName="Sample Alpha"
              authorName="DemoAuthor"
              updatedAt={demoTimes.buildUpdatedAt}
              tags={['Spirit', 'Laning']}
              weeklyFavorites={1240}
              performance={{ winRate: 0.531, matches: 2_350 }}
            />
            <BuildCard name="New demo build" href="/design#cards" heroName="Sample Bravo" performance={null} />
            <MatchCard
              matchId={100000001}
              href="/design#cards"
              startedAt={demoTimes.matchStartedAt}
              durationS={1934}
              averageRank="Demo Tier IV"
              perspective={{ won: true, heroName: 'Sample Alpha', kda: '12 / 3 / 9' }}
              teams={[
                { label: 'Team 1', won: true, heroes: ['Sample Alpha', 'Sample Bravo', 'Sample Charlie', 'Sample Delta', 'Sample Echo', 'Sample Foxtrot'].map((name) => ({ name })) },
                { label: 'Team 2', won: false, heroes: ['Sample Golf', 'Sample Hotel', 'Sample India', 'Sample Juliet', 'Sample Kilo', 'Sample Lima'].map((name) => ({ name })) },
              ]}
            />
          </div>
        </div>
      </Showcase>

      <Showcase title="Filters" id="filters">
        <Filter
          label="Rank"
          value={rank}
          options={RANK_OPTIONS.map(([value, label]) => ({ value, label, href: `/design?rank=${value}#filters` }))}
        />
      </Showcase>

      <Showcase title="Interactive" id="interactive">
        <InteractiveDemos />
      </Showcase>

      <Showcase title="Table (deep data)" id="table">
        <DataCard
          title="Hero win rates"
          description="Sortable via the URL. Collapses to expandable rows on mobile."
          scope={demoScope}
          note="Demo data. Sample tiers: Low < 200, Moderate 200–1,000, High > 1,000 matches."
        >
          <Table
            caption="Demo hero win rates, last 7 days"
            captionHidden
            columns={columns}
            rows={rows}
            rowKey={(r) => r.slug}
            sort={{ key: sortKey, direction }}
          />
        </DataCard>
      </Showcase>

      <Showcase title="States" id="states">
        <div className="grid gap-4 lg:grid-cols-3">
          <EmptyState
            title="No matchups yet"
            description="No opponent has 100+ games against this hero in the selected window. Try a longer window."
            action={<ButtonLink href="/design?window=30d#states" variant="secondary" size="sm">Use last 30 days</ButtonLink>}
          />
          <ErrorState action={<ButtonLink href="/design#states" variant="secondary" size="sm">Try again</ButtonLink>} />
          <LoadingState label="Loading hero statistics">
            <div className="flex flex-col gap-3 rounded-md border border-border p-5">
              <Skeleton shape="text" className="w-24" />
              <Skeleton className="h-10 w-32" />
              <Skeleton shape="text" className="w-full" />
              <Skeleton shape="text" className="w-2/3" />
            </div>
          </LoadingState>
        </div>
      </Showcase>
    </div>
  )
}

function Showcase({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-title`} id={id} className="flex scroll-mt-6 flex-col gap-5">
      <SectionHeader title={title} id={`${id}-title`} />
      {children}
    </section>
  )
}
