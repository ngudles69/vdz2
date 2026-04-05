/**
 * ClipBuilderPanel — Visual grid editor for clip recipes.
 *
 * Rows = stitch groups, Columns = video sections (bookmark-derived).
 * Each cell maps a group to a section with an effect (Show, Blink, etc.).
 * Supports selection, double-click cycling, copy/paste, bulk operations,
 * and touch interaction.
 */
import { ClipRecipe } from '../modules/ClipRecipe.js';

// ---- SVG icons for effects ----
const EFFECT_ICONS = {
  show: `<svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor"><path d="M10 4C5 4 1.7 7.3 1 10c.7 2.7 4 6 9 6s8.3-3.3 9-6c-.7-2.7-4-6-9-6zm0 10a4 4 0 110-8 4 4 0 010 8zm0-6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/></svg>`,
  blink: `<svg viewBox="0 0 20 20" width="24" height="24" fill="currentColor"><path d="M10 2l2.5 5.5L18 8.5l-4 4 1 5.5-5-2.5-5 2.5 1-5.5-4-4 5.5-1z"/></svg>`,
};

/** Default group colors when SetManager has no color set */
const DEFAULT_GROUP_COLORS = [
  '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#f44336',
  '#00bcd4', '#ffeb3b', '#e91e63', '#8bc34a', '#3f51b5',
  '#ff5722', '#009688', '#ffc107', '#673ab7', '#795548',
  '#607d8b', '#cddc39', '#03a9f4', '#ff4081', '#76ff03',
];

class ClipBuilderPanel {

  /** @type {import('../core/EventBus.js').EventBus} */
  #bus;

  /** @type {ClipRecipe} */
  #recipe;

  /** @type {import('../modules/SetManager.js').SetManager} */
  #setManager;

  /** @type {import('./VideoZone.js').VideoZone} */
  #videoZone;

  /** @type {HTMLElement} */
  #container;

  /** @type {HTMLElement} */
  #panel;

  /** @type {HTMLElement} */
  #tableWrap;

  /** @type {boolean} */
  #visible = false;

  /** @type {string} 'icon-words' | 'icon' | 'words' */
  #displayMode = 'icon-words';

  // ---- Selection state ----

  /** @type {Set<string>} Set of "row,col" keys */
  #selected = new Set();

  /** @type {{ row: number, col: number }|null} Last clicked cell for shift-range */
  #anchor = null;

  // ---- Copy buffer ----

  /** @type {{ data: Array<Array<object|null>>, rows: number, cols: number }|null} */
  #clipboard = null;

  // ---- Drag select ----

  /** @type {boolean} */
  #dragging = false;

  /** @type {{ row: number, col: number }|null} */
  #dragStart = null;

  // ---- Config popup ----

  /** @type {HTMLElement|null} */
  #configPopup = null;

  /** @type {{ row: number, col: number }|null} */
  #configCell = null;

  // ---- Long-press (touch) ----

  /** @type {number|null} */
  #longPressTimer = null;

  constructor(bus, recipe, setManager, videoZone) {
    this.#bus = bus;
    this.#recipe = recipe;
    this.#setManager = setManager;
    this.#videoZone = videoZone;

    this.#buildPanel();
    this.#listenEvents();
    this.#listenKeyboard();
  }

  // ================================================================
  // Public API
  // ================================================================

