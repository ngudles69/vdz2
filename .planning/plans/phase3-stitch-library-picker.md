# Phase 3: Stitch Library, Texture Atlas, and Stitch Picker

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.planning/EXECPLAN.md`.


## Purpose / Big Picture

After this phase, the editor has all ~45 crochet stitch definitions loaded and ready to use, a GPU-efficient texture atlas generated from those definitions, and a stitch picker panel on the right side of the canvas that lets the user browse, preview, and select stitches. The user can open the picker with the S key, choose between a simple palette (5 common stitches) or an advanced view (all ~45 organized by category), see an enlarged preview of the selected stitch at the top of the panel, set a rotation angle for subsequent stamp operations, and toggle the display format between symbol only, abbreviation only, or both. Selecting a stitch sets it as the "active stitch" for the stamp tool that Phase 4 will implement.

What someone can do after this change: open the editor, press S to show the stitch picker panel, click any stitch to select it, see the enlarged preview update at the top of the panel, type a rotation value (in degrees) to set the stamp rotation, toggle the display mode between symbol/abbreviation/both, and switch between simple and advanced mode. The active stitch ID and rotation are stored in State and announced via EventBus, ready for consumption by the stamp tool in Phase 4. The texture atlas can be inspected in the browser console via `window.__vdz.stitchAtlas.getCanvas()` — appending it to the document body shows the 512x384 grid of all stitch symbols drawn white on transparent.


## Progress

- [ ] Copy `StitchLibrary.js` from `D:\Python\vdz\modules\StitchLibrary.js` to `modules/StitchLibrary.js` (verbatim copy — the file already has `export { StitchLibrary, STITCH_CATEGORIES };` on line 588)
- [ ] Copy `StitchAtlas.js` from `D:\Python\vdz\modules\StitchAtlas.js` to `modules/StitchAtlas.js` (verbatim copy — the file already has `export { StitchAtlas };` on line 209)
- [ ] Verify atlas generates: instantiate StitchLibrary and StitchAtlas in `vdzffedit-app.js`, call `atlas.generate()`, confirm no console errors
- [ ] Create `ui/StitchPicker.js` — full stitch picker with preview, rotation, display modes, simple/advanced toggle
- [ ] Wire StitchPicker into `vdzffedit-app.js`
- [ ] Verify: S key toggles the picker panel
- [ ] Verify: clicking a stitch updates preview and emits `stitch:active-changed`
- [ ] Verify: rotation input updates State key `stampRotation`
- [ ] Verify: display mode toggle cycles through symbol/abbreviation/both


## Surprises & Discoveries

(None yet — will be updated during implementation.)


## Decision Log

- Decision: Copy StitchLibrary.js verbatim from the original VDZ repo (`D:\Python\vdz\modules\StitchLibrary.js`). The file is 588 lines, contains no mesh-specific or edge-specific code in its definitions or draw functions, and already exports `StitchLibrary` and `STITCH_CATEGORIES`. The JSDoc header comment mentions "Stitch data sits on EDGES" but this is a documentation comment, not behavioral code — it describes the original VDZ's mesh editor context and does not affect the freeform editor's usage.
  Rationale: The stitch definitions (IDs, names, abbreviations, categories, draw functions) are identical between the mesh editor and freeform editor. The draw functions take `(ctx, cx, cy, size)` and are purely geometric — they have no dependency on edges, vertices, or mesh topology. Copying verbatim avoids introducing bugs through unnecessary editing.
  Date/Author: 2026-03-27 / Plan author

- Decision: Copy StitchAtlas.js verbatim from the original VDZ repo (`D:\Python\vdz\modules\StitchAtlas.js`). The file is 209 lines, imports Three.js, and has no mesh-specific code. It generates an offscreen Canvas2D atlas (512x384, 8 columns x 6 rows of 64x64 cells) by calling each stitch's `draw()` function, then wraps it in a `THREE.CanvasTexture`.
  Rationale: The atlas generation is completely independent of the editor mode. It takes a StitchLibrary instance, iterates over all stitch definitions, and draws each into an atlas grid cell. The output texture is used identically by both the mesh editor's InstancedMesh and the freeform editor's future sprite rendering.
  Date/Author: 2026-03-27 / Plan author

- Decision: StitchPicker.js is a new file, adapted from the original VDZ's `StitchPanel.js` but significantly different. The original StitchPanel takes a `selectionManager` parameter and has "fill mode" logic that emits `stitch:fill-requested` when edges are selected. The freeform StitchPicker removes all edge/fill logic, adds a Canvas2D preview area at the top, adds a rotation control, and adds a display mode toggle (symbol/abbreviation/both). It does not take a SelectionManager — it only needs `bus`, `stitchLibrary`, and `state`.
  Rationale: The freeform editor has no edges to fill. The picker's job is simpler: set the active stitch ID and rotation, which the stamp tool (Phase 4) will consume. The preview area and rotation control are unique to the freeform editor — they let the user see exactly what will be stamped and at what angle before clicking.
  Date/Author: 2026-03-27 / Plan author

- Decision: The StitchPicker stores `activeStitchId` in `State` (key: `activeStitch`) and `rotation` in `State` (key: `stampRotation`). It also emits `stitch:active-changed` on the EventBus with `{ stitchId }`. This dual storage (State + EventBus) follows the project's existing pattern: State holds the current value for any module to read at any time, and EventBus announces changes for modules that need to react immediately.
  Rationale: The stamp tool (Phase 4) will read `state.get('activeStitch')` and `state.get('stampRotation')` on each click. Other UI elements that need to react to stitch changes (e.g., a status bar showing the current stitch) can subscribe to `stitch:active-changed`.
  Date/Author: 2026-03-27 / Plan author

- Decision: The preview area renders the stitch symbol using Canvas2D directly (not via the atlas texture). It creates a small offscreen `<canvas>` element inside the panel, calls the stitch's `draw(ctx, cx, cy, size)` function to render the symbol, and applies the current rotation via `ctx.rotate()`. The preview canvas is approximately 100x100 pixels.
  Rationale: Using the stitch's own draw function for the preview ensures pixel-perfect fidelity with what appears in the atlas and (eventually) on the main canvas. Drawing directly is simpler than extracting a sub-rectangle from the atlas texture, and the preview needs rotation which is trivial with Canvas2D transforms.
  Date/Author: 2026-03-27 / Plan author

- Decision: The display mode cycles through three states: `symbol` (draws the stitch symbol in each button using Canvas2D), `abbreviation` (shows the US abbreviation text), and `both` (shows the symbol with abbreviation text below it). The default is `both`.
  Rationale: Some users recognize stitches by their standard symbols; others prefer abbreviations. The "both" mode is the most informative default. The toggle is a small button in the panel header that cycles through the three modes.
  Date/Author: 2026-03-27 / Plan author


## Outcomes & Retrospective

(Will be completed after implementation.)


## Context and Orientation

This phase builds on Phase 2, which created the Viewport (Three.js orthographic canvas with pan/zoom, line grid, rulers), LayerManager (background/image/stitches layers), ImageOverlay (reference image import/drag/resize), and LayerPanel (layer visibility/opacity controls). The entry point `vdzffedit-app.js` currently instantiates EventBus, State, HistoryManager, Viewport, LayerManager, ImageOverlay, and LayerPanel.

The project uses Three.js via import maps (no bundler, no build step). All modules are ES modules loaded directly by the browser. The HTML file `vdzffedit.html` has a `<script type="importmap">` block that maps `"three"` to the esm.sh CDN.

There are two source files to port from the original VDZ repository at `D:\Python\vdz\`:

The first is `modules/StitchLibrary.js` (588 lines). This file defines all ~45 crochet stitch types organized into 9 categories: basic (8 stitches: chain, slip stitch, single crochet, half double crochet, double crochet, treble, double treble, triple treble), extended (4), increases (6), decreases (6), front post (5), back post (5), shells and clusters (5), joining (2), and surface (3). Each stitch definition is a plain object with properties: `id` (string identifier like `'sc'`), `nameUS` and `nameUK` (full names in US and UK crochet terminology), `abbrUS` and `abbrUK` (abbreviations), `category` (category key), `yarnLengthFactor` and `heightFactor` (numeric scaling factors), `atlasIndex` (sequential integer for atlas grid placement), and `draw` (a function reference `(ctx, cx, cy, size) => void` that draws the stitch symbol on a Canvas2D context). The file also defines a `STITCH_CATEGORIES` array of `{ key, label }` objects and a `SIMPLE_PALETTE_IDS` array `['ch', 'sc', 'hdc', 'dc', 'tr']`. The `StitchLibrary` class provides methods: `get(id)`, `has(id)`, `getAll()`, `getCategory(categoryKey)`, `getCategories()`, and `getSimplePalette()`.

The second is `modules/StitchAtlas.js` (209 lines). This file generates a texture atlas — a single large image containing all stitch symbols arranged in a grid. The atlas is 512 pixels wide and 384 pixels tall, divided into 8 columns and 6 rows of 64x64 pixel cells (48 cells total, more than enough for ~45 stitches). The `StitchAtlas` class takes a `StitchLibrary` instance in its constructor. Its `generate()` method creates an offscreen `<canvas>`, iterates over all stitch definitions, calls each stitch's `draw()` function to render the symbol (white on transparent) into the appropriate grid cell, and wraps the canvas in a `THREE.CanvasTexture`. The `getUV(stitchId)` method returns UV coordinates `{ u0, v0, uScale, vScale }` for sampling a specific stitch's cell from the atlas texture. The atlas is used later (Phase 4) by the StitchRenderer to efficiently render many stitch instances using a single texture.

The new file is `ui/StitchPicker.js`. This is the stitch palette panel that appears on the right side of the canvas. It is adapted from the original VDZ's `ui/StitchPanel.js` (437 lines) but differs in several ways: no `selectionManager` parameter, no edge-fill logic, added preview area with Canvas2D rendering, added rotation control, added display mode toggle (symbol/abbreviation/both). The StitchPicker injects its own CSS via JavaScript (following the same pattern as the original StitchPanel), builds its DOM inside `#canvas-container`, and manages its own visibility state.

