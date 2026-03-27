# Phase 1: Project Scaffold + Core Infrastructure

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.planning/EXECPLAN.md`.

## Purpose / Big Picture

After this phase, the Violet Drizzle freeform editor has a working shell: opening `vdzffedit.html` in a browser shows a blank Three.js canvas (dark background, no errors in the console), and the four core infrastructure modules — EventBus, State, HistoryManager, and Toast — are wired up and functioning. This is the foundation every subsequent phase builds on.

What someone can do after this change that they could not do before: open a browser tab, see a rendered Three.js scene, open the developer console, and verify that events can be published/subscribed, state can be set/watched, undo/redo works, and toast notifications appear on screen. Nothing visual happens yet beyond the blank canvas and toasts — that comes in Phase 2.

## Progress

- [ ] Create `vdzffedit.html` with import maps, CSS variables, and minimal layout
- [ ] Create `core/EventBus.js` (copy from VDZ)
- [ ] Create `core/State.js` (copy from VDZ)
- [ ] Create `core/Commands.js` (base Command class + SetValueCommand only, stripped of mesh-specific commands)
- [ ] Create `core/HistoryManager.js` (copy from VDZ, depends on Commands.js)
- [ ] Create `core/Toast.js` (copy from VDZ)
- [ ] Create `vdzffedit-app.js` — entry point that instantiates all core modules, sets up Three.js scene, and wires keyboard shortcuts
- [ ] Verify: page loads with no console errors, Three.js canvas fills the viewport
- [ ] Verify: EventBus, State, HistoryManager, Toast all work from console

## Surprises & Discoveries

(None yet — will be updated during implementation.)

## Decision Log

- Decision: Strip `Commands.js` down to only `Command` base class and `SetValueCommand`. All mesh-specific commands (MoveVertex, AddRing, etc.) are removed because this project has no mesh engine — stitches are independent positioned objects, not graph nodes.
  Rationale: The original VDZ `Commands.js` imports `graphology` and contains ~15 mesh-specific command classes. None of these apply to the freeform editor. Keeping the base class and `SetValueCommand` preserves the command pattern for HistoryManager while removing all dead code and the `graphology` dependency.
  Date/Author: 2026-03-27 / Plan author

- Decision: Use the same Three.js version (0.183.2) and CDN (esm.sh) as the original VDZ project. Do not add `graphology` to the import map since the freeform editor does not use graph topology.
  Rationale: Consistency with the original project, and esm.sh provides ES module builds that work with import maps without a bundler.
  Date/Author: 2026-03-27 / Plan author

- Decision: Keep the same CSS variable names and design tokens (--vd-bg, --vd-surface, --vd-accent, etc.) as the original VDZ project.
  Rationale: Visual consistency between the two editors, and the existing color palette is already tuned for a dark editor UI.
  Date/Author: 2026-03-27 / Plan author

## Outcomes & Retrospective

(Will be completed after implementation.)

## Context and Orientation

This is a greenfield project. The working directory is `D:\Python\vdz2\` and it currently contains only `CLAUDE.md`, a `research/` folder with requirements, and a `.planning/` folder with this plan. No source code files exist yet.

The project draws core modules from the original VDZ mesh editor at `D:\Python\vdz\`. Four files copy over cleanly: `EventBus.js`, `State.js`, `HistoryManager.js`, and `Toast.js`. A fifth, `Commands.js`, must be trimmed to remove mesh-specific commands and the `graphology` dependency.

Key terminology used in this plan:

- **Import map**: A `<script type="importmap">` block in the HTML file that maps bare module specifiers (like `"three"`) to CDN URLs. This replaces the need for a bundler — the browser resolves imports directly.
- **EventBus**: A pub/sub message bus. Modules communicate by emitting and subscribing to named events (e.g., `bus.emit('tool:changed', { tool: 'stamp' })`). This decouples modules from each other.
- **State**: A reactive key-value store. Setting a key notifies all watchers of that key. Used for UI state like the current tool, selected stitch, zoom level, etc.
- **HistoryManager**: An undo/redo stack that works with Command objects. Each Command has `execute()` and `undo()` methods. The HistoryManager pushes commands onto an undo stack and supports batch grouping (multiple commands as one undo step).
- **Command**: An abstract base class with `execute()` and `undo()` methods. Every user action that mutates data is wrapped in a Command subclass so it can be undone.
- **Toast**: A simple notification system that briefly displays a text message at the bottom of the screen and auto-fades.
- **Three.js orthographic camera**: A camera that renders without perspective distortion — objects don't get smaller with distance. This is correct for a 2D stitch diagram editor where the user pans and zooms a flat workspace.

Files that will exist after this phase:

```
vdz2/
├── vdzffedit.html            # Editor HTML shell
├── vdzffedit-app.js          # Entry point: instantiation + wiring
├── core/
│   ├── EventBus.js           # Pub/sub message bus
│   ├── State.js              # Reactive key-value store
│   ├── Commands.js           # Base Command + SetValueCommand
│   ├── HistoryManager.js     # Undo/redo stack
│   └── Toast.js              # Toast notifications
```

## Plan of Work

The work is divided into two milestones. Milestone 1 creates the HTML shell and gets Three.js rendering. Milestone 2 brings in the core modules and wires them together in the entry point.

### Milestone 1: HTML Shell + Three.js Canvas

This milestone produces the HTML page and a minimal entry point that initializes Three.js. At the end, opening `vdzffedit.html` in a browser shows a dark canvas filling the viewport with no console errors.

**Create `vdzffedit.html`.**

This file contains the full HTML structure, CSS, and import map. It is modeled on the original VDZ `index.html` but stripped of all mesh-editor-specific UI (shape picker, gauge picker, size inputs, mutation panel, confirm modal, etc.). What remains:

1. A `<script type="importmap">` block mapping `"three"` and `"three/addons/"` to esm.sh CDN URLs (version 0.183.2). No `graphology` mapping — it is not used in the freeform editor.

2. Google Fonts preconnect links for Jost (the UI font) and Material Symbols Rounded (icon font for buttons).

3. CSS custom properties (design tokens) in `:root` — identical to the original VDZ project:
   - `--vd-bg: #0d0d0f` (page background)
   - `--vd-surface: #13131a` (panel/header background)
   - `--vd-surface-2: #1e1e2a` (input/button background)
   - `--vd-border: #2a2a38` (borders)
   - `--vd-accent: #7c5cfc` (accent purple)
   - `--vd-accent-glow: rgba(124, 92, 252, 0.3)`
   - `--vd-text: rgba(255, 255, 255, 0.90)`
   - `--vd-text-dim: rgba(255, 255, 255, 0.55)`
   - `--vd-text-muted: rgba(255, 255, 255, 0.30)`
   - `--vd-canvas-bg: #1a1a24`
   - `--vd-success: #5cfc8a`
   - `--vd-warning: #fcba5c`
   - `--vd-error: #fc5c5c`

