/**
 * StitchPicker — Stitch palette panel with preview, radial rotation dial,
 * color/opacity controls, and display mode toggle for the freeform editor.
 *
 * Uses reusable controls from Controls.js for rotation, color, and opacity.
 *
 * Positioned as a DOM overlay on the right side of #canvas-container.
 * Simple mode (default): 5 common stitches. Advanced mode: all ~45 in categories.
 * S key toggles visibility.
 */

import {
  createNumberInput,
  createColorPicker,
  createOpacityControl,
  createRadialDial,
  injectControlStyles,
} from './Controls.js';

class StitchPicker {

  #bus;
  #state;
  #stitchLibrary;

  /** @type {string|null} */
  #activeStitchId = null;

  /** @type {'simple'|'advanced'} */
  #mode = 'simple';

  /** @type {'both'|'symbol'|'abbr'} */
  #displayMode = 'both';

  /** @type {boolean} */
  #visible = false;

  // DOM refs
  #el;
  #content;
  #modeToggle;
  #displayToggle;
  #previewCanvas;
  #previewLabel;

  // Reusable controls
  #rotationCtrl;
  #colorCtrl;
  #opacityCtrl;
  #dialCtrl;

  // Selection editing
  #selectionManager = null;
  #stitchStore = null;
  #history = null;
  /** @type {boolean} True when controls are reflecting a selection (not stamp config) */
  #editingSelection = false;

