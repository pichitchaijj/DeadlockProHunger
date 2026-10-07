/* Which upstream hero image URL to use. Plain module: loaders, jobs and tests can import it. */
type HeroImages = { icon_image_small?: string | null; icon_image_small_webp?: string | null; icon_hero_card?: string | null; icon_hero_card_webp?: string | null } | null | undefined

/** Small hero icon URL: the WebP variant (about half the PNG's bytes), PNG as fallback (docs/PERFORMANCE.md § Images). */
export const heroIconUrl = (images: HeroImages) => images?.icon_image_small_webp ?? images?.icon_image_small ?? null

/** Hero card URL, WebP first. */
export const heroCardUrl = (images: HeroImages) => images?.icon_hero_card_webp ?? images?.icon_hero_card ?? null

type RankImages = { large?: string | null; large_webp?: string | null } | null | undefined

/**
 * Rank tier badge URL (assets CDN, WebP first). Per-subrank images exist too, but they are rendered on
 * demand by api.deadlock-api.com: using them would make every visitor's browser call the API directly,
 * so the subrank is shown as text (RankBadge) instead.
 */
export const rankImageUrl = (images: RankImages) => images?.large_webp ?? images?.large ?? null