Files that will exist after this phase (new files marked with +):

```
vdz2/
├── vdzffedit.html
├── vdzffedit-app.js              # Updated: instantiate StitchLibrary, StitchAtlas, StitchPicker
├── core/
│   ├── EventBus.js
│   ├── State.js
│   ├── HistoryManager.js
│   ├── Commands.js
│   └── Toast.js
├── modules/
│   ├── StitchLibrary.js          # + NEW: copied from D:\Python\vdz\modules\StitchLibrary.js
│   ├── StitchAtlas.js            # + NEW: copied from D:\Python\vdz\modules\StitchAtlas.js
│   ├── LayerManager.js
│   └── ImageOverlay.js
└── ui/
    ├── Viewport.js
    ├── StitchPicker.js            # + NEW: stitch palette with preview, rotation, display modes
    ├── LayerPanel.js
    └── SelectionManager.js        # (future — Phase 4)
```


## Plan of Work

The work is divided into two milestones. The first milestone ports StitchLibrary and StitchAtlas from the original VDZ repo and verifies that the atlas generates correctly. The second milestone builds the StitchPicker UI with its preview area, rotation control, and display mode toggle.


### Milestone 1: StitchLibrary + StitchAtlas

At the end of this milestone, two new files exist in `modules/` — `StitchLibrary.js` and `StitchAtlas.js` — and both are instantiated in `vdzffedit-app.js`. The atlas generates a 512x384 texture with all ~45 stitch symbols drawn in an 8x6 grid. The user can verify this by opening the browser console and running `document.body.appendChild(window.__vdz.stitchAtlas.getCanvas())` to see the atlas image appended to the page.

