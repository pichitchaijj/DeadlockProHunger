import { Reveal } from '@/components/motion/Reveal'
import type { ReactNode } from 'react'
import { SectionHeader } from '@/components/ui/SectionHeader'
import { cx } from '@/lib/cx'

type HomeSectionProps = {
  id: string
  /** Editorial index shown in the eyebrow, e.g. "02". */
  index: string
  kicker: string
  title: string
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
}

/** Numbered editorial section used down the Home page. */
export function HomeSection({ id, index, kicker, title, description, actions, children, className }: HomeSectionProps) {
  return (
    <Reveal as="section" variant="section" aria-labelledby={`${id}-title`} className={cx('page-container flex flex-col gap-6', className)}>
      <SectionHeader
        id={`${id}-title`}
        eyebrow={
          <>
            <span className="text-primary tabular">{index}</span>
            <span aria-hidden="true" className="mx-2 inline-block h-px w-6 translate-y-[-0.25em] bg-steel" />
            {kicker}
          </>
        }
        title={title}
        description={description}
        actions={actions}
      />
      {children}
    </Reveal>
  )
}
