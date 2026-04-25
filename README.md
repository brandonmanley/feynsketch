# FeynSketch

Sketch Feynman diagrams by hand and turn them into publication-quality,
editable diagrams in the browser.

## Features

- **Two-mode workspace** — a `Draw` canvas for freehand sketching and an `Edit`
  canvas for precise editing.
- **Stroke → diagram conversion** — the `Convert → editable` button analyses
  each hand-drawn stroke and classifies it as:
  - a straight / curved solid line
  - a wiggly photon line
  - a curly gluon line
  It then snaps line endpoints into shared **vertices**.
- **Line styling** — solid, dashed, dotted (ghost), double, wiggly (photon),
  curly (gluon), with arrowheads at the start, middle, or end. Amplitude and
  wavelength of wiggly/curly lines are adjustable.
- **Anchor-point editing** — drag anchors on a selected line to curve it, or
  double-click a selected line to add a new anchor.
- **Shapes** — circle, ellipse, square, rectangle, triangle, diamond. Each
  can be stretched, rotated, recoloured (stroke and fill).
- **Vertices** — circle or square, filled / open / outline only, any size
  or colour.
- **LaTeX labels** — insert a label from a dialog (with live KaTeX preview),
  then drag, recolour, resize, or change its font.
- **Export** — PNG, SVG (vector), PDF, or a JSON project file for re-editing.
- **Save / load** — projects are kept in `localStorage` and can be re-opened
  from the `Projects` menu; they can also be imported or exported as JSON.

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

### Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — produce an optimised production build in `dist/`
- `npm run preview` — preview the production build locally
- `npm run typecheck` — run the TypeScript compiler in check mode

## How it works

- The drawing canvas captures pointer input as a sequence of polyline strokes.
- On conversion, each stroke is:
  1. smoothed into a low-frequency **guide** path via arc-length averaging
  2. compared with the raw stroke to measure residual oscillation amplitude
     and zero-crossing count
  3. classified into `solid` / `wiggly` / `curly` using a ratio-of-lengths +
     oscillation heuristic
  4. simplified into a small set of control points using RDP
- Wiggly and curly lines are re-rendered as uniform sine-wave / cycloid paths
  along the control-point backbone, so the output always has perfectly spaced
  oscillations regardless of how shaky the input was.
- Endpoints within a small radius are clustered into shared **vertex** objects
  so the line network is continuous.

## Tech stack

- Vite + React + TypeScript
- [KaTeX](https://katex.org/) for LaTeX rendering
- [zustand](https://github.com/pmndrs/zustand) for state
- [jsPDF](https://github.com/parallax/jsPDF) for PDF export