**Step 1: Copy StitchLibrary.js.** Copy `D:\Python\vdz\modules\StitchLibrary.js` verbatim to `vdz2/modules/StitchLibrary.js`. The file is 588 lines. It has no imports (pure JS). The last line is `export { StitchLibrary, STITCH_CATEGORIES };`. No modifications are needed.

**Step 2: Copy StitchAtlas.js.** Copy `D:\Python\vdz\modules\StitchAtlas.js` verbatim to `vdz2/modules/StitchAtlas.js`. The file is 209 lines. It imports `three` on line 1 (`import * as THREE from 'three';`). The last line is `export { StitchAtlas };`. No modifications are needed.

**Step 3: Wire into vdzffedit-app.js.** Add import statements for StitchLibrary and StitchAtlas at the top of `vdzffedit-app.js`. After the existing singletons (bus, state, history), instantiate the stitch library and atlas:

```js
import { StitchLibrary } from './modules/StitchLibrary.js';
import { StitchAtlas } from './modules/StitchAtlas.js';

// ... (after existing singletons)

// --- Stitch library and atlas ---
const stitchLibrary = new StitchLibrary();
const stitchAtlas = new StitchAtlas(stitchLibrary);
stitchAtlas.generate();
```

Add `stitchLibrary` and `stitchAtlas` to the `window.__vdz` debug object at the bottom of the file.

