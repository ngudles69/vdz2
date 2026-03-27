import * as THREE from 'three';

/**
 * StitchRenderer — Renders placed stamps (stitches and text) on the canvas
 * using InstancedMesh for stitch symbols and separate meshes for text.
 *
 * Listens to StitchStore events and rebuilds the instance buffer when
 * stamps are added, removed, or updated.
 *
 * Stitch symbols are rendered as textured quads sampling from the StitchAtlas.
 * Text stamps are rendered as Canvas2D textures on plane meshes.
 */

// ---------------------------------------------------------------------------
// Shader for stitch symbol instances
// ---------------------------------------------------------------------------

const VERTEX_SHADER = /* glsl */ `
  attribute vec4 atlasUV;   // per-instance: u0, v0, uScale, vScale
  attribute vec3 tintColor;  // per-instance: RGB tint
  attribute float tintOpacity; // per-instance: opacity

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    vUv = uv * atlasUV.zw + atlasUV.xy;
    vTint = tintColor;
    vOpacity = tintOpacity;
    vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uLayerOpacity;

  varying vec2 vUv;
  varying vec3 vTint;
  varying float vOpacity;

  void main() {
    vec4 texColor = texture2D(uAtlas, vUv);
    if (texColor.a < 0.1) discard;
    // Tint: multiply atlas white by tint color
    gl_FragColor = vec4(vTint * texColor.rgb, texColor.a * uLayerOpacity * vOpacity);
  }
`;

// ---------------------------------------------------------------------------
// StitchRenderer class
// ---------------------------------------------------------------------------

class StitchRenderer {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {import('./StitchStore.js').StitchStore} */
  #store;

  /** @type {import('./StitchLibrary.js').StitchLibrary} */
  #library;

  /** @type {import('./StitchAtlas.js').StitchAtlas} */
  #atlas;

  /** @type {import('./LayerManager.js').LayerManager} */
  #layerManager;

  /** @type {THREE.InstancedMesh|null} */
  #instancedMesh = null;

  /** @type {THREE.InstancedBufferAttribute} */
  #uvAttr;

  /** @type {THREE.InstancedBufferAttribute} */
  #tintAttr;

  /** @type {THREE.InstancedBufferAttribute} */
  #opacityAttr;

  /** @type {number} Current buffer capacity */
  #capacity = 64;

  /** @type {THREE.Object3D} Reusable dummy for matrix composition */
  #dummy = new THREE.Object3D();

  /** @type {number} Base symbol size in world units */
  #symbolSize = 24;

  /** @type {boolean} Whether a rebuild is needed */
  #dirty = true;

  /** @type {THREE.Group} The stitches layer group */
  #group;

  /** @type {THREE.Raycaster} Shared raycaster ref for hit testing */
  #raycaster = new THREE.Raycaster();

  /** @type {object|null} SetManager for visibility filtering */
  #setManager = null;

  // --- Per-stitch selection boxes ---
  /** @type {THREE.Group} Container for individual selection outlines */
  #selectionGroup;

  /** @type {THREE.LineDashedMaterial} Shared material for selection boxes */
  #selBoxMat;

  /** @type {Set<string>} Currently selected IDs (for diffing) */
  #selectedIds = new Set();

  /** @type {boolean} Whether selection visuals need rebuild */
  #selectionDirty = false;

