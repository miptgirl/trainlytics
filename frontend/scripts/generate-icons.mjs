#!/usr/bin/env node
// Generates the Trainlytics PWA icon set: a skeuomorphic sage tile with a
// segmented progress ring around a heart holding a bar chart.
//
// The artwork is SVG (lighting filters give the soft clay look). Headless
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

// All geometry lives in a 1024×1024 artboard.
const CX = 512
const CY = 512
const RING_R = 330
const RING_W = 82
const CORNER = 229 // ≈ Apple's 22.4% icon corner

// Angles in degrees, clockwise from 3 o'clock.
const SEGMENTS = [
  { from: 186, to: 264, paint: 'cream' },
  { from: 285.2, to: 329.2, paint: 'rose' },
  { from: 350.4, to: 436.4, paint: 'green' },
  { from: 97.6, to: 164.8, paint: 'cream' },
]

const f = (n) => +n.toFixed(2)

function polar(r, deg) {
  const a = (deg * Math.PI) / 180
  return [f(CX + r * Math.cos(a)), f(CY + r * Math.sin(a))]
}

function arc(r, from, to) {
  const [x1, y1] = polar(r, from)
  const [x2, y2] = polar(r, to)
  return `M${x1} ${y1}A${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x2} ${y2}`
}

// A full, rounded heart: x ∈ [-1, 1], y ∈ [-0.85, 0.95].
const HEART = [
  ['M', [0, 0.95]],
  ['C', [-0.4, 0.75], [-1, 0.35], [-1, -0.25]],
  ['C', [-1, -0.62], [-0.72, -0.85], [-0.48, -0.85]],
  ['C', [-0.22, -0.85], [-0.06, -0.7], [0, -0.54]],
  ['C', [0.06, -0.7], [0.22, -0.85], [0.48, -0.85]],
  ['C', [0.72, -0.85], [1, -0.62], [1, -0.25]],
  ['C', [1, 0.35], [0.4, 0.75], [0, 0.95]],
]
const HEART_SCALE = 210
const HEART_CY = 544 // heart sits a little low inside the ring, like the reference

const heartPt = ([x, y]) => `${f(CX + x * HEART_SCALE)} ${f(HEART_CY + (y - 0.05) * HEART_SCALE)}`
const heartPath = HEART.map(([cmd, ...pts]) => cmd + pts.map(heartPt).join(' ')).join('') + 'Z'

const BAR_W = 54
const BAR_GAP = 24
const BAR_BASE = 630
const BAR_HEIGHTS = [98, 150, 202]

function barPath(i) {
  const x = CX - (3 * BAR_W + 2 * BAR_GAP) / 2 + i * (BAR_W + BAR_GAP)
  const top = BAR_BASE - BAR_HEIGHTS[i]
  const r = BAR_W / 2
  const rb = 9
  return (
    `M${x} ${top + r}A${r} ${r} 0 0 1 ${x + BAR_W} ${top + r}` +
    `V${BAR_BASE - rb}Q${x + BAR_W} ${BAR_BASE} ${x + BAR_W - rb} ${BAR_BASE}` +
    `H${x + rb}Q${x} ${BAR_BASE} ${x} ${BAR_BASE - rb}Z`
  )
}

// Soft "clay" relief: a blurred alpha bump map lit from the top-left, plus a
// cast shadow and a tight contact shadow. The light maps are blurred again
// because lighting an 8-bit bump map leaves visible contour terraces.
function clayFilter(id, { bump, depth, spec, smooth = 3, shadow, drop, shadowOpacity }) {
  return `
  <filter id="${id}" filterUnits="userSpaceOnUse" x="-64" y="-64" width="1152" height="1152" color-interpolation-filters="sRGB">
    <feGaussianBlur in="SourceAlpha" stdDeviation="${bump}" result="bump"/>
    <feDiffuseLighting in="bump" surfaceScale="${depth}" diffuseConstant="1.25" lighting-color="#fff" result="diffRaw">
      <feDistantLight azimuth="225" elevation="53"/>
    </feDiffuseLighting>
    <feGaussianBlur in="diffRaw" stdDeviation="${smooth}" result="diff"/>
    <feSpecularLighting in="bump" surfaceScale="${depth}" specularConstant="0.75" specularExponent="26" lighting-color="#fff" result="specRaw">
      <feDistantLight azimuth="225" elevation="58"/>
    </feSpecularLighting>
    <feGaussianBlur in="specRaw" stdDeviation="${smooth}" result="spec"/>
    <feComposite in="SourceGraphic" in2="diff" operator="arithmetic" k1="1" result="shaded"/>
    <feComposite in="spec" in2="SourceAlpha" operator="in" result="specIn"/>
    <feComposite in="shaded" in2="specIn" operator="arithmetic" k2="1" k3="${spec}" result="lit"/>
    <feComposite in="lit" in2="SourceAlpha" operator="in" result="body"/>
    ${
      shadow
        ? `<feGaussianBlur in="SourceAlpha" stdDeviation="${shadow}"/>
    <feOffset dx="${drop / 4}" dy="${drop}" result="castBlur"/>
    <feFlood flood-color="${C.shadow}" flood-opacity="${shadowOpacity}"/>
    <feComposite in2="castBlur" operator="in" result="cast"/>
    <feGaussianBlur in="SourceAlpha" stdDeviation="${Math.max(2, shadow / 5)}"/>
    <feOffset dy="${Math.max(2, drop / 4)}" result="contactBlur"/>
    <feFlood flood-color="${C.shadow}" flood-opacity="${shadowOpacity * 0.7}"/>
    <feComposite in2="contactBlur" operator="in" result="contact"/>
    <feMerge><feMergeNode in="cast"/><feMergeNode in="contact"/><feMergeNode in="body"/></feMerge>`
        : ''
    }
  </filter>`
}

