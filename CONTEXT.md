# Violet Drizzle — Freeform Editor: Project Context

This document captures the current state of the project, all design decisions made, and the architecture as built. It serves as a handoff document for any future session.

## What This Is

A fast freeform crochet stitch diagram editor. Users import a reference image, stamp stitch symbols onto a canvas, organize them into numbered sets, and export transparent PNGs. Built with Three.js + vanilla JS, no frameworks.

## Current State (Phases 1-5 Complete)

### Phase 1: Project Scaffold + Core Infrastructure
- Three.js canvas renders in `vdzffedit.html`
- Core modules ported from original VDZ repo (`D:\Python\vdz\`):
  - `core/EventBus.js` — pub/sub message bus (copied verbatim)
  - `core/State.js` — reactive key-value store (copied verbatim)
  - `core/HistoryManager.js` — undo/redo stack with batch support (copied verbatim)
  - `core/Toast.js` — toast notifications (copied verbatim)
  - `core/Commands.js` — stripped to base Command + SetValueCommand, then extended with layer, stamp, and transform commands

### Phase 2: Viewport + Layer System
- `ui/Viewport.js` — pure rendering engine (no pointer events). Owns: renderer, orthographic camera, OrbitControls (2D pan/zoom), line grid, rulers, background presets, resize handling, context loss recovery
- `modules/LayerManager.js` — 3 layers: background (z=0), image (z=200), stitches (z=400)
- `modules/ImageOverlay.js` — reference image import, drag, resize from corners, fit modes (centered/canvasView), blend modes (normal/multiply/screen), lock/unlock
- `ui/LayerPanel.js` — layer rows with two-column layout: name on left, icons on right (lock, eye, gear). Image layer has extra upload icon. Gear opens centered config modal per layer.

### Phase 3: Stitch Library + Picker
- `modules/StitchLibrary.js` — 45 stitch definitions with Canvas2D draw functions (copied from VDZ)
- `modules/StitchAtlas.js` — texture atlas generation for GPU rendering (copied from VDZ)
- `ui/StitchPicker.js` — stitch palette panel (bottom-left, toggled by S key or button):
  - Preview area with radial rotation dial (dots on circle, purple indicator)
  - 3 control inputs: rotation (precise degrees), color picker, opacity
  - Snap to Grid / Link to Grid toggle buttons
  - Simple mode (5 common stitches) / Advanced mode (all 45 in categories)
  - Display mode toggle: symbol+abbreviation, symbol only, abbreviation only
  - Selection editing: when stitches are selected, controls reflect and edit their properties
  - Mixed values show "--" for rotation/opacity when selected stitches differ
  - Trash icon to clear active stitch selection
- `ui/Controls.js` — reusable control factories: createNumberInput, createColorPicker, createOpacityControl, createRadialDial

### Phase 4: Stamp Tool + Selection
- `modules/StitchStore.js` — data store for all placed stamps. Each stamp has:
  - id, type ('stitch'|'text'), stitchType, text, textStyle
  - position {x,y}, rotation, scale, zIndex
  - gridSnapped, gridLinked, gridCoords
  - setId, orderInSet, colorOverride, opacity
  - Z-order methods: sendToFront, sendToBack, bringForward, sendBackward
  - Grid linking: reflowGrid(newSpacing), linkToGrid(id, spacing), unlinkFromGrid(id)
  - Export/import JSON for save/load
- `modules/StitchRenderer.js` — InstancedMesh rendering with custom ShaderMaterial:
  - Per-instance atlas UV, tint color, opacity via InstancedBufferAttributes
  - UV flipped to compensate Canvas2D (Y-down) vs Three.js (Y-up)
  - Per-stitch dashed selection boxes when selected
  - Set visibility filtering via SetManager
  - Configurable selection color
  - Hit testing and rect selection for stamp picking
- `ui/SelectionManager.js` — tracks selected stamp IDs, hover state, additive selection, state snapshots for undo
- `ui/TransformControls.js` — PowerPoint-style transform handles:
  - Dashed bounding box around selection
  - 4 corner handles (white dots) for proportional resize (scales stamp `scale` property)
  - Rotation handle (circular arrow sprite) above top edge
  - Move by dragging inside the box
  - Box rotates with content during rotation drag
  - Bounds freeze on selection, don't recalculate during transforms
  - Configurable selection color
- Tool system (`ui/tools/`):
  - `Tool.js` — base class with onPointerDown/Move/Up, onActivate/Deactivate, getCursor
  - `ToolManager.js` — routes pointer events to active tool, manages OrbitControls enable/disable
  - `SelectTool.js` — click select, shift-click, box select, transform handles, image overlay drag/resize
  - `StampTool.js` — click to place stitch, also handles selection/transform when clicking existing stitches
  - Auto-switches between SelectTool and StampTool based on picker state
- `ui/KeyboardManager.js` — extensible keyboard shortcut registry:
  - Register with key combo, label, category, optional guard (when)
  - Remap support, getAll/getGrouped for help screen
  - Suppress/resume for modal input

### Phase 5: Set System
- `modules/SetManager.js` — numbered stitch groups (1-9+):
  - Assign/unassign stitches to sets
  - Toggle visibility per set
  - Show all / hide all
  - Color and blink color per set (for future animation)
  - Persistence (export/import JSON)
- `ui/SetBar.js` — bottom center bar UI:
  - ALL/HIDE toggle (shows all or hides all)
  - Numbers 1-9 with visual states: bold white (assigned+visible), dim (assigned+hidden), faint (empty)
  - White dot indicator above assigned groups
  - Click toggles visibility, double-click selects all in group
  - MORE button for future group management panel
  - ALL/HIDE and MORE disabled when no groups assigned

## Keyboard Shortcuts

| Shortcut | Action | Category |
|----------|--------|----------|
| Ctrl+Z | Undo | edit |
| Ctrl+Shift+Z / Ctrl+Y | Redo | edit |
| Ctrl+C | Copy | edit |
| Ctrl+X | Cut | edit |
| Ctrl+V | Paste | edit |
| Ctrl+D | Duplicate | edit |
| Delete / Backspace / X | Delete selected | edit |
| Ctrl+A | Select all | edit |
| Escape | Deselect all | edit |
| Arrow keys | Nudge selected | edit |
| Ctrl+S | Save project | file |
| Ctrl+O | Open project | file |
| 1-9 | Toggle set visibility | sets |
| 0 | Toggle all sets | sets |
| Ctrl+1-9 | Assign to set | sets |
| Ctrl+0 | Unassign from set | sets |
| S | Toggle stitch picker | panels |
| L | Toggle layers panel | panels |

## File Structure

```
vdz2/
├── vdzffedit.html              # Main HTML — header, toolbar, canvas, panels, set bar
├── vdzffedit-app.js            # Entry point — wiring only, no logic
├── server.sh                   # Dev server (uv run python -m http.server 3688)
├── CLAUDE.md                   # Project instructions for Claude
├── CONTEXT.md                  # This file
├── core/
│   ├── EventBus.js             # Pub/sub message bus
│   ├── State.js                # Reactive key-value store
│   ├── HistoryManager.js       # Undo/redo with batch support
│   ├── Commands.js             # All command classes (Place, Remove, Move, Rotate, Reorder, Layer)
│   └── Toast.js                # Toast notifications
├── modules/
│   ├── StitchLibrary.js        # 45 stitch definitions + Canvas2D draw functions
│   ├── StitchAtlas.js          # Texture atlas generation (8x6 grid, 64px cells)
│   ├── StitchStore.js          # Stamp data store (position, rotation, scale, z-order, grid linking)
│   ├── StitchRenderer.js       # InstancedMesh rendering + selection boxes
│   ├── SetManager.js           # Numbered groups (1-9), visibility, colors
│   ├── LayerManager.js         # 3-layer system (background, image, stitches)
│   └── ImageOverlay.js         # Reference image (drag, resize, blend, lock)
├── ui/
│   ├── Viewport.js             # Pure rendering engine (camera, grid, rulers, background)
│   ├── StitchPicker.js         # Stitch palette + stamp config + selection editing
│   ├── LayerPanel.js           # Layer rows + config modals
│   ├── SetBar.js               # Bottom set bar (ALL/1-9/MORE)
│   ├── SelectionManager.js     # Selection state tracking
│   ├── TransformControls.js    # PowerPoint-style move/resize/rotate handles
│   ├── Controls.js             # Reusable UI widgets (number, color, opacity, radial dial)
│   ├── KeyboardManager.js      # Extensible shortcut registry
│   └── tools/
│       ├── Tool.js             # Base tool class
│       ├── ToolManager.js      # Pointer event router
│       ├── SelectTool.js       # Select, box select, transform, image drag
│       └── StampTool.js        # Click to place, also handles selection in stamp mode
├── .planning/
│   ├── EXECPLAN.md             # ExecPlan authoring spec
│   ├── ROADMAP.md              # Full project roadmap (Phases 1-11)
│   └── plans/                  # Per-phase execution plans
├── research/                   # PRD, requirements
└── ss/                         # Reference screenshots
```

## UI Layout

```
┌─────────────────────────────────────────────────────────┐
│  VIOLET DRIZZLE                          [☀] [👤]       │  ← Header (56px)
├─────────────────────────────────────────────────────────┤
│  [undo][redo] | [save][load]    [grid][ruler] | [gear]  │  ← Floating toolbar
│                                                         │
│  [stitch picker]              [Three.js canvas]         │
│  (bottom-left,                                          │
│   toggled)                                    [layers]  │
│                                               (bottom-  │
│                                                right,   │
│                                                toggled) │
│                                                         │
│           HIDE  1  2  3  4  5  6  7  8  9  MORE         │  ← Set bar (bottom center)
│  [✎]                                            [☰]     │  ← Toggle buttons
└─────────────────────────────────────────────────────────┘
```

## Key Design Decisions

1. **Stamps, not stitches**: The data model uses "stamps" as the generic term. Type='stitch' renders a symbol from the atlas, type='text' (future) renders text. Both share position, rotation, scale, color, opacity, z-order, and set assignment.

2. **Tool system**: All pointer interactions go through ToolManager → active Tool. Viewport is a pure rendering engine with zero pointer event handling. Adding new tools = create a class, register it.

3. **Keyboard shortcuts are data, not code**: All shortcuts registered via KeyboardManager with key combo, label, category, and optional guard. Remappable at runtime. No hardcoded keyboard handling.

4. **Reusable controls**: Number inputs, color pickers, opacity controls, and the radial dial are factory functions in Controls.js. Used in StitchPicker, LayerPanel config modals, and future panels.

5. **Selection editing through the picker**: When stitches are selected, the StitchPicker reflects their properties. Changing rotation/color/opacity applies to all selected stitches individually (not as a group transform).

6. **Transform controls freeze on selection**: Bounding box is computed once when selection changes, not recalculated during transforms. This prevents jumpy behavior during rotation/resize.

7. **Grid linking**: Stitches can be "linked" to the grid. When grid spacing changes, linked stitches reflow proportionally. Enables non-destructive spacing control.

8. **Set bar interaction model**: Inspired by RTS unit groups. Ctrl+N assigns, N toggles visibility, double-click selects all in group. ALL/HIDE is a master toggle.

9. **Chrome dark mode compatibility**: Chrome's auto dark mode inverts pure white (#ffffff) to black. UI uses #cccccc or #eeeeee for dots/indicators that need to remain visible in both modes.

10. **Layer panel design**: Two-column rows with right-justified icon group (lock, eye, gear). Gear opens centered config modal. Image layer has extra upload quick-access icon. No inline controls cluttering the panel.

## What's Next (From Roadmap)

- **Phase 6: PNG Export** — full pattern, cumulative per-set, individual set, transparent backgrounds
- **Phase 7-9: Video Generation** — Remotion integration, loopable clips, sync page
- **Phase 10-11: Mesh Editor Mode** — port from original VDZ as second mode

## Planned Features (Discussed but Not Built)

- **Text stamps**: type='text' with freeform text, font/style config modal, saveable, groupable with stitches
- **Paint tool**: drag to paint stitches along path (future Tool subclass)
- **Lasso select**: freeform selection (future Tool subclass)
- **Fill tool**: flood fill an area (future Tool subclass)
- **Color picker with presets**: full picker + palette of common colors, brand-specific colors from JSON
- **Multiple modes**: freeform (current), mesh editor, 3D amigurumi (future)
- **Handle controllers**: reusable for other purposes
