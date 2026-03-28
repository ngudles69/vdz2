/**
 * ClipRecipe — 2D grid data model for clip builder.
 *
 * Maps stitch groups (rows) to video sections (columns) with
 * animation effect assignments per cell. Pure data, no UI.
 *
 * Each cell is either null (empty) or:
 *   { effect: 'show'|'blink', config: { ...effect-specific params } }
 *
 * Grid is indexed as grid[groupIndex][sectionIndex].
 * Data layer has no dimension limits; visual grid enforces a max.
 */
class ClipRecipe {

  /** @type {Array<Array<object|null>>} grid[groupIndex][sectionIndex] */
  #grid = [];

  /** @type {{ name: string|null, path: string|null }} */
  #videoRef = { name: null, path: null };

  /** Known effect types and their default configs */
  static EFFECTS = {
    show: () => ({ colorOverlay: null }),
    blink: () => ({ speed: 2, colorOverlay: null, color1: null, color2: '#ffffff' }),
  };

  /** Ordered cycle for double-click: null → show → blink → null */
  static EFFECT_CYCLE = [null, 'show', 'blink'];

  // ---- Cell access ----

  /**
   * Get cell data at the given position.
   * @param {number} groupIndex - Row (0-based)
   * @param {number} sectionIndex - Column (0-based)
   * @returns {{ effect: string, config: object }|null}
   */
  getCell(groupIndex, sectionIndex) {
    if (groupIndex < 0 || sectionIndex < 0) return null;
    const row = this.#grid[groupIndex];
    if (!row) return null;
    return row[sectionIndex] ?? null;
  }

  /**
   * Set cell data at the given position.
   * @param {number} groupIndex
   * @param {number} sectionIndex
   * @param {{ effect: string, config: object }|null} data
   */
  setCell(groupIndex, sectionIndex, data) {
    if (groupIndex < 0 || sectionIndex < 0) return;
    this.#ensureSize(groupIndex, sectionIndex);
    this.#grid[groupIndex][sectionIndex] = data ? { ...data, config: { ...data.config } } : null;
  }

  /**
   * Set a cell to the given effect type with default config.
   * @param {number} groupIndex
   * @param {number} sectionIndex
   * @param {string} effectType - 'show', 'blink', etc.
   */
  setCellEffect(groupIndex, sectionIndex, effectType) {
    if (!ClipRecipe.EFFECTS[effectType]) return;
    this.setCell(groupIndex, sectionIndex, {
      effect: effectType,
      config: ClipRecipe.EFFECTS[effectType](),
    });
  }

  /**
   * Clear a single cell.
   * @param {number} groupIndex
   * @param {number} sectionIndex
   */
  clearCell(groupIndex, sectionIndex) {
    if (groupIndex < 0 || sectionIndex < 0) return;
    const row = this.#grid[groupIndex];
    if (row) row[sectionIndex] = null;
  }

  /**
   * Cycle a cell to its next effect state.
   * null → show → blink → null
   * @param {number} groupIndex
   * @param {number} sectionIndex
   * @returns {{ effect: string, config: object }|null} The new cell state
   */
  cycleCell(groupIndex, sectionIndex) {
    const current = this.getCell(groupIndex, sectionIndex);
    const cycle = ClipRecipe.EFFECT_CYCLE;
    const currentIdx = current ? cycle.indexOf(current.effect) : 0;
    const nextIdx = (currentIdx + 1) % cycle.length;
    const nextEffect = cycle[nextIdx];

    if (nextEffect === null) {
      this.clearCell(groupIndex, sectionIndex);
      return null;
    }

    this.setCellEffect(groupIndex, sectionIndex, nextEffect);
    return this.getCell(groupIndex, sectionIndex);
  }

  // ---- Bulk operations ----

  /**
   * Clear all cells in a group row.
   * @param {number} groupIndex
   */
  clearRow(groupIndex) {
    if (this.#grid[groupIndex]) {
      this.#grid[groupIndex] = [];
    }
  }

  /**
   * Fill all cells in a group row with an effect.
   * @param {number} groupIndex
   * @param {string} effectType - 'show', 'blink', etc.
   * @param {number} sectionCount - Number of sections to fill
   */
  fillRow(groupIndex, effectType, sectionCount) {
    for (let s = 0; s < sectionCount; s++) {
      this.setCellEffect(groupIndex, s, effectType);
    }
  }

  /**
   * Clear all cells in a section column.
   * @param {number} sectionIndex
   */
  clearColumn(sectionIndex) {
    for (const row of this.#grid) {
      if (row) row[sectionIndex] = null;
    }
  }

  /**
   * Clear specific cells.
   * @param {Array<{ groupIndex: number, sectionIndex: number }>} cells
   */
  clearSelected(cells) {
    for (const { groupIndex, sectionIndex } of cells) {
      this.clearCell(groupIndex, sectionIndex);
    }
  }

  /**
   * Clear the entire grid.
   */
  clearAll() {
    this.#grid = [];
  }

