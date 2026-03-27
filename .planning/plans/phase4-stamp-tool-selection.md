# Phase 4: Stamp Tool + Selection

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.planning/EXECPLAN.md`.


## Purpose / Big Picture

After this phase the user can place crochet stitch symbols onto the canvas, interact with them, and undo every change. The workflow is: press S to open the stitch picker (Phase 3), click a stitch to select it, then click anywhere on the canvas to "stamp" that stitch at the cursor position with the rotation set in the picker preview. Placed stitches appear immediately as textured quads on the Three.js canvas. When the grid is visible and snapping is enabled, the stamp position snaps to the nearest grid intersection. The user can click a placed stitch to select it, shift-click or drag a rectangle to multi-select, drag selected stitches to move them, press arrow keys to nudge them, and press R to rotate them. Delete or Backspace removes selected stitches. Ctrl+A selects all. Escape deselects. Every placement, move, rotation, and deletion is undoable with Ctrl+Z and redoable with Ctrl+Shift+Z.

What someone can do after this change: open `vdzffedit.html` in a browser, press S to show the stitch picker, click a stitch (e.g., "sc"), then left-click on the canvas -- a single crochet symbol appears at that position. Click several more times to stamp additional stitches. Click on a placed stitch to select it (it gains a colored outline). Shift-click another to add it to the selection. Drag selected stitches to reposition them. Press arrow keys to nudge. Press R to rotate 15 degrees. Press Delete to remove. Press Ctrl+Z to undo any operation. Enable the grid in settings to see stitches snap to grid intersections.


## Progress

- [ ] Add PlaceStitchCommand, RemoveStitchCommand, MoveStitchesCommand, RotateStitchesCommand to `core/Commands.js`
- [ ] Create `modules/StitchRenderer.js` -- InstancedMesh renderer for placed stitches
- [ ] Create `ui/SelectionManager.js` -- selection state tracking for stitch IDs
- [ ] Modify `ui/Viewport.js` -- stamp click handling, selection clicks, box-select drag, arrow key nudge, mouse-button reconfiguration
- [ ] Modify `vdzffedit-app.js` -- instantiate StitchStore, StitchRenderer, SelectionManager; wire stamp tool, keyboard shortcuts, undo integration
- [ ] Verify: clicking canvas with active stitch stamps a new stitch at the cursor position
- [ ] Verify: placed stitches render correctly using atlas textures
- [ ] Verify: clicking a placed stitch selects it with visual feedback
- [ ] Verify: shift-click and drag-box multi-select work
- [ ] Verify: dragging and arrow keys move selected stitches
- [ ] Verify: R key rotates selected stitches
- [ ] Verify: Delete/Backspace removes selected stitches
- [ ] Verify: Ctrl+Z undoes all operations, Ctrl+Shift+Z redoes
- [ ] Verify: grid snapping works when grid is visible and snap toggle is on


## Surprises & Discoveries

(None yet -- will be updated during implementation.)


## Decision Log

- Decision: StitchRenderer uses a single THREE.InstancedMesh with the atlas texture and a custom ShaderMaterial rather than individual Sprite objects. Each instance is a textured quad whose UV coordinates sample the correct stitch cell from the atlas.
  Rationale: InstancedMesh is the standard approach for rendering many similar objects efficiently in Three.js. A single draw call handles all placed stitches regardless of count. The ShaderMaterial allows per-instance UV offsets (to select the correct stitch from the atlas), per-instance color tinting, and per-instance opacity. This matches the pattern used in the original VDZ mesh editor.
  Date/Author: 2026-03-27 / Plan author

- Decision: The Viewport's OrbitControls mouse button mapping changes from "all buttons pan" to a context-sensitive scheme. When a stitch is active in the picker (state key `activeStitch` is non-null), left-click stamps a new stitch. When no stitch is active, left-click initiates selection (click-select or box-select drag). Middle-click always pans. Right-click always pans. This is implemented by intercepting pointer events before OrbitControls processes them, not by changing OrbitControls configuration dynamically.
  Rationale: The current Viewport maps all three mouse buttons to pan via OrbitControls. Phase 4 needs left-click for stamping and selection. Rather than fighting with OrbitControls' internal event handling, we intercept pointerdown/pointermove/pointerup on the canvas and call `event.stopPropagation()` when the left button is used for stamping or selection, letting OrbitControls only see middle and right button events for panning. OrbitControls' LEFT button mapping stays as PAN so that if interception fails, the fallback behavior is still reasonable.
  Date/Author: 2026-03-27 / Plan author

- Decision: SelectionManager is a standalone class (not a Viewport method or State key). It holds the set of selected stitch IDs, emits EventBus events on selection changes, and provides methods for select, deselect, and state save/restore for undo integration. It does not directly manipulate Three.js objects -- the StitchRenderer listens to selection events and updates visual appearance (outline/tint) accordingly.
  Rationale: Separating selection state from rendering keeps both modules simpler and testable. The SelectionManager knows nothing about Three.js; the StitchRenderer knows nothing about user interaction. They communicate through the EventBus. This mirrors the project's existing architecture where State/EventBus are the communication backbone.
  Date/Author: 2026-03-27 / Plan author

- Decision: Grid snapping is controlled by a new State key `snapToGrid` (boolean, default false). A checkbox is added to the settings panel. When true and the grid is visible, stamp positions and move destinations snap to the nearest grid intersection. The snap function rounds each coordinate to the nearest multiple of the grid spacing.
  Rationale: Snapping should be togglable because freeform placement is the primary workflow. Grid snapping is useful for alignment but should not be forced. Tying snap to grid visibility makes sense: if the grid is hidden, snapping to invisible intersections is confusing.
  Date/Author: 2026-03-27 / Plan author

- Decision: The stitch data model includes an `opacity` field (0-1, default 1.0) as specified in the PRD. The StitchStore already implements this field. The StitchPicker already provides a stamp opacity control that writes to `state.get('stampOpacity')`. New stitches inherit this opacity at stamp time.
  Rationale: Per-stitch opacity enables visual effects like ghosting previous sets or fading stitches during animation. Supporting it from the start avoids data model changes later.
  Date/Author: 2026-03-27 / Plan author

- Decision: Box-select uses the existing `#box-select-rect` div already present in `vdzffedit.html`. When the user left-clicks on empty canvas (no stitch hit, no active stitch for stamping) and drags, a selection rectangle appears. On release, all stitches whose positions fall within the rectangle's world-space bounds are selected.
  Rationale: The HTML element already exists with proper styling (purple border, semi-transparent fill). Using a DOM overlay for the selection rectangle is simpler than drawing it in Three.js and provides crisp rendering at any zoom level.
  Date/Author: 2026-03-27 / Plan author

