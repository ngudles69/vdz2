/**
 * StitchStore — Authoritative data store for all placed stitch objects.
 *
 * Each stitch is an independent positioned object:
 *   { id, stitchType, position: {x,y}, rotation, setId, orderInSet,
 *     colorOverride, opacity }
 *
 * The store emits events on the EventBus when stitches are added, removed,
 * or updated. The StitchRenderer listens to these events to sync the
 * Three.js InstancedMesh.
 */

let _nextId = 1;

/** Generate a unique stitch ID. */
function generateId() {
  return `stitch_${_nextId++}_${Date.now().toString(36)}`;
}

class StitchStore {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {Map<string, object>} id -> stitch data */
  #stitches = new Map();

  /** @type {number} Auto-incrementing z-index for new stitches */
  #nextZIndex = 0;

  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   */
  constructor(bus) {
    this.#bus = bus;
  }

  /**
   * Add a stitch to the store.
   * @param {object} data - Stitch data (id is auto-generated if not provided)
   * @returns {object} The stored stitch object (with id)
   */
  add(data) {
    const stitch = {
      id: data.id || generateId(),
      type: data.type || 'stitch',       // 'stitch' | 'text' | future types
      stitchType: data.stitchType || null, // stitch symbol id (e.g. 'sc'), null for text
      text: data.text || null,            // text content (for type='text')
      textStyle: data.textStyle || null,  // { font, size, spacing, align, bold, italic }
      position: { x: data.position?.x || 0, y: data.position?.y || 0 },
      rotation: data.rotation || 0,
      scale: data.scale ?? 1.0,
      zIndex: data.zIndex ?? this.#nextZIndex++,
      gridSnapped: data.gridSnapped ?? false,
      gridLinked: data.gridLinked ?? false,
      gridCoords: data.gridCoords ? { x: data.gridCoords.x, y: data.gridCoords.y } : null,
      setId: data.setId ?? null,
      orderInSet: data.orderInSet ?? null,
      colorOverride: data.colorOverride ?? null,
      opacity: data.opacity ?? 1.0,
    };

    this.#stitches.set(stitch.id, stitch);
    this.#bus.emit('stitch-store:added', { stitch });
    return stitch;
  }

  /**
   * Remove a stitch by ID.
   * @param {string} id
   * @returns {object|null} The removed stitch data, or null if not found
   */
  remove(id) {
    const stitch = this.#stitches.get(id);
    if (!stitch) return null;

    this.#stitches.delete(id);
    this.#bus.emit('stitch-store:removed', { stitch });
    return stitch;
  }

  /**
   * Update properties of a stitch.
   * @param {string} id
   * @param {object} props - Partial properties to merge
   * @returns {object|null} The updated stitch, or null if not found
   */
  update(id, props) {
    const stitch = this.#stitches.get(id);
    if (!stitch) return null;

    if (props.position) {
      stitch.position.x = props.position.x ?? stitch.position.x;
      stitch.position.y = props.position.y ?? stitch.position.y;
    }
    if (props.rotation !== undefined) stitch.rotation = props.rotation;
    if (props.scale !== undefined) stitch.scale = props.scale;
    if (props.setId !== undefined) stitch.setId = props.setId;
    if (props.orderInSet !== undefined) stitch.orderInSet = props.orderInSet;
    if (props.colorOverride !== undefined) stitch.colorOverride = props.colorOverride;
    if (props.opacity !== undefined) stitch.opacity = props.opacity;
    if (props.stitchType !== undefined) stitch.stitchType = props.stitchType;
    if (props.zIndex !== undefined) stitch.zIndex = props.zIndex;
    if (props.gridSnapped !== undefined) stitch.gridSnapped = props.gridSnapped;
    if (props.gridLinked !== undefined) stitch.gridLinked = props.gridLinked;
    if (props.gridCoords !== undefined) stitch.gridCoords = props.gridCoords ? { ...props.gridCoords } : null;
    if (props.text !== undefined) stitch.text = props.text;
    if (props.textStyle !== undefined) stitch.textStyle = props.textStyle ? { ...props.textStyle } : null;

    this.#bus.emit('stitch-store:updated', { stitch });
    return stitch;
  }

