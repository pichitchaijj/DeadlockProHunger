import Link from 'next/link'
import { primaryNav } from '@/config/navigation'
import type { ReactNode } from 'react'
import { ArrowRightIcon, BuildsIcon, HeroesIcon, MatchesIcon, MetaIcon } from '@/components/ui/icons'

const ENTRY_HREFS = ['/meta', '/heroes', '/builds', '/matches']
const ENTRIES = ENTRY_HREFS.map((href) => primaryNav.find((item) => item.href === href)!)
const ICONS: Record<string, ReactNode> = {
  '/meta': <MetaIcon size={28} />,
  '/heroes': <HeroesIcon size={28} />,
  '/builds': <BuildsIcon size={28} />,
  '/matches': <MatchesIcon size={28} />,
}

/** Four editorial entry tiles into the main sections. */
export function QuickEntry() {
  return (
    <ul className="grid gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
      {ENTRIES.map((item, i) => (
        <li key={item.href} className="flex">
          <Link
            href={item.href}
            className="group relative flex min-h-40 flex-1 flex-col justify-between gap-6 bg-surface p-(--spacing-card) transition-colors duration-(--dur-fast) hover:bg-surface-raised"
          >
            <span aria-hidden="true" className="flex items-center justify-between">
              <span className="text-primary transition-colors duration-(--dur-fast) group-hover:text-highlight">{ICONS[item.href]}</span>
              <span className="font-display text-sm font-bold text-text-muted tabular">0{i + 1}</span>
            </span>
            <span>
              <span className="flex items-center justify-between gap-3 font-display text-display-m font-bold text-text uppercase group-hover:text-highlight">
                {item.label}
                <ArrowRightIcon className="shrink-0 text-primary transition-transform duration-(--dur-fast) ease-awaken group-hover:translate-x-1" />
              </span>
              <span className="mt-1 block text-sm text-text-muted">{item.description}</span>
            </span>
            <span
              aria-hidden="true"
              className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-primary transition-transform duration-(--dur-medium) ease-awaken group-hover:scale-x-100"
            />
          </Link>
        </li>
      ))}
    </ul>
  )
}