**Verification:** Open `vdzffedit.html` in a browser. The console should show `[VDZ] Freeform editor initialized` with no errors. In the console, run:

```js
document.body.appendChild(window.__vdz.stitchAtlas.getCanvas())
```

A 512x384 canvas should appear at the bottom of the page showing white stitch symbols on a transparent (black) background in an 8-column grid. Count approximately 44 symbols. The first row should show: chain (oval), slip stitch (dot), single crochet (X), half double crochet (T), double crochet (T with slash), treble (T with 2 slashes), double treble (T with 3 slashes), triple treble (T with 4 slashes).


### Milestone 2: StitchPicker UI

At the end of this milestone, a stitch picker panel appears on the right side of the canvas when toggled with the S key. It has a preview area at the top showing the currently selected stitch enlarged (rendered via Canvas2D), a rotation input, a display mode toggle, a simple/advanced mode toggle, and a grid of stitch buttons. Clicking a stitch selects it, updates the preview, stores the active stitch ID in State, and emits `stitch:active-changed` on EventBus.

**Step 1: Create `ui/StitchPicker.js`.** This is a new file of approximately 450-550 lines. It follows the same CSS-injection and DOM-building pattern as the original VDZ's StitchPanel. The class signature is:

```js
class StitchPicker {
  constructor(bus, stitchLibrary, state) { ... }
  show() { ... }
  hide() { ... }
  toggle() { ... }
  get isOpen() { ... }
  getActiveStitchId() { ... }
  dispose() { ... }
}

export { StitchPicker };
```

The constructor takes three arguments: `bus` (EventBus instance), `stitchLibrary` (StitchLibrary instance), and `state` (State instance). It does not take a SelectionManager — that is a mesh-editor concern.

The panel DOM structure (all created in JS, appended to `#canvas-container`):

```
div.stitch-picker                          ← root, absolute positioned right side
  div.stitch-picker-header                 ← title + mode toggle + display toggle
    span.stitch-picker-title               ← "Stitches"
    button.stitch-picker-display-btn       ← cycles: Sym / Abbr / Both
    button.stitch-picker-mode-btn          ← "Advanced" or "Simple"
  div.stitch-picker-preview                ← preview area
    canvas.stitch-picker-preview-canvas    ← 100x100 Canvas2D preview of selected stitch
    div.stitch-picker-preview-label        ← stitch name text
    div.stitch-picker-rotation             ← rotation control
      label                                ← "Rotation"
      input[type=number]                   ← degrees, step=15, min=-360, max=360
  div.stitch-picker-content                ← scrollable stitch button grid
    (in simple mode: one grid of 5 buttons)
    (in advanced mode: category labels + grids)
```

**CSS injection.** The `#injectStyles()` method creates a `<style>` element with id `stitch-picker-styles` and appends it to `document.head`. The styles follow the same visual language as the rest of the editor — dark surfaces, accent color highlights, translucent backgrounds. Key CSS properties:

The `.stitch-picker` root is `position: absolute; right: 12px; top: 50%; transform: translateY(-50%);` — vertically centered on the right edge of the canvas container. It starts hidden (`display: none`) and shows when `.open` class is added (`display: flex; flex-direction: column`). Background is `rgba(19, 19, 26, 0.92)` with `border: 1px solid var(--vd-border)`, `border-radius: 8px`, `z-index: 5`, `max-height: calc(100% - 24px)`, `min-width: 200px`, `max-width: 260px`.

