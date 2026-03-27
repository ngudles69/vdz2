import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Viewport — Pure rendering engine. No pointer event handling.
 *
 * Owns: renderer, camera, OrbitControls, scene, grid, rulers, background,
 * resize handling, context loss recovery, render loop.
 *
 * All pointer interactions are handled by ToolManager + Tool subclasses.
 */
class Viewport {

  /** @type {THREE.WebGLRenderer} */
  #renderer;

  /** @type {THREE.Scene} */
  #scene;

  /** @type {THREE.OrthographicCamera} */
  #camera;

  /** @type {OrbitControls} */
  #controls;

  /** @type {ResizeObserver} */
  #resizeObserver;

  /** @type {HTMLElement} */
  #container;

  /** @type {number} */
  #frustumSize = 500;

  /** @type {import('../core/EventBus.js').EventBus|null} */
  #bus;

  /** @type {import('../core/State.js').State|null} */
  #state;

  // --- Raycaster (shared, used by tools) ---
  #raycaster = new THREE.Raycaster();
  #pointer = new THREE.Vector2();

  // --- LayerManager ---
  #layerManager = null;

  // --- Background ---
  #bgMesh = null;
  #bgType = 'minimal';

  // --- Line grid ---
  #gridGroup = null;
  #gridSpacing = 20;
  #gridOpacity = 0.15;
  #gridColor = '#777777';

  // --- Rulers ---
  #rulerVisible = false;
  #rulerOpacity = 1.0;
  #rulerTop = null;
  #rulerLeft = null;

  // --- StitchRenderer (synced each frame) ---
  #stitchRenderer = null;

