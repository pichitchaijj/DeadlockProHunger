import { useLocale, useTranslations } from 'next-intl'
import { primaryNav, secondaryNav, type NavItem, type NavLink } from '@/config/navigation'
import { localizeHref } from './config'

/**
 * The site navigation for the active locale (Server Components): labels and descriptions from
 * `Nav.links`, links kept in the current locale. Client nav components receive the result as props,
 * so no translation runtime ships to the browser for them.
 */
export function useLocalizedNav(): { primary: NavLink[]; secondary: NavLink[] } {
  const t = useTranslations('Nav.links')
  const locale = useLocale()
  const localize = (item: NavItem): NavLink => ({
    ...item,
    label: t(`${item.id}.label`),
    description: t(`${item.id}.description`),
    to: localizeHref(item.href, locale),
  })
  return { primary: primaryNav.map(localize), secondary: secondaryNav.map(localize) }
}
