# CLAUDE.md

## Project

Violet Drizzle — Freeform Editor. A fast crochet stitch diagram creation tool for teaching content production. Three.js + vanilla JS, no frameworks.

See `research/` for full requirements and PRD.

## Project Structure

```
vdz2/
├── index.html                # Front page (future: links to editors)
├── vdzffedit.html            # Freeform stitch editor
├── vdzffedit-app.js          # Freeform editor entry point: instantiation + wiring
├── core/
│   ├── EventBus.js           # Pub/sub message bus
│   ├── State.js              # Reactive key-value store
│   ├── HistoryManager.js     # Undo/redo stack
│   ├── Toast.js              # Toast notifications
│   └── Commands.js           # PlaceStitch, MoveStitch, AssignSet, etc.
├── modules/
│   ├── StitchLibrary.js      # ~45 stitch definitions + Canvas2D draw functions
│   ├── StitchAtlas.js        # Texture atlas generation from StitchLibrary
│   ├── StitchRenderer.js     # Renders positioned stitch objects (freeform, not edge-bound)
│   ├── LayerManager.js       # Layer z-ordering, visibility, opacity
│   └── ImageOverlay.js       # Reference image import, drag, resize
├── ui/
│   ├── Viewport.js           # Three.js orthographic canvas, pan/zoom, grid
│   ├── StitchPicker.js       # Stitch palette with preview + rotation control
│   ├── SelectionManager.js   # Stitch object selection
│   ├── LayerPanel.js         # Layer panel UI
│   ├── SetPanel.js           # Set management, ordering, color assignment
│   └── ExportPanel.js        # PNG export options
├── research/                 # Requirements, PRD, reference material
├── ss/                       # Reference screenshots from original VDZ
└── .planning/
    ├── EXECPLAN.md            # ExecPlan authoring spec
    └── plans/                 # All execution plans live here
```

## Key Patterns

- **Three.js is the only rendering library.** Used for the editor canvas, PNG export, and eventually video frame rendering. No Canvas2D rendering layer, no Pixi, no Konva.
- **Vanilla JS + ES modules.** No build step, no bundler, no framework. Import maps in `index.html`.
- **No React until Phase 2.** React/Remotion is only added later for video generation, as a separate entry point.
- **Stitches are independent positioned objects.** No mesh, no graph topology, no edge attributes. Each stitch has a position, rotation, and optional set assignment.
- **Export-first data model.** The data model must make PNG and JSON export trivial — filter stitches by set, hide layers, render.
- **Stitch definitions are the foundation.** StitchLibrary (~45 definitions + Canvas2D draw functions) and StitchAtlas (texture generation) are ported from the original VDZ repo and serve as the core asset.

## Execution Plans

All feature work follows the ExecPlan format defined in `.planning/EXECPLAN.md`. Read that file before authoring or implementing any plan.

- Plans are stored in `.planning/plans/` (one file per plan, descriptive filenames)
- Plans are living documents — keep Progress, Decision Log, Surprises & Discoveries, and Outcomes & Retrospective sections current
- Plans must be self-contained: a novice with no prior context should be able to implement from the plan alone
- When implementing a plan, proceed through milestones without prompting for next steps
- Commit frequently during implementation

## Read Order

Before writing code, read in this order:

1. This file — project structure, patterns, conventions
2. `.planning/EXECPLAN.md` — how to author and implement plans
3. `research/` — requirements and PRD for full context
4. The relevant plan in `.planning/plans/` if implementing one

## Context Window Hygiene

At ~300k tokens, remind user: "Approaching 300k tokens. Good time to `/clear` or `/compact`."
Repeat at 400k.
