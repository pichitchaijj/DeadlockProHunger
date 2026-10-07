import { cx } from '@/lib/cx'
import { HeroImage } from './HeroImage'

type HeroPortraitProps = {
  name: string
  /** Image URL from the assets API (`images.icon_image_small` etc.). */
  src?: string
  size?: 'sm' | 'md' | 'lg'
  /** Name printed alongside: alt="" (see HeroImage). */
  decorative?: boolean
  className?: string
}

const sizes = { sm: 32, md: 48, lg: 96 } as const
const text = { sm: 'text-sm', md: 'text-lg', lg: 'text-3xl' } as const

/** Square hero identifier in a framed tile. Rendering and fallback live in HeroImage. */
export function HeroPortrait({ name, src, size = 'md', decorative, className }: HeroPortraitProps) {
  const px = sizes[size]
  return (
    <span className={cx('inline-flex shrink-0 overflow-hidden rounded-sm border border-border-strong', text[size], className)}>
      <HeroImage name={name} src={src} width={px} height={px} decorative={decorative} />
    </span>
  )
}