  /**
   * Batch update multiple stitches (single event emit).
   * @param {Array<{ id: string, props: object }>} updates
   */
  batchUpdate(updates) {
    const updated = [];
    for (const { id, props } of updates) {
      const stitch = this.#stitches.get(id);
      if (!stitch) continue;

      if (props.position) {
        stitch.position.x = props.position.x ?? stitch.position.x;
        stitch.position.y = props.position.y ?? stitch.position.y;
      }
      if (props.rotation !== undefined) stitch.rotation = props.rotation;
      if (props.scale !== undefined) stitch.scale = props.scale;
      if (props.setId !== undefined) stitch.setId = props.setId;
      if (props.orderInSet !== undefined) stitch.orderInSet = props.orderInSet;
      if (props.colorOverride !== undefined) stitch.colorOverride = props.colorOverride;
      if (props.opacity !== undefined) stitch.opacity = props.opacity;
      if (props.stitchType !== undefined) stitch.stitchType = props.stitchType;
      if (props.zIndex !== undefined) stitch.zIndex = props.zIndex;
      if (props.gridSnapped !== undefined) stitch.gridSnapped = props.gridSnapped;
      if (props.gridLinked !== undefined) stitch.gridLinked = props.gridLinked;
      if (props.gridCoords !== undefined) stitch.gridCoords = props.gridCoords ? { ...props.gridCoords } : null;
      if (props.text !== undefined) stitch.text = props.text;
      if (props.textStyle !== undefined) stitch.textStyle = props.textStyle ? { ...props.textStyle } : null;

      updated.push(stitch);
    }

    if (updated.length > 0) {
      this.#bus.emit('stitch-store:batch-updated', { stitches: updated });
    }
  }

  /**
   * Get a stitch by ID.
   * @param {string} id
   * @returns {object|null}
   */
  getById(id) {
    return this.#stitches.get(id) || null;
  }

