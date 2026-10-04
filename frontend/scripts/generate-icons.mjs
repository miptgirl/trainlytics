#!/usr/bin/env node
// Generates the Trainlytics PWA icon set: a skeuomorphic sage tile with a
// segmented progress ring around a heart holding a bar chart.
//
// The artwork is SVG (lighting filters give the matte clay look). Headless
// Chromium renders a 2048px master per variant and macOS `sips` downsamples
// it, so every PNG is supersampled.
//
// Usage (from frontend/):  node scripts/generate-icons.mjs
// Needs Playwright's Chromium (`npx playwright install chromium`) or CHROME=<binary>.

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PUBLIC = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const MASTER = 2048

// "Minimal & Clean" palette, plus in-between shades for gradients.
const C = {
  sage: '#7E9B76',
  deepSage: '#4F6B52',
  lightSage: '#B8C9B2',
  surface: '#FFFDF8',
  border: '#E8E4DA',
  dustyRose: '#C98F8F',
  blush: '#E8CACA',
  shadow: '#1C2A1E',
}

// All geometry lives in a 1024×1024 artboard; proportions are measured off
// the reference artwork.
const CX = 512
const CY = 512
const CORNER = 229 // ≈ Apple's 22.4% icon corner

// Ring of four flat-ended segments. Angles in degrees, clockwise from
// 3 o'clock, at the visible ends.
const RING_R = 349
const RING_W = 94
const SEG_CORNER = 26
const SEGMENTS = [
  { from: 167, to: 274.5, paint: 'cream' },
  { from: 279, to: 331, paint: 'rose' },
  { from: 336, to: 443.5, paint: 'green' },
  { from: 88, to: 162.5, paint: 'cream' },
]

const f = (n) => +n.toFixed(2)

function polar(r, deg) {
  const a = (deg * Math.PI) / 180
  return [f(CX + r * Math.cos(a)), f(CY + r * Math.sin(a))]
}

// Annular sector shrunk by SEG_CORNER; drawn with a round-joined stroke of
// 2 × SEG_CORNER it grows back to full size with rounded corners.
function segmentPath({ from, to }) {
  const ri = RING_R - RING_W / 2 + SEG_CORNER
  const ro = RING_R + RING_W / 2 - SEG_CORNER
  const d = (SEG_CORNER / RING_R) * (180 / Math.PI)
  const [a1, a2] = [from + d, to - d]
  const large = a2 - a1 > 180 ? 1 : 0
  const [x1, y1] = polar(ro, a1)
  const [x2, y2] = polar(ro, a2)
  const [x3, y3] = polar(ri, a2)
  const [x4, y4] = polar(ri, a1)
  return `M${x1} ${y1}A${ro} ${ro} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${ri} ${ri} 0 ${large} 0 ${x4} ${y4}Z`
}

// Wide, squat heart with a sharp notch; its tip pokes out below the bars.
// Left half as cubic segments from the notch to the tip, mirrored for the right.
const HEART_LEFT = [
  [[472, 359.4], [455.5, 339.5], [410.5, 339.5]],
  [[335.1, 339.5], [274, 396.4], [274, 466.5]],
  [[274, 600], [395, 690], [512, 750]],
]
const mirror = ([x, y]) => [1024 - x, y]
const heartPath =
  'M512 393' +
  HEART_LEFT.map((seg) => 'C' + seg.map((p) => p.join(' ')).join(' ')).join('') +
  [...HEART_LEFT]
    .reverse()
    .map((seg, i, all) => {
      const end = i + 1 < all.length ? all[i + 1][2] : [512, 393]
      return 'C' + [seg[1], seg[0], end].map((p) => mirror(p).join(' ')).join(' ')
    })
    .join('') +
  'Z'

// The bars are holes cut through the heart, so they sit inside its outline
// with a clay wall of at least ~35 units around each.
const BAR_W = 72
const BAR_GAP = 28
const BAR_BASE = 620
const BAR_HEIGHTS = [90, 150, 220]
const BAR_CORNER = 18

