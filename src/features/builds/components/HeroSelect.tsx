import { SelectNav } from '@/components/ui/SelectNav'

/** Hero filter as a native select (39 options are too many for chips). Navigates on change. */
export function HeroSelect({ heroes, value, hrefFor }: { heroes: Array<{ slug: string; name: string }>; value: string; hrefFor: Record<string, string> }) {
  return <SelectNav label="Hero" allLabel="All heroes" options={heroes.map((h) => ({ value: h.slug, label: h.name }))} value={value} hrefFor={hrefFor} />
}
