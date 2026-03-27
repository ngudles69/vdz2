import * as THREE from 'three';

/**
 * ImageOverlay — Reference image overlay system for the Image layer.
 *
 * Handles image loading, fitting modes, blend modes, and lock/unlock state.
 * Transform interactions (move, resize, rotate) are handled by TransformControls
 * via ImageTransformTarget — this module owns the mesh but not the interaction.
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

  /**
   * @param {import('../core/EventBus.js').EventBus} bus
   * @param {import('./LayerManager.js').LayerManager} layerManager
   */
  constructor(bus, layerManager) {
    this.#bus = bus;
    this.#layerManager = layerManager;
    this.#imageGroup = layerManager.getGroup('image');
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
    this.#bus.emit('image:lock-changed', { locked: this.#isLocked });
  }

  /**
   * Set image rotation in degrees.
   * @param {number} degrees
   */
  setRotation(degrees) {
    if (this.#imageMesh) {
      this.#imageMesh.rotation.z = degrees * Math.PI / 180;
    }
    this.#bus.emit('image:rotation-changed', { degrees });
  }

  /** @returns {number} Rotation in degrees */
  get rotation() {
    if (!this.#imageMesh) return 0;
    return this.#imageMesh.rotation.z * 180 / Math.PI;
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
    this.#bus.emit('image:removed', null);
  }

  /** @returns {THREE.Mesh|null} The image mesh (for hit testing and transform target) */
  getImageMesh() { return this.#imageMesh; }

  setCamera(camera) {
    this.#camera = camera;
  }
}

export { ImageOverlay };
