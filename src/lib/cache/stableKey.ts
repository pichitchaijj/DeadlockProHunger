/**
 * Gives a function a fixed source text for Next's `unstable_cache`.
 *
 * `unstable_cache` builds its cache key from `cb.toString()` plus the key parts. The same callback is
 * minified differently in different server bundles (a page vs the cron route), so one dataset would
 * be stored under several keys and a cache warmed in one place would be invisible in another. With a
 * fixed text, the key depends only on the key parts (which must therefore fully identify the data).
 */
export function stableKey<F extends (...args: never[]) => unknown>(name: string, fn: F): F {
  Object.defineProperty(fn, 'toString', { value: () => `stable:${name}`, configurable: true })
  return fn
}