  /**
   * Get multiple stitches by IDs.
   * @param {string[]} ids
   * @returns {object[]}
   */
  getByIds(ids) {
    return ids.map(id => this.#stitches.get(id)).filter(Boolean);
  }

  /**
   * Get all stitches as an array.
   * @returns {object[]}
   */
  getAll() {
    return [...this.#stitches.values()];
  }

  /**
   * Get the number of stitches.
   * @returns {number}
   */
  get count() {
    return this.#stitches.size;
  }

  /**
   * Get all stitch IDs.
   * @returns {string[]}
   */
  getAllIds() {
    return [...this.#stitches.keys()];
  }

  /**
   * Clear all stitches.
   */
  clear() {
    this.#stitches.clear();
    this.#bus.emit('stitch-store:cleared', null);
  }

  // --- Grid linking ---

  /**
   * Reflow all grid-linked stitches to a new grid spacing.
   * Each linked stitch's world position is recalculated from its gridCoords.
   * @param {number} newSpacing - New grid spacing in world units
   */
  reflowGrid(newSpacing) {
    const updated = [];
    for (const s of this.#stitches.values()) {
      if (s.gridLinked && s.gridCoords) {
        s.position.x = s.gridCoords.x * newSpacing;
        s.position.y = s.gridCoords.y * newSpacing;
        updated.push(s);
      }
    }
    if (updated.length > 0) {
      this.#bus.emit('stitch-store:batch-updated', { stitches: updated });
    }
  }

  /**
   * Link a stitch to the grid. Computes and stores its grid coordinates
   * from its current world position.
   * @param {string} id
   * @param {number} gridSpacing
   */
  linkToGrid(id, gridSpacing) {
    const s = this.#stitches.get(id);
    if (!s || gridSpacing <= 0) return;
    s.gridLinked = true;
    s.gridCoords = {
      x: s.position.x / gridSpacing,
      y: s.position.y / gridSpacing,
    };
    this.#bus.emit('stitch-store:updated', { stitch: s });
  }

  /**
   * Unlink a stitch from the grid. Keeps current world position, clears gridCoords.
   * @param {string} id
   */
  unlinkFromGrid(id) {
    const s = this.#stitches.get(id);
    if (!s) return;
    s.gridLinked = false;
    s.gridCoords = null;
    this.#bus.emit('stitch-store:updated', { stitch: s });
  }

  // --- Z-order manipulation ---

  /**
   * Get all stitches sorted by zIndex ascending (back to front).
   * @returns {object[]}
   */
  getAllSorted() {
    return this.getAll().sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Send items to front (highest zIndex).
   * @param {string[]} ids
   */
  sendToFront(ids) {
    for (const id of ids) {
      const s = this.#stitches.get(id);
      if (s) s.zIndex = this.#nextZIndex++;
    }
    this.#bus.emit('stitch-store:reordered', { ids });
  }

  /**
   * Send items to back (lowest zIndex).
   * @param {string[]} ids
   */
  sendToBack(ids) {
    // Find current minimum
    let min = Infinity;
    for (const s of this.#stitches.values()) {
      if (s.zIndex < min) min = s.zIndex;
    }
    let z = min - ids.length;
    for (const id of ids) {
      const s = this.#stitches.get(id);
      if (s) s.zIndex = z++;
    }
    this.#bus.emit('stitch-store:reordered', { ids });
  }

  /**
   * Move items one step forward in z-order.
   * @param {string[]} ids
   */
  bringForward(ids) {
    const sorted = this.getAllSorted();
    const idSet = new Set(ids);
    // Find items just above each selected item and swap
    for (let i = sorted.length - 2; i >= 0; i--) {
      if (idSet.has(sorted[i].id) && !idSet.has(sorted[i + 1].id)) {
        const tmp = sorted[i].zIndex;
        sorted[i].zIndex = sorted[i + 1].zIndex;
        sorted[i + 1].zIndex = tmp;
      }
    }
    this.#bus.emit('stitch-store:reordered', { ids });
  }

  /**
   * Move items one step backward in z-order.
   * @param {string[]} ids
   */
  sendBackward(ids) {
    const sorted = this.getAllSorted();
    const idSet = new Set(ids);
    for (let i = 1; i < sorted.length; i++) {
      if (idSet.has(sorted[i].id) && !idSet.has(sorted[i - 1].id)) {
        const tmp = sorted[i].zIndex;
        sorted[i].zIndex = sorted[i - 1].zIndex;
        sorted[i - 1].zIndex = tmp;
      }
    }
    this.#bus.emit('stitch-store:reordered', { ids });
  }

  /**
   * Export all stitches as a plain array (for JSON serialization).
   * @returns {object[]}
   */
  exportJSON() {
    return this.getAll().map(s => ({
      id: s.id,
      type: s.type,
      stitchType: s.stitchType,
      text: s.text,
      textStyle: s.textStyle ? { ...s.textStyle } : null,
      position: { ...s.position },
      rotation: s.rotation,
      zIndex: s.zIndex,
      gridSnapped: s.gridSnapped,
      gridLinked: s.gridLinked,
      gridCoords: s.gridCoords ? { ...s.gridCoords } : null,
      setId: s.setId,
      orderInSet: s.orderInSet,
      colorOverride: s.colorOverride,
      opacity: s.opacity,
    }));
  }

  /**
   * Import stitches from a plain array (e.g. from JSON load).
   * Clears existing stitches first.
   * @param {object[]} data
   */
  importJSON(data) {
    this.clear();
    for (const d of data) {
      this.add(d);
    }
  }
}

export { StitchStore, generateId };
