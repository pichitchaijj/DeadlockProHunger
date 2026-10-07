/*
 * Accessibility audit harness, part 1 of 3 (docs/ACCESSIBILITY.md § Method). Not project dependencies:
 *   npm i --no-save playwright-core axe-core pngjs
 *   npm run build && npx next start -p 3123
 *   CHROME_PATH="<path to chrome>" node scripts/a11y-audit.mjs out.json / /meta /heroes ...
 * (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1 so "/" routes aren't rewritten.)
 * axe-core (WCAG 2.0–2.2 A/AA + best practice) and structural checks per route, desktop and mobile: one h1, heading skips, landmarks, touch targets, chart text alternatives, table semantics, looping animations under reduced motion.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'

const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [outPath, ...routes] = process.argv.slice(2)
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3123'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })

async function audit(route, profile) {
  const ctx = await browser.newContext(
    profile === 'mobile'
      ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' }
      : { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' },
  )
  const page = await ctx.newPage()
  await page.goto(BASE + route, { waitUntil: 'load', timeout: 120_000 })
  await page.waitForTimeout(2500)
  // Reveal everything below the fold before checking (reveals start hidden).
  await page.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(500)
  await page.addScriptTag({ content: AXE })
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] }, resultTypes: ['violations', 'incomplete'] })
    const slim = (list) => list.map((v) => ({ id: v.id, impact: v.impact, help: v.help, count: v.nodes.length, targets: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + (n.failureSummary || '').split('\n').slice(1, 2).join(' ').slice(0, 160)) }))
    return { violations: slim(r.violations), incomplete: slim(r.incomplete.filter((v) => v.id === 'color-contrast')) }
  })
  const structure = await page.evaluate((profile) => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
    const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible).map((h) => ({ level: +h.tagName[1], text: h.textContent.trim().replace(/\s+/g, ' ').slice(0, 60) }))
    const skips = []
    headings.forEach((h, i) => { if (i > 0 && h.level > headings[i - 1].level + 1) skips.push(`${headings[i - 1].level}→${h.level} at "${h.text}"`) })
    const landmarks = { header: document.querySelectorAll('header').length, nav: [...document.querySelectorAll('nav')].map((n) => n.getAttribute('aria-label') || '(unlabeled)'), main: document.querySelectorAll('main').length, footer: document.querySelectorAll('footer').length }
    // Touch targets (mobile): interactive elements smaller than 44×44, excluding inline links inside running text.
    const small = []
    if (profile === 'mobile') {
      for (const el of document.querySelectorAll('a[href],button,input,select,textarea,summary,[role=button],[role=tab],[tabindex]:not([tabindex="-1"])')) {
        if (!visible(el) || el.classList.contains('sr-only')) continue // visually hidden until focused (skip link)
        // Stretched links (::after absolutely positioned over the card) are as big as their positioned ancestor.
        const after = getComputedStyle(el, '::after')
        const stretched = after.position === 'absolute' && after.content !== 'none' && el.offsetParent
        const r = stretched ? el.offsetParent.getBoundingClientRect() : el.getBoundingClientRect()
        const inText = el.tagName === 'A' && el.closest('p,li') && getComputedStyle(el).display === 'inline'
        if ((r.width < 44 || r.height < 44) && !inText) small.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" .${String(el.className).slice(0, 50)}`)
      }
    }
    // Charts: SVGs that carry data (not tiny icons) need a text alternative.
    const charts = [...document.querySelectorAll('svg')].filter((s) => { const r = s.getBoundingClientRect(); return r.width >= 60 && r.height >= 24 && visible(s) })
      .map((s) => {
        const fig = s.closest('figure')
        const labelled = s.getAttribute('aria-label') || s.getAttribute('aria-labelledby') || s.querySelector('title') || (fig && fig.querySelector('figcaption'))
        const hidden = s.getAttribute('aria-hidden') === 'true' || !!s.closest('[aria-hidden="true"]')
        const sr = s.parentElement && [...s.parentElement.querySelectorAll('.sr-only')].some((x) => x.textContent.trim().length > 10)
        return { hidden, labelled: !!labelled, srText: !!sr, role: s.getAttribute('role'), cls: String(s.className.baseVal || '').slice(0, 40), parent: (s.parentElement?.getAttribute('aria-label') || '').slice(0, 50) }
      })
    const tables = [...document.querySelectorAll('table')].map((t) => ({ caption: !!t.querySelector('caption') || !!t.getAttribute('aria-label') || !!t.getAttribute('aria-labelledby'), th: t.querySelectorAll('th').length, thScope: t.querySelectorAll('th[scope]').length, html: t.querySelectorAll('th').length ? undefined : (t.closest('[id],section,figure,div')?.className?.toString().slice(0, 60) + ' :: ' + t.outerHTML.slice(0, 140)) }))
    const imgsNoAlt = [...document.images].filter((i) => !i.hasAttribute('alt')).length
    return { headings: headings.map((h) => 'h' + h.level + ' ' + h.text), h1: headings.filter((h) => h.level === 1).length, skips, landmarks, small: small.slice(0, 40), smallCount: small.length, charts, tables, imgsNoAlt, lang: document.documentElement.lang }
  }, profile)
  // Reduced motion: no animation may still be running in a loop.
  const loops = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.getTiming().iterations === Infinity).map((a) => (a.animationName || a.constructor.name) + ' on ' + (a.effect.target?.className?.baseVal ?? a.effect.target?.className ?? '').toString().slice(0, 40)))
  await ctx.close()
  return { route, profile, axe, structure, reducedMotionLoops: loops }
}

const out = []
for (const route of routes) {
  for (const profile of ['desktop', 'mobile']) {
    const r = await audit(route, profile)
    out.push(r)
    const v = r.axe.violations.map((x) => `${x.id}(${x.impact},${x.count})`).join(' ')
    console.log(`${route} [${profile}] axe: ${v || 'none'} | h1=${r.structure.h1} skips=${r.structure.skips.length} small=${r.structure.smallCount} charts=${r.structure.charts.length} unlabeledCharts=${r.structure.charts.filter((c) => !c.hidden && !c.labelled && !c.srText).length} loops=${r.reducedMotionLoops.length}`)
  }
}
writeFileSync(outPath, JSON.stringify(out, null, 2))
await browser.close()
