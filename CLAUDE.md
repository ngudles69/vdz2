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

## Tech Stack & Constraints

**Core stack:**
- **Three.js** — sole rendering library. Editor canvas, PNG export, video frame rendering. No Canvas2D rendering layer, no Pixi, no Konva.
- **Vanilla JS + ES modules.** No build step, no bundler, no framework. Import maps in HTML.
- **No React, no Remotion.** Video generation is done via WebCodecs + frame-by-frame Three.js rendering, not Remotion.

**Video pipeline:**
- **Clip generation (Phase 8):** Three.js renders each frame off-screen from the clip recipe → WebCodecs API encodes frames (hardware-accelerated H.264) → mp4-mux (small JS muxer library, ~10-20KB) wraps into MP4 container → user downloads MP4. All in-memory, single pipeline, no intermediate files.
- **Fallback:** If WebCodecs is unavailable (old browser), export numbered PNGs (001.png, 002.png...) + meta.json. User encodes externally.
- **Filmstrip conversion:** External tool only (ffmpeg/Handbrake). Not part of the app. PC/Mac local utility bundled in Phase 10. The app extracts filmstrip frames on-the-fly from whatever video is loaded.

**Cross-platform targets:**
- Must run in browser on PC, Mac, iPad, iPhone, Android.
- PWA is the packaging path for mobile (add to home screen, works offline).
- Desktop packaging (Phase 10) is a separate concern.
- WebCodecs requires Safari 16.4+ (iOS) / Chrome 94+. Fallback to PNG export for older browsers.
- No native code, no Node.js, no server-side dependencies in the app itself.

**UI constraints:**
- Single responsive design for all devices. No separate mobile layout.
- Touch targets minimum 44px for mobile/tablet.
- Grid/table UIs must scroll (horizontal + vertical) on smaller screens.

## Key Patterns

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
2. `CONTEXT.md` — current state, architecture, design decisions, what's built
3. `.planning/ROADMAP.md` — full project roadmap and phase details
4. `.planning/EXECPLAN.md` — how to author and implement plans
5. `research/` — requirements and PRD for full context
6. The relevant plan in `.planning/plans/` if implementing one

## Standing Instructions

1. **Do not edit code without user approval.** Present your analysis and proposed fix first. Wait for explicit approval before editing any file.
2. **Gather complete info first.** If user requirements, confirm there are no further requirements. Then diagnose root cause. Before presenting, verify this is the best solution — if unsure, research more. Then present analysis, wait for approval.
3. **No blind patching.** One fix, done right. Do not patch repeatedly.
4. **Do not assume.** If the problem or solution is unclear, ask. Do not guess.
5. **When user says stop, STOP.** Do not continue working.
6. **Do not implement until user confirms there are no additional requirements.** Ask before coding.

## Context Window Hygiene

At ~300k tokens, remind user: "Approaching 300k tokens. Good time to `/clear` or `/compact`."
Repeat at 400k.
