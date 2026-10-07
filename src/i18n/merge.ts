/*
 * English is the source locale: every other locale's messages are laid over a full English copy, key
 * by key, so a missing translation shows English, never a raw key.
 */

export type MessageTree = { [key: string]: string | MessageTree }

export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : DeepPartial<T[K]> }

/** `source` with every key that `override` defines as the same kind (string or group) replaced. */
export function mergeMessages<T extends MessageTree>(source: T, override: DeepPartial<T> | undefined): T {
  if (!override) return source
  const out: MessageTree = { ...source }
  for (const [key, base] of Object.entries(source)) {
    const value = (override as MessageTree)[key]
    if (value === undefined) continue
    if (typeof base === 'string') {
      if (typeof value === 'string' && value.trim() !== '') out[key] = value
    } else if (typeof value === 'object' && value !== null) {
      out[key] = mergeMessages(base, value as DeepPartial<MessageTree>)
    }
  }
  return out as T
}

/** Dotted keys present in `source` but missing (or empty) in `override`: a locale's untranslated keys. */
export function missingKeys(source: MessageTree, override: MessageTree | undefined, prefix = ''): string[] {
  return Object.entries(source).flatMap(([key, base]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const value = override?.[key]
    if (typeof base === 'string') return typeof value === 'string' && value.trim() !== '' ? [] : [path]
    return missingKeys(base, typeof value === 'object' ? value : undefined, path)
  })
}

/** Dotted keys in `override` that `source` doesn't have (typos, removed keys): never shown, so flagged. */
export function unknownKeys(source: MessageTree, override: MessageTree, prefix = ''): string[] {
  return Object.entries(override).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key
    const base = source[key]
    if (base === undefined || typeof base !== typeof value) return [path]
    return typeof value === 'object' ? unknownKeys(base as MessageTree, value, path) : []
  })
}