  constructor(bus, state, stitchLibrary) {
    this.#bus = bus;
    this.#state = state;
    this.#stitchLibrary = stitchLibrary;

    injectControlStyles();
    this.#injectStyles();
    this.#buildDOM();

    // Listen for selection changes
    bus.on('selection:changed', ({ ids }) => this.#onSelectionChanged(ids));
  }

  /**
   * Wire selection editing support.
   */
  setSelectionEditing(selectionManager, stitchStore, history) {
    this.#selectionManager = selectionManager;
    this.#stitchStore = stitchStore;
    this.#history = history;
  }

  // ---- Public API ----

  getActiveStitchId() { return this.#activeStitchId; }
  getRotation()       { return this.#rotationCtrl.getValue(); }
  getStampColor()     { return this.#colorCtrl.getValue(); }
  getStampOpacity()   { return this.#opacityCtrl.getNormalized(); }
  get isOpen()        { return this.#visible; }

  show()   { this.#visible = true;  this.#el.classList.add('open'); }
  hide()   { this.#visible = false; this.#el.classList.remove('open'); }
  toggle() { this.#visible ? this.hide() : this.show(); }

  // ---- Styles (picker-specific only, shared styles in Controls.js) ----

  #injectStyles() {
    if (document.getElementById('stitch-picker-styles')) return;

    const style = document.createElement('style');
    style.id = 'stitch-picker-styles';
    style.textContent = `
      .stitch-picker {
        position: fixed;
        left: 28px;
        bottom: 56px;
        background: var(--vd-surface);
        border: 1px solid var(--vd-border);
        border-radius: 8px;
        z-index: 99;
        pointer-events: auto;
        display: none;
        flex-direction: column;
        max-height: calc(100vh - 80px);
        min-width: 190px;
        max-width: 250px;
        font-family: 'Jost', sans-serif;
      }
      .stitch-picker.open { display: flex; }

      /* Header */
      .sp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px 6px;
        border-bottom: 1px solid var(--vd-border);
        flex-shrink: 0;
      }
      .sp-title {
        font-size: 11px;
        font-weight: 400;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--vd-text-muted);
      }
      .sp-header-btns {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .sp-small-btn {
        background: none;
        border: 1px solid var(--vd-border);
        border-radius: 4px;
        color: var(--vd-text-dim);
        font-family: inherit;
        font-size: 10px;
        padding: 2px 8px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      .sp-small-btn:hover {
        color: var(--vd-text);
        border-color: var(--vd-accent);
      }

      /* Snap/Link toggles */
      .sp-toggle-row {
        display: flex;
        justify-content: space-between;
        width: 100%;
        gap: 6px;
      }
      .sp-toggle-btn {
        flex: 1;
        background: none;
        border: 1px solid var(--vd-border);
        border-radius: 4px;
        color: var(--vd-text-muted);
        font-family: inherit;
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        padding: 3px 0;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
      }
      .sp-toggle-btn:hover {
        color: var(--vd-text-dim);
        border-color: var(--vd-text-dim);
      }
      .sp-toggle-btn.active {
        color: var(--vd-bg);
        background: rgba(255, 255, 255, 0.85);
        border-color: rgba(255, 255, 255, 0.85);
      }

      /* Preview area */
      .sp-preview {
        padding: 12px;
        border-bottom: 1px solid var(--vd-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        flex-shrink: 0;
      }
      .sp-preview-wrap {
        position: relative;
        width: 120px;
        height: 120px;
      }
      .sp-preview-canvas {
        width: 120px;
        height: 120px;
        border: 1px solid var(--vd-border);
        border-radius: 50%;
        background: var(--vd-surface-2);
        cursor: pointer;
      }
      .sp-preview-label {
        font-size: 11px;
        color: var(--vd-text-dim);
        text-align: center;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 100%;
      }

      /* Controls row */
      .sp-controls {
        display: flex;
        gap: 6px;
        align-items: flex-start;
        justify-content: center;
        width: 100%;
      }

      /* Content */
      .sp-content {
        overflow-y: auto;
        padding: 8px;
        flex: 1;
      }
      .sp-category-label {
        font-size: 10px;
        font-weight: 400;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--vd-text-muted);
        margin-bottom: 4px;
        margin-top: 8px;
      }
      .sp-category-label:first-child { margin-top: 0; }
      .sp-grid {
        display: flex;
        flex-wrap: wrap;
        gap: 3px;
        margin-bottom: 4px;
      }
      .sp-btn {
        width: 36px;
        height: 36px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: var(--vd-surface-2);
        border: 1px solid var(--vd-border);
        border-radius: 4px;
        color: var(--vd-text-dim);
        font-family: 'Jost', sans-serif;
        font-size: 10px;
        font-weight: 400;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s, box-shadow 0.15s;
        padding: 2px;
        line-height: 1;
        text-align: center;
        overflow: hidden;
        gap: 1px;
      }
      .sp-btn:hover {
        color: var(--vd-text);
        background: rgba(255, 255, 255, 0.06);
      }
      .sp-btn--active {
        color: var(--vd-bg);
        background: rgba(255, 255, 255, 0.85);
        border-color: rgba(255, 255, 255, 0.85);
      }
      .sp-btn-symbol {
        width: 20px;
        height: 16px;
      }
      .sp-btn-abbr {
        font-size: 8px;
        color: inherit;
        opacity: 0.7;
      }
    `;
    document.head.appendChild(style);
  }

  // ---- DOM ----

  #buildDOM() {
    const container = document.body;
    if (!container) return;

    this.#el = document.createElement('div');
    this.#el.className = 'stitch-picker';

    // Header
    const header = document.createElement('div');
    header.className = 'sp-header';

    const title = document.createElement('span');
    title.className = 'sp-title';
    title.textContent = 'Stitches';

    const headerBtns = document.createElement('div');
    headerBtns.className = 'sp-header-btns';

    this.#displayToggle = document.createElement('button');
    this.#displayToggle.className = 'sp-small-btn';
    this.#updateDisplayToggleLabel();
    this.#displayToggle.addEventListener('click', () => {
      const modes = ['both', 'symbol', 'abbr'];
      const idx = modes.indexOf(this.#displayMode);
      this.#displayMode = modes[(idx + 1) % modes.length];
      this.#updateDisplayToggleLabel();
      this.#renderContent();
    });
    headerBtns.appendChild(this.#displayToggle);

    this.#modeToggle = document.createElement('button');
    this.#modeToggle.className = 'sp-small-btn';
    this.#updateModeToggle();
    this.#modeToggle.addEventListener('click', () => {
      this.#mode = this.#mode === 'simple' ? 'advanced' : 'simple';
      this.#updateModeToggle();
      this.#renderContent();
    });
    headerBtns.appendChild(this.#modeToggle);

    header.appendChild(title);
    header.appendChild(headerBtns);

    // Preview area
    const preview = document.createElement('div');
    preview.className = 'sp-preview';

    // Snap/Link toggle row
    const toggleRow = document.createElement('div');
    toggleRow.className = 'sp-toggle-row';

    const snapBtn = document.createElement('button');
    snapBtn.className = 'sp-toggle-btn';
    snapBtn.textContent = 'Snap';
    snapBtn.title = 'Snap to Grid';
    snapBtn.addEventListener('click', () => {
      const on = !snapBtn.classList.contains('active');
      snapBtn.classList.toggle('active', on);
      this.#state.set('gridSnap', on);
    });
    toggleRow.appendChild(snapBtn);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'sp-toggle-btn';
    linkBtn.textContent = 'Link';
    linkBtn.title = 'Link to Grid';
    linkBtn.addEventListener('click', () => {
      const on = !linkBtn.classList.contains('active');
      linkBtn.classList.toggle('active', on);
      this.#state.set('gridLink', on);
    });
    toggleRow.appendChild(linkBtn);

    preview.appendChild(toggleRow);

    // Preview canvas with dial overlay
    const previewWrap = document.createElement('div');
    previewWrap.className = 'sp-preview-wrap';

    this.#previewCanvas = document.createElement('canvas');
    this.#previewCanvas.className = 'sp-preview-canvas';
    this.#previewCanvas.width = 240;
    this.#previewCanvas.height = 240;
    previewWrap.appendChild(this.#previewCanvas);

    // Radial dial (reusable)
    this.#dialCtrl = createRadialDial({
      target: this.#previewCanvas,
      value: 0,
      onChange: (deg) => {
        this.#rotationCtrl.setValue(deg);
        this.#state.set('stampRotation', deg);
        if (this.#editingSelection) {
          this.#applyToSelection({ rotation: -(deg * Math.PI / 180) });
        }
        this.#drawPreview();
      },
    });
    previewWrap.appendChild(this.#dialCtrl.el);

    preview.appendChild(previewWrap);

    // Stitch name label + clear button
    const labelRow = document.createElement('div');
    labelRow.style.cssText = 'display:flex;align-items:center;gap:4px;width:100%;justify-content:center;';

    this.#previewLabel = document.createElement('div');
    this.#previewLabel.className = 'sp-preview-label';
    this.#previewLabel.textContent = 'No stitch selected';
    labelRow.appendChild(this.#previewLabel);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'layer-btn';
    clearBtn.title = 'Clear selection';
    clearBtn.style.cssText = 'font-size:14px;width:20px;height:20px;flex-shrink:0;';
    clearBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">delete</span>';
    clearBtn.addEventListener('click', () => {
      this.#onStitchClick(this.#activeStitchId); // toggle off
    });
    labelRow.appendChild(clearBtn);

    preview.appendChild(labelRow);

    // Controls row (reusable controls)
    const controls = document.createElement('div');
    controls.className = 'sp-controls';

    this.#rotationCtrl = createNumberInput({
      label: 'Rot\u00B0',
      value: 0,
      min: 0,
      max: 359,
      step: 1,
      decimals: 1,
      onChange: (v) => {
        this.#dialCtrl.setValue(v);
        this.#state.set('stampRotation', v);
        if (this.#editingSelection) {
          this.#applyToSelection({ rotation: -(v * Math.PI / 180) });
        }
        this.#drawPreview();
      },
    });
    controls.appendChild(this.#rotationCtrl.el);

    this.#colorCtrl = createColorPicker({
      label: 'Color',
      value: '#ffffff',
      onChange: (color) => {
        this.#state.set('stampColor', color);
        if (this.#editingSelection) {
          this.#applyToSelection({ colorOverride: color });
        }
        this.#drawPreview();
      },
    });
    controls.appendChild(this.#colorCtrl.el);

    this.#opacityCtrl = createOpacityControl({
      label: 'Opacity',
      value: 100,
      onChange: (v) => {
        this.#state.set('stampOpacity', v / 100);
        if (this.#editingSelection) {
          this.#applyToSelection({ opacity: v / 100 });
        }
        this.#drawPreview();
      },
    });
    controls.appendChild(this.#opacityCtrl.el);

    preview.appendChild(controls);

    // Content (stitch grid)
    this.#content = document.createElement('div');
    this.#content.className = 'sp-content';

    this.#el.appendChild(header);
    this.#el.appendChild(preview);
    this.#el.appendChild(this.#content);
    container.appendChild(this.#el);

    this.#renderContent();
    this.#drawPreview();
  }

  // ---- Preview drawing ----

  #drawPreview() {
    const canvas = this.#previewCanvas;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!this.#activeStitchId) return;

    const stitch = this.#stitchLibrary.get(this.#activeStitchId);
    if (!stitch || !stitch.draw) return;

    const rotation = this.#rotationCtrl.getValue();
    const color = this.#colorCtrl.getValue();
    const opacity = this.#opacityCtrl.getNormalized();

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(rotation * Math.PI / 180);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    stitch.draw(ctx, 0, 0, canvas.width * 0.7);
    ctx.restore();
  }

  // ---- Render stitch grid ----

  #renderContent() {
    this.#content.innerHTML = '';

    if (this.#mode === 'simple') {
      const stitches = this.#stitchLibrary.getSimplePalette();
      const grid = document.createElement('div');
      grid.className = 'sp-grid';
      for (const s of stitches) grid.appendChild(this.#createBtn(s));
      this.#content.appendChild(grid);
    } else {
      const categories = this.#stitchLibrary.getCategories();
      for (const cat of categories) {
        if (cat.stitches.length === 0) continue;
        const label = document.createElement('div');
        label.className = 'sp-category-label';
        label.textContent = cat.label;
        this.#content.appendChild(label);

        const grid = document.createElement('div');
        grid.className = 'sp-grid';
        for (const s of cat.stitches) grid.appendChild(this.#createBtn(s));
        this.#content.appendChild(grid);
      }
    }
  }

  #createBtn(stitch) {
    const btn = document.createElement('button');
    btn.className = 'sp-btn';
    if (this.#activeStitchId === stitch.id) btn.classList.add('sp-btn--active');
    btn.title = `${stitch.nameUS} (${stitch.abbrUS})`;

    if (this.#displayMode === 'symbol' || this.#displayMode === 'both') {
      const symbolCanvas = document.createElement('canvas');
      symbolCanvas.className = 'sp-btn-symbol';
      symbolCanvas.width = 40;
      symbolCanvas.height = 32;
      this.#drawSymbolMini(symbolCanvas, stitch);
      btn.appendChild(symbolCanvas);
    }

    if (this.#displayMode === 'abbr' || this.#displayMode === 'both') {
      const abbr = document.createElement('span');
      abbr.className = 'sp-btn-abbr';
      abbr.textContent = stitch.abbrUS;
      btn.appendChild(abbr);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.#onStitchClick(stitch.id);
    });

    return btn;
  }

  #drawSymbolMini(canvas, stitch) {
    if (!stitch.draw) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#cccccc';
    ctx.fillStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);
    stitch.draw(ctx, canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height));
  }

  // ---- Click handler ----

  #onStitchClick(stitchId) {
    if (this.#activeStitchId === stitchId) {
      this.#activeStitchId = null;
    } else {
      this.#activeStitchId = stitchId;
    }

    this.#state.set('activeStitch', this.#activeStitchId);
    this.#bus.emit('stitch:active-changed', { stitchId: this.#activeStitchId });

    const stitch = this.#activeStitchId ? this.#stitchLibrary.get(this.#activeStitchId) : null;
    this.#previewLabel.textContent = stitch ? `${stitch.nameUS} (${stitch.abbrUS})` : 'No stitch selected';

    this.#drawPreview();
    this.#renderContent();
  }

