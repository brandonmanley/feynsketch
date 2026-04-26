# FeynSketch

Build publication-quality Feynman diagrams in the browser.

## Features

- **Editor-first canvas** — direct manipulation of lines, shapes, vertices,
  and LaTeX labels, all rendered as smooth SVG.
- **Smooth curves through anchors** — every line uses a centripetal
  Catmull-Rom spline that passes through every anchor point. A single
  off-axis anchor between two endpoints traces a clean arc; many anchors
  give a continuously curving path with no kinks.
- **Lines** — solid, dashed, dotted (ghost), double, wiggly (photon),
  curly (gluon). Arrows at start / middle / end with a forward / backward
  direction toggle. Wiggly amplitude / wavelength and double-line spacing
  are independently configurable.
- **Gluon coils** — circular cycloid loops auto-tuned so a whole number
  of cycles fit between the endpoints, so the line always lands cleanly
  on the vertex.
- **Shapes** — circle, ellipse, square, rect, triangle, diamond, cross.
  Stretch, rotate, recolour fill and stroke.
- **Vertices** — circle or square, filled / open / outline only, any size
  or colour. Vertices are explicit objects: lines do not auto-create
  them on conversion.
- **LaTeX labels** — KaTeX-rendered labels with live preview, draggable,
  recolourable, with adjustable font.
- **Multi-select & marquee** — drag from empty space to box-select; Shift
  to add or remove from a selection.
- **Grouping** — Cmd/Ctrl-G groups the selection so it moves, copies, and
  styles as one. Shift-Cmd/Ctrl-G ungroups.
- **Layer ordering** — bring forward / send backward / bring to front /
  send to back, both in the Edit menu / property panel and via Cmd/Ctrl-]
  / [ (add Shift for front / back).
- **Clipboard** — Cmd/Ctrl-C, X, V copy, cut, paste (with offset). Cmd/Ctrl-D
  duplicates.
- **Undo / Redo** — Cmd/Ctrl-Z and Shift-Cmd/Ctrl-Z (or Cmd/Ctrl-Y), 100
  steps deep. Drags and slider sweeps are single steps.
- **Anchor editing** — double-click a selected line to add an anchor;
  Alt-click an interior anchor to remove it.
- **Snap-to-grid** — toolbar toggle plus settings; configurable grid size.
- **Export** — PNG, SVG, PDF (DPI presets + slider, transparent background
  option) or a JSON project file. Uses the File System Access API for
  save-location pickers when available.
- **Save / load** — projects are kept in `localStorage` and re-openable
  from the File menu; can also be imported / exported as JSON.

## Keyboard shortcuts

| Action | Shortcut |
|--------|----------|
| Undo / Redo | ⌘Z · ⇧⌘Z (or ⌘Y) |
| Copy / Cut / Paste | ⌘C · ⌘X · ⌘V |
| Duplicate | ⌘D |
| Select all | ⌘A |
| Group / Ungroup | ⌘G · ⇧⌘G |
| Bring forward / Send backward | ⌘] · ⌘[ |
| Bring to front / Send to back | ⇧⌘] · ⇧⌘[ |
| Delete selection | Backspace · Delete |

(`⌘` = Cmd on macOS, Ctrl elsewhere.)

## Running locally

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

### Scripts

- `npm run dev` — start the Vite dev server
- `npm run build` — produce a production build in `dist/`
- `npm run preview` — preview the production build locally
- `npm run typecheck` — TypeScript check

## Tech stack

Vite · React · TypeScript · KaTeX · zustand · jsPDF.
