# Freeform Editor — PRD & Setup Guide

## Project Identity

- **Name:** Violet Drizzle — Freeform Editor (or new name TBD)
- **Origin:** Extracted from the VDZ mesh editor project
- **Purpose:** Fast crochet stitch diagram creation tool for teaching content production
- **Long-term vision:** The freeform editor becomes the primary tool; the mesh editor is eventually rebuilt as a second mode within this project

---

## Phase Plan

### Phase 1: Core Editor + PNG Export
The minimum viable tool — place stitches, organize into sets, export transparent PNGs.

1. **Project scaffold** — Three.js + vanilla JS, import maps, basic HTML shell
2. **Core infrastructure** — EventBus, State, HistoryManager (undo/redo)
3. **Viewport** — Three.js orthographic canvas, pan/zoom, dot grid, rulers
4. **Layer system** — Background (flat color), Image (reference import), Stitches
5. **Stitch library + atlas** — Port from VDZ, all ~45 stitch definitions + texture atlas
6. **Stitch picker UI** — Minimalist palette, symbol + abbreviation, preview window, rotation control
7. **Stamp tool** — Click to place stitch at cursor, snap to ruler/grid (toggleable), rotation applied
8. **Selection + manipulation** — Click to select, multi-select, move, rotate individual/group
9. **Set system** — Assign stitches to numbered sets, reorder sets, reorder within sets, color per set
10. **PNG export** — Full pattern, cumulative per-set, individual set — all transparent background

### Phase 2: Video Generation (future)
11. **Remotion integration** — React wrapper for stitch rendering, composition definitions
12. **Loopable clip export** — Per-set transparent video clips with blink/walk-forward animation
13. **Sync page** — Separate page: load video, scrub, bookmark set transitions, render timed overlay

### Phase 3: Mesh Editor Mode (future)
14. **Port mesh editor** — Bring back MeshEngine, PrimitiveLibrary, mesh-specific tools as a second mode
15. **Shared foundation** — Both modes share stitch library, layer system, export pipeline

---

## Data Model (Phase 1)

```
Project {
  background: { color: string }
  image: { src: blob/url, position: {x,y}, scale: {x,y}, opacity: number }
  stitches: [
    {
      id: string (uuid)
      stitchType: string (e.g. "ch", "sc", "dc")
      position: { x: number, y: number }
      rotation: number (radians)
      setId: number | null
      orderInSet: number | null
      colorOverride: string | null
    }
  ]
  sets: [
    {
      id: number
      label: string
      color: string
      blinkColor: string | null
      order: number (display/sequence order)
    }
  ]
  ruler: { origin: {x,y}, angle: number, spacing: number }
}
```

Export is trivial from this model:
- PNG: render stitches filtered by set, hide background/image layers, `renderer.domElement.toDataURL()`
- JSON: serialize the project object for Remotion / sync tool consumption

---

## What to Copy from VDZ Repo

### Copy as-is (clean, no dependencies on mesh)

| File | Purpose | Notes |
|------|---------|-------|
| `core/EventBus.js` | Pub/sub message bus | Zero dependencies, perfect |
| `core/State.js` | Reactive key-value store | Zero dependencies, perfect |
| `core/HistoryManager.js` | Undo/redo stack | Depends only on EventBus |
| `core/Toast.js` | Toast notification utility | Minimal, DOM-only |

### Copy and adapt (minor changes needed)

| File | Purpose | What to change |
|------|---------|----------------|
| `modules/StitchLibrary.js` | ~45 stitch definitions + Canvas2D draw functions | Remove edge-specific references (atlasIndex stays). This is the most valuable code to bring over — all the symbol drawing logic |
| `modules/StitchAtlas.js` | Generates texture atlas from StitchLibrary | Keep as-is, it only depends on StitchLibrary + Three.js |
| `modules/LayerManager.js` | Layer z-ordering, visibility, opacity | Remove mesh/yarn/quantized layer defs initially. Simplify to: background, image, stitches |
| `modules/ImageOverlay.js` | Reference image import, drag, resize, blend modes | Remove `setMeshEngine()` and mesh-bounds fit mode. Keep centered + canvasView fit modes |

### Copy for reference / cherry-pick patterns

| File | Purpose | What to take |
|------|---------|--------------|
| `ui/Viewport.js` | Three.js setup, camera, pointer events, grid, rulers | **Rewrite** but use as reference for: orthographic camera setup, OrbitControls config (2D pan/zoom only), dot grid shader, ruler drawing, pointer event → world coordinate conversion, resize handling |
| `ui/StitchPanel.js` | Stitch palette UI | Reference for the new stitch picker UI. The categorized stitch display + keyboard shortcut pattern |
| `ui/SelectionManager.js` | Selection state tracking | Reference for the new selection system (but selecting stitch objects instead of graph vertices/edges) |
| `ui/LayerPanel.js` | Layer panel UI | Reusable with minor tweaks |
| `modules/StitchRenderer.js` | InstancedMesh + shader rendering | Reference for rendering stitch symbols. The shader approach (atlas UV sampling) is reusable. But placement logic changes from edge-midpoints to freeform positions |
| `core/Commands.js` | Command pattern implementations | Reference for new commands (PlaceStitchCommand, MoveStitchCommand, AssignSetCommand, etc.) |
| `index.html` | CSS design tokens, layout structure | Copy the CSS variables (`:root` block), font imports, icon button styles, panel styles. The dark theme / minimalist aesthetic carries over |