- Decision: StitchStore.js already exists (created during Phase 3 or earlier) with all needed methods: `add`, `remove`, `update`, `batchUpdate`, `getById`, `getByIds`, `getAll`, `getAllIds`, `count`, `clear`, `exportJSON`, `importJSON`. It also has a `zIndex` auto-incrementing field for rendering order. No changes to StitchStore are needed for Phase 4.
  Rationale: The existing implementation matches the Phase 4 requirements exactly. It emits `stitch-store:added`, `stitch-store:removed`, `stitch-store:updated`, and `stitch-store:batch-updated` events that the StitchRenderer will consume.
  Date/Author: 2026-03-27 / Plan author


## Outcomes & Retrospective

(Will be completed after implementation.)


## Context and Orientation

This phase builds on Phases 1-3. The project is a crochet stitch diagram editor using Three.js (sole renderer) and vanilla JS with ES modules loaded via import maps from `vdzffedit.html`. There is no build step or bundler.

The following modules exist and are relevant to this phase:

`core/EventBus.js` -- Pub/sub message bus. Every module communicates through an EventBus instance. `bus.on(event, handler)` returns an unsubscribe function. `bus.emit(event, data)` delivers data to all handlers.

`core/State.js` -- Reactive key-value store. `state.set(key, value)` notifies watchers only when the value changes (strict equality). `state.get(key)` reads the current value. `state.watch(key, handler)` registers a watcher.

`core/HistoryManager.js` -- Undo/redo command stack. `history.execute(command)` runs a command and pushes it onto the undo stack. `history.undo()` and `history.redo()` traverse the stacks. Commands must implement `execute()` and `undo()` methods. Batch grouping is supported via `beginBatch()` / `endBatch(description)`.

`core/Commands.js` -- Base `Command` class and existing commands (`SetValueCommand`, `LayerOpacityCommand`, `LayerVisibilityCommand`). Phase 4 adds four new command classes here.

`modules/StitchStore.js` -- Authoritative data store for placed stitch objects. Each stitch is a plain object: `{ id, stitchType, position: {x,y}, rotation, zIndex, setId, orderInSet, colorOverride, opacity }`. The store uses a `Map<string, object>` keyed by stitch ID. Methods: `add(data)` (auto-generates ID if not provided), `remove(id)`, `update(id, props)`, `batchUpdate(updates)`, `getById(id)`, `getByIds(ids)`, `getAll()`, `getAllIds()`, `count`, `clear()`, `exportJSON()`, `importJSON(data)`. Emits events: `stitch-store:added`, `stitch-store:removed`, `stitch-store:updated`, `stitch-store:batch-updated`, `stitch-store:cleared`.

`modules/StitchLibrary.js` -- Registry of ~45 crochet stitch definitions. Each definition has `id`, `nameUS`, `abbrUS`, `category`, `atlasIndex`, and a `draw(ctx, cx, cy, size)` function. `lib.get(id)` returns a definition. `lib.getAll()` returns all definitions.

`modules/StitchAtlas.js` -- Generates a 512x384 pixel texture atlas (8 columns, 6 rows, 64x64 cells) containing all stitch symbols drawn white on transparent. `atlas.generate()` returns a `THREE.CanvasTexture`. `atlas.getUV(stitchId)` returns `{ u0, v0, uScale, vScale }` for sampling a stitch's cell. The texture has `flipY = false` (Canvas Y is top-down; UVs are computed manually).

