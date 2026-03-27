import * as THREE from 'three';

/**
 * TransformControls — PowerPoint-style transform handles for selected stamps.
 *
 * Renders a bounding box with corner resize handles and a rotation handle
 * above the selection. Handles move, proportional resize, and rotation
 * interactions.
 *
 * ○ ← rotation handle
 * |
 * ●---------●
 * |         |
 * | stamps  |
 * |         |
 * ●---------●
 */
class TransformControls {

  #bus;
  #store;
  #selectionManager;
  #scene;
  #camera;

  /** @type {THREE.Group} Container for all transform UI */
  #group = new THREE.Group();

  // Scene objects
  #border = null;       // LineSegments for bounding box
  #handles = [];        // 4 corner handle meshes
  #rotHandle = null;    // rotation handle mesh
  #rotLine = null;      // line from top edge to rotation handle

  // Geometry/materials (shared)
  #handleGeom;
  #handleMat;
  #handleMatHover;
  #rotHandleGeom;
  #borderMat;
  #rotLineMat;

  // State
  #bounds = null;       // { minX, minY, maxX, maxY, cx, cy } in local (unrotated) space
  #visible = false;
  #handleSize = 3;      // world units, will scale with zoom
  #rotHandleOffset = 16; // distance above top edge
  #groupRotation = 0;   // accumulated rotation in radians

  // Interaction state
  #activeHandle = null;  // 'move' | 'resize-0'..'resize-3' | 'rotate' | null
  #dragStart = null;     // { x, y } world
  #dragStartBounds = null;
  #dragStartPositions = null; // Map<id, {x,y}>
  #dragStartRotations = null; // Map<id, rotation>
  #dragStartScales = null;    // Map<id, scale>
  #dragStartGroupRotation = 0; // group rotation at drag start

  /** @type {number} Current camera zoom (for handle scaling) */
  #zoom = 1;

