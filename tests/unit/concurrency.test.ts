import { describe, expect, it } from 'vitest'
import { mapLimit } from '@/lib/concurrency'

const tick = () => new Promise((r) => setTimeout(r, 1))

describe('mapLimit', () => {
  it('keeps input order and never exceeds the limit', async () => {
    let active = 0
    let peak = 0
    const out = await mapLimit(Array.from({ length: 20 }, (_, i) => i), 4, async (n) => {
      active++
      peak = Math.max(peak, active)
      await tick()
      active--
      return n * 2
    })
    expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2))
    expect(peak).toBe(4)
  })

  it('starts no new call after a rejection; calls in flight finish; the first error is thrown', async () => {
    const started: number[] = []
    const run = mapLimit([0, 1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      started.push(n)
      await tick()
      if (n === 1) throw new Error('refused')
      return n
    })
    await expect(run).rejects.toThrow('refused')
    await tick()
    await tick()
    expect(started.length).toBeLessThan(8)
    expect(started.slice(0, 3)).toEqual([0, 1, 2])
  })

  it('handles empty input and limits above the item count', async () => {
    await expect(mapLimit([], 5, async (n: number) => n)).resolves.toEqual([])
    await expect(mapLimit([1, 2], 10, async (n) => n)).resolves.toEqual([1, 2])
  })
})
