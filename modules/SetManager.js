/**
 * SetManager — Manages numbered stitch groups (sets).
 *
 * Each stitch belongs to at most one set. Sets have visibility state,
 * a display color, and an optional blink color for animation.
 *
 * Sets are numbered 1-9 (quick access) with support for more via the
 * "more" panel. Set 0 means "unassigned".
 */
class SetManager {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('./StitchStore.js').StitchStore} */
  #store;

  /**
   * @type {Map<number, {
   *   visible: boolean,
   *   color: string|null,
   *   blinkColor: string|null,
   *   label: string
   * }>}
   */
  #sets = new Map();

  /** @type {number} Maximum pre-created sets */
  #maxQuickSets = 9;

  constructor(bus, store) {
    this.#bus = bus;
    this.#store = store;

    // Pre-create sets 1-9
    for (let i = 1; i <= this.#maxQuickSets; i++) {
      this.#sets.set(i, {
        visible: true,
        color: null,
        blinkColor: null,
        label: String(i),
      });
    }
  }

  // ---- Assignment ----

  /**
   * Assign stitches to a set. Removes them from any previous set.
   * @param {string[]} stitchIds
   * @param {number} setId - Set number (1-9+)
   */
  assign(stitchIds, setId) {
    const updates = stitchIds.map(id => ({ id, props: { setId } }));
    this.#store.batchUpdate(updates);
    this.#bus.emit('set:assigned', { setId, stitchIds });
    this.#emitChanged();
  }

  /**
   * Unassign stitches from any set.
   * @param {string[]} stitchIds
   */
  unassign(stitchIds) {
    const updates = stitchIds.map(id => ({ id, props: { setId: null } }));
    this.#store.batchUpdate(updates);
    this.#bus.emit('set:unassigned', { stitchIds });
    this.#emitChanged();
  }

  // ---- Visibility ----

  /**
   * Toggle visibility of a set.
   * @param {number} setId
   * @returns {boolean} New visibility state
   */
  toggleVisibility(setId) {
    const set = this.#sets.get(setId);
    if (!set) return true;

    set.visible = !set.visible;
    this.#bus.emit('set:visibility-changed', { setId, visible: set.visible });
    this.#emitChanged();
    return set.visible;
  }

  /**
   * Set visibility of a specific set.
   * @param {number} setId
   * @param {boolean} visible
   */
  setVisibility(setId, visible) {
    const set = this.#sets.get(setId);
    if (!set) return;
    set.visible = visible;
    this.#bus.emit('set:visibility-changed', { setId, visible });
    this.#emitChanged();
  }

  /**
   * Show all sets.
   */
  showAll() {
    for (const [, set] of this.#sets) {
      set.visible = true;
    }
    this.#bus.emit('set:show-all', null);
    this.#emitChanged();
  }

  /**
   * Hide all sets.
   */
  hideAll() {
    for (const [, set] of this.#sets) {
      set.visible = false;
    }
    this.#bus.emit('set:hide-all', null);
    this.#emitChanged();
  }

  /**
   * Check if all assigned sets are visible.
   * @returns {boolean}
   */
  allVisible() {
    for (const [id, set] of this.#sets) {
      if (this.getCount(id) > 0 && !set.visible) return false;
    }
    return true;
  }

  /**
   * Check if a set is visible.
   * @param {number} setId
   * @returns {boolean}
   */
  isVisible(setId) {
    const set = this.#sets.get(setId);
    return set ? set.visible : true;
  }

  // ---- Querying ----

  /**
   * Get all stitch IDs in a set.
   * @param {number} setId
   * @returns {string[]}
   */
  getStitchIds(setId) {
    return this.#store.getAll()
      .filter(s => s.setId === setId)
      .map(s => s.id);
  }

  /**
   * Get the count of stitches in a set.
   * @param {number} setId
   * @returns {number}
   */
  getCount(setId) {
    return this.#store.getAll().filter(s => s.setId === setId).length;
  }

  /**
   * Check if a set has any stitches assigned.
   * @param {number} setId
   * @returns {boolean}
   */
  hasStitches(setId) {
    return this.#store.getAll().some(s => s.setId === setId);
  }

  /**
   * Get set info.
   * @param {number} setId
   * @returns {{ visible: boolean, color: string|null, blinkColor: string|null, label: string, count: number }|null}
   */
  getSet(setId) {
    const set = this.#sets.get(setId);
    if (!set) return null;
    return {
      ...set,
      count: this.getCount(setId),
    };
  }

  /**
   * Get all sets with their stitch counts.
   * @returns {Array<{ id: number, visible: boolean, color: string|null, count: number }>}
   */
  getAllSets() {
    const result = [];
    for (const [id, set] of this.#sets) {
      result.push({
        id,
        visible: set.visible,
        color: set.color,
        blinkColor: set.blinkColor,
        label: set.label,
        count: this.getCount(id),
      });
    }
    return result;
  }

  // ---- Color ----

  /**
   * Set the display color for a set.
   * @param {number} setId
   * @param {string|null} color
   */
  setColor(setId, color) {
    const set = this.#sets.get(setId);
    if (!set) return;
    set.color = color;
    this.#bus.emit('set:color-changed', { setId, color });
    this.#emitChanged();
  }

  /**
   * Set the blink color for a set (used in future animation).
   * @param {number} setId
   * @param {string|null} color
   */
  setBlinkColor(setId, color) {
    const set = this.#sets.get(setId);
    if (!set) return;
    set.blinkColor = color;
  }

  // ---- Stitch visibility filtering ----

  /**
   * Check if a stitch should be visible based on its set assignment and set visibility.
   * Unassigned stitches are always visible.
   * @param {object} stitch
   * @returns {boolean}
   */
  isStitchVisible(stitch) {
    if (stitch.setId === null || stitch.setId === undefined) return true;
    return this.isVisible(stitch.setId);
  }

  // ---- Persistence ----

  /**
   * Export set state for saving.
   */
  exportJSON() {
    const sets = {};
    for (const [id, set] of this.#sets) {
      sets[id] = {
        visible: set.visible,
        color: set.color,
        blinkColor: set.blinkColor,
        label: set.label,
      };
    }
    return sets;
  }

  /**
   * Import set state from saved data.
   * @param {object} data
   */
  importJSON(data) {
    if (!data) return;
    for (const [id, set] of Object.entries(data)) {
      const numId = parseInt(id);
      if (this.#sets.has(numId)) {
        const existing = this.#sets.get(numId);
        existing.visible = set.visible ?? true;
        existing.color = set.color ?? null;
        existing.blinkColor = set.blinkColor ?? null;
        existing.label = set.label ?? String(numId);
      }
    }
    this.#emitChanged();
  }

  // ---- Private ----

  #emitChanged() {
    this.#bus.emit('set:changed', null);
  }
}

export { SetManager };