function barRect(i) {
  const x = CX - (3 * BAR_W + 2 * BAR_GAP) / 2 + i * (BAR_W + BAR_GAP)
  const h = BAR_HEIGHTS[i]
  return `<rect x="${x}" y="${BAR_BASE - h}" width="${BAR_W}" height="${h}" rx="${BAR_CORNER}"/>`
}

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
// Height profiles over blurred alpha (0.5 = the outline, `top` = deepest
// point inside the shape). 'plateau' gives a rounded shoulder and a flat
// top, used for the tile rim; 'round' rises like a quarter sine all the way
// to the crest, so pieces read as rolled, well-rounded clay. Its ramp starts
// just outside the outline so smoothing the light maps doesn't pull a flat-lit
// halo onto the edge.
const PROFILES = {
  plateau: (a, top) => smoothstep(0.5, top, a),
  round: (a, top) => Math.sin((Math.min(1, Math.max(0, (a - 0.3) / (top - 0.3))) * Math.PI) / 2),
}
const profileTable = (profile, top) =>
  Array.from({ length: 65 }, (_, i) => f(PROFILES[profile](i / 64, top))).join(' ')

// Matte relief lit from the top-left: diffuse shading of the height map, a
// soft sheen on the lit side, a faint contact line and a soft cast shadow.
// The light maps are blurred because lighting an 8-bit height map leaves
// visible contour terraces.
//
// `holes`: the element is painted light with black cut-outs. Black becomes
// transparent, the outer outline drives a broad dome, and the solid shape
// (with a `holes`-sized blur) rolls the surface down into each cut-out.
function clayFilter(id, { bevel, depth, profile = 'plateau', top = 0.97, holes, azimuth = 235, elevation = 58, ambient = 0, sheen = 0.15, smooth = 2, ao, cast, drop, aoOpacity = 0.6, castOpacity = 0.35 }) {
  const shape = holes ? 'solid' : 'SourceAlpha'
  const heightMap = holes
    ? `<feColorMatrix in="SourceGraphic" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  6 0 0 0 -4.2"/>
    <feComposite in2="SourceAlpha" operator="in" result="solid"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="${bevel}"/>
    <feComponentTransfer result="dome"><feFuncA type="table" tableValues="${profileTable(profile, top)}"/></feComponentTransfer>
    <feGaussianBlur in="solid" stdDeviation="${holes}"/>
    <feComponentTransfer result="rim"><feFuncA type="table" tableValues="${profileTable('round', 0.97)}"/></feComponentTransfer>
    <feComposite in="dome" in2="rim" operator="arithmetic" k1="1" result="height"/>`
    : `<feGaussianBlur in="SourceAlpha" stdDeviation="${bevel}"/>
    <feComponentTransfer result="height"><feFuncA type="table" tableValues="${profileTable(profile, top)}"/></feComponentTransfer>`
  const shadows = cast
    ? `<feGaussianBlur in="${shape}" stdDeviation="${cast}"/>
    <feOffset dx="${drop / 3}" dy="${drop}" result="castBlur"/>
    <feFlood flood-color="${C.shadow}" flood-opacity="${castOpacity}"/>
    <feComposite in2="castBlur" operator="in" result="cast"/>
    <feMorphology in="${shape}" operator="dilate" radius="${ao / 2}"/>
    <feGaussianBlur stdDeviation="${ao}"/>
    <feOffset dx="${ao / 3}" dy="${ao / 1.5}" result="aoBlur"/>
    <feFlood flood-color="${C.shadow}" flood-opacity="${aoOpacity}"/>
    <feComposite in2="aoBlur" operator="in" result="ao"/>
    <feMerge><feMergeNode in="cast"/><feMergeNode in="ao"/><feMergeNode in="body"/></feMerge>`
    : ''
  // Flat areas keep their base colour. `ambient` keeps part of the base colour
  // out of the lighting, which narrows the light-to-dark range: matte, not plastic.
  const k1 = f((1 - ambient) / Math.sin((elevation * Math.PI) / 180))
  return `
  <filter id="${id}" filterUnits="userSpaceOnUse" x="-64" y="-64" width="1152" height="1152" color-interpolation-filters="sRGB">
    ${heightMap}
    <feDiffuseLighting in="height" surfaceScale="${depth}" diffuseConstant="1" lighting-color="#fff" result="diffRaw">
      <feDistantLight azimuth="${azimuth}" elevation="${elevation}"/>
    </feDiffuseLighting>
    <feGaussianBlur in="diffRaw" stdDeviation="${smooth}" result="diff"/>
    <feSpecularLighting in="height" surfaceScale="${depth}" specularConstant="0.7" specularExponent="18" lighting-color="#fff" result="specRaw">
      <feDistantLight azimuth="${azimuth}" elevation="38"/>
    </feSpecularLighting>
    <feGaussianBlur in="specRaw" stdDeviation="${smooth}" result="spec"/>
    <feComposite in="SourceGraphic" in2="diff" operator="arithmetic" k1="${k1}" k2="${ambient}" result="shaded"/>
    <feComposite in="spec" in2="${shape}" operator="in" result="specIn"/>
    <feComposite in="shaded" in2="specIn" operator="arithmetic" k2="1" k3="${sheen}" result="lit"/>
    <feComposite in="lit" in2="${shape}" operator="in" result="body"/>
    ${shadows}
  </filter>`
}