  show() { this.#visible = true; this.#panel.style.display = 'flex'; this.refresh(); }
  hide() { this.#visible = false; this.#panel.style.display = 'none'; this.#closeConfigPopup(); }
  toggle() { this.#visible ? this.hide() : this.show(); }
  get visible() { return this.#visible; }
  get recipe() { return this.#recipe; }

  setDisplayMode(mode) {
    if (['icon-words', 'icon', 'words'].includes(mode)) {
      this.#displayMode = mode;
      this.refresh();
    }
  }

  refresh() {
    if (!this.#visible) return;
    this.#renderGrid();
  }

  // ================================================================
  // Panel construction
  // ================================================================

  #buildPanel() {
    this.#panel = document.createElement('div');
    this.#panel.className = 'clip-builder-panel';
    this.#panel.style.display = 'none';

    // Header
    const header = document.createElement('div');
    header.className = 'cb-header';
    header.innerHTML = `
      <span class="cb-title">Clip Builder</span>
      <div class="cb-header-actions">
        <button class="cb-mode-btn" title="Display mode">
          <span class="material-symbols-rounded" style="font-size:28px;">view_module</span>
        </button>
        <button class="cb-clear-btn" title="Clear all">
          <span class="material-symbols-rounded" style="font-size:28px;">delete_sweep</span>
        </button>
        <button class="cb-close-btn" title="Close">
          <span class="material-symbols-rounded" style="font-size:28px;">close</span>
        </button>
      </div>
    `;

    header.querySelector('.cb-close-btn').addEventListener('click', () => this.hide());
    header.querySelector('.cb-clear-btn').addEventListener('click', () => {
      this.#recipe.clearAll();
      this.#selected.clear();
      this.refresh();
      this.#emitChanged();
    });
    header.querySelector('.cb-mode-btn').addEventListener('click', () => {
      const modes = ['icon-words', 'icon', 'words'];
      const idx = modes.indexOf(this.#displayMode);
      this.#displayMode = modes[(idx + 1) % modes.length];
      this.refresh();
    });

    // Table wrapper (scrollable)
    this.#tableWrap = document.createElement('div');
    this.#tableWrap.className = 'cb-table-wrap';

    this.#panel.appendChild(header);
    this.#panel.appendChild(this.#tableWrap);

    // Insert into DOM — below the canvas container, above the video zone
    const videoZoneEl = document.getElementById('video-zone');
    if (videoZoneEl && videoZoneEl.parentNode) {
      videoZoneEl.parentNode.insertBefore(this.#panel, videoZoneEl);
    } else {
      document.querySelector('.app-container').appendChild(this.#panel);
    }

    // Add CSS
    this.#injectStyles();
  }

  // ================================================================
  // Grid rendering
  // ================================================================

  #renderGrid() {
    const sections = this.#videoZone.hasVideo ? this.#videoZone.sections : [];
    const allSets = this.#setManager.getAllSets();
    // Only show groups that have stitches assigned or have clip recipe data
    const recipeDims = this.#recipe.getGridDimensions();
    const visibleRows = []; // { index, set }
    allSets.forEach((s, i) => {
      if (s.count > 0 || i < recipeDims.rows) visibleRows.push({ index: i, set: s });
    });
    const numCols = Math.max(sections.length, recipeDims.cols, 1);
    const numRows = visibleRows.length;
    const videoDuration = this.#videoZone.hasVideo ? this.#videoZone.videoElement.duration : 0;

    // Nothing to show — display hint and collapse
    if (numRows === 0 || (sections.length === 0 && recipeDims.cols === 0)) {
      this.#tableWrap.innerHTML = '';
      const hint = document.createElement('div');
      hint.className = 'cb-empty-hint';
      hint.textContent = numRows === 0
        ? 'Assign stitches to groups first.'
        : 'Load a video and add bookmarks to create sections.';
      this.#tableWrap.appendChild(hint);
      return;
    }

    const table = document.createElement('table');
    table.className = 'cb-table';

    // ---- Header row ----
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');

    // Top-left corner cell
    const cornerTh = document.createElement('th');
    cornerTh.className = 'cb-corner';
    cornerTh.textContent = 'Sections';
    headerRow.appendChild(cornerTh);

    // Section columns
    for (let c = 0; c < numCols; c++) {
      const th = document.createElement('th');
      th.className = 'cb-section-header';
      const num = document.createElement('div');
      num.className = 'cb-section-num';
      num.textContent = `${c + 1}`;
      th.appendChild(num);

      if (sections[c]) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'cb-section-time';
        const start = this.#fmtTime(sections[c].start);
        const end = this.#fmtTime(sections[c].end);
        timeDiv.textContent = `${start} - ${end}`;

        // Check if section exceeds video duration
        if (videoDuration > 0 && sections[c].start >= videoDuration) {
          th.classList.add('cb-invalid-section');
        } else if (videoDuration > 0 && sections[c].end > videoDuration) {
          th.classList.add('cb-partial-section');
        }

        th.appendChild(timeDiv);
      }
      headerRow.appendChild(th);
    }

    // Actions column header
    const actionsTh = document.createElement('th');
    actionsTh.className = 'cb-actions-header';
    actionsTh.textContent = 'ACTIONS';
    headerRow.appendChild(actionsTh);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    // ---- Body rows ----
    const tbody = document.createElement('tbody');

    for (let vi = 0; vi < numRows; vi++) {
      const { index: r, set } = visibleRows[vi];
      const tr = document.createElement('tr');
      const hasStitches = set ? set.count > 0 : false;
      const groupColor = set?.color || DEFAULT_GROUP_COLORS[r % DEFAULT_GROUP_COLORS.length];

      // Row header
      const rowTh = document.createElement('th');
      rowTh.className = 'cb-group-header';
      if (!hasStitches) rowTh.classList.add('cb-empty-group');
      const colorDot = document.createElement('span');
      colorDot.className = 'cb-group-dot';
      colorDot.style.background = groupColor;
      rowTh.appendChild(colorDot);
      rowTh.appendChild(document.createTextNode(`Group ${r + 1}`));
      tr.appendChild(rowTh);

      // Data cells
      for (let c = 0; c < numCols; c++) {
        const td = document.createElement('td');
        td.className = 'cb-cell';
        td.dataset.row = r;
        td.dataset.col = c;

        const cellData = this.#recipe.getCell(r, c);
        if (cellData) {
          td.classList.add(`cb-effect-${cellData.effect}`);

          if (cellData.effect === 'blink') {
            // Diagonal split between the two blink colors
            const c1 = cellData.config.color1;
            const c2 = cellData.config.color2;
            const bg1 = c1 ? `${c1}55` : 'rgba(255,255,255,0.08)';
            const bg2 = c2 ? `${c2}55` : 'rgba(255,255,255,0.08)';
            td.style.background = `linear-gradient(135deg, ${bg1} 50%, ${bg2} 50%)`;
            if (!c1 && !c2) td.classList.add('cb-no-color');
            // Use color1 for icon/label if available, else color2, else dim
            const displayColor = c1 || c2 || null;
            if (displayColor) td.style.setProperty('--group-color', displayColor);
            else td.classList.add('cb-no-color');
          } else if (cellData.config.colorOverlay) {
            td.style.setProperty('--group-color', cellData.config.colorOverlay);
          } else {
            td.classList.add('cb-no-color');
          }

          // Render cell content based on display mode
          const displayColor = cellData.effect === 'blink'
            ? (cellData.config.color1 || cellData.config.color2 || null)
            : cellData.config.colorOverlay;
          const content = this.#renderCellContent(cellData, displayColor);
          td.appendChild(content);
        }

        // Selection highlight
        if (this.#selected.has(`${r},${c}`)) {
          td.classList.add('cb-selected');
        }

        // Partial fill for sections exceeding video
        if (sections[c] && videoDuration > 0 && sections[c].start < videoDuration && sections[c].end > videoDuration) {
          const validPct = ((videoDuration - sections[c].start) / (sections[c].end - sections[c].start)) * 100;
          td.style.setProperty('--valid-pct', `${validPct}%`);
          td.classList.add('cb-partial-cell');
        }

        // Pointer events
        td.addEventListener('pointerdown', (e) => this.#onCellPointerDown(e, r, c));
        td.addEventListener('pointerenter', (e) => this.#onCellPointerEnter(e, r, c));
        td.addEventListener('dblclick', (e) => this.#onCellDblClick(e, r, c));

        // Touch: long-press for config
        td.addEventListener('touchstart', (e) => this.#onTouchStart(e, r, c), { passive: true });
        td.addEventListener('touchend', () => this.#onTouchEnd(), { passive: true });
        td.addEventListener('touchmove', () => this.#onTouchEnd(), { passive: true });

        // Context menu (right-click) for config
        td.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          const cell = this.#recipe.getCell(r, c);
          if (cell) this.#openConfigPopup(r, c, td);
        });

        tr.appendChild(td);
      }

      // Actions column
      const actionsTd = document.createElement('td');
      actionsTd.className = 'cb-actions-cell';
      const showAllBtn = document.createElement('button');
      showAllBtn.className = 'cb-action-btn';
      showAllBtn.textContent = 'Show All';
      showAllBtn.addEventListener('click', () => {
        this.#recipe.fillRow(r, 'show', numCols);
        this.refresh();
        this.#emitChanged();
      });
      const hideAllBtn = document.createElement('button');
      hideAllBtn.className = 'cb-action-btn';
      hideAllBtn.textContent = 'Clear All';
      hideAllBtn.addEventListener('click', () => {
        this.#recipe.clearRow(r);
        this.refresh();
        this.#emitChanged();
      });
      actionsTd.appendChild(showAllBtn);
      actionsTd.appendChild(document.createTextNode(' | '));
      actionsTd.appendChild(hideAllBtn);
      tr.appendChild(actionsTd);

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    this.#tableWrap.innerHTML = '';
    this.#tableWrap.appendChild(table);
  }

  #renderCellContent(cellData, groupColor) {
    const wrap = document.createElement('div');
    wrap.className = 'cb-cell-content';

    if (this.#displayMode !== 'words') {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'cb-cell-icon';
      iconSpan.innerHTML = EFFECT_ICONS[cellData.effect] || '';
      wrap.appendChild(iconSpan);
    }

    if (this.#displayMode !== 'icon') {
      const label = document.createElement('span');
      label.className = 'cb-cell-label';
      label.textContent = cellData.effect.charAt(0).toUpperCase() + cellData.effect.slice(1);
      wrap.appendChild(label);
    }

    return wrap;
  }

  // ================================================================
  // Cell interaction
  // ================================================================

  #onCellPointerDown(e, row, col) {
    // Ignore right-click (handled by contextmenu)
    if (e.button === 2) return;

    e.preventDefault();
    this.#closeConfigPopup();

    // Alt+Click = clear cell
    if (e.altKey) {
      this.#recipe.clearCell(row, col);
      this.refresh();
      this.#emitChanged();
      return;
    }

    if (e.shiftKey && this.#anchor) {
      // Range select
      this.#selectRange(this.#anchor.row, this.#anchor.col, row, col);
    } else if (e.ctrlKey || e.metaKey) {
      // Toggle select
      const key = `${row},${col}`;
      if (this.#selected.has(key)) this.#selected.delete(key);
      else this.#selected.add(key);
      this.#anchor = { row, col };
    } else {
      // Single select + start drag
      this.#selected.clear();
      this.#selected.add(`${row},${col}`);
      this.#anchor = { row, col };
      this.#dragging = true;
      this.#dragStart = { row, col };
    }

    this.#refreshSelection();
  }

  #onCellPointerEnter(e, row, col) {
    if (!this.#dragging) return;
    // Expand selection from drag start to current
    this.#selectRange(this.#dragStart.row, this.#dragStart.col, row, col);
    this.#refreshSelection();
  }

  #onCellDblClick(e, row, col) {
    e.preventDefault();
    this.#recipe.cycleCell(row, col);
    this.refresh();
    this.#emitChanged();
  }

  // ---- Touch ----

  #onTouchStart(e, row, col) {
    this.#longPressTimer = setTimeout(() => {
      const cell = this.#recipe.getCell(row, col);
      if (cell) {
        const td = this.#tableWrap.querySelector(`td[data-row="${row}"][data-col="${col}"]`);
        if (td) this.#openConfigPopup(row, col, td);
      }
      this.#longPressTimer = null;
    }, 500);
  }

  #onTouchEnd() {
    if (this.#longPressTimer) {
      clearTimeout(this.#longPressTimer);
      this.#longPressTimer = null;
    }
  }

  // ---- Selection helpers ----

  #selectRange(r1, c1, r2, c2) {
    this.#selected.clear();
    const minR = Math.min(r1, r2), maxR = Math.max(r1, r2);
    const minC = Math.min(c1, c2), maxC = Math.max(c1, c2);
    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        this.#selected.add(`${r},${c}`);
      }
    }
  }

  #refreshSelection() {
    const cells = this.#tableWrap.querySelectorAll('.cb-cell');
    cells.forEach(td => {
      const key = `${td.dataset.row},${td.dataset.col}`;
      td.classList.toggle('cb-selected', this.#selected.has(key));
    });
  }

  #getSelectedCells() {
    return [...this.#selected].map(key => {
      const [r, c] = key.split(',').map(Number);
      return { groupIndex: r, sectionIndex: c };
    });
  }

  // ================================================================
  // Config popup
  // ================================================================

  #openConfigPopup(row, col, anchorEl) {
    this.#closeConfigPopup();
    const cell = this.#recipe.getCell(row, col);
    if (!cell) return;

    this.#configCell = { row, col };

    const popup = document.createElement('div');
    popup.className = 'cb-config-popup';

    const title = document.createElement('div');
    title.className = 'cb-config-title';
    title.textContent = `${cell.effect.charAt(0).toUpperCase() + cell.effect.slice(1)} Config`;
    popup.appendChild(title);

    if (cell.effect === 'blink') {
      // Speed
      const speedRow = this.#createConfigRow('Speed (flashes/sec)', 'number', cell.config.speed ?? 2, (v) => {
        cell.config.speed = parseFloat(v) || 2;
        this.#recipe.setCell(row, col, cell);
        this.#emitChanged();
      });
      popup.appendChild(speedRow);

