/*
 * Performance audit harness (docs/PERFORMANCE.md § Method). Not a project dependency:
 *   npm i --no-save playwright-core
 *   npm run build && rm -rf .next/cache/fetch-cache            # cold data cache
 *   DEADLOCK_API_TRACE=1 npx next start -p 3123 > server.log    # trace = upstream call log
 *   CHROME_PATH="/path/to/chrome" node scripts/perf-audit.mjs server.log audit.json / /meta /heroes ...
 * (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1 so "/" routes aren't rewritten.)
 * Each route is loaded three times: desktop cold, desktop warm, mobile (390×844, 4× CPU slowdown).
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [logPath, outPath, ...routes] = process.argv.slice(2)
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3123'
const logSize = () => readFileSync(logPath, 'utf8').length
const apiLines = (from) => readFileSync(logPath, 'utf8').slice(from).split('\n').filter((l) => l.includes('[api] '))

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })

async function measure(route, profile) {
  const ctx = await browser.newContext(
    profile === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  )
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  if (profile === 'mobile') await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || /hydrat/i.test(m.text())) errors.push(m.text().slice(0, 200))
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`))
  await page.addInitScript(() => {
    window.__perf = { cls: 0, lcp: 0, longTasks: 0, longTaskMs: 0 }
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__perf.cls += e.value })).observe({ type: 'layout-shift', buffered: true })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.lcp = e.startTime })).observe({ type: 'largest-contentful-paint', buffered: true })
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { window.__perf.longTasks++; window.__perf.longTaskMs += Math.max(0, e.duration - 50) })).observe({ type: 'longtask', buffered: true })
  })
  const from = logSize()
  const t0 = Date.now()
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForTimeout(2500)
  const wall = Date.now() - t0
  const lcpBeforeScroll = await page.evaluate(() => Math.round(window.__perf.lcp)) // LCP must be read before any scrolling
  // Scroll through the page so lazy content, reveals and below-the-fold shifts are counted.
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(800)
  const m = await page.evaluate(() => {
    const res = performance.getEntriesByType('resource')
    const nav = performance.getEntriesByType('navigation')[0]
    const sum = (list, k) => list.reduce((n, r) => n + (r[k] || 0), 0)
    const js = res.filter((r) => r.initiatorType === 'script' || /\.js(\?|$)/.test(r.name))
    const css = res.filter((r) => /\.css(\?|$)/.test(r.name))
    const fonts = res.filter((r) => /\.woff2?(\?|$)/.test(r.name))
    const imgs = res.filter((r) => r.initiatorType === 'img' || /\/_next\/image|\.(png|jpe?g|webp|avif|svg)(\?|$)/.test(r.name))
    return {
      ttfb: Math.round(nav.responseStart - nav.requestStart),
      htmlKB: +(nav.transferSize / 1024).toFixed(1),
      htmlDecodedKB: +(nav.decodedBodySize / 1024).toFixed(1),
      jsFiles: js.length,
      jsKB: +(sum(js, 'transferSize') / 1024).toFixed(1),
      jsDecodedKB: +(sum(js, 'decodedBodySize') / 1024).toFixed(1),
      cssKB: +(sum(css, 'transferSize') / 1024).toFixed(1),
      fonts: fonts.map((f) => f.name.split('/').pop() + ':' + Math.round(f.transferSize / 1024) + 'KB'),
      images: imgs.length,
      imagesKB: +(sum(imgs, 'transferSize') / 1024).toFixed(1),
      imgHosts: [...new Set(imgs.map((i) => new URL(i.name).host))],
      domNodes: document.getElementsByTagName('*').length,
      cls: +window.__perf.cls.toFixed(4),
      lcpAfterScroll: Math.round(window.__perf.lcp),
      longTasks: window.__perf.longTasks,
      tbtMs: Math.round(window.__perf.longTaskMs),
    }
  })
  const api = apiLines(from)
  await ctx.close()
  return { route, profile, wallMs: wall, lcp: lcpBeforeScroll, ...m, apiCalls: api.length, apiSlow: api.filter((l) => +(/ (\d+)ms/.exec(l)?.[1] ?? 0) > 50).length, errors }
}

const results = []
for (const route of routes) {
  const cold = await measure(route, 'desktop') // first hit after cache clear: cold data cache
  const warm = await measure(route, 'desktop')
  const mobile = await measure(route, 'mobile')
  results.push({ route, cold, warm, mobile })
  console.log(route, JSON.stringify({ coldTTFB: cold.ttfb, coldApi: cold.apiCalls, coldSlow: cold.apiSlow, warmTTFB: warm.ttfb, warmApi: warm.apiCalls, warmSlow: warm.apiSlow, js: warm.jsKB, jsDec: warm.jsDecodedKB, html: warm.htmlKB, cls: mobile.cls, clsD: warm.cls, lcpM: mobile.lcp, tbtM: mobile.tbtMs, dom: warm.domNodes, imgs: warm.images, errs: [...cold.errors, ...mobile.errors].length }))
}
writeFileSync(outPath, JSON.stringify(results, null, 2))
await browser.close()