`modules/LayerManager.js` -- Manages three named Three.js Groups added to the scene: `background` (renderOrder 0), `image` (renderOrder 200), `stitches` (renderOrder 400). `layerManager.getGroup('stitches')` returns the THREE.Group where the StitchRenderer should add its mesh.

`ui/Viewport.js` -- Three.js WebGL canvas with orthographic camera, OrbitControls (2D pan/zoom only, all mouse buttons mapped to PAN), line grid, rulers, background presets, and pointer-to-world coordinate conversion. Key public API: `screenToWorld(clientX, clientY)` converts screen pixels to world coordinates, `scene` / `camera` / `renderer` / `domElement` getters, `gridVisible` and `gridSpacing` for snap calculations. Currently maps all three mouse buttons to PAN and intercepts left-click only for image drag/resize.

`ui/StitchPicker.js` -- Stitch palette panel. `picker.getActiveStitchId()` returns the currently selected stitch ID (string) or null. `picker.getRotation()` returns the rotation in degrees. `picker.getStampColor()` returns the hex color string. `picker.getStampOpacity()` returns normalized opacity (0-1). Sets State keys: `activeStitch`, `stampRotation`, `stampColor`, `stampOpacity`. Emits `stitch:active-changed` on the EventBus.

`vdzffedit-app.js` -- Entry point. Currently instantiates EventBus, State, HistoryManager, Viewport, LayerManager, ImageOverlay, LayerPanel, StitchLibrary, StitchAtlas, StitchPicker. Wires undo/redo buttons and keyboard shortcuts (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y). Wires settings panel controls. Exposes `window.__vdz` for debugging.

`vdzffedit.html` -- Contains `#box-select-rect` div (purple border, hidden by default, z-index 6) for box-select visualization. Contains `#canvas-container` as the Viewport's mount point. Has a settings panel with grid/ruler controls.

Files that will exist after this phase (new files marked with +):
- `core/Commands.js` (modified -- four new command classes added)
- `modules/StitchStore.js` (unchanged -- already exists)
- `+ modules/StitchRenderer.js` (new)
- `+ ui/SelectionManager.js` (new)
- `ui/Viewport.js` (modified -- stamp/selection pointer handling, grid snap support)
- `vdzffedit-app.js` (modified -- wiring new modules)
- `vdzffedit.html` (modified -- snap toggle in settings panel)


## Plan of Work

The work divides into three milestones executed sequentially. Each milestone produces a testable, verifiable result.


### Milestone 1: StitchRenderer + Commands (place stitches, see them render)

This milestone delivers the ability to stamp stitches onto the canvas and see them appear. At the end, clicking the canvas with an active stitch creates a new stitch object in the StitchStore, and the StitchRenderer immediately renders it as a textured quad on the stitches layer.

**1a. Add four command classes to `core/Commands.js`.**

Append these classes before the `export` statement at the bottom of the file:

`PlaceStitchCommand` -- Constructor takes `(store, stitchData)` where `store` is a StitchStore instance and `stitchData` is the full stitch object to place (including a pre-generated `id`). `execute()` calls `store.add(stitchData)`. `undo()` calls `store.remove(stitchData.id)`. Description: `"Place ${stitchData.stitchType}"`.

`RemoveStitchCommand` -- Constructor takes `(store, id)`. At construction time, captures the full stitch data via `store.getById(id)` (deep-copy the position object). `execute()` calls `store.remove(id)`. `undo()` calls `store.add(capturedData)` to restore. Description: `"Remove stitch"`.

`MoveStitchesCommand` -- Constructor takes `(store, moves)` where `moves` is an array of `{ id, oldPos: {x,y}, newPos: {x,y} }`. `execute()` calls `store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.newPos } })))`. `undo()` calls `store.batchUpdate(moves.map(m => ({ id: m.id, props: { position: m.oldPos } })))`. Description: `"Move ${moves.length} stitch(es)"`.

`RotateStitchesCommand` -- Constructor takes `(store, rotations)` where `rotations` is an array of `{ id, oldRotation, newRotation }`. `execute()` calls `store.batchUpdate(rotations.map(r => ({ id: r.id, props: { rotation: r.newRotation } })))`. `undo()` calls `store.batchUpdate(rotations.map(r => ({ id: r.id, props: { rotation: r.oldRotation } })))`. Description: `"Rotate ${rotations.length} stitch(es)"`.

Add all four to the export list.

**1b. Create `modules/StitchRenderer.js`.**

This module renders all placed stitches as textured quads using a single THREE.InstancedMesh. It listens to StitchStore events and rebuilds instances whenever stitches change.

The renderer works as follows:

It creates a PlaneGeometry (a flat quad) and a custom ShaderMaterial. The shader samples the atlas texture using per-instance UV offsets and scales, applies per-instance color tinting, per-instance opacity, and per-instance rotation. The geometry is a unit-size plane; scaling to the desired stitch size happens in the vertex shader via a uniform `uSize`.

Per-instance data is stored in InstancedBufferAttributes on the geometry:
- `instanceUV` (vec4): u0, v0, uScale, vScale for atlas sampling
- `instancePosition` (vec2): world x, y position
- `instanceRotation` (float): rotation in radians
- `instanceColor` (vec3): RGB tint color (default white)
- `instanceOpacity` (float): alpha (default 1.0)
- `instanceSelected` (float): 1.0 if selected, 0.0 otherwise (for selection outline)

