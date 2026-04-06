/**
 * ToolManager — Routes pointer events to the active tool.
 *
 * Only one tool is active at a time. The manager handles:
 * - Registering tools
 * - Switching between tools
 * - Routing canvas pointer events to the active tool
 * - Managing OrbitControls enable/disable during tool drags
 *
 * Keyboard shortcuts are handled separately by KeyboardManager.
 * The ToolManager only forwards key events that the active tool wants.
 */
class ToolManager {

  /** @type {Map<string, import('./Tool.js').Tool>} */
  #tools = new Map();

  /** @type {import('./Tool.js').Tool|null} */
  #activeTool = null;

  /** @type {boolean} Whether a pointer drag is in progress */
  #dragging = false;

  /** @type {{ x: number, y: number, time: number }|null} */
  #pointerDownInfo = null;

  /** @type {boolean} Whether spacebar is held (pan mode) */
  #spaceHeld = false;

  /** @type {boolean} Whether we're in a space+drag pan */
  #spacePanning = false;

  /** @type {Set<number>} Active touch pointer IDs on the canvas */
  #activePointers = new Set();

  /** @type {boolean} Whether a multi-touch gesture is in progress */
  #multiTouch = false;

  /** @type {boolean} Whether the current interaction is touch */
  #isTouch = false;

  /** @type {Map<number, {x:number, y:number}>} Current positions of active touch pointers */
  #pointerPositions = new Map();

  /** @type {number|null} Initial pinch distance when gesture started */
  #pinchStartDist = null;

  /** @type {number|null} Camera zoom when pinch gesture started */
  #pinchStartZoom = null;

  /** @type {{x:number, y:number}|null} Previous midpoint for pan tracking */
  #prevMidpoint = null;

  // Shared references (available to tools via tool.manager.*)
  bus;
  state;
  history;
  store;
  selection;
  transform;
  renderer;
  viewport;
  stitchPicker;
  imageOverlay;
  layerManager;
  stitchTarget;
  imageTarget;
  videoTarget;
  videoOverlay;

  /** @type {object} OrbitControls reference */
  #controls;

  /** @type {HTMLCanvasElement} */
  #canvas;

  /** @type {function} screenToWorld converter */
  #screenToWorld;

  /**
   * @param {object} opts
   * @param {object} opts.bus - EventBus
   * @param {object} opts.state - State
   * @param {object} opts.history - HistoryManager
   * @param {object} opts.store - StitchStore
   * @param {object} opts.selection - SelectionManager
   * @param {object} opts.transform - TransformControls
   * @param {object} opts.renderer - StitchRenderer
   * @param {object} opts.viewport - Viewport
   * @param {object} opts.stitchPicker - StitchPicker
   * @param {object} opts.controls - OrbitControls
   * @param {HTMLCanvasElement} opts.canvas - The renderer's canvas element
   * @param {function} opts.screenToWorld - (clientX, clientY) => {x, y}
   */
  constructor(opts) {
    this.bus = opts.bus;
    this.state = opts.state;
    this.history = opts.history;
    this.store = opts.store;
    this.selection = opts.selection;
    this.transform = opts.transform;
    this.renderer = opts.renderer;
    this.viewport = opts.viewport;
    this.stitchPicker = opts.stitchPicker;
    this.imageOverlay = opts.imageOverlay;
    this.layerManager = opts.layerManager;
    this.stitchTarget = opts.stitchTarget;
    this.imageTarget = opts.imageTarget;
    this.videoTarget = opts.videoTarget;
    this.videoOverlay = opts.videoOverlay;
    this.#controls = opts.controls;
    this.#canvas = opts.canvas;
    this.#screenToWorld = opts.screenToWorld;

    this.#setupPointerEvents();
    this.#setupSpacebarPan();
  }

  // ---- Tool registration ----

  /**
   * Register a tool.
   * @param {import('./Tool.js').Tool} tool
   */
  register(tool) {
    tool.manager = this;
    this.#tools.set(tool.id, tool);
  }

