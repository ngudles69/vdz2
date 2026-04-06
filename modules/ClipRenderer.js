import * as THREE from 'three';

/**
 * ClipRenderer — Off-screen Three.js renderer for clip generation.
 *
 * Creates a separate WebGLRenderer that renders stitches onto a
 * transparent canvas at the target resolution. Does not affect
 * the visible viewport.
 *
 * For each frame, it receives a frame state (which groups visible,
 * what colors) and produces a canvas with rendered stitches.
 */
class ClipRenderer {

  /** @type {THREE.WebGLRenderer|null} */
  #renderer = null;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {THREE.OrthographicCamera} */
  #camera;

  /** @type {THREE.InstancedMesh|null} */
  #instancedMesh = null;

  /** @type {import('./StitchStore.js').StitchStore} */
  #store;

  /** @type {import('./StitchAtlas.js').StitchAtlas} */
  #atlas;

  /** @type {import('./SetManager.js').SetManager} */
  #setManager;

  /** @type {number} */
  #symbolSize = 24;

  /** @type {THREE.Object3D} */
  #dummy = new THREE.Object3D();

  /** @type {number} */
  #width = 1080;

  /** @type {number} */
  #height = 1920;

  // Instanced attributes
  #uvAttr;
  #tintAttr;
  #opacityAttr;
  #capacity = 256;

  // Text meshes
  /** @type {Map<string, THREE.Mesh>} */
  #textMeshes = new Map();

  /** @type {THREE.Group} */
  #textGroup;