  constructor(bus, state, container) {
    this.#bus = bus;
    this.#state = state;
    this.#container = container;

    // --- Renderer ---
    this.#renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'default' });
    this.#renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.#renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.#renderer.setClearColor(0x1a1a24);

    const { clientWidth: w, clientHeight: h } = container;
    this.#renderer.setSize(w, h);
    container.appendChild(this.#renderer.domElement);

    // --- Ruler canvases ---
    this.#rulerTop = document.getElementById('ruler-top');
    this.#rulerLeft = document.getElementById('ruler-left');
    if (this.#rulerTop) this.#rulerTop.style.display = 'none';
    if (this.#rulerLeft) this.#rulerLeft.style.display = 'none';

    // --- Scene ---
    this.#scene = new THREE.Scene();

    // --- Orthographic Camera ---
    const aspect = w / h;
    const fs = this.#frustumSize;
    this.#camera = new THREE.OrthographicCamera(
      -fs * aspect / 2, fs * aspect / 2, fs / 2, -fs / 2, 0.1, 1000
    );
    this.#camera.position.set(0, 0, 100);
    this.#camera.lookAt(0, 0, 0);

    // --- OrbitControls (2D pan/zoom only) ---
    this.#controls = new OrbitControls(this.#camera, this.#renderer.domElement);
    this.#controls.enableRotate = false;
    this.#controls.enablePan = true;
    this.#controls.screenSpacePanning = true;
    this.#controls.enableDamping = true;
    this.#controls.dampingFactor = 0.1;
    this.#controls.minZoom = 0.1;
    this.#controls.maxZoom = 30;
    this.#controls.mouseButtons = {
      LEFT: null,              // handled by ToolManager
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    this.#controls.touches = { ONE: null, TWO: THREE.TOUCH.DOLLY_PAN };

    let lastZoom = this.#camera.zoom;
    this.#controls.addEventListener('change', () => {
      if (this.#camera.zoom !== lastZoom) {
        lastZoom = this.#camera.zoom;
        if (this.#bus) this.#bus.emit('camera:zoom-changed', { zoom: this.#camera.zoom });
      }
    });

    // --- Line Grid ---
    this.#createLineGrid();

    // --- Context Loss Recovery ---
    this.#setupContextRecovery();

    // --- Resize Handling ---
    this.#resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width === 0 || height === 0) continue;
        this.#onResize(width, height);
      }
    });
    this.#resizeObserver.observe(container);

    // --- Render Loop ---
    this.#renderer.setAnimationLoop(() => this.#render());
  }

  // ==== Grid ====

  #createLineGrid() {
    this.#gridGroup = new THREE.Group();
    this.#gridGroup.visible = false;
    this.#gridGroup.renderOrder = 1000;
    this.#buildGridGeometry();
    this.#scene.add(this.#gridGroup);
  }

  #buildGridGeometry() {
    while (this.#gridGroup.children.length > 0) {
      const child = this.#gridGroup.children[0];
      this.#gridGroup.remove(child);
      child.geometry.dispose();
      child.material.dispose();
    }

    const spacing = this.#gridSpacing;
    const extent = 2000;
    const positions = [];

    for (let y = 0; y <= extent; y += spacing) {
      positions.push(-extent, y, 0, extent, y, 0);
      if (y > 0) positions.push(-extent, -y, 0, extent, -y, 0);
    }
    for (let x = 0; x <= extent; x += spacing) {
      positions.push(x, -extent, 0, x, extent, 0);
      if (x > 0) positions.push(-x, -extent, 0, -x, extent, 0);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.LineBasicMaterial({
      color: this.#gridColor, transparent: true, opacity: this.#gridOpacity, depthTest: false,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.renderOrder = 1000;
    this.#gridGroup.add(lines);
  }

  // ==== Context Recovery ====

  #setupContextRecovery() {
    const canvas = this.#renderer.domElement;
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.#renderer.setAnimationLoop(null);
      if (this.#bus) this.#bus.emit('renderer:context-lost', null);
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.#renderer.setAnimationLoop(() => this.#render());
      if (this.#bus) this.#bus.emit('renderer:context-restored', null);
    });
  }

  // ==== Resize ====

  #onResize(width, height) {
    const aspect = width / height;
    const fs = this.#frustumSize;
    this.#camera.left = -fs * aspect / 2;
    this.#camera.right = fs * aspect / 2;
    this.#camera.top = fs / 2;
    this.#camera.bottom = -fs / 2;
    this.#camera.updateProjectionMatrix();
    this.#renderer.setSize(width, height);
    if (this.#bus) this.#bus.emit('viewport:resized', { width, height });
  }

  // ==== Render Loop ====

  #render() {
    if (this.#stitchRenderer) this.#stitchRenderer.sync();
    this.#controls.update();
    this.#renderer.render(this.#scene, this.#camera);
    if (this.#rulerVisible) this.#drawRulers();
  }

  // ==== Rulers ====

  #drawRulers() {
    if (!this.#rulerTop || !this.#rulerLeft) return;

    const cam = this.#camera;
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const spacing = this.#gridSpacing;
    const rulerH = 20;
    const dpr = Math.min(window.devicePixelRatio, 2);
    const aspect = w / h;

    const topW = w - rulerH;
    if (this.#rulerTop.width !== Math.round(topW * dpr) || this.#rulerTop.height !== Math.round(rulerH * dpr)) {
      this.#rulerTop.width = Math.round(topW * dpr);
      this.#rulerTop.height = Math.round(rulerH * dpr);
    }
    const leftH = h - rulerH;
    if (this.#rulerLeft.width !== Math.round(rulerH * dpr) || this.#rulerLeft.height !== Math.round(leftH * dpr)) {
      this.#rulerLeft.width = Math.round(rulerH * dpr);
      this.#rulerLeft.height = Math.round(leftH * dpr);
    }

    const worldToScreenX = (wx) => {
      const ndc = (wx - cam.position.x) * cam.zoom / (this.#frustumSize * aspect / 2);
      return ((ndc + 1) / 2) * w - rulerH;
    };
    const worldToScreenY = (wy) => {
      const ndc = (wy - cam.position.y) * cam.zoom / (this.#frustumSize / 2);
      return ((1 - ndc) / 2) * h - rulerH;
    };

    const halfW = (this.#frustumSize * aspect / 2) / cam.zoom;
    const halfH = (this.#frustumSize / 2) / cam.zoom;
    const startX = Math.ceil((cam.position.x - halfW) / spacing) * spacing;
    const startY = Math.ceil((cam.position.y - halfH) / spacing) * spacing;
    const worldRight = cam.position.x + halfW;
    const worldTop = cam.position.y + halfH;

    this.#rulerTop.style.opacity = this.#rulerOpacity;
    this.#rulerLeft.style.opacity = this.#rulerOpacity;

    // Top ruler
    const ctxTop = this.#rulerTop.getContext('2d');
    ctxTop.clearRect(0, 0, this.#rulerTop.width, this.#rulerTop.height);
    ctxTop.scale(dpr, dpr);
    ctxTop.fillStyle = '#aaa'; ctxTop.font = '9px Jost, sans-serif'; ctxTop.textAlign = 'center';
    ctxTop.strokeStyle = '#666'; ctxTop.lineWidth = 0.5;
    for (let wx = startX; wx <= worldRight; wx += spacing) {
      const sx = worldToScreenX(wx);
      if (sx < -10 || sx > topW + 10) continue;
      ctxTop.beginPath(); ctxTop.moveTo(sx, rulerH); ctxTop.lineTo(sx, rulerH - 6); ctxTop.stroke();
      if (sx > 15 && sx < topW - 15) ctxTop.fillText(Math.round(wx / spacing), sx, rulerH - 8);
    }
    ctxTop.setTransform(1, 0, 0, 1, 0, 0);

    // Left ruler
    const ctxLeft = this.#rulerLeft.getContext('2d');
    ctxLeft.clearRect(0, 0, this.#rulerLeft.width, this.#rulerLeft.height);
    ctxLeft.scale(dpr, dpr);
    ctxLeft.fillStyle = '#aaa'; ctxLeft.font = '9px Jost, sans-serif'; ctxLeft.textAlign = 'center';
    ctxLeft.strokeStyle = '#666'; ctxLeft.lineWidth = 0.5;
    for (let wy = startY; wy <= worldTop; wy += spacing) {
      const sy = worldToScreenY(wy);
      if (sy < -10 || sy > leftH + 10) continue;
      ctxLeft.beginPath(); ctxLeft.moveTo(rulerH, sy); ctxLeft.lineTo(rulerH - 6, sy); ctxLeft.stroke();
      if (sy > 15 && sy < leftH - 15) {
        ctxLeft.save(); ctxLeft.translate(rulerH - 8, sy); ctxLeft.rotate(-Math.PI / 2);
        ctxLeft.fillText(Math.round(wy / spacing), 0, 0); ctxLeft.restore();
      }
    }
    ctxLeft.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ==== Public API ====

  get scene()       { return this.#scene; }
  get camera()      { return this.#camera; }
  get renderer()    { return this.#renderer; }
  get controls()    { return this.#controls; }
  get domElement()  { return this.#renderer.domElement; }
  get container()   { return this.#container; }
  get frustumSize() { return this.#frustumSize; }
  get gridVisible() { return this.#gridGroup ? this.#gridGroup.visible : false; }
  get gridSpacing() { return this.#gridSpacing; }
  get gridOpacity() { return this.#gridOpacity; }
  get rulerVisible(){ return this.#rulerVisible; }
  get rulerOpacity(){ return this.#rulerOpacity; }
  get backgroundType() { return this.#bgType; }

  /** Convert screen pixel position to world coordinates. */
  screenToWorld(clientX, clientY) {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
    const vec = new THREE.Vector3(ndcX, ndcY, 0);
    vec.unproject(this.#camera);
    return { x: vec.x, y: vec.y };
  }

  /** Raycaster access for tools that need hit testing against Three.js objects. */
  raycast(clientX, clientY, objects) {
    const rect = this.#renderer.domElement.getBoundingClientRect();
    this.#pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.#pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.#raycaster.setFromCamera(this.#pointer, this.#camera);
    return this.#raycaster.intersectObjects(objects, false);
  }

  // ==== Grid controls ====

  setGridVisible(v) { if (this.#gridGroup) this.#gridGroup.visible = v; }
  setGridSize(s)    { this.#gridSpacing = Math.max(5, Math.min(100, s)); if (this.#gridGroup) this.#buildGridGeometry(); }
  setGridOpacity(o) {
    this.#gridOpacity = Math.max(0.01, Math.min(1.0, o));
    if (this.#gridGroup?.children[0]) this.#gridGroup.children[0].material.opacity = this.#gridOpacity;
  }
  setGridColor(c) {
    this.#gridColor = c;
    if (this.#gridGroup) this.#gridGroup.traverse(ch => { if (ch.material) ch.material.color.set(c); });
  }

  // ==== Ruler controls ====

  setRulerVisible(v) {
    this.#rulerVisible = v;
    if (this.#rulerTop) this.#rulerTop.style.display = v ? '' : 'none';
    if (this.#rulerLeft) this.#rulerLeft.style.display = v ? '' : 'none';
  }
  setRulerOpacity(o) { this.#rulerOpacity = Math.max(0.01, Math.min(1.0, o)); }

  // ==== Layer Manager ====

  setLayerManager(lm) {
    this.#layerManager = lm;
    this.#createBackground();
    if (this.#gridGroup) this.#gridGroup.traverse(ch => { if (ch.isLineSegments) ch.renderOrder = 1000; });
  }

  #createBackground() {
    const bgGroup = this.#layerManager.getGroup('background');
    const geometry = new THREE.PlaneGeometry(10000, 10000);
    const material = new THREE.MeshBasicMaterial({ color: 0x0d0d0f, depthTest: false, depthWrite: false });
    this.#bgMesh = new THREE.Mesh(geometry, material);
    this.#bgMesh.renderOrder = 0;
    bgGroup.add(this.#bgMesh);
  }

  // ==== Background presets ====

  setBackground(type, options = {}) {
    if (!this.#bgMesh) return;
    const mat = this.#bgMesh.material;

    switch (type) {
      case 'minimal': mat.map = null; mat.color.set(0x0d0d0f); mat.needsUpdate = true; break;
      case 'leather': mat.map = this.#createProceduralTexture('leather'); mat.color.set(0xffffff); mat.needsUpdate = true; break;
      case 'wood':    mat.map = this.#createProceduralTexture('wood'); mat.color.set(0xffffff); mat.needsUpdate = true; break;
      case 'felt':    mat.map = this.#createProceduralTexture('felt'); mat.color.set(0xffffff); mat.needsUpdate = true; break;
      case 'solid':   mat.map = null; mat.color.set(options.color || 0x0d0d0f); mat.needsUpdate = true; break;
      default: return;
    }
    this.#bgType = type;
    if (this.#bus) this.#bus.emit('background:changed', { type });
  }

  #createProceduralTexture(type) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');

    if (type === 'leather') {
      ctx.fillStyle = '#2a1f1a'; ctx.fillRect(0, 0, size, size);
      const d = ctx.getImageData(0, 0, size, size);
      for (let i = 0; i < d.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 15;
        d.data[i] = Math.max(0, Math.min(255, d.data[i] + n));
        d.data[i+1] = Math.max(0, Math.min(255, d.data[i+1] + n * 0.8));
        d.data[i+2] = Math.max(0, Math.min(255, d.data[i+2] + n * 0.6));
      }
      ctx.putImageData(d, 0, 0);
    } else if (type === 'wood') {
      ctx.fillStyle = '#1a1410'; ctx.fillRect(0, 0, size, size);
      const d = ctx.getImageData(0, 0, size, size);
      for (let y = 0; y < size; y++) {
        if (y % (8 + Math.floor(Math.random() * 5)) === 0) {
          const b = (Math.random() - 0.5) * 10;
          for (let x = 0; x < size; x++) {
            const i = (y * size + x) * 4;
            d.data[i] = Math.max(0, Math.min(255, d.data[i] + b));
            d.data[i+1] = Math.max(0, Math.min(255, d.data[i+1] + b * 0.8));
            d.data[i+2] = Math.max(0, Math.min(255, d.data[i+2] + b * 0.6));
          }
        }
      }
      ctx.putImageData(d, 0, 0);
    } else if (type === 'felt') {
      ctx.fillStyle = '#161620'; ctx.fillRect(0, 0, size, size);
      for (let i = 0; i < 2000; i++) {
        const b = 20 + Math.random() * 15;
        ctx.fillStyle = `rgb(${b},${b},${b + 5})`;
        ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random(), 1 + Math.random());
      }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping; texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(40, 40);
    return texture;
  }

  // ==== StitchRenderer (synced in render loop) ====

  setStitchRenderer(r) { this.#stitchRenderer = r; }
}

export { Viewport };