The `.stitch-picker-preview` area has `padding: 12px`, `border-bottom: 1px solid var(--vd-border)`, `display: flex; flex-direction: column; align-items: center; gap: 6px`. The preview canvas has `width: 100px; height: 100px; border: 1px solid var(--vd-border); border-radius: 4px; background: var(--vd-surface-2)`.

Each `.stitch-btn` is `width: 40px; height: 40px` in `both` display mode, `width: 36px; height: 36px` in `abbreviation` or `symbol` mode. In `symbol` mode, each button contains a small `<canvas>` element (32x32 or 28x28) that draws the stitch symbol. In `abbreviation` mode, each button shows the US abbreviation text. In `both` mode, each button contains a small canvas (24x24) above the abbreviation text in a smaller font.

**Preview rendering.** When a stitch is selected, the `#renderPreview()` method clears the 100x100 preview canvas, applies a rotation transform (`ctx.translate(50, 50); ctx.rotate(rotation * Math.PI / 180);`), calls the stitch's `draw(ctx, 0, 0, 80)` function to render the symbol centered and enlarged, and restores the transform. The symbol is drawn in white (`#ffffff`) on the dark preview canvas background. Below the canvas, the stitch name (US terminology) is shown as text, and the rotation input displays the current angle.

**Rotation control.** The rotation input is a `<input type="number">` with `step="15"`, `min="-360"`, `max="360"`, defaulting to 0. When the value changes, the picker stores it in `state.set('stampRotation', value)` and re-renders the preview to show the rotated symbol. The rotation value is in degrees. The stamp tool (Phase 4) will read this value and convert to radians when placing stitches.

**Display mode toggle.** The display mode button in the header shows the current mode label and cycles on click: `both` -> `symbol` -> `abbreviation` -> `both`. When the mode changes, all stitch buttons in the content area are re-rendered with the new display format.

**Simple/Advanced mode.** Identical logic to the original StitchPanel. Simple mode shows 5 common stitches (ch, sc, hdc, dc, tr) from `stitchLibrary.getSimplePalette()`. Advanced mode shows all stitches grouped by category from `stitchLibrary.getCategories()`, with category label dividers.

**Stitch selection.** When a stitch button is clicked: if it was already the active stitch, it deselects (active becomes null). Otherwise, it becomes the active stitch. The picker updates `state.set('activeStitch', stitchId)` (or null), emits `bus.emit('stitch:active-changed', { stitchId })`, re-renders the preview, and updates the visual highlight on buttons (the active button gets the `.stitch-btn--active` class with accent border and glow).

**S key toggle.** A `keydown` listener on `document` toggles the panel when S is pressed, ignoring the keypress if the user is typing in an input, textarea, or select element, or if any modifier key (Ctrl, Meta, Alt, Shift) is held.

**Step 2: Wire StitchPicker into vdzffedit-app.js.** Add the import and instantiation after the stitchAtlas lines:

```js
import { StitchPicker } from './ui/StitchPicker.js';

// ... (after stitchAtlas.generate())

// --- Stitch picker ---
const stitchPicker = new StitchPicker(bus, stitchLibrary, state);
```

Add `stitchPicker` to the `window.__vdz` debug object.

**Verification:** Open `vdzffedit.html`. Press S — the stitch picker panel should appear on the right side, showing the simple palette (5 stitches: ch, sc, hdc, dc, tr) with symbols and abbreviations. Click "Advanced" — all ~45 stitches appear organized by category. Click a stitch (e.g., "sc") — the preview area at the top shows an enlarged X symbol, the stitch name "Single Crochet" appears below it, and the clicked button gets an accent-colored border. Type 45 in the rotation input — the preview rotates the X symbol 45 degrees. Click the display mode button to cycle through symbol-only, abbreviation-only, and both. In the console, verify `window.__vdz.state.get('activeStitch')` returns `'sc'` and `window.__vdz.state.get('stampRotation')` returns `45`. Press S again — the panel hides.


