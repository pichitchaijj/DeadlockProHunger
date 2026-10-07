/**
 * Game-asset kill switch (docs/ARCHITECTURE.md § IP/asset isolation).
 * Only components in this folder may render game imagery. With
 * NEXT_PUBLIC_GAME_ASSETS=off every one of them renders an original,
 * same-sized fallback, so layouts never change.
 */
export const gameAssetsEnabled = process.env.NEXT_PUBLIC_GAME_ASSETS !== 'off'

/** Two-letter monogram for fallbacks: "Lady Geist" → "LG", "Seven" → "SE". */
export function monogram(name: string): string {
  const words = name.trim().split(/\s+/)
  const letters = words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2)
  return letters.toUpperCase()
}
