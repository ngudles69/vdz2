# Phase 2: Viewport + Layer System

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.planning/EXECPLAN.md`.

## Purpose / Big Picture

After this phase, the freeform editor has a fully functional viewport with pan/zoom navigation, a line grid for spatial reference, rulers along the canvas edges, and a three-layer system (background, image, stitches). The user can import a reference image, drag it around, resize it from corner handles, change blend modes, and toggle layer visibility/opacity from the layer panel. This is the workspace — every subsequent phase adds content into these layers.

What someone can do after this change: open the editor, middle-click-drag or two-finger-drag to pan the canvas, scroll to zoom in/out, see a line grid anchored at the origin, see rulers with tick marks along the top and left edges, toggle the grid and rulers on/off from settings, click the layers button to open the layer panel, toggle layer visibility and adjust opacity, import a reference image (JPG/PNG), drag it to reposition, resize from corners, switch blend modes, and lock/unlock the image.

## Progress

- [x] (2026-03-27) Create `ui/Viewport.js` — Three.js renderer, orthographic camera, OrbitControls, render loop, resize handling, context loss recovery
- [x] (2026-03-27) Add line grid to Viewport — configurable spacing, opacity, color
- [x] (2026-03-27) Add ruler drawing to Viewport — top and left Canvas2D rulers with tick marks and numbers
- [x] (2026-03-27) Create `modules/LayerManager.js` — layer registry with background, image, and stitches layers
- [x] (2026-03-27) Add background system to Viewport — background plane mesh in background layer, preset backgrounds (minimal, leather, wood, felt, solid)
- [x] (2026-03-27) Create `modules/ImageOverlay.js` — reference image loading, fit modes, blend modes, drag, resize, lock/unlock
- [x] (2026-03-27) Create `ui/LayerPanel.js` — two-column layer rows with quick-access icons (lock, eye, gear) + per-layer config modals
- [x] (2026-03-27) Update `vdzffedit-app.js` — instantiate Viewport, LayerManager, ImageOverlay, LayerPanel; wire settings panel controls
- [x] (2026-03-27) Verify: pan/zoom works smoothly
- [x] (2026-03-27) Verify: grid renders and toggles from settings
- [x] (2026-03-27) Verify: rulers render with tick marks and update during pan/zoom
- [x] (2026-03-27) Verify: layers panel shows all three layers with working visibility/opacity controls
- [x] (2026-03-27) Verify: reference image import, drag, resize, blend modes, lock all work

## Surprises & Discoveries

(None yet — will be updated during implementation.)

## Decision Log

- Decision: Port the Viewport as a class (like the original VDZ) rather than keeping the inline setup from Phase 1's `vdzffedit-app.js`. The Viewport class owns the renderer, camera, controls, grid, rulers, background, and context recovery — all tightly coupled concerns that belong together.
  Rationale: The original VDZ Viewport is ~2000 lines because it also handles mesh-specific concerns (vertex dragging, proportional edit, mirror mode, edge loop detection). The freeform version strips all of that, keeping only: renderer setup, orthographic camera, OrbitControls for pan/zoom, line grid, rulers, background system, pointer-to-world coordinate conversion, and context loss recovery. This is approximately 600-700 lines.
  Date/Author: 2026-03-27 / Plan author

- Decision: Use a line grid (THREE.LineSegments) instead of a dot grid. The original VDZ uses a line grid, and it provides better spatial reference for stitch placement.
  Rationale: Lines are easier to align stitches against than dots, and the implementation is straightforward — generate line segments from -extent to +extent at regular spacing intervals, with configurable opacity and color.
  Date/Author: 2026-03-27 / Plan author

- Decision: The LayerManager for the freeform editor has three layers instead of six: `background` (z=0), `image` (z=200), and `stitches` (z=400). The original VDZ layers `quantized`, `mesh`, `yarn`, and `stitch` are all mesh-editor-specific.
  Rationale: The freeform editor has no mesh, no yarn bands, no quantized layer. Stitches are independent positioned objects rendered in a single layer.
  Date/Author: 2026-03-27 / Plan author

- Decision: Remove `meshBounds` fit mode from ImageOverlay. Keep only `centered` and `canvasView`. The original VDZ's `meshBounds` mode scales the image to fit the mesh bounding box, but the freeform editor has no mesh.
  Rationale: The HTML already reflects this — the `image-fit-mode` select only has `centered` and `canvasView` options. The `setMeshEngine()` method and all mesh-bounds computation code are removed.
  Date/Author: 2026-03-27 / Plan author

- Decision: OrbitControls pans with left mouse button (not just middle). In the freeform editor, left-click will eventually be used for stamp placement (Phase 4), but for now during Phase 2, all mouse buttons pan. Phase 4 will reconfigure this when the stamp tool is added.
  Rationale: There's no stamp tool yet, so restricting left-click to "nothing" would make the editor feel broken. Allowing all buttons to pan gives the user something to interact with immediately.
  Date/Author: 2026-03-27 / Plan author

- Decision: Layer panel rows use a two-column layout: layer name on the left, right-justified icon group on the right. Icons per row (right to left): gear (config), eye (visibility), lock. The image layer gets an additional upload icon to the left of lock. Opacity is NOT in the row — it lives in the per-layer config modal.
  Rationale: Keeps the layer panel clean and uncluttered. Quick-access icons for the most common actions (toggle visibility, lock, upload image), full settings in the config modal. Upload is a primary action for the image layer — too common to hide behind the gear.
  Date/Author: 2026-03-27 / Plan author

- Decision: The gear icon opens a centered popover modal (`#layer-config-overlay`) with layer-specific settings. Background config: color picker. Image config: upload, clear, opacity, fit mode, blend mode. Stitches config: opacity (TBD, may grow). The modal body is populated dynamically based on which layer's gear was clicked.
  Rationale: Different layers have different settings needs. The background layer may only need a color picker now but could grow. The image layer has many settings (fit, blend, opacity). A modal scales to any number of settings without cluttering the panel.
  Date/Author: 2026-03-27 / Plan author