### Do NOT copy (mesh-specific, not needed)

| File | Purpose |
|------|---------|
| `modules/MeshEngine.js` | Graphology graph + topology — not applicable |
| `modules/PrimitiveLibrary.js` | Shape generators (polar circle, etc.) |
| `modules/BrushEngine.js` | Paints onto mesh edges — replaced by stamp tool |
| `modules/IncDecDetector.js` | Mesh topology analysis |
| `modules/YarnRenderer.js` | Fat edge line rendering |
| `modules/YarnEstimator.js` | Yarn length calculation |
| `modules/YarnDatabase.js` | Yarn brand database |
| `modules/ColorDistance.js` | Color matching algorithm |
| `ui/MutationPanel.js` | Mesh topology mutations |
| `ui/MetadataPanel.js` | 4-channel paint panel (mesh-specific) |
| `ui/EstimatesPanel.js` | Yarn shopping list |
| `ui/YarnPanel.js` | Yarn color panel (superseded) |
| `ui/ColorPicker.js` | Color picker (superseded) |
| `viewer.html` + `viewer-app.js` | Stitch viewer (separate concern) |

---

## New Repo Structure

```
violet-drizzle-freeform/     (or whatever name)
├── index.html                # Freeform editor (the main app)
├── app.js                    # Entry point: instantiation + wiring
├── core/
│   ├── EventBus.js           # Copied from VDZ
│   ├── State.js              # Copied from VDZ
│   ├── HistoryManager.js     # Copied from VDZ
│   ├── Toast.js              # Copied from VDZ
│   └── Commands.js           # NEW: PlaceStitch, MoveStitch, RotateStitch, AssignSet, etc.
├── modules/
│   ├── StitchLibrary.js      # Copied + adapted from VDZ
│   ├── StitchAtlas.js        # Copied from VDZ
│   ├── StitchRenderer.js     # NEW: renders positioned stitch objects (not edge-bound)
│   ├── LayerManager.js       # Copied + simplified from VDZ
│   └── ImageOverlay.js       # Copied + simplified from VDZ
├── ui/
│   ├── Viewport.js           # NEW: simplified Three.js viewport (no mesh raycasting)
│   ├── StitchPicker.js       # NEW: minimalist stitch palette with preview
│   ├── SelectionManager.js   # NEW: selects stitch objects (not graph nodes)
│   ├── LayerPanel.js         # Copied + simplified from VDZ
│   ├── SetPanel.js           # NEW: set management, ordering, color assignment
│   └── ExportPanel.js        # NEW: PNG export options
├── research/                 # Requirements, PRD, discussion notes
│   ├── 03-27 freeform-editor-requirements.md
│   └── 03-27 freeform-editor-prd.md
└── ss/                       # Reference screenshots from original VDZ
    ├── ss1.jpg
    ├── ss2.jpg
    ├── ss3.jpg
    ├── ss4.jpg
    └── ss5.jpg
```

---

## Copy Checklist (for setting up new repo)

From the VDZ repo (`D:\Python\vdz\`), copy these to the new project folder:

```
# Core (copy as-is)
core/EventBus.js
core/State.js
core/HistoryManager.js
core/Toast.js

# Modules (copy, will need minor adaptation)
modules/StitchLibrary.js
modules/StitchAtlas.js
modules/LayerManager.js
modules/ImageOverlay.js

# UI (copy for reference only — will be rewritten)
ui/Viewport.js          → reference
ui/StitchPanel.js       → reference
ui/SelectionManager.js  → reference
ui/LayerPanel.js        → reference
modules/StitchRenderer.js → reference
core/Commands.js        → reference

# Research docs
research/03-27 freeform-editor-requirements.md
research/03-27 freeform-editor-prd.md

# Reference screenshots
ss/ss1.jpg
ss/ss2.jpg
ss/ss3.jpg
ss/ss4.jpg
ss/ss5.jpg

# Design reference (for CSS tokens and layout patterns)
index.html              → reference only, do not use directly
```

### What to tell the new Claude session

> This is a new project for a freeform crochet stitch editor. Read the research/ folder for full requirements and PRD. The files in core/ and modules/ are copied from a previous project — some are ready to use as-is, some need adaptation (see PRD for details). Files marked as "reference" are there for patterns and code to cherry-pick from, not to use directly. The screenshots in ss/ show the target output.

---

## Open Decisions (for discussion in new session)

1. **Project name** — keep "Violet Drizzle" or rename?
2. **Grid/ruler implementation** — reuse VDZ's ruler approach or simplify?
3. **Text labels** — the screenshots show "x 26", "x 78" labels next to rows. Should the editor support placing text labels too, or are those added in CapCut/PDF separately?
4. **Canvas 2D fallback** — for PNG export, should we render via Three.js `toDataURL()` or use a separate Canvas 2D pass for crisper output?
5. **Save/load** — localStorage? File-based JSON? Both?