## Concrete Steps

All commands assume the working directory is `D:\Python\vdz2\`.

**Milestone 1:**

1. Copy StitchLibrary.js:
   ```
   cp "D:/Python/vdz/modules/StitchLibrary.js" modules/StitchLibrary.js
   ```

2. Copy StitchAtlas.js:
   ```
   cp "D:/Python/vdz/modules/StitchAtlas.js" modules/StitchAtlas.js
   ```

3. Edit `vdzffedit-app.js` — add imports at the top (after existing imports):
   ```js
   import { StitchLibrary } from './modules/StitchLibrary.js';
   import { StitchAtlas } from './modules/StitchAtlas.js';
   ```

4. Edit `vdzffedit-app.js` — add instantiation after the image overlay setup (before the undo/redo wiring):
   ```js
   // --- Stitch library and atlas ---
   const stitchLibrary = new StitchLibrary();
   const stitchAtlas = new StitchAtlas(stitchLibrary);
   stitchAtlas.generate();
   ```

5. Edit `vdzffedit-app.js` — update the `window.__vdz` line to include `stitchLibrary` and `stitchAtlas`:
   ```js
   window.__vdz = { bus, state, history, viewport, layerManager, imageOverlay, stitchLibrary, stitchAtlas };
   ```

6. Serve the project (e.g., `npx serve .` or any local HTTP server) and open `vdzffedit.html`. Verify no console errors. Run `document.body.appendChild(window.__vdz.stitchAtlas.getCanvas())` in the console and confirm the atlas image appears.

**Milestone 2:**

7. Create `ui/StitchPicker.js` with the full implementation as described in the milestone 2 section above.

8. Edit `vdzffedit-app.js` — add the import:
   ```js
   import { StitchPicker } from './ui/StitchPicker.js';
   ```

9. Edit `vdzffedit-app.js` — add instantiation after `stitchAtlas.generate()`:
   ```js
   // --- Stitch picker ---
   const stitchPicker = new StitchPicker(bus, stitchLibrary, state);
   ```

10. Edit `vdzffedit-app.js` — update `window.__vdz` to include `stitchPicker`:
    ```js
    window.__vdz = { bus, state, history, viewport, layerManager, imageOverlay, stitchLibrary, stitchAtlas, stitchPicker };
    ```

11. Serve and test as described in the Milestone 2 verification section.


## Validation and Acceptance

After both milestones are complete, the following behaviors must all be verifiable by opening `vdzffedit.html` in a browser:

1. No console errors on page load. The console shows `[VDZ] Freeform editor initialized`.

2. Atlas generation: running `document.body.appendChild(window.__vdz.stitchAtlas.getCanvas())` in the console appends a 512x384 canvas showing ~44 white stitch symbols on transparent background in an 8x6 grid.

3. Pressing S opens the stitch picker panel on the right side of the canvas. Pressing S again closes it.

4. The panel opens in simple mode with 5 stitch buttons (ch, sc, hdc, dc, tr). Clicking "Advanced" shows all ~45 stitches grouped by category with category labels (Basic Stitches, Extended Stitches, Increases, Decreases, Front Post, Back Post, Shells & Clusters, Joining, Surface).

5. Clicking a stitch button (e.g., "sc") highlights it with an accent border, updates the preview area to show the stitch symbol enlarged, and shows the stitch name below the preview. Running `window.__vdz.state.get('activeStitch')` in the console returns `'sc'`.

6. Clicking the same stitch again deselects it — the preview clears, the highlight is removed, and `state.get('activeStitch')` returns `null`.

7. Typing `90` in the rotation input rotates the preview symbol 90 degrees clockwise. `state.get('stampRotation')` returns `90`.

8. Clicking the display mode button cycles the stitch buttons through three formats: symbols drawn as small canvases, US abbreviation text, or both (symbol above abbreviation).

9. The S key does not trigger when the user is focused on an input field (e.g., the rotation input) or when modifier keys are held.


## Idempotence and Recovery

All steps are idempotent. Copying the source files overwrites any previous copy. The CSS injection checks for an existing `stitch-picker-styles` element before inserting, so re-instantiation does not create duplicate styles. The StitchPicker builds its DOM fresh each time the constructor runs. If something goes wrong, delete `modules/StitchLibrary.js`, `modules/StitchAtlas.js`, and `ui/StitchPicker.js`, revert `vdzffedit-app.js` to its Phase 2 state, and start over.


## Artifacts and Notes

The StitchLibrary source file at `D:\Python\vdz\modules\StitchLibrary.js` is 588 lines. The symbol draw functions (lines 40-414) use a consistent API: `(ctx, cx, cy, s) => void` where `ctx` is a Canvas2D context, `cx`/`cy` is the center point, and `s` is the bounding size. Helper functions (`drawTWithSlashes`, `drawExtended`, `drawIncrease`, `drawDecrease`, `drawFrontPost`, `drawBackPost`) are module-level, not exported — they are used only by the `SYMBOL_DRAWS` map entries.

The StitchAtlas source file at `D:\Python\vdz\modules\StitchAtlas.js` is 209 lines. Constants: `CELL_SIZE = 64`, `COLS = 8`, `ROWS = 6`, `ATLAS_WIDTH = 512`, `ATLAS_HEIGHT = 384`. The atlas draws symbols in white (`#ffffff`) with `lineWidth: 6`, `lineCap: 'round'`, `lineJoin: 'round'` on a transparent background. The constructor accepts an optional `{ debug: true }` flag that draws cell indices and grid lines in yellow for debugging.

