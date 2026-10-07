import { useTranslations } from 'next-intl'
import { primaryNav, secondaryNav, type NavItem } from '@/config/navigation'

/**
 * The site navigation for the active locale (Server Components): labels and descriptions from
 * `Nav.links`. `href` stays the app path; the locale-aware Link (./navigation.ts) adds the prefix.
 * Client nav components receive the result as props, so no translations ship to the browser for them.
 */
export function useLocalizedNav(): { primary: NavItem[]; secondary: NavItem[] } {
  const t = useTranslations('nav.links')
  const localize = (item: NavItem): NavItem => ({
    ...item,
    label: t(`${item.id}.label`),
    description: t(`${item.id}.description`),
  })
  return { primary: primaryNav.map(localize), secondary: secondaryNav.map(localize) }
}
