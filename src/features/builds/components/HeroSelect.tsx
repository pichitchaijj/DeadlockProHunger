'use client'

import { useRouter } from 'next/navigation'
import { useId } from 'react'

/** Hero filter as a native select (39 options are too many for chips). Navigates on change. */
export function HeroSelect({ heroes, value, hrefFor }: { heroes: Array<{ slug: string; name: string }>; value: string; hrefFor: Record<string, string> }) {
  const router = useRouter()
  const id = useId()
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-eyebrow">
        Hero
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => router.push(hrefFor[event.target.value], { scroll: false })}
        className="h-11 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary"
      >
        <option value="all">All heroes</option>
        {heroes.map((h) => (
          <option key={h.slug} value={h.slug}>
            {h.name}
          </option>
        ))}
      </select>
    </div>
  )
}