Expected atlas UV for common stitches (for future reference by Phase 4):
- `ch` (chain): atlasIndex 0 -> col 0, row 0 -> u0=0, v0=0
- `sc` (single crochet): atlasIndex 2 -> col 2, row 0 -> u0=0.25, v0=0
- `dc` (double crochet): atlasIndex 4 -> col 4, row 0 -> u0=0.5, v0=0


## Interfaces and Dependencies

**Dependencies (external):** Three.js, loaded via import map from `https://esm.sh/three@0.183.2`. Used by StitchAtlas for `THREE.CanvasTexture`, `THREE.LinearFilter`, `THREE.SRGBColorSpace`.

**Dependencies (internal):** EventBus (`core/EventBus.js`), State (`core/State.js`), StitchLibrary (`modules/StitchLibrary.js`).

In `modules/StitchLibrary.js`, the exported interface:

```js
class StitchLibrary {
  get(id: string): StitchDef | null
  has(id: string): boolean
  getAll(): StitchDef[]
  getCategory(categoryKey: string): { label: string, stitches: StitchDef[] }
  getCategories(): Array<{ key: string, label: string, stitches: StitchDef[] }>
  getSimplePalette(): StitchDef[]
}

// StitchDef shape:
// { id, nameUS, nameUK, abbrUS, abbrUK, category, yarnLengthFactor, heightFactor, atlasIndex, draw }

const STITCH_CATEGORIES: Array<{ key: string, label: string }>
```

In `modules/StitchAtlas.js`, the exported interface:

```js
class StitchAtlas {
  constructor(library: StitchLibrary, options?: { debug?: boolean })
  generate(): THREE.CanvasTexture
  getUV(stitchId: string): { u0: number, v0: number, uScale: number, vScale: number } | null
  getTexture(): THREE.CanvasTexture
  getCanvas(): HTMLCanvasElement | null

  static CELL_SIZE: 64
  static COLS: 8
  static ROWS: 6
  static ATLAS_WIDTH: 512
  static ATLAS_HEIGHT: 384
}
```

In `ui/StitchPicker.js`, the exported interface:

```js
class StitchPicker {
  constructor(bus: EventBus, stitchLibrary: StitchLibrary, state: State)
  show(): void
  hide(): void
  toggle(): void
  get isOpen(): boolean
  getActiveStitchId(): string | null
  dispose(): void
}
```

**State keys used:**
- `activeStitch` (string | null) — the ID of the currently selected stitch, or null if none
- `stampRotation` (number) — rotation in degrees for subsequent stamp operations, default 0

**EventBus events emitted:**
- `stitch:active-changed` with payload `{ stitchId: string | null }` — emitted when the user selects or deselects a stitch in the picker
