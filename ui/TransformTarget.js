/**
 * TransformTarget — Interface for objects that can be transformed
 * by TransformControls (move, resize, rotate).
 *
 * Implementations:
 * - StitchTransformTarget: selected stamps in StitchStore
 * - ImageTransformTarget: the reference image overlay
 *
 * TransformControls is purely visual + interaction. The target handles
 * data mutation and undo result generation.
 */

/**
 * @typedef {Object} TransformBounds
 * @property {number} minX
 * @property {number} minY
 * @property {number} maxX
 * @property {number} maxY
 */

/**
 * @typedef {Object} TransformResult
 * @property {Array<{id: string, oldPos: {x,y}, newPos: {x,y}}>} [moves]
 * @property {Array<{id: string, oldRot: number, newRot: number}>} [rotations]
 * @property {Array<{id: string, oldScale: number, newScale: number}>} [scales]
 */

// ============================================================
// StitchTransformTarget
// ============================================================

class StitchTransformTarget {

  #store;
  #selectionManager;

  // Snapshots taken at drag start
  #startPositions = new Map();  // id → {x, y}
  #startRotations = new Map();  // id → radians
  #startScales = new Map();     // id → number

  constructor(store, selectionManager) {
    this.#store = store;
    this.#selectionManager = selectionManager;
  }

  /** @returns {TransformBounds|null} */
  getBounds() {
    const ids = this.#selectionManager.selectedArray;
    if (ids.length === 0) return null;

    const stamps = this.#store.getByIds(ids);
    if (stamps.length === 0) return null;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of stamps) {
      if (s.position.x < minX) minX = s.position.x;
      if (s.position.y < minY) minY = s.position.y;
      if (s.position.x > maxX) maxX = s.position.x;
      if (s.position.y > maxY) maxY = s.position.y;
    }

    const pad = 14;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  /**
   * Recompute bounds in the local (unrotated) frame of the group.
   * @param {number} groupRotation — current accumulated group rotation
   * @returns {TransformBounds|null}
   */
  getBoundsUnrotated(groupRotation) {
    const ids = this.#selectionManager.selectedArray;
    if (ids.length === 0) return null;

    const stamps = this.#store.getByIds(ids);
    if (stamps.length === 0) return null;

    let sumX = 0, sumY = 0;
    for (const s of stamps) { sumX += s.position.x; sumY += s.position.y; }
    const wcx = sumX / stamps.length;
    const wcy = sumY / stamps.length;

    const cos = Math.cos(-groupRotation);
    const sin = Math.sin(-groupRotation);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of stamps) {
      const dx = s.position.x - wcx;
      const dy = s.position.y - wcy;
      const lx = wcx + dx * cos - dy * sin;
      const ly = wcy + dx * sin + dy * cos;
      if (lx < minX) minX = lx;
      if (ly < minY) minY = ly;
      if (lx > maxX) maxX = lx;
      if (ly > maxY) maxY = ly;
    }

    const pad = 14;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  /** Returns true if the target has content to transform */
  isActive() {
    return this.#selectionManager.selectedArray.length > 0;
  }

  /** Snapshot state before a drag begins */
  snapshot() {
    this.#startPositions.clear();
    this.#startRotations.clear();
    this.#startScales.clear();
    for (const id of this.#selectionManager.selectedIds) {
      const s = this.#store.getById(id);
      if (s) {
        this.#startPositions.set(id, { x: s.position.x, y: s.position.y });
        this.#startRotations.set(id, s.rotation);
        this.#startScales.set(id, s.scale ?? 1);
      }
    }
  }

  applyMove(dx, dy, snapToGrid, gridSpacing) {
    const updates = [];
    for (const [id, startPos] of this.#startPositions) {
      let nx = startPos.x + dx;
      let ny = startPos.y + dy;
      if (snapToGrid) {
        nx = Math.round(nx / gridSpacing) * gridSpacing;
        ny = Math.round(ny / gridSpacing) * gridSpacing;
      }
      updates.push({ id, props: { position: { x: nx, y: ny } } });
    }
    this.#store.batchUpdate(updates);
  }

  applyRotate(deltaAngle, cx, cy) {
    const updates = [];
    for (const [id, startPos] of this.#startPositions) {
      const rx = startPos.x - cx;
      const ry = startPos.y - cy;
      const cos = Math.cos(-deltaAngle);
      const sin = Math.sin(-deltaAngle);
      const nx = cx + rx * cos - ry * sin;
      const ny = cy + rx * sin + ry * cos;

      const oldRot = this.#startRotations.get(id) || 0;
      const newRot = oldRot - deltaAngle;

      updates.push({ id, props: { position: { x: nx, y: ny }, rotation: newRot } });
    }
    this.#store.batchUpdate(updates);
  }