## Outcomes & Retrospective

(Will be completed after implementation.)

## Context and Orientation

This phase builds on Phase 1, which created the project shell with `vdzffedit.html`, `vdzffedit-app.js`, and four core modules in `core/` (EventBus, State, HistoryManager, Commands, Toast). The HTML page has a header bar with undo/redo/settings buttons, a `#canvas-container` div where Three.js mounts, ruler `<canvas>` elements, a layer panel with visibility/opacity controls, a settings panel, and a toast notification element.

The Three.js setup from Phase 1's `vdzffedit-app.js` (renderer, camera, scene, resize handler) will be moved into the new `Viewport` class. The entry point will instantiate `Viewport` instead of managing Three.js directly.

Key files ported from the original VDZ at `D:\Python\vdz\`:

- `ui/Viewport.js` (~2000 lines) — heavily adapted. All mesh-specific code is removed (vertex/edge raycasting, vertex dragging, proportional edit, mirror mode, box select for vertices, edge loop detection). What remains: renderer setup, orthographic camera, OrbitControls, line grid, rulers, background system, pointer-to-world conversion, resize handling, context loss recovery. The resulting file is approximately 600-700 lines.
- `modules/LayerManager.js` (~340 lines) — lightly adapted. Layer definitions are simplified from six to three layers. The class itself (getGroup, setVisible, setOpacity, getLayers, etc.) copies almost verbatim.
- `modules/ImageOverlay.js` (~690 lines) — moderately adapted. The `meshBounds` fit mode, `setMeshEngine()` method, and `mesh:graph-imported` event listener are removed. Everything else (loadImage, drag, resize, handles, blend modes, lock) copies cleanly.

A new file `ui/LayerPanel.js` will wire the HTML layer panel to the LayerManager and ImageOverlay — handling visibility toggle clicks, opacity input changes, background preset buttons, and image upload/fit/blend/lock/remove controls.

Key terminology:

- **OrbitControls**: A Three.js addon that provides mouse/touch interaction for camera movement. In this project, rotation is disabled — only pan (translate the camera in X/Y) and zoom (change the camera's `zoom` property) are allowed. This gives a 2D panning/scrolling experience.
- **Orthographic camera**: A camera with no perspective distortion. The visible area is defined by left/right/top/bottom frustum boundaries. Zoom is controlled by the camera's `zoom` property — higher zoom means a smaller visible area (zoomed in).
- **Frustum size**: A constant (500) that defines the base height of the camera's visible area in world units. The width is derived from the aspect ratio. At zoom=1, the camera shows 500 world units vertically.
- **renderOrder**: A Three.js property on objects that controls draw order when `depthTest` is disabled. Higher renderOrder draws on top. Used here to ensure layers stack correctly: background (0) under image (200) under stitches (400) under grid (1000).
- **Line grid**: A set of horizontal and vertical lines rendered as `THREE.LineSegments` in the scene. The grid is not a layer — it renders on top of everything (renderOrder 1000) as a spatial reference tool.
- **Rulers**: Two `<canvas>` elements (top and left) drawn with Canvas2D, overlaid on the Three.js canvas. They show tick marks and numbers at grid-spacing intervals, converting world-space positions to screen-space via the camera's projection. They update every frame during the render loop.
- **ResizeObserver**: A browser API that fires whenever an element's size changes. Used instead of `window.addEventListener('resize')` because it detects container size changes that aren't triggered by window resize (e.g., panel open/close).

Files that will exist after this phase (new files marked with +):

```
vdz2/
├── vdzffedit.html
├── vdzffedit-app.js          # Updated: instantiates Viewport, LayerManager, etc.
├── core/
│   ├── EventBus.js
│   ├── State.js
│   ├── Commands.js           # Updated: add LayerOpacityCommand, LayerVisibilityCommand
│   ├── HistoryManager.js
│   └── Toast.js
├── ui/
│   ├── Viewport.js           # + NEW: Three.js canvas, camera, controls, grid, rulers, background
│   └── LayerPanel.js         # + NEW: Layer panel UI wiring
├── modules/
│   ├── LayerManager.js       # + NEW: Layer registry (background, image, stitches)
│   └── ImageOverlay.js       # + NEW: Reference image overlay
```

## Plan of Work

The work is divided into four milestones, each building on the previous.

### Milestone 1: Viewport Class — Renderer, Camera, Pan/Zoom, Grid, Rulers

This milestone creates `ui/Viewport.js` and updates `vdzffedit-app.js` to use it. At the end, the editor has a pannable/zoomable canvas with a line grid and rulers.

**Create `ui/Viewport.js`.**

This is a new class adapted from the original VDZ `Viewport.js`. It receives `bus`, `state`, and `container` (the `#canvas-container` DOM element) in its constructor and sets up:

1. **WebGL renderer**: `THREE.WebGLRenderer` with antialiasing, pixel ratio capped at 2, sRGB output color space, clear color `0x1a1a24`. Appended to the container.

2. **Orthographic camera**: Frustum size 500, aspect ratio from container dimensions. Camera positioned at (0, 0, 100) looking at origin.

3. **OrbitControls**: Imported from `three/addons/controls/OrbitControls.js`. Configured for 2D only:
   - `enableRotate = false` — no 3D rotation
   - `enablePan = true` with `screenSpacePanning = true`
   - `enableDamping = true` with `dampingFactor = 0.1` — smooth deceleration
   - `minZoom = 0.1`, `maxZoom = 30`
   - All mouse buttons mapped to PAN: `{ LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN }`
   - Touch: `{ ONE: null, TWO: THREE.TOUCH.DOLLY_PAN }` — two-finger for pan+zoom
   - Emits `camera:zoom-changed` on the EventBus when zoom level changes

4. **Line grid**: A `THREE.Group` containing `THREE.LineSegments`. Lines extend from -2000 to +2000 in both axes at configurable spacing (default 20 world units). Grid color defaults to `#777777`, opacity defaults to `0.15`. The grid is initially hidden (`visible = false`) and toggled via `setGridVisible(bool)`. Grid renderOrder is 1000 (draws on top of all layers). Methods: `setGridVisible(bool)`, `setGridSize(n)`, `setGridOpacity(n)`, `setGridColor(hex)`.

