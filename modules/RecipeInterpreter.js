/**
 * RecipeInterpreter — Translates a ClipRecipe grid into per-frame states.
 *
 * Given the recipe grid, video sections, and a target FPS, computes
 * what each group should look like at any given frame index.
 */
class RecipeInterpreter {

  /** @type {import('./ClipRecipe.js').ClipRecipe} */
  #recipe;

  /** @type {Array<{start: number, end: number}>} */
  #sections;

  /** @type {number} */
  #fps;

  /** @type {number} */
  #duration;

  /** @type {number} */
  #totalFrames;

  /**
   * @param {import('./ClipRecipe.js').ClipRecipe} recipe
   * @param {Array<{start: number, end: number}>} sections
   * @param {number} fps
   */
  constructor(recipe, sections, fps) {
    this.#recipe = recipe;
    this.#sections = sections;
    this.#fps = fps;

    // Compute effective duration: trim trailing empty sections
    this.#duration = this.#computeEffectiveDuration();
    this.#totalFrames = Math.ceil(this.#duration * fps);
  }

  /** @returns {number} Total frame count */
  getTotalFrames() { return this.#totalFrames; }

  /** @returns {number} Effective duration in seconds */
  getDuration() { return this.#duration; }

  /** @returns {number} */
  getFps() { return this.#fps; }

  /**
   * Get the frame state for a given frame index.
   * @param {number} frameIndex
   * @returns {{ groups: Object<number, { visible: boolean, color: string|null, opacity: number }> }}
   */
  getFrameState(frameIndex) {
    const t = frameIndex / this.#fps;
    const sectionIndex = this.#getSectionAt(t);
    const dims = this.#recipe.getGridDimensions();
    const groups = {};

    for (let g = 0; g < dims.rows; g++) {
      const cell = sectionIndex >= 0 ? this.#recipe.getCell(g, sectionIndex) : null;

      if (!cell) {
        groups[g] = { visible: false, color: null, opacity: 0 };
        continue;
      }

      if (cell.effect === 'show') {
        groups[g] = {
          visible: true,
          color: cell.config.colorOverlay || null,
          opacity: 1.0,
        };
      } else if (cell.effect === 'blink') {
        const speed = cell.config.speed ?? 2;
        const color1 = cell.config.color1 || null;
        const color2 = cell.config.color2 || '#ffffff';
        // Blink: alternate between color1 and color2
        const phase = Math.sin(2 * Math.PI * speed * t) > 0;
        groups[g] = {
          visible: true,
          color: phase ? color1 : color2,
          opacity: 1.0,
        };
      } else {
        groups[g] = { visible: false, color: null, opacity: 0 };
      }
    }

    return { groups };
  }

  /**
   * Find which section index a time falls in.
   * @param {number} t - Time in seconds
   * @returns {number} Section index, or -1 if outside all sections
   */
  #getSectionAt(t) {
    for (let i = 0; i < this.#sections.length; i++) {
      if (t >= this.#sections[i].start && t < this.#sections[i].end) return i;
    }
    return -1;
  }

  /**
   * Compute effective duration by trimming trailing empty sections.
   * If the last N sections have no effects for any group, exclude them.
   * @returns {number} Duration in seconds
   */
  #computeEffectiveDuration() {
    if (this.#sections.length === 0) return 0;

    const dims = this.#recipe.getGridDimensions();
    let lastActiveSection = -1;

    for (let s = 0; s < this.#sections.length; s++) {
      for (let g = 0; g < dims.rows; g++) {
        if (this.#recipe.getCell(g, s)) {
          lastActiveSection = s;
          break;
        }
      }
    }

    if (lastActiveSection < 0) return 0;
    return this.#sections[lastActiveSection].end;
  }
}

export { RecipeInterpreter };