  /**
   * @param {object} bus
   * @param {object} store - StitchStore
   * @param {object} library - StitchLibrary
   * @param {object} atlas - StitchAtlas
   * @param {object} layerManager
   */
  constructor(bus, store, library, atlas, layerManager) {
    this.#bus = bus;
    this.#store = store;
    this.#library = library;
    this.#atlas = atlas;
    this.#layerManager = layerManager;
    this.#group = layerManager.getGroup('stitches');

    this.#createInstancedMesh();
    this.#createSelectionGroup();

    // Listen to store changes
    bus.on('stitch-store:added', () => { this.#dirty = true; });
    bus.on('stitch-store:removed', () => { this.#dirty = true; this.#selectionDirty = true; });
    bus.on('stitch-store:updated', () => { this.#dirty = true; this.#selectionDirty = true; });
    bus.on('stitch-store:batch-updated', () => { this.#dirty = true; this.#selectionDirty = true; });
    bus.on('stitch-store:reordered', () => { this.#dirty = true; });
    bus.on('stitch-store:cleared', () => { this.#dirty = true; this.#selectionDirty = true; });
    bus.on('set:visibility-changed', () => { this.#dirty = true; });
    bus.on('set:show-all', () => { this.#dirty = true; });
    bus.on('set:hide-all', () => { this.#dirty = true; });
    bus.on('set:changed', () => { this.#dirty = true; });

    // Listen to selection changes
    bus.on('selection:changed', ({ ids }) => {
      this.#selectedIds = new Set(ids);
      this.#selectionDirty = true;
    });
  }

  #createInstancedMesh() {
    const geometry = new THREE.PlaneGeometry(this.#symbolSize, this.#symbolSize);

    // Flip UV Y to compensate for Canvas2D (Y-down) vs Three.js (Y-up)
    const uvs = geometry.getAttribute('uv');
    for (let i = 0; i < uvs.count; i++) {
      uvs.setY(i, 1.0 - uvs.getY(i));
    }
    uvs.needsUpdate = true;

    const texture = this.#atlas.getTexture();

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms: {
        uAtlas: { value: texture },
        uLayerOpacity: { value: 1.0 },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.#instancedMesh = new THREE.InstancedMesh(geometry, material, this.#capacity);
    this.#instancedMesh.frustumCulled = false;
    this.#instancedMesh.renderOrder = 400;
    this.#instancedMesh.count = 0;

    // Per-instance attributes
    this.#uvAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(this.#capacity * 4), 4
    );
    this.#tintAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(this.#capacity * 3), 3
    );
    this.#opacityAttr = new THREE.InstancedBufferAttribute(
      new Float32Array(this.#capacity), 1
    );

    this.#instancedMesh.geometry.setAttribute('atlasUV', this.#uvAttr);
    this.#instancedMesh.geometry.setAttribute('tintColor', this.#tintAttr);
    this.#instancedMesh.geometry.setAttribute('tintOpacity', this.#opacityAttr);

    this.#group.add(this.#instancedMesh);
  }

  #createSelectionGroup() {
    this.#selectionGroup = new THREE.Group();
    this.#selectionGroup.renderOrder = 450; // above stitches (400), below grid (1000)
    // Add directly to the stitches layer group so it shares visibility
    this.#group.add(this.#selectionGroup);

    this.#selBoxMat = new THREE.LineDashedMaterial({
      color: 0xff69b4,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      dashSize: 3,
      gapSize: 2,
    });

  }

  #syncSelectionBoxes() {
    if (!this.#selectionDirty) return;
    this.#selectionDirty = false;

    // Clear existing boxes
    while (this.#selectionGroup.children.length > 0) {
      const child = this.#selectionGroup.children[0];
      this.#selectionGroup.remove(child);
      child.geometry.dispose();
    }

    if (this.#selectedIds.size === 0) return;

    const half = this.#symbolSize / 2;

    for (const id of this.#selectedIds) {
      const s = this.#store.getById(id);
      if (!s) continue;

      const sc = s.scale ?? 1;
      const h = half * sc;
      const cx = s.position.x;
      const cy = s.position.y;

      // Build a rotated box
      const cos = Math.cos(s.rotation);
      const sin = Math.sin(s.rotation);

      // 4 corners of the box, rotated around center
      const corners = [
        [-h, -h], [h, -h], [h, h], [-h, h], [-h, -h], // close the loop
      ];

      const positions = new Float32Array(corners.length * 3);
      for (let i = 0; i < corners.length; i++) {
        const lx = corners[i][0];
        const ly = corners[i][1];
        positions[i * 3]     = cx + lx * cos - ly * sin;
        positions[i * 3 + 1] = cy + lx * sin + ly * cos;
        positions[i * 3 + 2] = 0;
      }

      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));

      const line = new THREE.Line(geom, this.#selBoxMat);
      line.computeLineDistances();
      line.renderOrder = 450;
      this.#selectionGroup.add(line);
    }
  }

  #grow(needed) {
    const newCap = Math.max(this.#capacity * 2, needed);

    // Remove old mesh
    this.#group.remove(this.#instancedMesh);
    this.#instancedMesh.geometry.dispose();
    this.#instancedMesh.material.dispose();

    this.#capacity = newCap;
    this.#createInstancedMesh();
  }

  /**
   * Call each frame (or after store changes). Rebuilds instance buffer if dirty.
   */
  sync() {
    this.#syncSelectionBoxes();

    if (!this.#dirty) return;
    this.#dirty = false;

    const sm = this.#setManager;
    const stitches = this.#store.getAllSorted().filter(s =>
      s.type === 'stitch' && (!sm || sm.isStitchVisible(s))
    );
    const count = stitches.length;

    if (count > this.#capacity) {
      this.#grow(count);
    }

    for (let i = 0; i < count; i++) {
      const s = stitches[i];

      // Position + rotation + scale matrix
      const sc = s.scale ?? 1;
      this.#dummy.position.set(s.position.x, s.position.y, 0);
      this.#dummy.rotation.set(0, 0, s.rotation);
      this.#dummy.scale.set(sc, sc, 1);
      this.#dummy.updateMatrix();
      this.#instancedMesh.setMatrixAt(i, this.#dummy.matrix);

      // Atlas UV
      const uv = this.#atlas.getUV(s.stitchType);
      if (uv) {
        this.#uvAttr.setXYZW(i, uv.u0, uv.v0, uv.uScale, uv.vScale);
      } else {
        this.#uvAttr.setXYZW(i, 0, 0, 0, 0);
      }

      // Tint color
      const color = s.colorOverride || '#ffffff';
      const c = new THREE.Color(color);
      this.#tintAttr.setXYZ(i, c.r, c.g, c.b);

      // Opacity
      this.#opacityAttr.setX(i, s.opacity);
    }

    this.#instancedMesh.count = count;
    this.#instancedMesh.instanceMatrix.needsUpdate = true;
    this.#uvAttr.needsUpdate = true;
    this.#tintAttr.needsUpdate = true;
    this.#opacityAttr.needsUpdate = true;
  }

  /**
   * Hit test: find the stitch ID at a screen position.
   * Tests each stitch's bounding area against the world point.
   *
   * @param {{ x: number, y: number }} worldPoint
   * @param {number} [threshold] - Hit radius in world units (default: half symbol size)
   * @returns {string|null} Stitch ID or null
   */
  hitTest(worldPoint, threshold) {
    const t = threshold ?? 8;
    // Test in reverse z-order (front to back) so topmost stitch is picked first
    const sorted = this.#store.getAllSorted();
    for (let i = sorted.length - 1; i >= 0; i--) {
      const s = sorted[i];
      const dx = worldPoint.x - s.position.x;
      const dy = worldPoint.y - s.position.y;
      if (Math.abs(dx) < t && Math.abs(dy) < t) {
        return s.id;
      }
    }
    return null;
  }

  /**
   * Find all stitch IDs within a world-space rectangle.
   * @param {number} x1 @param {number} y1 @param {number} x2 @param {number} y2
   * @returns {string[]}
   */
  getStampsInRect(x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const results = [];
    for (const s of this.#store.getAll()) {
      if (s.position.x >= minX && s.position.x <= maxX &&
          s.position.y >= minY && s.position.y <= maxY) {
        results.push(s.id);
      }
    }
    return results;
  }

  /** @returns {number} Symbol size in world units */
  get symbolSize() { return this.#symbolSize; }

  /** Update the selection box color. */
  setSelectionColor(color) {
    if (this.#selBoxMat) this.#selBoxMat.color.set(color);
  }

  /** Set the SetManager for visibility filtering. */
  setSetManager(sm) {
    this.#setManager = sm;
  }

  /** Set symbol size and mark dirty */
  setSymbolSize(size) {
    this.#symbolSize = size;
    // Rebuild mesh with new geometry size
    this.#group.remove(this.#instancedMesh);
    this.#instancedMesh.geometry.dispose();
    this.#instancedMesh.material.dispose();
    this.#createInstancedMesh();
    this.#dirty = true;
  }
}

export { StitchRenderer };
