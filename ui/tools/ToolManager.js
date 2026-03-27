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
    this.#controls = opts.controls;
    this.#canvas = opts.canvas;
    this.#screenToWorld = opts.screenToWorld;

    this.#setupPointerEvents();
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

  #setupPointerEvents() {
    this.#canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; // left-click only

      const wp = this.#screenToWorld(e.clientX, e.clientY);
      this.#pointerDownInfo = { x: e.clientX, y: e.clientY, time: performance.now() };

      if (this.#activeTool) {
        const consumed = this.#activeTool.onPointerDown(wp, e);
        if (consumed) {
          this.#dragging = true;
          this.#controls.enabled = false;
        }
      }
    });

    this.#canvas.addEventListener('pointermove', (e) => {
      if (!this.#activeTool) return;
      const wp = this.#screenToWorld(e.clientX, e.clientY);
      this.#activeTool.onPointerMove(wp, e);
      this.#canvas.style.cursor = this.#activeTool.getCursor();
    });

    this.#canvas.addEventListener('pointerup', (e) => {
      if (e.button !== 0) return;

      const wp = this.#screenToWorld(e.clientX, e.clientY);

      if (this.#activeTool) {
        this.#activeTool.onPointerUp(wp, e);
      }

      if (this.#dragging) {
        this.#dragging = false;
        this.#controls.enabled = true;
      }

      this.#pointerDownInfo = null;
    });
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

  /** Disable orbit controls (called by tools during drag) */
  disableControls() { this.#controls.enabled = false; }

  /** Re-enable orbit controls */
  enableControls() { this.#controls.enabled = true; }
}

export { ToolManager };
