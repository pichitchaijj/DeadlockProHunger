/*
 * Accessibility audit harness, part 3 of 3 (docs/ACCESSIBILITY.md § Method). Not project dependencies:
 *   npm i --no-save playwright-core axe-core pngjs
 *   npm run build && npx next start -p 3123
 *   CHROME_PATH="<path to chrome>" node scripts/a11y-keyboard.mjs (MATCH_ID=… PLAYER_ID=… optional)
 * (Git Bash on Windows: prefix with MSYS_NO_PATHCONV=1 so "/" routes aren't rewritten.)
 * Keyboard and dialog behavior: Tab walk with visible focus, skip link, command palette / drawer / More menu (focus in, no escape to the page, Esc, focus return), matches list arrows, timeline roving focus, tabs.
 */
import { chromium } from 'playwright-core'
const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3123'
const MATCH_ID = process.env.MATCH_ID ?? '112020510' // any processed match
const PLAYER_ID = process.env.PLAYER_ID ?? '1871021649' // any public profile
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH })
const report = []
const ok = (name, pass, detail = '') => { report.push({ name, pass, detail }); console.log(pass ? 'PASS' : 'FAIL', name, detail) }

const focusInfo = (page) => page.evaluate(() => {
  const e = document.activeElement
  if (!e || e === document.body) return { tag: 'body' }
  const s = getComputedStyle(e)
  const ring = (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== 'none')
  const r = e.getBoundingClientRect()
  return { tag: e.tagName.toLowerCase(), label: (e.getAttribute('aria-label') || e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40), ring, visible: r.width > 0 && r.height > 0, inDialog: !!e.closest('[role=dialog],dialog[open]') }
})

async function tabWalk(route, profile, stops) {
  const ctx = await browser.newContext(profile === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(2000)
  const noRing = []; const invisible = []; let first = null
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press('Tab')
    const f = await focusInfo(page)
    if (i === 0) first = f
    if (f.tag === 'body') break
    if (!f.ring) noRing.push(`${f.tag} "${f.label}"`)
    if (!f.visible) invisible.push(`${f.tag} "${f.label}"`)
  }
  ok(`${route} [${profile}] focus ring on every stop (${stops} tabs)`, noRing.length === 0, noRing.slice(0, 6).join(' | '))
  ok(`${route} [${profile}] no focus on invisible elements`, invisible.length === 0, invisible.slice(0, 6).join(' | '))
  if (route === '/') {
    ok(`${route} [${profile}] first Tab = skip link`, /skip to content/i.test(first?.label ?? ''), first?.label)
    await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(1000)
    await page.keyboard.press('Tab'); await page.keyboard.press('Enter'); await page.waitForTimeout(200)
    const target = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName)
    ok(`${route} [${profile}] skip link moves focus to main content`, target === 'content' || target === 'MAIN', String(target))
  }
  await ctx.close()
}

async function dialogCheck(name, profile, open) {
  const ctx = await browser.newContext(profile === 'mobile' ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/meta', { waitUntil: 'load' }); await page.waitForTimeout(2000)
  const trigger = await open(page)
  await page.waitForTimeout(400)
  const d = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role=dialog],dialog[open]')].find((x) => x.getBoundingClientRect().width > 0)
    if (!dlg) return null
    const labelled = !!(dlg.getAttribute('aria-label') || (dlg.getAttribute('aria-labelledby') && document.getElementById(dlg.getAttribute('aria-labelledby'))))
    return { modal: dlg.getAttribute('aria-modal') === 'true' || dlg.tagName === 'DIALOG', labelled, focusInside: dlg.contains(document.activeElement) }
  })
  ok(`${name} [${profile}] opens a labelled modal dialog`, !!d && d.modal && d.labelled, JSON.stringify(d))
  ok(`${name} [${profile}] focus moves into the dialog`, !!d?.focusInside)
  let escaped = 0
  const outside = []
  for (const key of [...Array(25).fill('Tab'), ...Array(5).fill('Shift+Tab')]) {
    await page.keyboard.press(key); const f = await focusInfo(page)
    // Leaving the page for browser UI (activeElement = body) is native modal behavior; a page element outside is not.
    if (!f.inDialog && f.tag !== 'body') { escaped++; outside.push(`${f.tag} "${f.label}"`) }
  }
  ok(`${name} [${profile}] Tab / Shift+Tab never reach the page behind (30 presses)`, escaped === 0, outside.slice(0, 4).join(' | '))
  await page.keyboard.press('Escape'); await page.waitForTimeout(400)
  const after = await page.evaluate((t) => ({ open: [...document.querySelectorAll('[role=dialog],dialog[open]')].some((x) => x.getBoundingClientRect().width > 0), back: t ? document.activeElement?.matches(t) : null, active: document.activeElement?.outerHTML.slice(0, 80) }), trigger)
  ok(`${name} [${profile}] Esc closes`, !after.open)
  if (trigger) ok(`${name} [${profile}] focus returns to the trigger`, !!after.back, after.active)
  await ctx.close()
}