// variant: 'full' (opaque, full-bleed: Apple + maskable) or 'tile' (rounded
// tile with shadow on transparent canvas, macOS icon grid: 824px body).
function iconSvg({ variant, artScale = 1, bevel = true, size = MASTER }) {
  const tile = variant === 'tile'
  const grad = (id, a, b, x1, y1, x2, y2) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`

  const PLATE = 50
  const background = `
    <rect width="1024" height="1024" fill="url(#bg)"/>
    ${
      bevel
        ? `<rect width="1024" height="1024" rx="${CORNER}" fill="url(#bg)" filter="url(#tileRim)"/>
    <rect x="${PLATE}" y="${PLATE}" width="${1024 - 2 * PLATE}" height="${1024 - 2 * PLATE}" rx="${CORNER - PLATE}" fill="url(#plate)" filter="url(#plateStep)"/>`
        : ''
    }
    <rect width="1024" height="1024" fill="url(#bgGlow)"/>
    <rect width="1024" height="1024" filter="url(#grain)" opacity="0.2" style="mix-blend-mode:overlay"/>`

  const segment = (s) =>
    `<path d="${segmentPath(s)}" fill="url(#${s.paint})" stroke="url(#${s.paint})" stroke-width="${2 * SEG_CORNER}" stroke-linejoin="round"/>`

  const art = `
    <g transform="translate(${CX} ${CY}) scale(${artScale}) translate(${-CX} ${-CY})">
      <g filter="url(#ringClay)">
        ${SEGMENTS.map(segment).join('\n        ')}
      </g>
      <g filter="url(#heartClay)">
        <path d="${heartPath}" fill="url(#heart)" stroke="url(#heart)" stroke-width="10" stroke-linejoin="round"/>
        <g fill="#000">${[0, 1, 2].map(barRect).join('')}</g>
      </g>
    </g>`

  // Felt-like grain sits on the tile; the clay pieces only get a whisper of it.
  const grain = `<rect width="1024" height="1024" filter="url(#grain)" opacity="0.06" style="mix-blend-mode:overlay"/>`

  const body = `${background}${art}${grain}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    ${grad('bg', '#667D62', '#334231', 180, 80, 900, 960)}
    ${grad('plate', '#62795E', '#314030', 180, 80, 900, 960)}
    <radialGradient id="bgGlow" gradientUnits="userSpaceOnUse" cx="300" cy="180" r="700">
      <stop offset="0" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    ${grad('cream', '#EFE8DC', '#D9D0BE', 512, 160, 512, 870)}
    ${grad('heart', '#EFE9DD', '#DBD2C1', 400, 340, 600, 750)}
    ${grad('rose', '#D6ACA4', '#BA8B84', 560, 160, 860, 500)}
    ${grad('green', '#94A983', '#728863', 860, 400, 560, 870)}
    ${clayFilter('ringClay', { profile: 'round', bevel: 22, top: 0.96, depth: 26, ambient: 0.5, sheen: 0, smooth: 3, ao: 3, cast: 14, drop: 16, aoOpacity: 0.3, castOpacity: 0.4 })}
    ${clayFilter('heartClay', { profile: 'round', bevel: 50, top: 1, holes: 12, depth: 24, ambient: 0.5, sheen: 0, smooth: 4, ao: 3, cast: 16, drop: 18, aoOpacity: 0.3, castOpacity: 0.4 })}
    ${clayFilter('tileRim', { bevel: 30, depth: 10, sheen: 0.6, smooth: 4 })}
    ${clayFilter('plateStep', { bevel: 8, depth: 3, azimuth: 55, sheen: 0, smooth: 2 })}
    <filter id="grain" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feTurbulence type="fractalNoise" baseFrequency="0.55" numOctaves="3" seed="7" stitchTiles="stitch"/>
      <feColorMatrix values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 0 1"/>
    </filter>
    <filter id="tileShadow" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feGaussianBlur in="SourceAlpha" stdDeviation="14"/><feOffset dy="12" result="b"/>
      <feFlood flood-color="#000" flood-opacity="0.3"/><feComposite in2="b" operator="in"/>
    </filter>
    <clipPath id="tileClip"><rect width="1024" height="1024" rx="${CORNER}"/></clipPath>
  </defs>
  ${
    tile
      ? `<g transform="translate(100 100) scale(${824 / 1024})">
    <rect width="1024" height="1024" rx="${CORNER}" fill="${C.deepSage}" filter="url(#tileShadow)"/>
    <g clip-path="url(#tileClip)">${body}</g>
  </g>`
      : body
  }
</svg>`
}

// Flat, filter-free version that stays crisp at 16–32px.
function faviconSvg() {
  const flat = { cream: '#F0EADF', rose: '#C99D95', green: '#8FA47E' }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#647B60"/><stop offset="1" stop-color="#364634"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${CORNER}" fill="url(#bg)"/>
  ${SEGMENTS.map((s) => `<path d="${segmentPath(s)}" fill="${flat[s.paint]}" stroke="${flat[s.paint]}" stroke-width="${2 * SEG_CORNER}" stroke-linejoin="round"/>`).join('\n  ')}
  <mask id="holes"><rect width="1024" height="1024" fill="#fff"/><g fill="#000">${[0, 1, 2].map(barRect).join('')}</g></mask>
  <path d="${heartPath}" fill="${flat.cream}" stroke="${flat.cream}" stroke-width="10" stroke-linejoin="round" mask="url(#holes)"/>
</svg>
`
}

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME
  const root = join(homedir(), 'Library', 'Caches', 'ms-playwright')
  const candidates = existsSync(root) ? readdirSync(root).filter((d) => d.startsWith('chromium_headless_shell-')).sort() : []
  for (const dir of candidates.reverse()) {
    for (const sub of readdirSync(join(root, dir))) {
      const bin = join(root, dir, sub, 'chrome-headless-shell')
      if (existsSync(bin)) return bin
    }
  }
  throw new Error('Chromium not found: run `npx playwright install chromium` or set CHROME=<binary>')
}