5. **Rulers**: References the two `<canvas>` elements (`#ruler-top`, `#ruler-left`) from the HTML. A `#drawRulers()` method runs every frame (after scene render) when rulers are visible. It:
   - Sizes the canvases to match the viewport (accounting for device pixel ratio)
   - Computes the visible world-space range from the camera's frustum and zoom level
   - Iterates grid-spacing intervals within the visible range
   - Converts world positions to screen positions using: `screenX = ((worldX - cam.position.x) * cam.zoom / (frustumSize * aspect / 2) + 1) / 2 * viewportWidth`
   - Draws tick marks (6px lines from the inner edge) and numbers (the grid index, e.g., -3, -2, -1, 0, 1, 2, 3) using Canvas2D
   - Left ruler numbers are rotated -90 degrees
   - Ruler text color: `#aaa`, tick color: `#666`, font: `9px Jost`
   - Rulers are initially hidden. Methods: `setRulerVisible(bool)`, `setRulerOpacity(n)`.

6. **Resize handling**: A `ResizeObserver` on the container calls `#onResize(width, height)` which updates the camera frustum, renderer size, and emits `viewport:resized` on the EventBus.

7. **Context loss recovery**: Listens for `webglcontextlost` (pauses render loop, emits `renderer:context-lost`) and `webglcontextrestored` (resumes render loop, emits `renderer:context-restored`) on the canvas. Also listens for `document.visibilitychange` to emit `app:backgrounded`.

8. **Render loop**: `renderer.setAnimationLoop(() => this.#render())`. The `#render()` method calls `controls.update()`, `renderer.render(scene, camera)`, and `#drawRulers()` if rulers are visible.

9. **Pointer-to-world conversion**: A public method `screenToWorld(clientX, clientY)` that converts a screen pixel position to world coordinates using the camera's inverse projection. This will be used by the stamp tool in Phase 4 and by ImageOverlay for drag/resize.

10. **Public getters**: `scene`, `camera`, `renderer`, `domElement`, `frustumSize`.

**Update `vdzffedit-app.js`.**

Remove the inline Three.js setup (renderer, camera, scene, resize handler) and replace with:

```javascript
import { Viewport } from './ui/Viewport.js';

const viewport = new Viewport(bus, state, document.getElementById('canvas-container'));
```

The `window.__vdz` debug object gets `viewport` added to it (and `scene`, `camera`, `renderer` are accessed via `viewport.scene`, `viewport.camera`, `viewport.renderer`).

At the end of this milestone, the user can open the editor and:
- Pan with any mouse button drag (smooth damping)
- Zoom with scroll wheel (0.1x to 30x range)
- Two-finger pan+zoom on touch devices
- See no grid yet (hidden by default) — but `__vdz.viewport.setGridVisible(true)` from the console shows it
- See no rulers yet (hidden by default) — but `__vdz.viewport.setRulerVisible(true)` from the console shows them

### Milestone 2: LayerManager

This milestone creates `modules/LayerManager.js` and integrates it with the Viewport. At the end, three layer groups exist in the scene with independent visibility and opacity.

**Create `modules/LayerManager.js`.**

Adapted from the original VDZ `LayerManager.js`. The layer definitions are simplified to three:

```javascript
const LAYER_DEFS = [
  { name: 'background', z: 0,   label: 'Background', defaultOpacity: 1.0 },
  { name: 'image',      z: 200, label: 'Image',      defaultOpacity: 0.3 },
  { name: 'stitches',   z: 400, label: 'Stitches',   defaultOpacity: 1.0 },
];
```

The class itself copies almost verbatim from VDZ: constructor takes `(bus, scene)`, creates a `THREE.Group` per layer definition with the given `renderOrder`, adds each group to the scene, and stores them in a private `Map`. Public API:

