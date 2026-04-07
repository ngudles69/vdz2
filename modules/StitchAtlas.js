import * as THREE from 'three';

/**
 * StitchAtlas -- Canvas 2D texture atlas generator for stitch symbols.
 *
 * Generates an 8-column x 6-row grid of 64x64px cells (512x384 canvas).
 * Each cell contains one stitch symbol drawn using the draw functions
 * from StitchLibrary. Produces a THREE.CanvasTexture for use with
 * InstancedMesh rendering of stitch symbols on edges.
 *
 * Symbols are drawn white on transparent background -- the shader or
 * material will tint them as needed for contrast.
 *
 * @example
 *   const atlas = new StitchAtlas(stitchLibrary);
 *   const texture = atlas.generate();
 *   const uv = atlas.getUV('sc'); // { u0, v0, uScale, vScale }
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CELL_SIZE = 64;
const COLS = 8;
const ROWS = 6;
const ATLAS_WIDTH  = COLS * CELL_SIZE;   // 512
const ATLAS_HEIGHT = ROWS * CELL_SIZE;   // 384

// ---------------------------------------------------------------------------
// StitchAtlas class
// ---------------------------------------------------------------------------

class StitchAtlas {

  /** @type {import('./StitchLibrary.js').StitchLibrary} */
  #library;

  /** @type {boolean} */
  #debug;

  /** @type {THREE.CanvasTexture|null} */
  #texture = null;

  /** @type {HTMLCanvasElement|null} */
  #canvas = null;

  /** @type {number} Line width used when drawing symbols into the atlas */
  #lineWidth = 3;

  /**
   * @param {import('./StitchLibrary.js').StitchLibrary} library - StitchLibrary instance
   * @param {{ debug?: boolean }} [options={}] - Options
   */
  constructor(library, options = {}) {
    this.#library = library;
    this.#debug = options.debug === true;
  }

  // -----------------------------------------------------------------------
  // Public API
  // -----------------------------------------------------------------------

  /**
   * Generate the texture atlas.
   *
   * Creates an offscreen canvas, draws all stitch symbols into their
   * atlas grid cells, and wraps it in a THREE.CanvasTexture.
   *
   * @returns {THREE.CanvasTexture} The generated atlas texture
   */
  generate() {
    // Reuse existing canvas on regeneration so the THREE.CanvasTexture
    // keeps pointing at the same GPU resource — we just mark it dirty.
    const canvas = this.#canvas || document.createElement('canvas');
    canvas.width = ATLAS_WIDTH;
    canvas.height = ATLAS_HEIGHT;

    const ctx = canvas.getContext('2d');

    // Clear to transparent
    ctx.clearRect(0, 0, ATLAS_WIDTH, ATLAS_HEIGHT);

    // Global drawing style for symbols — stroke width is user-configurable
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffff';
    ctx.lineWidth = this.#lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Draw each stitch symbol
    const allStitches = this.#library.getAll();

    for (const stitch of allStitches) {
      const col = stitch.atlasIndex % COLS;
      const row = Math.floor(stitch.atlasIndex / COLS);
      const cx = col * CELL_SIZE + CELL_SIZE / 2;
      const cy = row * CELL_SIZE + CELL_SIZE / 2;

      if (typeof stitch.draw === 'function') {
        // Reset styles before each draw (draw functions may modify state)
        ctx.strokeStyle = '#ffffff';
        ctx.fillStyle = '#ffffff';
        ctx.lineWidth = this.#lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.setLineDash([]);

        stitch.draw(ctx, cx, cy, CELL_SIZE);
      }

      // Debug mode: draw cell index in corner
      if (this.#debug) {
        ctx.save();
        ctx.font = '10px monospace';
        ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
        ctx.fillText(String(stitch.atlasIndex), col * CELL_SIZE + 2, row * CELL_SIZE + 12);
        ctx.fillText(stitch.id, col * CELL_SIZE + 2, row * CELL_SIZE + 24);
        ctx.restore();

        // Reset fill after debug text
        ctx.fillStyle = '#ffffff';
      }
    }

    // Debug: draw grid lines
    if (this.#debug) {
      ctx.save();
      ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([]);
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath();
        ctx.moveTo(c * CELL_SIZE, 0);
        ctx.lineTo(c * CELL_SIZE, ATLAS_HEIGHT);
        ctx.stroke();
      }
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath();
        ctx.moveTo(0, r * CELL_SIZE);
        ctx.lineTo(ATLAS_WIDTH, r * CELL_SIZE);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Create Three.js texture on first call; on regenerate, just flag the
    // existing texture dirty so the GPU re-uploads the same canvas.
    if (this.#texture) {
      this.#texture.needsUpdate = true;
    } else {
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.flipY = false; // CRITICAL: Canvas Y is top-down, UVs computed manually
      this.#texture = texture;
    }

    this.#canvas = canvas;
    return this.#texture;
  }

  /**
   * Set the symbol stroke width (1–16) and rebuild the atlas texture.
   * Existing renderers keep using the same texture object.
   * @param {number} w
   */
  setLineWidth(w) {
    const next = Math.max(1, Math.min(16, Number(w) || 3));
    if (next === this.#lineWidth) return;
    this.#lineWidth = next;
    if (this.#canvas) this.generate();
  }

  /** @returns {number} Current symbol stroke width */
  get lineWidth() { return this.#lineWidth; }

  /**
   * Get UV coordinates for a stitch in the atlas.
   *
   * @param {string} stitchId - Stitch ID (e.g. 'sc', 'dc')
   * @returns {{ u0: number, v0: number, uScale: number, vScale: number }|null}
   *   UV origin and scale for sampling this stitch's cell, or null if not found
   */
  getUV(stitchId) {
    const stitch = this.#library.get(stitchId);
    if (!stitch) return null;

    const col = stitch.atlasIndex % COLS;
    const row = Math.floor(stitch.atlasIndex / COLS);

    return {
      u0: col / COLS,
      v0: row / ROWS,
      uScale: 1 / COLS,
      vScale: 1 / ROWS,
    };
  }

  /**
   * Get the generated texture. Lazy-generates if not yet created.
   *
   * @returns {THREE.CanvasTexture}
   */
  getTexture() {
    if (!this.#texture) {
      this.generate();
    }
    return this.#texture;
  }

  /**
   * Get the underlying canvas element (useful for DOM debugging).
   *
   * @returns {HTMLCanvasElement|null}
   */
  getCanvas() {
    return this.#canvas;
  }

  // -----------------------------------------------------------------------
  // Static constants (for external reference)
  // -----------------------------------------------------------------------

  static CELL_SIZE = CELL_SIZE;
  static COLS = COLS;
  static ROWS = ROWS;
  static ATLAS_WIDTH = ATLAS_WIDTH;
  static ATLAS_HEIGHT = ATLAS_HEIGHT;
}

export { StitchAtlas };
