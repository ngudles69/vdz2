import * as THREE from 'three';

/**
 * VideoOverlay — Displays the current video frame as a plane mesh
 * in the video layer (z=300), between image and stitches.
 *
 * The mesh uses THREE.VideoTexture which auto-updates during playback.
 * Transform interactions (move, resize, rotate) are handled by
 * TransformControls via VideoTransformTarget.
 */
class VideoOverlay {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('./LayerManager.js').LayerManager} */
  #layerManager;

  /** @type {THREE.Group} */
  #videoGroup;

  /** @type {THREE.Mesh|null} */
  #mesh = null;

  /** @type {THREE.Line|null} Center ring indicator */
  #centerRing = null;

  /** @type {THREE.VideoTexture|null} */
  #texture = null;

  /** @type {HTMLVideoElement|null} */
  #videoEl = null;

  /** @type {number} */
  #videoWidth = 0;

  /** @type {number} */
  #videoHeight = 0;

  constructor(bus, layerManager) {
    this.#bus = bus;
    this.#layerManager = layerManager;
    this.#videoGroup = layerManager.getGroup('video');
  }

  /**
   * Set the video element and create the textured plane.
   * @param {HTMLVideoElement} videoEl
   * @param {number} width - video native width
   * @param {number} height - video native height
   */
  setVideo(videoEl, width, height) {
    this.removeVideo();

    this.#videoEl = videoEl;
    this.#videoWidth = width;
    this.#videoHeight = height;

    // Create VideoTexture
    this.#texture = new THREE.VideoTexture(videoEl);
    this.#texture.minFilter = THREE.LinearFilter;
    this.#texture.magFilter = THREE.LinearFilter;
    this.#texture.colorSpace = THREE.SRGBColorSpace;

    // Create plane with video aspect ratio
    const aspect = width / height;
    const planeHeight = 200;
    const planeWidth = planeHeight * aspect;

    const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
    const material = new THREE.MeshBasicMaterial({
      map: this.#texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.#mesh = new THREE.Mesh(geometry, material);
    this.#mesh.renderOrder = 300;
    this.#mesh.userData.isVideoOverlay = true;

    this.#videoGroup.add(this.#mesh);

    // Red ring at center of video frame — in indicators layer (above everything)
    const indicators = this.#layerManager.getGroup('indicators');
    if (indicators) {
      const ringRadius = 6;
      const ringGeom = new THREE.RingGeometry(ringRadius - 1, ringRadius, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xff3333, depthTest: false, depthWrite: false, transparent: true, opacity: 1.0, side: THREE.DoubleSide });
      this.#centerRing = new THREE.Mesh(ringGeom, ringMat);
      this.#centerRing.renderOrder = 1500;
      this.#centerRing.position.set(this.#mesh.position.x, this.#mesh.position.y, 0);
      indicators.add(this.#centerRing);
    }

    this.#bus.emit('video-overlay:loaded', { width, height });
  }

  removeVideo() {
    if (this.#centerRing) {
      const indicators = this.#layerManager.getGroup('indicators');
      if (indicators) indicators.remove(this.#centerRing);
      this.#centerRing.geometry.dispose();
      this.#centerRing.material.dispose();
      this.#centerRing = null;
    }
    if (this.#mesh) {
      this.#videoGroup.remove(this.#mesh);
      this.#mesh.geometry.dispose();
      this.#mesh.material.dispose();
      this.#mesh = null;
    }
    if (this.#texture) {
      this.#texture.dispose();
      this.#texture = null;
    }
    this.#videoEl = null;
    this.#videoWidth = 0;
    this.#videoHeight = 0;
    this.#bus.emit('video-overlay:removed');
  }

  /** Sync the center ring position to the mesh position */
  updateRing() {
    if (this.#centerRing && this.#mesh) {
      this.#centerRing.position.set(this.#mesh.position.x, this.#mesh.position.y, 0);
    }
  }

  /** @returns {THREE.Mesh|null} */
  getMesh() { return this.#mesh; }

  /** @returns {boolean} */
  get hasVideo() { return this.#mesh !== null; }

  /** @returns {number} */
  get videoWidth() { return this.#videoWidth; }

  /** @returns {number} */
  get videoHeight() { return this.#videoHeight; }
}

export { VideoOverlay };
