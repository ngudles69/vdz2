import * as THREE from 'three';

/**
 * ImageOverlay — Reference image overlay system for the Image layer.
 *
 * Handles image loading, positioning, resizing, fitting modes, blend modes,
 * and lock/unlock state. Drag/resize methods are called by Viewport pointer
 * event handling — this module does NOT own pointer events directly.
 */
class ImageOverlay {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('./LayerManager.js').LayerManager} */
  #layerManager;

  /** @type {THREE.Group} */
  #imageGroup;

  /** @type {THREE.Mesh|null} */
  #imageMesh = null;

  /** @type {THREE.Texture|null} */
  #texture = null;

  /** @type {number} */
  #naturalWidth = 0;

  /** @type {number} */
  #naturalHeight = 0;

  /** @type {boolean} */
  #isLocked = false;

  /** @type {string} */
  #blendMode = 'normal';

  /** @type {string} */
  #fitMode = 'centered';

  /** @type {THREE.OrthographicCamera|null} */
  #camera = null;

  // --- Drag state ---
  #dragStartImagePos = null;
  #dragStartPointer = null;

  // --- Resize state ---
  #resizeCorner = -1;
  #resizeStartImagePos = null;
  #resizeStartScale = null;
  #resizeStartPointer = null;
  #resizeAnchor = null;

  // --- Resize handles ---
  /** @type {THREE.Mesh[]} */
  #handles = [];
  #handleSize = 8;

  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('./LayerManager.js').LayerManager} layerManager
   */
  constructor(bus, layerManager) {
    this.#bus = bus;
    this.#layerManager = layerManager;
    this.#imageGroup = layerManager.getGroup('image');
    this.#createHandles();
  }

  #createHandles() {
    const handleGeom = new THREE.PlaneGeometry(1, 1);
    const handleMat = new THREE.MeshBasicMaterial({
      color: 0x7c5cfc,
      transparent: true,
      opacity: 0.0,
      depthTest: false,
      depthWrite: false,
    });

    for (let i = 0; i < 4; i++) {
      const handle = new THREE.Mesh(handleGeom.clone(), handleMat.clone());
      handle.renderOrder = 201;
      handle.visible = false;
      handle.userData.isImageHandle = true;
      handle.userData.handleIndex = i;
      this.#imageGroup.add(handle);
      this.#handles.push(handle);
    }
  }

  #updateHandles() {
    if (!this.#imageMesh || this.#handles.length < 4) return;

    const mesh = this.#imageMesh;
    const geom = mesh.geometry;
    const halfW = (geom.parameters.width * mesh.scale.x) / 2;
    const halfH = (geom.parameters.height * mesh.scale.y) / 2;
    const cx = mesh.position.x;
    const cy = mesh.position.y;

    const corners = [
      { x: cx - halfW, y: cy + halfH },
      { x: cx + halfW, y: cy + halfH },
      { x: cx + halfW, y: cy - halfH },
      { x: cx - halfW, y: cy - halfH },
    ];

    const hs = this.#handleSize;
    for (let i = 0; i < 4; i++) {
      this.#handles[i].position.set(corners[i].x, corners[i].y, 0);
      this.#handles[i].scale.set(hs, hs, 1);
      this.#handles[i].visible = !this.#isLocked;
    }
  }

  #showHandles(show) {
    for (const handle of this.#handles) {
      handle.visible = show && !this.#isLocked && this.#imageMesh !== null;
    }
  }

  #applyFit() {
    if (!this.#imageMesh) return;

    const geom = this.#imageMesh.geometry;
    const baseW = geom.parameters.width;
    const baseH = geom.parameters.height;

    switch (this.#fitMode) {
      case 'centered': {
        const scale = (this.#naturalWidth * 0.5) / baseW;
        this.#imageMesh.scale.set(scale, scale, 1);
        this.#imageMesh.position.set(0, 0, 0);
        break;
      }

      case 'canvasView': {
        if (!this.#camera) return;
        const cam = this.#camera;
        const viewW = (cam.right - cam.left) / cam.zoom;
        const viewH = (cam.top - cam.bottom) / cam.zoom;

        const scaleX = viewW / baseW;
        const scaleY = viewH / baseH;
        const scale = Math.min(scaleX, scaleY);
        this.#imageMesh.scale.set(scale, scale, 1);

        this.#imageMesh.position.set(cam.position.x, cam.position.y, 0);
        break;
      }
    }

    this.#updateHandles();
  }

  #applyBlendMode() {
    if (!this.#imageMesh) return;
    const mat = this.#imageMesh.material;

    switch (this.#blendMode) {
      case 'normal':
        mat.blending = THREE.NormalBlending;
        break;

      case 'multiply':
        mat.blending = THREE.MultiplyBlending;
        break;

      case 'screen':
        mat.blending = THREE.CustomBlending;
        mat.blendEquation = THREE.AddEquation;
        mat.blendSrc = THREE.OneFactor;
        mat.blendDst = THREE.OneMinusSrcColorFactor;
        break;
    }

    mat.needsUpdate = true;
  }

  #disposeMesh(mesh) {
    if (!mesh) return;
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.dispose();
    }
  }

  // ---- Public API ----

  async loadImage(file) {
    const url = URL.createObjectURL(file);

    try {
      const texture = await new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(url, resolve, undefined, reject);
      });

      const img = texture.image;
      this.#naturalWidth = img.width;
      this.#naturalHeight = img.height;

      if (this.#imageMesh) {
        this.#imageGroup.remove(this.#imageMesh);
        this.#disposeMesh(this.#imageMesh);
        this.#imageMesh = null;
        this.#texture = null;
      }

      const aspect = img.width / img.height;
      const height = 200;
      const width = height * aspect;

      texture.colorSpace = THREE.SRGBColorSpace;

      const geometry = new THREE.PlaneGeometry(width, height);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 200;
      mesh.userData.isImageOverlay = true;

      this.#imageGroup.add(mesh);
      this.#imageMesh = mesh;
      this.#texture = texture;

      this.#applyBlendMode();
      this.#applyFit();
      this.#showHandles(true);

      this.#bus.emit('image:loaded', {
        width: img.width,
        height: img.height,
      });

    } finally {
      URL.revokeObjectURL(url);
    }
  }

  setFitMode(mode) {
    if (!['centered', 'canvasView'].includes(mode)) return;
    this.#fitMode = mode;
    this.#applyFit();
    this.#bus.emit('image:fit-changed', { mode });
  }

  setBlendMode(mode) {
    if (!['normal', 'multiply', 'screen'].includes(mode)) return;
    this.#blendMode = mode;
    this.#applyBlendMode();
    this.#bus.emit('image:blend-changed', { mode });
  }

  setLocked(locked) {
    this.#isLocked = !!locked;
    this.#showHandles(!locked);
    this.#bus.emit('image:lock-changed', { locked: this.#isLocked });
  }

  get isLocked()  { return this.#isLocked; }
  get blendMode() { return this.#blendMode; }
  get fitMode()   { return this.#fitMode; }
  get hasImage()  { return this.#imageMesh !== null; }

  removeImage() {
    if (this.#imageMesh) {
      this.#imageGroup.remove(this.#imageMesh);
      this.#disposeMesh(this.#imageMesh);
      this.#imageMesh = null;
      this.#texture = null;
      this.#naturalWidth = 0;
      this.#naturalHeight = 0;
    }
    this.#showHandles(false);
    this.#bus.emit('image:removed', null);
  }

  getImageMesh() { return this.#imageMesh; }
  getHandles()   { return this.#handles; }

  setCamera(camera) {
    this.#camera = camera;
  }

  // ---- Drag support ----

  startDrag(worldPoint) {
    if (!this.#imageMesh || this.#isLocked) return;
    this.#dragStartImagePos = {
      x: this.#imageMesh.position.x,
      y: this.#imageMesh.position.y,
    };
    this.#dragStartPointer = { x: worldPoint.x, y: worldPoint.y };
  }

  updateDrag(worldPoint) {
    if (!this.#imageMesh || !this.#dragStartImagePos || !this.#dragStartPointer) return;
    const dx = worldPoint.x - this.#dragStartPointer.x;
    const dy = worldPoint.y - this.#dragStartPointer.y;
    this.#imageMesh.position.x = this.#dragStartImagePos.x + dx;
    this.#imageMesh.position.y = this.#dragStartImagePos.y + dy;
    this.#updateHandles();
  }

  endDrag() {
    this.#dragStartImagePos = null;
    this.#dragStartPointer = null;
  }

  // ---- Resize support ----

  startResize(cornerIndex, worldPoint) {
    if (!this.#imageMesh || this.#isLocked) return;
    this.#resizeCorner = cornerIndex;
    this.#resizeStartImagePos = {
      x: this.#imageMesh.position.x,
      y: this.#imageMesh.position.y,
    };
    this.#resizeStartScale = {
      sx: this.#imageMesh.scale.x,
      sy: this.#imageMesh.scale.y,
    };
    this.#resizeStartPointer = { x: worldPoint.x, y: worldPoint.y };

    const geom = this.#imageMesh.geometry;
    const halfW = (geom.parameters.width * this.#imageMesh.scale.x) / 2;
    const halfH = (geom.parameters.height * this.#imageMesh.scale.y) / 2;
    const cx = this.#imageMesh.position.x;
    const cy = this.#imageMesh.position.y;

    const oppositeIdx = (cornerIndex + 2) % 4;
    const corners = [
      { x: cx - halfW, y: cy + halfH },
      { x: cx + halfW, y: cy + halfH },
      { x: cx + halfW, y: cy - halfH },
      { x: cx - halfW, y: cy - halfH },
    ];
    this.#resizeAnchor = corners[oppositeIdx];
  }

  updateResize(worldPoint) {
    if (!this.#imageMesh || !this.#resizeAnchor || !this.#resizeStartPointer || !this.#resizeStartScale) return;

    const startDist = Math.sqrt(
      (this.#resizeStartPointer.x - this.#resizeAnchor.x) ** 2 +
      (this.#resizeStartPointer.y - this.#resizeAnchor.y) ** 2
    );
    const currentDist = Math.sqrt(
      (worldPoint.x - this.#resizeAnchor.x) ** 2 +
      (worldPoint.y - this.#resizeAnchor.y) ** 2
    );

    if (startDist < 0.001) return;

    const ratio = currentDist / startDist;
    const minScale = 0.05;
    const newScaleX = Math.max(minScale, this.#resizeStartScale.sx * ratio);
    const newScaleY = Math.max(minScale, this.#resizeStartScale.sy * ratio);

    this.#imageMesh.scale.set(newScaleX, newScaleY, 1);

    const geom = this.#imageMesh.geometry;
    const halfW = (geom.parameters.width * newScaleX) / 2;
    const halfH = (geom.parameters.height * newScaleY) / 2;

    const anchorCornerIdx = (this.#resizeCorner + 2) % 4;
    let cx, cy;
    switch (anchorCornerIdx) {
      case 0: cx = this.#resizeAnchor.x + halfW; cy = this.#resizeAnchor.y - halfH; break;
      case 1: cx = this.#resizeAnchor.x - halfW; cy = this.#resizeAnchor.y - halfH; break;
      case 2: cx = this.#resizeAnchor.x - halfW; cy = this.#resizeAnchor.y + halfH; break;
      case 3: cx = this.#resizeAnchor.x + halfW; cy = this.#resizeAnchor.y + halfH; break;
    }

    this.#imageMesh.position.set(cx, cy, 0);
    this.#updateHandles();
  }

  endResize() {
    this.#resizeCorner = -1;
    this.#resizeStartImagePos = null;
    this.#resizeStartScale = null;
    this.#resizeStartPointer = null;
    this.#resizeAnchor = null;
  }
}

export { ImageOverlay };