  applyResize(scaleFactor, anchor) {
    const updates = [];
    for (const [id, startPos] of this.#startPositions) {
      const rx = startPos.x - anchor.x;
      const ry = startPos.y - anchor.y;
      const startScale = this.#startScales.get(id) || 1;
      updates.push({
        id,
        props: {
          position: { x: anchor.x + rx * scaleFactor, y: anchor.y + ry * scaleFactor },
          scale: startScale * scaleFactor,
        }
      });
    }
    this.#store.batchUpdate(updates);
  }

  /** @returns {TransformResult} */
  getResult() {
    const moves = [];
    const rotations = [];
    const scales = [];

    for (const [id, oldPos] of this.#startPositions) {
      const s = this.#store.getById(id);
      if (!s) continue;
      moves.push({ id, oldPos, newPos: { ...s.position } });
      rotations.push({ id, oldRot: this.#startRotations.get(id) || 0, newRot: s.rotation });
      scales.push({ id, oldScale: this.#startScales.get(id) || 1, newScale: s.scale ?? 1 });
    }

    return { moves, rotations, scales };
  }
}

// ============================================================
// ImageTransformTarget
// ============================================================

class ImageTransformTarget {

  #imageOverlay;

  // Snapshot
  #startPos = null;
  #startScale = null;
  #startRotation = 0;

  constructor(imageOverlay) {
    this.#imageOverlay = imageOverlay;
  }

  /** @returns {TransformBounds|null} */
  getBounds() {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh) return null;

    const geom = mesh.geometry;
    const halfW = (geom.parameters.width * mesh.scale.x) / 2;
    const halfH = (geom.parameters.height * mesh.scale.y) / 2;
    const cx = mesh.position.x;
    const cy = mesh.position.y;

    return {
      minX: cx - halfW,
      minY: cy - halfH,
      maxX: cx + halfW,
      maxY: cy + halfH,
    };
  }

  getBoundsUnrotated(_groupRotation) {
    // Image is a single object — bounds don't change with group rotation
    return this.getBounds();
  }

  isActive() {
    return this.#imageOverlay.hasImage;
  }

  snapshot() {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh) return;
    this.#startPos = { x: mesh.position.x, y: mesh.position.y };
    this.#startScale = { x: mesh.scale.x, y: mesh.scale.y };
    this.#startRotation = mesh.rotation.z;
  }

  applyMove(dx, dy, _snapToGrid, _gridSpacing) {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh || !this.#startPos) return;
    mesh.position.x = this.#startPos.x + dx;
    mesh.position.y = this.#startPos.y + dy;
  }

  applyRotate(deltaAngle, _cx, _cy) {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh) return;
    mesh.rotation.z = this.#startRotation - deltaAngle;
  }

  applyResize(scaleFactor, anchor) {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh || !this.#startPos || !this.#startScale) return;

    const newScaleX = Math.max(0.05, this.#startScale.x * scaleFactor);
    const newScaleY = Math.max(0.05, this.#startScale.y * scaleFactor);
    mesh.scale.set(newScaleX, newScaleY, 1);

    // Reposition so the anchor corner stays fixed
    const rx = this.#startPos.x - anchor.x;
    const ry = this.#startPos.y - anchor.y;
    mesh.position.x = anchor.x + rx * scaleFactor;
    mesh.position.y = anchor.y + ry * scaleFactor;
  }

  /** @returns {TransformResult} */
  getResult() {
    const mesh = this.#imageOverlay.getImageMesh();
    if (!mesh || !this.#startPos) return { moves: [], rotations: [], scales: [] };

    const id = '__image__';
    return {
      moves: [{ id, oldPos: { ...this.#startPos }, newPos: { x: mesh.position.x, y: mesh.position.y } }],
      rotations: [{ id, oldRot: this.#startRotation, newRot: mesh.rotation.z }],
      scales: [{ id, oldScale: this.#startScale.x, newScale: mesh.scale.x }],
    };
  }

  /** @returns {import('../modules/ImageOverlay.js').ImageOverlay} */
  get imageOverlay() { return this.#imageOverlay; }
}

export { StitchTransformTarget, ImageTransformTarget };
