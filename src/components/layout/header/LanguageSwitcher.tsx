'use client'

import { useLocale } from 'next-intl'
import { usePathname, useSearchParams } from 'next/navigation'
import { Suspense, useId } from 'react'
import { localeEndonyms, locales, type Locale } from '@/i18n/config'
import { switchLocaleHref } from '@/i18n/navigation'
import { cx } from '@/lib/cx'
import { ChevronDownIcon, GlobeIcon } from '@/components/ui/icons'
import { useDisclosureMenu } from '@/components/ui/useDisclosureMenu'

/** Translated on the server (SiteHeader) and passed in, so no messages ship for the switcher. */
export type LanguageSwitcherLabels = {
  /** "Language", in the active locale. */
  language: string
  /** Each language's name in the active locale ("Thai"), shown under its own name ("ไทย"). */
  names: Record<Locale, string>
}

type Props = { labels: LanguageSwitcherLabels; variant: 'menu' | 'list' }

/**
 * Language switcher: the current page (path, route params, query) in each locale, via
 * `switchLocaleHref` (src/i18n/navigation.ts). Links are plain anchors: a locale change swaps the
 * root layout (<html lang>), which is a full page load either way, and nothing is prefetched.
 * - `menu`: desktop header disclosure (useDisclosureMenu, like More).
 * - `list`: the mobile drawer's always-visible list.
 * Pages rendered statically (Home) don't know the query on the server; their links get it after hydration.
 */
export function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={<Switcher {...props} search="" />}>
      <SwitcherWithQuery {...props} />
    </Suspense>
  )
}

function SwitcherWithQuery(props: Props) {
  return <Switcher {...props} search={useSearchParams().toString()} />
}

function Switcher({ labels, variant, search }: Props & { search: string }) {
  const locale = useLocale()
  const pathname = usePathname()
  const options = locales.map((l) => ({ locale: l, href: switchLocaleHref(pathname, search, l), current: l === locale }))
  return variant === 'menu' ? (
    <SwitcherMenu labels={labels} locale={locale} options={options} />
  ) : (
    <SwitcherList labels={labels} options={options} />
  )
}

type Option = { locale: Locale; href: string; current: boolean }

function LanguageName({ option, labels }: { option: Option; labels: LanguageSwitcherLabels }) {
  const translated = labels.names[option.locale]
  return (
    <span className="min-w-0">
      <span lang={option.locale} className="block font-ui text-sm font-semibold text-text">
        {localeEndonyms[option.locale]}
      </span>
      {translated !== localeEndonyms[option.locale] && <span className="block text-caption text-text-muted">{translated}</span>}
    </span>
  )
}

function SwitcherMenu({ labels, locale, options }: { labels: LanguageSwitcherLabels; locale: Locale; options: Option[] }) {
  const panelId = useId()
  const { open, setOpen, buttonRef, rootProps } = useDisclosureMenu('data-language-link')
  return (
    // Keyboard handling is delegated from the button and links inside this wrapper.
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions
    <div {...rootProps} className="relative flex">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`${labels.language}: ${localeEndonyms[locale]}`}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex h-10 items-center gap-1.5 rounded-sm px-2.5 font-display text-[0.95rem] font-semibold tracking-[0.08em] uppercase',
          'transition-colors duration-(--dur-fast) ease-awaken',
          open ? 'text-text' : 'text-text-muted hover:text-text',
        )}
      >
        <GlobeIcon size={18} />
        <span aria-hidden="true">{locale.split('-')[0]}</span>
        <ChevronDownIcon size={16} className={cx('transition-transform duration-(--dur-fast)', open && 'rotate-180')} />
      </button>

      <div
        id={panelId}
        hidden={!open}
        className="absolute top-full right-0 z-50 mt-2 w-56 rounded-md border border-border-strong bg-surface p-2 shadow-overlay animate-scale-in"
      >
        <ul aria-label={labels.language}>
          {options.map((o) => (
            <li key={o.locale}>
              <a
                data-language-link
                href={o.href}
                hrefLang={o.locale}
                aria-current={o.current ? 'true' : undefined}
                className={cx(
                  'flex items-start gap-3 rounded-sm px-3 py-2 transition-colors duration-(--dur-fast)',
                  o.current ? 'bg-surface-raised' : 'hover:bg-surface-raised',
                )}
              >
                <span aria-hidden="true" className={cx('mt-1.5 size-1.5 shrink-0 rotate-45', o.current ? 'bg-primary' : 'bg-steel')} />
                <LanguageName option={o} labels={labels} />
              </a>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function SwitcherList({ labels, options }: { labels: LanguageSwitcherLabels; options: Option[] }) {
  const headingId = useId()
  return (
    <div>
      <p className="mb-2 text-eyebrow" id={headingId}>
        {labels.language}
      </p>
      <ul aria-labelledby={headingId} className="grid grid-cols-2 gap-2">
        {options.map((o) => (
          <li key={o.locale}>
            <a
              href={o.href}
              hrefLang={o.locale}
              aria-current={o.current ? 'true' : undefined}
              className={cx(
                'flex min-h-12 items-center gap-2 rounded-sm border px-3 py-1.5',
                o.current ? 'border-primary bg-primary/10' : 'border-border hover:border-border-strong',
              )}
            >
              <LanguageName option={o} labels={labels} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