Constructor signature: `StitchRenderer(bus, stitchStore, stitchAtlas, layerManager, state)`.

At construction time:
1. Get the `stitches` layer group from LayerManager.
2. Create the InstancedMesh with initial capacity of 256 instances (grown as needed by doubling).
3. Add the mesh to the stitches layer group.
4. Subscribe to StitchStore events (`stitch-store:added`, `stitch-store:removed`, `stitch-store:updated`, `stitch-store:batch-updated`, `stitch-store:cleared`) and call `rebuild()` on each.
5. Subscribe to `selection:changed` on EventBus to update the `instanceSelected` attribute.
6. Watch the State key `stitchScale` (default 1.0) and update the `uSize` uniform when it changes.

The `rebuild()` method:
1. Gets all stitches from the store via `store.getAll()`.
2. If the instance count exceeds the current InstancedMesh capacity, disposes the old mesh and creates a new one with doubled capacity.
3. Sets the InstancedMesh `.count` to the number of stitches.
4. For each stitch, populates the per-instance attributes by looking up the stitch's atlas UV via `atlas.getUV(stitch.stitchType)`, and copying position, rotation, color, and opacity from the stitch data.
5. Marks all attributes as needing update (`attribute.needsUpdate = true`).

Vertex shader (GLSL):
- Receives the unit plane vertex positions.
- Applies instance rotation around the quad center.
- Scales by `uSize` uniform (world units per stitch symbol).
- Translates by `instancePosition`.
- Passes UV coordinates (combining vertex UV with instanceUV offset/scale) to fragment shader.
- Passes instanceColor, instanceOpacity, instanceSelected to fragment shader.

Fragment shader (GLSL):
- Samples the atlas texture at the computed UV.
- Multiplies RGB by instanceColor.
- Multiplies alpha by instanceOpacity and by the layer opacity uniform `uLayerOpacity`.
- If instanceSelected > 0.5, adds a colored outline effect. The outline is achieved by sampling the atlas at 4 neighboring texels (up, down, left, right, offset by 1/atlas-width and 1/atlas-height). If any neighbor has alpha but the current texel does not, that pixel is on the outline -- fill it with the selection color. This creates a 1-pixel outline around the stitch symbol without modifying the source texture.
- Discards fragments with alpha below 0.01 (transparent regions of the atlas cell).

The stitch size uniform `uSize` defaults to 20 world units, which at the default grid spacing of 20 means one stitch occupies approximately one grid cell. The user can adjust this via the "Stitch symbol scale" setting (State key `stitchScale`), which multiplies the base size.

Public methods:
- `rebuild()` -- full rebuild from store data (called automatically on store events)
- `hitTest(worldX, worldY)` -- returns the stitch ID at the given world position, or null. Iterates all stitches and checks if the world point falls within the stitch's bounding box (a square of `uSize * stitchScale` centered at the stitch position, rotated by the stitch rotation). Returns the topmost stitch (highest zIndex) if multiple overlap.
- `getSelectedIds()` -- not on the renderer; this is on SelectionManager.
- `setSelectionColor(color)` -- updates the selection outline color uniform.

**1c. Wire StitchRenderer and StitchStore into `vdzffedit-app.js`.**

Import StitchStore (already exists) and StitchRenderer (new). After the existing stitch picker initialization:

```js
import { StitchStore } from './modules/StitchStore.js';
import { StitchRenderer } from './modules/StitchRenderer.js';

const stitchStore = new StitchStore(bus);
const stitchRenderer = new StitchRenderer(bus, stitchStore, stitchAtlas, layerManager, state);
```

Add them to `window.__vdz`.

**1d. Add basic stamp handling to Viewport.**

Add a new method `setStampHandler(handler)` to Viewport. This method registers a callback that receives `{ worldX, worldY }` whenever the user left-clicks on the canvas (button 0) without dragging (click, not drag). The handler is called only if the pointer down and pointer up are within 5 pixels of each other (to distinguish clicks from drags) and within 300ms.

In `vdzffedit-app.js`, set up the stamp handler:

```js
viewport.setStampHandler(({ worldX, worldY }) => {
  const stitchId = stitchPicker.getActiveStitchId();
  if (!stitchId) return; // no active stitch, ignore

  const rotation = stitchPicker.getRotation() * Math.PI / 180; // degrees to radians
  const color = stitchPicker.getStampColor();
  const opacity = stitchPicker.getStampOpacity();

  let x = worldX;
  let y = worldY;

  // Grid snap
  if (state.get('snapToGrid') && viewport.gridVisible) {
    const spacing = /* grid spacing from viewport */ 20;
    x = Math.round(x / spacing) * spacing;
    y = Math.round(y / spacing) * spacing;
  }

  const data = {
    stitchType: stitchId,
    position: { x, y },
    rotation,
    colorOverride: color !== '#ffffff' ? color : null,
    opacity,
  };

  const cmd = new PlaceStitchCommand(stitchStore, { ...data, id: generateId() });
  history.execute(cmd);
});
```

