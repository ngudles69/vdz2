/**
 * Tool — Base class for all interaction tools.
 *
 * Each tool handles pointer events on the canvas and optionally
 * key events. Only one tool is active at a time, managed by ToolManager.
 *
 * Subclasses override the on* methods they need. Default implementations
 * are no-ops so tools only handle what they care about.
 *
 * @example
 *   class MyTool extends Tool {
 *     onPointerDown(wp, e) { ... }
 *   }
 */
class Tool {
  /** @type {string} Unique tool identifier */
  id = 'base';

  /** @type {string} Display name */
  label = 'Tool';

  /** @type {import('../tools/ToolManager.js').ToolManager|null} */
  manager = null;

  /**
   * Called when this tool becomes the active tool.
   */
  onActivate() {}

  /**
   * Called when this tool is replaced by another tool.
   */
  onDeactivate() {}

  /**
   * @param {{ x: number, y: number }} wp - World-space coordinates
   * @param {PointerEvent} e - Raw pointer event
   * @returns {boolean} True if the event was consumed (prevents further handling)
   */
  onPointerDown(wp, e) { return false; }

  /**
   * @param {{ x: number, y: number }} wp
   * @param {PointerEvent} e
   */
  onPointerMove(wp, e) {}

  /**
   * @param {{ x: number, y: number }} wp
   * @param {PointerEvent} e
   */
  onPointerUp(wp, e) {}

  /**
   * @param {KeyboardEvent} e
   * @returns {boolean} True if consumed
   */
  onKeyDown(e) { return false; }

  /**
   * Return the CSS cursor for the current state.
   * @returns {string}
   */
  getCursor() { return 'default'; }

  // --- Helpers available to all tools ---

  /** @returns {import('../../core/EventBus.js').EventBus} */
  get bus() { return this.manager?.bus; }

  /** @returns {import('../../core/State.js').State} */
  get state() { return this.manager?.state; }

  /** @returns {import('../../core/HistoryManager.js').HistoryManager} */
  get history() { return this.manager?.history; }

  /** @returns {import('../../modules/StitchStore.js').StitchStore} */
  get store() { return this.manager?.store; }

  /** @returns {import('../SelectionManager.js').SelectionManager} */
  get selection() { return this.manager?.selection; }

  /** @returns {import('../TransformControls.js').TransformControls} */
  get transform() { return this.manager?.transform; }

  /** @returns {import('../../modules/StitchRenderer.js').StitchRenderer} */
  get renderer() { return this.manager?.renderer; }

  /** @returns {boolean} True if the stitches layer is locked */
  get stitchesLocked() { return this.manager?.layerManager?.isLocked('stitches') ?? false; }

  /** @returns {boolean} True if the image layer is locked */
  get imageLocked() { return this.manager?.layerManager?.isLocked('image') ?? false; }

  /** @returns {{ gridVisible: boolean, gridSpacing: number }} */
  get grid() {
    const vp = this.manager?.viewport;
    return {
      visible: vp?.gridVisible ?? false,
      spacing: vp?.gridSpacing ?? 20,
    };
  }

  /**
   * Snap a world position to the grid if grid is visible.
   * @param {{ x: number, y: number }} wp
   * @returns {{ x: number, y: number }}
   */
  snapToGrid(wp) {
    if (!this.state?.get('gridSnap')) return wp;
    const s = this.grid.spacing;
    return {
      x: Math.round(wp.x / s) * s,
      y: Math.round(wp.y / s) * s,
    };
  }
}

export { Tool };