4. Global reset (`* { margin: 0; padding: 0; box-sizing: border-box; }`), body set to `100dvh` height, `overflow: hidden`, Jost font.

5. Layout structure (all inside a `div.app-container` flex column):
   - **Header** (`header.app-header`, 48px tall): Contains the logo text "Violet Drizzle" on the left and undo/redo icon buttons on the right. The undo and redo buttons use Material Symbols Rounded glyphs (`undo` and `redo`). Both buttons start disabled. They have ids `btn-undo` and `btn-redo`.
   - **Canvas container** (`div#canvas-container`, flex: 1): This is where Three.js will mount its `<canvas>` element. It has `position: relative; overflow: hidden;` so it fills remaining vertical space.
   - **Toast** (`div#toast`): Fixed-position notification element at the bottom center. Hidden by default (opacity: 0), shown when the `.show` class is added.

6. CSS for `.icon-btn` (the icon button style used for undo/redo and future toolbar buttons): no background, no border, 36x36px, 22px font size, hover brightens, active shows accent color, disabled greys out.

7. CSS for `#toast`: fixed bottom center, surface background, border, 12px font, rounded corners, opacity transition.

8. A `<script type="module" src="vdzffedit-app.js"></script>` at the bottom of body.

**Create a minimal `vdzffedit-app.js`.**

For Milestone 1, this file only initializes Three.js to prove the canvas works:

