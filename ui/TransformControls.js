import * as THREE from 'three';

/**
 * TransformControls — PowerPoint-style transform handles.
 *
 * Generic: works with any TransformTarget (stitches, image, future objects).
 * Renders a bounding box with corner resize handles and a rotation handle.
 * Delegates data mutation to the active TransformTarget.
 *
 * ○ ← rotation handle
 * |
 * ●---------●
 * |         |
 * | content |
 * |         |
 * ●---------●
 */
class TransformControls {

  #bus;
  #scene;
  #camera;

  /** @type {import('./TransformTarget.js').StitchTransformTarget|import('./TransformTarget.js').ImageTransformTarget|null} */
  #target = null;

  /** @type {THREE.Group} Container for all transform UI */
  #group = new THREE.Group();

  // Scene objects
  #border = null;       // LineLoop for bounding box
  #handles = [];        // 4 corner handle meshes
  #rotHandle = null;    // rotation handle sprite
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
  #dragStartGroupRotation = 0;

  /** @type {number} Current camera zoom (for handle scaling) */
  #zoom = 1;

  constructor(bus, scene, camera) {
    this.#bus = bus;
    this.#scene = scene;
    this.#camera = camera;

    this.#group.renderOrder = 900;
    this.#group.visible = false;
    this.#scene.add(this.#group);

    this.#createMaterials();
    this.#createObjects();

    bus.on('camera:zoom-changed', ({ zoom }) => {
      this.#zoom = zoom;
      if (this.#visible) this.#updateLayout();
    });

    this.#zoom = camera.zoom;
  }

  // ---- Target management ----

  /**
   * Set the active transform target and show handles.
   * @param {import('./TransformTarget.js').StitchTransformTarget|import('./TransformTarget.js').ImageTransformTarget} target
   */
  setTarget(target) {
    this.#target = target;
    this.#groupRotation = 0;
    this.#refreshBounds();
  }

  /** Clear the target and hide handles. */
  clearTarget() {
    this.#target = null;
    this.#visible = false;
    this.#group.visible = false;
    this.#bounds = null;
  }

  /** @returns {import('./TransformTarget.js').StitchTransformTarget|import('./TransformTarget.js').ImageTransformTarget|null} */
  get target() { return this.#target; }

  /** Refresh bounds from the current target (e.g. after selection changes). */
  refreshBounds() {
    this.#groupRotation = 0;
    this.#refreshBounds();
  }

  /** Refresh bounds preserving current group rotation. */
  refreshBoundsPreserveRotation() {
    this.#refreshBoundsPreserveRotation();
  }

  // ---- Materials & objects ----

  #createMaterials() {
    this.#handleGeom = new THREE.CircleGeometry(1, 16);
    this.#rotHandleGeom = new THREE.CircleGeometry(1, 16);

    this.#handleMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      depthTest: false,
      depthWrite: false,
    });
    this.#handleMatHover = new THREE.MeshBasicMaterial({
      color: 0xff69b4,
      depthTest: false,
      depthWrite: false,
    });
    this.#borderMat = new THREE.LineDashedMaterial({
      color: 0xff69b4,
      transparent: true,
      opacity: 0.6,
      depthTest: false,
      dashSize: 4,
      gapSize: 3,
    });
    this.#rotLineMat = new THREE.LineBasicMaterial({
      color: 0xff69b4,
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

    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI * 0.15, Math.PI * 1.55);
    ctx.stroke();

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

  // ---- Bounds computation ----

  #refreshBounds() {
    if (!this.#target || !this.#target.isActive()) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    const raw = this.#target.getBounds();
    if (!raw) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    this.#bounds = {
      ...raw,
      cx: (raw.minX + raw.maxX) / 2,
      cy: (raw.minY + raw.maxY) / 2,
    };

    this.#visible = true;
    this.#group.visible = true;
    this.#updateLayout();
  }

  #refreshBoundsPreserveRotation() {
    if (!this.#target || !this.#target.isActive()) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    const raw = this.#target.getBoundsUnrotated(this.#groupRotation);
    if (!raw) {
      this.#visible = false;
      this.#group.visible = false;
      return;
    }

    this.#bounds = {
      ...raw,
      cx: (raw.minX + raw.maxX) / 2,
      cy: (raw.minY + raw.maxY) / 2,
    };

    this.#visible = true;
    this.#group.visible = true;
    this.#updateLayout();
  }

  // ---- Layout ----

  #updateLayout() {
    if (!this.#bounds) return;
    const { minX, minY, maxX, maxY, cx, cy } = this.#bounds;

    this.#group.position.set(cx, cy, 0);
    this.#group.rotation.set(0, 0, this.#groupRotation);

    const lMinX = minX - cx;
    const lMinY = minY - cy;
    const lMaxX = maxX - cx;
    const lMaxY = maxY - cy;

    const s = this.#handleSize / this.#zoom;
    const rotOff = this.#rotHandleOffset / this.#zoom;

    // Border
    const pos = this.#border.geometry.getAttribute('position');
    pos.setXYZ(0, lMinX, lMinY, 0);
    pos.setXYZ(1, lMaxX, lMinY, 0);
    pos.setXYZ(2, lMaxX, lMaxY, 0);
    pos.setXYZ(3, lMinX, lMaxY, 0);
    pos.setXYZ(4, lMinX, lMinY, 0);
    pos.needsUpdate = true;
    this.#border.computeLineDistances();

    // Corner handles: BL, BR, TR, TL
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

    // Rotation line + handle (hidden if target doesn't support rotation)
    const showRotation = this.#target?.canRotate ?? true;
    this.#rotLine.visible = showRotation;
    this.#rotHandle.visible = showRotation;

    if (showRotation) {
      const topLx = (lMinX + lMaxX) / 2;
      const topLy = lMaxY;
      const rlPos = this.#rotLine.geometry.getAttribute('position');
      rlPos.setXYZ(0, topLx, topLy, 0);
      rlPos.setXYZ(1, topLx, topLy + rotOff, 0);
      rlPos.needsUpdate = true;

      const rs = s * 3;
      this.#rotHandle.position.set(topLx, topLy + rotOff, 0);
      this.#rotHandle.scale.set(rs, rs, 1);
    }
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

    const cos = Math.cos(-this.#groupRotation);
    const sin = Math.sin(-this.#groupRotation);
    const dx = wp.x - cx;
    const dy = wp.y - cy;
    const lx = cx + dx * cos - dy * sin;
    const ly = cy + dx * sin + dy * cos;

    const s = (this.#handleSize * 1.5) / this.#zoom;
    const rotOff = this.#rotHandleOffset / this.#zoom;

    // Rotation handle (only if target supports rotation)
    if (this.#target?.canRotate ?? true) {
      const rotX = (minX + maxX) / 2;
      const rotY = maxY + rotOff;
      if (Math.abs(lx - rotX) < s * 2 && Math.abs(ly - rotY) < s * 2) {
        return 'rotate';
      }
    }

    // Corner handles
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

    // Inside bounding box (move)
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
    if (!this.#target) return;

    this.#activeHandle = handleType;
    this.#dragStart = { ...wp };
    this.#dragStartBounds = { ...this.#bounds };
    this.#dragStartGroupRotation = this.#groupRotation;

    // Tell the target to snapshot its current state
    this.#target.snapshot();
  }

  /**
   * Update a transform drag.
   * @param {{ x: number, y: number }} wp - current world point
   * @param {boolean} [snapToGrid=false]
   * @param {number} [gridSpacing=20]
   */
  updateDrag(wp, snapToGrid = false, gridSpacing = 20) {
    if (!this.#activeHandle || !this.#dragStart || !this.#target) return;

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
   * @returns {import('./TransformTarget.js').TransformResult|null}
   */
  endDrag() {
    if (!this.#activeHandle || !this.#target) return null;

    const result = this.#target.getResult();

    this.#activeHandle = null;
    this.#dragStart = null;
    this.#dragStartBounds = null;

    return result;
  }

  /** @returns {boolean} Whether a drag is in progress */
  get isDragging() { return this.#activeHandle !== null; }

  /** @returns {boolean} Whether controls are visible */
  get visible() { return this.#visible; }

  // ---- Apply transforms (delegates to target) ----

  #applyMove(dx, dy, snapToGrid, gridSpacing) {
    this.#target.applyMove(dx, dy, snapToGrid, gridSpacing);

    // Move the bounding box with the drag
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

    const curAngle = Math.atan2(wp.x - cx, wp.y - cy);
    const startAngle = Math.atan2(this.#dragStart.x - cx, this.#dragStart.y - cy);
    const deltaAngle = curAngle - startAngle;

    this.#groupRotation = this.#dragStartGroupRotation - deltaAngle;
    this.#group.rotation.set(0, 0, this.#groupRotation);

    this.#target.applyRotate(deltaAngle, cx, cy);
  }

  #applyResize(wp) {
    const cornerIdx = parseInt(this.#activeHandle.split('-')[1]);
    const b = this.#dragStartBounds;

    const anchors = [
      { x: b.maxX, y: b.maxY },
      { x: b.minX, y: b.maxY },
      { x: b.minX, y: b.minY },
      { x: b.maxX, y: b.minY },
    ];
    const anchor = anchors[cornerIdx];

    const origW = b.maxX - b.minX;
    const origH = b.maxY - b.minY;
    if (origW < 1 || origH < 1) return;

    const newW = Math.abs(wp.x - anchor.x);
    const newH = Math.abs(wp.y - anchor.y);
    const scaleFactor = Math.max(0.1, Math.min(newW / origW, newH / origH));

    this.#target.applyResize(scaleFactor, anchor);

    // Update bounds to follow the resize
    const sw = origW * scaleFactor;
    const sh = origH * scaleFactor;
    const newMinX = anchor.x < b.cx ? anchor.x : anchor.x - sw;
    const newMinY = anchor.y < b.cy ? anchor.y : anchor.y - sh;
    this.#bounds = {
      minX: newMinX,
      minY: newMinY,
      maxX: newMinX + sw,
      maxY: newMinY + sh,
      cx: newMinX + sw / 2,
      cy: newMinY + sh / 2,
    };
    this.#updateLayout();
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
      return (i === 0 || i === 2) ? 'nesw-resize' : 'nwse-resize';
    }
    return 'default';
  }

  /** Update all handle/border colors to match selection color. */
  setSelectionColor(color) {
    this.#borderMat.color.set(color);
    this.#rotLineMat.color.set(color);
    for (const h of this.#handles) h.material.color.set(color);
  }
}

export { TransformControls };
