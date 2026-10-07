import { Link } from '@/i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { WinRate } from '@/components/cards/WinRate'
import { HeroPortrait } from '@/components/game-assets/HeroPortrait'
import { InView } from '@/components/motion/InView'
import { Card } from '@/components/ui/Card'
import { Tabs } from '@/components/ui/Tabs'
import { cx } from '@/lib/cx'
import { formatInteger, formatPercent } from '@/lib/format'
import type { HeroPerformance as Performance } from '../model'

/**
 * Top 5 heroes per metric, one tab each (win rate, pick rate, recorded bans). Bars grow once when
 * scrolled into view; the number is always printed, so the bar is never the only signal.
 */
export function HeroPerformance({ data }: { data: Performance }) {
  const t = useTranslations('home.performance')
  const winRate = useTranslations('cards')('winRate')
  const locale = useLocale()
  const items = [
    {
      value: 'win',
      label: winRate,
      content: (
        <Rows
          rows={data.winRate.map((r) => ({ ...r, bar: <WinRate value={r.value} className="w-full justify-end" /> }))}
          empty={t('noSample')}
        />
      ),
    },
    {
      value: 'pick',
      label: t('pickRate'),
      content: (
        <Rows
          rows={data.pickRate.map((r) => ({ ...r, bar: <Bar share={r.value / (data.pickRate[0]?.value || 1)} label={formatPercent(r.value)} /> }))}
          empty={t('noSample')}
        />
      ),
    },
    {
      value: 'bans',
      label: t('bans'),
      content: data.bans ? (
        <div className="flex flex-col gap-3">
          <Rows
            rows={data.bans.rows.map((r) => ({
              slug: r.slug,
              name: r.name,
              imageSrc: r.imageSrc,
              bar: <Bar share={r.bans / (data.bans!.rows[0]?.bans || 1)} label={`${formatInteger(r.bans, locale)} · ${formatPercent(r.share)}`} tone="orange" />,
            }))}
            empty={t('noBans')}
          />
          <p className="text-caption text-text-muted">{t('bansNote', { count: data.bans.total })}</p>
        </div>
      ) : (
        <p className="text-sm text-text-muted">{t('bansFailed')}</p>
      ),
    },
  ]
  return (
    <Card className="p-(--spacing-card)">
      <Tabs label={t('tabs')} items={items} />
    </Card>
  )
}

type Row = { slug: string; name: string; imageSrc?: string; bar: ReactNode }

function Rows({ rows, empty }: { rows: Row[]; empty: string }) {
  if (rows.length === 0) return <p className="text-sm text-text-muted">{empty}</p>
  return (
    <InView as="ol" className="flex flex-col divide-y divide-border">
      {rows.map((r, i) => (
        <li key={r.slug} className="grid grid-cols-[1.5rem_minmax(0,1fr)_minmax(0,1.2fr)] items-center gap-3 py-2.5 sm:grid-cols-[2rem_minmax(0,14rem)_1fr]">
          <span className="text-right font-ui text-sm text-text-muted tabular">{i + 1}</span>
          <Link href={`/heroes/${r.slug}`} className="flex min-h-11 min-w-0 items-center gap-2.5 font-ui text-sm font-semibold text-text hover:text-highlight">
            <HeroPortrait name={r.name} src={r.imageSrc} size="sm" decorative />
            <span className="truncate">{r.name}</span>
          </Link>
          {r.bar}
        </li>
      ))}
    </InView>
  )
}

/** Share of the list's top value: a plain proportional bar with the number beside it. */
function Bar({ share, label, tone = 'primary' }: { share: number; label: string; tone?: 'primary' | 'orange' }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <span aria-hidden="true" className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
        <span
          className={cx('absolute inset-y-0 left-0 origin-left animate-grow rounded-pill', tone === 'orange' ? 'bg-orange' : 'bg-primary')}
          style={{ width: `${Math.max(2, Math.min(1, share) * 100)}%` }}
        />
      </span>
      <span className="shrink-0 text-right font-ui text-sm font-semibold text-text tabular">{label}</span>
    </span>
  )
}