      // Color 1
      const sets = this.#setManager.getAllSets();
      const groupColor = sets[row]?.color || DEFAULT_GROUP_COLORS[row % DEFAULT_GROUP_COLORS.length];
      const color1Row = this.#createConfigRow('Color 1', 'color', cell.config.color1 || groupColor, (v) => {
        cell.config.color1 = v;
        this.#recipe.setCell(row, col, cell);
        this.#emitChanged();
      });
      popup.appendChild(color1Row);

      // Color 2
      const color2Row = this.#createConfigRow('Color 2', 'color', cell.config.color2 || '#ffffff', (v) => {
        cell.config.color2 = v;
        this.#recipe.setCell(row, col, cell);
        this.#emitChanged();
      });
      popup.appendChild(color2Row);
    } else if (cell.effect === 'show') {
      const note = document.createElement('div');
      note.className = 'cb-config-note';
      note.textContent = 'Static display — no animation parameters.';
      popup.appendChild(note);
    }

    // Apply to selected button
    if (this.#selected.size > 1) {
      const applyBtn = document.createElement('button');
      applyBtn.className = 'cb-config-apply-btn';
      applyBtn.textContent = 'Apply to selected';
      applyBtn.addEventListener('click', () => {
        for (const sel of this.#getSelectedCells()) {
          const existing = this.#recipe.getCell(sel.groupIndex, sel.sectionIndex);
          if (existing && existing.effect === cell.effect) {
            this.#recipe.setCell(sel.groupIndex, sel.sectionIndex, {
              effect: cell.effect,
              config: { ...cell.config },
            });
          }
        }
        this.refresh();
        this.#emitChanged();
        this.#closeConfigPopup();
      });
      popup.appendChild(applyBtn);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'cb-config-close';
    closeBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:14px;">close</span>';
    closeBtn.addEventListener('click', () => this.#closeConfigPopup());
    popup.appendChild(closeBtn);

    // Position near anchor
    document.body.appendChild(popup);
    const rect = anchorEl.getBoundingClientRect();
    let top = rect.bottom + 4;
    let left = rect.left;

    // Keep within viewport
    requestAnimationFrame(() => {
      const popRect = popup.getBoundingClientRect();
      if (top + popRect.height > window.innerHeight) top = rect.top - popRect.height - 4;
      if (left + popRect.width > window.innerWidth) left = window.innerWidth - popRect.width - 8;
      if (left < 0) left = 8;
      popup.style.top = `${top}px`;
      popup.style.left = `${left}px`;
    });
    popup.style.top = `${top}px`;
    popup.style.left = `${left}px`;

    this.#configPopup = popup;

    // Close on outside click
    setTimeout(() => {
      document.addEventListener('pointerdown', this.#onDocClickForPopup, { once: false });
    }, 0);
  }

  #onDocClickForPopup = (e) => {
    if (this.#configPopup && !this.#configPopup.contains(e.target)) {
      this.#closeConfigPopup();
    }
  };

  #closeConfigPopup() {
    if (this.#configPopup) {
      this.#configPopup.remove();
      this.#configPopup = null;
      this.#configCell = null;
      document.removeEventListener('pointerdown', this.#onDocClickForPopup);
    }
  }

  #createConfigRow(label, type, value, onChange) {
    const row = document.createElement('div');
    row.className = 'cb-config-row';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    row.appendChild(lbl);

    if (type === 'number') {
      const input = document.createElement('input');
      input.type = 'number';
      input.value = value;
      input.min = '0.1';
      input.max = '20';
      input.step = '0.5';
      input.addEventListener('change', () => onChange(input.value));
      row.appendChild(input);
    } else if (type === 'color') {
      const input = document.createElement('input');
      input.type = 'color';
      input.value = value;
      input.addEventListener('input', () => onChange(input.value));
      row.appendChild(input);
    }

    return row;
  }

  // ================================================================
  // Keyboard handling
  // ================================================================

  #listenKeyboard() {
    document.addEventListener('keydown', (e) => {
      if (!this.#visible) return;
      // Don't capture if user is typing in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (this.#selected.size > 0) {
          e.preventDefault();
          this.#recipe.clearSelected(this.#getSelectedCells());
          this.refresh();
          this.#emitChanged();
        }
      }

      // Copy
      if ((e.ctrlKey || e.metaKey) && e.key === 'c' && this.#selected.size > 0) {
        // Only intercept if panel is visible and cells are selected
        e.preventDefault();
        this.#clipboard = this.#recipe.getCellBlock(this.#getSelectedCells());
        // Resolve null colors to actual group colors so paste preserves them
        const sets = this.#setManager.getAllSets();
        const cells = this.#getSelectedCells();
        const minRow = Math.min(...cells.map(c => c.groupIndex));
        for (let r = 0; r < this.#clipboard.rows; r++) {
          for (let c = 0; c < this.#clipboard.cols; c++) {
            const cell = this.#clipboard.data[r]?.[c];
            if (!cell) continue;
            const srcGroupIdx = minRow + r;
            const groupColor = sets[srcGroupIdx]?.color || DEFAULT_GROUP_COLORS[srcGroupIdx % DEFAULT_GROUP_COLORS.length];
            if (!cell.config.colorOverlay) cell.config.colorOverlay = groupColor;
            if (cell.config.color1 !== undefined && !cell.config.color1) cell.config.color1 = groupColor;
          }
        }
      }

      // Paste
      if ((e.ctrlKey || e.metaKey) && e.key === 'v' && this.#clipboard && this.#anchor) {
        e.preventDefault();
        this.#recipe.pasteCellBlock(this.#anchor.row, this.#anchor.col, this.#clipboard);
        this.refresh();
        this.#emitChanged();
      }

      // Select all (Ctrl+A when panel focused)
      if ((e.ctrlKey || e.metaKey) && e.key === 'a' && this.#panel.contains(document.activeElement)) {
        e.preventDefault();
        const sections = this.#videoZone.hasVideo ? this.#videoZone.sections : [];
        const sets = this.#setManager.getAllSets();
        const numCols = Math.max(sections.length, this.#recipe.getGridDimensions().cols, 1);
        const numRows = Math.max(sets.length, this.#recipe.getGridDimensions().rows, 1);
        for (let r = 0; r < numRows; r++) {
          for (let c = 0; c < numCols; c++) {
            this.#selected.add(`${r},${c}`);
          }
        }
        this.#refreshSelection();
      }
    });

    // End drag on pointerup anywhere
    document.addEventListener('pointerup', () => {
      this.#dragging = false;
    });
  }

  // ================================================================
  // Event wiring
  // ================================================================

  #listenEvents() {
    // Video events → refresh grid
    this.#bus.on('video:loaded', () => {
      const vz = this.#videoZone;
      this.#recipe.setVideoReference(vz.videoElement?.src ? this.#getVideoName() : null, null);
      this.refresh();
    });

    this.#bus.on('video:unloaded', () => {
      this.refresh();
    });

    this.#bus.on('video:bookmark-added', () => {
      this.refresh();
      this.#bus.emit('toast', 'Bookmark added — review clip grid');
    });

    this.#bus.on('video:bookmark-removed', () => {
      this.refresh();
      this.#bus.emit('toast', 'Bookmark removed — review clip grid');
    });

    this.#bus.on('video:bookmarks-changed', () => {
      this.refresh();
    });

    // Set changes → refresh grid
    this.#bus.on('set:changed', () => {
      this.refresh();
    });
  }

  #getVideoName() {
    const nameEl = document.getElementById('vc-name');
    return nameEl ? nameEl.textContent : null;
  }

  #emitChanged() {
    this.#bus.emit('clipbuilder:recipe-changed');
  }

  // ================================================================
  // Utilities
  // ================================================================

  #fmtTime(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}`;
  }

  // ================================================================
  // Styles
  // ================================================================

  #injectStyles() {
    if (document.getElementById('clip-builder-styles')) return;
    const style = document.createElement('style');
    style.id = 'clip-builder-styles';
    style.textContent = `
      .clip-builder-panel {
        flex-shrink: 0;
        background: var(--vd-surface, #13131a);
        border-top: 1px solid var(--vd-border, #2a2a38);
        display: flex;
        flex-direction: column;
        max-height: 50vh;
        overflow: hidden;
      }

      .cb-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 16px;
        height: 42px;
        flex-shrink: 0;
        border-bottom: 1px solid var(--vd-border, #2a2a38);
      }

      .cb-title {
        font-size: 18px;
        font-weight: 400;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--vd-text-muted);
      }

      .cb-header-actions {
        display: flex;
        gap: 4px;
      }

      .cb-header-actions button {
        background: none;
        border: none;
        color: var(--vd-text-dim);
        cursor: pointer;
        width: 34px;
        height: 34px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        padding: 0;
        font-size: 22px;
      }

      .cb-header-actions button:hover {
        color: var(--vd-text);
      }

      .cb-table-wrap {
        overflow: auto;
        flex: 1;
      }

      .cb-empty-hint {
        padding: 16px;
        text-align: center;
        font-size: 14px;
        color: var(--vd-text-muted);
      }

      .cb-table {
        border-collapse: collapse;
        font-family: 'Jost', sans-serif;
        font-size: 14px;
        width: max-content;
        margin: 0 auto;
      }

      .cb-table thead th {
        position: sticky;
        top: 0;
        z-index: 2;
        background: var(--vd-surface, #13131a);
      }

      .cb-corner {
        position: sticky;
        left: 0;
        z-index: 3;
        background: var(--vd-surface, #13131a);
        font-size: 14px;
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vd-text-muted);
        padding: 8px 14px;
        text-align: left;
        min-width: 120px;
        border-right: 1px solid var(--vd-border, #2a2a38);
        border-bottom: 1px solid var(--vd-border, #2a2a38);
      }

      .cb-section-header {
        padding: 8px 10px;
        text-align: center;
        min-width: 120px;
        border-bottom: 1px solid var(--vd-border, #2a2a38);
        border-right: 1px solid rgba(255,255,255,0.03);
      }

      .cb-section-num {
        font-weight: 500;
        color: var(--vd-text-dim);
        font-size: 16px;
      }

      .cb-section-time {
        font-size: 12px;
        color: var(--vd-text-muted);
        white-space: nowrap;
      }

      .cb-section-header.cb-invalid-section {
        background: rgba(252, 92, 92, 0.15);
      }

      .cb-section-header.cb-invalid-section .cb-section-time {
        color: var(--vd-error, #fc5c5c);
        text-decoration: line-through;
      }

      .cb-section-header.cb-partial-section {
        background: rgba(252, 186, 92, 0.1);
      }

      .cb-actions-header {
        font-size: 12px;
        font-weight: 400;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vd-text-muted);
        padding: 8px 14px;
        text-align: center;
        border-bottom: 1px solid var(--vd-border, #2a2a38);
        position: sticky;
        right: 0;
        background: var(--vd-surface, #13131a);
      }

      .cb-group-header {
        position: sticky;
        left: 0;
        z-index: 1;
        background: var(--vd-surface, #13131a);
        padding: 8px 14px;
        text-align: left;
        white-space: nowrap;
        font-size: 16px;
        font-weight: 400;
        color: var(--vd-text-dim);
        border-right: 1px solid var(--vd-border, #2a2a38);
        border-bottom: 1px solid rgba(255,255,255,0.03);
        min-width: 120px;
      }

      .cb-group-header.cb-empty-group {
        color: var(--vd-text-muted);
        opacity: 0.5;
      }

      .cb-group-dot {
        display: inline-block;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        margin-right: 8px;
        vertical-align: middle;
      }

      .cb-cell {
        min-width: 100px;
        min-height: 56px;
        padding: 8px;
        text-align: center;
        vertical-align: middle;
        border-bottom: 1px solid rgba(255,255,255,0.03);
        border-right: 1px solid rgba(255,255,255,0.03);
        cursor: pointer;
        user-select: none;
        transition: background 0.1s;
        position: relative;
      }

      .cb-cell:hover {
        background: rgba(255,255,255,0.04);
      }

      .cb-cell.cb-selected {
        outline: 2px solid var(--vd-accent, #7c5cfc);
        outline-offset: -2px;
      }

      .cb-cell.cb-effect-show {
        background: color-mix(in srgb, var(--group-color, #4caf50) 20%, transparent);
      }

      .cb-cell.cb-effect-blink {
        background: color-mix(in srgb, var(--group-color, #4caf50) 30%, transparent);
      }

      .cb-cell.cb-no-color.cb-effect-show,
      .cb-cell.cb-no-color.cb-effect-blink {
        background: rgba(255, 255, 255, 0.08);
      }

      .cb-cell.cb-no-color .cb-cell-icon,
      .cb-cell.cb-no-color .cb-cell-label {
        color: var(--vd-text-dim);
      }

      .cb-cell.cb-partial-cell::after {
        content: '';
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: var(--valid-pct, 100%);
        background: repeating-linear-gradient(
          -45deg,
          transparent,
          transparent 2px,
          rgba(252, 92, 92, 0.15) 2px,
          rgba(252, 92, 92, 0.15) 4px
        );
        pointer-events: none;
      }

      .cb-cell-content {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 2px;
      }

      .cb-cell-icon {
        color: var(--group-color, #4caf50);
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .cb-cell-label {
        font-size: 13px;
        font-weight: 500;
        color: var(--group-color, #4caf50);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .cb-actions-cell {
        position: sticky;
        right: 0;
        background: var(--vd-surface, #13131a);
        padding: 8px 12px;
        text-align: center;
        white-space: nowrap;
        font-size: 14px;
        color: var(--vd-text-muted);
        border-bottom: 1px solid rgba(255,255,255,0.03);
      }

      .cb-action-btn {
        background: none;
        border: none;
        color: var(--vd-text-dim);
        cursor: pointer;
        font-size: 14px;
        font-family: 'Jost', sans-serif;
        padding: 4px 8px;
        border-radius: 3px;
      }

      .cb-action-btn:hover {
        color: var(--vd-text);
        background: rgba(255,255,255,0.06);
      }

      /* Config popup */

      .cb-config-popup {
        position: fixed;
        z-index: 500;
        background: var(--vd-surface, #13131a);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 8px;
        padding: 12px 16px;
        min-width: 200px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.4);
      }

      .cb-config-title {
        font-size: 12px;
        font-weight: 500;
        color: var(--vd-text);
        margin-bottom: 10px;
      }

      .cb-config-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }

      .cb-config-row label {
        font-size: 11px;
        color: var(--vd-text-dim);
        margin-right: 12px;
      }

      .cb-config-row input[type="number"] {
        width: 60px;
        height: 24px;
        background: var(--vd-surface-2, #1e1e2a);
        color: var(--vd-text);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        font-family: inherit;
        font-size: 11px;
        padding: 0 6px;
        outline: none;
        text-align: center;
      }

      .cb-config-row input[type="number"]:focus {
        border-color: var(--vd-accent, #7c5cfc);
      }

      .cb-config-row input[type="color"] {
        width: 32px;
        height: 24px;
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        background: var(--vd-surface-2, #1e1e2a);
        cursor: pointer;
        padding: 0;
      }

      .cb-config-note {
        font-size: 11px;
        color: var(--vd-text-muted);
        font-style: italic;
        margin-bottom: 8px;
      }

      .cb-config-apply-btn {
        width: 100%;
        padding: 5px 10px;
        background: var(--vd-surface-2, #1e1e2a);
        border: 1px solid var(--vd-border, #2a2a38);
        border-radius: 4px;
        color: var(--vd-text-dim);
        font-size: 11px;
        font-family: 'Jost', sans-serif;
        cursor: pointer;
        margin-top: 6px;
      }

      .cb-config-apply-btn:hover {
        border-color: var(--vd-accent, #7c5cfc);
        color: var(--vd-text);
      }

      .cb-config-close {
        position: absolute;
        top: 6px;
        right: 6px;
        background: none;
        border: none;
        color: var(--vd-text-muted);
        cursor: pointer;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        border-radius: 3px;
      }

      .cb-config-close:hover {
        color: var(--vd-text);
      }
    `;
    document.head.appendChild(style);
  }
}

export { ClipBuilderPanel };