The Viewport's pointer event handling needs modification. Currently, all three mouse buttons are mapped to PAN via OrbitControls. The change: in `#setupPointerEvents`, when a `pointerdown` event fires with `button === 0` (left click), check whether the event should be handled by stamp/select logic instead of pan. If so, call `stopImmediatePropagation()` on the event to prevent OrbitControls from processing it, and track the interaction internally.

The decision of whether left-click should stamp or select depends on State: if `state.get('activeStitch')` is non-null, left-click stamps. If null, left-click selects (Milestone 2). If neither applies (no active stitch, no stitch under cursor), left-click box-selects (also Milestone 2). For Milestone 1, only the stamp path is wired; the select path is added in Milestone 2.

To prevent OrbitControls from receiving the left-click, the Viewport intercepts the event at the capture phase. Add a new event listener on the canvas with `{ capture: true }` that calls `e.stopPropagation()` for left-button events that should be handled as stamp or select, then processes them in the normal bubble-phase handler. This way OrbitControls (which listens in bubble phase) never sees the event.

The Viewport needs access to State to check `activeStitch`. It already receives `state` in the constructor.

At the end of Milestone 1, the user can: press S, click a stitch in the picker, click on the canvas, and see the stitch symbol appear. Ctrl+Z removes it. Clicking again places another. Multiple stitches accumulate on the canvas.


### Milestone 2: SelectionManager + interactions (click-select, box-select, move, rotate)

This milestone adds the ability to interact with placed stitches: select them, move them, and rotate them.

**2a. Create `ui/SelectionManager.js`.**

The SelectionManager tracks which stitch IDs are currently selected. It is a plain JavaScript class with no Three.js dependency.

Constructor: `SelectionManager(bus)`.

Internal state: `#selected` is a `Set<string>` of stitch IDs. `#hovered` is a string or null (the stitch ID currently under the cursor).

Methods:

`select(id, additive = false)` -- If additive is false, clears the selection first. Adds `id` to the selected set. Emits `selection:changed` with `{ ids: [...this.#selected] }`.

`selectMultiple(ids, additive = false)` -- If additive is false, clears first. Adds all IDs. Emits `selection:changed`.

`deselect(id)` -- Removes `id` from the set. Emits `selection:changed`.

`deselectAll()` -- Clears the set. Emits `selection:changed`.

`toggle(id)` -- If selected, deselect; otherwise select (additive). Emits `selection:changed`.

`isSelected(id)` -- Returns boolean.

`getSelectedIds()` -- Returns array of selected IDs.

`getState()` -- Returns `{ ids: [...this.#selected] }` for undo snapshot.

`restoreState(state)` -- Sets `#selected` to the provided IDs array. Emits `selection:changed`.

`setHovered(id)` -- Sets the hovered stitch ID. Emits `selection:hover-changed` with `{ id }`.

`get count` -- Returns the number of selected stitches.

**2b. Add click-select and shift-click to Viewport.**

Modify Viewport's left-click handling (added in Milestone 1). The logic flow on left pointerup (within click threshold) is now:

1. If `state.get('activeStitch')` is non-null, this is a stamp action. Call the stamp handler. Done.
2. Otherwise, hit-test the click position against placed stitches using `StitchRenderer.hitTest(worldX, worldY)`.
3. If a stitch is hit: call `selectionManager.select(hitId, shiftKey)` (additive if shift held).
4. If no stitch is hit: call `selectionManager.deselectAll()`.

The Viewport needs a reference to the StitchRenderer (for hit-testing) and the SelectionManager (for selection calls). Add setter methods: `setStitchRenderer(renderer)` and `setSelectionManager(selectionManager)`.

**2c. Add box-select drag to Viewport.**

When left-click lands on empty space (no stitch hit, no active stitch), and the user drags more than 5 pixels, initiate a box-select. During drag, show the `#box-select-rect` div positioned between the drag start and current pointer position (in screen pixels). On release, convert the rectangle corners to world coordinates and call `selectionManager.selectMultiple(ids, shiftKey)` with all stitch IDs whose positions fall inside the rectangle.

The `#box-select-rect` div is grabbed by `document.getElementById('box-select-rect')`. Set its `display` to `block` during drag, `none` on release. Set `left`, `top`, `width`, `height` in pixels relative to the canvas container.

**2d. Add move (drag) to Viewport.**

When left-click lands on a selected stitch and the user drags, initiate a move operation. During drag, compute the delta from the drag start position to the current pointer position (in world units), and call `store.batchUpdate` to move all selected stitches by that delta. On release, create a `MoveStitchesCommand` with the old and new positions and push it to HistoryManager.

The move flow:
1. On pointerdown (left button), if the click hits a selected stitch, record the world position as `dragStart`. Record the initial positions of all selected stitches.
2. On pointermove, compute `delta = current - dragStart`. Apply grid snap to `newPos = initialPos + delta` if snap is enabled. Update stitch positions via `store.batchUpdate` (live preview).
3. On pointerup, create a `MoveStitchesCommand` with old positions (recorded at dragStart) and new positions (current). Execute it via `history.execute(cmd)`. Note: the store already has the new positions from live preview, so the command's `execute()` is effectively a no-op on first run (positions already match). But undo/redo needs the command. To handle this cleanly, the command's `execute()` always sets positions to `newPos` regardless of current state, and `undo()` always sets to `oldPos`.