- `getGroup(name)` — returns the `THREE.Group` for a layer (other modules add objects here)
- `setVisible(name, bool)` — toggles `group.visible`, emits `layer:visibility-changed`
- `isVisible(name)` — returns current visibility
- `setOpacity(name, n)` — clamps to [0,1], traverses all materials in the group and updates their opacity, emits `layer:opacity-changed`
- `getOpacity(name)` — returns current opacity
- `setLocked(name, bool)` — sets locked flag, emits `layer:lock-changed`
- `isLocked(name)` — returns locked state
- `getLayers()` — returns array of `{ name, label, visible, opacity, locked, z }` sorted by z descending (top-to-bottom for UI display)
- `saveState()` / `loadState(state)` — persistence helpers

Static z-constants are exported for external reference: `Z_BACKGROUND = 0`, `Z_IMAGE = 200`, `Z_STITCHES = 400`.

**Add LayerOpacityCommand and LayerVisibilityCommand to `core/Commands.js`.**

These are needed for undoable layer changes. They are copied from the original VDZ `Commands.js`:

- `LayerOpacityCommand(layerManager, layerName, oldOpacity, newOpacity)` — calls `layerManager.setOpacity()` on execute/undo
- `LayerVisibilityCommand(layerManager, layerName, oldVisible, newVisible)` — calls `layerManager.setVisible()` on execute/undo

**Add background to Viewport.**

Add a `setLayerManager(layerManager)` method to Viewport. When called, it:
- Creates a large background plane mesh (`PlaneGeometry(10000, 10000)`) in the background layer group with `MeshBasicMaterial({ color: 0x0d0d0f, depthTest: false })` and renderOrder 0
- Sets grid renderOrder so it draws above all layers
- Exposes `setBackground(type, options)` method with presets: `minimal` (dark solid), `leather`, `wood`, `felt` (procedural textures), `solid` (custom hex color), `custom` (user-uploaded image with tile/cover/fit modes)

**Update `vdzffedit-app.js`** to instantiate LayerManager and wire it to Viewport:

```javascript
import { LayerManager } from './modules/LayerManager.js';

const layerManager = new LayerManager(bus, viewport.scene);
viewport.setLayerManager(layerManager);
```

### Milestone 3: ImageOverlay

This milestone creates `modules/ImageOverlay.js`. At the end, the user can import a reference image and interact with it.

**Create `modules/ImageOverlay.js`.**

Adapted from the original VDZ `ImageOverlay.js`. Removals:
- `setMeshEngine()` method and `_meshEngine` field
- `meshBounds` fit mode and `#computeMeshBoundsFromEngine()` method
- `mesh:graph-imported` event listener

Everything else copies cleanly. The class:

- Constructor takes `(bus, layerManager)`, gets the image layer group via `layerManager.getGroup('image')`, creates 4 invisible corner handle meshes for resize raycasting
- `loadImage(file)` — loads a user-selected File as a Three.js texture, creates a PlaneGeometry mesh, adds it to the image layer group, applies current blend mode and fit mode
- `setFitMode(mode)` — `'centered'` (scale so 1px = 0.5 world units, centered at origin) or `'canvasView'` (scale to fill camera's visible area)
- `setBlendMode(mode)` — `'normal'`, `'multiply'`, or `'screen'` (configures Three.js blending on the material)
- `setLocked(bool)` — prevents drag and resize, hides handles
- `setCamera(camera)` — stores camera reference for canvasView fitting
- `removeImage()` — disposes geometry/material/texture, removes from scene
- Drag support: `startDrag(worldPoint)`, `updateDrag(worldPoint)`, `endDrag()`
- Resize support: `startResize(cornerIndex, worldPoint)`, `updateResize(worldPoint)`, `endResize()` — maintains aspect ratio, anchor at opposite corner
- `getImageMesh()` — returns the mesh for raycasting
- `getHandles()` — returns the 4 handle meshes for raycasting
- Getters: `hasImage`, `isLocked`, `blendMode`, `fitMode`

**Add image drag/resize handling to Viewport.**

The Viewport needs pointer event handlers for image interaction. On `pointerdown`:
1. Check if pointer hits a resize handle (raycast against `imageOverlay.getHandles()`) → start resize
2. Else check if pointer hits the image mesh (raycast against `imageOverlay.getImageMesh()`) → start drag
3. If either starts, disable OrbitControls so panning doesn't interfere

On `pointermove`: update drag or resize position using `screenToWorld()` conversion.

On `pointerup`: finalize drag or resize, re-enable OrbitControls.

This requires the Viewport to hold a reference to ImageOverlay via a `setImageOverlay(imageOverlay)` method.

### Milestone 4: LayerPanel UI Wiring

This milestone creates `ui/LayerPanel.js` which dynamically builds layer rows, handles quick-access icon clicks, and manages the per-layer config modal. It also wires the settings panel controls for grid and ruler.

**Create `ui/LayerPanel.js`.**

This module takes `(bus, layerManager, viewport, imageOverlay, history)` and:

1. **Builds layer rows** in `#layer-list`: Reads `layerManager.getLayers()` (sorted by z descending = top-to-bottom) and creates a row per layer. Each row has a two-column layout:
   - Column 1 (left): `<span class="layer-name">` with the layer label
   - Column 2 (right): `<div class="layer-actions">` with right-justified icons, no wrap. Icons from left to right:
     - **Layer-specific icons**: The image layer gets an upload icon (`add_photo_alternate`) that triggers `#image-upload` file input directly
     - **Lock** (`lock_open` / `lock`): Toggles `layerManager.setLocked()`. Icon swaps between `lock_open` (unlocked) and `lock` (locked). Uses `.off` CSS class when locked.
     - **Visibility** (`visibility` / `visibility_off`): Toggles `layerManager.setVisible()`. Icon swaps. Uses `.off` CSS class when hidden.
     - **Config** (`settings`): Opens the layer config modal for this layer

2. **Layer config modal** (`#layer-config-overlay`): When a gear icon is clicked, the modal opens centered on screen. The title shows the layer name. The body (`#layer-config-body`) is populated dynamically based on the layer:
   - **Background config**: A color picker input (sets `viewport.setBackground('solid', { color })`)
   - **Image config**: Upload button (triggers file input), Clear button (calls `imageOverlay.removeImage()`), opacity slider/input, fit mode select (`centered` / `canvasView`), blend mode select (`normal` / `multiply` / `screen`)
   - **Stitches config**: Opacity slider/input (for now — will grow in later phases)
   - Closing: Click the X button or click the overlay backdrop

3. **Event listeners**: Subscribes to `layer:visibility-changed`, `layer:opacity-changed`, `layer:lock-changed`, `image:loaded`, `image:removed` events to keep icons in sync with state.

4. **Layers button** (`#btn-layers`): Already wired in Phase 1's app.js — the panel toggle stays there.

**Wire settings panel controls in `vdzffedit-app.js`.**

The settings panel HTML already has inputs for grid and ruler settings. Wire them:

- `#setting-grid-size` input → `viewport.setGridSize(value)`
- `#setting-grid-opacity` input → `viewport.setGridOpacity(value / 100)`
- `#setting-grid-color` input → `viewport.setGridColor(value)`
- `#setting-ruler` checkbox → `viewport.setRulerVisible(checked)`
- `#setting-ruler-opacity` input → `viewport.setRulerOpacity(value / 100)`
- `#setting-stitch-scale` input → `state.set('stitchScale', value)` (consumed in Phase 3)
- `#setting-sel-color` input → store in state for Phase 4's selection system

**Update `vdzffedit-app.js`** to instantiate everything:

```javascript
import { Viewport } from './ui/Viewport.js';
import { LayerManager } from './modules/LayerManager.js';
import { ImageOverlay } from './modules/ImageOverlay.js';
import { LayerPanel } from './ui/LayerPanel.js';

const viewport = new Viewport(bus, state, document.getElementById('canvas-container'));
const layerManager = new LayerManager(bus, viewport.scene);
viewport.setLayerManager(layerManager);

const imageOverlay = new ImageOverlay(bus, layerManager);
imageOverlay.setCamera(viewport.camera);
viewport.setImageOverlay(imageOverlay);

const layerPanel = new LayerPanel(bus, layerManager, viewport, imageOverlay, history);
```

## Concrete Steps

All commands run from `D:\Python\vdz2\`.

**Step 1: Create directories.**

```
mkdir -p ui modules
```

**Step 2: Create all files** in the order described in the milestones above.

**Step 3: Verify in browser.**

Start the dev server: `bash server.sh`

Open `http://localhost:3688/vdzffedit.html` and verify:

1. **Pan/zoom**: Middle-click-drag pans smoothly with damping. Scroll wheel zooms in/out. Two-finger gesture works on touch.

2. **Grid**: Open settings panel (gear icon), check that adjusting "Grid size", "Grid opacity %", and "Grid color" affect the grid. Grid should initially be hidden — toggling it on from the console (`__vdz.viewport.setGridVisible(true)`) shows lines at 20-unit intervals. (The settings panel does not yet have a grid visibility checkbox — it's controlled by the grid visibility being tied to grid opacity > 0 or a separate control. For now, the grid starts hidden and can be shown from settings or console.)

3. **Rulers**: Check "Ruler" checkbox in settings. Rulers appear along top and left edges with tick marks at grid-spacing intervals. Numbers update as you pan/zoom. Ruler opacity slider works.

4. **Layers panel**: Click the layers button (bottom-right). Panel shows three layers: Stitches, Image, Background (top to bottom by z-order). Eye icon toggles visibility. Opacity input adjusts transparency. Background section shows preset buttons.

5. **Image import**: In the layers panel, click "Upload Image", select a JPG/PNG. Image appears on canvas at 30% opacity (default for image layer). Drag the image to reposition. Drag corner handles to resize (maintains aspect ratio). Change fit mode dropdown. Change blend mode dropdown. Lock button prevents drag/resize. Remove button deletes the image.

6. **Console**: No errors. `__vdz.viewport`, `__vdz.layerManager`, `__vdz.imageOverlay` are accessible.

## Validation and Acceptance

The phase is complete when all five success criteria from the roadmap are met:

1. **User can pan (middle mouse / two-finger drag) and zoom (scroll / pinch) smoothly on the orthographic canvas.** Verify by dragging and scrolling — movement should be smooth with damping deceleration.

2. **Dot grid renders as spatial reference with configurable spacing.** (Note: we use a line grid, not dot grid — this was a roadmap simplification. Lines provide better spatial reference.) Verify by enabling the grid and changing grid size in settings — lines should re-space accordingly.

3. **Rulers display along canvas edges.** Verify by enabling rulers in settings — tick marks and numbers appear along top and left edges, updating as you pan/zoom.

4. **Three layers exist: background (flat color), image (reference photo), stitches — each with independent visibility toggle and opacity slider.** Verify by opening the layers panel — all three layers are listed. Toggle visibility hides/shows each layer's content. Opacity slider fades content.

5. **User can import a reference image (JPG/PNG) and see it displayed on the image layer with adjustable position, scale, and opacity.** Verify by uploading an image — it appears on canvas. Drag repositions it. Corner handles resize it. Layer opacity slider controls transparency.

## Idempotence and Recovery

All file creation steps are idempotent — writing a file overwrites the previous version. The `mkdir` commands are safe to repeat. No database or persistent state is involved beyond the files themselves.

If something breaks mid-implementation, the Phase 1 files (`core/`, `vdzffedit.html`) are untouched (except `Commands.js` gains two new command classes and `vdzffedit-app.js` is updated). To recover, revert `vdzffedit-app.js` and `Commands.js` to their Phase 1 state and delete the `ui/` and `modules/` directories.

## Artifacts and Notes

The OrbitControls configuration that gives 2D-only pan/zoom:

```javascript
controls.enableRotate = false;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.enableDamping = true;
controls.dampingFactor = 0.1;
controls.minZoom = 0.1;
controls.maxZoom = 30;
controls.mouseButtons = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.PAN
};
controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };
```

The world-to-screen conversion for rulers (critical formula):

```javascript
const worldToScreenX = (wx) => {
  const ndc = (wx - cam.position.x) * cam.zoom / (frustumSize * aspect / 2);
  return ((ndc + 1) / 2) * viewportWidth - rulerHeight;
};
```

The three layer z-order constants:

```javascript
Z_BACKGROUND = 0;    // Bottom
Z_IMAGE      = 200;  // Middle
Z_STITCHES   = 400;  // Top
// Grid renders at renderOrder 1000 (above all layers, not a layer itself)
```

## Interfaces and Dependencies

**External dependencies** (no new ones beyond Phase 1):
- `three` (v0.183.2) — renderer, camera, controls, geometry, materials
- `three/addons/controls/OrbitControls.js` — pan/zoom interaction

**Internal module interfaces after this phase:**

In `ui/Viewport.js`:
```javascript
class Viewport {
  constructor(bus: EventBus, state: State, container: HTMLElement)

  // Public getters
  get scene(): THREE.Scene
  get camera(): THREE.OrthographicCamera
  get renderer(): THREE.WebGLRenderer
  get domElement(): HTMLCanvasElement
  get frustumSize(): number

  // Coordinate conversion
  screenToWorld(clientX: number, clientY: number): { x: number, y: number }

  // Grid controls
  setGridVisible(visible: boolean): void
  setGridSize(spacing: number): void          // clamped 5-100
  setGridOpacity(opacity: number): void       // clamped 0.01-1.0
  setGridColor(hexColor: string): void
  get gridVisible(): boolean
  get gridOpacity(): number

  // Ruler controls
  setRulerVisible(visible: boolean): void
  setRulerOpacity(opacity: number): void      // clamped 0.01-1.0
  get rulerVisible(): boolean
  get rulerOpacity(): number

  // Layer integration
  setLayerManager(layerManager: LayerManager): void
  setImageOverlay(imageOverlay: ImageOverlay): void

  // Background
  setBackground(type: string, options?: object): void
  get backgroundType(): string
}
```

In `modules/LayerManager.js`:
```javascript
class LayerManager {
  static Z_BACKGROUND = 0
  static Z_IMAGE = 200
  static Z_STITCHES = 400

  constructor(bus: EventBus, scene: THREE.Scene)

  getGroup(name: string): THREE.Group
  setVisible(name: string, visible: boolean): void
  isVisible(name: string): boolean
  setOpacity(name: string, opacity: number): void   // clamped 0-1
  getOpacity(name: string): number
  setLocked(name: string, locked: boolean): void
  isLocked(name: string): boolean
  getLayers(): Array<{ name, label, visible, opacity, locked, z }>
  saveState(): object
  loadState(state: object): void

  // Events emitted: layer:visibility-changed, layer:opacity-changed, layer:lock-changed
}
```

In `modules/ImageOverlay.js`:
```javascript
class ImageOverlay {
  constructor(bus: EventBus, layerManager: LayerManager)

  async loadImage(file: File): void
  removeImage(): void
  setFitMode(mode: 'centered' | 'canvasView'): void
  setBlendMode(mode: 'normal' | 'multiply' | 'screen'): void
  setLocked(locked: boolean): void
  setCamera(camera: THREE.OrthographicCamera): void

  get hasImage(): boolean
  get isLocked(): boolean
  get blendMode(): string
  get fitMode(): string

  getImageMesh(): THREE.Mesh | null
  getHandles(): THREE.Mesh[]

  startDrag(worldPoint: {x, y}): void
  updateDrag(worldPoint: {x, y}): void
  endDrag(): void
  startResize(cornerIndex: number, worldPoint: {x, y}): void
  updateResize(worldPoint: {x, y}): void
  endResize(): void

  // Events emitted: image:loaded, image:removed, image:fit-changed, image:blend-changed, image:lock-changed
}
```

In `ui/LayerPanel.js`:
```javascript
class LayerPanel {
  constructor(bus: EventBus, layerManager: LayerManager, viewport: Viewport,
              imageOverlay: ImageOverlay, history: HistoryManager)
  // No public API — all behavior is internal event wiring
}
```

Added to `core/Commands.js`:
```javascript
class LayerOpacityCommand extends Command {
  constructor(layerManager: LayerManager, layerName: string, oldOpacity: number, newOpacity: number)
}

class LayerVisibilityCommand extends Command {
  constructor(layerManager: LayerManager, layerName: string, oldVisible: boolean, newVisible: boolean)
}
```