// variant: 'full' (opaque, full-bleed: Apple + maskable) or 'tile' (rounded
// tile with shadow on transparent canvas, macOS icon grid: 824px body).
function iconSvg({ variant, artScale = 1, bevel = true, size = MASTER }) {
  const tile = variant === 'tile'
  const grad = (id, a, b, x1 = 230, y1 = 160, x2 = 800, y2 = 880) =>
    `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`

  const paints = { cream: 'url(#cream)', rose: 'url(#rose)', green: 'url(#green)' }

  const background = `
    <rect width="1024" height="1024" fill="url(#bg)"/>
    ${bevel ? `<rect width="1024" height="1024" rx="${CORNER}" fill="url(#bg)" filter="url(#tileRelief)"/>` : ''}
    <rect width="1024" height="1024" fill="url(#bgGlow)"/>`

  const art = `
    <g transform="translate(${CX} ${CY}) scale(${artScale}) translate(${-CX} ${-CY})">
      <g filter="url(#ringClay)">
        ${SEGMENTS.map((s) => `<path d="${arc(RING_R, s.from, s.to)}" fill="none" stroke="${paints[s.paint]}" stroke-width="${RING_W}" stroke-linecap="round"/>`).join('\n        ')}
      </g>
      <path d="${heartPath}" fill="url(#cream)" stroke="url(#cream)" stroke-width="22" stroke-linejoin="round" filter="url(#heartClay)"/>
      <g filter="url(#barClay)" fill="url(#bar)">
        ${[0, 1, 2].map((i) => `<path d="${barPath(i)}"/>`).join('\n        ')}
      </g>
    </g>`

  const grain = `<rect width="1024" height="1024" filter="url(#grain)" opacity="0.14" style="mix-blend-mode:overlay"/>`

  const body = `${background}${art}${grain}`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">
  <defs>
    ${grad('bg', '#5F7D5A', '#3B533E', 512, 0, 512, 1024)}
    <radialGradient id="bgGlow" gradientUnits="userSpaceOnUse" cx="330" cy="220" r="760">
      <stop offset="0" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    ${grad('cream', '#FBF8F0', '#D8D0BE')}
    ${grad('rose', '#DCAAA7', '#B67877', 600, 180, 860, 470)}
    ${grad('green', '#A9C1A0', '#6C8A66', 760, 380, 600, 860)}
    ${grad('bar', '#6C8B67', C.deepSage, 512, 430, 512, 630)}
    ${clayFilter('ringClay', { bump: 14, depth: 11, spec: 0.6, shadow: 13, drop: 16, shadowOpacity: 0.45 })}
    ${clayFilter('heartClay', { bump: 28, depth: 14, spec: 0.55, shadow: 15, drop: 18, shadowOpacity: 0.45 })}
    ${clayFilter('barClay', { bump: 8, depth: 7, spec: 0.4, smooth: 1.5, shadow: 5, drop: 6, shadowOpacity: 0.35 })}
    ${clayFilter('tileRelief', { bump: 34, depth: 12, spec: 0.3, smooth: 5 })}
    <filter id="grain" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">
      <feTurbulence type="fractalNoise" baseFrequency="0.6" numOctaves="3" seed="7" stitchTiles="stitch"/>
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
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6E8D68"/><stop offset="1" stop-color="#46604A"/></linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="${CORNER}" fill="url(#bg)"/>
  ${SEGMENTS.map((s) => `<path d="${arc(RING_R, s.from, s.to)}" fill="none" stroke="${{ cream: '#F5F1E8', rose: C.dustyRose, green: '#9DB594' }[s.paint]}" stroke-width="${RING_W + 14}" stroke-linecap="round"/>`).join('\n  ')}
  <path d="${heartPath}" fill="#F5F1E8" stroke="#F5F1E8" stroke-width="22" stroke-linejoin="round"/>
  ${[0, 1, 2].map((i) => `<path d="${barPath(i)}" fill="${C.deepSage}"/>`).join('\n  ')}
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