  // Shaders (same as StitchRenderer)
  static VERTEX = /* glsl */ `
    attribute vec4 atlasUV;
    attribute vec3 tintColor;
    attribute float tintOpacity;
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

  static FRAGMENT = /* glsl */ `
    uniform sampler2D uAtlas;
    varying vec2 vUv;
    varying vec3 vTint;
    varying float vOpacity;
    void main() {
      vec4 texColor = texture2D(uAtlas, vUv);
      if (texColor.a < 0.1) discard;
      gl_FragColor = vec4(vTint * texColor.rgb, texColor.a * vOpacity);
    }
  `;

  /**
   * Set up the off-screen renderer.
   * @param {object} store - StitchStore
   * @param {object} atlas - StitchAtlas
   * @param {object} setManager - SetManager
   * @param {{ width: number, height: number }} resolution
   */
  setup(store, atlas, setManager, resolution) {
    this.#store = store;
    this.#atlas = atlas;
    this.#setManager = setManager;
    this.#width = resolution.width;
    this.#height = resolution.height;

    // Create off-screen renderer with alpha
    this.#renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'default',
    });
    this.#renderer.setSize(this.#width, this.#height);
    this.#renderer.setPixelRatio(1); // exact resolution, no DPR scaling
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.setClearColor(0x000000, 0); // transparent

    // Scene
    this.#scene = new THREE.Scene();

    // Camera — orthographic, framed to match the viewport's coordinate system
    // Use a frustum that covers the same world space as the main viewport
    const aspect = this.#width / this.#height;
    const frustumSize = 400; // same as main viewport default
    this.#camera = new THREE.OrthographicCamera(
      -frustumSize * aspect / 2, frustumSize * aspect / 2,
      frustumSize / 2, -frustumSize / 2,
      0.1, 1000
    );
    this.#camera.position.set(0, 0, 100);
    this.#camera.lookAt(0, 0, 0);

    // Create instanced mesh
    this.#createInstancedMesh();

    // Text group
    this.#textGroup = new THREE.Group();
    this.#scene.add(this.#textGroup);
  }

  /**
   * Set the camera to match the main viewport's camera position/zoom.
   * Call this before rendering to ensure the off-screen render matches
   * what the user sees.
   * @param {THREE.OrthographicCamera} mainCamera
   */
  matchCamera(mainCamera) {
    this.#camera.position.copy(mainCamera.position);
    this.#camera.zoom = mainCamera.zoom;

    // Recompute frustum for our resolution's aspect ratio
    const aspect = this.#width / this.#height;
    const frustumSize = 400;
    this.#camera.left = -frustumSize * aspect / 2;
    this.#camera.right = frustumSize * aspect / 2;
    this.#camera.top = frustumSize / 2;
    this.#camera.bottom = -frustumSize / 2;
    this.#camera.updateProjectionMatrix();
  }

  /**
   * Render a single frame based on the frame state.
   * @param {{ groups: Object<number, { visible: boolean, color: string|null, opacity: number }> }} frameState
   * @returns {HTMLCanvasElement} The rendered canvas
   */
  renderFrame(frameState) {
    const stamps = this.#store.getAllSorted();
    const stitches = [];
    const texts = [];

    for (const s of stamps) {
      if (s.setId === null || s.setId === undefined) continue;
      // Group index is setId - 1 (sets are 1-based, grid is 0-based)
      const groupIndex = s.setId - 1;
      const groupState = frameState.groups[groupIndex];
      if (!groupState || !groupState.visible) continue;

      if (s.type === 'stitch') {
        stitches.push({ stamp: s, groupState });
      } else if (s.type === 'text') {
        texts.push({ stamp: s, groupState });
      }
    }

    // Update instanced mesh
    const count = stitches.length;
    if (count > this.#capacity) this.#grow(count);

    for (let i = 0; i < count; i++) {
      const { stamp: s, groupState } = stitches[i];
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

      // Color: groupState.color overrides, then stamp's colorOverride, then white
      const color = groupState.color || s.colorOverride || '#ffffff';
      const c = new THREE.Color(color);
      this.#tintAttr.setXYZ(i, c.r, c.g, c.b);

      // Opacity
      this.#opacityAttr.setX(i, (s.opacity ?? 1.0) * (groupState.opacity ?? 1.0));
    }

    this.#instancedMesh.count = count;
    this.#instancedMesh.instanceMatrix.needsUpdate = true;
    this.#uvAttr.needsUpdate = true;
    this.#tintAttr.needsUpdate = true;
    this.#opacityAttr.needsUpdate = true;

    // TODO: text mesh rendering for off-screen (simplified for now)

    // Render
    this.#renderer.render(this.#scene, this.#camera);

    return this.#renderer.domElement;
  }

  /**
   * Render a frame with a green screen background instead of transparent.
   * @param {{ groups: Object }} frameState
   * @param {string} bgColor - Green screen color (default: '#00ff00')
   * @returns {HTMLCanvasElement}
   */
  renderFrameGreenScreen(frameState, bgColor = '#00ff00') {
    this.#renderer.setClearColor(new THREE.Color(bgColor), 1.0);
    const canvas = this.renderFrame(frameState);
    this.#renderer.setClearColor(0x000000, 0); // restore transparent
    return canvas;
  }

  /** Clean up WebGL resources */
  dispose() {
    if (this.#instancedMesh) {
      this.#instancedMesh.geometry.dispose();
      this.#instancedMesh.material.dispose();
    }
    for (const mesh of this.#textMeshes.values()) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.#textMeshes.clear();
    if (this.#renderer) {
      this.#renderer.dispose();
      this.#renderer = null;
    }
  }

  /** @returns {number} */
  get width() { return this.#width; }

  /** @returns {number} */
  get height() { return this.#height; }

  // ---- Private ----

  #createInstancedMesh() {
    const geometry = new THREE.PlaneGeometry(this.#symbolSize, this.#symbolSize);

    // Flip UV Y (Canvas2D Y-down vs Three.js Y-up)
    const uvs = geometry.getAttribute('uv');
    for (let i = 0; i < uvs.count; i++) {
      uvs.setY(i, 1.0 - uvs.getY(i));
    }
    uvs.needsUpdate = true;

    const texture = this.#atlas.getTexture();
    const material = new THREE.ShaderMaterial({
      vertexShader: ClipRenderer.VERTEX,
      fragmentShader: ClipRenderer.FRAGMENT,
      uniforms: {
        uAtlas: { value: texture },
      },
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });

    this.#instancedMesh = new THREE.InstancedMesh(geometry, material, this.#capacity);
    this.#instancedMesh.frustumCulled = false;
    this.#instancedMesh.count = 0;

    this.#uvAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity * 4), 4);
    this.#tintAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity * 3), 3);
    this.#opacityAttr = new THREE.InstancedBufferAttribute(new Float32Array(this.#capacity), 1);

    this.#instancedMesh.geometry.setAttribute('atlasUV', this.#uvAttr);
    this.#instancedMesh.geometry.setAttribute('tintColor', this.#tintAttr);
    this.#instancedMesh.geometry.setAttribute('tintOpacity', this.#opacityAttr);

    this.#scene.add(this.#instancedMesh);
  }

  #grow(needed) {
    const newCap = Math.max(needed, this.#capacity * 2);
    this.#scene.remove(this.#instancedMesh);
    this.#instancedMesh.geometry.dispose();
    this.#instancedMesh.material.dispose();
    this.#capacity = newCap;
    this.#createInstancedMesh();
  }
}

export { ClipRenderer };