if (!process.env.SKIP_WALK) for (const [route, profile, stops] of [['/', 'desktop', 45], ['/', 'mobile', 25], ['/meta', 'desktop', 60], ['/heroes/haze', 'desktop', 60], ['/matches', 'desktop', 40], [`/players/${PLAYER_ID}`, 'desktop', 40], ['/draft?allies=haze', 'desktop', 50]]) await tabWalk(route, profile, stops)

// Command palette by keyboard shortcut and by its trigger button.
await dialogCheck('Command palette (Ctrl+K)', 'desktop', async (page) => { await page.keyboard.press('Control+k'); return null })
await dialogCheck('Command palette (Search button)', 'desktop', async (page) => {
  await page.locator('header button:has-text("Search")').first().evaluate((e) => e.setAttribute('data-audit-trigger', ''))
  await page.locator('[data-audit-trigger]').focus(); await page.keyboard.press('Enter'); return '[data-audit-trigger]'
})
await dialogCheck('Mobile menu drawer', 'mobile', async (page) => {
  await page.locator('header button[aria-label*="enu" i]').first().evaluate((e) => e.setAttribute('data-audit-trigger', ''))
  await page.locator('[data-audit-trigger]').focus(); await page.keyboard.press('Enter'); return '[data-audit-trigger]'
})

// More menu: disclosure semantics, Esc, focus return.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/meta', { waitUntil: 'load' }); await page.waitForTimeout(1500)
  const btn = page.locator('header button:has-text("More")').first()
  await btn.focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(300)
  const expanded = await btn.getAttribute('aria-expanded')
  ok('More menu exposes aria-expanded=true when open', expanded === 'true', String(expanded))
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(100)
  const f1 = await focusInfo(page)
  ok('More menu: ArrowDown moves into the items', f1.tag === 'a', JSON.stringify(f1))
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  const back = await page.evaluate(() => document.activeElement?.textContent?.trim())
  ok('More menu: Esc closes and returns focus to the button', /more/i.test(back ?? '') && (await btn.getAttribute('aria-expanded')) === 'false', back)
  await ctx.close()
}

// Matches list: arrow keys move the selection.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(BASE + '/matches', { waitUntil: 'load' }); await page.waitForTimeout(2000)
  await page.locator('button[data-match]').first().focus()
  await page.keyboard.press('ArrowDown'); await page.waitForTimeout(150)
  const r = await page.evaluate(() => ({ focused: document.activeElement?.getAttribute('data-match'), pressed: document.querySelector('button[data-match][aria-pressed=true]')?.getAttribute('data-match') }))
  ok('Matches: ArrowDown moves focus and selection to the next row', !!r.focused && r.focused === r.pressed, JSON.stringify(r))
  await ctx.close()
}

// Match timeline: one Tab stop for the whole chart, arrows move between events.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  await page.goto(BASE + `/matches/${MATCH_ID}`, { waitUntil: 'load' }); await page.waitForTimeout(2500)
  const stops = await page.evaluate(() => { const svg = document.querySelector('svg[aria-label^="Match timeline"]'); return svg ? { zero: svg.querySelectorAll('[data-marker-id][tabindex="0"]').length, all: svg.querySelectorAll('[data-marker-id]').length } : null })
  ok('Timeline: exactly one Tab stop among the event markers', stops?.zero === 1 && stops.all > 1, JSON.stringify(stops))
  await page.locator('svg[aria-label^="Match timeline"] [data-marker-id][tabindex="0"]').focus()
  const a = await page.evaluate(() => document.activeElement?.getAttribute('data-marker-id'))
  await page.keyboard.press('ArrowRight'); await page.waitForTimeout(100)
  const b = await page.evaluate(() => ({ id: document.activeElement?.getAttribute('data-marker-id'), zero: document.querySelectorAll('svg[aria-label^="Match timeline"] [data-marker-id][tabindex="0"]').length }))
  ok('Timeline: ArrowRight moves focus to the next event (still one Tab stop)', !!b.id && b.id !== a && b.zero === 1, JSON.stringify({ a, b }))
  await page.keyboard.press('Enter'); await page.waitForTimeout(150)
  const sel = await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'))
  ok('Timeline: Enter selects the focused event', sel === 'true', String(sel))
  await ctx.close()
}

// Tablists (if any) follow arrow-key behavior.
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const page = await ctx.newPage()
  for (const route of ['/compare', `/matches/${MATCH_ID}`, '/design']) {
    await page.goto(BASE + route, { waitUntil: 'load' }); await page.waitForTimeout(1500)
    const has = await page.locator('[role=tablist] [role=tab]').count()
    if (!has) continue
    await page.locator('[role=tablist] [role=tab][aria-selected=true]').first().focus()
    const before = await page.evaluate(() => document.activeElement?.textContent)
    await page.keyboard.press('ArrowRight'); await page.waitForTimeout(150)
    const after = await page.evaluate(() => ({ text: document.activeElement?.textContent, role: document.activeElement?.getAttribute('role'), sel: document.activeElement?.getAttribute('aria-selected') }))
    ok(`Tabs on ${route}: ArrowRight moves to the next tab`, after.role === 'tab' && after.text !== before, JSON.stringify(after))
  }
  await ctx.close()
}

console.log(JSON.stringify({ pass: report.filter((r) => r.pass).length, fail: report.filter((r) => !r.pass).length }))
await browser.close()