const chrome = findChrome()
const work = mkdtempSync(join(tmpdir(), 'trainlytics-icons-'))

function render(name, svg) {
  const svgFile = join(work, `${name}.svg`)
  const png = join(work, `${name}.png`)
  writeFileSync(svgFile, svg)
  execFileSync(chrome, [
    '--headless',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--default-background-color=00000000',
    `--window-size=${MASTER},${MASTER}`,
    `--screenshot=${png}`,
    `file://${svgFile}`,
  ], { stdio: 'ignore' })
  return png
}

function resize(master, size, out) {
  mkdirSync(dirname(out), { recursive: true })
  execFileSync('sips', ['-s', 'format', 'png', '-z', String(size), String(size), master, '--out', out], { stdio: 'ignore' })
  console.log(`  ${out.replace(PUBLIC, 'public')} (${size}×${size})`)
}

const full = render('full', iconSvg({ variant: 'full' }))
const tile = render('tile', iconSvg({ variant: 'tile' }))
const maskable = render('maskable', iconSvg({ variant: 'full', artScale: 0.86, bevel: false }))
const favicon = faviconSvg()
const flat = render('favicon', favicon.replace('<svg ', `<svg width="${MASTER}" height="${MASTER}" `))

console.log('Writing icons:')
resize(full, 180, join(PUBLIC, 'apple-touch-icon.png'))
resize(full, 512, join(PUBLIC, 'icons', 'apple-touch-icon-512.png'))
resize(tile, 192, join(PUBLIC, 'icons', 'icon-192.png'))
resize(tile, 512, join(PUBLIC, 'icons', 'icon-512.png'))
resize(maskable, 192, join(PUBLIC, 'icons', 'icon-maskable-192.png'))
resize(maskable, 512, join(PUBLIC, 'icons', 'icon-maskable-512.png'))
resize(flat, 32, join(PUBLIC, 'favicon-32.png'))
writeFileSync(join(PUBLIC, 'favicon.svg'), favicon)
console.log('  public/favicon.svg')
console.log(`Masters: ${work}`)