  // ---- Selection editing ----

  #onSelectionChanged(ids) {
    if (!this.#stitchStore || !ids || ids.length === 0) {
      this.#editingSelection = false;
      return;
    }

    this.#editingSelection = true;
    const stamps = this.#stitchStore.getByIds(ids);
    if (stamps.length === 0) { this.#editingSelection = false; return; }

    // Load first stamp's stitch type into preview
    const first = stamps[0];
    if (first.type === 'stitch' && first.stitchType) {
      this.#activeStitchId = first.stitchType;
      const stitch = this.#stitchLibrary.get(first.stitchType);
      this.#previewLabel.textContent = stitch
        ? `${stitch.nameUS} (${stitch.abbrUS})`
        : first.stitchType;
    }

    // Rotation: show value if all same, "--" if mixed
    const rotDeg = stamps.map(s => Math.round((-s.rotation * 180 / Math.PI) * 10) / 10);
    const allSameRot = rotDeg.every(r => r === rotDeg[0]);
    if (allSameRot) {
      const v = ((rotDeg[0] % 360) + 360) % 360;
      this.#rotationCtrl.setValue(v);
      this.#dialCtrl.setValue(v);
    } else {
      this.#rotationCtrl.setMixed();
    }

    // Color: show first stamp's color
    const color = first.colorOverride || '#ffffff';
    this.#colorCtrl.setValue(color);

    // Opacity: show value if all same, "--" if mixed
    const opacities = stamps.map(s => Math.round((s.opacity ?? 1) * 100));
    const allSameOp = opacities.every(o => o === opacities[0]);
    if (allSameOp) {
      this.#opacityCtrl.setValue(opacities[0]);
    } else {
      this.#opacityCtrl.setMixed();
    }

    this.#drawPreview();
    this.#renderContent();
  }

  /**
   * Apply a property change to all selected stamps.
   */
  #applyToSelection(props) {
    if (!this.#editingSelection || !this.#selectionManager || !this.#stitchStore) return;
    const ids = this.#selectionManager.selectedArray;
    if (ids.length === 0) return;

    const updates = ids.map(id => ({ id, props }));
    this.#stitchStore.batchUpdate(updates);
  }

  // ---- UI updates ----

  #updateModeToggle() {
    this.#modeToggle.textContent = this.#mode === 'simple' ? 'All' : 'Simple';
  }

  #updateDisplayToggleLabel() {
    const labels = { both: 'A+S', symbol: 'Sym', abbr: 'Abbr' };
    this.#displayToggle.textContent = labels[this.#displayMode];
  }
}

export { StitchPicker };