  // ---- Copy/paste ----

  /**
   * Extract a 2D block of cell data from the given cells.
   * Returns a block with relative positions (top-left = 0,0).
   * @param {Array<{ groupIndex: number, sectionIndex: number }>} cells
   * @returns {{ data: Array<Array<object|null>>, rows: number, cols: number }}
   */
  getCellBlock(cells) {
    if (!cells.length) return { data: [], rows: 0, cols: 0 };

    const minRow = Math.min(...cells.map(c => c.groupIndex));
    const maxRow = Math.max(...cells.map(c => c.groupIndex));
    const minCol = Math.min(...cells.map(c => c.sectionIndex));
    const maxCol = Math.max(...cells.map(c => c.sectionIndex));

    const rows = maxRow - minRow + 1;
    const cols = maxCol - minCol + 1;

    // Build empty block
    const data = Array.from({ length: rows }, () => Array(cols).fill(null));

    // Fill with deep-copied cell data
    for (const { groupIndex, sectionIndex } of cells) {
      const cell = this.getCell(groupIndex, sectionIndex);
      const r = groupIndex - minRow;
      const c = sectionIndex - minCol;
      data[r][c] = cell ? { effect: cell.effect, config: { ...cell.config } } : null;
    }

    return { data, rows, cols };
  }

  /**
   * Paste a copied block at the given anchor position.
   * @param {number} anchorGroup - Top-left row for paste
   * @param {number} anchorSection - Top-left column for paste
   * @param {{ data: Array<Array<object|null>>, rows: number, cols: number }} block
   */
  pasteCellBlock(anchorGroup, anchorSection, block) {
    for (let r = 0; r < block.rows; r++) {
      for (let c = 0; c < block.cols; c++) {
        const cellData = block.data[r]?.[c];
        const targetRow = anchorGroup + r;
        const targetCol = anchorSection + c;
        if (targetRow < 0 || targetCol < 0) continue;
        this.setCell(targetRow, targetCol,
          cellData ? { effect: cellData.effect, config: { ...cellData.config } } : null
        );
      }
    }
  }

  // ---- Dimensions ----

  /**
   * Get the current data extent (max row/col with non-null data).
   * @returns {{ rows: number, cols: number }}
   */
  getGridDimensions() {
    let maxRow = 0;
    let maxCol = 0;
    for (let r = 0; r < this.#grid.length; r++) {
      const row = this.#grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] !== null && row[c] !== undefined) {
          maxRow = Math.max(maxRow, r + 1);
          maxCol = Math.max(maxCol, c + 1);
        }
      }
    }
    return { rows: maxRow, cols: maxCol };
  }

  // ---- Video reference ----

  /**
   * Store the video reference.
   * @param {string|null} name - Video filename
   * @param {string|null} path - Video path (may not be restorable)
   */
  setVideoReference(name, path) {
    this.#videoRef = { name: name ?? null, path: path ?? null };
  }

  /**
   * Get the stored video reference.
   * @returns {{ name: string|null, path: string|null }}
   */
  getVideoReference() {
    return { ...this.#videoRef };
  }

  // ---- Serialization ----

  /**
   * Export the clip recipe as a plain object for JSON serialization.
   * Only includes non-null cells to keep the output compact.
   * @returns {object}
   */
  exportJSON() {
    const cells = [];
    for (let r = 0; r < this.#grid.length; r++) {
      const row = this.#grid[r];
      if (!row) continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c]) {
          cells.push({
            g: r,
            s: c,
            effect: row[c].effect,
            config: { ...row[c].config },
          });
        }
      }
    }
    return {
      version: 1,
      videoRef: { ...this.#videoRef },
      cells,
    };
  }

  /**
   * Import clip recipe from saved data.
   * Clears existing grid first. Silently ignores malformed data.
   * @param {object} data
   */
  importJSON(data) {
    this.#grid = [];
    this.#videoRef = { name: null, path: null };

    if (!data || typeof data !== 'object') return;
    if (data.videoRef) {
      this.#videoRef = {
        name: data.videoRef.name ?? null,
        path: data.videoRef.path ?? null,
      };
    }
    if (Array.isArray(data.cells)) {
      for (const cell of data.cells) {
        if (typeof cell.g !== 'number' || typeof cell.s !== 'number') continue;
        if (!cell.effect || !ClipRecipe.EFFECTS[cell.effect]) continue;
        this.setCell(cell.g, cell.s, {
          effect: cell.effect,
          config: cell.config ? { ...cell.config } : ClipRecipe.EFFECTS[cell.effect](),
        });
      }
    }
  }

  // ---- Private ----

  /**
   * Ensure the grid array is large enough for the given indices.
   */
  #ensureSize(groupIndex, sectionIndex) {
    while (this.#grid.length <= groupIndex) {
      this.#grid.push([]);
    }
    const row = this.#grid[groupIndex];
    while (row.length <= sectionIndex) {
      row.push(null);
    }
  }
}

export { ClipRecipe };
