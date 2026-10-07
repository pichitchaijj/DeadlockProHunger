import { Link } from '@/i18n/navigation'
import { useLocale, useTranslations } from 'next-intl'
import { localeEndonyms, locales } from '@/i18n/config'
import { useLocalizedNav } from '@/i18n/nav'
import { BrandMark } from '../BrandMark'
import { LanguageSwitcher, type LanguageSwitcherLabels } from './LanguageSwitcher'
import { LoginPlaceholder } from './LoginPlaceholder'
import { MobileNav } from './MobileNav'
import { MoreMenu } from './MoreMenu'
import { PrimaryNav } from './PrimaryNav'
import { SearchTrigger } from './SearchTrigger'

/**
 * Sticky site header.
 * ≥ lg: brand · primary nav + More · search · sign-in.
 * < lg: brand · search icon · hamburger drawer.
 */
export function SiteHeader() {
  const t = useTranslations('nav')
  const h = useTranslations('header')
  const { primary, secondary } = useLocalizedNav()
  const languages = useTranslations('languages')
  const labels = { more: t('more'), later: t('later') }
  const switcher: LanguageSwitcherLabels = {
    language: t('language'),
    current: t('languageCurrent', { name: localeEndonyms[useLocale()] }),
    names: Object.fromEntries(locales.map((l) => [l, languages(l)])) as LanguageSwitcherLabels['names'],
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/85 backdrop-blur-md supports-[not(backdrop-filter:blur(0))]:bg-bg">
      {/* Hairline accent along the top edge: the brand's one restrained glow in the chrome. */}
      <div aria-hidden="true" className="h-px bg-linear-to-r from-transparent via-primary/60 to-transparent" />
      {/* Below 360px (e.g. 320px phones) gaps tighten and the logo steps down so brand + 2 icons fit. */}
      <div className="page-container flex h-16 items-stretch gap-6 max-[359px]:gap-2">
        <Link href="/" aria-label={h('home')} className="flex shrink-0 items-center">
          <BrandMark boot />
        </Link>

        <nav aria-label={h('primaryNav')} className="hidden items-stretch lg:flex">
          <PrimaryNav items={primary} />
          <MoreMenu items={secondary} labels={labels} />
        </nav>

        <div className="ml-auto flex items-center gap-2 max-[359px]:gap-0">
          {/* Wrappers own responsive visibility so component display classes never conflict with it. */}
          <div className="hidden xl:block">
            <SearchTrigger variant="field" />
          </div>
          <div className="xl:hidden">
            <SearchTrigger variant="icon" />
          </div>
          <div className="hidden lg:block">
            <LanguageSwitcher variant="menu" labels={switcher} />
          </div>
          <div className="hidden lg:block">
            <LoginPlaceholder />
          </div>
          <div className="lg:hidden">
            <MobileNav primary={primary} secondary={secondary} labels={labels} languages={switcher} />
          </div>
        </div>
      </div>
    </header>
  )
}
