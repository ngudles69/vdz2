/**
 * SelectionManager — Manages selection and hover state for placed objects
 * (stitches, text stamps, or any stampable item).
 *
 * Tracks selected item IDs (strings). Handles additive (Shift) selection
 * toggle and emits events via EventBus when selection changes.
 */
class SelectionManager {

  /** @type {Set<string>} Selected item IDs */
  #selected = new Set();

  /** @type {string|null} Currently hovered item ID */
  #hovered = null;

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {boolean} Suppresses command creation during undo/redo restore */
  #isRestoring = false;

  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(bus) {
    this.#bus = bus;
  }

  /**
   * Select a single item by ID.
   * Non-additive: clears existing selection first.
   * Additive: toggles the item (deselects if already selected).
   *
   * @param {string} id
   * @param {boolean} [additive=false]
   */
  select(id, additive = false) {
    if (!additive) {
      this.#selected.clear();
    }

    if (additive && this.#selected.has(id)) {
      this.#selected.delete(id);
    } else {
      this.#selected.add(id);
    }

    this.#emitChanged();
  }

  /**
   * Select multiple items with a single event emit.
   * @param {string[]} ids
   * @param {boolean} [additive=false]
   */
  selectMultiple(ids, additive = false) {
    if (!additive) {
      this.#selected.clear();
    }
    for (const id of ids) {
      this.#selected.add(id);
    }
    this.#emitChanged();
  }

  /**
   * Clear all selection.
   */
  deselectAll() {
    if (this.#selected.size === 0) return;
    this.#selected.clear();
    this.#emitChanged();
  }

  /**
   * Remove specific IDs from selection (e.g. after deletion).
   * @param {string[]} ids
   */
  removeFromSelection(ids) {
    let changed = false;
    for (const id of ids) {
      if (this.#selected.delete(id)) changed = true;
    }
    if (changed) this.#emitChanged();
  }

  /**
   * Set the hovered item.
   * @param {string|null} id
   */
  setHovered(id) {
    if (this.#hovered === id) return;
    this.#hovered = id;
    this.#bus.emit('selection:hover', { id });
  }

  /**
   * Clear hover state.
   */
  clearHover() {
    if (this.#hovered === null) return;
    this.#hovered = null;
    this.#bus.emit('selection:hover', { id: null });
  }

  // --- Getters ---

  /** @returns {Set<string>} Copy of selected IDs */
  get selectedIds() { return new Set(this.#selected); }

  /** @returns {string[]} Selected IDs as array */
  get selectedArray() { return [...this.#selected]; }

  /** @returns {string|null} */
  get hoveredId() { return this.#hovered; }

  /** @returns {boolean} */
  get hasSelection() { return this.#selected.size > 0; }

  /** @returns {number} */
  get count() { return this.#selected.size; }

  /**
   * Check if a specific ID is selected.
   * @param {string} id
   * @returns {boolean}
   */
  isSelected(id) {
    return this.#selected.has(id);
  }

  /**
   * Snapshot current selection state (for undo/redo).
   * @returns {string[]}
   */
  getState() {
    return [...this.#selected];
  }

  /**
   * Restore selection from snapshot (used by undo/redo).
   * @param {string[]} snapshot
   */
  restoreState(snapshot) {
    this.#isRestoring = true;
    this.#selected = new Set(snapshot);
    this.#emitChanged();
    this.#isRestoring = false;
  }

  /** @returns {boolean} True while restoring from undo/redo */
  get isRestoring() { return this.#isRestoring; }

  // --- Private ---

  #emitChanged() {
    this.#bus.emit('selection:changed', {
      ids: [...this.#selected],
      count: this.#selected.size,
    });
  }
}

export { SelectionManager };
