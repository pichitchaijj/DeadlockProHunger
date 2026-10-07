/*
 * Accessibility audit harness, part 2 of 3 (docs/ACCESSIBILITY.md § Method). Not project dependencies:
 *   npm i --no-save playwright-core axe-core pngjs
 *   npm run build && npx next start -p 3123
 *   CHROME_PATH="<path to chrome>" node scripts/a11y-contrast.mjs out.json / /meta /heroes ...
 * (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1 so "/" routes aren't rewritten.)
 * Pixel contrast for text axe cannot judge (over gradients/images): the text is hidden, its box is screenshotted, and the 90th-percentile background luminance is compared with the text color.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { chromium } from 'playwright-core'
import { PNG } from 'pngjs'
const require = createRequire(import.meta.url)
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8')
const [outPath, ...routes] = process.argv.slice(2)
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const results = []
for (const [route, profile] of routes.flatMap((r) => [[r, 'desktop'], [r, 'mobile']])) {
  const ctx = await browser.newContext(profile === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto((process.env.AUDIT_BASE ?? 'http://localhost:3123') + route, { waitUntil: 'load' }); await page.waitForTimeout(3000)
  await page.addScriptTag({ content: AXE })
  const targets = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: ['color-contrast'], resultTypes: ['incomplete'] })
    return (r.incomplete[0]?.nodes ?? []).map((n) => n.target[0]).slice(0, 60)
  })
  for (const sel of targets) {
    const el = page.locator(sel).first()
    try {
      await el.scrollIntoViewIfNeeded({ timeout: 2000 })
      const info = await el.evaluate((e) => { const s = getComputedStyle(e); const m = s.color.match(/\d+(\.\d+)?/g).map(Number); const size = parseFloat(s.fontSize); const bold = +s.fontWeight >= 700; e.dataset.prevColor = e.style.color; e.style.setProperty('color', 'transparent', 'important'); e.style.setProperty('text-shadow', 'none', 'important'); if (e instanceof SVGElement) { const f = getComputedStyle(e).fill.match(/\d+(\.\d+)?/g); if (f) { m.splice(0, 3, ...f.slice(0, 3).map(Number)) } e.style.setProperty('fill', 'transparent', 'important') } for (const c of e.querySelectorAll('*')) c.style.setProperty('color', 'transparent', 'important'); return { rgb: m.slice(0, 3), alpha: m[3] ?? 1, size, bold, text: e.textContent.trim().slice(0, 30) } })
      const buf = await el.screenshot({ timeout: 3000 })
      await el.evaluate((e) => { e.style.color = e.dataset.prevColor; e.style.removeProperty('fill'); for (const c of e.querySelectorAll('*')) c.style.removeProperty('color') })
      const png = PNG.sync.read(buf)
      const ls = []
      for (let i = 0; i < png.data.length; i += 4) ls.push(lum(png.data[i], png.data[i + 1], png.data[i + 2]))
      ls.sort((a, b) => a - b)
      const bg = ls[Math.floor(ls.length * 0.9)]
      const fg = lum(...info.rgb)
      const large = info.size >= 24 || (info.bold && info.size >= 18.66)
      const r = ratio(fg, bg)
      results.push({ route, profile, sel: sel.slice(0, 80), text: info.text, ratio: +r.toFixed(2), need: large ? 3 : 4.5, pass: r >= (large ? 3 : 4.5), alpha: info.alpha })
    } catch (e) { results.push({ route, profile, sel: sel.slice(0, 80), error: String(e).slice(0, 80) }) }
  }
  await ctx.close()
}
writeFileSync(outPath, JSON.stringify(results, null, 2))
const fails = results.filter((r) => r.pass === false)
console.log('measured', results.filter((r) => r.ratio).length, 'errors', results.filter((r) => r.error).length, 'fails', fails.length, 'min', Math.min(...results.filter((r) => r.ratio).map((r) => r.ratio)))
for (const f of fails.slice(0, 30)) console.log(f.route, f.profile, f.ratio, '<', f.need, JSON.stringify(f.text), f.sel)
await browser.close()
