import { SelectNav } from '@/components/ui/SelectNav'

/**
 * Hero filter as a native select (39 options are too many for chips). Navigates on change.
 * Shared with pages that aren't localized yet, so its labels come from the caller (English by default).
 */
export function HeroSelect({
  heroes,
  value,
  hrefFor,
  label = 'Hero',
  allLabel = 'All heroes',
}: {
  heroes: Array<{ slug: string; name: string }>
  value: string
  hrefFor: Record<string, string>
  label?: string
  allLabel?: string
}) {
  return <SelectNav label={label} allLabel={allLabel} options={heroes.map((h) => ({ value: h.slug, label: h.name }))} value={value} hrefFor={hrefFor} />
}
