import { Link } from '@/i18n/navigation'
import { useTranslations } from 'next-intl'
import type { NavItem } from '@/config/navigation'
import { useLocalizedNav } from '@/i18n/nav'
import { BrandMark } from './BrandMark'

/** Site footer. The unofficial-project notice is required on every page. */
export function Footer() {
  const t = useTranslations('Nav')
  const { primary, secondary } = useLocalizedNav()

  return (
    <footer className="mt-(--spacing-section) border-t border-border bg-surface-sunken pb-[env(safe-area-inset-bottom)]">
      <div className="page-container grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="flex flex-col gap-4">
          <BrandMark />
          <p className="max-w-sm text-sm text-text-muted">
            Community analytics and strategy for Deadlock. Data → insight → decision → action.
          </p>
        </div>
        <FooterLinks id="explore" title={t('explore')} items={primary} />
        <FooterLinks id="more" title={t('more')} items={secondary} />
      </div>
      <div className="border-t border-border">
        <p className="page-container py-6 text-caption text-text-muted">
          Deadlockprohunger is an unofficial fan project. It is not affiliated with or endorsed by
          Valve. Deadlock and related marks are property of Valve Corporation. Game data provided by{' '}
          <a
            href="https://deadlock-api.com"
            className="text-text underline decoration-steel underline-offset-2 hover:decoration-primary"
          >
            deadlock-api.com
          </a>
          .
        </p>
      </div>
    </footer>
  )
}

function FooterLinks({ id, title, items }: { id: string; title: string; items: NavItem[] }) {
  const headingId = `footer-${id}`
  return (
    <nav aria-labelledby={headingId}>
      <h2 id={headingId} className="mb-3 text-eyebrow">
        {title}
      </h2>
      <ul className="grid grid-cols-2 gap-x-4 md:grid-cols-1">
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              prefetch={item.built ? undefined : false}
              className="inline-flex min-h-11 min-w-11 items-center text-sm text-text-muted hover:text-text md:min-h-9 md:min-w-0"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  )
}
