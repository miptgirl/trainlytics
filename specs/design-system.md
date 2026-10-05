# Design System: "Minimal & Clean"

The target visual language for Trainlytics: fresh, calm and airy, with sage green as the hero colour. Use it for every redesign and new screen. The source artwork is [`design/colour-palette.webp`](design/colour-palette.webp).

> **Status:** the app UI and the PWA icons use this palette. The tokens live in `frontend/src/index.css`; chart colours are read from them at runtime by `frontend/src/lib/chartPalette.ts`.

## Colours

### Primary

| Token | Name | Hex | Use for |
|---|---|---|---|
| `primary` | Sage Green | `#7E9B76` | Primary buttons, active states, progress, highlights |
| `primary-dark` | Deep Sage | `#4F6B52` | Pressed states, selected items, strong emphasis, links |
| `primary-light` | Light Sage | `#B8C9B2` | Subtle backgrounds, hovers, soft accents |
| `primary-tint` | Sage Tint | `#E6EFE3` | Very light backgrounds, dividers, subtle fills |

### Neutrals

| Token | Name | Hex | Use for |
|---|---|---|---|
| `bg` | Warm Ivory | `#F7F5EF` | App background |
| `surface` | Surface | `#FFFDF8` | Cards, sheets, modals, nav bar |
| `border` | Light Border | `#E8E4DA` | Dividers, card outlines, decorative borders |
| `border-strong` | Control Border | `#8A857B` | Boundaries of controls: input, select, textarea, checkbox and radio borders, switch off-tracks, unselected chip borders. 3.61:1 on `surface`, 3.37:1 on `bg`, 3.11:1 on `primary-tint` (WCAG 1.4.11 asks for 3:1). An accessibility addition to the original palette |
| `text` | Charcoal | `#2F342F` | Headings, body text, default icons |
| `text-muted` | Muted Gray | `#737A70` | Icons, decoration and captions at 18px+ (see [Accessibility](#accessibility)); use `text-muted-strong` for anything smaller |

### Accent

| Token | Name | Hex | Use for |
|---|---|---|---|
| `accent` | Dusty Rose | `#C98F8F` | Secondary buttons, achievements, streaks |
| `accent-light` | Blush | `#E8CACA` | Soft highlights, backgrounds |

### Semantic

| Token | Name | Hex | Use for |
|---|---|---|---|
| `success` | Green | `#6F9E78` | Completed actions, positive feedback |
| `warning` | Ochre | `#D1A15D` | Cautions, important notices |
| `error` | Terracotta | `#C86F62` | Errors, destructive actions |

### Chart and activity colours

One colour per activity type, used consistently in charts, chips and calendar entries.

| Token | Hex | Activity |
|---|---|---|
| `chart-strength` | `#7E9B76` Sage Green | Gym / Strength |
| `chart-yoga` | `#C98F8F` Dusty Rose | Yoga / Pilates |
| `chart-running` | `#D1A15D` Ochre | Running |
| `chart-cycling` | `#8297A5` Dusty Blue | Cycling |
| `chart-walking` | `#A58A76` Warm Taupe | Walking |
| `chart-swimming` | `#9B8DB6` Soft Purple | Swimming |

### Gradients (optional)

- **Sage:** `#7E9B76 → #B8C9B2`, for hero sections, illustrations and premium areas.
- **Rose:** `#C98F8F → #E8CACA`, for achievements, badges and accents.

## Elevation and shape

| Shadow | Value | Use for |
|---|---|---|
| XS | `0 1px 2px rgba(47, 52, 47, 0.06)` | Inputs, chips |
| SM | `0 4px 12px rgba(47, 52, 47, 0.08)` | Cards |
| MD | `0 12px 24px rgba(47, 52, 47, 0.12)` | Sheets, floating elements |

| Radius | Use for |
|---|---|
| 4px | Inputs, chips |
| 8px | Buttons, small cards |
| 12px | Cards, modals |
| 20px | Bottom sheets, hero elements |

## Component recipes

- **Primary button:** `primary-dark` fill with white text. Use `primary` fill only for large or bold labels (see Accessibility).
- **Secondary button:** `primary-tint` fill, `primary-dark` text and 1px `primary-dark` border.
- **Destructive button:** `accent-light` fill, `error-text` text and a trash icon.
- **Error alert / message:** `error` at 10% fill with `error-text` text (4.85:1). Don't use `accent-light` with `accent-text` or `error-text` for alerts: it's a button fill, and `accent-text` on it falls below 4.5:1 for small text.
- **Chips:** `primary-tint` for selected, `surface` with a `border-strong` outline for unselected, `text` for labels.
- **Badges:** type badges (strength, cardio) are outline pills with a dot in the activity colour; status badges (planned, done, skipped) are filled pills: planned neutral, done `success` tint, skipped `warning` tint. Type and status never share a fill.
- **Input:** `surface` fill, `border-strong` outline, 4px radius, `text-muted` placeholder (or `text-muted-strong` below 18px).
- **Progress bar:** `primary` fill on a `primary-tint` track.
- **Bottom navigation:** `surface` background; the active item uses `primary-dark`, inactive items use `text-muted-strong`.
- **List row with activity icon:** `surface` card with SM shadow, an icon in a `primary-tint` circle, a `text` title and `text-muted-strong` metadata.

## Accessibility

The contrast figures printed in the palette artwork are wrong. These are the real WCAG 2.x ratios:

| Text | Background | Ratio | Verdict |
|---|---|---|---|
| `text` `#2F342F` | `bg` `#F7F5EF` | 11.65:1 | AAA |
| `text-muted` `#737A70` | `bg` | 4.06:1 | Large text only |
| White | `primary` `#7E9B76` | 3.07:1 | Large text only |
| White | `primary-dark` `#4F6B52` | 5.90:1 | AA |
| `primary-dark` | `bg` | 5.41:1 | AA |
| `primary-dark` | `primary-tint` `#E6EFE3` | 5.01:1 | AA |
| `accent` `#C98F8F` | `bg` | 2.47:1 | Fails. Decoration only, never text |
| `error` `#C86F62` | `bg` | 3.26:1 | Large text only |
| `border-strong` `#8A857B` | `surface` / `bg` | 3.61:1 / 3.37:1 | Control boundaries (non-text, 3:1) |
| `primary` `#7E9B76` | `surface` | 3.2:1 or less | Not for focus rings; use `primary-dark` (5.8:1) |

Rules:

- Use `primary-dark` for links and any small text in a brand colour.
- Put white text on `primary` only when it's 18.66px+ bold or 24px+ regular. Otherwise use a `primary-dark` button.
- For small text in a muted, error, warning, success or rose tone, use the text-safe shades below. Each reaches at least 4.97:1 on `bg` and `surface`, and at least 4.6:1 on `primary-tint`. They are darker versions of the palette colours, added for legibility.

| Token | Hex | Darker version of |
|---|---|---|
| `text-muted-strong` | `#656B63` | Muted Gray |
| `success-text` | `#4F7156` | Success |
| `warning-text` | `#82643A` | Ochre |
| `error-text` | `#9B564C` | Terracotta |
| `accent-text` | `#876060` | Dusty Rose |

## Tailwind tokens

Tailwind v4 `@theme` block for `frontend/src/index.css`. `index.css` applies it (as `@theme static`, plus the `--color-chart-zone-1…5` HR zone tokens), minus the radius tokens.

```css
@theme {
  --color-primary: #7E9B76;
  --color-primary-dark: #4F6B52;
  --color-primary-light: #B8C9B2;
  --color-primary-tint: #E6EFE3;

  --color-bg: #F7F5EF;
  --color-surface: #FFFDF8;
  --color-border: #E8E4DA;
  --color-border-strong: #8A857B;
  --color-text: #2F342F;
  --color-text-muted: #737A70;
  --color-text-muted-strong: #656B63;

  --color-accent: #C98F8F;
  --color-accent-light: #E8CACA;
  --color-accent-text: #876060;

  --color-success: #6F9E78;
  --color-success-text: #4F7156;
  --color-warning: #D1A15D;
  --color-warning-text: #82643A;
  --color-error: #C86F62;
  --color-error-text: #9B564C;

  --color-chart-strength: #7E9B76;
  --color-chart-yoga: #C98F8F;
  --color-chart-running: #D1A15D;
  --color-chart-cycling: #8297A5;
  --color-chart-walking: #A58A76;
  --color-chart-swimming: #9B8DB6;

  --shadow-xs: 0 1px 2px rgba(47, 52, 47, 0.06);
  --shadow-sm: 0 4px 12px rgba(47, 52, 47, 0.08);
  --shadow-md: 0 12px 24px rgba(47, 52, 47, 0.12);

  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 20px;
}
```

The app does not adopt the `--radius-*` tokens above: they would override Tailwind's `rounded-sm/md/lg/xl` scale and silently restyle every existing `rounded-*` class (for example `rounded-lg` from 8px to 12px). It uses Tailwind's defaults, which already match the shapes: `rounded-sm` (4px) for inputs and chips, `rounded-lg` (8px) for buttons, `rounded-xl` (12px) for cards and modals, and `rounded-[20px]` for bottom sheets and hero elements.

## App icon

The PWA icons in `frontend/public/` (a sage clay tile with a segmented ring and a heart) are generated by `frontend/scripts/generate-icons.mjs`. They use muted, slightly olive versions of these colours to suit the clay look. If the palette changes, update the gradient colours in the script's `iconSvg` and `faviconSvg` and re-run it.
