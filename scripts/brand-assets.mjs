/**
 * Builds the web logo files from the owner's master logo (docs/DESIGN.md § Logo).
 *   node scripts/brand-assets.mjs "<path to LOGO.png>"
 *
 * The master is a glow-on-black PNG whose black background is only partly transparent (alpha ~10–80),
 * which would show as a dark box on the site's navy. Black is therefore keyed out ("unmultiplied"):
 * alpha × max(r,g,b), colors divided back, so glows and colors stay and the black falls away. Near-black
 * noise (max channel ≤ NOISE) is dropped so no faint box shows around the crop.
 *
 * Crops are measured on the 2172×724 master. A different master needs new crop boxes.
 * Outputs:
 *   public/brand/logo-primary{-640,}.webp     full logo with tagline, 640 and 960 wide (Home hero, brand moments)
 *   public/brand/logo-horizontal{,@2x}.webp   mark + wordmark, tagline left out (illegible at header size)
 *   public/brand/logo-icon{,@2x}.webp         mark only
 *   public/brand/logo-mark-lg.webp            mark only, 360px (Home backdrop emblem, drawn faint)
 *   src/app/icon.png, src/app/apple-icon.png  favicon (transparent) and iOS icon (on the page navy)
 */
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const master = process.argv[2]
if (!master) {
  console.error('usage: node scripts/brand-assets.mjs <LOGO.png>')
  process.exit(1)
}

const BG = { r: 11, g: 18, b: 32, alpha: 1 } // --color-bg #0B1220
const CROPS = {
  primary: { left: 30, top: 95, width: 2110, height: 510 },
  horizontal: { left: 40, top: 100, width: 2095, height: 495 },
  // Stops before the wordmark's first letter (x ≥ 500).
  icon: { left: 32, top: 108, width: 466, height: 466 },
}
const TAGLINE = { x0: 495, x1: 2100, y0: 480, y1: 525 }
const NOISE = 14

const { data, info } = await sharp(master).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
const W = info.width
if (W !== 2172 || info.height !== 724) console.warn(`master is ${W}×${info.height}; crop boxes assume 2172×724`)

/** Keys out black: returns a new RGBA buffer, optionally erasing the tagline band. */
function keyed({ dropTagline }) {
  const out = Buffer.alloc(data.length)
  for (let i = 0; i < data.length; i += 4) {
    const raw = Math.max(data[i], data[i + 1], data[i + 2])
    // Ramp from NOISE so the cut-off is soft, not a hard edge.
    const m = raw <= NOISE ? 0 : raw
    const weight = raw <= NOISE ? 0 : Math.min(1, (raw - NOISE) / NOISE)
    const p = i / 4
    const x = p % W
    const y = Math.floor(p / W)
    const inTagline = dropTagline && x >= TAGLINE.x0 && x < TAGLINE.x1 && y >= TAGLINE.y0 && y < TAGLINE.y1
    if (m === 0 || inTagline) continue // fully transparent
    out[i] = Math.round((data[i] * 255) / m)
    out[i + 1] = Math.round((data[i + 1] * 255) / m)
    out[i + 2] = Math.round((data[i + 2] * 255) / m)
    out[i + 3] = Math.round(((data[i + 3] * m) / 255) * weight)
  }
  return sharp(out, { raw: { width: W, height: info.height, channels: 4 } })
}

const full = await keyed({ dropTagline: false }).png().toBuffer()
const noTagline = await keyed({ dropTagline: true }).png().toBuffer()
const crop = (buf, box) => sharp(buf).extract(box)

mkdirSync('public/brand', { recursive: true })
const webp = { quality: 86, alphaQuality: 90, effort: 6 }

await crop(full, CROPS.primary).resize({ width: 960 }).webp(webp).toFile('public/brand/logo-primary.webp')
await crop(full, CROPS.primary).resize({ width: 640 }).webp(webp).toFile('public/brand/logo-primary-640.webp')
for (const [suffix, height] of [['', 32], ['@2x', 64]]) {
  await crop(noTagline, CROPS.horizontal).resize({ height }).webp(webp).toFile(`public/brand/logo-horizontal${suffix}.webp`)
}
for (const [suffix, size] of [['', 64], ['@2x', 128]]) {
  await crop(full, CROPS.icon).resize(size, size).webp(webp).toFile(`public/brand/logo-icon${suffix}.webp`)
}
// Decorative and drawn faint (~350px), so lighter settings than the visible logos.
await crop(full, CROPS.icon).resize(360, 360).webp({ ...webp, quality: 70, alphaQuality: 70 }).toFile('public/brand/logo-mark-lg.webp')
const icon = await crop(full, CROPS.icon).png().toBuffer()
await sharp(icon).resize(256, 256).png({ compressionLevel: 9, palette: true, colors: 128 }).toFile('src/app/icon.png')
await sharp(icon).resize(150, 150).extend({ top: 15, bottom: 15, left: 15, right: 15, background: BG }).flatten({ background: BG }).png({ compressionLevel: 9, palette: true, colors: 128 }).toFile('src/app/apple-icon.png')

for (const f of ['public/brand/logo-mark-lg.webp', 'public/brand/logo-primary.webp', 'public/brand/logo-primary-640.webp', 'public/brand/logo-horizontal.webp', 'public/brand/logo-horizontal@2x.webp', 'public/brand/logo-icon.webp', 'public/brand/logo-icon@2x.webp', 'src/app/icon.png', 'src/app/apple-icon.png']) {
  const m = await sharp(f).metadata()
  console.log(`${f}  ${m.width}×${m.height}`)
}
