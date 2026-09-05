# Design

The system is called **Plate**. It lives in `app/globals.css` and
`components/kit/`.

## The reference object

A drafting plate. Ink on warm paper, hairline rules, dimension ticks, dense
spec tables. Depth comes from tone and rules, never from glass or glow.

This was chosen against two reflexes, both of which were rejected on purpose:

- **First reflex** for an AI builder: indigo gradient, glowing orbs, monospace
  terminal cosplay.
- **Second reflex**, the one you land on after avoiding the first: Swiss
  editorial, cream ground, serif headline, generous grid.

Plate is neither. It is an engineering drawing.

## Theme

Dark by default, light available, system respected.

The scene that decides it: *a builder at 10pm in a lamp-lit room, describing an
invoice tracker, then reading the files it produced before pushing them to the
edge.* Reading files, in the evening, at a desk. That forces dark. Light exists
because half of building happens in daylight.

Dark is warm graphite, hue 62. Never blue-black, never `#000`.

## Colour

**Restrained.** Tinted neutrals plus one accent, kept under ten percent of any
surface.

The accent is a deep red lead, `oklch(0.48 0.175 30)`. It appears in exactly
three places: the primary action, the current selection, and anything live.

Two accent tokens, and the split matters:

| Token           | Role                                 | Contrast          |
| --------------- | ------------------------------------ | ----------------- |
| `--primary`     | accent **as a surface**              | 4.8:1 with white  |
| `--signal-text` | accent **as foreground** on the page | lifted in dark    |

Using `--primary` for text is the mistake the split exists to prevent. In dark
mode `--signal-text` is `oklch(0.735 0.155 38)`, which is a different colour
from the button, deliberately.

Semantic roles (`success`, `warning`, `destructive`, `info`) each have a
surface value and a `-text` value for the same reason.

## Type

One family: Geist. Sans for product UI, **Mono as the display face** on brand
surfaces only. Mono never appears as a product UI label, button, or data value.

Product type is a **fixed rem scale**, ratio ~1.2, from `--text-2xs` (11px) to
`--text-4xl` (40px). Not fluid: product UI is read at a consistent DPI and a
clamped heading shrinking inside a sidebar looks worse, not better.

Brand type opts into `clamp()` explicitly through `.display-xl`, `.display-lg`,
`.display-md`.

`.key` is the one place uppercase tracking is allowed: a structural label above
a block of data. Never a decorative section number.

## Structure

- `--radius` is `0.375rem`. Small and precise.
- **Rules do the work.** `Rule`, `.ticked`, and `border-b` carry most of the
  structure. `Panel` is the only box, and panels never nest.
- Three surface tones (`--surface-1/2/3`). Elevation is tone plus a rule.
  Shadows are for genuinely floating things only.
- `--bar-h` is a token so every toolbar in the app lines up.

## Motion

- `--dur-1/2/3` at 120, 180, 260ms. `--ease-out-quint`. No bounce, no elastic.
- Motion conveys state. The one orchestrated sequence in the product is the
  landing page's pinned scroll, and it is gated on `prefers-reduced-motion` and
  on a desktop breakpoint.
- Layout properties are never animated. Editor panes collapse by unmounting,
  not by tweening width, because tweening a pane containing Monaco and an
  iframe relayouts both on every frame.
- Skeletons **sweep**, they do not pulse. A pulse reads as a status light.

## Components

`components/kit/` is the whole vocabulary. Nothing outside it defines a button.

Every interactive component ships default, hover, focus-visible, active,
disabled, and busy. `Button` has five ranked intents, and if two `primary`
buttons appear on one screen, one of them is wrong.

`Field` owns label wiring, `aria-describedby`, and error association, so
controls inside it need no id of their own.

## Rules that are enforced, not suggested

- No side-stripe borders. A selected row is `.row-selected`, a tint, never a
  coloured left edge.
- No gradient text. No `background-clip: text`.
- No glassmorphism. The top bar is solid with a rule under it.
- No hero-metric template. Data goes in `SpecTable`.
- No identical card grids. The landing bento is five deliberately unlike cells.
- Modals are a last resort. There are two: `useConfirm` and the deploy dialog.
  Both interrupt because what is on the other side is irreversible or bills.
- Status never relies on hue alone. `StatusDot` carries a shape as well.
- No em dashes in copy.
- Determinate progress only. A bar that creeps on a timer is a claim the run
  has not earned.

## Where to look

| Concern            | File                              |
| ------------------ | --------------------------------- |
| Tokens             | `app/globals.css`                 |
| Primitives         | `components/kit/`                 |
| App shell          | `components/shell/`               |
| Mark and lockup    | `components/brand/mark.tsx`       |
| Landing sections   | `components/landing/`             |
| Build targets      | `lib/targets.ts`                  |