Actually, since we've already moved the stitches during drag (live preview), we should NOT use `history.execute()` (which calls `execute()` again). Instead, push the command directly onto the history stack. But HistoryManager only supports `execute()`. The solution: after the drag ends, undo the live preview by resetting positions to old values, then call `history.execute(moveCmd)` which re-applies the positions. This is clean and consistent with the command pattern. Alternatively, create the command and push it directly -- but HistoryManager doesn't expose a `push()` method without executing.

The cleanest approach: track oldPositions at drag start. On drag move, update positions directly on the store (no command). On drag end, create a MoveStitchesCommand with oldPositions and the final positions, then call `history.execute(cmd)`. Since the command's `execute()` sets positions to newPos and the store already has those positions, the execute is a no-op data-wise but the command is correctly on the undo stack. This works because `store.batchUpdate` only emits events if it actually finds and updates stitches, and setting a position to its current value is harmless.

**2e. Add rotation to Viewport / app wiring.**

When the user presses the R key while stitches are selected, rotate all selected stitches by 15 degrees (PI/12 radians) clockwise. If Shift+R is pressed, rotate counter-clockwise (subtract 15 degrees). Create a `RotateStitchesCommand` and execute it via HistoryManager.

**2f. Wire SelectionManager into `vdzffedit-app.js`.**

```js
import { SelectionManager } from './ui/SelectionManager.js';

const selectionManager = new SelectionManager(bus);
viewport.setStitchRenderer(stitchRenderer);
viewport.setSelectionManager(selectionManager);
```

Add to `window.__vdz`.

At the end of Milestone 2, the user can select stitches (click, shift-click, box-select), move them (drag or arrow keys), rotate them (R key), and all operations are undoable.


### Milestone 3: Polish (grid snapping, keyboard shortcuts, full undo integration)

This milestone adds grid snapping, keyboard shortcuts, and ensures all operations integrate properly with HistoryManager.

**3a. Add grid snap toggle to settings panel.**

In `vdzffedit.html`, add a new settings row after the grid checkbox:

```html
<div class="settings-row">
  <label for="setting-snap">Snap to grid</label>
  <input type="checkbox" id="setting-snap">
</div>
```

In `vdzffedit-app.js`, wire the checkbox:

```js
document.getElementById('setting-snap').addEventListener('change', (e) => {
  state.set('snapToGrid', e.target.checked);
});
```

The snap function (used in stamp handler and move handler):

```js
function snapToGrid(x, y, spacing) {
  return {
    x: Math.round(x / spacing) * spacing,
    y: Math.round(y / spacing) * spacing,
  };
}
```

The Viewport needs to expose `gridSpacing` as a public getter so the app wiring can read it.

**3b. Add keyboard shortcuts.**

In `vdzffedit-app.js`, extend the existing `keydown` listener (or add a new one):

- Arrow keys (ArrowUp, ArrowDown, ArrowLeft, ArrowRight): nudge selected stitches by grid spacing (or 10 world units if grid is off). Create a MoveStitchesCommand and execute it. If shift is held, nudge by 1 unit (fine adjustment).
- Delete or Backspace: remove all selected stitches. For each selected stitch, create a RemoveStitchCommand and execute them as a batch via `history.beginBatch()` / `history.endBatch('Remove stitches')`.
- Ctrl+A: select all stitches via `selectionManager.selectMultiple(store.getAllIds())`.
- Escape: deselect all via `selectionManager.deselectAll()`. Also clear the active stitch in the picker (set `state.set('activeStitch', null)` and emit appropriately).
- R: rotate selected stitches 15 degrees clockwise. Shift+R: 15 degrees counter-clockwise.

Guard all shortcuts against firing when focus is in an input/textarea/select element (check `e.target.tagName`).

**3c. Expose Viewport's gridSpacing as a public getter.**

Add to `ui/Viewport.js`:

```js
get gridSpacing() { return this.#gridSpacing; }
```

**3d. Verify full undo integration.**

Every operation (place, remove, move, rotate) must be undoable. The verification sequence:
1. Stamp 3 stitches. Ctrl+Z three times -- all gone. Ctrl+Shift+Z three times -- all back.
2. Select 2 stitches, drag to move. Ctrl+Z -- they return to original position.
3. Select 1 stitch, press R. Ctrl+Z -- rotation reverts.
4. Select 2 stitches, press Delete. Ctrl+Z -- they reappear.
5. Arrow-nudge a stitch. Ctrl+Z -- it moves back.


## Concrete Steps

