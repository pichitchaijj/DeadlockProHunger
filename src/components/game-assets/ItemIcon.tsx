import { cx } from '@/lib/cx'
import { HeroImage } from './HeroImage'

const SLOT_BORDER: Record<string, string> = {
  weapon: 'border-orange/60',
  vitality: 'border-positive/60',
  spirit: 'border-pink/60',
}

/**
 * Shop item identifier. Art via the isolated image component (with fallback);
 * the slot is shown by border color and always named in the title/alt text.
 */
export function ItemIcon({
  name,
  src,
  slot,
  tier,
  size = 36,
  decorative,
  className,
}: {
  name: string
  src: string | null
  slot: string | null
  tier: number | null
  size?: number
  /** Name printed alongside: alt="" (see HeroImage). */
  decorative?: boolean
  className?: string
}) {
  return (
    <span
      title={`${name}${slot ? ` · ${slot}` : ''}${tier ? ` · tier ${tier}` : ''}`}
      className={cx('relative inline-flex shrink-0 overflow-hidden rounded-xs border-2 text-[0.6875rem]', (slot && SLOT_BORDER[slot]) ?? 'border-border-strong', className)}
    >
      <HeroImage name={name} src={src} width={size} height={size} decorative={decorative} />
    </span>
  )
}

/** Ability identifier: same isolation and fallback. */
export function AbilityIcon({ name, src, size = 32, decorative, className }: { name: string; src: string | null; size?: number; decorative?: boolean; className?: string }) {
  return (
    <span title={name} className={cx('inline-flex shrink-0 overflow-hidden rounded-sm border border-border-strong text-xs', className)}>
      <HeroImage name={name} src={src} width={size} height={size} decorative={decorative} />
    </span>
  )
}