  /**
   * Switch to a tool by ID.
   * @param {string} id
   */
  setActive(id) {
    const tool = this.#tools.get(id);
    if (!tool) return;

    if (this.#activeTool) {
      this.#activeTool.onDeactivate();
    }

    this.#activeTool = tool;
    tool.onActivate();
    this.#canvas.style.cursor = tool.getCursor();

    this.bus.emit('tool:changed', { id });
  }

  /** @returns {import('./Tool.js').Tool|null} */
  get activeTool() { return this.#activeTool; }

  /** @returns {string|null} */
  get activeToolId() { return this.#activeTool?.id ?? null; }

  /**
   * Get a registered tool by ID.
   * @param {string} id
   * @returns {import('./Tool.js').Tool|null}
   */
  getTool(id) { return this.#tools.get(id) || null; }

  // ---- Pointer event routing ----

  #setupSpacebarPan() {
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !e.repeat && !this.#isInputFocused()) {
        e.preventDefault();
        this.#spaceHeld = true;
        this.#canvas.style.cursor = 'grab';
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        const didPan = this.#spacePanning;
        this.#spaceHeld = false;
        this.#spacePanning = false;
        if (this.#activeTool) {
          this.#canvas.style.cursor = this.#activeTool.getCursor();
        }
        // Space tap (no drag) = toggle play/pause
        if (!didPan) {
          this.bus.emit('space:tap');
        }
      }
    });
  }

  #isInputFocused() {
    const tag = document.activeElement?.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  #setupPointerEvents() {
    this.#canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // left-click only

      const isTouch = e.pointerType === 'touch';
      this.#isTouch = isTouch;

      // Track touch pointers
      if (isTouch) {
        this.#activePointers.add(e.pointerId);
        this.#pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });

        // Second finger down — switch to multi-touch, handle pinch/pan manually
        if (this.#activePointers.size > 1) {
          this.#multiTouch = true;
          this.#dragging = false;
          this.#pointerDownInfo = null;
          // Initialize pinch/pan tracking
          this.#initPinch();
          return;
        }
      }

      // Spacebar + left-click = pan (let OrbitControls handle it)
      if (this.#spaceHeld) {
        this.#spacePanning = true;
        this.#canvas.style.cursor = 'grabbing';
        return;
      }

      const wp = this.#screenToWorld(e.clientX, e.clientY);
      this.#pointerDownInfo = { x: e.clientX, y: e.clientY, time: performance.now() };

      if (this.#activeTool) {
        const consumed = this.#activeTool.onPointerDown(wp, e);
        if (consumed) {
          this.#dragging = true;
          if (!isTouch) {
            this.#controls.enabled = false;
          }
        }
      }
    });

    this.#canvas.addEventListener('pointermove', (e) => {
      // Manual pinch/pan for touch
      if (e.pointerType === 'touch') {
        this.#pointerPositions.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.#multiTouch && this.#activePointers.size >= 2) {
          this.#updatePinch();
          return;
        }
      }

      if (this.#multiTouch) return;
      if (this.#spacePanning) return;
      if (!this.#activeTool) return;
      const wp = this.#screenToWorld(e.clientX, e.clientY);
      this.#activeTool.onPointerMove(wp, e);
      if (!this.#spaceHeld) {
        this.#canvas.style.cursor = this.#activeTool.getCursor();
      }
    });

    this.#canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;

      if (e.pointerType === 'touch') {
        this.#activePointers.delete(e.pointerId);
        this.#pointerPositions.delete(e.pointerId);

        if (this.#multiTouch) {
          if (this.#activePointers.size === 0) {
            this.#multiTouch = false;
            this.#pinchStartDist = null;
            this.#pinchStartZoom = null;
            this.#prevMidpoint = null;
          }
          return;
        }
      }

      if (this.#spacePanning) {
        this.#spacePanning = false;
        this.#canvas.style.cursor = this.#spaceHeld ? 'grab' : (this.#activeTool?.getCursor() || 'default');
        return;
      }

      const wp = this.#screenToWorld(e.clientX, e.clientY);

      if (this.#activeTool) {
        this.#activeTool.onPointerUp(wp, e);
      }

      if (this.#dragging) {
        this.#dragging = false;
        if (!this.#controls.enabled) {
          this.#controls.enabled = true;
        }
      }

      this.#pointerDownInfo = null;
    });

    this.#canvas.addEventListener('pointercancel', (e) => {
      if (e.pointerType === 'touch') {
        this.#activePointers.delete(e.pointerId);
        this.#pointerPositions.delete(e.pointerId);
        if (this.#activePointers.size === 0) {
          this.#multiTouch = false;
          this.#pinchStartDist = null;
          this.#pinchStartZoom = null;
          this.#prevMidpoint = null;
        }
      }
    });
  }

  // ---- Manual pinch-to-zoom / two-finger pan ----

  #getTwoFingers() {
    const ids = [...this.#activePointers];
    const a = this.#pointerPositions.get(ids[0]);
    const b = this.#pointerPositions.get(ids[1]);
    if (!a || !b) return null;
    return { a, b };
  }

  #initPinch() {
    const f = this.#getTwoFingers();
    if (!f) return;
    const dx = f.b.x - f.a.x;
    const dy = f.b.y - f.a.y;
    this.#pinchStartDist = Math.sqrt(dx * dx + dy * dy);
    this.#pinchStartZoom = this.viewport.camera.zoom;
    this.#prevMidpoint = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
  }

  #updatePinch() {
    const f = this.#getTwoFingers();
    if (!f || !this.#pinchStartDist) return;

    const camera = this.viewport.camera;
    const dx = f.b.x - f.a.x;
    const dy = f.b.y - f.a.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Zoom
    const scale = dist / this.#pinchStartDist;
    const newZoom = Math.max(0.1, Math.min(30, this.#pinchStartZoom * scale));
    camera.zoom = newZoom;
    camera.updateProjectionMatrix();

    // Pan
    const mid = { x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 };
    if (this.#prevMidpoint) {
      const rect = this.#canvas.getBoundingClientRect();
      const frustumSize = this.viewport.frustumSize;
      const aspect = rect.width / rect.height;
      // Convert pixel delta to world units
      const worldPerPixelX = (frustumSize * aspect) / (rect.width * camera.zoom);
      const worldPerPixelY = frustumSize / (rect.height * camera.zoom);
      camera.position.x -= (mid.x - this.#prevMidpoint.x) * worldPerPixelX;
      camera.position.y += (mid.y - this.#prevMidpoint.y) * worldPerPixelY;
    }
    this.#prevMidpoint = mid;

    if (this.bus) this.bus.emit('camera:zoom-changed', { zoom: camera.zoom });
  }

  /**
   * Forward a keydown event to the active tool.
   * @param {KeyboardEvent} e
   * @returns {boolean} True if consumed
   */
  handleKeyDown(e) {
    if (this.#activeTool) {
      return this.#activeTool.onKeyDown(e);
    }
    return false;
  }

  /**
   * Check if a pointer event was a tap (short distance + short time).
   * @param {PointerEvent} e
   * @returns {boolean}
   */
  isTap(e) {
    if (!this.#pointerDownInfo) return false;
    const dx = e.clientX - this.#pointerDownInfo.x;
    const dy = e.clientY - this.#pointerDownInfo.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const elapsed = performance.now() - this.#pointerDownInfo.time;
    return dist < 5 && elapsed < 300;
  }

  /** @returns {{ x: number, y: number, time: number }|null} */
  get pointerDownInfo() { return this.#pointerDownInfo; }

  /** Disable orbit controls (called by tools during drag — skipped for touch) */
  disableControls() { if (!this.#isTouch) this.#controls.enabled = false; }

  /** Re-enable orbit controls */
  enableControls() { this.#controls.enabled = true; }
}

export { ToolManager };
