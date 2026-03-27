# Roadmap: Violet Drizzle — Freeform Editor

## Overview

A fast freeform stitch placement editor for crochet diagram creation. The user imports a reference image, places stitch symbols using a stamp/paint workflow, organizes stitches into numbered sets, and exports transparent PNGs for use in PDF instruction guides and as input for video generation. Core principle: speed — open the editor, stamp stitches row by row, tweak, export. Under a minute for simple patterns.

Tech stack: Three.js (single rendering library), vanilla JS + ES modules. No frameworks until Phase 2 (React/Remotion for video generation only).

## Architecture Notes

Key design decisions informing all phases:

- **Three.js is the sole renderer.** Used for the editor canvas, PNG export, and eventually video frame rendering. No Canvas2D rendering layer, no Pixi, no Konva.
- **Vanilla JS + ES modules.** No build step, no bundler. Import maps in the HTML file.
- **Stitches are independent positioned objects.** No mesh, no graph topology, no edge attributes. Each stitch has a position, rotation, and optional set assignment.
- **Export-first data model.** Filter stitches by set, hide layers, render — PNG and JSON export must be trivial.
- **Stitch definitions are the foundation.** StitchLibrary (~45 definitions + Canvas2D draw functions) and StitchAtlas (texture generation) are ported from the original VDZ repo (`D:\Python\vdz\`).
- **Sets are the grouping primitive.** Each stitch belongs to at most one set. Sets have an order, a display color, and an optional blink color for animation. No multi-group assignment.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

**Macro-Phase 1: Core Editor + PNG Export (Phases 1-6)**
The minimum viable tool — place stitches, organize into sets, export transparent PNGs. All core infrastructure exists, the stamp workflow is fast, and the export pipeline produces usable output for PDF guides and video overlays.

- [ ] **Phase 1: Project Scaffold + Core Infrastructure** - Three.js + vanilla JS shell, EventBus, State, HistoryManager, Toast, import maps
- [ ] **Phase 2: Viewport + Layer System** - Orthographic canvas, pan/zoom, dot grid, rulers, background layer, image layer, stitch layer
- [ ] **Phase 3: Stitch Library + Picker** - Port StitchLibrary and StitchAtlas from VDZ, stitch picker UI with preview window, rotation control
- [ ] **Phase 4: Stamp Tool + Selection** - Click-to-place stamp workflow, ruler/grid snapping, selection, multi-select, move, rotate individual/group
- [ ] **Phase 5: Set System** - Assign stitches to numbered sets, reorder sets, reorder within sets, color per set, visual indicators
- [ ] **Phase 6: PNG Export** - Full pattern, cumulative per-set, individual set — all transparent background

**Macro-Phase 2: Video Generation (Phases 7-9)**
React/Remotion added as a separate entry point. Animated video output with blink/walk-forward effects, loopable clips, and a sync tool for timing overlays to teaching videos.

- [ ] **Phase 7: Remotion Integration** - React wrapper for stitch rendering, composition definitions, JSON export for stitch data
- [ ] **Phase 8: Loopable Clip Export** - Per-set transparent video clips with blink and walk-forward animation
- [ ] **Phase 9: Sync Page** - Separate page: load video, scrub, bookmark set transitions, render timed overlay

**Macro-Phase 3: Mesh Editor Mode (future, not scheduled)**
Port the mesh editor from the original VDZ repo as a second mode within this project. Both modes share stitch library, layer system, and export pipeline.

- [ ] **Phase 10: Port Mesh Editor** - Bring back MeshEngine, PrimitiveLibrary, mesh-specific tools as a second mode
- [ ] **Phase 11: Shared Foundation** - Unify stitch library, layer system, export pipeline across both modes

## Phase Details

### Phase 1: Project Scaffold + Core Infrastructure
**Goal**: The project shell exists — an HTML page loads Three.js via import map, core modules (EventBus, State, HistoryManager, Toast) are wired up and working, and the entry point (`vdzffedit-app.js`) bootstraps everything. A blank canvas renders with no errors.
**Depends on**: Nothing (first phase)
**Success Criteria** (what must be TRUE):
  1. Opening `vdzffedit.html` in a browser shows a blank Three.js canvas with no console errors
  2. EventBus can publish and subscribe to events (verifiable via console)
  3. State store holds reactive key-value pairs
  4. HistoryManager can undo/redo operations (verifiable via console)
  5. Toast notifications display on screen
**Plans**: TBD

Plans:
- [ ] 01-01: HTML shell, import maps, Three.js setup, vdzffedit-app.js entry point
- [ ] 01-02: Core modules (EventBus, State, HistoryManager, Toast) copied from VDZ and verified

### Phase 2: Viewport + Layer System
**Goal**: The Three.js canvas has an orthographic camera with smooth pan/zoom, a dot grid for spatial reference, and rulers along the edges. Three layers exist (background, image, stitches) with independent visibility and opacity. The user can import a reference image and position it on the image layer.
**Depends on**: Phase 1
**Success Criteria** (what must be TRUE):
  1. User can pan (middle mouse / two-finger drag) and zoom (scroll / pinch) smoothly on the orthographic canvas
  2. Dot grid renders as spatial reference with configurable spacing
  3. Rulers display along canvas edges
  4. Three layers exist: background (flat color), image (reference photo), stitches — each with independent visibility toggle and opacity slider
  5. User can import a reference image (JPG/PNG) and see it displayed on the image layer with adjustable position, scale, and opacity
**Plans**: TBD

Plans:
- [ ] 02-01: Orthographic camera, pan/zoom controls, render loop, resize handling
- [ ] 02-02: Dot grid, rulers, pointer event to world coordinate conversion
- [ ] 02-03: LayerManager (background, image, stitches), layer panel UI with visibility/opacity controls
- [ ] 02-04: ImageOverlay — reference image import, drag, resize, blend modes

### Phase 3: Stitch Library + Picker
**Goal**: All ~45 stitch definitions are available with their Canvas2D draw functions, a texture atlas is generated for GPU-efficient rendering, and a minimalist stitch picker UI lets the user browse, select, and preview stitches with rotation control. The selected stitch and rotation are ready for the stamp tool in Phase 4.
**Depends on**: Phase 2
**Success Criteria** (what must be TRUE):
  1. StitchLibrary contains all ~45 stitch definitions with Canvas2D draw functions, adapted from VDZ (no edge-specific references)
  2. StitchAtlas generates a texture atlas from StitchLibrary for use in Three.js rendering
  3. Stitch picker UI shows all stitches as symbols with abbreviations, organized for quick selection
  4. Preview window above the picker shows the selected stitch enlarged
  5. User can set rotation on the preview — all subsequent stamps will inherit that rotation
  6. User can toggle between: symbol only, abbreviation only, or both
**Plans**: TBD

Plans:
- [ ] 03-01: Port StitchLibrary from VDZ — adapt definitions, remove edge-specific references
- [ ] 03-02: Port StitchAtlas from VDZ — texture atlas generation for Three.js
- [ ] 03-03: StitchPicker UI — palette, preview window, rotation control, display mode toggle

### Phase 4: Stamp Tool + Selection
**Goal**: The core placement workflow works — user picks a stitch, clicks to stamp it on the canvas, and it appears at the correct position with the preview rotation applied. Snapping to ruler/grid is toggleable. Users can select, multi-select, move, and rotate placed stitches individually or as a group.
**Depends on**: Phase 3
**Success Criteria** (what must be TRUE):
  1. User can click on the canvas to place ("stamp") the currently selected stitch at the cursor position
  2. Placed stitches inherit the rotation set in the preview
  3. Grid/ruler snapping works when enabled, free placement when disabled
  4. User can click to select individual stitches, shift-click or drag-box for multi-select
  5. User can move selected stitches (drag or nudge with arrow keys)
  6. User can rotate selected stitches individually or as a group
  7. All placement and manipulation operations are undoable via HistoryManager
**Plans**: TBD

Plans:
- [ ] 04-01: StitchRenderer — render positioned stitch objects using atlas textures
- [ ] 04-02: Stamp tool — click to place, rotation applied, snap to grid (toggleable)
- [ ] 04-03: SelectionManager — click select, multi-select, visual feedback
- [ ] 04-04: Move and rotate — drag/nudge/rotate individual and group, undo integration

### Phase 5: Set System
**Goal**: Users can organize placed stitches into numbered sets for sequencing and coloring. Each stitch belongs to at most one set. Sets have a display order, a color, and an optional blink color pair for future animation. Visual indicators show which set each stitch belongs to. Users can define the order of stitches within a set (walk-forward order for animation).
**Depends on**: Phase 4
**Success Criteria** (what must be TRUE):
  1. User can select stitches and assign them to a numbered set (e.g., select 5 stitches, press "1", they become set 1)
  2. Each stitch belongs to at most one set — reassigning moves it, not duplicates it
  3. Visual indicator shows set membership (color-coded, number label, or both)
  4. User can reorder sets (set 1 can become set 3, etc.)
  5. User can define the order of stitches within a set (walk-forward sequence)
  6. User can apply a display color to an entire set and override color on individual stitches
  7. Each set can have a blink color pair (stored for future animation use)
  8. All set operations are undoable
**Plans**: TBD

Plans:
- [ ] 05-01: Set data model, SetPanel UI, assign/unassign commands
- [ ] 05-02: Set ordering, within-set sequencing, color assignment, blink color pairs
- [ ] 05-03: Visual indicators (color overlay, number labels), set-based stitch filtering

### Phase 6: PNG Export
**Goal**: The user can export transparent PNGs of their stitch diagram in three modes: full pattern (all stitches), cumulative per-set (progressive build-up), and individual set (each set isolated). All exports have transparent backgrounds with stitches at their exact canvas positions. These PNGs are ready for use in PDF instruction guides and as transparent overlays in video editing tools like CapCut.
**Depends on**: Phase 5
**Success Criteria** (what must be TRUE):
  1. User can export a full pattern PNG — all stitches visible, transparent background
  2. User can export cumulative per-set PNGs — progressive build-up (set 1 only; sets 1+2; sets 1+2+3; etc.)
  3. User can export individual set PNGs — each set isolated on transparent background
  4. All exports preserve exact canvas positions (stitches appear in the same relative layout)
  5. Export resolution is configurable or defaults to a reasonable size for print/video use
  6. Background and image layers are hidden during export — only stitches render
**Plans**: TBD

Plans:
- [ ] 06-01: Export engine — layer hiding, Three.js toDataURL, resolution control
- [ ] 06-02: ExportPanel UI — full/cumulative/individual modes, download triggers
- [ ] 06-03: Batch export (zip of all cumulative + individual PNGs)

### Phase 7: Remotion Integration
**Goal**: A React/Remotion entry point exists alongside the vanilla JS editor. Stitch data can be exported as JSON and consumed by Remotion compositions to render animated video frames. This is a separate build target — the editor itself remains vanilla JS.
**Depends on**: Phase 6
**Success Criteria** (what must be TRUE):
  1. Stitch project data exports as JSON (positions, sets, colors, sequence) consumable by Remotion
  2. A Remotion composition renders stitch symbols from the JSON data
  3. The Remotion entry point is separate from the editor — does not affect editor bundle or load time
**Plans**: TBD

### Phase 8: Loopable Clip Export
**Goal**: Each set can be exported as a seamless looping transparent video clip. Each clip shows all previous sets static with the current set blinking or walk-forward animating. User lays clips sequentially on CapCut timeline and trims each to match narration.
**Depends on**: Phase 7
**Success Criteria** (what must be TRUE):
  1. Each set exports as a looping transparent video clip (~10 sec default)
  2. Each clip shows: all previous sets static + current set blinking/animating
  3. Walk-forward animation: stitches within a set appear one by one
  4. Blink animation: set flashes between its two configured colors
  5. Output is transparent background video (WebM with alpha or ProRes 4444)
**Plans**: TBD

### Phase 9: Sync Page
**Goal**: A separate page/tool for syncing stitch overlay animations to a teaching video. User loads the source video, loads the stitch project, scrubs through the video and taps a key at each set transition to create bookmarks. The tool renders one complete transparent overlay video with all timing baked in — user drops it onto the source video in CapCut, already synced.
**Depends on**: Phase 8
**Success Criteria** (what must be TRUE):
  1. Separate page loads a source teaching video in a player alongside the stitch project
  2. User can scrub through video and tap a key at each set transition to create a bookmark
  3. Bookmarks are adjustable after creation
  4. Tool renders one complete transparent overlay video with all set transitions timed to bookmarks
  5. Output is a single overlay clip ready to drop onto the source video
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9

| Phase | Plans | Status | Completed |
|-------|-------|--------|-----------|
| 1. Project Scaffold + Core Infrastructure | 0/2 | Not started | - |
| 2. Viewport + Layer System | 0/4 | Not started | - |
| 3. Stitch Library + Picker | 0/3 | Not started | - |
| 4. Stamp Tool + Selection | 0/4 | Not started | - |
| 5. Set System | 0/3 | Not started | - |
| 6. PNG Export | 0/3 | Not started | - |
| 7. Remotion Integration | 0/? | Not started | - |
| 8. Loopable Clip Export | 0/? | Not started | - |
| 9. Sync Page | 0/? | Not started | - |