  constructor(bus, store, selectionManager, scene, camera) {
    this.#bus = bus;
    this.#store = store;
    this.#selectionManager = selectionManager;
    this.#scene = scene;
    this.#camera = camera;

    this.#group.renderOrder = 900;
    this.#group.visible = false;
    this.#scene.add(this.#group);

    this.#createMaterials();
    this.#createObjects();

    // Update on selection change — reset rotation
    bus.on('selection:changed', () => {
      this.#groupRotation = 0;
      this.#updateFromSelection();
    });
    // Store updates: only re-layout (handle zoom scaling), never recalculate bounds
    // Bounds are frozen from the moment of selection until deselect
    bus.on('stitch-store:removed', ({ stitch }) => {
      // If a selected stitch is removed, refresh selection
      if (this.#visible && selectionManager.isSelected(stitch.id)) {
        this.#updateFromSelection();
      }
    });
    bus.on('camera:zoom-changed', ({ zoom }) => {
      this.#zoom = zoom;
      if (this.#visible) this.#updateLayout();
    });

    this.#zoom = camera.zoom;
  }

  #createMaterials() {
    this.#handleGeom = new THREE.CircleGeometry(1, 16);
    this.#rotHandleGeom = new THREE.CircleGeometry(1, 16);

    this.#handleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
    this.#handleMatHover = new THREE.MeshBasicMaterial({
      color: 0x7c5cfc,
      depthTest: false,
      depthWrite: false,
    });
    this.#borderMat = new THREE.LineDashedMaterial({
      color: 0x7c5cfc,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      dashSize: 4,
      gapSize: 3,
    });
    this.#rotLineMat = new THREE.LineBasicMaterial({
      color: 0x7c5cfc,
      transparent: true,
      opacity: 0.4,
      depthTest: false,
    });
  }

  #createObjects() {
    // Border (dashed rect — positions updated dynamically)
    const borderGeom = new THREE.BufferGeometry();
    borderGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(5 * 3), 3));
    this.#border = new THREE.LineLoop(borderGeom, this.#borderMat);
    this.#border.computeLineDistances();
    this.#border.renderOrder = 900;
    this.#group.add(this.#border);

    // 4 corner handles
    for (let i = 0; i < 4; i++) {
      const handle = new THREE.Mesh(this.#handleGeom, this.#handleMat.clone());
      handle.renderOrder = 901;
      handle.userData.handleType = `resize-${i}`;
      this.#handles.push(handle);
      this.#group.add(handle);
    }

    // Rotation line
    const rotLineGeom = new THREE.BufferGeometry();
    rotLineGeom.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(2 * 3), 3));
    this.#rotLine = new THREE.Line(rotLineGeom, this.#rotLineMat);
    this.#rotLine.renderOrder = 900;
    this.#group.add(this.#rotLine);

    // Rotation handle — circular arrow sprite
    const rotTexture = this.#createRotationIconTexture();
    const rotSpriteMat = new THREE.SpriteMaterial({
      map: rotTexture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });
    this.#rotHandle = new THREE.Sprite(rotSpriteMat);
    this.#rotHandle.renderOrder = 901;
    this.#rotHandle.userData.handleType = 'rotate';
    this.#group.add(this.#rotHandle);
  }

  /**
   * Recalculate bounds while preserving the current group rotation.
   * Positions are un-rotated back to the group's local frame before
   * computing the axis-aligned box, so the box dimensions stay stable.
   */
  #updateBoundsPreserveRotation() {
    const ids = this.#selectionManager.selectedArray;
    if (ids.length === 0) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    const stamps = this.#store.getByIds(ids);
    if (stamps.length === 0) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    // Compute center of all current positions
    let sumX = 0, sumY = 0;
    for (const s of stamps) { sumX += s.position.x; sumY += s.position.y; }
    const wcx = sumX / stamps.length;
    const wcy = sumY / stamps.length;

    // Un-rotate positions around the center by -groupRotation to get local-frame positions
    const cos = Math.cos(-this.#groupRotation);
    const sin = Math.sin(-this.#groupRotation);

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
    minX -= pad; minY -= pad; maxX += pad; maxY += pad;

    this.#bounds = {
      minX, minY, maxX, maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };

    this.#visible = true;
    this.#group.visible = true;
    this.#updateLayout();
  }

  // ---- Rotation icon texture ----

  #createRotationIconTexture() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.32;

    ctx.clearRect(0, 0, size, size);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Arc (270 degrees, leaving a gap at top-right for the arrow)
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.15, Math.PI * 1.55);
    ctx.stroke();

    // Arrowhead at the end of the arc
    const arrowAngle = -Math.PI * 0.15;
    const ax = cx + Math.cos(arrowAngle) * r;
    const ay = cy + Math.sin(arrowAngle) * r;
    const aSize = 7;
    ctx.beginPath();
    ctx.moveTo(ax + aSize, ay - aSize * 0.3);
    ctx.lineTo(ax, ay);
    ctx.lineTo(ax + aSize * 0.3, ay + aSize);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  // ---- Selection → bounds ----

  #updateFromSelection() {
    const ids = this.#selectionManager.selectedArray;
    if (ids.length === 0) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    const stamps = this.#store.getByIds(ids);
    if (stamps.length === 0) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    // Compute bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of stamps) {
      if (s.position.x < minX) minX = s.position.x;
      if (s.position.y < minY) minY = s.position.y;
      if (s.position.x > maxX) maxX = s.position.x;
      if (s.position.y > maxY) maxY = s.position.y;
    }

    // Add padding around single stitch
    const pad = 14;
    minX -= pad;
    minY -= pad;
    maxX += pad;
    maxY += pad;

    this.#bounds = {
      minX, minY, maxX, maxY,
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
    };

    this.#visible = true;
    this.#group.visible = true;
    this.#updateLayout();
  }

  #updateLayout() {
    if (!this.#bounds) return;
    const { minX, minY, maxX, maxY, cx, cy } = this.#bounds;

    // Apply group rotation around center
    this.#group.position.set(cx, cy, 0);
    this.#group.rotation.set(0, 0, this.#groupRotation);

    // All child positions are now relative to (cx, cy)
    const lMinX = minX - cx;
    const lMinY = minY - cy;
    const lMaxX = maxX - cx;
    const lMaxY = maxY - cy;

    // Scale handles inversely with zoom so they stay the same screen size
    const s = this.#handleSize / this.#zoom;
    const rotOff = this.#rotHandleOffset / this.#zoom;

    // Border (local coords)
    const pos = this.#border.geometry.getAttribute('position');
    pos.setXYZ(0, lMinX, lMinY, 0);
    pos.setXYZ(1, lMaxX, lMinY, 0);
    pos.setXYZ(2, lMaxX, lMaxY, 0);
    pos.setXYZ(3, lMinX, lMaxY, 0);
    pos.setXYZ(4, lMinX, lMinY, 0);
    pos.needsUpdate = true;
    this.#border.computeLineDistances();

    // Corner handles: BL, BR, TR, TL (local coords)
    const corners = [
      [lMinX, lMinY],
      [lMaxX, lMinY],
      [lMaxX, lMaxY],
      [lMinX, lMaxY],
    ];
    for (let i = 0; i < 4; i++) {
      this.#handles[i].position.set(corners[i][0], corners[i][1], 0);
      this.#handles[i].scale.set(s, s, 1);
    }

    // Rotation line (from local top center upward)
    const topLx = (lMinX + lMaxX) / 2;
    const topLy = lMaxY;
    const rlPos = this.#rotLine.geometry.getAttribute('position');
    rlPos.setXYZ(0, topLx, topLy, 0);
    rlPos.setXYZ(1, topLx, topLy + rotOff, 0);
    rlPos.needsUpdate = true;

    // Rotation handle (sprite — slightly larger than corner dots)
    const rs = s * 3;
    this.#rotHandle.position.set(topLx, topLy + rotOff, 0);
    this.#rotHandle.scale.set(rs, rs, 1);
  }

  // ---- Hit testing ----

  /**
   * Test if a world point hits a transform handle.
   * @param {{ x: number, y: number }} wp
   * @returns {string|null} 'move' | 'resize-0'..'resize-3' | 'rotate' | null
   */
  hitTest(wp) {
    if (!this.#visible || !this.#bounds) return null;

    const { cx, cy, minX, minY, maxX, maxY } = this.#bounds;

    // Transform world point into group local space (undo group rotation around center)
    const cos = Math.cos(-this.#groupRotation);
    const sin = Math.sin(-this.#groupRotation);
    const dx = wp.x - cx;
    const dy = wp.y - cy;
    const lx = cx + dx * cos - dy * sin;
    const ly = cy + dx * sin + dy * cos;

    const s = (this.#handleSize * 1.5) / this.#zoom;
    const rotOff = this.#rotHandleOffset / this.#zoom;

    // Check rotation handle first
    const rotX = (minX + maxX) / 2;
    const rotY = maxY + rotOff;
    if (Math.abs(lx - rotX) < s * 2 && Math.abs(ly - rotY) < s * 2) {
      return 'rotate';
    }

    // Check corner handles
    const corners = [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
    ];
    for (let i = 0; i < 4; i++) {
      if (Math.abs(lx - corners[i][0]) < s && Math.abs(ly - corners[i][1]) < s) {
        return `resize-${i}`;
      }
    }

    // Check inside bounding box (move)
    if (lx >= minX && lx <= maxX && ly >= minY && ly <= maxY) {
      return 'move';
    }

    return null;
  }

  // ---- Drag interactions ----

  /**
   * Start a transform drag.
   * @param {string} handleType - from hitTest
   * @param {{ x: number, y: number }} wp - world point
   */
  startDrag(handleType, wp) {
    this.#activeHandle = handleType;
    this.#dragStart = { ...wp };
    this.#dragStartBounds = { ...this.#bounds };
    this.#dragStartGroupRotation = this.#groupRotation;

    // Snapshot positions, rotations, and scales
    this.#dragStartPositions = new Map();
    this.#dragStartRotations = new Map();
    this.#dragStartScales = new Map();
    for (const id of this.#selectionManager.selectedIds) {
      const s = this.#store.getById(id);
      if (s) {
        this.#dragStartPositions.set(id, { x: s.position.x, y: s.position.y });
        this.#dragStartRotations.set(id, s.rotation);
        this.#dragStartScales.set(id, s.scale ?? 1);
      }
    }
  }

  /**
   * Update a transform drag.
   * @param {{ x: number, y: number }} wp - current world point
   * @param {boolean} [snapToGrid=false]
   * @param {number} [gridSpacing=20]
   */
  updateDrag(wp, snapToGrid = false, gridSpacing = 20) {
    if (!this.#activeHandle || !this.#dragStart) return;

    const dx = wp.x - this.#dragStart.x;
    const dy = wp.y - this.#dragStart.y;

    switch (this.#activeHandle) {
      case 'move':
        this.#applyMove(dx, dy, snapToGrid, gridSpacing);
        break;
      case 'rotate':
        this.#applyRotate(wp);
        break;
      default:
        if (this.#activeHandle.startsWith('resize-')) {
          this.#applyResize(wp);
        }
        break;
    }
  }

  /**
   * End a transform drag.
   * @returns {{ type: string, moves?: Array, rotations?: Array }|null} Data for creating undo command
   */
  endDrag() {
    if (!this.#activeHandle) return null;

    const result = { type: this.#activeHandle };

    if (this.#activeHandle === 'move' || this.#activeHandle.startsWith('resize-')) {
      // Collect move data
      const moves = [];
      for (const [id, oldPos] of this.#dragStartPositions) {
        const s = this.#store.getById(id);
        if (s) {
          moves.push({ id, oldPos, newPos: { ...s.position } });
        }
      }
      result.moves = moves;
    }

    if (this.#activeHandle === 'rotate') {
      const rotations = [];
      for (const [id, oldRot] of this.#dragStartRotations) {
        const s = this.#store.getById(id);
        if (s) {
          rotations.push({ id, oldRot, newRot: s.rotation });
        }
      }
      result.rotations = rotations;
    }

    if (this.#activeHandle.startsWith('resize-')) {
      // Resize changes positions and scales
      const moves = [];
      const scales = [];
      for (const [id, oldPos] of this.#dragStartPositions) {
        const s = this.#store.getById(id);
        if (s) {
          moves.push({ id, oldPos, newPos: { ...s.position } });
          scales.push({ id, oldScale: this.#dragStartScales.get(id) || 1, newScale: s.scale ?? 1 });
        }
      }
      result.moves = moves;
      result.scales = scales;
    }

    if (this.#activeHandle === 'rotate') {
      // Rotation also moves positions
      const moves = [];
      for (const [id, oldPos] of this.#dragStartPositions) {
        const s = this.#store.getById(id);
        if (s) moves.push({ id, oldPos, newPos: { ...s.position } });
      }
      result.moves = moves;
    }

    this.#activeHandle = null;
    this.#dragStart = null;
    this.#dragStartBounds = null;
    this.#dragStartPositions = null;
    this.#dragStartRotations = null;
    this.#dragStartScales = null;

    return result;
  }

  /** @returns {boolean} Whether a drag is in progress */
  get isDragging() { return this.#activeHandle !== null; }

  /** @returns {boolean} Whether controls are visible */
  get visible() { return this.#visible; }

  // ---- Apply transforms ----

  #applyMove(dx, dy, snapToGrid, gridSpacing) {
    const updates = [];
    for (const [id, startPos] of this.#dragStartPositions) {
      let nx = startPos.x + dx;
      let ny = startPos.y + dy;
      if (snapToGrid) {
        nx = Math.round(nx / gridSpacing) * gridSpacing;
        ny = Math.round(ny / gridSpacing) * gridSpacing;
      }
      updates.push({ id, props: { position: { x: nx, y: ny } } });
    }
    this.#store.batchUpdate(updates);

    // Move the bounding box center with the drag
    this.#bounds.cx = this.#dragStartBounds.cx + dx;
    this.#bounds.cy = this.#dragStartBounds.cy + dy;
    this.#bounds.minX = this.#dragStartBounds.minX + dx;
    this.#bounds.minY = this.#dragStartBounds.minY + dy;
    this.#bounds.maxX = this.#dragStartBounds.maxX + dx;
    this.#bounds.maxY = this.#dragStartBounds.maxY + dy;
    this.#updateLayout();
  }

  #applyRotate(wp) {
    const cx = this.#dragStartBounds.cx;
    const cy = this.#dragStartBounds.cy;

    // Angle from center to current point
    const curAngle = Math.atan2(wp.x - cx, wp.y - cy);
    // Angle from center to start point
    const startAngle = Math.atan2(this.#dragStart.x - cx, this.#dragStart.y - cy);
    const deltaAngle = curAngle - startAngle;

    // Update group rotation so the box visually rotates
    this.#groupRotation = this.#dragStartGroupRotation - deltaAngle;
    this.#group.rotation.set(0, 0, this.#groupRotation);

    const updates = [];
    for (const [id, startPos] of this.#dragStartPositions) {
      // Rotate position around center
      const rx = startPos.x - cx;
      const ry = startPos.y - cy;
      const cos = Math.cos(-deltaAngle);
      const sin = Math.sin(-deltaAngle);
      const nx = cx + rx * cos - ry * sin;
      const ny = cy + rx * sin + ry * cos;

      // Add delta to rotation
      const oldRot = this.#dragStartRotations.get(id) || 0;
      const newRot = oldRot - deltaAngle;

      updates.push({ id, props: { position: { x: nx, y: ny }, rotation: newRot } });
    }
    this.#store.batchUpdate(updates);
  }

  #applyResize(wp) {
    const cornerIdx = parseInt(this.#activeHandle.split('-')[1]);
    const b = this.#dragStartBounds;

    // Anchor is the opposite corner
    const anchors = [
      { x: b.maxX, y: b.maxY }, // opposite of BL(0) is TR(2)
      { x: b.minX, y: b.maxY }, // opposite of BR(1) is TL(3)
      { x: b.minX, y: b.minY }, // opposite of TR(2) is BL(0)
      { x: b.maxX, y: b.minY }, // opposite of TL(3) is BR(1)
    ];
    const anchor = anchors[cornerIdx];

    // Scale factor based on distance from anchor
    const origW = b.maxX - b.minX;
    const origH = b.maxY - b.minY;
    if (origW < 1 || origH < 1) return;

    const newW = Math.abs(wp.x - anchor.x);
    const newH = Math.abs(wp.y - anchor.y);
    const scaleFactor = Math.max(0.1, Math.min(newW / origW, newH / origH));

    // Scale positions relative to anchor AND scale each stitch's individual scale
    const updates = [];
    for (const [id, startPos] of this.#dragStartPositions) {
      const rx = startPos.x - anchor.x;
      const ry = startPos.y - anchor.y;
      const startScale = this.#dragStartScales.get(id) || 1;
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

  /**
   * Get cursor style for a handle type.
   * @param {string|null} handleType
   * @returns {string}
   */
  getCursor(handleType) {
    if (!handleType) return 'default';
    if (handleType === 'move') return 'move';
    if (handleType === 'rotate') return 'grab';
    if (handleType.startsWith('resize-')) {
      const i = parseInt(handleType.split('-')[1]);
      return (i === 0 || i === 2) ? 'nwse-resize' : 'nesw-resize';
    }
    return 'default';
  }
}

export { TransformControls };