```javascript
import * as THREE from 'three';

const container = document.getElementById('canvas-container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setClearColor(0x1a1a24); // --vd-canvas-bg
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// Orthographic camera sized to container
const aspect = container.clientWidth / container.clientHeight;
const frustum = 500;
const camera = new THREE.OrthographicCamera(
  -frustum * aspect, frustum * aspect,
  frustum, -frustum,
  0.1, 2000
);
camera.position.set(0, 0, 1000);
camera.lookAt(0, 0, 0);

const scene = new THREE.Scene();

function render() {
  renderer.render(scene, camera);
}

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);
  const a = w / h;
  camera.left = -frustum * a;
  camera.right = frustum * a;
  camera.top = frustum;
  camera.bottom = -frustum;
  camera.updateProjectionMatrix();
  render();
}

window.addEventListener('resize', onResize);
render();

console.log('[VDZ] Freeform editor initialized — Three.js canvas ready');
```

At this point, opening the HTML file in a browser (via a local web server, since ES modules require CORS — e.g., `npx serve .` or VS Code Live Server) shows a dark (#1a1a24) canvas filling the viewport below the header bar.

### Milestone 2: Core Modules + Wiring

This milestone copies the four clean core modules from VDZ, creates a stripped-down Commands.js, and wires everything together in the entry point.

**Create `core/EventBus.js`.**

Copy the file verbatim from `D:\Python\vdz\core\EventBus.js`. No changes needed. The file exports a single class `EventBus` with methods `on(event, handler)`, `off(event, handler)`, `once(event, handler)`, `emit(event, data)`, and `has(event)`. The `on` method returns an unsubscribe function. A `debug` flag enables console logging of all events.

**Create `core/State.js`.**

Copy the file verbatim from `D:\Python\vdz\core\State.js`. No changes needed. The file exports a single class `State` with methods `get(key)`, `set(key, value)`, `watch(key, handler)`, `getAll()`, and `reset()`. The `watch` method returns an unwatch function. Setting a value only notifies watchers if the value actually changed (strict equality check).

**Create `core/Toast.js`.**

Copy the file verbatim from `D:\Python\vdz\core\Toast.js`. No changes needed. The file exports a function `toast(message, duration)` that looks up `document.getElementById('toast')`, sets its text, adds the `.show` class, and removes it after `duration` ms (default 2000).

**Create `core/Commands.js`.**

This is a new file containing only the `Command` base class and `SetValueCommand`, extracted from the original VDZ `Commands.js`. Everything else is removed:

- Remove the `import { UndirectedGraph } from 'graphology';` line
- Remove all mesh-specific command classes: `MoveVertexCommand`, `ProportionalMoveCommand`, `AddRingCommand`, `RemoveRingCommand`, `AddSpokeCommand`, `RemoveSpokeCommand`, `TransformCommand`, `MirrorMoveCommand`, `RegenerateMeshCommand`, `DeleteSelectionCommand`, `AssignYarnColorCommand`, `BatchAssignYarnColorCommand`, `AssignStitchCommand`, `BatchAssignStitchCommand`, `SetManualRotationCommand`, `BatchAssignMetadataCommand`
- Remove `LayerOpacityCommand` and `LayerVisibilityCommand` (these will be re-added in Phase 2 when the LayerManager is built)
- Keep `Command` (base class) and `SetValueCommand`
- Export both: `export { Command, SetValueCommand };`

The resulting file is approximately 80 lines.

**Create `core/HistoryManager.js`.**

Copy the file verbatim from `D:\Python\vdz\core\HistoryManager.js`. No changes needed. The file imports `Command` from `./Commands.js` (which now only contains the base class + SetValueCommand, but HistoryManager only uses the `Command` type for its internal `BatchCommand` subclass). It exports a single class `HistoryManager` with methods `execute(command)`, `undo()`, `redo()`, `beginBatch()`, `endBatch(description)`, `clear()`, and getters `canUndo` and `canRedo`. It emits events on the EventBus: `history:changed` (with `{ canUndo, canRedo }`), `history:undo`, and `history:redo`.

**Update `vdzffedit-app.js` to wire everything together.**

Replace the Milestone 1 stub with the full entry point. This file:

1. Imports all core modules:
   ```javascript
   import * as THREE from 'three';
   import { EventBus } from './core/EventBus.js';
   import { State } from './core/State.js';
   import { HistoryManager } from './core/HistoryManager.js';
   import { SetValueCommand } from './core/Commands.js';
   import { toast } from './core/Toast.js';
   ```

2. Instantiates the core singletons:
   ```javascript
   const bus = new EventBus();
   const state = new State();
   const history = new HistoryManager(bus);
   ```

3. Sets up Three.js (same as Milestone 1 — renderer, orthographic camera, scene, resize handler, initial render).

4. Wires the undo/redo buttons in the header:
   - Gets references to `#btn-undo` and `#btn-redo`.
   - Subscribes to `history:changed` on the EventBus to enable/disable the buttons based on `canUndo`/`canRedo`.
   - Adds click handlers that call `history.undo()` and `history.redo()`.
   - Adds keyboard shortcuts: `Ctrl+Z` for undo, `Ctrl+Shift+Z` (and `Ctrl+Y`) for redo. These shortcuts call `e.preventDefault()` to suppress browser default behavior.

5. Shows an initialization toast:
   ```javascript
   toast('Freeform editor ready');
   ```

6. Exposes core objects on `window` for console debugging during development:
   ```javascript
   window.__vdz = { bus, state, history, scene, camera, renderer };
   ```
   This lets a developer open the console and run commands like:
   ```javascript
   __vdz.bus.emit('test', { hello: 'world' });
   __vdz.state.set('tool', 'stamp');
   __vdz.history.execute(new SetValueCommand(__vdz.state, 'tool', 'eraser'));
   __vdz.history.undo();
   ```

## Concrete Steps

All commands should be run from the working directory `D:\Python\vdz2\`.

**Step 1: Create the directory structure.**

```
mkdir core
```

This creates the `core/` folder for the infrastructure modules. The `vdzffedit.html` and `vdzffedit-app.js` files go in the project root alongside the existing `CLAUDE.md`.

**Step 2: Create all files.**

Create the six files listed in the Plan of Work section above. The exact contents are specified in that section.

**Step 3: Serve and verify in a browser.**

Start a local web server from the project root:

```
npx serve . -l 3000
```

Or use any other static file server (VS Code Live Server, Python's `http.server`, etc.). ES modules require the files to be served over HTTP — opening the HTML file directly via `file://` will fail with CORS errors.

Open `http://localhost:3000/vdzffedit.html` in a browser (Chrome or Firefox recommended).

Expected observations:

1. The page loads with a dark header bar showing "Violet Drizzle" on the left and grayed-out undo/redo icons on the right.
2. Below the header, the Three.js canvas fills the remaining viewport with a dark blue-gray background (`#1a1a24`).
3. A toast notification "Freeform editor ready" appears briefly at the bottom center and fades out.
4. The browser console shows `[VDZ] Freeform editor initialized` with no errors.
5. The undo and redo buttons are disabled (grayed out) because the history stack is empty.

**Step 4: Verify core modules from the console.**

Open the browser developer console and run these commands to verify each module:

EventBus test:
```javascript
__vdz.bus.on('test:event', (data) => console.log('Received:', data));
__vdz.bus.emit('test:event', { message: 'hello' });
// Expected: "Received: {message: 'hello'}"
```

State test:
```javascript
__vdz.state.watch('color', (nv, ov) => console.log(`color: ${ov} → ${nv}`));
__vdz.state.set('color', 'red');
// Expected: "color: undefined → red"
__vdz.state.set('color', 'blue');
// Expected: "color: red → blue"
__vdz.state.set('color', 'blue');
// Expected: nothing (value unchanged)
```

HistoryManager + undo/redo test:
```javascript
// Import SetValueCommand for console testing
import('./core/Commands.js').then(m => {
  const cmd = new m.SetValueCommand(__vdz.state, 'tool', 'stamp');
  __vdz.history.execute(cmd);
  console.log('tool =', __vdz.state.get('tool'));
  // Expected: "tool = stamp"
  // Expected: Undo button in header is now enabled (no longer grayed out)

  __vdz.history.undo();
  console.log('tool after undo =', __vdz.state.get('tool'));
  // Expected: "tool after undo = undefined" (or whatever it was before)
  // Expected: Redo button is now enabled, Undo button disabled again

  __vdz.history.redo();
  console.log('tool after redo =', __vdz.state.get('tool'));
  // Expected: "tool after redo = stamp"
});
```

Keyboard shortcut test:
```javascript
// Press Ctrl+Z — nothing should happen (undo stack is empty after above test)
// Execute a command, then press Ctrl+Z — should undo
// Press Ctrl+Shift+Z — should redo
```

Toast test:
```javascript
import('./core/Toast.js').then(m => m.toast('Test toast!', 3000));
// Expected: "Test toast!" appears at bottom center for 3 seconds
```

## Validation and Acceptance

The phase is complete when all five success criteria from the roadmap are met:

1. **Opening `vdzffedit.html` in a browser shows a blank Three.js canvas with no console errors.** Verify by loading the page and checking the developer console — zero errors, zero warnings related to our code (browser extension warnings are acceptable).

2. **EventBus can publish and subscribe to events.** Verify by running the EventBus console test above — the handler receives the emitted data.

3. **State store holds reactive key-value pairs.** Verify by running the State console test above — watchers fire on change, no-op on same value.

4. **HistoryManager can undo/redo operations.** Verify by running the HistoryManager console test above — state reverts on undo, re-applies on redo, and the undo/redo buttons in the header enable/disable correctly.

5. **Toast notifications display on screen.** Verify by observing the startup toast ("Freeform editor ready") and running the Toast console test above.

## Idempotence and Recovery

All steps are idempotent. Creating files overwrites any previous version. The `mkdir core` command is safe to run multiple times (it will report the directory already exists). Starting the dev server can be repeated — just kill the previous instance first or use a different port.

If something goes wrong mid-implementation, delete all created files and start from Step 1. There is no persistent state to clean up — no database, no generated artifacts, no installed dependencies.

## Artifacts and Notes

The import map block for `vdzffedit.html`:

```html
<script type="importmap">
{
  "imports": {
    "three": "https://esm.sh/three@0.183.2",
    "three/addons/": "https://esm.sh/three@0.183.2/examples/jsm/"
  }
}
</script>
```

Note: `graphology` is deliberately absent. The freeform editor has no graph topology — stitches are independent positioned objects.

The stripped-down `Commands.js` export list:

```javascript
export { Command, SetValueCommand };
```

Compare with the original VDZ which exports 18 command classes. All mesh-specific commands are removed.

## Interfaces and Dependencies

**External dependencies** (loaded via import map, no npm install required):
- `three` (v0.183.2) — 3D rendering library, used here only for the orthographic canvas
- Google Fonts: Jost (UI text), Material Symbols Rounded (icon buttons)

**Internal module interfaces after this phase:**

In `core/EventBus.js`:
```javascript
class EventBus {
  on(event: string, handler: Function): Function  // returns unsubscribe fn
  off(event: string, handler: Function): void
  once(event: string, handler: Function): Function
  emit(event: string, data: any): void
  has(event: string): boolean
  debug: boolean  // set to true for console logging
}
```

In `core/State.js`:
```javascript
class State {
  get(key: string): any
  set(key: string, value: any): void  // no-op if value unchanged (===)
  watch(key: string, handler: (newVal, oldVal) => void): Function  // returns unwatch fn
  getAll(): object  // shallow copy of all data
  reset(): void     // clears all data, notifies watchers
}
```

In `core/Commands.js`:
```javascript
class Command {
  execute(): void   // abstract — subclasses must override
  undo(): void      // abstract — subclasses must override
  get description(): string
}

class SetValueCommand extends Command {
  constructor(state: State, key: string, newValue: any)
  // Captures oldValue at construction time
  // execute() calls state.set(key, newValue)
  // undo() calls state.set(key, oldValue)
}
```

In `core/HistoryManager.js`:
```javascript
class HistoryManager {
  constructor(eventBus: EventBus)
  execute(command: Command): void  // executes + pushes to undo stack
  undo(): void   // pops undo stack, pushes to redo
  redo(): void   // pops redo stack, pushes to undo
  beginBatch(): void
  endBatch(description?: string): void  // groups batched commands into one undo step
  get canUndo(): boolean
  get canRedo(): boolean
  clear(): void
  // Emits: 'history:changed' { canUndo, canRedo }
  // Emits: 'history:undo' { command }
  // Emits: 'history:redo' { command }
}
```

In `core/Toast.js`:
```javascript
function toast(message: string, duration?: number): void
// duration defaults to 2000ms
// Requires a DOM element with id="toast"
```

In `vdzffedit-app.js`:
```javascript
// No exported interface — this is the application entry point
// Exposes window.__vdz = { bus, state, history, scene, camera, renderer }
// for development/debugging
```
