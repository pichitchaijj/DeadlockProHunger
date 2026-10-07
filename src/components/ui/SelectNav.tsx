'use client'

import { useRouter } from 'next/navigation'
import { useId } from 'react'

export type SelectNavOption = { value: string; label: string }

/**
 * Single-select filter for long option lists (too many for Filter chips), as a native select that
 * navigates on change. Every option's URL is computed on the server (`hrefFor`), so state stays in the URL.
 */
export function SelectNav({
  label,
  options,
  value,
  hrefFor,
  allLabel,
}: {
  label: string
  options: SelectNavOption[]
  value: string
  hrefFor: Record<string, string>
  /** Adds a first option with value "all". */
  allLabel?: string
}) {
  const router = useRouter()
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="text-eyebrow">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => router.push(hrefFor[event.target.value], { scroll: false })}
        className="h-11 min-w-0 rounded-sm border border-border-control bg-surface-sunken px-3 font-ui text-sm text-text hover:border-text-muted focus-visible:border-primary"
      >
        {allLabel && <option value="all">{allLabel}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
