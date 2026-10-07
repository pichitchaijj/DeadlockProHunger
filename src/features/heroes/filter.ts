import type { DirectoryHero } from './loaders'
import type { DirectoryView } from './query'

/** Lowercase, accent-free text for forgiving search ("ivy" matches "Ivy", "mo krill" matches "Mo & Krill"). */
export function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Applies search, role and complexity filters, then sorts.
 * Heroes without data in the scope always sort after heroes with data.
 */
export function filterHeroes(heroes: DirectoryHero[], view: DirectoryView): DirectoryHero[] {
  const terms = normalize(view.q).split(' ').filter(Boolean)
  const matches = heroes.filter((hero) => {
    if (view.role !== 'all' && hero.role !== view.role) return false
    if (view.complexity !== null && hero.complexity !== view.complexity) return false
    if (terms.length === 0) return true
    const haystack = normalize(`${hero.name} ${hero.role ?? ''}`)
    return terms.every((term) => haystack.includes(term))
  })

  if (view.sort === 'name') return matches.sort((a, b) => a.name.localeCompare(b.name))
  const key = view.sort
  return matches.sort((a, b) => {
    if (!a.stats || !b.stats) return a.stats ? -1 : b.stats ? 1 : a.name.localeCompare(b.name)
    return b.stats[key] - a.stats[key] || a.name.localeCompare(b.name)
  })
}