All commands assume the working directory is `D:\Python\vdz2\`. The project runs by opening `vdzffedit.html` in a browser (no build step needed).

**Step 1: Add command classes to `core/Commands.js`**

Open `core/Commands.js`. Before the `export` statement (currently line 131), insert the four new command classes as described in Milestone 1a. Update the export to include `PlaceStitchCommand`, `RemoveStitchCommand`, `MoveStitchesCommand`, `RotateStitchesCommand`.

**Step 2: Create `modules/StitchRenderer.js`**

Create the new file as described in Milestone 1b. This is approximately 250-350 lines of JavaScript including the GLSL shader strings.

**Step 3: Create `ui/SelectionManager.js`**

Create the new file as described in Milestone 2a. This is approximately 80-120 lines.

**Step 4: Modify `ui/Viewport.js`**

Add the stamp/select event interception logic, `setStampHandler`, `setStitchRenderer`, `setSelectionManager`, `gridSpacing` getter, and box-select drag handling as described in Milestones 1d, 2b, 2c, 2d.

**Step 5: Modify `vdzffedit.html`**

Add the snap toggle checkbox in the settings panel.

**Step 6: Modify `vdzffedit-app.js`**

Import new modules, instantiate StitchStore/StitchRenderer/SelectionManager, wire stamp handler, wire keyboard shortcuts, wire snap toggle, add to debug object.

**Step 7: Browser verification**

Open `vdzffedit.html`. Expected behavior:
- Press S to open stitch picker. Click "sc". Click on canvas. A single crochet symbol appears.
- Click several more times. Multiple stitches accumulate.
- Press Ctrl+Z. Last stitch disappears. Press again -- another disappears.
- Press Ctrl+Shift+Z. Stitch reappears.
- Click on a placed stitch. It gets a colored outline (selection).
- Shift-click another. Both are selected.
- Drag selected stitches. They move. Ctrl+Z -- they return.
- Press arrow keys. Selected stitches nudge. Ctrl+Z -- they return.
- Press R. Selected stitches rotate. Ctrl+Z -- they return.
- Press Delete. Selected stitches disappear. Ctrl+Z -- they return.
- Press Ctrl+A. All stitches selected.
- Press Escape. All deselected, stitch picker deactivated.
- Enable grid in settings. Enable "Snap to grid". Click to stamp. Stitch snaps to nearest grid intersection.
- Drag a rectangle on empty space. Box-select rectangle appears. Stitches inside are selected on release.
- Open browser console. Type `window.__vdz.stitchStore.count` -- shows number of placed stitches.


## Validation and Acceptance

Open `vdzffedit.html` in a browser (Chrome or Firefox). The console should show `[VDZ] Freeform editor initialized` with no errors.

Acceptance criteria, verified by manual interaction:

1. **Stamp placement**: Press S, click "dc" (double crochet). Click three different spots on the canvas. Three DC symbols appear at those positions with the atlas texture visible (white symbol shapes). The console shows no errors.

2. **Rotation on stamp**: In the stitch picker, type "90" into the rotation field. Click on the canvas. The new stitch appears rotated 90 degrees from the default orientation.

3. **Grid snapping**: Open settings, enable Grid, enable Snap to grid. Click to stamp. The stitch position is at a grid intersection (visually aligned with the grid lines). Disable snap, stamp again -- the stitch is at the exact cursor position, not necessarily on a grid line.

4. **Click select**: Click on a placed stitch. It gains a colored outline (the selection color from settings, default pink #ff69b4). Click on empty space. The outline disappears.

5. **Multi-select (shift)**: Click stitch A. Shift-click stitch B. Both have outlines. Shift-click stitch A again. Only stitch B is selected.

6. **Box select**: Click and drag on empty canvas space. A purple rectangle appears. Release -- all stitches whose positions fall within the rectangle are selected.

7. **Move (drag)**: Select a stitch. Drag it. It moves to the new position. Ctrl+Z -- it returns to the old position.

8. **Move (arrow keys)**: Select a stitch. Press ArrowRight. It moves right by one grid spacing (or 10 units). Ctrl+Z -- it returns.

9. **Rotate**: Select a stitch. Press R. The stitch rotates 15 degrees clockwise visually. Ctrl+Z -- it rotates back.

10. **Delete**: Select a stitch. Press Delete. It disappears. Ctrl+Z -- it reappears at its original position with its original rotation.

11. **Ctrl+A / Escape**: Stamp 5 stitches. Press Ctrl+A -- all 5 have selection outlines. Press Escape -- all outlines gone, and the stitch picker's active stitch is cleared.

12. **Undo chain**: Stamp 3 stitches, select all, move, rotate, delete. Press Ctrl+Z repeatedly. Each operation reverses in order: delete undo (stitches reappear), rotate undo, move undo, place undo (x3). Then Ctrl+Shift+Z replays them all forward.


## Idempotence and Recovery

All changes are additive file edits (new classes appended to Commands.js, new files created, new code appended to vdzffedit-app.js). No destructive changes to existing functionality. If the implementation is partially complete, the editor still loads -- unfinished stamp/selection logic simply does nothing when interacted with. The existing pan/zoom, grid, rulers, layers, image overlay, and stitch picker all continue to work regardless of Phase 4 progress.

If the StitchRenderer fails to initialize (e.g., shader compilation error), it should catch the error and log it to the console without crashing the rest of the editor. The StitchStore still functions correctly as a data store even without rendering.

The StitchStore's `clear()` method and the HistoryManager's `clear()` method can reset to a clean state at any time. Refreshing the browser resets everything (no persistence in Phase 4).


## Artifacts and Notes

**Stitch data model (for reference):**

```js
{
  id: 'stitch_1_m1abc',         // auto-generated unique ID
  stitchType: 'dc',             // references StitchLibrary definition ID
  position: { x: 40, y: -20 }, // world coordinates
  rotation: 1.5708,             // radians (90 degrees)
  zIndex: 0,                    // auto-incrementing render order
  setId: null,                  // Phase 5: set assignment
  orderInSet: null,             // Phase 5: order within set
  colorOverride: null,          // null = default white, or hex string
  opacity: 1.0,                 // 0-1
}
```

**EventBus events introduced in this phase:**

- `selection:changed` -- `{ ids: string[] }` -- emitted by SelectionManager when selection changes
- `selection:hover-changed` -- `{ id: string|null }` -- emitted by SelectionManager when hover changes

**State keys introduced in this phase:**

- `snapToGrid` -- boolean, default false

**State keys consumed from Phase 3:**

- `activeStitch` -- string|null, the active stitch ID from StitchPicker
- `stampRotation` -- number, degrees
- `stampColor` -- string, hex color
- `stampOpacity` -- number, 0-1
- `stitchScale` -- number, default 1.0
- `selectionColor` -- string, hex color (from settings panel)

**ShaderMaterial uniform summary for StitchRenderer:**

- `uAtlas` (sampler2D): the atlas texture from StitchAtlas
- `uSize` (float): base stitch size in world units (default 20)
- `uSelectionColor` (vec3): RGB selection outline color
- `uLayerOpacity` (float): stitches layer opacity from LayerManager
- `uAtlasSize` (vec2): atlas dimensions in pixels (512, 384) for outline texel offset calculation


## Interfaces and Dependencies

**Dependencies (all pre-existing):**

- Three.js (r0.183.2 via import map)
- `core/EventBus.js` -- EventBus class
- `core/State.js` -- State class
- `core/HistoryManager.js` -- HistoryManager class
- `core/Commands.js` -- Command base class (extended with 4 new subclasses)
- `modules/StitchStore.js` -- StitchStore class, `generateId()` function
- `modules/StitchAtlas.js` -- StitchAtlas class
- `modules/StitchLibrary.js` -- StitchLibrary class
- `modules/LayerManager.js` -- LayerManager class
- `ui/Viewport.js` -- Viewport class (modified)
- `ui/StitchPicker.js` -- StitchPicker class (consumed, not modified)

**New modules and their signatures:**

In `core/Commands.js`, define:

```js
class PlaceStitchCommand extends Command {
  constructor(store, stitchData) { ... }
  execute() { ... }  // store.add(stitchData)
  undo() { ... }     // store.remove(stitchData.id)
  get description() { return `Place ${this.stitchData.stitchType}`; }
}

