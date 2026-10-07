import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { primaryNav, secondaryNav } from '@/config/navigation'

describe('navigation', () => {
  // `built` turns prefetching on; a wrong flag either prefetches a 404 on every page view or slows real pages.
  it.each([...primaryNav, ...secondaryNav].map((item) => [item.href, item.built] as const))('%s built=%s matches the app routes', (href, built) => {
    expect(existsSync(join('src/app', href, 'page.tsx'))).toBe(built)
  })
})