class RemoveStitchCommand extends Command {
  constructor(store, id) { ... }  // captures full stitch data
  execute() { ... }  // store.remove(id)
  undo() { ... }     // store.add(capturedData)
  get description() { return 'Remove stitch'; }
}

class MoveStitchesCommand extends Command {
  constructor(store, moves) { ... }  // moves: [{ id, oldPos, newPos }]
  execute() { ... }  // store.batchUpdate with newPos
  undo() { ... }     // store.batchUpdate with oldPos
  get description() { return `Move ${this.moves.length} stitch(es)`; }
}

class RotateStitchesCommand extends Command {
  constructor(store, rotations) { ... }  // rotations: [{ id, oldRotation, newRotation }]
  execute() { ... }  // store.batchUpdate with newRotation
  undo() { ... }     // store.batchUpdate with oldRotation
  get description() { return `Rotate ${this.rotations.length} stitch(es)`; }
}
```

In `modules/StitchRenderer.js`, define:

```js
class StitchRenderer {
  constructor(bus, stitchStore, stitchAtlas, layerManager, state) { ... }
  rebuild() { ... }
  hitTest(worldX, worldY) { ... }  // returns string|null (stitch ID)
  setSelectionColor(hexColor) { ... }
  dispose() { ... }
}
```

In `ui/SelectionManager.js`, define:

```js
class SelectionManager {
  constructor(bus) { ... }
  select(id, additive = false) { ... }
  selectMultiple(ids, additive = false) { ... }
  deselect(id) { ... }
  deselectAll() { ... }
  toggle(id) { ... }
  isSelected(id) { ... }
  getSelectedIds() { ... }  // returns string[]
  getState() { ... }        // returns { ids: string[] }
  restoreState(state) { ... }
  setHovered(id) { ... }
  get count() { ... }       // returns number
}
```

In `ui/Viewport.js`, add:

```js
// New public methods
setStampHandler(handler) { ... }         // handler: ({ worldX, worldY }) => void
setStitchRenderer(renderer) { ... }      // for hit-testing
setSelectionManager(manager) { ... }     // for selection calls
get gridSpacing() { return this.#gridSpacing; }
```
